import React from 'react';
import { I } from '../../../constants';
import { IconToggle, IconKey, ROLE_CONFIG, PERMISSION_LABELS } from '../icons';
import type { ProfileRow } from '../../../types';

interface UsersSectionProps {
  lawyers: ProfileRow[];
  profile: ProfileRow | null;
  toggleUserActive: (user: ProfileRow) => void;
  setChangePassUser: (user: ProfileRow) => void;
  setEditUser: (user: ProfileRow) => void;
  setConfirmDelete: (user: ProfileRow) => void;
}

function UsersSection({
  lawyers, profile, toggleUserActive, setChangePassUser,
  setEditUser, setConfirmDelete,
}: UsersSectionProps) {
  return React.createElement('div',{className:"space-y-3"},
      lawyers.length === 0
        ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs"},"لا يوجد مستخدمون")
        : lawyers.map((user) => {
            // permissions أعمدة Json في قاعدة البيانات — نفس الكاست الموثّق
            // المستخدم فعليًا في EditUserModal.tsx لقراءتها كـ Record<string, boolean>.
            const userPermissions = (user.permissions as Record<string, boolean>) || {};
            const rc = ROLE_CONFIG[user.role || ''] || ROLE_CONFIG.viewer;
            const isInactive = user.is_active === false;
            return React.createElement('div',{
              key:user.id,
              className:`bg-premium-card border rounded-2xl p-4 transition-all ${isInactive?'border-red-500/20 opacity-60':'border-white/5'}`
            },
              // صف العلوي
              React.createElement('div',{className:"flex items-start gap-3"},
                // أفاتار
                React.createElement('div',{
                  className:`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 ${rc.bg} ${rc.color}`
                }, (user.full_name||'م').charAt(0)),

                // معلومات
                React.createElement('div',{className:"flex-1 min-w-0"},
                  React.createElement('div',{className:"flex items-center gap-2"},
                    React.createElement('p',{className:"text-xs font-black text-white truncate"},user.full_name||'—'),
                    isInactive && React.createElement('span',{className:"text-[8px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-bold"},"معطّل")
                  ),
                  React.createElement('p',{className:"text-[10px] text-slate-500 truncate"},user.email||''),
                  React.createElement('div',{className:"flex items-center gap-2 mt-1"},
                    React.createElement('span',{className:`text-[9px] font-bold px-2 py-0.5 rounded-full border ${rc.bg} ${rc.color} ${rc.border}`},rc.label),
                    Object.keys(userPermissions).length > 0 &&
                      React.createElement('span',{className:"text-[9px] text-slate-600"},
                        Object.values(userPermissions).filter(Boolean).length + " صلاحية")
                  )
                ),

                // أزرار
                React.createElement('div',{className:"flex gap-1.5"},
                  React.createElement('button',{
                    onClick:()=>toggleUserActive(user),
                    className:`w-8 h-8 rounded-xl flex items-center justify-center border transition-all active:scale-90 ${isInactive?'bg-[#C9A84C]/15 border-[#C9A84C]/30 text-[#C9A84C]':'bg-red-500/10 border-red-500/20 text-red-400'}`
                  }, React.createElement(IconToggle,{on:!isInactive})),

                  React.createElement('button',{
                    onClick:()=>setChangePassUser(user),
                    title:"تغيير كلمة المرور",
                    className:"w-8 h-8 rounded-xl flex items-center justify-center bg-[#C9A84C]/15 border border-[#C9A84C]/30 text-[#C9A84C] active:scale-90 transition-all"
                  }, React.createElement(IconKey)),

                  React.createElement('button',{
                    onClick:()=>setEditUser(user),
                    className:"w-8 h-8 rounded-xl flex items-center justify-center bg-[#C9A84C]/15 border border-[#C9A84C]/30 text-[#C9A84C] active:scale-90 transition-all"
                  }, React.createElement(I.Edit)),

                  user.id !== profile?.id && React.createElement('button',{
                    onClick:()=>setConfirmDelete(user),
                    className:"w-8 h-8 rounded-xl flex items-center justify-center bg-red-500/10 border border-red-500/20 text-red-400 active:scale-90 transition-all"
                  }, React.createElement(I.Trash))
                )
              ),

              // الصلاحيات المفعّلة
              user.role !== 'admin' && Object.keys(userPermissions).some((k) => userPermissions[k]) &&
                React.createElement('div',{className:"mt-3 flex flex-wrap gap-1"},
                  Object.entries(PERMISSION_LABELS)
                    .filter(([k]) => userPermissions[k])
                    .map(([k,{label,icon}])=>React.createElement('span',{
                      key:k,
                      className:"text-[8px] bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/20 px-1.5 py-0.5 rounded-full"
                    },icon+" "+label))
                )
            );
          })
    );
}

export default UsersSection;
