import { toast } from '../../../shared/lib/notifications';
import { validateUploadFile, resolveStorageUrl } from '../../../shared/lib/storage';
import { escapeTelegramHtml } from '../../../shared/lib/sanitize';
import { safeUpdate, logActivity } from '../../../shared/lib/dataAccess';
import { callAdminAction, db } from '../../../supabaseClient';
import { getCurrentTenantId } from '../../../constants';
import { showErrorToast } from '../../../shared/lib/errorReporting';
import type { Dispatch, SetStateAction } from 'react';
import type { ClientRow, ProfileRow } from '../../../types';
import type { NavigationState } from '../../../useNavigation';
import type { Json } from '../../../database.types';

// شكل contact_info (عمود jsonb) — بيتخزن فيه روابط صور الهوية/التوكيل
export interface ClientContactInfo {
    id_url?: string | null;
    poa_url?: string | null;
}

// شكل البيانات اللي بتوصل فعليًا من NewClientModal/EditClientModal لـ onSave —
// نفس الحقول بالظبط الموجودة في NewClientForm/EditClientForm (الاتنين
// متطابقين شكليًا فعليًا)، واتحقق من كل استخدام حقيقي تحت في
// handleSaveClient/handleUpdateClient.
export interface ClientFormData {
    full_name: string;
    type: string;
    phone: string;
    phone2: string;
    email: string;
    address: string;
    notes: string;
    national_id: string;
    cr_number: string;
    kin_name: string;
    kin_phone: string;
}

interface DeleteConfirmState {
    type: string;
    id: string;
    name: string;
    itemType: string;
    title: string;
    mode?: 'archive' | 'delete';
    onConfirm?: () => void | Promise<void>;
    onConfirmArchive?: () => void | Promise<void>;
    onConfirmDelete?: () => void | Promise<void>;
    deleteConsequences?: string[];
}

export function useClientActions(params: {
    sendTelegram: (text: string) => void | Promise<void>;
    fetchClients: (page?: number, search?: string) => void | Promise<void>;
    fetchLawyers: () => void | Promise<void>;
    clients: ClientRow[];
    clientSearch: string;
    setClients: Dispatch<SetStateAction<ClientRow[]>>;
    setSelectedClient: (v: ClientRow | null) => void;
    setDeleteConfirm: (v: DeleteConfirmState | null) => void;
    setSavingClient: Dispatch<SetStateAction<boolean>>;
    setSavingLawyer: Dispatch<SetStateAction<boolean>>;
    // ⚠️ نفس ملاحظة setShowCaseModal في useCaseActions.ts — دول دوال
    // مخصصة (nav.openModal/closeModal) مش useState setters حقيقية.
    setShowClientModal: (v: boolean) => void;
    setShowLawyerModal: (v: boolean) => void;
    nav: NavigationState;
    profile?: ProfileRow | null;
}) {
    const {
        sendTelegram, fetchClients, fetchLawyers, clients, clientSearch,
        setClients, setSelectedClient, setDeleteConfirm, setSavingClient,
        setSavingLawyer, setShowClientModal, setShowLawyerModal, nav, profile,
    } = params;
    const _userName = profile?.full_name || null;

    // ─ حفظ موكل ─
    // شكل form/idFile/poaFile بييجي من NewClientModal — بنسيبه مرن هنا
    // (بيتغير حسب حقول الفورم)، وكل استخدام لعمود DB حقيقي في payload
    // اتوصل بنوع جدول clients الحقيقي.
    const handleSaveClient = async (form: ClientFormData, idFile: File | null, poaFile: File | null) => {
        if (!form.full_name || !form.full_name.trim()) {
            toast('❌ حقل "اسم الموكل" مطلوب', true);
            return;
        }
        setSavingClient(true);
        // رفع الصور على Storage (يحتاج نت — مش بنحفظه offline)
        let idUrl: string | null = null, poaUrl: string | null = null;
        if (navigator.onLine) {
            const tenantId = getCurrentTenantId();
            const uploadFile = async (file: File, prefix: string): Promise<string | null> => {
                // ⚠️ فحص نوع وحجم الملف قبل الرفع — راجع validateUploadFile في utils.ts.
                const validationError = validateUploadFile(file);
                if (validationError) { toast('❌ ' + validationError, true); return null; }
                if (!tenantId) { toast('❌ تعذر تحديد المكتب الحالي، أعد تحميل الصفحة وحاول مرة أخرى', true); return null; }
                const ext = file.name.split('.').pop();
                // FIX (5.6): المسار لازم يبدأ بـ tenant_id عشان نقدر نفعّل RLS
                // بتفلتر بالمكتب على bucket client-docs (كان المسار قبل كده
                // بدون أي معرّف خالص غير الوقت بالميلي ثانية).
                const path = `${tenantId}/${prefix}_${Date.now()}.${ext}`;
                const { error } = await db.storage.from('client-docs').upload(path, file, { upsert: true });
                if (error) return null;
                // الباكت client-docs private (بيشيل صور هوية/توكيل العملاء) —
                // بنولّد رابط موقّع مؤقت بدل الرابط العام.
                return await resolveStorageUrl('client-docs', path);
            };
            if (idFile) idUrl = await uploadFile(idFile, 'id');
            if (poaFile) poaUrl = await uploadFile(poaFile, 'poa');
        }

        const payload = {
            client_name: form.full_name,
            client_type: form.type || 'individual',
            phone: form.phone || null,
            // FIX (2.1): الحقول الأربعة دي كانت موجودة في فورم الإضافة
            // (NewClientModal) بس مبتتحفظش أبداً عند "إضافة موكل جديد" —
            // كانت بتضيع بصمت وتتسجل بس لو رجعت عدّلت الموكل بعد كده
            // (handleUpdateClient تحت كانت بالفعل بتحفظها صح).
            phone2: form.phone2 || null,
            address: form.address || null,
            kin_name: form.kin_name || null,
            kin_phone: form.kin_phone || null,
            email: form.email || null,
            notes: form.notes || null,
            national_id: form.national_id || null,
            cr_number: form.cr_number || null,
            contact_info: { id_url: idUrl, poa_url: poaUrl } as ClientContactInfo,
        };

        const { error, offline, queued } = await window.__dbWrite({
            type: 'INSERT', table: 'clients', data: payload
        });
        setSavingClient(false);

        if (offline && queued) {
            toast('📥 الموكل محفوظ محلياً — سيُضاف فور عودة الإنترنت');
            // إضافة مؤقتة في الـ state المحلي
            setClients((prev) => [{ ...payload, id: 'offline-' + Date.now(), full_name: form.full_name } as unknown as ClientRow, ...prev]);
        } else if (error) {
            toast('❌ فشل حفظ بيانات الموكل — تحقق من الاتصال وأعد المحاولة', true);
            return;
        } else {
            toast('✅ تم إضافة الموكل بنجاح!');
            logActivity(db, 'إضافة موكل', { userName: _userName, entity_type: 'client', details: form.full_name || null, client_name: form.full_name || null });
            // إشعار تليجرام - موكل جديد
            const typeLabel = form.type === 'company' ? 'شركة' : form.type === 'government' ? 'جهة حكومية' : 'فرد';
            let clientMsg = `👤 <b>موكل جديد تمت إضافته</b>\n`;
            clientMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
            clientMsg += `👤 <b>الاسم:</b> ${escapeTelegramHtml(form.full_name)}\n`;
            clientMsg += `🏷 <b>النوع:</b> ${typeLabel}\n`;
            if (form.phone) clientMsg += `📞 <b>الهاتف:</b> ${escapeTelegramHtml(form.phone)}\n`;
            if (form.email) clientMsg += `📧 <b>الإيميل:</b> ${escapeTelegramHtml(form.email)}\n`;
            if (form.national_id) clientMsg += `🪪 <b>الرقم القومي:</b> ${escapeTelegramHtml(form.national_id)}\n`;
            if (form.cr_number) clientMsg += `🏢 <b>السجل التجاري:</b> ${escapeTelegramHtml(form.cr_number)}\n`;
            if (form.notes) clientMsg += `📝 <b>ملاحظات:</b> ${escapeTelegramHtml(form.notes)}\n`;
            sendTelegram(clientMsg);
            fetchClients(0, clientSearch);
        }
        setShowClientModal(false);
    };

    // ─ حذف موكل نهائيًا من قاعدة البيانات (مرحلة 2 — مكتمل، مفيش كود إضافي مطلوب) ─
    // ⚠️ القرار المحسوم فى الخطة (18 يوليو 2026) بعد تحقق فعلي من delete_rule
    // الحقيقي فى الداتابيز الحية: حذف موكل نهائيًا لازم يحذف الموكل فقط، وميحذفش
    // القضايا ولا الأتعاب المرتبطة بيه. الـ FKs الحقيقية بتحقق ده تلقائيًا:
    //   - cases.client_id / case_fees.client_id / fee_payments.client_id → SET NULL
    //     (القضايا والأتعاب تفضل موجودة، بس الربط بالموكل بيتصفّر)
    //   - client_messages / client_portal_sessions / client_portal_pins → CASCADE
    //     (بيانات بوابة الموكل نفسه، بتتحذف تلقائيًا معاه — منطقي، مفيش معنى لها من غيره)
    // يعني الدالة دي مش محتاجة أي كاسكيد يدوي ولا تحذير "عندك قضايا مرتبطة" —
    // الحذف بيعدي عادي دايمًا (مفيش FK هيرفضه) والقضايا/الأتعاب تفضل موجودة.
    const handlePermanentDeleteClient = async (clientId: string) => {
        const cl = clients.find((x) => x.id === clientId);
        const { error } = await db.from('clients').delete().eq('id', clientId);
        nav.closeModal('delete');
        setDeleteConfirm(null);
        if (error) { toast('❌ فشل حذف الموكل نهائياً — تحقق من الاتصال وأعد المحاولة', true); return; }
        toast('🗑️ تم حذف الموكل نهائياً');
        logActivity(db, 'حذف موكل نهائياً', { userName: _userName, entity_type: 'client', entity_id: clientId, details: cl?.full_name || null, client_name: cl?.full_name || null });
        setSelectedClient(null);
        setClients((prev) => prev.filter((c) => c.id !== clientId));
    };

    // ─ حذف موكل: يعرض اختيار (أرشفة/حذف نهائي) عن طريق DeleteConfirmModal ─
    const handleDeleteClient = async (clientId: string) => {
        const cl = clients.find((x) => x.id === clientId);
        setDeleteConfirm({
            type: 'client', id: clientId,
            name: cl?.full_name || 'الموكل',
            itemType: 'الموكل',
            title: 'حذف الموكل',
            onConfirmArchive: async () => {
                const { error } = await db.from('clients').update({ deleted_at: new Date().toISOString() }).eq('id', clientId);
                nav.closeModal('delete');
                setDeleteConfirm(null);
                if (error) { toast('❌ فشل أرشفة الموكل — تحقق من الاتصال وأعد المحاولة', true); return; }
                toast('📦 تم نقل الموكل للأرشيف');
                logActivity(db, 'أرشفة موكل', { userName: _userName, entity_type: 'client', entity_id: clientId, details: cl?.full_name || null, client_name: cl?.full_name || null });
                setSelectedClient(null);
                setClients((prev) => prev.filter((c) => c.id !== clientId));
            },
            onConfirmDelete: () => handlePermanentDeleteClient(clientId),
            deleteConsequences: [
                'سيُحذف نهائيًا: بيانات الموكل، ورسائل/جلسات/أكواد بوابة الموكل الخاصة به فقط.',
                'القضايا والأتعاب المرتبطة بالموكل تفضل محفوظة بالكامل — بس رابطها بالموكل بيتصفّر.',
                'لا يمكن التراجع عن هذا الإجراء.',
            ],
        });
    };

    // ─ استرجاع موكل من الأرشيف ─
    const handleRestoreClient = async (clientId: string) => {
        const { error } = await db.from('clients').update({ deleted_at: null }).eq('id', clientId);
        if (error) { toast('❌ فشل استرجاع الموكل — تحقق من الاتصال وأعد المحاولة', true); return; }
        toast('✅ تم استرجاع الموكل');
        logActivity(db, 'استرجاع موكل من الأرشيف', { userName: _userName, entity_type: 'client', entity_id: clientId });
        fetchClients(0, clientSearch);
    };

    // ─ تعديل موكل ─
    const handleUpdateClient = async (clientId: string, form: ClientFormData, idFile?: File | null, poaFile?: File | null) => {
        if (!form.full_name || !form.full_name.trim()) {
            toast('❌ حقل "اسم الموكل" مطلوب', true);
            return;
        }
        const client = clients.find((c) => c.id === clientId);
        const existingContactInfo = (client?.contact_info as ClientContactInfo | null) || null;

        // رفع صور جديدة لو اتحددت
        const tenantId = getCurrentTenantId();
        const uploadFile = async (file: File, prefix: string): Promise<string | null> => {
            const validationError = validateUploadFile(file);
            if (validationError) { toast('❌ ' + validationError, true); return null; }
            if (!tenantId) { toast('❌ تعذر تحديد المكتب الحالي، أعد تحميل الصفحة وحاول مرة أخرى', true); return null; }
            const ext = file.name.split('.').pop();
            // FIX (5.6): نفس منطق handleSaveClient — المسار لازم يبدأ بـ tenant_id.
            const path = `${tenantId}/${prefix}_${Date.now()}.${ext}`;
            const { error } = await db.storage.from('client-docs').upload(path, file, { upsert: true });
            if (error) return null;
            // الباكت client-docs private — بنولّد رابط موقّع مؤقت بدل الرابط العام.
            return await resolveStorageUrl('client-docs', path);
        };

        let idUrl: string | null  = existingContactInfo?.id_url  || null;
        let poaUrl: string | null = existingContactInfo?.poa_url || null;
        if (navigator.onLine) {
            if (idFile)  idUrl  = await uploadFile(idFile,  'id')  ?? idUrl;
            if (poaFile) poaUrl = await uploadFile(poaFile, 'poa') ?? poaUrl;
        }

        const { success, conflict } = await safeUpdate(db, 'clients', clientId, {
            client_name:  form.full_name,
            client_type:  form.type || 'individual',
            phone:        form.phone        || null,
            phone2:       form.phone2       || null,
            email:        form.email        || null,
            address:      form.address      || null,
            notes:        form.notes        || null,
            national_id:  form.national_id  || null,
            cr_number:    form.cr_number    || null,
            kin_name:     form.kin_name     || null,
            kin_phone:    form.kin_phone    || null,
            // ⚠️ ClientContactInfo واجهة بحقول معروفة (id_url/poa_url)، لكن عمود
            // contact_info في قاعدة البيانات نوعه Json عام (بدون index signature
            // ثابت) — الكاست عبر unknown هنا موثّق ومحصور في "شكل الحقول
            // المعروفة دي فعلاً متوافق مع Json" (كلاهما قيم string|null اختيارية).
            contact_info: { id_url: idUrl, poa_url: poaUrl } as ClientContactInfo as unknown as Json,
        }, client?.updated_at || null);
        if (conflict) return;
        if (!success) { toast('❌ فشل تعديل بيانات الموكل — تحقق من الاتصال وأعد المحاولة', true); return; }
        toast('✅ تم تحديث بيانات الموكل');
        logActivity(db, 'تعديل موكل', { userName: _userName, entity_type: 'client', entity_id: clientId, details: form.full_name || null, client_name: form.full_name || null });
        fetchClients(0, clientSearch);
        nav.closeModal('clientDetail');
        setSelectedClient(null);
    };

    // ─ إنشاء محامي جديد ─
    // إنشاء محامي جديد (عبر Edge Function — لا يؤثر على جلسة الأدمن الحالية)
    const handleSaveLawyer = async (form: { email: string; password: string; full_name: string; role?: string }) => {
        setSavingLawyer(true);
        try {
            await callAdminAction({
                action: 'create_lawyer',
                email: form.email,
                password: form.password,
                full_name: form.full_name,
                role: form.role,
            });
            toast('✅ تم إنشاء حساب ' + form.full_name + ' بنجاح!');
            logActivity(db, 'إضافة مستخدم', { userName: _userName, entity_type: 'user', details: `${form.full_name} (${form.role || '—'})` });
            setShowLawyerModal(false); fetchLawyers();
        } catch (e) {
            showErrorToast('client_create_lawyer_account', e, 'تعذّر إنشاء الحساب. تحقق من صحة البيانات وحاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'إنشاء حساب محامي');
        }
        setSavingLawyer(false);
    };

    return { handleSaveClient, handleDeleteClient, handlePermanentDeleteClient, handleRestoreClient, handleUpdateClient, handleSaveLawyer };
}
