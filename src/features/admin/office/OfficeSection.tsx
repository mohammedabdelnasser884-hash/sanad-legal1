import React from 'react';
import { I } from '../../../constants';
import { IconOffice } from '../icons';
import type { OfficeSettingsForm } from './hooks/useAdminOffice';

// شكل عناصر مصفوفات الحقول المحلية (name/slogan/phone/social/...) —
// بعض الخصائص اختيارية لأن كل مصفوفة بتستخدم مجموعة فرعية مختلفة منها.
interface FieldDef {
  key: keyof OfficeSettingsForm;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
  hint?: string;
}

interface OfficeSectionProps {
  loadingOffice: boolean;
  logoPreview: string | null;
  setLogoFile: React.Dispatch<React.SetStateAction<File | null>>;
  setLogoPreview: React.Dispatch<React.SetStateAction<string | null>>;
  officeSettings: OfficeSettingsForm;
  setOfficeSettings: React.Dispatch<React.SetStateAction<OfficeSettingsForm>>;
  savingOffice: boolean;
  handleSaveOfficeSettings: () => void | Promise<void>;
}

function OfficeSection({
  loadingOffice, logoPreview, setLogoFile, setLogoPreview,
  officeSettings, setOfficeSettings, savingOffice, handleSaveOfficeSettings,
}: OfficeSectionProps) {
  return React.createElement('div',{className:"space-y-4 fade-in"},

      // ── هيدر ──
      React.createElement('div',{className:"flex items-center gap-2 p-3 rounded-xl bg-[#C9A84C]/10 border border-[#C9A84C]/20"},
        React.createElement('div',{className:"w-8 h-8 rounded-xl bg-[#C9A84C]/20 flex items-center justify-center"},
          React.createElement(IconOffice)
        ),
        React.createElement('div',null,
          React.createElement('p',{className:"text-xs font-black text-white"},"إعدادات المكتب"),
          React.createElement('p',{className:"text-[10px] text-[#C9A84C]"},"الهوية البصرية وبيانات التواصل والفاتورة")
        )
      ),

      loadingOffice
        ? React.createElement('div',{className:"flex items-center justify-center py-10 gap-2 text-slate-500 text-xs"},
            React.createElement(I.Spin), "جاري التحميل...")

        : React.createElement('div',{className:"space-y-4"},

          // ── الشعار ──
          React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3"},
            React.createElement('p',{className:"text-xs font-black text-white"},"🖼 شعار المكتب"),
            React.createElement('div',{className:"flex items-center gap-4"},
              // معاينة الشعار
              React.createElement('div',{
                className:"w-20 h-20 rounded-2xl border-2 border-dashed border-white/15 flex items-center justify-center overflow-hidden flex-shrink-0",
                style:{background:'rgba(255,255,255,0.03)'}
              },
                logoPreview
                  ? React.createElement('img',{src:logoPreview, alt:"شعار المكتب", className:"w-full h-full object-contain"})
                  : React.createElement('div',{className:"text-center"},
                      React.createElement('p',{className:"text-2xl"},"🏛"),
                      React.createElement('p',{className:"text-[8px] text-slate-600 mt-1"},"لا يوجد شعار")
                    )
              ),
              React.createElement('div',{className:"flex-1 space-y-2"},
                React.createElement('label',{
                  className:"flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-dashed border-[#C9A84C]/30 bg-[#C9A84C]/5 text-[#C9A84C] text-xs font-bold cursor-pointer active:scale-95 transition-transform"
                },
                  React.createElement('span',null,"📤"),
                  React.createElement('span',null,"رفع شعار"),
                  React.createElement('input',{
                    type:"file", accept:"image/*", className:"hidden",
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setLogoFile(f);
                      const reader = new FileReader();
                      reader.onload = (ev: ProgressEvent<FileReader>) => setLogoPreview(ev.target?.result as string);
                      reader.readAsDataURL(f);
                    }
                  })
                ),
                logoPreview && React.createElement('button',{
                  onClick:()=>{ setLogoPreview(null); setLogoFile(null); setOfficeSettings((s: OfficeSettingsForm) =>({...s,logoUrl:''})); },
                  className:"w-full py-1.5 rounded-xl border border-red-500/20 text-red-400 text-[10px] font-bold active:scale-95 transition-transform"
                },"حذف الشعار"),
                React.createElement('p',{className:"text-[9px] text-slate-600"},"PNG أو JPG — بحد أقصى 2MB")
              )
            )
          ),

          // ── بيانات المكتب ──
          React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3"},
            React.createElement('p',{className:"text-xs font-black text-white"},"🏛 بيانات المكتب"),
            ...([
              {key:'name', label:'اسم المكتب', placeholder:'سَنَد', required:true},
              {key:'slogan', label:'الشعار النصي / السلوجن', placeholder:'العدالة أمانة'},
              {key:'licenseNumber', label:'رقم الترخيص المهني', placeholder:'12345/2024'},
            ] as FieldDef[]).map((f) => React.createElement('div',{key:f.key},
              React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-1"},
                f.label, f.required && React.createElement('span',{className:"text-red-400 mr-1"},"*")),
              React.createElement('input',{
                value: officeSettings[f.key] || '',
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => setOfficeSettings((s: OfficeSettingsForm) =>({...s,[f.key]:e.target.value})),
                placeholder: f.placeholder,
                className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-600",
                style:{fontFamily:'Cairo,sans-serif'}
              })
            ))
          ),

          // ── بيانات التواصل ──
          React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3"},
            React.createElement('p',{className:"text-xs font-black text-white"},"📞 بيانات التواصل"),
            ...([
              {key:'phone',    label:'رقم الهاتف الرئيسي', placeholder:'+966500000000', type:'tel'},
              {key:'phone2',   label:'رقم هاتف إضافي',     placeholder:'+966500000001', type:'tel'},
              {key:'whatsapp', label:'واتساب',              placeholder:'+966500000000', type:'tel'},
              {key:'email',    label:'البريد الإلكتروني',   placeholder:'office@law.com', type:'email'},
              {key:'website',  label:'الموقع الإلكتروني',   placeholder:'www.example-law.com', type:'url'},
              {key:'address',  label:'العنوان',              placeholder:'الرياض، حي العليا، شارع ...'},
            ] as FieldDef[]).map((f) => React.createElement('div',{key:f.key},
              React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-1"},f.label),
              React.createElement('input',{
                value: officeSettings[f.key] || '',
                type: f.type || 'text',
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => setOfficeSettings((s: OfficeSettingsForm) =>({...s,[f.key]:e.target.value})),
                placeholder: f.placeholder,
                className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-600",
                style:{fontFamily:'Cairo,sans-serif',direction:f.type==='url'||f.type==='email'||f.type==='tel'?'ltr':'rtl'}
              })
            )),

            // السوشيال ميديا
            React.createElement('div',{className:"grid grid-cols-2 gap-2"},
              ...([
                {key:'facebook',  label:'فيسبوك',   placeholder:'facebook.com/...'},
                {key:'instagram', label:'إنستجرام',  placeholder:'instagram.com/...'},
              ] as FieldDef[]).map((f) => React.createElement('div',{key:f.key},
                React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-1"},f.label),
                React.createElement('input',{
                  value: officeSettings[f.key] || '',
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => setOfficeSettings((s: OfficeSettingsForm) =>({...s,[f.key]:e.target.value})),
                  placeholder: f.placeholder,
                  className:"w-full p-2 text-[10px] rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-600",
                  style:{fontFamily:'Cairo,sans-serif',direction:'ltr'}
                })
              ))
            )
          ),

          // ── تخصيص البراند ──
          React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3"},
            React.createElement('p',{className:"text-xs font-black text-white"},"🎨 ألوان البراند"),
            React.createElement('div',{className:"grid grid-cols-2 gap-3"},
              ...([
                {key:'brandColor',  label:'اللون الرئيسي',  hint:'الذهبي / العنوان'},
                {key:'accentColor', label:'اللون الثانوي',  hint:'الخلفية / الداكن'},
              ] as FieldDef[]).map((f) => React.createElement('div',{key:f.key, className:"space-y-2"},
                React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block"},f.label),
                React.createElement('div',{className:"flex items-center gap-2"},
                  React.createElement('input',{
                    type:"color",
                    value: officeSettings[f.key] || '#D4AF37',
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setOfficeSettings((s: OfficeSettingsForm) =>({...s,[f.key]:e.target.value})),
                    className:"w-10 h-10 rounded-xl border border-white/10 cursor-pointer bg-transparent",
                    style:{padding:'2px'}
                  }),
                  React.createElement('div',{className:"flex-1"},
                    React.createElement('div',{
                      className:"w-full h-8 rounded-xl border border-white/10",
                      style:{background: officeSettings[f.key] || '#D4AF37'}
                    }),
                    React.createElement('p',{className:"text-[9px] text-slate-600 mt-1"},f.hint)
                  )
                )
              ))
            ),
            // معاينة البراند
            React.createElement('div',{
              className:"p-3 rounded-xl border",
              style:{background: officeSettings.accentColor || '#1e3a5f', borderColor: officeSettings.brandColor || '#D4AF37'}
            },
              React.createElement('p',{className:"text-[10px] font-black", style:{color: officeSettings.brandColor || '#D4AF37'}},
                officeSettings.name || 'اسم المكتب'),
              React.createElement('p',{className:"text-[9px] text-white/60 mt-0.5"},
                officeSettings.slogan || 'الشعار النصي')
            )
          ),

          // ── بيانات الفاتورة ──
          React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3"},
            React.createElement('p',{className:"text-xs font-black text-white"},"🧾 بيانات الفاتورة"),
            ...([
              {key:'taxNumber',      label:'الرقم الضريبي',          placeholder:'3001234567890001'},
              {key:'invoicePrefix',  label:'بادئة رقم الفاتورة',     placeholder:'INV أو FAT'},
            ] as FieldDef[]).map((f) => React.createElement('div',{key:f.key},
              React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-1"},f.label),
              React.createElement('input',{
                value: officeSettings[f.key] || '',
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => setOfficeSettings((s: OfficeSettingsForm) =>({...s,[f.key]:e.target.value})),
                placeholder: f.placeholder,
                className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-600",
                style:{fontFamily:'Cairo,sans-serif'}
              })
            )),
            React.createElement('div',null,
              React.createElement('label',{className:"text-[10px] font-bold text-slate-400 block mb-1"},"تذييل الفاتورة"),
              React.createElement('textarea',{
                value: officeSettings.invoiceFooter || '',
                onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setOfficeSettings((s: OfficeSettingsForm) =>({...s,invoiceFooter:e.target.value})),
                placeholder:"شكراً لثقتكم — جميع الحقوق محفوظة لسَنَد",
                rows:3,
                className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-600 resize-none",
                style:{fontFamily:'Cairo,sans-serif'}
              })
            ),

            // معاينة رقم الفاتورة
            React.createElement('div',{className:"flex items-center gap-2 p-2 rounded-xl bg-white/4 border border-white/8"},
              React.createElement('p',{className:"text-[9px] text-slate-500"},"مثال على رقم الفاتورة:"),
              React.createElement('p',{className:"text-[10px] font-black text-premium-gold font-mono"},
                (officeSettings.invoicePrefix || 'INV') + '-2024-0001')
            )
          ),

          // ── زر الحفظ ──
          React.createElement('button',{
            onClick: handleSaveOfficeSettings,
            disabled: savingOffice || !officeSettings.name?.trim(),
            className:"w-full py-3.5 rounded-xl text-sm font-black text-premium-bg bg-gradient-to-tr from-[#C9A84C] to-[#E8C97A] shadow-lg active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
          },
            savingOffice
              ? React.createElement(React.Fragment,null, React.createElement(I.Spin), "جاري الحفظ...")
              : React.createElement(React.Fragment,null, React.createElement('span',null,"💾"), "حفظ إعدادات المكتب")
          )
        )
    );
}

export default OfficeSection;
