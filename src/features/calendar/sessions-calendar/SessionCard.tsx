import React from 'react';
import { PartiesLine } from '@/shared/ui/PartiesLine';
import { db } from '../../../supabaseClient';
import type { MappedCase, MappedClient } from '../../../hooks/useAppData';
import type { CalendarSessionRow } from './CalendarTab';
import type { SessionCaseEmbed } from '@/shared/hooks/useDashboardFeed';

// نفس نمط `LinkedCaseLike` المستخدم في MissedTab.tsx/DashboardTab.tsx/UpcomingWidget.tsx —
// linkedCase هنا بييجي من نفس المصدرين المختلفين الشكل بالظبط (كائن `cases` المدمج
// مع الجلسة، أو `cases.find(...)` من الـ prop).
type LinkedCaseLike = Partial<MappedCase> & Partial<SessionCaseEmbed>;

interface SessionCardProps {
    s: CalendarSessionRow;
    cases: MappedCase[];
    clients: MappedClient[];
    onOpenCase?: (c: MappedCase) => void;
    onOpenStandalone?: (s: CalendarSessionRow) => void;
    onGoogleExport?: (s: CalendarSessionRow, e: React.MouseEvent) => void;
}

function SessionCard({ s, cases, clients, onOpenCase, onOpenStandalone, onGoogleExport }: SessionCardProps) {
    // ⚠️ تصحيح جذري: القضية ممكن تكون موجودة فعليًا في قاعدة البيانات ومربوطة
    // صح بـ case_id، لكن غير موجودة في الـ "cases" array المحلي لأن القضايا
    // بتتحمّل بنظام صفحات (PAGE_SIZE = 15 في useAppData.ts) ومفلترة بحالة معينة.
    // الاستعلامات في CalendarTab/MissedTab/UpcomingWidget بترفق بيانات القضية
    // مباشرة مع كل جلسة عن طريق join باسم cases(...) — وهي مصدر موثوق ودايمًا
    // محدّث بغض النظر عن أي pagination. لازم نستخدمها كأولوية أولى قبل أي حاجة
    // تانية، وبعدها نرجع للـ array المحلي (احتياطي)، وأخيرًا الحقول الخام
    // المخزنة على صف الجلسة نفسه (وهي الحالة الصحيحة فعلاً للجلسات المستقلة).
    const joinedCase = Array.isArray(s.cases) ? s.cases[0] : s.cases;
    const caseForNav = cases.find((c: MappedCase) => c.id === s.case_id); // الكائن الكامل، يُستخدم فقط عند الضغط لفتح القضية
    const linkedCase = (joinedCase || caseForNav) as LinkedCaseLike | undefined; // للعرض فقط — الأولوية للـ join المرفق مع الجلسة نفسه
    const isStandalone = !s.case_id;
    const plaintiff = linkedCase?.plaintiff || s.plaintiff;
    const defendant = linkedCase?.defendant || s.defendant;
    const caseType  = linkedCase?.type  || linkedCase?.case_type || s.case_type;
    const caseTitle = linkedCase?.title || s.title || s.description;
    const caseNumberRaw = linkedCase?.number || linkedCase?.case_number_official || s.case_number;

    // فصل رقم الدعوى عن السنة (الصيغة المتوقعة: رقم/سنة)
    let caseNum = '', caseYear = '';
    if (caseNumberRaw && caseNumberRaw !== '—') {
        const parts = String(caseNumberRaw).split('/');
        if (parts.length === 2) { caseNum = parts[0]; caseYear = parts[1]; }
        else { caseNum = caseNumberRaw; }
    }

    // السطر الأول: رقم الدعوى لسنة ... - النوع
    let numberLine = '';
    if (caseNum && caseYear) numberLine = `رقم الدعوى ${caseNum} لسنة ${caseYear}`;
    else if (caseNum) numberLine = `رقم الدعوى ${caseNum}`;
    if (caseType) numberLine = numberLine ? `${numberLine} - ${caseType}` : caseType;

    // السطر الثاني: المدعي ضد المدعى عليه (أو نص بديل)
    const partiesFallback = !numberLine ? caseTitle : null;
    const partiesText = (plaintiff && defendant)
        ? plaintiff + ' ضد ' + defendant
        : (plaintiff || defendant || partiesFallback || caseTitle || '— جلسة مستقلة —');

    // السطر الثالث: اسم/موضوع الدعوى (تعويض / طرد / ريع...)
    const titleLine = (caseTitle && caseTitle !== partiesText) ? caseTitle : null;

    return React.createElement('div', {
        className: "bg-premium-card rounded-lg px-2.5 py-1.5 cursor-pointer active:scale-[0.98] transition-all flex items-center gap-1.5",
        style: { border: isStandalone ? '1px solid rgba(251,191,36,0.25)' : '1px solid rgba(212,175,55,0.12)' },
        onClick: async () => {
            // ⚠️ مهم: للفتح (navigation) لازم نستخدم الكائن الكامل بتاع القضية
            // (caseForNav) مش الـ join المختصر (joinedCase) لأن شاشة تفاصيل
            // القضية محتاجة حقول زي number/court/status/date/year مش موجودة
            // أصلًا في الـ join المختصر المستخدم للعرض بس.
            if (caseForNav && onOpenCase) { onOpenCase(caseForNav); return; }
            if (s.case_id && onOpenCase) {
                // القضية مش من ضمن الصفحة المحمّلة حاليًا (الـ 15 الأخيرة) — نجيبها مباشرة بمعرفها
                const { data: r, error } = await db.from('cases').select('*').eq('id', s.case_id).maybeSingle();
                if (!error && r) {
                    // ⚠️ اكتشاف أثناء إضافة الأنواع (مش بند "تنظيف any" — للعلم فقط،
                    // مفيش أي تغيير سلوك اتعمل بسببه): الكائن ده بيبني نسخة يدوية من
                    // MappedCase لكن ناقص 6 حقول حقيقية موجودة في تعريف MappedCase
                    // الفعلي (court_floor, court_hall, session_hall, secretary_hall,
                    // secretary_name, session_time) — نفس الحقول اللي كانت سبب باگ فقدان
                    // بيانات موثّق قبل كده في useAppData.ts (لو القضية دي اتفتحت من هنا
                    // بالذات، يعني من جلسة لقضية مش محمّلة في الصفحة الحالية، وبعدين
                    // اتعدّلت، ممكن قاعة/سكرتير الجلسة يترمسحوا بـ null). سيبناه زي ما هو
                    // (كاست موثّق) عشان منغيّرش سلوك ظاهر من غير اتفاق صريح معاك؛ لو حابب
                    // نصلحه فعليًا (بإضافة نفس الحقول الستة هنا)، قولّي وهنعمله كبند منفصل.
                    const mappedCase = {
                        id:             r.id,
                        number:         r.case_number_official || '—',
                        title:          r.title || '—',
                        court:          r.court_name || '—',
                        type:           r.case_type || 'عام',
                        court_level:    r.court_level || null,
                        circuit_number: r.circuit_number || null,
                        status:         r.status || 'نشطة',
                        // ⚠️ next_session مش عمود حقيقي في جدول cases (اتأكد من
                        // استعلام information_schema) — كان دايمًا undefined
                        // هنا، يعني الكود كان فعليًا بيعتمد على next_hearing بس.
                        date:           r.next_hearing || '—',
                        client_id:      r.client_id,
                        plaintiff:      r.plaintiff || null,
                        defendant:      r.defendant || null,
                        year:           r.created_at ? new Date(r.created_at).getFullYear() : new Date().getFullYear(),
                        updated_at:     r.updated_at || null,
                    } as unknown as MappedCase;
                    onOpenCase(mappedCase);
                    return;
                }
            }
            if (isStandalone && onOpenStandalone) onOpenStandalone(s);
        }
    },
        React.createElement('div', { className: "flex-1 min-w-0" },
            // سطر رقم الدعوى ونوعها (اختياري)
            numberLine && React.createElement('p', {
                className: "text-[9px] font-bold truncate leading-tight",
                style: { color: '#D4AF37' }
            }, numberLine),

            // سطر الأطراف
            React.createElement(PartiesLine, {
                plaintiff, defendant, fallback: partiesFallback || caseTitle || '— جلسة مستقلة —',
                className: "text-[13px] font-bold text-white" + (numberLine ? " mt-0.5" : "")
            }),

            // سطر اسم/موضوع الدعوى (اختياري)
            titleLine && React.createElement('p', {
                className: "text-[9px] font-medium text-slate-400 truncate leading-tight mt-0.5"
            }, titleLine)
        ),

        // زر تصدير الجلسة لـ Google Calendar (اختياري — بيظهر فقط لو الأب مرر onGoogleExport)
        onGoogleExport && React.createElement('button', {
            onClick: (e: React.MouseEvent) => onGoogleExport(s, e),
            title: "إضافة لـ Google Calendar",
            className: "w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-xs active:scale-90 transition-all",
            style: { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80' }
        }, "🗓")
    );
}

export default SessionCard;
