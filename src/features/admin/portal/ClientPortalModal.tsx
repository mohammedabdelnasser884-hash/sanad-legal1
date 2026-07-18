import React, { useState } from 'react';
import { I } from '../../../constants';
import type { ClientRow } from '../../../types';
import type { PortalAccessRow, PortalSaveForm } from './hooks/useAdminPortal';

interface ClientPortalModalProps {
  client: ClientRow;
  portalAccess: PortalAccessRow[];
  onSave: (data: PortalSaveForm) => void;
  onClose: () => void;
  saving: boolean;
}

function ClientPortalModal({ client, portalAccess, onSave, onClose, saving }: ClientPortalModalProps) {
  const existing = portalAccess.find((p) => p.client_id === client.id);
  // ملحوظة: الـ PIN القديم مش متاح للقراءة بعد التشفير (hash) —
  // لازم تولّد/تكتب رقم جديد في كل مرة تفتح فيها البوابة دي.
  const [pin, setPin] = useState('');
  const [isActive, setIsActive] = useState(existing ? existing.is_active !== false : true);

  const genPin = () => {
    const newPin = String(Math.floor(1000 + Math.random() * 9000));
    setPin(newPin);
  };

  return React.createElement('div',{
    className:"fixed inset-0 z-50 flex items-end justify-center",
    style:{background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)'}
  },
    React.createElement('div',{
      className:"w-full max-w-sm rounded-t-3xl p-5 space-y-4",
      style:{background:'#0d1a2e',border:'1px solid rgba(212,175,55,0.15)',borderBottom:'none'}
    },
      React.createElement('div',{className:"flex items-center justify-between"},
        React.createElement('div',null,
          React.createElement('h3',{className:"text-sm font-black text-white"},"بوابة الموكل"),
          React.createElement('p',{className:"text-[10px] text-slate-500"},client.full_name)
        ),
        React.createElement('button',{onClick:onClose,className:"w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-slate-400"},
          React.createElement(I.X))
      ),

      // PIN
      React.createElement('div',null,
        React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-2"},"رمز PIN (4 أرقام)"),
        React.createElement('div',{className:"flex gap-2"},
          React.createElement('input',{
            value:pin,
            onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setPin(e.target.value.replace(/\D/,'').slice(0,4)),
            maxLength:4, placeholder:"****",
            className:"flex-1 p-2.5 text-center text-lg tracking-[0.5em] font-black rounded-xl border border-white/10 bg-white/5 text-white",
            style:{fontFamily:'monospace',letterSpacing:'0.5em'}
          }),
          React.createElement('button',{
            onClick:genPin,
            className:"px-3 py-2 rounded-xl bg-[#C9A84C]/20 text-[#C9A84C] text-xs font-bold border border-[#C9A84C]/30 active:scale-95 transition-transform"
          },"توليد")
        )
      ),

      // الحالة
      React.createElement('div',{className:"flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/8"},
        React.createElement('div',null,
          React.createElement('p',{className:"text-xs font-black text-white"},"حالة البوابة"),
          React.createElement('p',{className:`text-[10px] ${isActive?'text-[#C9A84C]':'text-red-400'}`},
            isActive?'مفعّلة — الموكل يستطيع الدخول':'معطّلة — لا يمكن الوصول')
        ),
        React.createElement('button',{
          onClick:()=>setIsActive((s: boolean) =>!s),
          className:`w-12 h-6 rounded-full transition-all relative ${isActive?'bg-[#C9A84C]':'bg-slate-600'}`
        },
          React.createElement('div',{className:`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow ${isActive?'right-0.5':'left-0.5'}`})
        )
      ),

      // معلومات الوصول
      existing && React.createElement('div',{
        className:"p-3 rounded-xl bg-[#C9A84C]/10 border border-[#C9A84C]/20 space-y-1"
      },
        React.createElement('p',{className:"text-[10px] font-bold text-[#C9A84C]"},"معلومات الوصول للموكل"),
        React.createElement('p',{className:"text-[10px] text-slate-400"},"رابط البوابة: /client-portal-pin.html"),
        React.createElement('p',{className:"text-[10px] text-slate-400"},"البريد: "+client.email),
        React.createElement('p',{className:"text-[10px] text-amber-400"},"PIN مُفعّل — لأسباب أمنية لا يمكن عرضه، اكتب رقمًا جديدًا لو الموكل نسيه")
      ),

      React.createElement('button',{
        onClick:()=>onSave({client_id:client.id,pin,is_active:isActive,client_name:client.full_name || '—',email:client.email}),
        disabled:saving||pin.length!==4,
        className:"w-full py-3 rounded-xl text-xs font-black text-premium-bg bg-gradient-to-tr from-premium-gold to-[#E8C97A] shadow-lg active:scale-95 transition-transform disabled:opacity-50"
      },saving?'جاري الحفظ...':'حفظ الإعدادات')
    )
  );
}

export default ClientPortalModal;
