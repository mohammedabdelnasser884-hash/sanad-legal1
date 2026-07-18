import React from 'react';
import { COUNTRY_CONFIGS } from '../../../../constants';

// ── تاب "المرجع القانوني" داخل قسم إعدادات المكتب ──
// منقول من src/pages/Settings/SettingsPage.tsx (section === 'legal') —
// المرحلة 3 من خطة نقل الإعدادات. عرض فقط، بدون أي منطق حفظ، ونفس
// المحتوى والشكل بالظبط — فقط تغيّر مكان الظهور والصلاحية (admin-only
// بحكم إن قسم المكتب كله داخل AdminPanel، وAdminPanel أصلاً admin-only).

interface OfficeLegalRefTabProps {
  country: string;
}

// أسماء أنواع القضايا بالعربي (مدني/عمالي/تجاري/جزائي) — نفس الخريطة
// المستخدمة أصلاً في تاب "legal" بشاشة الإعدادات القديمة.
const CASE_TYPE_NAMES: Record<string, string> = { civil: 'مدني', labor: 'عمالي', commercial: 'تجاري', criminal: 'جزائي' };

function OfficeLegalRefTab({ country }: OfficeLegalRefTabProps) {
  const cfg = COUNTRY_CONFIGS[country || 'SA'];

  return React.createElement('div', { className: "space-y-4 fade-in" },
    React.createElement('div', { className: "flex items-center gap-3 pb-2 border-b border-white/5" },
      React.createElement('div', { className: "w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center" }, '⚖️'),
      React.createElement('div', null,
        React.createElement('h3', { className: "text-sm font-black text-white" }, "المراجع القانونية"),
        React.createElement('p', { className: "text-[10px] text-slate-500" }, `المستخدمة في ${cfg?.name}`)
      )
    ),
    React.createElement('div', { className: "bg-premium-card border border-purple-500/10 rounded-2xl p-4 space-y-3" },
      React.createElement('p', { className: "text-[10px] font-black text-purple-400 mb-2" }, "📚 النص المرجعي الأساسي"),
      React.createElement('p', { className: "text-xs text-white font-bold leading-relaxed" }, cfg?.referenceCode)
    ),
    React.createElement('div', { className: "space-y-2.5" },
      React.createElement('p', { className: "text-[10px] font-black text-slate-400" }, "🔗 روابط الاستشهاد حسب نوع القضية"),
      Object.entries(cfg?.legalRefs || {}).map(([type, ref]: [string, string]) =>
        React.createElement('div', { key: type, className: "bg-premium-card border border-white/5 rounded-xl p-3" },
          React.createElement('p', { className: "text-[9px] font-black text-slate-400 mb-1" }, CASE_TYPE_NAMES[type] || type),
          React.createElement('p', { className: "text-[10px] text-slate-300 leading-relaxed" }, String(ref || '').replace('{{n}}', '[رقم المادة]'))
        )
      )
    ),
    React.createElement('div', { className: "bg-premium-card border border-white/5 rounded-2xl p-4" },
      React.createElement('p', { className: "text-[9px] font-black text-slate-400 mb-2" }, "🏛️ قائمة المحاكم الكاملة"),
      React.createElement('div', { className: "space-y-1" },
        (cfg?.courts || []).map((c: string, i: number) =>
          React.createElement('div', { key: c, className: "flex items-center gap-2 py-1" },
            React.createElement('span', { className: "w-5 h-5 rounded-full bg-premium-gold/10 text-premium-gold text-[8px] font-black flex items-center justify-center shrink-0" }, i + 1),
            React.createElement('span', { className: "text-[10px] text-slate-300" }, c)
          )
        )
      )
    )
  );
}

export default OfficeLegalRefTab;
