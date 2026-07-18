import { useState, useCallback } from 'react';
import { db } from '../../supabaseClient';
import type { ProfileRow, ReminderRow } from '../../types';

// شكل بيانات القضية المدمجة (embed) جوه استعلام case_sessions — نفس الأعمدة
// المطلوبة فعليًا في select الأربعة تحت (`cases(id,title,plaintiff,defendant,court_name,case_type,case_number_official,client_id)`).
export interface SessionCaseEmbed {
    id: string;
    title: string | null;
    plaintiff: string | null;
    defendant: string | null;
    court_name: string | null;
    case_type: string | null;
    case_number_official: string | null;
    client_id: string | null;
}

// شكل صف الجلسة اللي بيترجع من select الأربعة — الأعمدة المطلوبة من case_sessions
// بالإضافة للعلاقة المدمجة `cases`. الشكل (كائن واحد أو مصفوفة) مش موحّد دايمًا
// من Supabase حسب نوع العلاقة، فالنوع بيسمح بالاتنين زي ما DashboardTab.tsx بيتعامل معاه فعليًا.
export interface SessionFeedItem {
    id: string;
    session_date: string | null;
    session_time: string | null;
    session_floor: string | null;
    session_hall: string | null;
    description: string | null;
    case_id: string | null;
    result: string | null;
    next_action: string | null;
    title: string | null;
    case_number: string | null;
    court: string | null;
    case_type: string | null;
    circuit_number: string | null;
    plaintiff: string | null;
    plaintiff_role: string | null;
    defendant: string | null;
    defendant_role: string | null;
    cases: SessionCaseEmbed | SessionCaseEmbed[] | null;
}

// شكل صف المهمة (reminder) اللي بيترجع من select('id,title,due_date,notes,done')
export type TaskFeedItem = Pick<ReminderRow, 'id' | 'title' | 'due_date' | 'notes' | 'done'>;

export function useDashboardFeed(profile: ProfileRow | null) {
    const [todaySessions,    setTodaySessions]    = useState<SessionFeedItem[]>([]);  // جلسات اليوم فقط
    const [upcomingSessions, setUpcomingSessions] = useState<SessionFeedItem[]>([]);  // بكره + 6 أيام
    const [missedSessions,   setMissedSessions]   = useState<SessionFeedItem[]>([]);  // فائتة بدون تحديث
    const [loadingUrgent,    setLoadingUrgent]    = useState(false);

    // ── المهام (reminders) ──
    const [upcomingTasks,     setUpcomingTasks]     = useState<TaskFeedItem[]>([]); // due_date >= اليوم، غير منجزة
    const [missedTasks,       setMissedTasks]       = useState<TaskFeedItem[]>([]); // due_date < اليوم، غير منجزة
    const [upcomingTasksOpen, setUpcomingTasksOpen] = useState(false);
    const [todayOpen,         setTodayOpen]         = useState(false); // مقفولة افتراضيًا — تقليل الزحمة
    const [upcomingOpen,      setUpcomingOpen]      = useState(false); // مقفولة افتراضيًا — تقليل الزحمة

    // ── ملاحظة: فحص dbOnline + الـ event listeners موجودين في App.tsx فقط ──
    // تم حذف النسخة المكررة من هنا لتجنب إرسال طلبين لـ Supabase كل 30 ثانية
    // وتجنب تراكم event listeners على window

    // ── helper: date formatter ──
    const fmtDate = (d: Date) =>
        d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');

    // ── جلب جلسات اليوم ──
    const fetchTodaySessions = useCallback(async () => {
        if (!profile) return;
        setLoadingUrgent(true);
        const todayStr = fmtDate(new Date());
        const { data } = await db.from('case_sessions')
            .select('id, session_date, session_time, session_floor, session_hall, description, case_id, result, next_action, title, case_number, court, case_type, circuit_number, plaintiff, plaintiff_role, defendant, defendant_role, cases(id,title,plaintiff,defendant,court_name,case_type,case_number_official,client_id)')
            .eq('session_date', todayStr)
            .order('session_date', { ascending: true });
        setTodaySessions(data || []);
        setLoadingUrgent(false);
    }, [profile]);

    // ── جلب جلسات الأسبوع القادم (بكره + 6 أيام) ──
    const fetchUpcomingSessions = useCallback(async () => {
        if (!profile) return;
        const today    = new Date();
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
        const endDay   = new Date(today); endDay.setDate(today.getDate() + 7);
        const { data } = await db.from('case_sessions')
            .select('id, session_date, session_time, session_floor, session_hall, description, case_id, result, next_action, title, case_number, court, case_type, circuit_number, plaintiff, plaintiff_role, defendant, defendant_role, cases(id,title,plaintiff,defendant,court_name,case_type,case_number_official,client_id)')
            .gte('session_date', fmtDate(tomorrow))
            .lte('session_date', fmtDate(endDay))
            .order('session_date', { ascending: true });
        setUpcomingSessions(data || []);
    }, [profile]);

    // ── جلب الجلسات الفائتة ──
    // جلسة فائتة = آخر جلسة في قضيتها وتاريخها قبل اليوم ومافيش جلسة جديدة مجدولة بعدها
    // ⚠️ الإصلاح: أزلنا limit(200) اللي كانت تفوّت قضايا قديمة — دلوقتي بنجيب
    //    أحدث جلسة لكل قضية عبر فلترة server-side أدق
    const fetchMissedSessions = useCallback(async () => {
        if (!profile) return;
        const todayStr = fmtDate(new Date());

        // 1. كل الـ case_ids اللي عندها جلسة مستقبلية (اليوم أو بعده)
        const { data: futureData } = await db.from('case_sessions')
            .select('case_id')
            .gte('session_date', todayStr);
        const caseIdsWithFuture = new Set((futureData || []).map((s: { case_id: string | null }) => s.case_id));

        // 2. جيب أحدث جلسة فائتة لكل قضية (بدون limit — RLS بتحمي الحجم)
        // ⚠️ FIX (14 يوليو 2026): كان ناقص session_floor/session_hall هنا مقارنة
        // بالـ select بتاع جلسات اليوم/الأسبوع فوق، مع إن SessionFeedItem بيطلبهم
        // إجباريًا — ده كان بيكسر النوع وقت التخزين في setMissedSessions.
        const { data: pastData } = await db.from('case_sessions')
            .select('id, session_date, session_time, session_floor, session_hall, description, case_id, result, next_action, title, case_number, court, case_type, circuit_number, plaintiff, plaintiff_role, defendant, defendant_role, cases(id,title,plaintiff,defendant,court_name,case_type,case_number_official,client_id)')
            .lt('session_date', todayStr)
            .order('session_date', { ascending: false });

        // 3. فلتر: قضايا مفيهاش جلسة مستقبلية + خد جلسة واحدة (الأحدث) لكل قضية
        const seenCases = new Set();
        const uniqueMissed = (pastData || []).filter((s: SessionFeedItem) => {
            if (caseIdsWithFuture.has(s.case_id)) return false;
            if (seenCases.has(s.case_id)) return false;
            seenCases.add(s.case_id);
            return true;
        });
        setMissedSessions(uniqueMissed);
    }, [profile]);

    // ── جلب المهام ──
    const fetchTasks = useCallback(async () => {
        if (!profile) return;
        const todayStr = fmtDate(new Date());
        const { data } = await db.from('reminders')
            .select('id,title,due_date,notes,done')
            .eq('done', false)
            .order('due_date', { ascending: true });
        const all = data || [];
        setUpcomingTasks(all.filter((r: TaskFeedItem) => (r.due_date as string) >= todayStr));
        setMissedTasks(all.filter((r: TaskFeedItem) => (r.due_date as string) < todayStr));
    }, [profile]);

    return {
        todaySessions,    setTodaySessions,
        upcomingSessions, setUpcomingSessions,
        missedSessions,   setMissedSessions,
        upcomingTasks,    setUpcomingTasks,
        missedTasks,      setMissedTasks,
        loadingUrgent,
        upcomingTasksOpen, setUpcomingTasksOpen,
        todayOpen,         setTodayOpen,
        upcomingOpen,      setUpcomingOpen,
        fetchTodaySessions, fetchUpcomingSessions, fetchMissedSessions, fetchTasks,
    };
}
