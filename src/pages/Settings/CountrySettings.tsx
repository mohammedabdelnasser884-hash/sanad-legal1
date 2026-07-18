import React, { useState } from 'react';
import { I, COUNTRY_CONFIGS, saveOfficeSetting } from '../../constants';
import type { CountryConfig } from '../../constants';
import { toast } from '../../shared/lib/notifications';

interface CountrySettingsProps {
  currentCountry: string;
  onCountryChange: (country: string) => void;
}

function CountrySettings({currentCountry, onCountryChange}: CountrySettingsProps){
  const [selected, setSelected]=useState(currentCountry||'SA');
  const [preview, setPreview]=useState(false);
  const [showConfirm, setShowConfirm]=useState(false);
  const [saving, setSaving]=useState(false);
  const cfg=COUNTRY_CONFIGS[selected];
  const currentCfg=COUNTRY_CONFIGS[currentCountry||'SA'];

  const handleSave=async()=>{
    if(selected===currentCountry){toast('الدولة المختارة هي نفس الدولة الحالية');setShowConfirm(false);return;}
    setSaving(true);
    try {
      await saveOfficeSetting('country',selected);
      setShowConfirm(false);
      onCountryChange(selected);
      toast(`✅ تم تغيير الدولة إلى ${COUNTRY_CONFIGS[selected].name}`);
    } catch (err) {
      console.error('CountrySettings save failed:', err);
      toast('❌ فشل حفظ الدولة، حاول مرة أخرى');
    } finally {
      setSaving(false);
    }
  };

  return React.createElement('div',{className:"space-y-5"},
    // عنوان القسم
    React.createElement('div',{className:"flex items-center gap-3 pb-2 border-b border-white/5"},
      React.createElement('div',{className:"w-9 h-9 rounded-xl flex items-center justify-center text-xl",style:{background:'rgba(212,175,55,0.1)',border:'1px solid rgba(212,175,55,0.2)'}},
        React.createElement('span',null,'🌍')
      ),
      React.createElement('div',null,
        React.createElement('h3',{className:"text-sm font-black text-white"},"إعدادات الدولة والنظام القانوني"),
        React.createElement('p',{className:"text-[10px] text-slate-500"},"اختر الدولة ليتكيف النظام تلقائياً")
      )
    ),

    // شبكة الدول
    React.createElement('div',{className:"grid grid-cols-2 gap-2.5"},
      Object.entries(COUNTRY_CONFIGS).map(([code,c]: [string, CountryConfig])=>
        React.createElement('button',{
          key:code,
          onClick:()=>{setSelected(code);setPreview(true);},
          className:`relative flex items-center gap-2.5 p-3 rounded-2xl border transition-all active:scale-[0.97] text-right ${selected===code?'border-premium-gold/60 bg-premium-gold/10':'border-white/8 bg-white/3 hover:border-white/15'}`,
        },
          React.createElement('span',{className:"text-2xl shrink-0"},c.flag),
          React.createElement('div',{className:"flex-1 min-w-0"},
            React.createElement('p',{className:`text-[10px] font-black truncate ${selected===code?'text-premium-gold':'text-white'}`},c.name),
            React.createElement('p',{className:"text-[9px] text-slate-500 truncate"},c.currencyCode)
          ),
          selected===code&&React.createElement('div',{className:"absolute top-2 left-2 w-4 h-4 rounded-full bg-premium-gold flex items-center justify-center"},
            React.createElement('svg',{className:"w-2.5 h-2.5 text-premium-bg",fill:"none",viewBox:"0 0 24 24",strokeWidth:"3",stroke:"currentColor"},
              React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"m4.5 12.75 6 6 9-13.5"})
            )
          )
        )
      )
    ),

    // بريفيو
    preview&&cfg&&React.createElement('div',{className:"bg-premium-card border border-premium-gold/20 rounded-2xl p-4 space-y-3 fade-in"},
      React.createElement('div',{className:"flex items-center gap-2 mb-3"},
        React.createElement('span',{className:"text-2xl"},cfg.flag),
        React.createElement('div',null,
          React.createElement('p',{className:"text-xs font-black text-premium-gold"},cfg.name),
          React.createElement('p',{className:"text-[9px] text-slate-500"},cfg.legalSystem)
        )
      ),
      // التفاصيل
      [
        {label:'💰 العملة', val:`${cfg.currency} (${cfg.currencyCode})`},
        {label:'📅 التاريخ', val:cfg.calendarNote},
        {label:'📋 المرجع القانوني', val:cfg.referenceCode},
      ].map(({label,val}: {label: string; val: string})=>
        React.createElement('div',{key:label,className:"flex gap-2"},
          React.createElement('span',{className:"text-[9px] text-slate-400 font-bold w-20 shrink-0"},label),
          React.createElement('span',{className:"text-[9px] text-slate-200 flex-1 leading-relaxed"},val)
        )
      ),
      // المحاكم
      React.createElement('div',null,
        React.createElement('p',{className:"text-[9px] font-black text-slate-400 mb-1.5"},"🏛️ المحاكم المتاحة"),
        React.createElement('div',{className:"flex flex-wrap gap-1"},
          cfg.courts.slice(0,4).map((c: string) =>
            React.createElement('span',{key:c,className:"text-[8px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded-full text-slate-300"},c)
          ),
          cfg.courts.length>4&&React.createElement('span',{className:"text-[8px] text-premium-gold/60"},`+${cfg.courts.length-4} أخرى`)
        )
      ),
      // مثال على صياغة المستند
      React.createElement('div',{className:"bg-black/30 rounded-xl p-3"},
        React.createElement('p',{className:"text-[9px] font-black text-slate-400 mb-1"},"📝 مثال على ترويسة المستند"),
        React.createElement('pre',{className:"text-[9px] text-slate-300 leading-relaxed whitespace-pre-wrap font-sans"},
          cfg.docHeader+cfg.greeting
        )
      )
    ),

    // زر الحفظ
    selected!==currentCountry&&React.createElement('button',{
      onClick:()=>setShowConfirm(true),
      className:"w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all",
      style:{background:'linear-gradient(135deg,#D4AF37,#E8C84A)',color:'#070d1a',boxShadow:'0 8px 20px rgba(212,175,55,0.25)'}
    },
      React.createElement('span',{className:"text-lg"},cfg.flag),
      `حفظ — التبديل إلى ${cfg.name}`
    ),

    // نافذة تأكيد التغيير
    showConfirm&&React.createElement('div',{className:"fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"},
      React.createElement('div',{className:"w-full max-w-sm bg-premium-card border border-amber-500/30 rounded-3xl p-6 slide-up shadow-2xl space-y-4"},
        React.createElement('div',{className:"flex items-center gap-3"},
          React.createElement('div',{className:"w-12 h-12 rounded-2xl bg-amber-500/15 flex items-center justify-center text-2xl shrink-0"},'⚠️'),
          React.createElement('div',null,
            React.createElement('h3',{className:"text-sm font-black text-white"},"تأكيد تغيير الدولة"),
            React.createElement('p',{className:"text-[10px] text-amber-400 font-bold"},"هذا الإجراء سيؤثر على النظام بالكامل")
          )
        ),
        React.createElement('div',{className:"bg-amber-500/8 border border-amber-500/20 rounded-xl p-3 space-y-1.5 text-[10px] text-slate-300"},
          React.createElement('p',null,"• ستتغير قائمة المحاكم في جميع القضايا"),
          React.createElement('p',null,"• ستتبدل قوالب المستندات للصياغة القانونية الجديدة"),
          React.createElement('p',null,"• سيتغير المرجع القانوني في المساعد الذكي"),
          React.createElement('p',null,"• ستتغير أنواع القضايا المتاحة"),
        ),
        React.createElement('div',{className:"flex items-center justify-center gap-3 text-lg pt-1"},
          React.createElement('span',null,currentCfg.flag),
          React.createElement('svg',{className:"w-4 h-4 text-slate-500",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M8.25 4.5l7.5 7.5-7.5 7.5"})),
          React.createElement('span',null,cfg.flag),
          React.createElement('span',{className:"text-xs text-premium-gold font-bold"},cfg.name)
        ),
        React.createElement('div',{className:"flex gap-2 pt-1"},
          React.createElement('button',{
            onClick:handleSave,
            disabled:saving,
            className:"flex-1 py-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 transition-all",
            style:{background:'linear-gradient(135deg,#D4AF37,#E8C84A)',color:'#070d1a'}
          }, saving?React.createElement(I.Spin):"✅ تأكيد التغيير"),
          React.createElement('button',{onClick:()=>setShowConfirm(false),className:"flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-slate-400 active:scale-95"},"إلغاء")
        )
      )
    )
  );
}

export default CountrySettings;
