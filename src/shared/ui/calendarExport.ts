// ── Calendar Utilities ──
export function dateToICal(dateStr: string) {
    return dateStr ? dateStr.replace(/-/g, '') : '';
}

export function dateToGCal(dateStr: string) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`;
}

// شكل الحد الأدنى من حقول الجلسة المطلوبة للتصدير لـ Google Calendar —
// نفس الحقول الفعلية المستخدمة من CalendarSessionRow/MonthSessionRow.
interface SessionForExport {
    session_date: string | null;
}

export function exportSessionToGoogleCalendar(session: SessionForExport, caseTitle: string, courtName: string, clientName: string) {
    const title = encodeURIComponent(`جلسة: ${caseTitle}`);
    const details = encodeURIComponent(`موكل: ${clientName}\nمحكمة: ${courtName}`);
    const location = encodeURIComponent(courtName || '');
    // كاست توثيقي: session_date نوعه الحقيقي string | null (زي كل تواريخ قاعدة
    // البيانات)، بس الدالة أصلاً بتفترض قيمة موجودة (زي ما كانت مكتوبة any قبل كده).
    const dates = encodeURIComponent(dateToGCal(session.session_date as string));
    window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}/${dates}&details=${details}&location=${location}`, '_blank');
}

// ⚠️ الدوال التالية (generateICalBlob/downloadICal) مش مستخدمة في أي مكان
// في المشروع حاليًا (كود ميت) — بس اتعمل تنويع بنفس الحقول اللي بيوصلها
// فعليًا (session_date/case_id/court/id، title/client_id، name) عشان نشيل
// الـ any من غير أي افتراض إضافي.
interface ICalSession { id: string; session_date: string | null; case_id: string | null; court: string | null; }
interface ICalCase { id: string; title: string | null; client_id: string | null; }
interface ICalClient { id: string; name?: string | null; }

export function generateICalBlob(sessions: ICalSession[], cases: ICalCase[], clients: ICalClient[]) {
    const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SANAD//Legal OS//AR'];
    sessions.forEach((s: ICalSession) => {
        const linkedCase = cases.find((c: ICalCase) => c.id === s.case_id);
        const linkedClient = linkedCase ? clients.find((cl: ICalClient) => cl.id === linkedCase.client_id) : null;
        const summary = linkedCase ? `جلسة: ${linkedCase.title}` : 'جلسة قانونية';
        // كاست توثيقي: session_date نوعه الحقيقي string | null، نفس افتراض
        // الكود الأصلي (كان any) إن القيمة موجودة وقت الاستدعاء.
        const isoDate = s.session_date as string;
        lines.push('BEGIN:VEVENT', `DTSTART:${dateToICal(isoDate)}`, `DTEND:${dateToICal(isoDate)}`,
            `SUMMARY:${summary}`, `DESCRIPTION:${linkedClient?.name || ''}`, `LOCATION:${s.court || ''}`,
            `DTSTAMP:${now}`, `UID:session-${s.id}@sanadlegalos`, 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return new Blob([lines.join('\r\n')], { type: 'text/calendar' });
}

export function downloadICal(sessions: ICalSession[], cases: ICalCase[], clients: ICalClient[], filename: string) {
    const blob = generateICalBlob(sessions, cases, clients);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || 'sessions.ics'; a.click();
    URL.revokeObjectURL(url);
}
