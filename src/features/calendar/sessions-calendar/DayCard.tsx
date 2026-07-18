import React, { useState } from 'react';
import SessionCard from './SessionCard';
import TaskCard from './TaskCard';
import DayDivider from './DayDivider';
import type { MappedCase, MappedClient } from '../../../hooks/useAppData';
import type { CalendarSessionRow } from './CalendarTab';
import type { TaskFeedItem } from '@/shared/hooks/useDashboardFeed';

interface DayCardProps {
    dayName: string;
    dayNum: number;
    monthName: string;
    isToday: boolean;
    isFriday: boolean;
    sessCount: number;
    isConflict: boolean;
    daySess: CalendarSessionRow[];
    dayTasks: TaskFeedItem[];
    cases: MappedCase[];
    clients: MappedClient[];
    onOpenCase?: (c: MappedCase) => void;
    onOpenReminders?: () => void;
    handleGoogleExport: (s: CalendarSessionRow, e: React.MouseEvent) => void;
    onOpenStandalone?: (s: CalendarSessionRow) => void;
}

function DayCard({ dayName, dayNum, monthName, isToday, isFriday, sessCount, isConflict, daySess, dayTasks, cases, clients, onOpenCase, onOpenReminders, handleGoogleExport, onOpenStandalone }: DayCardProps) {
    const [open, setOpen] = useState(false);
    const goldColor = isToday ? 'rgba(212,175,55,0.9)' : 'rgba(212,175,55,0.4)';
    const lineStyle = {
        position: 'absolute' as const,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '40%',
        height: '2px',
        background: `linear-gradient(to right, transparent, ${goldColor}, transparent)`,
        borderRadius: '999px',
    };
    const hasItems = sessCount > 0;

    return React.createElement('div', { className: "mb-2" },
        React.createElement('button', {
            onClick: () => setOpen((o: boolean) => !o),
            className: "w-full flex items-center justify-between px-4 py-3 rounded-xl overflow-visible relative active:scale-[0.98] transition-all",
            style: {
                background: isToday
                    ? 'linear-gradient(135deg, rgba(42,31,0,0.9), rgba(61,46,0,0.9))'
                    : 'linear-gradient(135deg, rgba(15,18,32,0.95), rgba(20,24,42,0.95))',
                borderTop:    '1px solid rgba(255,255,255,0.06)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                borderRight: isToday ? '3px solid #D4AF37' : '3px solid rgba(212,175,55,0.35)',
                borderLeft:  isToday ? '3px solid #D4AF37' : '3px solid rgba(212,175,55,0.35)',
                boxShadow: isToday
                    ? '0 2px 20px rgba(212,175,55,0.12), inset 0 0 30px rgba(212,175,55,0.04)'
                    : '0 2px 10px rgba(0,0,0,0.3)',
            }
        },
            // خط ذهبي فوق من المنتصف
            React.createElement('div', { style: { ...lineStyle, top: '-3px' } }),
            // خط ذهبي تحت من المنتصف
            React.createElement('div', { style: { ...lineStyle, bottom: '-3px' } }),

            // النص في المنتصف
            React.createElement('div', { className: "flex-1 flex items-center justify-center gap-2" },
                React.createElement('span', {
                    className: "font-black text-[15px]",
                    style: { color: isToday ? '#D4AF37' : '#a78bfa' }
                }, dayName),
                React.createElement('span', {
                    className: "text-[13px] font-semibold",
                    style: { color: isToday ? 'rgba(212,175,55,0.75)' : 'rgba(167,139,250,0.7)' }
                }, `${dayNum} ${monthName}`),
                isToday && React.createElement('span', {
                    className: "text-[8px] font-black px-2 py-0.5 rounded-full",
                    style: { background: 'rgba(212,175,55,0.15)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.3)' }
                }, "اليوم")
            ),

            // badges + سهم الفتح/الغلق
            React.createElement('div', { className: "flex items-center gap-1.5" },
                isConflict && React.createElement('span', {
                    className: "text-[9px] font-black px-2 py-1 rounded-lg",
                    style: { background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }
                }, "⚠️ تعارض"),
                hasItems
                    ? React.createElement('span', {
                        className: "text-[10px] font-bold px-2.5 py-1 rounded-lg",
                        style: {
                            background: isToday ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.06)',
                            color: isToday ? '#D4AF37' : '#475569',
                            border: isToday ? '1px solid rgba(212,175,55,0.25)' : '1px solid rgba(255,255,255,0.07)'
                        }
                    }, `${sessCount} جلسة`)
                    : isFriday
                        ? React.createElement('span', {
                            className: "text-[10px] font-bold px-2.5 py-1 rounded-lg",
                            style: { background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.25)' }
                        }, "🎉 إجازة")
                        : React.createElement('span', {
                            className: "text-[10px] font-bold px-2.5 py-1 rounded-lg",
                            style: { background: 'rgba(255,255,255,0.05)', color: '#64748b', border: '1px solid rgba(255,255,255,0.06)' }
                        }, "لا توجد جلسات"),
                React.createElement('span', {
                    className: "text-[11px] text-slate-500 transition-transform",
                    style: { display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none' }
                }, "⌄")
            )
        ),

        // ── المحتوى (يظهر عند الفتح) ──
        open && React.createElement('div', { className: "mt-2 space-y-2 px-1" },
            hasItems
                ? [
                    ...daySess.map((s: CalendarSessionRow) =>
                        React.createElement(SessionCard, { key: s.id, s, cases, clients, onOpenCase, onOpenStandalone, onGoogleExport: handleGoogleExport })
                    ),
                    ...dayTasks.map((r: TaskFeedItem) =>
                        React.createElement(TaskCard, { key: 'task-' + r.id, r, onOpenTab: onOpenReminders })
                    )
                  ]
                : React.createElement('div', {
                    className: "bg-premium-card rounded-xl p-4 text-center text-[10px] font-bold",
                    style: { color: isFriday ? '#a78bfa' : '#64748b', border: '1px solid rgba(255,255,255,0.05)' }
                  }, isFriday ? "🎉 يوم الجمعة — إجازة أسبوعية" : "لا توجد جلسات في هذا اليوم")
        )
    );
}

export default DayCard;
