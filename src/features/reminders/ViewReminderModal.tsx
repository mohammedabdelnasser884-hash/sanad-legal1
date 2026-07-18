import React from 'react';
import { I } from '../../constants';
import { formatArDate } from '../../shared/ui/arabicLocale';
import type { ReminderRow } from '../../types';

interface ReminderEditForm {
  title: string;
  due_date: string;
  notes: string;
}

interface ViewReminderModalProps {
  viewTarget: ReminderRow | null;
  setViewTarget: (r: ReminderRow | null) => void;
  handleToggleDone: (r: ReminderRow) => void;
  setEditTarget: (r: ReminderRow | null) => void;
  setEditForm: (form: ReminderEditForm) => void;
  setConfirmDeleteTarget: (r: ReminderRow | null) => void;
}

function ViewReminderModal({
  viewTarget, setViewTarget, handleToggleDone, setEditTarget, setEditForm, setConfirmDeleteTarget,
}: ViewReminderModalProps) {
  return viewTarget && React.createElement('div',{
        className:"fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm",
        onClick: () => setViewTarget(null)
    },
        React.createElement('div',{
            className:"bg-premium-card w-full max-w-lg rounded-t-3xl border-t border-white/10 p-6 pb-10 shadow-2xl slide-up",
            onClick: (e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()
        },
            // handle bar
            React.createElement('div',{className:"w-10 h-1 bg-white/20 rounded-full mx-auto mb-5"}),

            // هيدر
            React.createElement('div',{className:"flex items-start justify-between gap-3 mb-4"},
                React.createElement('div',{className:"flex items-center gap-2"},
                    React.createElement('span',{className:"w-1 h-4 bg-premium-gold rounded-full shrink-0"}),
                    React.createElement('h3',{className:`text-sm font-black leading-snug ${viewTarget.done ? 'line-through text-slate-400' : 'text-white'}`},
                        viewTarget.title
                    )
                ),
                React.createElement('button',{
                    onClick:()=>setViewTarget(null),
                    className:"w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 shrink-0"
                },"✕")
            ),

            // بيانات
            React.createElement('div',{className:"space-y-3"},

                // تاريخ الاستحقاق
                React.createElement('div',{className:"flex items-center gap-2 text-[11px]"},
                    React.createElement('span',{className:"text-slate-500"},"📅 الموعد:"),
                    React.createElement('span',{className:"text-white font-bold"}, viewTarget.due_date || '—')
                ),

                // حالة + تاريخ الإنجاز
                viewTarget.done
                    ? React.createElement('div',{className:"flex items-center gap-2 text-[11px]"},
                        React.createElement('span',{className:"text-emerald-400 font-bold"},"✅ منجزة"),
                        viewTarget.completed_at && React.createElement('span',{className:"text-slate-400"},
                            '· أُنجزت ' + formatArDate(viewTarget.completed_at,{day:'numeric',month:'long',year:'numeric'})
                        )
                    )
                    : (() => {
                        const todStr = new Date().toISOString().split('T')[0];
                        const isOvd  = (viewTarget.due_date as string) < todStr;
                        const isTdy  = viewTarget.due_date === todStr;
                        return React.createElement('div',{className:"flex items-center gap-1.5 text-[11px]"},
                            React.createElement('span',{className: isOvd?'text-rose-400 font-bold': isTdy?'text-amber-400 font-bold':'text-blue-400'},
                                isOvd ? '⚠️ متأخرة' : isTdy ? '🔔 اليوم' : '🕐 قادمة'
                            )
                        );
                    })(),

                // الملاحظات
                viewTarget.notes && React.createElement('div',{
                    className:"bg-white/4 border border-white/8 rounded-xl p-3 text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap",
                    dir:"rtl"
                }, viewTarget.notes)
            ),

            // أزرار التحكم
            React.createElement('div',{className:"flex gap-2 mt-5"},
                // تأشير منجز / إلغاء
                React.createElement('button',{
                    onClick: () => { handleToggleDone(viewTarget); setViewTarget(null); },
                    className:`flex-1 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-transform ${viewTarget.done ? 'bg-white/8 text-slate-300' : 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'}`
                },
                    viewTarget.done
                        ? React.createElement(React.Fragment, null, "↩️ إلغاء الإنجاز")
                        : React.createElement(React.Fragment, null, React.createElement(I.Check,{className:"w-3.5 h-3.5"}), "تسجيل كمنجز")
                ),
                // تعديل
                React.createElement('button',{
                    onClick: () => { setViewTarget(null); setEditTarget(viewTarget); setEditForm({title:viewTarget.title as string,due_date:viewTarget.due_date as string,notes:viewTarget.notes||''}); },
                    className:"flex-1 py-2.5 bg-white/5 text-slate-300 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 active:scale-95"
                }, React.createElement(I.Edit,{className:"w-3.5 h-3.5"}), "تعديل"),
                // حذف
                React.createElement('button',{
                    onClick: () => { setViewTarget(null); setConfirmDeleteTarget(viewTarget); },
                    className:"w-10 py-2.5 bg-rose-500/10 text-rose-400 rounded-xl flex items-center justify-center active:scale-95"
                }, React.createElement(I.Trash,{className:"w-3.5 h-3.5"}))
            )
        )
    );
}

export default ViewReminderModal;
