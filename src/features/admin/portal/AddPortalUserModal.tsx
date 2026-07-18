import React, { useState } from 'react';
import { I } from '../../../constants';
import type { ClientRow } from '../../../types';
import type { PortalAccessRow, PortalSaveForm } from './hooks/useAdminPortal';

interface AddPortalUserModalProps {
  clients: ClientRow[];
  portalAccess: PortalAccessRow[];
  onSave: (data: PortalSaveForm) => void;
  onClose: () => void;
  saving: boolean;
}

function AddPortalUserModal({ clients, portalAccess, onSave, onClose, saving }: AddPortalUserModalProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ClientRow | null>(null);
  const [pin, setPin] = useState('');

  const genPin = () => setPin(String(Math.floor(1000 + Math.random() * 9000)));

  const filtered = clients.filter((c) =>
    c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  const hasAccess = (clientId: string) => portalAccess.some((p) => p.client_id === clientId && p.is_active !== false);

  return React.createElement('div',{
    className:"fixed inset-0 z-50 flex items-end justify-center",
    style:{background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)'}
  },
    React.createElement('div',{
      className:"w-full max-w-sm rounded-t-3xl p-5 space-y-4",
      style:{background:'#0d1a2e',border:'1px solid rgba(212,175,55,0.15)',borderBottom:'none',maxHeight:'88vh',overflowY:'auto'}
    },
      // هيدر
      React.createElement('div',{className:"flex items-center justify-between"},
        React.createElement('div',null,
          React.createElement('h3',{className:"text-sm font-black text-white"},"إضافة وصول للبوابة"),
          React.createElement('p',{className:"text-[10px] text-slate-500"},"اختر الموكل وحدد رمز PIN")
        ),
        React.createElement('button',{onClick:onClose,className:"w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-slate-400"},
          React.createElement(I.X))
      ),

      // اختيار الموكل
      React.createElement('div',null,
        React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-2"},"اختر الموكل"),
        React.createElement('input',{
          value:search, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setSearch(e.target.value),
          placeholder:"ابحث بالاسم أو الهاتف...",
          className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-600 mb-2",
          style:{fontFamily:'Cairo,sans-serif'}
        }),
        React.createElement('div',{className:"max-h-40 overflow-y-auto space-y-1.5 no-scrollbar"},
          filtered.length === 0
            ? React.createElement('p',{className:"text-center text-slate-500 text-xs py-4"},"لا يوجد موكلين")
            : filtered.map((c) => {
                const active = hasAccess(c.id);
                const isSel = selected?.id === c.id;
                return React.createElement('button',{
                  key:c.id,
                  onClick:()=>setSelected(c),
                  className:`w-full text-right p-2.5 rounded-xl border transition-all flex items-center justify-between ${isSel?'bg-[#C9A84C]/15 border-[#C9A84C]/40':'bg-white/5 border-white/8 active:scale-95'}`
                },
                  React.createElement('div',null,
                    React.createElement('p',{className:`text-xs font-bold ${isSel?'text-[#C9A84C]':'text-white'}`},c.full_name),
                    c.phone && React.createElement('p',{className:"text-[10px] text-slate-500"},c.phone)
                  ),
                  active && React.createElement('span',{
                    className:"text-[9px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20"
                  },"مفعّل")
                );
              })
        )
      ),

      // PIN
      selected && React.createElement('div',null,
        React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-2"},
          "رمز PIN لـ "+selected.full_name
        ),
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

      // زر الحفظ
      React.createElement('button',{
        onClick:()=>onSave({
          // كاست `!` هنا لأن الزر معطّل أصلاً لو selected=null (disabled أدناه)، فمضمون قيمته وقت النداء الفعلي
          client_id:selected!.id,
          pin,
          is_active:true,
          client_name:selected!.full_name || '—',
          email:selected!.email
        }),
        disabled:saving||!selected||pin.length!==4,
        className:"w-full py-3 rounded-xl text-xs font-black text-premium-bg bg-gradient-to-tr from-premium-gold to-[#E8C97A] shadow-lg active:scale-95 transition-transform disabled:opacity-50"
      },saving?'جاري الحفظ...':'تفعيل الوصول')
    )
  );
}

export default AddPortalUserModal;
