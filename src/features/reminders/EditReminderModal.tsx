import React from 'react';
import { I } from '../../constants';
import { Inp } from '@/shared/ui/Inp';
import DatePicker from '@/shared/ui/DatePicker';
import type { ReminderRow } from '../../types';

interface ReminderEditForm {
  title: string;
  due_date: string;
  notes: string;
}

interface EditReminderModalProps {
  editTarget: ReminderRow | null;
  setEditTarget: (r: ReminderRow | null) => void;
  editForm: ReminderEditForm;
  setEditForm: (fn: (p: ReminderEditForm) => ReminderEditForm) => void;
  handleEdit: () => void;
  editSaving: boolean;
}

function EditReminderModal({
  editTarget, setEditTarget, editForm, setEditForm, handleEdit, editSaving,
}: EditReminderModalProps) {
  return editTarget && React.createElement('div',{
        className:"fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm",
        onClick:(e: React.MouseEvent<HTMLDivElement>) =>{ if(e.target===e.currentTarget) setEditTarget(null); }
    },
        React.createElement('div',{className:"bg-premium-card w-full max-w-lg rounded-t-3xl border-t border-white/10 p-6 pb-10 shadow-2xl slide-up"},
            React.createElement('div',{className:"w-10 h-1 bg-white/20 rounded-full mx-auto mb-5"}),
            React.createElement('div',{className:"flex items-center justify-between mb-4"},
                React.createElement('h3',{className:"text-sm font-black text-white flex items-center gap-2"},
                    React.createElement('span',{className:"w-1 h-4 bg-premium-gold rounded-full"}),
                    "تعديل المهمة"
                ),
                React.createElement('button',{onClick:()=>setEditTarget(null),className:"w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400"},"✕")
            ),
            React.createElement('div',{className:"space-y-3"},
                React.createElement(Inp,{label:"عنوان المهمة",value:editForm.title,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setEditForm((p: ReminderEditForm) =>({...p,title:e.target.value})),placeholder:"عنوان المهمة",required:true}),
                React.createElement(DatePicker,{label:"تاريخ المهمة",value:editForm.due_date,onChange:(v: string) =>setEditForm((p: ReminderEditForm) =>({...p,due_date:v})),required:true}),
                React.createElement(Inp,{label:"ملاحظات",value:editForm.notes,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setEditForm((p: ReminderEditForm) =>({...p,notes:e.target.value})),placeholder:"تفاصيل إضافية..."}),
                React.createElement('button',{
                    onClick:handleEdit, disabled:editSaving,
                    className:"w-full py-3 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-xl font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-transform"
                }, editSaving?React.createElement(I.Spin):React.createElement(I.Check), "حفظ التعديلات")
            )
        )
    );
}

export default EditReminderModal;
