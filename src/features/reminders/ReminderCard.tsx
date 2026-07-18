import React from 'react';
import { I } from '../../constants';
import { formatArDate } from '../../shared/ui/arabicLocale';
import type { ReminderRow } from '../../types';

interface ReminderCardProps {
    r: ReminderRow;
    todayStr: string;
    onToggleDone: (r: ReminderRow) => void;
    onView: (r: ReminderRow) => void;
    onEdit: (r: ReminderRow) => void;
    onDelete: (r: ReminderRow) => void;
}

const fmtCompletedAt = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return formatArDate(d, { day:'numeric', month:'long', year:'numeric' });
};

// BUG-09 FIX: نُقل خارج RemindersTab عشان React ميعتبروش نوع جديد كل render
// (كان بيسبب unmount/remount كامل لكل الكروت مع كل حرف في البحث)
function ReminderCard({ r, todayStr, onToggleDone, onView, onEdit, onDelete }: ReminderCardProps){
    // كاست بسيط: due_date عمود string|null في السكيما، والمقارنة هنا كانت
    // شغالة قبل كده وقت التشغيل حتى لو null (بترجع false) — نفس السلوك بالظبط.
    const isOverdue = !r.done && (r.due_date as string) < todayStr;
    const isToday   = r.due_date === todayStr;
    return React.createElement('div',{
        className:`bg-premium-card border rounded-xl px-3 py-2.5 cursor-pointer active:scale-[0.99] transition-all ${r.done?'opacity-60 border-white/5':isOverdue?'border-rose-500/30':isToday?'border-amber-500/30':'border-white/5'}`,
        onClick: () => onView(r)
    },
        React.createElement('div',{className:"flex items-center gap-2.5"},
            // زر التأشير
            React.createElement('button',{
                onClick: (e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onToggleDone(r); },
                className:`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all active:scale-90 ${r.done?'bg-emerald-500 border-emerald-500 text-white':isOverdue?'border-rose-400 hover:bg-rose-400/20':'border-white/20 hover:border-premium-gold'}`
            }, r.done && React.createElement(I.Check,{className:"w-3 h-3"})),

            // المحتوى
            React.createElement('div',{className:"flex-1 min-w-0"},
                React.createElement('p',{className:`text-[11px] font-black leading-tight truncate ${r.done?'line-through text-slate-500':'text-white'}`}, r.title),
                React.createElement('div',{className:"flex items-center gap-1.5 mt-0.5 flex-wrap"},
                    React.createElement('span',{className:`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${r.done?'bg-white/5 text-slate-500':isOverdue?'bg-rose-500/15 text-rose-400':isToday?'bg-amber-500/15 text-amber-400':'bg-blue-500/10 text-blue-400'}`},
                        r.done ? '✅ منجز' : isOverdue ? '⚠️ متأخر' : isToday ? '🔔 اليوم' : '📅 '+r.due_date
                    ),
                    // تاريخ الإنجاز
                    r.done && r.completed_at && React.createElement('span',{className:"text-[9px] text-emerald-600"},
                        'أُنجز ' + fmtCompletedAt(r.completed_at)
                    ),
                    // ملاحظة مختصرة
                    !r.done && r.notes && React.createElement('span',{className:"text-[9px] text-slate-500 truncate max-w-[140px]"},r.notes)
                )
            ),

            // أزرار
            React.createElement('div',{className:"flex items-center gap-1 shrink-0"},
                React.createElement('button',{
                    onClick:(e: React.MouseEvent<HTMLButtonElement>)=>{ e.stopPropagation(); onEdit(r); },
                    className:"w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 hover:text-premium-gold hover:bg-white/10 active:scale-90"
                }, React.createElement(I.Edit,{className:"w-3 h-3"})),
                React.createElement('button',{
                    onClick:(e: React.MouseEvent<HTMLButtonElement>)=>{ e.stopPropagation(); onDelete(r); },
                    className:"w-6 h-6 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400 hover:bg-rose-500/20 active:scale-90"
                }, React.createElement(I.Trash,{className:"w-3 h-3"}))
            )
        )
    );
}

export default ReminderCard;
