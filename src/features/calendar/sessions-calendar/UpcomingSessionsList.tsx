import React, { useState, useEffect } from 'react';
import { I } from '../../../constants';
import SessionUpdateModal from './SessionUpdateModal';
import type { MappedCase, MappedClient } from '../../../hooks/useAppData';
import type { SessionCaseEmbed } from '@/shared/hooks/useDashboardFeed';
import type { CaseSessionRow } from '../../../types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../database.types';

interface UpcomingSessionsListProps {
    db: SupabaseClient<Database>;
    cases: MappedCase[];
    clients: MappedClient[];
    onOpenCase?: (c: MappedCase) => void;
}

// شكل عنصر اليوم اللي بيتبني في buildDays() — 7 أيام من النهارده.
interface DayInfo {
    dateStr: string;
    dayName: string;
    day: number;
    month: string;
    isFriday: boolean;
    index: number;
}

// شكل صف الجلسة اللي بيترجع من select الأول (فيه cases المدمجة) — نفس أعمدة
// case_sessions المطلوبة فعليًا هنا (`id,session_date,session_time,session_floor,
// session_hall,case_id,description,result,next_action`)، بالإضافة للعلاقة المدمجة
// `cases`، بإعادة استخدام SessionCaseEmbed الموجود بالفعل في useDashboardFeed.ts
// (نفس شكل الـ join `cases(id,title,plaintiff,defendant,court_name,case_type,
// case_number_official,client_id)` بالظبط).
interface UpcomingSessionRow {
    id: string;
    session_date: string | null;
    session_time: string | null;
    session_floor: string | null;
    session_hall: string | null;
    case_id: string | null;
    description: string | null;
    result: string | null;
    next_action: string | null;
    cases: SessionCaseEmbed | SessionCaseEmbed[] | null;
}

// شكل الصف المصغّر اللي بيترجع من الاستعلام التاني (بناء latestSessionMap) —
// بس الأعمدة الثلاثة المطلوبة فعليًا في select ده.
interface LatestSessionRow {
    id: string;
    case_id: string | null;
    session_date: string | null;
}

// linkedCase بييجي فعليًا من مصدرين مختلفين الشكل بالظبط زي DashboardTab.tsx —
// إما cases.find(...) (شكله MappedCase) أو الكائن المدمج s.cases (شكله
// SessionCaseEmbed). الكود بيتعامل مع الاتنين بنفس المتغير عن طريق ?./||، وده
// سلوك مقصود مش باگ (كل مصدر بيغطي حالة مختلفة).
type LinkedCaseLike = Partial<MappedCase> & Partial<SessionCaseEmbed>;

function UpcomingSessionsList({db, cases, clients, onOpenCase}: UpcomingSessionsListProps){
    const [sessions, setSessions] = useState<UpcomingSessionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [latestSessionMap, setLatestSessionMap] = useState<Record<string, string>>({});
    const [sessionUpdateTarget, setSessionUpdateTarget] = useState<UpcomingSessionRow | null>(null);
    const [openDayIndex, setOpenDayIndex] = useState<number | null>(null);

    const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
    const DAYS_AR = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];

    const fmtDate = (d: Date) => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');

    // بناء 7 أيام من النهارده
    const buildDays = (): DayInfo[] => {
        const days: DayInfo[] = [];
        for(let i=0; i<7; i++){
            const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+i);
            days.push({
                dateStr: fmtDate(d),
                dayName: i===0?'اليوم': i===1?'غداً': DAYS_AR[d.getDay()],
                day: d.getDate(),
                month: MONTHS_AR[d.getMonth()],
                isFriday: d.getDay()===5,
                index: i
            });
        }
        return days;
    };

    const days = buildDays();
    const todayStr = days[0].dateStr;
    const endStr   = days[6].dateStr;

    const fetchSessions = () => {
        db.from('case_sessions')
          .select('id,session_date,session_time,session_floor,session_hall,case_id,description,result,next_action,cases(id,title,plaintiff,defendant,court_name,case_type,case_number_official,client_id)')
          .gte('session_date', todayStr)
          .lte('session_date', endStr)
          .order('session_date',{ascending:true})
          .then(({data})=>{
              setSessions((data || []) as unknown as UpcomingSessionRow[]);
              db.from('case_sessions')
                .select('id,case_id,session_date')
                .order('session_date',{ascending:false})
                .then(({data:all})=>{
                    const allRows = (all || []) as unknown as LatestSessionRow[];
                    const map: Record<string, string> = {};
                    allRows.forEach((s: LatestSessionRow) =>{ if(s.case_id && !map[s.case_id]) map[s.case_id]=s.id; });
                    setLatestSessionMap(map);
                    setLoading(false);
                });
          });
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(()=>{ fetchSessions(); },[]);

    if(loading) return React.createElement('div',{className:"flex items-center justify-center py-8 gap-2 text-slate-500 text-xs"},React.createElement(I.Spin),"جاري التحميل...");

    const sessionsByDate: Record<string, UpcomingSessionRow[]> = {};
    sessions.forEach((s: UpcomingSessionRow) =>{
        const key = s.session_date as string;
        if(!sessionsByDate[key]) sessionsByDate[key]=[];
        sessionsByDate[key].push(s);
    });

    const urgencyStyle = (dateStr: string, count: number) => {
        const isToday = dateStr===todayStr;
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
        const isTomorrow = dateStr===fmtDate(tomorrow);
        // تصميم موحد لكل الكروت — النهارده وغداً border أوضح قليلاً بس
        const borderColor = (isToday||isTomorrow) ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)';
        return {
            bg:     'rgba(255,255,255,0.03)',
            border: borderColor,
            text:   '#94a3b8',
            badge:  '#475569'
        };
    };

    return React.createElement('div',{className:"space-y-2"},
        sessionUpdateTarget && React.createElement(SessionUpdateModal, {
            session: sessionUpdateTarget as unknown as CaseSessionRow,
            caseData: (cases.find((c: MappedCase) =>c.id===sessionUpdateTarget.case_id)||{id:sessionUpdateTarget.case_id,title:'—'}) as unknown as MappedCase,
            db, onClose:()=>setSessionUpdateTarget(null), onDone:()=>fetchSessions()
        }),

        days.map(({dateStr, dayName, day, month, isFriday, index}: DayInfo)=>{
            const daySessions = sessionsByDate[dateStr]||[];
            const count = daySessions.length;
            const isOpen = openDayIndex===index;
            const st = urgencyStyle(dateStr, count);

            return React.createElement('div',{key:dateStr, className:"rounded-2xl overflow-hidden", style:{border:'1px solid '+st.border}},

                // ─ هيدر الكارت ─
                React.createElement('div',{
                    className:"flex items-stretch gap-0 cursor-pointer active:scale-[0.99] transition-all",
                    style:{background:st.bg},
                    onClick:()=>setOpenDayIndex(isOpen?null:index)
                },
                    // عمود التاريخ
                    React.createElement('div',{
                        className:"flex flex-col items-center justify-center px-3 py-3 shrink-0 min-w-[58px]",
                        style:{borderLeft:'1px solid '+st.border}
                    },
                        React.createElement('p',{className:"text-[8px] font-black",style:{color:st.text}},dayName),
                        React.createElement('p',{className:"text-xl font-black text-white leading-none mt-0.5"},day),
                        React.createElement('p',{className:"text-[8px] text-slate-500 mt-0.5"},month)
                    ),
                    // محتوى الهيدر
                    React.createElement('div',{className:"flex-1 flex items-center justify-between px-3 py-3"},
                        React.createElement('div',{className:"flex items-center gap-2"},
                            count>0
                                ? React.createElement('span',{
                                    className:"text-[10px] font-black px-2 py-0.5 rounded-full",
                                    style:{background:'rgba(255,255,255,0.08)',color:st.text}
                                  },count===1?'جلسة واحدة':`${count} جلسات`)
                                : React.createElement('span',{className:"text-[10px] text-slate-600 font-medium"},
                                    isFriday?'إجازة رسمية':'لا توجد جلسات'
                                )
                        ),
                        React.createElement('span',{
                            className:"text-slate-500 text-[10px] transition-transform duration-200",
                            style:{transform:isOpen?'rotate(180deg)':'rotate(0deg)'}
                        },"▼")
                    )
                ),

                // ─ جلسات اليوم (تنبسط لما تضغط) ─
                isOpen && React.createElement('div',{className:"border-t space-y-0 divide-y",style:{borderColor:st.border,dividColor:st.border}},
                    count===0
                        ? React.createElement('div',{className:"py-4 text-center"},
                            React.createElement('p',{className:"text-[11px] text-slate-600"},isFriday?'🕌 يوم إجازة':'📭 لا توجد جلسات في هذا اليوم')
                          )
                        : daySessions.map((s: UpcomingSessionRow) =>{
                            const linkedCase = ((Array.isArray(s.cases) ? s.cases[0] : s.cases) || cases.find((c: MappedCase) =>c.id===s.case_id)) as LinkedCaseLike | undefined;
                            const linkedClient = linkedCase ? clients.find((cl: MappedClient) =>cl.id===linkedCase.client_id) : null;
                            const isLatest = latestSessionMap[s.case_id as string]===s.id;

                            return React.createElement('div',{
                                key:s.id,
                                className:"flex items-stretch gap-0 cursor-pointer active:bg-white/5 transition-all",
                                style:{background:'rgba(255,255,255,0.02)'},
                                onClick:()=>{ if (isLatest) { setSessionUpdateTarget(s); } else if (linkedCase) { onOpenCase?.(linkedCase as MappedCase); } }
                            },
                                // شريط جانبي
                                React.createElement('div',{className:"w-1 shrink-0",style:{background:st.badge}}),
                                // محتوى
                                React.createElement('div',{className:"flex-1 p-3 space-y-1"},
                                    React.createElement('div',{className:"flex items-start justify-between gap-2"},
                                        React.createElement('p',{className:"text-[11px] font-black text-white leading-tight flex-1"},
                                            (linkedCase?.title)||(s as unknown as {title?: string}).title||((linkedCase?.plaintiff&&linkedCase?.defendant)?linkedCase.plaintiff+' ضد '+linkedCase.defendant:null)||s.description||'— جلسة مستقلة —'
                                        ),
                                        isLatest
                                            ? React.createElement('span',{
                                                className:"text-[8px] px-2 py-0.5 rounded-full font-black shrink-0",
                                                style:{background:'rgba(212,175,55,0.15)',color:'#D4AF37',border:'1px solid rgba(212,175,55,0.3)'}
                                              },"⚡ تحديث")
                                            : s.session_time && React.createElement('span',{
                                                className:"text-[8px] px-1.5 py-0.5 rounded-full font-black shrink-0",
                                                style:{background:s.session_time==='صباحي'?'rgba(251,191,36,0.15)':'rgba(99,102,241,0.15)',color:s.session_time==='صباحي'?'#fbbf24':'#818cf8'}
                                              },s.session_time==='صباحي'?'🌅 ص':'🌆 م')
                                    ),
                                    React.createElement('div',{className:"flex items-center gap-3 flex-wrap"},
                                        (linkedCase?.court_name||linkedCase?.court) && React.createElement('span',{className:"text-[9px] text-slate-400"},"🏛 "+(linkedCase?.court_name||linkedCase?.court)),
                                        (s.session_floor||s.session_hall) && React.createElement('span',{className:"text-[9px] font-bold",style:{color:'#38bdf8'}},"📍 "+(s.session_floor?'ط'+s.session_floor+' ':'')+(s.session_hall?'ق'+s.session_hall:'')),
                                        linkedClient && React.createElement('span',{className:"text-[9px] text-emerald-400"},"👤 "+linkedClient.full_name)
                                    ),
                                    (linkedCase?.case_type||linkedCase?.type) && React.createElement('span',{className:"inline-block text-[8px] px-2 py-0.5 rounded-full bg-white/5 text-slate-500 font-bold"},linkedCase?.case_type||linkedCase?.type)
                                )
                            );
                          })
                )
            );
        })
    );
}

export default UpcomingSessionsList;
