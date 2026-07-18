import React, { useState, useEffect, useRef } from 'react';
import { toast } from '../../shared/lib/notifications';
import { validateUploadFile } from '../../shared/lib/storage';
import { I, COUNTRY_CONFIGS } from '../../constants';
import { loadOfficeSetting, saveOfficeSetting } from "../../constants";
import { db } from '../../supabaseClient';
import { useAdminOffice, type OfficeSettingsForm } from '../../features/admin/office/hooks/useAdminOffice';
import CountrySettings from './CountrySettings';
import type { ProfileRow } from '../../types';

interface SettingsPageProps {
  profile: ProfileRow | null;
  isAdmin: boolean;
  country: string;
  onCountryChange: (country: string) => void;
  onClose: () => void;
}

// شكل صف التبويبات في هيدر الشاشة (country/office/legal/notifications)
interface SettingsSectionTab {
  id: string;
  label: string;
  icon: string;
}

// شكل كل حقل من حقول بيانات المكتب (اسم المكتب/العنوان/تليفون/إيميل) —
// key محدد كـ keyof OfficeSettingsForm عشان الوصول لـ office.officeSettings[key]
// يفضل type-safe من غير أي كاست.
interface OfficeTextField {
  key: keyof OfficeSettingsForm;
  label: string;
  placeholder: string;
}

// شكل صف "معلومات النظام الحالي" (الدولة/العملة/النظام القانوني/نظام التاريخ)
interface SystemInfoRow {
  l: string;
  v: string;
}

// شكل نتيجة قراءة أعمدة الـ secret id بتاعة توكنات التليجرام من office_settings
// (بيتقرا بس عشان نعرف هل التوكن مضبوط أو لأ، مش القيمة نفسها — راجع التعليق تحت)
interface TgSecretIdsRow {
  tg_daily_token_secret_id: string | null;
  tg_instant_token_secret_id: string | null;
}

function SettingsPage({profile, isAdmin, country, onCountryChange, onClose}: SettingsPageProps){
  const [section, setSection]=useState('country');
  const cfg=COUNTRY_CONFIGS[country||'SA'];

  // ── Telegram settings state (بوتين منفصلين) ──
  // ⚠️ التوكنات (tg_daily_token / tg_instant_token) بقوا مخزّنين في
  // Supabase Vault ومبيوصلوش للمتصفح إطلاقاً — راجع
  // 09-telegram-token-vault-migration.sql. فبدل ما نحمّل القيمة
  // الحقيقية، بنحمّل بس "هل فيه توكن مضبوط ولا لأ" (has*Token)، وأي
  // كتابة في حقل التوكن معناها "توكن جديد عايز تحفظه" مش تعديل قيمة
  // موجودة. الـ Chat ID (مش سرّي) فضل بيتحمّل/يتحفظ بشكل عادي.
  const [hasTgDailyToken, setHasTgDailyToken] = useState(false);
  const [hasTgInstantToken, setHasTgInstantToken] = useState(false);
  const [tgDailyTokenInput, setTgDailyTokenInput] = useState('');
  const [tgInstantTokenInput, setTgInstantTokenInput] = useState('');
  const [tgDailyChat,  setTgDailyChat]  = useState('');
  const [tgInstantChat,  setTgInstantChat]  = useState('');
  const [tgLoaded, setTgLoaded] = useState(false);
  const [tgSaving, setTgSaving] = useState(false);
  const [showTgDailyToken, setShowTgDailyToken] = useState(false);
  const [showTgInstantToken, setShowTgInstantToken] = useState(false);

  // ── Office settings: نفس المصدر بالظبط اللي بتستخدمه لوحة الأدمن (AdminPanel) ──
  // ⚠️ قبل كده كانت الشاشة دي عندها state وحفظ منفصلين تمامًا (saveOffice
  // محلية بتكتب عمود-عمود عن طريق saveOfficeSetting)، بينما لوحة الأدمن
  // بتكتب نفس الجدول دفعة واحدة عن طريق useAdminOffice. النتيجة كانت
  // تعارض كاش لو الاتنين اتفتحوا في نفس الوقت. دلوقتي الشاشتين بيستخدموا
  // نفس الـ hook، فمفيش مسارين مختلفين بيلمسوا نفس البيانات.
  const office = useAdminOffice(profile?.tenant_id ?? null, profile);
  const [officeLoaded, setOfficeLoaded] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(()=>{
    if(section==='notifications' && !tgLoaded){
      const tenantId = profile?.tenant_id ?? null;
      Promise.all([
        loadOfficeSetting('tg_daily_chat'),
        loadOfficeSetting('tg_instant_chat'),
        tenantId
          ? db.from('office_settings').select('tg_daily_token_secret_id,tg_instant_token_secret_id').eq('tenant_id', tenantId).limit(1).maybeSingle()
          : Promise.resolve({ data: null as TgSecretIdsRow | null }),
      ]).then(([dc,ic,secRes]: [string | null, string | null, { data: TgSecretIdsRow | null }])=>{
        setTgDailyChat(dc||''); setTgInstantChat(ic||'');
        setHasTgDailyToken(!!secRes?.data?.tg_daily_token_secret_id);
        setHasTgInstantToken(!!secRes?.data?.tg_instant_token_secret_id);
        setTgLoaded(true);
      });
    }
    if(section==='office' && !officeLoaded){
      office.fetchOfficeSettings().then(()=>setOfficeLoaded(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[section]);
  // (service_role → Vault) بدل الكتابة المباشرة كنص صريح عبر
  // saveOfficeSetting — عشان القيمة الحساسة متعديش على الفرونت إند
  // ولا تتخزن كنص عادي في الجدول. الـ Chat ID فضل بيتحفظ عادي.
  const saveTg = async () => {
    setTgSaving(true);
    try {
      const tasks: Promise<void>[] = [
        saveOfficeSetting('tg_daily_chat',  tgDailyChat.trim()),
        saveOfficeSetting('tg_instant_chat', tgInstantChat.trim()),
      ];

      if (tgDailyTokenInput.trim()) {
        tasks.push(
          db.functions.invoke('office-secrets', { body: { action: 'saveTgDailyToken', tg_daily_token: tgDailyTokenInput.trim() } })
            .then(({ data, error }) => {
              if (error || data?.error) throw new Error(data?.error || error?.message);
              setHasTgDailyToken(true);
              setTgDailyTokenInput('');
            })
        );
      }
      if (tgInstantTokenInput.trim()) {
        tasks.push(
          db.functions.invoke('office-secrets', { body: { action: 'saveTgInstantToken', tg_instant_token: tgInstantTokenInput.trim() } })
            .then(({ data, error }) => {
              if (error || data?.error) throw new Error(data?.error || error?.message);
              setHasTgInstantToken(true);
              setTgInstantTokenInput('');
            })
        );
      }

      await Promise.all(tasks);
      toast('✅ تم حفظ إعدادات التليجرام بأمان على السيرفر');
    } catch (err) {
      console.error('saveTg failed:', err);
      toast('❌ فشل حفظ إعدادات التليجرام، حاول مرة أخرى');
    } finally {
      setTgSaving(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = validateUploadFile(file);
    if (validationError) { toast('❌ ' + validationError, true); return; }
    office.setLogoFile(file);
    // معاينة فورية فقط على الشاشة — القيمة دي مش اللي بتُحفظ في قاعدة البيانات
    const reader = new FileReader();
    reader.onload = (ev: ProgressEvent<FileReader>) => office.setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const sections=[
    {id:'country', label:'الدولة', icon:'🌍'},
    ...(isAdmin ? [{id:'office', label:'المكتب', icon:'🏛️'}] : []),
    {id:'legal', label:'المرجع القانوني', icon:'⚖️'},
    ...(isAdmin ? [{id:'notifications', label:'الإشعارات', icon:'🔔'}] : []),
  ];

  return React.createElement('div',{className:"fixed inset-0 z-50 flex flex-col bg-premium-bg fade-in"},
    // هيدر
    React.createElement('div',{className:"shrink-0 px-4 pt-4 pb-3 border-b border-white/5 bg-premium-card/90 backdrop-blur-lg flex items-center justify-between"},
      React.createElement('div',{className:"flex items-center gap-3"},
        React.createElement('button',{onClick:onClose,className:"w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 active:scale-95"},
          React.createElement(I.ChevronLeft)
        ),
        React.createElement('div',null,
          React.createElement('h2',{className:"text-sm font-black text-white"},"إعدادات سَنَد"),
          React.createElement('p',{className:"text-[10px] text-slate-500 flex items-center gap-1"},
            React.createElement('span',null,cfg?.flag),cfg?.name
          )
        )
      ),
      React.createElement('div',{className:"w-9 h-9 rounded-xl flex items-center justify-center text-lg",style:{background:'rgba(212,175,55,0.1)'}},
        '⚙️'
      )
    ),

    // تبويبات
    React.createElement('div',{className:"shrink-0 px-4 py-3 flex gap-2 border-b border-white/5 overflow-x-auto no-scrollbar"},
      sections.map((s: SettingsSectionTab) =>
        React.createElement('button',{
          key:s.id,
          onClick:()=>setSection(s.id),
          className:`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black whitespace-nowrap transition-all ${section===s.id?'bg-premium-gold/15 text-premium-gold border border-premium-gold/30':'bg-white/3 text-slate-400 border border-white/5'}`
        },
          React.createElement('span',null,s.icon), s.label
        )
      )
    ),

    // المحتوى
    React.createElement('div',{className:"flex-1 overflow-y-auto no-scrollbar px-4 py-4 pb-10"},
      section==='country'&&React.createElement(CountrySettings,{currentCountry:country,onCountryChange}),

      section==='office'&&React.createElement('div',{className:"space-y-4 fade-in"},

        // بيانات المحامي الحالي
        React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 flex items-center gap-3"},
          React.createElement('div',{className:"w-12 h-12 rounded-2xl flex items-center justify-center text-premium-bg font-black text-xl shrink-0",style:{background:'linear-gradient(135deg,#D4AF37,#E8C84A)'}},
            (profile?.full_name||'م').charAt(0)
          ),
          React.createElement('div',null,
            React.createElement('p',{className:"text-sm font-black text-white"},profile?.full_name||'—'),
            React.createElement('p',{className:"text-[10px] text-premium-gold font-bold"},profile?.role==='admin'?'مدير المكتب':'محامي'),
            React.createElement('p',{className:"text-[10px] text-slate-500"},profile?.email||'')
          )
        ),

        // شعار المكتب
        React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4"},
          React.createElement('p',{className:"text-[10px] font-black text-slate-400 mb-3"},"🖼 شعار المكتب"),
          React.createElement('div',{className:"flex items-center gap-3"},
            (office.logoPreview || office.officeSettings.logoUrl)
              ? React.createElement('img',{src:office.logoPreview || office.officeSettings.logoUrl,className:"w-16 h-16 rounded-xl object-contain border border-white/10 bg-white/5"})
              : React.createElement('div',{className:"w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl"},"🏛️"),
            React.createElement('div',{className:"flex-1 space-y-2"},
              React.createElement('button',{
                onClick:()=>logoRef.current?.click(),
                className:"w-full py-2 rounded-xl text-[10px] font-black text-slate-300 border border-white/10 bg-white/5 active:scale-95 transition-all"
              }, (office.logoPreview || office.officeSettings.logoUrl) ? "تغيير الشعار" : "رفع شعار المكتب"),
              (office.logoPreview || office.officeSettings.logoUrl) && React.createElement('button',{
                onClick:()=>{ office.setLogoFile(null); office.setLogoPreview(null); office.setOfficeSettings((s: OfficeSettingsForm) =>({...s, logoUrl:''})); },
                className:"w-full py-2 rounded-xl text-[10px] font-black text-rose-400 border border-rose-500/20 bg-rose-500/5 active:scale-95 transition-all"
              },"حذف الشعار"),
              React.createElement('input',{ref:logoRef,type:"file",accept:"image/*",className:"hidden",onChange:handleLogoUpload})
            )
          )
        ),

        // حقول بيانات المكتب
        React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3"},
          React.createElement('p',{className:"text-[10px] font-black text-slate-400 mb-1"},"📋 بيانات المكتب الرسمية"),
          ...([
            {key:'name',    label:'اسم المكتب / مكتب المحاماة', placeholder:'مثال: مكتب الأستاذ أحمد للمحاماة'},
            {key:'address', label:'العنوان', placeholder:'مثال: القاهرة، مصر الجديدة، ش...'},
            {key:'phone',   label:'تليفون المكتب', placeholder:'مثال: 01234567890'},
            {key:'email',   label:'البريد الإلكتروني', placeholder:'مثال: office@example.com'},
          ] as OfficeTextField[]).map(({key,label,placeholder})=>
            React.createElement('div',{key:key},
              React.createElement('label',{className:"block text-[9px] font-black text-slate-500 mb-1"},label),
              React.createElement('input',{
                value:office.officeSettings[key] || '',
                onChange:(e:React.ChangeEvent<HTMLInputElement>)=>office.setOfficeSettings((s:OfficeSettingsForm)=>({...s,[key]:e.target.value})),
                placeholder,
                className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-700 font-bold"
              })
            )
          ),

          // زر الحفظ
          React.createElement('button',{
            onClick:office.handleSaveOfficeSettings,
            disabled:office.savingOffice,
            className:"w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40 mt-2 text-premium-bg",
            style:{background:'linear-gradient(135deg,#D4AF37,#E8C84A)'}
          },
            office.savingOffice
              ? React.createElement(React.Fragment,null,React.createElement(I.Spin),"جاري الحفظ...")
              : React.createElement(React.Fragment,null,'💾',' حفظ بيانات المكتب')
          )
        ),

        // معلومات النظام
        React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-2"},
          React.createElement('p',{className:"text-[10px] font-black text-slate-400 mb-2"},"⚙️ معلومات النظام الحالي"),
          [
            {l:'الدولة المحددة', v:`${cfg?.flag} ${cfg?.name}`},
            {l:'العملة', v:`${cfg?.currency} (${cfg?.currencyCode})`},
            {l:'النظام القانوني', v:cfg?.legalSystem},
            {l:'نظام التاريخ', v:cfg?.calendarNote},
          ].map(({l,v}: SystemInfoRow)=>
            React.createElement('div',{key:l,className:"flex items-start gap-2"},
              React.createElement('span',{className:"text-[9px] text-slate-500 w-24 shrink-0 pt-0.5"},l),
              React.createElement('span',{className:"text-[9px] text-slate-300 flex-1 leading-relaxed"},v)
            )
          )
        )
      ),

      section==='legal'&&React.createElement('div',{className:"space-y-4 fade-in"},
        React.createElement('div',{className:"flex items-center gap-3 pb-2 border-b border-white/5"},
          React.createElement('div',{className:"w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center"},'⚖️'),
          React.createElement('div',null,
            React.createElement('h3',{className:"text-sm font-black text-white"},"المراجع القانونية"),
            React.createElement('p',{className:"text-[10px] text-slate-500"},`المستخدمة في ${cfg?.name}`)
          )
        ),
        React.createElement('div',{className:"bg-premium-card border border-purple-500/10 rounded-2xl p-4 space-y-3"},
          React.createElement('p',{className:"text-[10px] font-black text-purple-400 mb-2"},"📚 النص المرجعي الأساسي"),
          React.createElement('p',{className:"text-xs text-white font-bold leading-relaxed"},cfg?.referenceCode)
        ),
        React.createElement('div',{className:"space-y-2.5"},
          React.createElement('p',{className:"text-[10px] font-black text-slate-400"},"🔗 روابط الاستشهاد حسب نوع القضية"),
          Object.entries(cfg?.legalRefs||{}).map(([type,ref]: [string, string])=>{
            const typeNames: Record<string, string> ={civil:'مدني',labor:'عمالي',commercial:'تجاري',criminal:'جزائي'};
            return React.createElement('div',{key:type,className:"bg-premium-card border border-white/5 rounded-xl p-3"},
              React.createElement('p',{className:"text-[9px] font-black text-slate-400 mb-1"},typeNames[type]||type),
              React.createElement('p',{className:"text-[10px] text-slate-300 leading-relaxed"},String(ref||'').replace('{{n}}','[رقم المادة]'))
            );
          })
        ),
        React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4"},
          React.createElement('p',{className:"text-[9px] font-black text-slate-400 mb-2"},"🏛️ قائمة المحاكم الكاملة"),
          React.createElement('div',{className:"space-y-1"},
            (cfg?.courts||[]).map((c: string,i: number)=>
              React.createElement('div',{key:c,className:"flex items-center gap-2 py-1"},
                React.createElement('span',{className:"w-5 h-5 rounded-full bg-premium-gold/10 text-premium-gold text-[8px] font-black flex items-center justify-center shrink-0"},i+1),
                React.createElement('span',{className:"text-[10px] text-slate-300"},c)
              )
            )
          )
        )
      ),

      section==='notifications'&&isAdmin&&React.createElement('div',{className:"space-y-4 fade-in"},

        // ═══ بوت التذكيرات اليومية ═══
        React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-4"},
          React.createElement('div',{className:"flex items-center gap-2 mb-1"},
            React.createElement('span',{className:"text-base"},'🌅'),
            React.createElement('div',null,
              React.createElement('p',{className:"text-[11px] font-black text-white"},"بوت التذكيرات اليومية"),
              React.createElement('p',{className:"text-[9px] text-slate-500"},"رسائل ٨ صباحاً و ٥ مساءاً — جلسات ومهام الغد وبعد غد والفائتة")
            )
          ),
          React.createElement('div',null,
            React.createElement('label',{className:"block text-[10px] font-black text-slate-400 mb-1.5"},"🤖 Bot Token"),
            React.createElement('div',{className:"relative"},
              React.createElement('input',{
                type:showTgDailyToken?"text":"password", value:tgDailyTokenInput,
                onChange:(e:React.ChangeEvent<HTMLInputElement>)=>setTgDailyTokenInput(e.target.value),
                placeholder:hasTgDailyToken?"•••••••••• (محفوظ — اكتب توكن جديد للتغيير)":"123456789:ABCdefGHIjklMNOpqrSTUvwxYZ",
                className:"w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",
                style:{fontFamily:'monospace',direction:'ltr',textAlign:'left'}
              }),
              React.createElement('button',{onClick:()=>setShowTgDailyToken((v: boolean) =>!v),className:"absolute left-3 top-3 text-slate-500 text-xs"},showTgDailyToken?'🙈':'👁')
            )
          ),
          React.createElement('div',null,
            React.createElement('label',{className:"block text-[10px] font-black text-slate-400 mb-1.5"},"💬 Chat ID"),
            React.createElement('input',{
              type:"text", value:tgDailyChat,
              onChange:(e:React.ChangeEvent<HTMLInputElement>)=>setTgDailyChat(e.target.value),
              placeholder:"-1001234567890",
              className:"w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",
              style:{fontFamily:'monospace',direction:'ltr',textAlign:'left'}
            })
          )
        ),

        // ═══ بوت التنبيهات الفورية ═══
        React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-4"},
          React.createElement('div',{className:"flex items-center gap-2 mb-1"},
            React.createElement('span',{className:"text-base"},'⚡'),
            React.createElement('div',null,
              React.createElement('p',{className:"text-[11px] font-black text-white"},"بوت التنبيهات الفورية"),
              React.createElement('p',{className:"text-[9px] text-slate-500"},"إشعار لحظي عند إضافة/تعديل/حذف قضية أو موكل أو جلسة")
            )
          ),
          React.createElement('div',null,
            React.createElement('label',{className:"block text-[10px] font-black text-slate-400 mb-1.5"},"🤖 Bot Token"),
            React.createElement('div',{className:"relative"},
              React.createElement('input',{
                type:showTgInstantToken?"text":"password", value:tgInstantTokenInput,
                onChange:(e:React.ChangeEvent<HTMLInputElement>)=>setTgInstantTokenInput(e.target.value),
                placeholder:hasTgInstantToken?"•••••••••• (محفوظ — اكتب توكن جديد للتغيير)":"123456789:ABCdefGHIjklMNOpqrSTUvwxYZ",
                className:"w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",
                style:{fontFamily:'monospace',direction:'ltr',textAlign:'left'}
              }),
              React.createElement('button',{onClick:()=>setShowTgInstantToken((v: boolean) =>!v),className:"absolute left-3 top-3 text-slate-500 text-xs"},showTgInstantToken?'🙈':'👁')
            )
          ),
          React.createElement('div',null,
            React.createElement('label',{className:"block text-[10px] font-black text-slate-400 mb-1.5"},"💬 Chat ID"),
            React.createElement('input',{
              type:"text", value:tgInstantChat,
              onChange:(e:React.ChangeEvent<HTMLInputElement>)=>setTgInstantChat(e.target.value),
              placeholder:"-1001234567890",
              className:"w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",
              style:{fontFamily:'monospace',direction:'ltr',textAlign:'left'}
            })
          )
        ),

        // زر الحفظ المشترك
        React.createElement('button',{
          onClick:saveTg, disabled:tgSaving,
          className:"w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40",
          style:{background:'linear-gradient(135deg,#25d366,#128c7e)',color:'white'}
        }, tgSaving?React.createElement(React.Fragment,null,React.createElement(I.Spin),"جاري..."):React.createElement(React.Fragment,null,'💾 حفظ إعدادات التليجرام')),

        // حالة الإعدادات
        tgLoaded&&React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3"},
          React.createElement('div',{className:"space-y-1.5"},
            React.createElement('p',{className:"text-[9px] font-black text-slate-500"},"🌅 التذكيرات اليومية"),
            React.createElement('div',{className:"flex items-center gap-2"},
              React.createElement('span',{className:`w-2 h-2 rounded-full ${hasTgDailyToken?'bg-emerald-400':'bg-rose-400'}`}),
              React.createElement('span',{className:"text-[10px] text-slate-300"},hasTgDailyToken?'Bot Token: محفوظ ✓':'غير مضبوط')
            ),
            React.createElement('div',{className:"flex items-center gap-2"},
              React.createElement('span',{className:`w-2 h-2 rounded-full ${tgDailyChat?'bg-emerald-400':'bg-rose-400'}`}),
              React.createElement('span',{className:"text-[10px] text-slate-300"},tgDailyChat?'Chat ID: محفوظ ✓':'غير مضبوط')
            )
          ),
          React.createElement('div',{className:"space-y-1.5 pt-2 border-t border-white/5"},
            React.createElement('p',{className:"text-[9px] font-black text-slate-500"},"⚡ التنبيهات الفورية"),
            React.createElement('div',{className:"flex items-center gap-2"},
              React.createElement('span',{className:`w-2 h-2 rounded-full ${hasTgInstantToken?'bg-emerald-400':'bg-rose-400'}`}),
              React.createElement('span',{className:"text-[10px] text-slate-300"},hasTgInstantToken?'Bot Token: محفوظ ✓':'غير مضبوط')
            ),
            React.createElement('div',{className:"flex items-center gap-2"},
              React.createElement('span',{className:`w-2 h-2 rounded-full ${tgInstantChat?'bg-emerald-400':'bg-rose-400'}`}),
              React.createElement('span',{className:"text-[10px] text-slate-300"},tgInstantChat?'Chat ID: محفوظ ✓':'غير مضبوط')
            )
          )
        )
      )
    )
  );
}

export default SettingsPage;
