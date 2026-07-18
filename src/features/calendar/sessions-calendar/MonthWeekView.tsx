import React, { useState } from 'react';
import SessionCard from './SessionCard';
import TaskCard from './TaskCard';
import { getDayName } from './dateHelpers';
import type { MappedCase, MappedClient } from '../../../hooks/useAppData';
import type { WeekInfo, MonthSessionRow } from './MonthListTab';
import type { CalendarSessionRow } from './CalendarTab';
import type { TaskFeedItem } from '@/shared/hooks/useDashboardFeed';

interface MonthWeekViewProps {
    weeks: WeekInfo[];
    sessionsMap: Record<string, MonthSessionRow[]>;
    tasksMap: Record<string, TaskFeedItem[]>;
    cases: MappedCase[];
    clients: MappedClient[];
    onOpenCase: (c: MappedCase) => void;
    onOpenReminders: () => void;
    onOpenStandalone: (s: MonthSessionRow) => void;
    todayStr: string;
    handleGoogleExport: (s: MonthSessionRow, e: React.MouseEvent) => void;
    prevMonth: () => void;
    nextMonth: () => void;
}

function MonthWeekView({ weeks, sessionsMap, tasksMap, cases, clients, onOpenCase, onOpenReminders, onOpenStandalone, todayStr, handleGoogleExport, prevMonth, nextMonth }: MonthWeekViewProps) {
    const currentWeekIdx = weeks.findIndex((w: WeekInfo) => w.days.includes(todayStr));
    const [selectedWeek, setSelectedWeek] = useState(currentWeekIdx >= 0 ? currentWeekIdx : 0);

    const week = weeks[selectedWeek];

    return React.createElement('div', { className: "space-y-3" },

        // ── ستريب الأسابيع: الأسهم (تنقل بين الشهور) + 4 أسابيع في صف واحد ──
        React.createElement('div', { className: "flex items-center gap-0.5" },
            React.createElement('button', {
                onClick: prevMonth,
                className: "w-6 h-9 shrink-0 flex items-center justify-center text-slate-500 active:scale-90 transition-all text-base"
            }, "‹"),
            React.createElement('div', { className: "flex-1 flex items-center justify-between gap-1" },
                weeks.map((w: WeekInfo, idx: number) => {
                    const isSel    = idx === selectedWeek;
                    const hasToday = w.days.includes(todayStr);
                    const count    = w.days.reduce((acc: number, d: string) => acc + (sessionsMap[d]?.length||0), 0);
                    const startDay = parseInt(w.days[0].split('-')[2]);
                    const endDay   = parseInt(w.days[w.days.length-1].split('-')[2]);
                    return React.createElement('button', {
                        key: idx,
                        onClick: () => setSelectedWeek(idx),
                        className: "flex flex-col items-center gap-1 flex-1 py-0.5"
                    },
                        React.createElement('span', {
                            className: "text-[8px] font-bold",
                            style: { color: isSel ? '#D4AF37' : '#475569' }
                        }, ['1','2','3','4'][idx]),
                        React.createElement('span', {
                            className: "px-1.5 h-7 min-w-[34px] rounded-full flex items-center justify-center text-[10.5px] font-black transition-all",
                            style: {
                                background: isSel ? '#D4AF37' : 'transparent',
                                color: isSel ? '#0a0f1c' : hasToday ? '#4ade80' : 'white',
                                border: !isSel && hasToday ? '1.5px solid #4ade80' : '1.5px solid transparent',
                            }
                        }, `${startDay}-${endDay}`),
                        React.createElement('span', {
                            className: "w-1 h-1 rounded-full",
                            style: { background: count > 0 ? (isSel ? '#D4AF37' : '#94a3b8') : 'transparent' }
                        })
                    );
                })
            ),
            React.createElement('button', {
                onClick: nextMonth,
                className: "w-6 h-9 shrink-0 flex items-center justify-center text-slate-500 active:scale-90 transition-all text-base"
            }, "›")
        ),

        // ── أيام الأسبوع المختار (قائمة مضغوطة) ──
        React.createElement('div', { className: "space-y-0" },
            week.days.map((dateStr: string) => {
                const daySess  = sessionsMap[dateStr] || [];
                const dayTasks = tasksMap[dateStr] || [];
                const dayNum   = parseInt(dateStr.split('-')[2]);
                const monthNum = parseInt(dateStr.split('-')[1]);
                const dayName  = getDayName(dateStr);
                const isToday  = dateStr === todayStr;
                const isFriday = new Date(dateStr + 'T00:00:00').getDay() === 5;
                const total    = daySess.length;

                return React.createElement('div', { key: dateStr },
                    // فاصل اليوم
                    React.createElement('div', {
                        className: "flex items-center gap-2 py-2 px-1",
                        style: { borderBottom: '1px solid rgba(255,255,255,0.04)' }
                    },
                        React.createElement('div', {
                            className: "flex items-center gap-1.5 flex-1 min-w-0"
                        },
                            React.createElement('span', {
                                className: "text-[11px] font-black",
                                style: { color: isToday ? '#D4AF37' : '#94a3b8' }
                            }, dayName),
                            React.createElement('span', {
                                className: "text-[11px] font-bold",
                                style: { color: isToday ? 'rgba(212,175,55,0.7)' : '#475569' }
                            }, `${dayNum}/${monthNum}`),
                            isToday && React.createElement('span', {
                                className: "text-[7px] font-black px-1.5 py-0.5 rounded-full",
                                style: { background: 'rgba(212,175,55,0.15)', color: '#D4AF37' }
                            }, "اليوم")
                        ),
                        isFriday
                            ? React.createElement('span', {
                                className: "text-[8px] font-black px-2 py-0.5 rounded-full",
                                style: { background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }
                              }, "إجازة")
                            : total > 0
                                ? React.createElement('span', {
                                    className: "text-[8px] font-black px-2 py-0.5 rounded-full",
                                    style: { background: 'rgba(212,175,55,0.1)', color: '#D4AF37' }
                                  }, total + ' جلسة')
                                : React.createElement('span', {
                                    className: "text-[8px]", style: { color: '#1e293b' }
                                  }, "لا توجد جلسات")
                    ),

                    // الجلسات
                    total > 0 && React.createElement('div', { className: "space-y-1 py-1.5 px-1" },
                        ...daySess.map((s: MonthSessionRow) =>
                            // ⚠️ FIX (14 يوليو 2026): onOpenStandalone/onGoogleExport هنا متوقعين
                            // فعليًا MonthSessionRow (الشكل الأوسع)، بينما SessionCard معرّف عمومًا
                            // بـ CalendarSessionRow (الأضيق) عشان يشتغل مع كل الشاشات. الكاست هنا
                            // آمن لأن s هنا دايمًا MonthSessionRow فعليًا وقت التشغيل.
                            React.createElement(SessionCard, {
                                key: s.id, s, cases, clients, onOpenCase,
                                onOpenStandalone: onOpenStandalone as unknown as (s: CalendarSessionRow) => void,
                                onGoogleExport: handleGoogleExport as unknown as (s: CalendarSessionRow, e: React.MouseEvent) => void
                            })
                        )
                    )
                );
            })
        )
    );
}

export default MonthWeekView;
