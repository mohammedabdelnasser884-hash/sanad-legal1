import React, { useState } from 'react';
import { I } from '../../constants';
import { PartiesLine } from '@/shared/ui/PartiesLine';
import { formatTime, ServiceStatus } from '../../systemHealth';
import { db } from '../../supabaseClient';
import StandaloneSessionDetailModal from '@/features/calendar/sessions-calendar/StandaloneSessionDetailModal';
import type { ProfileRow } from '../../types';
import type { MappedCase, MappedClient } from '../../hooks/useAppData';
import type { SessionFeedItem, TaskFeedItem, SessionCaseEmbed } from '@/shared/hooks/useDashboardFeed';
import type { CaseSessionRow } from '../../types';
import type { TabName } from '../../useNavigation';

// linkedCase بييجي من مصدرين مختلفين فعليًا في الكود تحت: إما `cases.find(...)` (شكله MappedCase)
// أو الكائن المدمج `s.cases` جوه استعلام الجلسة (شكله SessionCaseEmbed) — الكود بيتعامل مع
// الاتنين بنفس المتغير بالضبط عن طريق `?.`/`||`، فالنوع بيوثّق الاستخدامين الحقيقيين
// (Partial لأن أي حقل ممكن يكون مش موجود حسب المصدر، بالظبط زي وقت التشغيل).
type LinkedCaseLike = Partial<MappedCase> & Partial<SessionCaseEmbed>;

const fmtDate = (d: Date) =>
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

interface DashboardTabProps {
  profile: ProfileRow | null;
  cases: MappedCase[];
  clients: MappedClient[];
  todaySessions: SessionFeedItem[];
  upcomingSessions: SessionFeedItem[];
  missedSessions: SessionFeedItem[];
  upcomingTasks: TaskFeedItem[];
  missedTasks: TaskFeedItem[];
  loadingUrgent: boolean;
  todayOpen: boolean;
  setTodayOpen: (v: boolean | ((o: boolean) => boolean)) => void;
  upcomingOpen: boolean;
  setUpcomingOpen: (v: boolean | ((o: boolean) => boolean)) => void;
  upcomingTasksOpen: boolean;
  setUpcomingTasksOpen: (v: boolean | ((o: boolean) => boolean)) => void;
  setSelectedCase: (c: MappedCase, initialTab?: string) => void;
  setShowCaseModal: (v: boolean) => void;
  setShowClientModal: (v: boolean) => void;
  setShowNewSessionModal: (v: boolean) => void;
  setTab: (t: TabName) => void;
  setRemindersInitialFilter: (f: string | null) => void;
  setSessionsInitialTab: (t: 'month'|'calendar'|'missed'|null) => void;
  dbOnline: boolean | null;
  healthErrors: ServiceStatus[];
  setHealthErrors: (v: ServiceStatus[] | ((prev: ServiceStatus[]) => ServiceStatus[])) => void;
  fetchTodaySessions: () => void | Promise<void>;
  fetchUpcomingSessions: () => void | Promise<void>;
  fetchMissedSessions: () => void | Promise<void>;
}

function DashboardTab({
  profile, cases, clients,
  todaySessions, upcomingSessions, missedSessions,
  upcomingTasks, missedTasks, loadingUrgent,
  todayOpen, setTodayOpen,
  upcomingOpen, setUpcomingOpen,
  upcomingTasksOpen, setUpcomingTasksOpen,
  setSelectedCase, setShowCaseModal, setShowClientModal, setShowNewSessionModal,
  setTab, setRemindersInitialFilter, setSessionsInitialTab,
  dbOnline, healthErrors, setHealthErrors,
  fetchTodaySessions, fetchUpcomingSessions, fetchMissedSessions,
}: DashboardTabProps) {

    // ── جلسة مستقلة مفتوحة حالياً (لعرض المودال) ──
    const [standaloneTarget, setStandaloneTarget] = useState<SessionFeedItem | null>(null);

    // بعد أي تعديل/تحديث/حذف على جلسة مستقلة، نعيد تحميل القوائم الثلاثة
    // لأننا ما بنعرفش مسبقاً الجلسة كانت في أي قائمة (اليوم/القادم/الفائتة)
    const refreshAllSessionLists = () => {
        fetchTodaySessions?.();
        fetchUpcomingSessions?.();
        fetchMissedSessions?.();
    };

    const buildSessionCard = (
        s: SessionFeedItem,
        linkedCase: LinkedCaseLike | null | undefined,
        linkedClient: MappedClient | null | undefined,
        accentColor: string,
        accentBg: string,
        accentBorder: string,
        badgeLabel: string | null = null,
        onClickOverride: (() => void) | null = null
    ) => {
        const MONTHS = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
        const d = new Date((s.session_date as string)+'T00:00:00');
        const dayNum = d.getDate();
        const monthName = MONTHS[d.getMonth()+1];

        // جلسة مستقلة (case_id = null) — نعرض بيانات الجلسة نفسها
        const isStandalone = !s.case_id;
        const handleClick = onClickOverride || (linkedCase ? ()=>{ setSelectedCase(linkedCase as MappedCase, 'timeline'); } : (isStandalone ? ()=>{ setStandaloneTarget(s); } : null));

        const displayPlaintiff = linkedCase?.plaintiff || (Array.isArray(s.cases) ? s.cases[0]?.plaintiff : s.cases?.plaintiff) || (isStandalone ? s.plaintiff : null);
        const displayDefendant = linkedCase?.defendant || (Array.isArray(s.cases) ? s.cases[0]?.defendant : s.cases?.defendant) || (isStandalone ? s.defendant : null);
        const displayTitle     = linkedCase?.title || (Array.isArray(s.cases) ? s.cases[0]?.title : s.cases?.title) || (isStandalone ? (s.title || s.case_number || null) : null);
        const displayCourt     = linkedCase?.court_name || linkedCase?.court || (Array.isArray(s.cases) ? s.cases[0]?.court_name : s.cases?.court_name) || (isStandalone ? s.court : null);
        const fallbackLabel    = displayTitle || linkedCase?.title || (isStandalone ? '🗓 جلسة مستقلة' : linkedCase?.number || '— جلسة —');

        return React.createElement('div',{
            key:s.id,
            onClick: handleClick,
            className:'rounded-xl overflow-hidden ' + (handleClick ? 'cursor-pointer active:scale-[0.98] transition-all' : ''),
            style:{background:accentBg, border:'1px solid '+accentBorder}
        },
            React.createElement('div',{className:'flex items-center gap-2.5 px-2.5 py-2'},
                // التاريخ
                React.createElement('div',{
                    className:'flex flex-col items-center justify-center shrink-0 w-10',
                    style:{borderLeft:'1px solid '+accentBorder, paddingLeft:'10px'}
                },
                    React.createElement('p',{className:'text-[16px] font-black text-white leading-none'},dayNum),
                    React.createElement('p',{className:'text-[8px] font-bold',style:{color:accentColor}},monthName)
                ),
                // المحتوى
                React.createElement('div',{className:'flex-1 min-w-0'},
                    React.createElement('div',{className:'flex items-center justify-between gap-1'},
                        React.createElement(PartiesLine,{
                            plaintiff: displayPlaintiff, defendant: displayDefendant,
                            fallback: fallbackLabel,
                            className: 'text-[11px] font-black text-white leading-tight flex-1 truncate'
                        }),
                        badgeLabel && React.createElement('span',{
                            className:'text-[8px] px-1.5 py-0.5 rounded-full font-black shrink-0',
                            style:{background:'rgba(212,175,55,0.15)',color:'#D4AF37'}
                        },badgeLabel)
                    ),
                    React.createElement('div',{className:'flex items-center gap-2 mt-0.5 flex-wrap'},
                        displayCourt&&displayCourt!=='—'&&React.createElement('span',{className:'text-[9px] text-slate-400'},'🏛 '+displayCourt),
                        linkedClient&&React.createElement('span',{className:'text-[9px] text-emerald-400'},'👤 '+linkedClient.full_name),
                        s.next_action&&React.createElement('span',{className:'text-[9px] text-amber-400/80 truncate'},'⚡ '+s.next_action)
                    )
                )
            )
        );
    };

    // ── helper: بناء كارت مهمة ──
    const buildTaskCard = (
        r: TaskFeedItem,
        accentColor: string,
        accentBg: string,
        accentBorder: string,
        badgeLabel: string | null = null,
        targetFilter: string | null = null
    ) => {
        return React.createElement('div',{
            key: r.id,
            onClick: ()=>{ setRemindersInitialFilter(targetFilter); setTab('reminders'); },
            className:'rounded-xl overflow-hidden cursor-pointer active:scale-[0.98] transition-all',
            style:{background:accentBg, border:'1px solid '+accentBorder}
        },
            React.createElement('div',{className:'flex items-center gap-2.5 px-2.5 py-2'},
                // أيقونة + تاريخ
                React.createElement('div',{
                    className:'flex flex-col items-center justify-center shrink-0 w-10',
                    style:{borderLeft:'1px solid '+accentBorder, paddingLeft:'10px'}
                },
                    React.createElement('span',{className:'text-[12px]'},'📋'),
                    React.createElement('p',{className:'text-[8px] font-bold',style:{color:accentColor}},
                        (()=>{const d=new Date((r.due_date as string)+'T00:00:00');return d.getDate()+'/'+( d.getMonth()+1);})()
                    )
                ),
                // المحتوى
                React.createElement('div',{className:'flex-1 min-w-0'},
                    React.createElement('div',{className:'flex items-center justify-between gap-1'},
                        React.createElement('p',{className:'text-[11px] font-black text-white leading-tight flex-1 truncate'},r.title),
                        badgeLabel && React.createElement('span',{
                            className:'text-[8px] px-1.5 py-0.5 rounded-full font-black shrink-0',
                            style:{background:'rgba(167,139,250,0.15)',color:'#a78bfa'}
                        },badgeLabel)
                    ),
                    r.notes&&React.createElement('p',{className:'text-[9px] text-slate-400 truncate mt-0.5'},r.notes)
                )
            )
        );
    };

    // ── تحية شخصية بالوقت ──
    const Dashboard=React.createElement('div',{className:"space-y-3 fade-in"},

        // ── مؤشر الاتصال ──
        React.createElement('div',{className:"flex items-center justify-end gap-1.5 px-1"},
            React.createElement('span',{
                className:`w-1.5 h-1.5 rounded-full ${dbOnline===null?'bg-slate-500 animate-pulse':dbOnline?'bg-emerald-400 animate-pulse':'bg-rose-500'}`
            }),
            React.createElement('span',{
                className:`text-[9px] font-bold ${dbOnline===null?'text-slate-500':dbOnline?'text-emerald-400':'text-rose-400'}`
            }, dbOnline===null?'جاري الاتصال...':dbOnline?'متصل':'غير متصل')
        ),

        // ── بانر أخطاء الخدمات ──
        healthErrors.length > 0 && React.createElement('div',{className:"space-y-2"},
            healthErrors.map((err: ServiceStatus) =>
                React.createElement('div',{
                    key: err.key,
                    className:"rounded-2xl px-4 py-3 flex items-start gap-3",
                    style:{background:'rgba(239,68,68,0.07)',border:'1px solid rgba(239,68,68,0.22)'}
                },
                    React.createElement('div',{
                        className:"w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                        style:{background:'rgba(239,68,68,0.12)'}
                    },
                        React.createElement('svg',{xmlns:'http://www.w3.org/2000/svg',className:'w-4 h-4 text-rose-400',fill:'none',viewBox:'0 0 24 24',stroke:'currentColor',strokeWidth:2.5},
                            React.createElement('path',{strokeLinecap:'round',strokeLinejoin:'round',d:'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z'})
                        )
                    ),
                    React.createElement('div',{className:"flex-1 min-w-0"},
                        React.createElement('div',{className:"flex items-center gap-2 flex-wrap"},
                            React.createElement('span',{className:"text-[11px] font-black text-rose-400"},
                                `⚠️ خلل في: ${err.label}`
                            ),
                            err.lastError ? React.createElement('span',{
                                className:"text-[9px] text-slate-500 font-medium"
                            }, formatTime(err.lastError)) : null
                        ),
                        React.createElement('p',{className:"text-[10px] text-slate-400 mt-1 leading-relaxed"},
                            err.errorMsg
                        ),
                        err.lastSuccess ? React.createElement('p',{
                            className:"text-[9px] text-slate-600 mt-1"
                        }, `آخر عمل ناجح: ${formatTime(err.lastSuccess)}`) : null
                    ),
                    React.createElement('button',{
                        onClick:()=>{ try { const raw=localStorage.getItem("sanad_health"); if(raw){const all=JSON.parse(raw); if(all[err.key]){all[err.key].status="unknown";all[err.key].errorMsg=null;} localStorage.setItem("sanad_health",JSON.stringify(all));} }catch{ /* ignore */ } setHealthErrors((prev: ServiceStatus[]) => prev.filter((e: ServiceStatus) => e.key !== err.key)); },
                        className:"text-slate-600 hover:text-slate-400 transition-colors shrink-0 mt-0.5 text-base leading-none"
                    },"✕")
                )
            )
        ),

        // ── Quick Actions ──
        React.createElement('div',{className:"grid grid-cols-4 gap-2"},
            React.createElement('button',{
                onClick:()=>setShowNewSessionModal(true),
                className:"flex flex-col items-center gap-1.5 py-3 rounded-2xl active:scale-95 transition-all",
                style:{background:'rgba(56,189,248,0.07)', border:'1px solid rgba(56,189,248,0.20)'}
            },
                React.createElement('div',{className:"w-8 h-8 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400"},
                    React.createElement(I.CalGrid)
                ),
                React.createElement('span',{className:"text-[9px] font-black text-sky-400"},"إضافة جلسة")
            ),
            React.createElement('button',{
                onClick:()=>setShowCaseModal(true),
                className:"flex flex-col items-center gap-1.5 py-3 rounded-2xl active:scale-95 transition-all",
                style:{background:'rgba(212,175,55,0.09)', border:'1px solid rgba(212,175,55,0.20)'}
            },
                React.createElement('div',{className:"w-8 h-8 rounded-xl flex items-center justify-center text-premium-gold",style:{background:'rgba(212,175,55,0.15)'}},
                    React.createElement(I.Plus)
                ),
                React.createElement('span',{className:"text-[9px] font-black",style:{color:'var(--gold)'}},"تقييد قضية")
            ),
            React.createElement('button',{
                onClick:()=>setShowClientModal(true),
                className:"flex flex-col items-center gap-1.5 py-3 rounded-2xl active:scale-95 transition-all",
                style:{background:'rgba(52,211,153,0.07)', border:'1px solid rgba(52,211,153,0.18)'}
            },
                React.createElement('div',{className:"w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400"},
                    React.createElement(I.Person)
                ),
                React.createElement('span',{className:"text-[9px] font-black text-emerald-400"},"إضافة موكل")
            ),
            React.createElement('button',{
                onClick:()=>{setSessionsInitialTab(null);setTab('calendar');},
                className:"flex flex-col items-center gap-1.5 py-3 rounded-2xl active:scale-95 transition-all",
                style:{background:'rgba(167,139,250,0.07)', border:'1px solid rgba(167,139,250,0.18)'}
            },
                React.createElement('div',{className:"w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400"},
                    React.createElement(I.CalGrid)
                ),
                React.createElement('span',{className:"text-[9px] font-black text-purple-400"},"التقويم")
            )
        ),

        // ════════════════════════════════════
        //  بطاقة ١ — 🔴 يحتاج تدخل فوري
        //  ﴾جلسات فائتة + مهام متأخرة مجمعة﴿
        // ════════════════════════════════════
        (missedSessions.length > 0 || missedTasks.length > 0) && React.createElement('div',{className:"space-y-2"},
            React.createElement('div',{
                className:"flex items-center gap-2 px-3 py-2.5 rounded-2xl",
                style:{
                    background:'rgba(239,68,68,0.06)',
                    border:'1px solid rgba(239,68,68,0.18)',
                    borderInlineStart:'4px solid #ef4444', // ── خط جانبي مميز للون التنبيه الأحمر
                }
            },
                React.createElement('div',{
                    className:"w-7 h-7 rounded-xl flex items-center justify-center text-sm shrink-0",
                    style:{background:'rgba(239,68,68,0.18)'}
                },"🔴"),
                React.createElement('span',{className:"w-2 h-2 rounded-full bg-rose-500 animate-pulse"}),
                React.createElement('h3',{className:"text-xs font-black text-rose-400"},
                    `يحتاج تدخل فوري — ${missedSessions.length + missedTasks.length} عنصر`
                ),
                React.createElement('div',{className:"mr-auto flex gap-2"},
                    missedSessions.length > 0 && React.createElement('span',{
                        className:"text-[9px] px-2 py-0.5 rounded-full font-black",
                        style:{background:'rgba(239,68,68,0.15)',color:'#fca5a5',border:'1px solid rgba(239,68,68,0.25)'}
                    },`${missedSessions.length} جلسة`),
                    missedTasks.length > 0 && React.createElement('span',{
                        className:"text-[9px] px-2 py-0.5 rounded-full font-black",
                        style:{background:'rgba(239,68,68,0.15)',color:'#fca5a5',border:'1px solid rgba(239,68,68,0.25)'}
                    },`${missedTasks.length} مهمة`)
                )
            ),
            missedSessions.slice(0,2).map((s: SessionFeedItem) => {
                const linkedCase = ((Array.isArray(s.cases) ? s.cases[0] : s.cases) || cases.find((c: MappedCase) =>c.id===s.case_id)) as LinkedCaseLike | undefined;
                const linkedClient = linkedCase ? clients.find((cl: MappedClient) =>cl.id===linkedCase.client_id) : null;
                const daysAgo = Math.round((new Date().getTime()-new Date((s.session_date as string)+'T00:00:00').getTime())/(1000*60*60*24));
                const agoLabel = daysAgo===1?'أمس':`منذ ${daysAgo} يوم`;
                return buildSessionCard(s, linkedCase, linkedClient,
                    '#f87171','linear-gradient(135deg,rgba(239,68,68,0.08),rgba(239,68,68,0.03))','rgba(239,68,68,0.25)',agoLabel);
            }),
            missedTasks.slice(0,2).map((r: TaskFeedItem) => {
                const daysAgo = Math.round((new Date().getTime()-new Date((r.due_date as string)+'T00:00:00').getTime())/(1000*60*60*24));
                const agoLabel = daysAgo===1?'أمس':`منذ ${daysAgo} يوم`;
                return buildTaskCard(r,'#f87171','linear-gradient(135deg,rgba(239,68,68,0.08),rgba(239,68,68,0.03))','rgba(239,68,68,0.25)',agoLabel,'overdue');
            }),
            (missedSessions.length > 2 || missedTasks.length > 2) && React.createElement('div',{className:"flex gap-2"},
                missedSessions.length > 2 && React.createElement('button',{
                    onClick:()=>{setSessionsInitialTab('missed');setTab('calendar');},
                    className:"flex-1 py-2 rounded-xl text-[10px] font-black text-rose-400 active:scale-95",
                    style:{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.20)'}
                },`+ ${missedSessions.length-2} جلسة فائتة`),
                missedTasks.length > 2 && React.createElement('button',{
                    onClick:()=>{setRemindersInitialFilter('overdue');setTab('reminders');},
                    className:"flex-1 py-2 rounded-xl text-[10px] font-black text-rose-400 active:scale-95",
                    style:{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.20)'}
                },`+ ${missedTasks.length-2} مهمة متأخرة`)
            )
        ),

        // ════════════════════════════════════
        //  بطاقة ٢ — ⚡ اليوم
        //  ﴾جلسات اليوم + مهام اليوم مجمعة﴿
        // ════════════════════════════════════
        React.createElement('div',{className:"space-y-2"},
            React.createElement('div',{
                className:"flex items-center gap-2 px-3 py-2.5 rounded-2xl cursor-pointer active:opacity-70 transition-opacity",
                style:{
                    background: todaySessions.length > 0 || upcomingTasks.filter((t: TaskFeedItem) =>t.due_date===fmtDate(new Date())).length > 0
                        ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.03)',
                    border: todaySessions.length > 0 || upcomingTasks.filter((t: TaskFeedItem) =>t.due_date===fmtDate(new Date())).length > 0
                        ? '1px solid rgba(239,68,68,0.18)' : '1px solid rgba(255,255,255,0.06)',
                    // ── خط جانبي مميز: أحمر لو فيه عنصر عاجل اليوم، رمادي حيادي لو لأ
                    borderInlineStart: todaySessions.length > 0 || upcomingTasks.filter((t: TaskFeedItem) =>t.due_date===fmtDate(new Date())).length > 0
                        ? '4px solid #f87171' : '4px solid #64748b',
                },
                onClick:()=>setTodayOpen((o: boolean) =>!o)
            },
                React.createElement('div',{
                    className:"w-7 h-7 rounded-xl flex items-center justify-center text-sm shrink-0",
                    style:{background: todaySessions.length>0 ? 'rgba(239,68,68,0.18)' : 'rgba(148,163,184,0.15)'}
                },"⚡"),
                React.createElement('span',{className:`w-2 h-2 rounded-full ${todaySessions.length>0?'bg-rose-500 animate-pulse':'bg-white/20'}`}),
                React.createElement('h3',{className:`text-xs font-black ${todaySessions.length>0?'text-rose-400':'text-slate-400'}`},'اليوم'),
                React.createElement('div',{className:"mr-auto flex items-center gap-2"},
                    todaySessions.length > 0 && React.createElement('span',{
                        className:"text-[9px] px-2 py-0.5 rounded-full font-black",
                        style:{background:'rgba(239,68,68,0.15)',color:'#fca5a5',border:'1px solid rgba(239,68,68,0.25)'}
                    },`${todaySessions.length} جلسة`),
                    upcomingTasks.filter((t: TaskFeedItem) =>t.due_date===fmtDate(new Date())).length > 0 && React.createElement('span',{
                        className:"text-[9px] px-2 py-0.5 rounded-full font-black",
                        style:{background:'rgba(167,139,250,0.15)',color:'#c4b5fd',border:'1px solid rgba(167,139,250,0.25)'}
                    },`${upcomingTasks.filter((t: TaskFeedItem) =>t.due_date===fmtDate(new Date())).length} مهمة`),
                    loadingUrgent && React.createElement(I.Spin,{className:"w-3 h-3 text-slate-600"}),
                    React.createElement('span',{className:`text-slate-500 text-[10px] transition-transform duration-200 ${todayOpen?'rotate-0':'rotate-180'}`},"▼")
                )
            ),
            todayOpen && React.createElement('div',{className:"space-y-2"},
                todaySessions.length === 0 && upcomingTasks.filter((t: TaskFeedItem) =>t.due_date===fmtDate(new Date())).length === 0
                    ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 text-center"},
                        React.createElement('p',{className:"text-[10px] text-slate-600"},"لا توجد جلسات أو مهام مجدولة اليوم 🎉"))
                    : React.createElement('div',{className:"space-y-2"},
                        todaySessions.map((s: SessionFeedItem) => {
                            const linkedCase = ((Array.isArray(s.cases) ? s.cases[0] : s.cases) || cases.find((c: MappedCase) =>c.id===s.case_id)) as LinkedCaseLike | undefined;
                            const linkedClient = linkedCase ? clients.find((cl: MappedClient) =>cl.id===linkedCase.client_id) : null;
                            return buildSessionCard(s,linkedCase,linkedClient,'#f87171',
                                'linear-gradient(135deg,rgba(239,68,68,0.10),rgba(239,68,68,0.04))','rgba(239,68,68,0.35)','⚡ اليوم');
                        }),
                        upcomingTasks.filter((t: TaskFeedItem) =>t.due_date===fmtDate(new Date())).map((r: TaskFeedItem) =>
                            buildTaskCard(r,'#a78bfa','rgba(139,92,246,0.07)','rgba(139,92,246,0.2)','⚡ اليوم')
                        )
                    )
            )
        ),

        // ════════════════════════════════════
        //  بطاقة ٣ — 📆 القادم
        //  ﴾جلسات الأسبوع + مهام قادمة مجمعة﴿
        // ════════════════════════════════════
        React.createElement('div',{className:"space-y-2"},
            React.createElement('div',{
                className:"flex items-center gap-2 px-3 py-2.5 rounded-2xl cursor-pointer active:opacity-70 transition-opacity",
                style:{
                    background:'rgba(245,158,11,0.05)',
                    border:'1px solid rgba(245,158,11,0.18)',
                    borderInlineStart:'4px solid #fbbf24', // ── خط جانبي مميز كهرماني
                },
                onClick:()=>setUpcomingOpen((o: boolean) =>!o)
            },
                React.createElement('div',{
                    className:"w-7 h-7 rounded-xl flex items-center justify-center text-sm shrink-0",
                    style:{background:'rgba(245,158,11,0.15)'}
                },"📆"),
                React.createElement('span',{className:"w-2 h-2 rounded-full bg-amber-400"}),
                React.createElement('h3',{className:"text-xs font-black text-amber-400"},"القادم"),
                React.createElement('span',{className:"text-[9px] text-slate-500"},"الأسبوع القادم"),
                React.createElement('div',{className:"mr-auto flex items-center gap-2"},
                    upcomingSessions.length > 0 && React.createElement('span',{
                        className:"text-[9px] px-2 py-0.5 rounded-full font-black",
                        style:{background:'rgba(245,158,11,0.15)',color:'#fcd34d',border:'1px solid rgba(245,158,11,0.25)'}
                    },`${upcomingSessions.length} جلسة`),
                    upcomingTasks.filter((t: TaskFeedItem) =>t.due_date!==fmtDate(new Date())).length > 0 && React.createElement('span',{
                        className:"text-[9px] px-2 py-0.5 rounded-full font-black",
                        style:{background:'rgba(167,139,250,0.15)',color:'#c4b5fd',border:'1px solid rgba(167,139,250,0.25)'}
                    },`${upcomingTasks.filter((t: TaskFeedItem) =>t.due_date!==fmtDate(new Date())).length} مهمة`),
                    React.createElement('span',{className:`text-slate-500 text-[10px] transition-transform duration-200 ${upcomingOpen?'rotate-0':'rotate-180'}`},"▼")
                )
            ),
            upcomingOpen && React.createElement('div',{className:"space-y-2"},
                upcomingSessions.length === 0 && upcomingTasks.filter((t: TaskFeedItem) =>t.due_date!==fmtDate(new Date())).length === 0
                    ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 text-center"},
                        React.createElement('p',{className:"text-[10px] text-slate-600"},"لا توجد جلسات أو مهام للأسبوع القادم"))
                    : React.createElement('div',{className:"space-y-2"},
                        upcomingSessions.map((s: SessionFeedItem) => {
                            const linkedCase = ((Array.isArray(s.cases) ? s.cases[0] : s.cases) || cases.find((c: MappedCase) =>c.id===s.case_id)) as LinkedCaseLike | undefined;
                            const linkedClient = linkedCase ? clients.find((cl: MappedClient) =>cl.id===linkedCase.client_id) : null;
                            const d = new Date((s.session_date as string)+'T00:00:00');
                            if(d.getDay()===5) return React.createElement('div',{key:s.id,className:"flex items-center gap-3 py-1 opacity-50"},
                                React.createElement('span',{className:"text-[9px] text-slate-600 font-bold"},"الجمعة — إجازة رسمية"),
                                React.createElement('span',{className:"text-[9px] text-slate-600"},s.session_date));
                            const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
                            const daysUntil = Math.round((d.getTime()-todayMidnight.getTime())/(1000*60*60*24));
                            const dLabel = daysUntil===1?'غداً':daysUntil===2?'بعد غد':`بعد ${daysUntil} أيام`;
                            return buildSessionCard(s,linkedCase,linkedClient,'#fbbf24','rgba(245,158,11,0.07)','rgba(245,158,11,0.25)',dLabel);
                        }),
                        upcomingTasks.filter((t: TaskFeedItem) =>t.due_date!==fmtDate(new Date())).slice(0,4).map((r: TaskFeedItem) => {
                            const dTask = new Date((r.due_date as string)+'T00:00:00');
                            const todayMidnightT = new Date(); todayMidnightT.setHours(0,0,0,0);
                            const tomorrowStr = fmtDate(new Date(new Date().setDate(new Date().getDate()+1)));
                            const daysUntilTask = Math.round((dTask.getTime()-todayMidnightT.getTime())/(1000*60*60*24));
                            const label = r.due_date===tomorrowStr?'غداً':daysUntilTask===2?'بعد غد':`بعد ${daysUntilTask} يوم`;
                            return buildTaskCard(r,'#a78bfa','rgba(139,92,246,0.07)','rgba(139,92,246,0.2)',label);
                        }),
                        upcomingTasks.filter((t: TaskFeedItem) =>t.due_date!==fmtDate(new Date())).length > 4 && React.createElement('button',{
                            onClick:()=>{setRemindersInitialFilter(null);setTab('reminders');},
                            className:"w-full py-2 rounded-xl text-[10px] font-black text-violet-400 border border-violet-500/20 active:scale-95",
                            style:{background:'rgba(139,92,246,0.06)'}
                        },`+ ${upcomingTasks.filter((t: TaskFeedItem) =>t.due_date!==fmtDate(new Date())).length-4} مهام أخرى`)
                    )
            )
        ),

    );

  return React.createElement(React.Fragment, null,
        standaloneTarget && React.createElement(StandaloneSessionDetailModal, {
            // كاست موثق: standaloneTarget شكله SessionFeedItem (نتيجة استعلام مُطبَّع جزئي)،
            // بينما المودال بيتوقع CaseSessionRow كامل — نفس نمط الكاست المستخدم
            // لكائنات مصطنعة/جزئية في دفعات سابقة (مفيش تغيير في القيمة وقت التشغيل).
            session: standaloneTarget as unknown as CaseSessionRow,
            db,
            onClose: () => setStandaloneTarget(null),
            onDone: () => { refreshAllSessionLists(); },
        }),
        Dashboard
  );
}

export default DashboardTab;
