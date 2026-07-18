import React, { useState, useEffect } from 'react';
import { db } from '../../../supabaseClient';
import { toast } from '../../../shared/lib/notifications';
import { exportSessionToGoogleCalendar } from '@/shared/ui/calendarExport';
import { MONTHS_AR2, DAYS_FULL, toDateStr } from './constants';
import SessionCard from './SessionCard';
import UpcomingWidget from './UpcomingWidget';
import type { MappedCase, MappedClient } from '../../../hooks/useAppData';
import type { SessionCaseEmbed } from '@/shared/hooks/useDashboardFeed';

// شكل صف الجلسة اللي بيترجع من استعلامي `case_sessions` في الملف ده (نفس
// الأعمدة المطلوبة فعليًا في الـ .select() بالضبط، بالإضافة للعلاقة المدمجة
// `cases` بنفس شكل SessionCaseEmbed المستخدم في useDashboardFeed.ts).
export interface CalendarSessionRow {
    id: string;
    session_date: string | null;
    case_id: string | null;
    description: string | null;
    result: string | null;
    next_action: string | null;
    session_time: string | null;
    session_floor: string | null;
    session_hall: string | null;
    title: string | null;
    case_number: string | null;
    court: string | null;
    case_type: string | null;
    plaintiff: string | null;
    defendant: string | null;
    circuit_number: string | null;
    plaintiff_role: string | null;
    defendant_role: string | null;
    cases: SessionCaseEmbed | SessionCaseEmbed[] | null;
}

interface CalendarTabProps {
    cases: MappedCase[];
    clients: MappedClient[];
    onOpenCase: (c: MappedCase) => void;
    onOpenStandalone: (s: CalendarSessionRow) => void;
}

function CalendarTab({ cases, clients, onOpenCase, onOpenStandalone }: CalendarTabProps) {
    const today = new Date();
    const [viewYear,  setViewYear]  = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [allSessions, setAllSessions] = useState<CalendarSessionRow[]>([]);
    const [loading, setLoading]         = useState(true);
    const [selectedDay, setSelectedDay] = useState<number|null>(null);

    const todayStr = toDateStr(today);

    const YEARS = Array.from({ length: 21 }, (_: unknown, i: number) => 2020 + i); // 2020 → 2040

    useEffect(() => {
        setLoading(true);
        const mm   = String(viewMonth+1).padStart(2,'0');
        const last = new Date(viewYear, viewMonth+1, 0).getDate();
        db.from('case_sessions')
          .select('id,session_date,case_id,description,result,next_action,session_time,session_floor,session_hall,title,case_number,court,case_type,plaintiff,defendant,circuit_number,plaintiff_role,defendant_role,cases(id,title,plaintiff,defendant,court_name,case_type,case_number_official,client_id)')
          .gte('session_date', `${viewYear}-${mm}-01`)
          .lte('session_date', `${viewYear}-${mm}-${String(last).padStart(2,'0')}`)
          .then(({ data }) => {
              setAllSessions((data || []) as unknown as CalendarSessionRow[]); setLoading(false); setSelectedDay(null);
          });
    }, [viewYear, viewMonth]);

    const firstDay  = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMon = new Date(viewYear, viewMonth+1, 0).getDate();

    const sessionsMap: Record<string, CalendarSessionRow[]> = {};
    allSessions.forEach((s: CalendarSessionRow) => {
        const key = s.session_date as string;
        if (!sessionsMap[key]) sessionsMap[key] = [];
        sessionsMap[key].push(s);
    });
    const conflictDays = new Set(Object.keys(sessionsMap).filter((d: string) => sessionsMap[d].length > 1));

    const selectedDateStr = selectedDay
        ? `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}`
        : null;
    const daysSessions = selectedDateStr ? (sessionsMap[selectedDateStr]||[]) : [];

    const handleExportToGoogle = (s: CalendarSessionRow, e: React.MouseEvent) => {
        e.stopPropagation();
        const lc = cases.find((c: MappedCase) => c.id === s.case_id);
        const lcl = lc ? clients.find((cl: MappedClient) => cl.id === lc.client_id) : null;
        exportSessionToGoogleCalendar(s, lc?.title||'جلسة قانونية', lc?.court||'', lcl?.full_name||'');
        toast('🗓 جاري الفتح في Google Calendar...');
    };

    return React.createElement('div', { className: "space-y-2 fade-in" },

        // ── هيدر: فلتر السنة والشهر + أيقونة تقويم ──
        React.createElement('div', { className: "flex items-center gap-2" },
            // dropdown الشهر
            React.createElement('select', {
                value: viewMonth,
                onChange: (e: React.ChangeEvent<HTMLSelectElement>) => { setViewMonth(Number(e.target.value)); setSelectedDay(null); },
                className: "flex-1 text-[10px] font-black rounded-xl px-2 py-2 border",
                style: { background: '#0a1220', borderColor: 'rgba(255,255,255,0.1)', color: '#D4AF37' }
            }, MONTHS_AR2.map((m: string, i: number) => React.createElement('option', { key: i, value: i }, m))),
            // dropdown السنة
            React.createElement('select', {
                value: viewYear,
                onChange: (e: React.ChangeEvent<HTMLSelectElement>) => { setViewYear(Number(e.target.value)); setSelectedDay(null); },
                className: "text-[10px] font-black rounded-xl px-2 py-2 border",
                style: { background: '#0a1220', borderColor: 'rgba(255,255,255,0.1)', color: '#D4AF37', minWidth: '68px' }
            }, YEARS.map((y: number) => React.createElement('option', { key: y, value: y }, y))),
            // أيقونة الربط بتقويم الهاتف
            React.createElement('button', {
                onClick: () => {
                    db.from('case_sessions').select('id,session_date,case_id,description,result,next_action,title,case_number,court,case_type,plaintiff,defendant,cases(id,title,plaintiff,defendant,court_name,case_type,case_number_official,client_id)')
                      .then(({ data }) => {
                          const sessions = (data || []) as unknown as CalendarSessionRow[];
                          if (!sessions.length) { toast('لا توجد جلسات', true); return; }
                          const up = sessions.filter((s: CalendarSessionRow) => (s.session_date as string) >= todayStr).sort((a: CalendarSessionRow,b: CalendarSessionRow) => (a.session_date as string).localeCompare(b.session_date as string));
                          if (!up.length) { toast('لا توجد جلسات قادمة', true); return; }
                          const lc = cases.find((c: MappedCase) => c.id === up[0].case_id);
                          const lcl = lc ? clients.find((cl: MappedClient) => cl.id === lc.client_id) : null;
                          exportSessionToGoogleCalendar(up[0], lc?.title||'جلسة', lc?.court||'', lcl?.full_name||'');
                          toast('🗓 تم فتح أقرب جلسة في Google Calendar');
                      });
                },
                title: "أضف أقرب جلسة لتقويم الهاتف",
                className: "w-9 h-9 shrink-0 flex items-center justify-center rounded-xl text-base active:scale-90 transition-all",
                style: { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80' }
            }, "🗓")
        ),

        // عدد الجلسات
        React.createElement('p', { className: "text-[9px] text-slate-500 px-1" },
            loading ? "جاري التحميل..." : `${allSessions.length} جلسة — ${MONTHS_AR2[viewMonth]} ${viewYear}`
        ),

        // شبكة التقويم
        React.createElement('div', { className: "bg-premium-card border border-white/5 rounded-2xl overflow-hidden shadow-premium-shadow" },
            React.createElement('div', { className: "grid grid-cols-7 border-b border-white/5" },
                DAYS_FULL.map((d: string) => React.createElement('div', { key: d, className: "py-2 text-center text-[8px] font-black text-slate-500" }, d))
            ),
            React.createElement('div', { className: "grid grid-cols-7" },
                Array.from({ length: firstDay }).map((_: unknown,i: number) => React.createElement('div', { key:'e'+i, className:"aspect-square" })),
                Array.from({ length: daysInMon }, (_: unknown,i: number) => i+1).map((d: number) => {
                    const dStr = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                    const hasSess    = sessionsMap[dStr]?.length > 0;
                    const isConflict = conflictDays.has(dStr);
                    const isToday    = dStr === todayStr;
                    const isSel      = selectedDay === d;
                    return React.createElement('button', {
                        key: d, onClick: () => setSelectedDay(isSel ? null : d),
                        className: `relative aspect-square flex flex-col items-center justify-center gap-0.5 transition-all active:scale-90 ${isSel?'bg-premium-gold/15':'hover:bg-white/5'} ${isConflict?'ring-1 ring-inset ring-red-500/50':''}`
                    },
                        isConflict && React.createElement('div', { className: "absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" }),
                        React.createElement('span', { className: `text-[11px] font-black ${isConflict?'text-red-400':isToday?'text-premium-gold':isSel?'text-premium-gold':'text-slate-300'}` }, d),
                        hasSess && React.createElement('div', { className: "flex gap-0.5 justify-center" },
                            sessionsMap[dStr].slice(0,3).map((_: CalendarSessionRow,i: number) =>
                                React.createElement('div', { key:i, className:`w-1 h-1 rounded-full ${isConflict?'bg-red-400':'bg-premium-gold'}` })
                            )
                        ),
                        isToday && !hasSess && React.createElement('div', { className: "w-1 h-1 rounded-full bg-premium-gold/50" })
                    );
                })
            )
        ),

        // تفاصيل اليوم المختار
        selectedDay && React.createElement('div', { className: "space-y-2 fade-in" },
            React.createElement('div', { className: "flex items-center gap-2 px-1" },
                React.createElement('span', { className: "w-1 h-3 bg-premium-gold rounded-full" }),
                React.createElement('p', { className: "text-xs font-black text-white" }, `جلسات ${selectedDay} ${MONTHS_AR2[viewMonth]} ${viewYear}`),
                React.createElement('span', { className: "text-[9px] text-slate-500" }, `${daysSessions.length} جلسة`),
                daysSessions.length > 1 && React.createElement('span', {
                    className: "text-[8px] px-1.5 py-0.5 rounded-full font-black",
                    style: { background: 'rgba(239,68,68,0.15)', color: '#f87171' }
                }, "⚠️ تعارض")
            ),
            daysSessions.length === 0
                ? React.createElement('div', { className: "bg-premium-card border border-white/5 rounded-xl p-4 text-center text-slate-500 text-xs" }, "لا توجد جلسات في هذا اليوم")
                : daysSessions.map((s: CalendarSessionRow) =>
                    React.createElement(SessionCard, { key: s.id, s, cases, clients, onOpenCase, onOpenStandalone, onGoogleExport: handleExportToGoogle })
                )
        )
    );
}

export default CalendarTab;
