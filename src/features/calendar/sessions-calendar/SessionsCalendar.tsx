import React, { useState, useEffect, useCallback } from 'react';
import { toDateStr } from './constants';
import MonthListTab from './MonthListTab';
import CalendarTab, { type CalendarSessionRow } from './CalendarTab';
import MissedTab from './MissedTab';
import { db } from '../../../supabaseClient';
import StandaloneSessionDetailModal from './StandaloneSessionDetailModal';
import type { MappedCase, MappedClient } from '../../../hooks/useAppData';
import type { CaseSessionRow } from '../../../types';

interface SessionsCalendarProps {
    cases: MappedCase[];
    clients: MappedClient[];
    onOpenCase: (c: MappedCase) => void;
    onOpenReminders: () => void;
    initialTab?: 'month' | 'calendar' | 'missed';
}

// شكل صف case_sessions اللي بيترجع من استعلامي fetchMissedCount هنا
// (نفس الأعمدة المطلوبة فعليًا في كل .select() بالظبط)
interface MissedSessionRow {
    id: string;
    result: string | null;
    next_action: string | null;
}
interface OverdueReminderRow {
    id: string;
    done: boolean;
}

function SessionsCalendar({ cases, clients, onOpenCase, onOpenReminders, initialTab }: SessionsCalendarProps) {
    const [activeTab, setActiveTab] = useState<'month'|'calendar'|'missed'>(initialTab || 'calendar');
    const [missedCount, setMissedCount] = useState(0);
    // النوع الأعم (CalendarSessionRow) بيغطي كل الاستخدامات التلاتة (Calendar/Missed/Month)
    // لأن MonthSessionRow بيمتد منه فعليًا.
    const [standaloneTarget, setStandaloneTarget] = useState<CalendarSessionRow | null>(null);

    // جلب عدد الفائتة لعرضه على الـ badge
    const fetchMissedCount = useCallback(async () => {
        const todayStr = toDateStr(new Date());
        const [sessCnt, taskCnt] = await Promise.all([
            db.from('case_sessions')
              .select('id,result,next_action')
              .lt('session_date', todayStr)
              .then(({ data }) => ((data || []) as unknown as MissedSessionRow[]).filter((s) => !s.result?.trim() && !s.next_action?.trim()).length),
            db.from('reminders')
              .select('id,done')
              .eq('done', false)
              .lt('due_date', todayStr)
              .then(({ data }) => ((data || []) as unknown as OverdueReminderRow[]).length)
        ]);
        setMissedCount(sessCnt + taskCnt);
    }, []);

    useEffect(() => {
        fetchMissedCount();

        // Realtime: أي تغيير في الجلسات أو التذكيرات يحدّث الـ badge فوراً
        const sessionsSub = db
            .channel('missed-badge-sessions')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'case_sessions' }, fetchMissedCount)
            .subscribe();

        const remindersSub = db
            .channel('missed-badge-reminders')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' }, fetchMissedCount)
            .subscribe();

        return () => {
            db.removeChannel(sessionsSub);
            db.removeChannel(remindersSub);
        };
    }, [fetchMissedCount]);

    const tabs = [
        { id: 'calendar', label: 'التقويم', emoji: '📅' },
        { id: 'month',    label: 'الشهر',   emoji: '🗓' },
        { id: 'missed',   label: 'الفائتة', emoji: '⚠️', count: missedCount },
    ] as const;

    return React.createElement(React.Fragment, null,
        standaloneTarget && React.createElement(StandaloneSessionDetailModal, {
            session: standaloneTarget as unknown as CaseSessionRow,
            db,
            onClose: () => setStandaloneTarget(null),
            onDone: () => setStandaloneTarget(null),
        }),
        React.createElement('div', { className: "space-y-2 fade-in" },

        // ── التابس ──
        React.createElement('div', { className: "flex bg-white/5 border border-white/10 rounded-xl p-0.5 gap-0.5" },
            tabs.map((t: typeof tabs[number]) => React.createElement('button', {
                key: t.id,
                onClick: () => setActiveTab(t.id),
                className: `flex-1 flex items-center justify-center gap-0.5 px-1 py-2 rounded-lg text-[12px] font-black transition-all relative ${
                    activeTab === t.id
                        ? t.id === 'missed'
                            ? 'bg-rose-500/80 text-white shadow-md'
                            : 'bg-premium-gold text-premium-bg shadow-md'
                        : 'text-slate-400 hover:text-white'
                }`
            },
                React.createElement('span', null, t.emoji),
                t.label,
                // badge عدد الفائتة
                t.id === 'missed' && t.count > 0 && React.createElement('span', {
                    className: `absolute -top-1 -left-1 min-w-[16px] h-4 flex items-center justify-center text-[8px] font-black rounded-full px-1 ${
                        activeTab === 'missed' ? 'bg-white text-rose-600' : 'bg-rose-500 text-white'
                    }`
                }, t.count)
            ))
        ),
        activeTab === 'month'    && React.createElement(MonthListTab,  { cases, clients, onOpenCase, onOpenReminders, onOpenStandalone: setStandaloneTarget }),
        activeTab === 'calendar' && React.createElement(CalendarTab,   { cases, clients, onOpenCase, onOpenStandalone: setStandaloneTarget }),
        activeTab === 'missed'   && React.createElement(MissedTab,     { cases, clients, onOpenCase, onOpenReminders, onOpenStandalone: setStandaloneTarget })
        )
    );
}

export default SessionsCalendar;
