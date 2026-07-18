import React, { useState, useEffect } from 'react';
import { db } from '../../../supabaseClient';
import { I } from '../../../constants';
import { MONTHS_AR2, DAYS_AR_FULL, toDateStr } from './constants';
import SessionCard from './SessionCard';
import TaskCard from './TaskCard';
import type { MappedCase, MappedClient } from '../../../hooks/useAppData';
import type { SessionCaseEmbed, TaskFeedItem } from '@/shared/hooks/useDashboardFeed';
import type { CalendarSessionRow } from './CalendarTab';

// شكل "القضية المرتبطة" اللي ممكن تيجي من مصدرين مختلفين الشكل هنا بالظبط
// (كائن `cases` المدمج من الاستعلام، أو `cases.find(...)` من الـ prop) — نفس
// النمط المستخدم في DashboardTab.tsx/UpcomingSessionsList.tsx بالضبط.
type LinkedCaseLike = Partial<MappedCase> & Partial<SessionCaseEmbed>;

interface MissedTabProps {
    cases: MappedCase[];
    clients: MappedClient[];
    onOpenCase: (c: MappedCase) => void;
    onOpenReminders: () => void;
    onOpenStandalone: (s: CalendarSessionRow) => void;
}

function MissedTab({ cases, clients, onOpenCase, onOpenReminders, onOpenStandalone }: MissedTabProps) {
    const today    = new Date();
    const todayStr = toDateStr(today);
    const [sessions, setSessions] = useState<CalendarSessionRow[]>([]);
    const [missedTasks, setMissedTasks] = useState<TaskFeedItem[]>([]);
    const [loading, setLoading]   = useState(true);

    useEffect(() => {
        // جلسات فات تاريخها وليس فيها result ولا next_action (لم تُحدَّث)
        Promise.all([
            db.from('case_sessions')
              .select('id,session_date,session_time,session_floor,session_hall,case_id,description,result,next_action,title,case_number,court,case_type,plaintiff,defendant,circuit_number,plaintiff_role,defendant_role,cases(id,title,plaintiff,defendant,court_name,case_type,case_number_official,client_id)')
              .lt('session_date', todayStr)
              .order('session_date', { ascending: false })
              .limit(50)
              .then(({ data }) => ((data || []) as unknown as CalendarSessionRow[]).filter((s: CalendarSessionRow) => !s.result?.trim() && !s.next_action?.trim())),
            db.from('reminders')
              .select('id,title,due_date,notes,done')
              .eq('done', false)
              .lt('due_date', todayStr)
              .order('due_date', { ascending: false })
              .then(({ data }) => (data || []) as unknown as TaskFeedItem[])
        ]).then(([sess, tsk]: [CalendarSessionRow[], TaskFeedItem[]]) => {
            setSessions(sess); setMissedTasks(tsk); setLoading(false);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fmtDate = (dateStr: string) => {
        const d = new Date(dateStr + 'T00:00:00');
        const dayName = DAYS_AR_FULL[d.getDay()];
        const day     = d.getDate();
        const month   = MONTHS_AR2[d.getMonth()];
        const year    = d.getFullYear();
        // كم يوم مضى
        const diff = Math.round((today.getTime() - d.getTime()) / (1000*60*60*24));
        const ago  = diff === 0 ? 'اليوم' : diff === 1 ? 'منذ أمس' : `منذ ${diff} يوم`;
        return { dayName, day, month, year, ago, diff };
    };

    if (loading) return React.createElement('div', { className: "flex items-center justify-center py-10 gap-2 text-slate-500 text-xs" },
        React.createElement(I.Spin), "جاري التحميل...");

    if (sessions.length === 0 && missedTasks.length === 0) return React.createElement('div', {
        className: "bg-premium-card border border-white/5 rounded-2xl p-10 text-center space-y-2"
    },
        React.createElement('p', { className: "text-3xl" }, "✅"),
        React.createElement('p', { className: "text-sm font-black text-emerald-400" }, "لا توجد جلسات أو مهام فائتة"),
        React.createElement('p', { className: "text-[10px] text-slate-600 mt-1" }, "كل الجلسات والمهام السابقة تم تحديثها — ممتاز!")
    );

    return React.createElement('div', { className: "space-y-1.5" },
        // تنبيه عدد الجلسات الفائتة
        sessions.length > 0 && React.createElement('div', {
            className: "flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-2.5 py-1.5"
        },
            React.createElement('span', { className: "text-rose-400 text-sm" }, "⚠️"),
            React.createElement('p', { className: "text-[11px] font-black text-rose-300 flex-1" },
                sessions.length + " جلسة فائتة بدون تحديث"
            ),
            React.createElement('p', { className: "text-[9px] text-slate-500" }, "افتح القضية وأضف القرار")
        ),

        sessions.map((s: CalendarSessionRow) => {
            const linkedCase   = ((Array.isArray(s.cases) ? s.cases[0] : s.cases) || cases.find((c: MappedCase) => c.id === s.case_id)) as LinkedCaseLike | undefined;
            const linkedClient = linkedCase ? clients.find((cl: MappedClient) => cl.id === linkedCase.client_id) : null;
            const { dayName, day, month, year, ago, diff } = fmtDate(s.session_date as string);
            const urgencyColor = diff <= 3 ? { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', text: '#f87171' }
                               : diff <= 7 ? { bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.2)', text: '#fbbf24' }
                               :             { bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.06)', text: '#94a3b8' };

            return React.createElement('div', {
                key: s.id,
                onClick: () => { if (linkedCase && onOpenCase) onOpenCase(linkedCase as MappedCase); else if (!linkedCase && onOpenStandalone) onOpenStandalone(s); },
                className: "rounded-lg overflow-hidden cursor-pointer active:scale-[0.98] transition-all",
                style: { background: urgencyColor.bg, border: '1px solid ' + urgencyColor.border }
            },
                React.createElement('div', { className: "flex items-center gap-2 px-2 py-1.5" },
                    // التاريخ
                    React.createElement('div', {
                        className: "flex flex-col items-center justify-center shrink-0",
                        style: { borderLeft: '1px solid ' + urgencyColor.border, paddingLeft: '8px', minWidth: '36px' }
                    },
                        React.createElement('p', { className: "text-[14px] font-black text-white leading-none" }, day),
                        React.createElement('p', { className: "text-[7px] font-bold", style: { color: urgencyColor.text } }, month),
                        React.createElement('p', { className: "text-[6.5px] font-black mt-0.5", style: { color: urgencyColor.text } }, ago)
                    ),
                    // المحتوى
                    React.createElement('div', { className: "flex-1 min-w-0" },
                        React.createElement('div', { className: "flex items-center justify-between gap-1" },
                            React.createElement('p', { className: "text-[10.5px] font-black text-white leading-tight flex-1 truncate" },
                                (linkedCase?.title) || s.title || ((linkedCase?.plaintiff && linkedCase?.defendant) ? linkedCase.plaintiff + ' ضد ' + linkedCase.defendant : null) || s.description || '— جلسة مستقلة —'
                            ),
                            React.createElement('span', {
                                className: "text-[6.5px] px-1.5 py-0.5 rounded-full font-black bg-rose-500/15 text-rose-400 shrink-0"
                            }, "❌ بدون قرار")
                        ),
                        React.createElement('div', { className: "flex items-center gap-2 mt-0.5 flex-wrap" },
                            linkedCase?.court && React.createElement('span', { className: "text-[8.5px] text-slate-400" }, "🏛 " + linkedCase.court),
                            linkedClient      && React.createElement('span', { className: "text-[8.5px] text-emerald-400" }, "👤 " + linkedClient.full_name)
                        )
                    )
                )
            );
        }),

        // ── المهام الفائتة ──
        missedTasks.length > 0 && React.createElement('div', { className: "space-y-1.5 mt-1.5" },
            React.createElement('div', {
                className: "flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-xl px-2.5 py-1.5"
            },
                React.createElement('span', { className: "text-violet-400 text-sm" }, "📋"),
                React.createElement('p', { className: "text-[11px] font-black text-violet-300 flex-1" },
                    missedTasks.length + " مهمة متأخرة"
                ),
                React.createElement('button', {
                    onClick: () => onOpenReminders && onOpenReminders(),
                    className: "text-[9px] text-slate-500 active:scale-95"
                }, "إدارة المهام ←")
            ),
            missedTasks.map((r: TaskFeedItem) => {
                const diff = Math.round((today.getTime() - new Date((r.due_date as string)+'T00:00:00').getTime()) / (1000*60*60*24));
                const ago  = diff === 1 ? 'منذ أمس' : `منذ ${diff} يوم`;
                return React.createElement(TaskCard, {
                    key: 'task-'+r.id, r,
                    accentColor: '#f87171',
                    accentBg: 'linear-gradient(135deg,rgba(239,68,68,0.08),rgba(239,68,68,0.03))',
                    accentBorder: 'rgba(239,68,68,0.25)',
                    badge: ago,
                    onOpenTab: onOpenReminders,
                    compact: true
                });
            })
        )
    );
}

export default MissedTab;
