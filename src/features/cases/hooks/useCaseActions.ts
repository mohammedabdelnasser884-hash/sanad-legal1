import { toast } from '../../../shared/lib/notifications';
import { escapeTelegramHtml } from '../../../shared/lib/sanitize';
import { logActivity } from '../../../shared/lib/dataAccess';
import { db } from '../../../supabaseClient';
import type { Dispatch, SetStateAction } from 'react';
import type { ClientRow, ProfileRow } from '../../../types';
import type { NavigationState } from '../../../useNavigation';
import type { MappedCase } from '../../../hooks/useAppData';

// شكل البيانات اللي بتوصل فعليًا من NewCaseModal/EditCaseModal لـ onSave —
// اتحقق من كل استخدام حقيقي في handleSaveCase/handleUpdateCase تحت، وبيغطي
// اتحاد الحقول اللي بيبعتها الفورمين (كل الحقول optional غير title، لأن
// EditCaseModal مثلاً مابيبعتش client_id خالص، وكل حقل تاني ممكن يوصل
// فاضي حسب حالة الفورم وقت الإرسال).
export interface CaseFormSubmitData {
    title: string;
    number?: string;
    caseNum?: string;
    caseYear?: string;
    court?: string;
    type?: string;
    status?: string;
    client_id?: string;
    plaintiff?: string;
    defendant?: string;
    court_level?: string;
    circuit_number?: string;
    date?: string;
    session_time?: string;
    court_floor?: string;
    court_hall?: string;
    session_hall?: string;
    secretary_hall?: string;
    secretary_name?: string;
}

// شكل بيانات مودال تأكيد الحذف/الأرشفة (زي ما بيتبنى في handleDeleteCase تحت)
// مُصدَّرة عشان App.tsx يقدر يحدد نوع state الـ deleteConfirm بيها بدل any.
export interface DeleteConfirmState {
    type: string;
    id: string;
    name: string;
    itemType: string;
    title: string;
    mode: 'archive' | 'delete';
    onConfirm: () => void | Promise<void>;
}

export function useCaseActions(params: {
    sendTelegram: (text: string) => void | Promise<void>;
    fetchCases: (page?: number, filter?: string) => void | Promise<void>;
    cases: MappedCase[];
    lawyers: ProfileRow[];
    clients: ClientRow[];
    selectedCase: MappedCase | null;
    setCases: Dispatch<SetStateAction<MappedCase[]>>;
    setLawyers: Dispatch<SetStateAction<ProfileRow[]>>;
    setClients: Dispatch<SetStateAction<ClientRow[]>>;
    setProfile: Dispatch<SetStateAction<ProfileRow | null>>;
    setAuthUser: (user: { id: string; email?: string | null } | null) => void;
    setSelectedCase: Dispatch<SetStateAction<MappedCase | null>>;
    setDeleteConfirm: (v: DeleteConfirmState | null) => void;
    setSavingCase: Dispatch<SetStateAction<boolean>>;
    // ⚠️ مش Dispatch حقيقي — دي دالة مخصصة في App.tsx بتنادي nav.openModal/
    // closeModal، مش useState setter. اتحقق من الشكل الفعلي في App.tsx
    // (BUILD FIX: كانت متعرّفة غلط كـ Dispatch<SetStateAction<boolean>>
    // وده كسر build حقيقي على Vercel).
    setShowCaseModal: (v: boolean) => void;
    casesFilter: string;
    nav: NavigationState;
    profile?: ProfileRow | null;
}) {
    const {
        sendTelegram, fetchCases, cases, clients, selectedCase,
        setCases, setLawyers, setClients, setProfile, setAuthUser,
        setSelectedCase, setDeleteConfirm, setSavingCase, setShowCaseModal,
        casesFilter, nav, profile,
    } = params;
    const _userName = profile?.full_name || null;

    // ─ تسجيل خروج ─
    const handleLogout = async () => {
        // نسجّل الخروج قبل signOut عشان الـ session لسه شغّالة
        logActivity(db, 'تسجيل خروج', { userName: _userName, entity_type: 'user', details: profile?.email || null });
        await db.auth.signOut();
        setCases([]); setLawyers([]); setClients([]); setProfile(null); setAuthUser(null);
    };

    // ─ حفظ قضية ─
    // شكل form بقى موصوف بـ CaseFormSubmitData (شوف تعريفه فوق) بدل
    // Record<string, any> — بيغطي بالظبط الحقول اللي NewCaseModal بيبعتها،
    // وكل استخدام لعمود DB حقيقي (زي payload تحت) موصول بنوع الجدول الحقيقي
    // من database.types.ts.
    const handleSaveCase = async (form: CaseFormSubmitData) => {
        if (!form.title || !form.title.trim()) {
            toast('❌ حقل "موضوع ومسمى الدعوى" مطلوب', true);
            return;
        }
        setSavingCase(true);
        const payload = {
            case_number_official: form.number || null,
            title: form.title,
            court_name: form.court,
            case_type: form.type,
            status: 'نشطة',
            client_id: form.client_id || null,
            plaintiff: form.plaintiff || null,
            defendant: form.defendant || null,
            court_level: form.court_level || null,
            circuit_number: form.circuit_number || null,
            next_hearing: form.date || null,
            session_hall: form.session_hall || null,
            secretary_hall: form.secretary_hall || null,
            secretary_name: form.secretary_name || null,
        };
        const offlineId = 'offline-' + Date.now();
        const { error, offline, queued, data: insertedCase } = await window.__dbWrite({
            type: 'INSERT', table: 'cases', data: payload, returning: true
        });
        if (offline && queued) {
            // BUG-20 FIX: لو فيه تاريخ جلسة، نحفظها في الـ queue مع _offlineCaseTitle
            // عشان الـ sync handler يقدر يربطها بالـ id الحقيقي بعد ما القضية تتزامن
            if (form.date) {
                await window.__dbWrite({
                    type: 'INSERT',
                    table: 'case_sessions',
                    data: {
                        _offlineCaseTitle: form.title,   // الـ sync handler هيستخدمه
                        case_id: null,                   // هيتملى وقت المزامنة
                        session_date: form.date,
                        session_time: form.session_time || 'صباحي',
                        session_floor: form.court_floor || null,
                        session_hall: form.court_hall || null,
                        description: 'الجلسة الأولى',
                        result: null,
                        next_action: null,
                    },
                });
            }
            toast('📥 محفوظة محلياً — ستُضاف فور عودة الإنترنت');
            setCases((prev) => [{ ...payload, id: offlineId, ...form, status: 'نشطة', date: form.date || '—' } as unknown as MappedCase, ...prev]);
        } else if (error) {
            toast('❌ فشل تسجيل القضية الجديدة — تحقق من الاتصال وأعد المحاولة', true);
            setSavingCase(false);
            return;
        } else {
            // ── تسجيل الجلسة الأولى في case_sessions لو فيه تاريخ ──
            // بناخد id القضية مباشرة من نتيجة الإدراج (بدل التخمين
            // بإعادة استعلام بالعنوان — كان بيسبب ربط غلط لو فيه قضيتين
            // بنفس العنوان اتسجلوا في نفس اللحظة تقريبًا)
            const newCaseId: string | null = insertedCase?.id || null;
            if (form.date && newCaseId) {
                await db.from('case_sessions').insert([{
                    case_id: newCaseId,
                    session_date: form.date,
                    session_time: form.session_time || 'صباحي',
                    session_floor: form.court_floor || null,
                    session_hall: form.court_hall || null,
                    description: 'الجلسة الأولى',
                    result: null,
                    next_action: null,
                }]);
            } else if (form.date && !newCaseId) {
                // حالة نادرة: القضية اتسجلت بنجاح لكن السيرفر معادش الصف
                // المُدرج (مثلاً سياسة RLS بتمنع SELECT بعد INSERT) — القضية
                // موجودة فعليًا، بس الجلسة الأولى محتاجة تتضاف يدويًا.
                toast('⚠️ القضية اتسجلت، بس الجلسة الأولى محتاجة تتضاف يدويًا من صفحة القضية', true);
            }
            toast('✅ تم تقييد الدعوى في السيرفر السحابي!');
            // إشعار تليجرام
            const caseNumLabel = form.caseNum && form.caseYear
                ? `${form.caseNum} لسنة ${form.caseYear}`
                : (form.number || '—');
            logActivity(db, 'إضافة قضية', {
                userName: _userName,
                entity_type: 'case', entity_id: newCaseId,
                details: `${form.title} — رقم القيد: ${caseNumLabel}`,
                case_name: form.title || null,
                case_type: form.type || null,
                client_name: clients.find((cl) => cl.id === form.client_id)?.full_name || null,
            });
            let caseMsg = `⚖️ <b>قضية جديدة تم تقييدها</b>\n`;
            caseMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
            caseMsg += `📋 <b>رقم القيد:</b> ${escapeTelegramHtml(caseNumLabel)}\n`;
            caseMsg += `📌 <b>الموضوع:</b> ${escapeTelegramHtml(form.title)}\n`;
            caseMsg += `🏛 <b>المحكمة:</b> ${escapeTelegramHtml(form.court || '—')}\n`;
            caseMsg += `📂 <b>التصنيف:</b> ${escapeTelegramHtml(form.type || '—')}\n`;
            if (form.plaintiff) caseMsg += `🟢 <b>المدعي:</b> ${escapeTelegramHtml(form.plaintiff)}\n`;
            if (form.defendant) caseMsg += `🔴 <b>المدعى عليه:</b> ${escapeTelegramHtml(form.defendant)}\n`;
            if (form.date) caseMsg += `📆 <b>أقرب جلسة:</b> ${escapeTelegramHtml(form.date)}\n`;
            sendTelegram(caseMsg);
            fetchCases(0, casesFilter);
        }
        setSavingCase(false);
        setShowCaseModal(false);
    };

    // ─ أرشفة قضية (بدل حذف نهائي — البند 8 من قائمة الإجراءات) ─
    const handleDeleteCase = async (caseId: string) => {
        const c = cases.find((x) => x.id === caseId);
        setDeleteConfirm({
            type: 'case', id: caseId,
            name: c?.title || 'القضية',
            itemType: 'القضية',
            title: 'أرشفة القضية',
            mode: 'archive',
            onConfirm: async () => {
                const { error } = await db.from('cases').update({ deleted_at: new Date().toISOString() }).eq('id', caseId);
                nav.closeModal('delete');
                setDeleteConfirm(null);
                if (error) { toast('❌ فشل أرشفة القضية — تحقق من الاتصال وأعد المحاولة', true); return; }
                toast('📦 تم نقل القضية للأرشيف');
                // ⚠️ FIX (2 من 14 يوليو 2026 — اكتشاف تاني عن طريق التحقق من الأنواع):
                // كان الكود بيقرأ c?.case_type. الفيكس السابق (الأقدم) كان افترض إن
                // `c` (جاي من متغيّر `cases` بارامتر الهوك) نوعه CaseRow الخام (فيه
                // case_type)، لكن الداتا الفعلية وقت التشغيل هي MappedCase (النوع
                // المُطبَّع من useAppData.ts) اللي اسم الحقل فيها `type` مش `case_type`.
                // يعني c?.case_type كانت بترجع undefined دايمًا فعليًا، والحقل كان
                // بيتسجل null دايمًا في سجل النشاط لكل عملية أرشفة قضية — نفس فصيلة
                // الباگ القديم بالظبط لكن بالاتجاه العكسي. اتصلح دلوقتي بعد ما اتغيّر
                // نوع `cases`/`selectedCase` فعليًا لـ MappedCase[]/MappedCase|null.
                logActivity(db, 'أرشفة قضية', {
                    userName: _userName,
                    entity_type: 'case', entity_id: caseId, details: c?.title || null,
                    case_name: c?.title || null,
                    case_type: c?.type || null,
                    client_name: clients.find((cl) => cl.id === c?.client_id)?.full_name || null,
                });
                setSelectedCase(null);
                setCases((prev) => prev.filter((cs) => cs.id !== caseId));
            }
        });
    };

    // ─ استرجاع قضية من الأرشيف ─
    const handleRestoreCase = async (caseId: string) => {
        const { error } = await db.from('cases').update({ deleted_at: null }).eq('id', caseId);
        if (error) { toast('❌ فشل استرجاع القضية — تحقق من الاتصال وأعد المحاولة', true); return; }
        toast('✅ تم استرجاع القضية');
        logActivity(db, 'استرجاع قضية من الأرشيف', { userName: _userName, entity_type: 'case', entity_id: caseId });
        fetchCases(0, casesFilter);
    };

    // ─ تعديل قضية ─
    const handleUpdateCase = async (caseId: string, form: CaseFormSubmitData) => {
        if (!form.title || !form.title.trim()) {
            toast('❌ حقل "موضوع ومسمى الدعوى" مطلوب', true);
            return;
        }
        try {
            const payload = {
                case_number_official: form.number || null,
                title: form.title,
                court_name: form.court || null,
                case_type: form.type || null,
                status: form.status || undefined,
                client_id: (form.client_id !== undefined ? form.client_id : cases.find((c) => c.id === caseId)?.client_id) || null,
                plaintiff: form.plaintiff || null,
                defendant: form.defendant || null,
                court_level: form.court_level || null,
                circuit_number: form.circuit_number || null,
                next_hearing: form.date || null,
                session_hall: form.session_hall || null,
                secretary_hall: form.secretary_hall || null,
                secretary_name: form.secretary_name || null,
            };
            // FIX: Optimistic Locking لتعديل القضايا — كان `updated_at` بيتجاب
            // ويتخزّن في الـ state (شوف useAppData.ts) خصيصًا للاستخدام هنا، بس
            // مكانش بيتبعت فعليًا لـ __dbWrite، فحماية "تعارض التعديل" كانت
            // معطّلة تمامًا لتعديل القضايا (بعكس الأتعاب/الموكلين/الجلسات).
            const existingCase = cases.find((c) => c.id === caseId);
            const knownUpdatedAt = existingCase?.updated_at
                || (selectedCase?.id === caseId ? selectedCase?.updated_at : null)
                || null;

            const { error, offline, queued, conflict, data: writtenRow } = await window.__dbWrite({
                type: 'UPDATE', table: 'cases', data: payload, id: caseId, knownUpdatedAt
            });
            if (offline && queued) {
                toast('📥 التعديل محفوظ محلياً — سيُزامن عند عودة الإنترنت');
                // تحديث فوري في الـ state المحلي
                setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, ...form } : c));
                if (selectedCase?.id === caseId) setSelectedCase((p) => p ? { ...p, ...form } : p);
            } else if (conflict) {
                // 💥 حد تاني عدّل نفس القضية بعد ما إحنا فتحناها — منرفضش نكتب
                // فوق تعديله بصمت. بنسيب البيانات المعروضة زي ما هي ونطلب من
                // المستخدم يفتح القضية تاني عشان يشوف آخر نسخة قبل ما يعدّل.
                toast('⚠️ هذه القضية عدّلها شخص آخر بعد ما فتحتها — أعد فتحها وحاول التعديل مرة أخرى', true);
                return;
            } else if (error) {
                toast('❌ فشل تعديل بيانات القضية — تحقق من الاتصال وأعد المحاولة', true);
                return;
            } else {
                // ── تسجيل جلسة جديدة لو تاريخ الجلسة تغيّر ──
                if (form.date) {
                    const oldDate = (selectedCase?.date === '—' ? '' : selectedCase?.date) || '';
                    if (form.date !== oldDate) {
                        const { data: existing } = await db.from('case_sessions')
                            .select('id')
                            .eq('case_id', caseId)
                            .eq('session_date', form.date)
                            .maybeSingle();
                        if (!existing) {
                            await db.from('case_sessions').insert([{
                                case_id: caseId,
                                session_date: form.date,
                                session_time: form.session_time || 'صباحي',
                                session_floor: form.court_floor || null,
                                session_hall: form.court_hall || null,
                                description: 'جلسة محددة',
                                result: null,
                                next_action: null,
                            }]);
                        }
                    }
                }
                toast('✅ تم تحديث القضية');
                logActivity(db, 'تعديل قضية', {
                    userName: _userName,
                    entity_type: 'case', entity_id: caseId, details: form.title || null,
                    case_name: form.title || null,
                    case_type: form.type || cases.find((c) => c.id === caseId)?.type || null,
                    client_name: clients.find((cl) => cl.id === payload.client_id)?.full_name || null,
                });
                // تحديث فوري للحالة المحلية — عشان الشاشة المفتوحة (CaseDetailView) تعرض القيم الجديدة فورًا
                // ⚠️ بنحدّث updated_at كمان من قيمة السيرفر الفعلية بعد الكتابة (writtenRow) —
                // من غيرها، أي تعديل تاني على نفس القضية بعد التعديل ده مباشرة كان
                // هيتكشف غلط كـ"تعارض" مع نفسه (لأن آخر updated_at محفوظة محليًا
                // كانت هتفضل القديمة من قبل الحفظ، مش الجديدة بعده).
                const freshFields = writtenRow?.updated_at ? { updated_at: writtenRow.updated_at } : {};
                setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, ...form, ...freshFields } : c));
                if (selectedCase?.id === caseId) setSelectedCase((p) => p ? { ...p, ...form, ...freshFields } : p);
                // إشعار تليجرام - تعديل قضية
                let updMsg = `✏️ <b>تم تعديل بيانات قضية</b>\n`;
                updMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
                updMsg += `📋 <b>رقم القيد:</b> ${escapeTelegramHtml(form.number || '—')}\n`;
                updMsg += `📌 <b>الموضوع:</b> ${escapeTelegramHtml(form.title)}\n`;
                updMsg += `🏛 <b>المحكمة:</b> ${escapeTelegramHtml(form.court || '—')}\n`;
                if (form.plaintiff) updMsg += `🟢 <b>المدعي:</b> ${escapeTelegramHtml(form.plaintiff)}\n`;
                if (form.defendant) updMsg += `🔴 <b>المدعى عليه:</b> ${escapeTelegramHtml(form.defendant)}\n`;
                if (form.date) updMsg += `📆 <b>الجلسة القادمة:</b> ${escapeTelegramHtml(form.date)}\n`;
                sendTelegram(updMsg);
                fetchCases(0, casesFilter);
            }
        } catch (e) {
            toast('❌ خطأ في الاتصال، تحقق من الإنترنت وأعد المحاولة', true);
        }
    };

    return { handleLogout, handleSaveCase, handleDeleteCase, handleRestoreCase, handleUpdateCase };
}
