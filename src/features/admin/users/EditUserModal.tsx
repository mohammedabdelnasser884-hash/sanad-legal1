import React, { useState } from 'react';
import { I } from '../../../constants';
import { ROLE_CONFIG, PERMISSION_LABELS } from '../icons';
import type { ProfileRow } from '../../../types';
import type { EditUserForm } from './hooks/useAdminUsers';

interface EditUserModalProps {
  user: ProfileRow;
  onSave: (data: EditUserForm) => void;
  onClose: () => void;
  saving: boolean;
}

function EditUserModal({ user, onSave, onClose, saving }: EditUserModalProps) {
  const [form, setForm] = useState<EditUserForm>({
    full_name: user.full_name || '',
    role: user.role || 'lawyer',
    is_active: user.is_active !== false,
    permissions: (user.permissions as Record<string, boolean>) || {},
  });

  const roleEntry = ROLE_CONFIG[form.role];
  const defaultPerms: Record<string, boolean> = form.role === 'admin'
    ? Object.keys(PERMISSION_LABELS).reduce((a: Record<string, boolean>, k: string) => ({...a,[k]:true}), {})
    : form.role === 'viewer'
    ? { can_view_fees: false, can_view_reports: true }
    : {};

  return React.createElement('div',{
    className:"fixed inset-0 z-50 flex items-end justify-center",
    style:{background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)'}
  },
    React.createElement('div',{
      className:"w-full max-w-sm rounded-t-3xl p-5 space-y-4",
      style:{background:'#0d1a2e',border:'1px solid rgba(212,175,55,0.15)',borderBottom:'none',maxHeight:'85vh',overflowY:'auto'}
    },
      // هيدر
      React.createElement('div',{className:"flex items-center justify-between"},
        React.createElement('h3',{className:"text-sm font-black text-white"},"تعديل المستخدم"),
        React.createElement('button',{onClick:onClose,className:"w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-slate-400 hover:text-white"},
          React.createElement(I.X))
      ),

      // الاسم
      React.createElement('div',null,
        React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-1"},"الاسم الكامل"),
        React.createElement('input',{
          value:form.full_name,
          onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setForm((f: EditUserForm) =>({...f,full_name:e.target.value})),
          className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-white/5 text-white",
          style:{fontFamily:'Cairo,sans-serif'}
        })
      ),

      // الدور
      React.createElement('div',null,
        React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-2"},"الدور"),
        React.createElement('div',{className:"grid grid-cols-3 gap-2"},
          ['admin','lawyer','viewer'].map((role: string) =>{
            const rc = ROLE_CONFIG[role];
            return React.createElement('button',{
              key:role,
              onClick:()=>setForm((f: EditUserForm) =>({...f,role,permissions:{}})),
              className:`py-2 rounded-xl text-[10px] font-black border transition-all ${form.role===role?`${rc.bg} ${rc.color} ${rc.border}`:'bg-white/5 text-slate-500 border-white/10'}`
            }, rc.label);
          })
        )
      ),

      // الصلاحيات
      React.createElement('div',null,
        React.createElement('div',{className:"flex items-center justify-between mb-2"},
          React.createElement('label',{className:"text-[10px] font-bold text-slate-400"},"الصلاحيات"),
          form.role !== 'admin' && React.createElement('button',{
            onClick:()=>setForm((f: EditUserForm) =>({...f,permissions:defaultPerms})),
            className:"text-[9px] text-slate-500 underline"
          },"إعادة ضبط")
        ),
        React.createElement('div',{className:"grid grid-cols-2 gap-1.5"},
          Object.entries(PERMISSION_LABELS).map(([key,{label,icon}]: [string, {label: string; icon: string}])=>{
            const isOn = form.role==='admin' ? true : (form.permissions[key] ?? false);
            const disabled = form.role==='admin';
            return React.createElement('button',{
              key,
              disabled,
              onClick:()=>!disabled&&setForm((f: EditUserForm) =>({...f,permissions:{...f.permissions,[key]:!f.permissions[key]}})),
              className:`flex items-center gap-2 p-2 rounded-xl text-[9px] font-bold border transition-all ${isOn?'bg-[#C9A84C]/15 text-[#C9A84C] border-[#C9A84C]/30':'bg-white/5 text-slate-500 border-white/8'} ${disabled?'opacity-60 cursor-default':''}`
            },
              React.createElement('span',null,icon),
              React.createElement('span',{className:"truncate"},label),
              isOn && React.createElement('span',{className:"mr-auto text-[#C9A84C]"},"✓")
            );
          })
        )
      ),

      // الحالة
      React.createElement('div',{className:"flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/8"},
        React.createElement('div',null,
          React.createElement('p',{className:"text-xs font-black text-white"},"حالة الحساب"),
          React.createElement('p',{className:`text-[10px] ${form.is_active?'text-[#C9A84C]':'text-red-400'}`},
            form.is_active?'نشط — بإمكانه تسجيل الدخول':'معطّل — لا يستطيع الدخول')
        ),
        React.createElement('button',{
          onClick:()=>setForm((f: EditUserForm) =>({...f,is_active:!f.is_active})),
          className:`w-12 h-6 rounded-full transition-all relative ${form.is_active?'bg-[#C9A84C]':'bg-slate-600'}`
        },
          React.createElement('div',{
            className:`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow ${form.is_active?'right-0.5':'left-0.5'}`
          })
        )
      ),

      // زر الحفظ
      React.createElement('button',{
        onClick:()=>onSave(form),
        disabled:saving||!form.full_name.trim(),
        className:"w-full py-3 rounded-xl text-xs font-black text-premium-bg bg-gradient-to-tr from-premium-gold to-[#E8C97A] shadow-lg active:scale-95 transition-transform disabled:opacity-50"
      },saving?'جاري الحفظ...':'حفظ التعديلات')
    )
  );
}

export default EditUserModal;
