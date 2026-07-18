import React from 'react';
import { I } from '../../../constants';
import { Inp } from '@/shared/ui/Inp';
import DatePicker from '@/shared/ui/DatePicker';
import type { CaseSessionRow } from '../../../types';

// شكل فورم الجلسة (إضافة/تعديل) زي ما هو فعليًا في useCaseDetailActions.ts
// (useState({date,time_period,location_floor,location_hall,description,result,next_action}))
// وزي ما handleUpdateSession بيتوقعه بالظبط — ده مختلف عن أعمدة `case_sessions`
// الحقيقية (session_date/session_time/session_floor/session_hall) لأنه شكل
// فورم وسيط، مش صف قاعدة بيانات مباشر.
export interface SessionForm {
  date: string;
  time_period: string;
  location_floor: string;
  location_hall: string;
  description: string;
  result: string;
  next_action: string;
}

export interface EditingSessionForm extends SessionForm {
  id: string;
}

interface TimelineSectionProps {
  showAddSession: boolean;
  setShowAddSession: (v: boolean | ((p: boolean) => boolean)) => void;
  sessionForm: SessionForm;
  setSessionForm: (v: SessionForm | ((p: SessionForm) => SessionForm)) => void;
  handleAddSession: () => void | Promise<void>;
  savingSession: boolean;
  loadingSessions: boolean;
  sessions: CaseSessionRow[];
  editingSession: EditingSessionForm | null;
  setEditingSession: (v: EditingSessionForm | null | ((p: EditingSessionForm | null) => EditingSessionForm | null)) => void;
  handleUpdateSession: (sessionId: string, form: EditingSessionForm) => void | Promise<void>;
  setSessionUpdateTarget: (s: CaseSessionRow) => void;
  deletingSessionId: string | null;
  setConfirmDeleteSession: (v: { id: string; date: string } | null) => void;
}

function TimelineSection({
  showAddSession, setShowAddSession, sessionForm, setSessionForm,
  handleAddSession, savingSession, loadingSessions, sessions,
  editingSession, setEditingSession, handleUpdateSession,
  setSessionUpdateTarget, deletingSessionId, setConfirmDeleteSession,
}: TimelineSectionProps) {
  return React.createElement('div', {className: "space-y-4 fade-in"},
                // زر إضافة جلسة
                React.createElement('button', {
                    onClick: () => setShowAddSession(!showAddSession),
                    'data-testid': 'add-session-button',
                    className: "w-full py-3 border border-dashed border-premium-gold/30 rounded-2xl flex items-center justify-center gap-2 text-premium-gold text-xs font-black hover:bg-premium-gold/5 transition-all active:scale-[0.98]"
                },
                    React.createElement(I.Plus),
                    "إضافة جلسة جديدة"
                ),

                // فورم إضافة جلسة
                showAddSession && React.createElement('div', {className: "bg-premium-card border border-premium-gold/20 rounded-2xl p-4 space-y-3 slide-up"},
                    React.createElement('h4', {className: "text-xs font-black text-premium-gold flex items-center gap-2"},
                        React.createElement('span', {className: "w-1 h-3 bg-premium-gold rounded-full"}),
                        "بيانات الجلسة"
                    ),
                    // التاريخ + الوقت
                    React.createElement('div',{className:"grid grid-cols-2 gap-2"},
                        React.createElement(DatePicker, {label: "تاريخ الجلسة", value: sessionForm.date, onChange: (v: string) => setSessionForm((p: SessionForm) =>({...p,date:v})), required: true, testId: 'session-date-trigger', dayTestId: 'session-date-day'}),
                        React.createElement('div',null,
                            React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"وقت الجلسة"),
                            React.createElement('div',{className:"flex gap-1"},
                                ['صباحي','مسائي'].map((t: string) =>React.createElement('button',{
                                    key:t,
                                    onClick:()=>setSessionForm((p: SessionForm) =>({...p,time_period:t})),
                                    'data-testid': 'session-time-' + t,
                                    className:`flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all active:scale-95 ${sessionForm.time_period===t?'bg-premium-gold text-premium-bg':'bg-white/5 border border-white/10 text-slate-400'}`
                                },t==='صباحي'?'🌅 صباحي':'🌆 مسائي'))
                            )
                        )
                    ),
                    React.createElement(Inp, {label: "ما جرى في الجلسة", value: sessionForm.description, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSessionForm((p: SessionForm) =>({...p,description:e.target.value})), placeholder: "ملخص ما دار في الجلسة...", 'data-testid': 'session-description'}),
                    React.createElement(Inp, {label: "النتيجة / القرار", value: sessionForm.result, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSessionForm((p: SessionForm) =>({...p,result:e.target.value})), placeholder: "قرار المحكمة أو ما آلت إليه الجلسة..."}),
                    React.createElement(Inp, {label: "الإجراء القادم", value: sessionForm.next_action, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSessionForm((p: SessionForm) =>({...p,next_action:e.target.value})), placeholder: "ما المطلوب تنفيذه قبل الجلسة القادمة؟"}),
                    React.createElement('div', {className: "flex gap-2"},
                        React.createElement('button', {
                            onClick: handleAddSession,
                            disabled: savingSession || !sessionForm.date,
                            'data-testid': 'save-session-button',
                            className: "flex-1 py-2.5 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-xl text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 transition-all"
                        }, savingSession ? React.createElement(I.Spin) : React.createElement(I.Check), "حفظ الجلسة"),
                        React.createElement('button', {onClick: () => setShowAddSession(false), className: "px-4 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"}, "إلغاء")
                    )
                ),

                // Timeline
                loadingSessions
                    ? React.createElement('div', {className: "flex items-center justify-center py-16 gap-2 text-slate-500 text-xs"}, React.createElement(I.Spin), "جاري التحميل...")
                    : sessions.length === 0
                        ? React.createElement('div', {className: "text-center py-16 space-y-3"},
                            React.createElement('div', {className: "w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center text-3xl mx-auto"}, "🗓"),
                            React.createElement('p', {className: "text-white/60 font-black text-sm"}, "لا توجد جلسات مسجلة"),
                            React.createElement('p', {className: "text-slate-500 text-xs"}, "اضغط على إضافة جلسة لتسجيل أول جلسة")
                          )
                        : React.createElement('div', {className: "relative"},
                            // الخط الرأسي للـ timeline
                            React.createElement('div', {className: "absolute right-[27px] top-4 bottom-4 w-px bg-gradient-to-b from-premium-gold/40 via-white/10 to-transparent"}),
                            React.createElement('div', {className: "space-y-4"},
                                sessions.map((s: CaseSessionRow, i: number) =>
                                    React.createElement('div', {key: s.id, className: "flex gap-4 items-start relative"},
                                        // نقطة الـ timeline
                                        React.createElement('div', {className: "shrink-0 w-14 flex flex-col items-center gap-1 relative z-10"},
                                            React.createElement('div', {className: `w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-black ${i === 0 ? 'border-premium-gold bg-premium-gold/20 text-premium-gold' : 'border-white/15 bg-premium-bg text-slate-500'}`},
                                                sessions.length - i
                                            ),
                                            React.createElement('span', {className: "text-[8px] text-slate-500 font-bold text-center leading-tight"}, i === 0 ? 'الأخيرة' : '')
                                        ),
                                        // كارت الجلسة
                                        editingSession?.id === s.id
                                        ? React.createElement('div', {className: "flex-1 bg-premium-card border border-premium-gold/30 rounded-2xl p-4 space-y-3 slide-up"},
                                            React.createElement('h4', {className: "text-xs font-black text-premium-gold"}, "✏️ تعديل الجلسة"),
                                            React.createElement('div',{className:"grid grid-cols-2 gap-2"},
                                                React.createElement(DatePicker, {label:"تاريخ الجلسة", value:editingSession.date, onChange:(v: string) =>setEditingSession((p: EditingSessionForm | null) =>({...(p as EditingSessionForm),date:v}))}),
                                                React.createElement('div',null,
                                                    React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"وقت الجلسة"),
                                                    React.createElement('div',{className:"flex gap-1"},
                                                        ['صباحي','مسائي'].map((t: string) =>React.createElement('button',{
                                                            key:t,
                                                            onClick:()=>setEditingSession((p: EditingSessionForm | null) =>({...(p as EditingSessionForm),time_period:t})),
                                                            className:`flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all active:scale-95 ${editingSession.time_period===t?'bg-premium-gold text-premium-bg':'bg-white/5 border border-white/10 text-slate-400'}`
                                                        },t==='صباحي'?'🌅':'🌆'))
                                                    )
                                                )
                                            ),
                                            React.createElement('div',{className:"grid grid-cols-2 gap-2"},
                                                React.createElement(Inp,{label:"الطابق",value:editingSession.location_floor,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setEditingSession((p: EditingSessionForm | null) =>({...(p as EditingSessionForm),location_floor:e.target.value})),placeholder:"الطابق"}),
                                                React.createElement(Inp,{label:"رقم القاعة",value:editingSession.location_hall,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setEditingSession((p: EditingSessionForm | null) =>({...(p as EditingSessionForm),location_hall:e.target.value})),placeholder:"القاعة"})
                                            ),
                                            React.createElement(Inp, {label:"ما جرى", value:editingSession.description, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setEditingSession((p: EditingSessionForm | null) =>({...(p as EditingSessionForm),description:e.target.value})), placeholder:"ملخص ما دار..."}),
                                            React.createElement(Inp, {label:"النتيجة", value:editingSession.result, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setEditingSession((p: EditingSessionForm | null) =>({...(p as EditingSessionForm),result:e.target.value})), placeholder:"قرار المحكمة..."}),
                                            React.createElement(Inp, {label:"الإجراء القادم", value:editingSession.next_action, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setEditingSession((p: EditingSessionForm | null) =>({...(p as EditingSessionForm),next_action:e.target.value})), placeholder:"ما المطلوب؟"}),
                                            React.createElement('div', {className: "flex gap-2"},
                                                React.createElement('button', {
                                                    onClick: () => { handleUpdateSession(s.id, editingSession); setEditingSession(null); },
                                                    className: "flex-1 py-2.5 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-xl text-xs font-black flex items-center justify-center gap-1 active:scale-95"
                                                }, React.createElement(I.Check), "حفظ"),
                                                React.createElement('button', {onClick:()=>setEditingSession(null), className:"px-4 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"}, "إلغاء")
                                            )
                                          )
                                        : React.createElement('div', {
                                            className: `flex-1 bg-premium-card border rounded-2xl p-4 mb-1 transition-all cursor-pointer active:scale-[0.99] ${i === 0 ? 'border-premium-gold/25 shadow-neon-gold' : 'border-white/5'}`,
                                            'data-testid': 'session-card',
                                            onClick: () => i === 0 ? setSessionUpdateTarget(s) : null
                                          },
                                            // التاريخ + أزرار
                                            React.createElement('div', {className: "flex items-center justify-between mb-3"},
                                                React.createElement('div', {className: "flex items-center gap-2"},
                                                    React.createElement('div', {className: "p-1.5 bg-premium-gold/10 rounded-lg"},
                                                        React.createElement(I.CalGrid, {className: "w-4 h-4"})
                                                    ),
                                                    React.createElement('div',null,
                                                        React.createElement('span', {className: "text-[11px] font-black text-premium-gold"}, s.session_date),
                                                        s.session_time && React.createElement('span',{
                                                            className:"mr-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-black",
                                                            style:{background:s.session_time==='صباحي'?'rgba(251,191,36,0.15)':'rgba(99,102,241,0.15)',color:s.session_time==='صباحي'?'#fbbf24':'#818cf8'}
                                                        },s.session_time==='صباحي'?'🌅 صباحي':'🌆 مسائي')
                                                    )
                                                ),
                                                React.createElement('div', {className: "flex items-center gap-1.5"},
                                                    // الجلسة الأخيرة: badge + زر تحديث
                                                    i === 0 && React.createElement(React.Fragment, null,
                                                        React.createElement('span', {className: "text-[9px] px-2 py-0.5 bg-premium-gold/10 text-premium-gold rounded-full font-bold"}, "آخر جلسة"),
                                                        React.createElement('button', {
                                                            onClick: (e: React.MouseEvent) => { e.stopPropagation(); setSessionUpdateTarget(s); },
                                                            className: "flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black active:scale-90 transition-all",
                                                            style: {background:'rgba(212,175,55,0.15)', color:'#D4AF37', border:'1px solid rgba(212,175,55,0.3)'}
                                                        }, "⚡ تحديث")
                                                    ),
                                                    // الجلسات القديمة: زر تعديل + حذف
                                                    i !== 0 && React.createElement(React.Fragment, null,
                                                        React.createElement('button', {
                                                            onClick: (e: React.MouseEvent) => { e.stopPropagation(); setEditingSession({id:s.id, date:s.session_date||'', time_period:s.session_time||'صباحي', location_floor:s.session_floor||'', location_hall:s.session_hall||'', description:s.description||'', result:s.result||'', next_action:s.next_action||''}); },
                                                            className: "w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 hover:text-premium-gold active:scale-90 transition-all"
                                                        }, React.createElement(I.Edit)),
                                                        deletingSessionId === s.id
                                                        ? React.createElement('div', {className:"w-6 h-6 flex items-center justify-center"}, React.createElement(I.Spin))
                                                        : React.createElement('button', {
                                                            onClick: (e: React.MouseEvent) => { e.stopPropagation(); setConfirmDeleteSession({id: s.id, date: s.session_date || '—'}); },
                                                            className: "w-6 h-6 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400 hover:bg-rose-500/20 active:scale-90 transition-all"
                                                        }, React.createElement(I.Trash))
                                                    )
                                                )
                                            ),
                                            // الموقع
                                            (s.session_floor||s.session_hall) && React.createElement('div',{
                                                className:"flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-xl text-[10px] font-bold",
                                                style:{background:'rgba(14,165,233,0.08)',border:'1px solid rgba(14,165,233,0.15)',color:'#38bdf8'}
                                            },
                                                React.createElement('span',null,"📍"),
                                                s.session_floor && React.createElement('span',null,"الطابق "+s.session_floor),
                                                s.session_floor && s.session_hall && React.createElement('span',{className:"text-slate-600 mx-1"},"·"),
                                                s.session_hall && React.createElement('span',null,"قاعة "+s.session_hall)
                                            ),
                                            s.description && React.createElement('div', {className: "mb-3"},
                                                React.createElement('p', {className: "text-[9px] font-black text-slate-500 mb-1"}, "ما جرى"),
                                                React.createElement('p', {className: "text-xs text-slate-200 leading-relaxed"}, s.description)
                                            ),
                                            // ما جرى في الجلسة
                                            s.result && React.createElement('div', {className: "bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3 mb-2"},
                                                React.createElement('p', {className: "text-[9px] font-black text-emerald-400 mb-1"}, "📌 النتيجة"),
                                                React.createElement('p', {className: "text-[11px] text-slate-200 font-bold leading-relaxed"}, s.result)
                                            ),
                                            // الإجراء القادم
                                            s.next_action && React.createElement('div', {className: "bg-amber-500/5 border border-amber-500/15 rounded-xl p-3"},
                                                React.createElement('p', {className: "text-[9px] font-black text-amber-400 mb-1"}, "⚡ الإجراء القادم"),
                                                React.createElement('p', {className: "text-[11px] text-slate-200 font-bold leading-relaxed"}, s.next_action)
                                            )
                                          )
                                    )
                                )
                            )
                          )
            );
}

export default TimelineSection;
