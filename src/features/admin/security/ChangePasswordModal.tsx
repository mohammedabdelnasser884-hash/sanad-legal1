import React, { useState } from 'react';
import { I } from '../../../constants';
import { IconKey, IconWarning } from '../icons';
import type { ProfileRow } from '../../../types';
import type { ChangePasswordPayload } from '../users/hooks/useAdminUsers';

interface ChangePasswordModalProps {
  user: ProfileRow;
  onSave: (data: ChangePasswordPayload) => void;
  onClose: () => void;
  saving: boolean;
}

function ChangePasswordModal({ user, onSave, onClose, saving }: ChangePasswordModalProps) {
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [forceChange, setForceChange] = useState(false);

  const isValid = newPass.length >= 8 && newPass === confirmPass;
  const strength = newPass.length === 0 ? 0 : newPass.length < 8 ? 1 : newPass.length < 12 ? 2 : 3;
  const strengthLabel = ['', 'ضعيفة', 'متوسطة', 'قوية'];
  const strengthColor = ['', 'text-red-400', 'text-[#C9A84C]', 'text-[#C9A84C]'];
  const strengthBg   = ['bg-slate-700', 'bg-red-500', 'bg-[#C9A84C]', 'bg-[#C9A84C]'];

  return React.createElement('div',{
    className:"fixed inset-0 z-50 flex items-end justify-center",
    style:{background:'rgba(0,0,0,0.75)',backdropFilter:'blur(4px)'}
  },
    React.createElement('div',{
      className:"w-full max-w-sm rounded-t-3xl p-5 space-y-4",
      style:{background:'#0d1a2e',border:'1px solid rgba(212,175,55,0.15)',borderBottom:'none',maxHeight:'85vh',overflowY:'auto'}
    },
      // هيدر
      React.createElement('div',{className:"flex items-center justify-between"},
        React.createElement('div',{className:"flex items-center gap-2"},
          React.createElement('div',{className:"w-8 h-8 rounded-xl bg-[#C9A84C]/15 flex items-center justify-center"},
            React.createElement(IconKey,{className:"w-4 h-4 text-[#C9A84C]"})
          ),
          React.createElement('div',null,
            React.createElement('h3',{className:"text-sm font-black text-white"},"تغيير كلمة المرور"),
            React.createElement('p',{className:"text-[9px] text-slate-500"},user.full_name)
          )
        ),
        React.createElement('button',{onClick:onClose,className:"w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-slate-400 hover:text-white"},
          React.createElement(I.X))
      ),

      // تحذير
      React.createElement('div',{className:"flex items-start gap-2 p-3 rounded-xl bg-[#C9A84C]/10 border border-[#C9A84C]/20"},
        React.createElement(IconWarning,{className:"w-4 h-4 text-[#C9A84C] flex-shrink-0 mt-0.5"}),
        React.createElement('p',{className:"text-[10px] text-[#C9A84C] leading-relaxed"},
          "سيتم تحديث كلمة مرور "+user.full_name+" فوراً. تأكد من إخطاره بالكلمة الجديدة.")
      ),

      // كلمة المرور الجديدة
      React.createElement('div',null,
        React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-1"},"كلمة المرور الجديدة"),
        React.createElement('div',{className:"relative"},
          React.createElement('input',{
            type:showPass?'text':'password',
            value:newPass,
            onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setNewPass(e.target.value),
            placeholder:"8+ أحرف على الأقل",
            className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-600",
            style:{fontFamily:'Cairo,sans-serif'}
          }),
          React.createElement('button',{
            type:'button', onClick:()=>setShowPass((s: boolean) =>!s),
            className:"absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
          }, React.createElement(I.Eye))
        ),
        // مؤشر القوة
        newPass.length > 0 && React.createElement('div',{className:"mt-2 space-y-1"},
          React.createElement('div',{className:"flex gap-1"},
            [1,2,3].map((i: number) =>React.createElement('div',{
              key:i,
              className:`h-1 flex-1 rounded-full transition-all ${i<=strength?strengthBg[strength]:'bg-slate-700'}`
            }))
          ),
          React.createElement('p',{className:`text-[9px] font-bold ${strengthColor[strength]}`},
            "قوة الكلمة: "+strengthLabel[strength])
        )
      ),

      // تأكيد كلمة المرور
      React.createElement('div',null,
        React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-1"},"تأكيد كلمة المرور"),
        React.createElement('div',{className:"relative"},
          React.createElement('input',{
            type:showPass?'text':'password',
            value:confirmPass,
            onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setConfirmPass(e.target.value),
            placeholder:"أعد كتابة كلمة المرور",
            className:`w-full p-2.5 text-xs rounded-xl border bg-white/5 text-white placeholder-slate-600 ${confirmPass&&!isValid?'border-red-500/50':'border-white/10'}`,
            style:{fontFamily:'Cairo,sans-serif'}
          })
        ),
        confirmPass && !isValid && React.createElement('p',{className:"text-[9px] text-red-400 mt-1"},
          newPass!==confirmPass?"كلمتا المرور غير متطابقتين":"كلمة المرور قصيرة جداً")
      ),

      // إجبار التغيير
      React.createElement('div',{className:"flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/8"},
        React.createElement('div',null,
          React.createElement('p',{className:"text-xs font-black text-white"},"إجبار التغيير عند الدخول"),
          React.createElement('p',{className:"text-[10px] text-slate-500"},"سيُطلب منه تغييرها فور تسجيل الدخول")
        ),
        React.createElement('button',{
          onClick:()=>setForceChange((s: boolean) =>!s),
          className:`w-12 h-6 rounded-full transition-all relative ${forceChange?'bg-[#C9A84C]':'bg-slate-600'}`
        },
          React.createElement('div',{
            className:`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow ${forceChange?'right-0.5':'left-0.5'}`
          })
        )
      ),

      // زر الحفظ
      React.createElement('button',{
        onClick:()=>onSave({userId:user.user_id||user.id, newPassword:newPass, forceChange}),
        disabled:saving||!isValid,
        className:"w-full py-3 rounded-xl text-xs font-black text-premium-bg bg-gradient-to-tr from-[#C9A84C] to-[#E8C97A] shadow-lg active:scale-95 transition-transform disabled:opacity-50"
      },saving?'جاري التحديث...':'تحديث كلمة المرور')
    )
  );
}

export default ChangePasswordModal;
