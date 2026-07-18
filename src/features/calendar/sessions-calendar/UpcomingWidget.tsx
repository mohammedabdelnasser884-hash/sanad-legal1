import React, { useState, useEffect } from 'react';
import { db } from '../../../supabaseClient';
import { I } from '../../../constants';
import { MONTHS_AR2, DAYS_AR_FULL, toDateStr } from './constants';
import SessionCard from './SessionCard';
import type { MappedCase, MappedClient } from '../../../hooks/useAppData';
import type { SessionCaseEmbed } from '@/shared/hooks/useDashboardFeed';
import type { CalendarSessionRow } from './CalendarTab';

// شكل "القضية المرتبطة" اللي ممكن تيجي من مصدرين مختلفين الشكل هنا بالظبط —
// نفس النمط المستخدم في DashboardTab.tsx/MissedTab.tsx/UpcomingSessionsList.tsx.
type LinkedCaseLike = Partial<MappedCase> & Partial<SessionCaseEmbed>;

// شكل ألوان مستوى الإلحاح (urgency) الأربعة المُعرّفة تحت.
interface UrgencyStyle {
    bg: string;
    border: string;
    text: string;
}

interface UpcomingWidgetProps {
    cases: MappedCase[];
    clients: MappedClient[];
    onOpenCase?: (c: MappedCase) => void;
}

function UpcomingWidget({ cases, clients, onOpenCase }: UpcomingWidgetProps) {
    const today    = new Date();
    const todayStr = toDateStr(today);
    const [sessions, setSessions] = useState<CalendarSessionRow[]>([]);
    const [loading, setLoading]   = useState(true);
    const [visibleCount, setVisibleCount] = useState(15);

    useEffect(() => {
        db.from('case_sessions')
          .select('id,session_date,session_time,session_floor,session_hall,case_id,description,result,next_action,title,case_number,court,case_type,plaintiff,defendant,cases(id,title,plaintiff,defendant,court_name,case_type,case_number_official,client_id)')
          .gte('session_date', todayStr)
          .order('session_date', { ascending: true })
          .limit(200)
          .then(({ data }) => { setSessions((data || []) as unknown as CalendarSessionRow[]); setLoading(false); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr + 'T00:00:00');
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
        const tomorrowStr = toDateStr(tomorrow);
        return {
            dayName: DAYS_AR_FULL[d.getDay()],
            day: d.getDate(),
            month: MONTHS_AR2[d.getMonth()],
            isToday: dateStr === todayStr,
            isTomorrow: dateStr === tomorrowStr,
            daysUntil: Math.round((d.getTime() - today.getTime()) / (1000*60*60*24))
        };
    };

    if (loading) return React.createElement('div', { className: "flex items-center justify-center py-10 gap-2 text-slate-500 text-xs" },
        React.createElement(I.Spin), "جاري التحميل...");

    if (sessions.length === 0) return React.createElement('div', {
        className: "bg-premium-card border border-white/5 rounded-2xl p-8 text-center space-y-2"
    },
        React.createElement('p', { className: "text-3xl" }, "🗓"),
        React.createElement('p', { className: "text-sm font-black text-slate-400" }, "لا توجد جلسات قادمة"),
        React.createElement('p', { className: "text-[10px] text-slate-600 mt-1" }, "سجّل جلسات جديدة من صفحة القضايا")
    );

    return React.createElement('div', { className: "space-y-2" },
        sessions.slice(0, visibleCount).map((s: CalendarSessionRow) => {
            const linkedCase   = ((Array.isArray(s.cases) ? s.cases[0] : s.cases) || cases.find((c: MappedCase) => c.id === s.case_id)) as LinkedCaseLike | undefined;
            const linkedClient = linkedCase ? clients.find((cl: MappedClient) => cl.id === linkedCase.client_id) : null;
            const { dayName, day, month, isToday, isTomorrow, daysUntil } = formatDate(s.session_date as string);
            const urgency = isToday ? 'red' : daysUntil <= 2 ? 'amber' : daysUntil <= 7 ? 'blue' : 'slate';
            const st: UrgencyStyle = {
                red:   { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)',   text: '#f87171' },
                amber: { bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)',  text: '#fbbf24' },
                blue:  { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)',  text: '#60a5fa' },
                slate: { bg: 'rgba(255,255,255,0.03)',border: 'rgba(255,255,255,0.07)',text: '#94a3b8' },
            }[urgency];
            return React.createElement('div', {
                key: s.id,
                onClick: () => linkedCase && onOpenCase && onOpenCase(linkedCase as MappedCase),
                className: "rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-all",
                style: { background: st.bg, border: '1px solid ' + st.border }
            },
                React.createElement('div', { className: "flex items-stretch" },
                    React.createElement('div', {
                        className: "flex flex-col items-center justify-center px-3 py-3 shrink-0 min-w-[58px]",
                        style: { borderLeft: '1px solid ' + st.border }
                    },
                        React.createElement('p', { className: "text-[8px] font-black", style: { color: st.text } },
                            isToday ? 'اليوم' : isTomorrow ? 'غداً' : dayName),
                        React.createElement('p', { className: "text-xl font-black text-white leading-none mt-0.5" }, day),
                        React.createElement('p', { className: "text-[8px] text-slate-500 mt-0.5" }, month)
                    ),
                    React.createElement('div', { className: "flex-1 p-3 space-y-1" },
                        React.createElement('div', { className: "flex items-start justify-between gap-2" },
                            React.createElement('p', { className: "text-[11px] font-black text-white leading-tight flex-1" },
                                (linkedCase?.title) || s.title || ((linkedCase?.plaintiff && linkedCase?.defendant) ? linkedCase.plaintiff + ' ضد ' + linkedCase.defendant : null) || s.description || '— جلسة مستقلة —'),
                            s.session_time && React.createElement('span', {
                                className: "text-[8px] px-1.5 py-0.5 rounded-full font-black shrink-0",
                                style: { background: s.session_time === 'صباحي' ? 'rgba(251,191,36,0.15)' : 'rgba(99,102,241,0.15)', color: s.session_time === 'صباحي' ? '#fbbf24' : '#818cf8' }
                            }, s.session_time === 'صباحي' ? '🌅 ص' : '🌆 م')
                        ),
                        React.createElement('div', { className: "flex items-center gap-3 flex-wrap" },
                            (linkedCase?.court_name || linkedCase?.court) && React.createElement('span', { className: "text-[9px] text-slate-400" }, "🏛 " + (linkedCase?.court_name || linkedCase?.court)),
                            (s.session_floor || s.session_hall) && React.createElement('span', {
                                className: "text-[9px] font-bold", style: { color: '#38bdf8' }
                            }, "📍 " + (s.session_floor ? 'ط' + s.session_floor + ' ' : '') + (s.session_hall ? 'ق' + s.session_hall : '')),
                            linkedClient && React.createElement('span', { className: "text-[9px] text-emerald-400" }, "👤 " + linkedClient.full_name)
                        ),
                        (linkedCase?.case_type || linkedCase?.type) && React.createElement('span', { className: "inline-block text-[8px] px-2 py-0.5 rounded-full bg-white/5 text-slate-500 font-bold" }, linkedCase?.case_type || linkedCase?.type)
                    )
                )
            );
        }),
        sessions.length > visibleCount && React.createElement('button', {
            onClick: () => setVisibleCount((v: number) => v + 15),
            className: "w-full py-3 rounded-2xl text-xs font-black active:scale-[0.98] transition-all flex items-center justify-center gap-2",
            style: { background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.18)', color: '#38bdf8' }
        },
            React.createElement('span', { className: "text-base" }, "⬇️"),
            "تحميل المزيد",
            React.createElement('span', {
                className: "text-[9px] px-2 py-0.5 rounded-full font-black",
                style: { background: 'rgba(56,189,248,0.12)', color: '#38bdf8' }
            }, `${sessions.length - visibleCount} جلسة`)
        )
    );
}

export default UpcomingWidget;
