import React from 'react';
import { I } from '../../../constants';
import type { LawRow, LegalCategoryRow } from '../../../types';

interface StatusConfig {
  label: string;
  bg: string;
  color: string;
}

interface LegalLibrarySectionProps {
  loadingLaws: boolean;
  laws: LawRow[];
  legalCategories: LegalCategoryRow[];
  processingLaw: { id: string } | null;
  handleProcessLaw: (law: LawRow) => void | Promise<void>;
  setEditingLaw: React.Dispatch<React.SetStateAction<LawRow | null>>;
  setShowLawModal: React.Dispatch<React.SetStateAction<boolean>>;
  setConfirmDeleteLaw: React.Dispatch<React.SetStateAction<LawRow | null>>;
}

function LegalLibrarySection({
  loadingLaws, laws, legalCategories, processingLaw,
  handleProcessLaw, setEditingLaw, setShowLawModal, setConfirmDeleteLaw,
}: LegalLibrarySectionProps) {
  return React.createElement('div',{className:"space-y-3 fade-in"},

      // شرح بسيط
      React.createElement('div',{className:"bg-premium-card border border-teal-500/15 rounded-2xl p-3.5 flex items-start gap-2.5"},
        React.createElement('div',{className:"w-8 h-8 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400 shrink-0"},
          React.createElement(I.Doc)
        ),
        React.createElement('p',{className:"text-[11px] text-slate-400 leading-relaxed"},
          "القوانين المرفوعة هنا تُستخدم كمصدر يعتمد عليه المساعد القانوني الذكي عند الإجابة. ارفع ملف PDF لكل قانون، وصنّفه، وسيتم استخراج المواد منه تلقائياً."
        )
      ),

      loadingLaws
        ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs"},
            React.createElement(I.Spin), React.createElement('span',{className:"mr-2"},"جاري التحميل...")
          )
        : laws.length === 0
          ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-xl p-10 text-center text-slate-500 text-xs"},"لا توجد قوانين مضافة بعد")
          : laws.map((law: LawRow) => {
              const cat = legalCategories.find((c: LegalCategoryRow) => c.id === law.category_id);
              const statusCfg = ({
                pending:    {label:'بانتظار المعالجة', bg:'rgba(148,163,184,0.12)', color:'#94a3b8'},
                processing: {label:'قيد المعالجة',      bg:'rgba(96,165,250,0.12)', color:'#60a5fa'},
                completed:  {label:'مكتمل المعالجة',    bg:'rgba(74,222,128,0.12)', color:'#4ade80'},
                failed:     {label:'فشلت المعالجة',     bg:'rgba(248,113,113,0.12)', color:'#f87171'},
              } as Record<string, StatusConfig>)[law.status as string] || {label:law.status, bg:'rgba(148,163,184,0.12)', color:'#94a3b8'};

              return React.createElement('div',{
                key: law.id,
                className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-2.5"
              },
                // العنوان + الحالة
                React.createElement('div',{className:"flex items-start justify-between gap-2"},
                  React.createElement('div',{className:"flex-1 min-w-0"},
                    React.createElement('p',{className:"text-xs font-black text-white leading-snug"}, law.title),
                    React.createElement('p',{className:"text-[10px] text-slate-500 mt-0.5"},
                      [law.law_number ? `رقم ${law.law_number}` : null, law.law_year ? `لسنة ${law.law_year}` : null].filter(Boolean).join(' ') || '—'
                    )
                  ),
                  React.createElement('span',{
                    className:"text-[9.5px] font-black px-2 py-1 rounded-lg shrink-0",
                    style:{background:statusCfg.bg, color:statusCfg.color}
                  }, statusCfg.label)
                ),

                // التصنيف + عدد المواد
                React.createElement('div',{className:"flex items-center gap-2"},
                  cat && React.createElement('span',{
                    className:"text-[9.5px] font-bold px-2 py-1 rounded-lg",
                    style:{background:'rgba(45,212,191,0.1)', color:'#2dd4bf'}
                  }, cat.name_ar),
                  React.createElement('span',{className:"text-[9.5px] font-bold px-2 py-1 rounded-lg bg-white/5 text-slate-400"},
                    `${law.articles_count || 0} مادة`
                  )
                ),

                law.processing_error && React.createElement('p',{className:"text-[10px] text-red-400 leading-relaxed"},
                  "خطأ: " + law.processing_error
                ),

                // شريط التقدم أثناء المعالجة
                processingLaw?.id === law.id && React.createElement('div',{className:"space-y-1.5"},
                  React.createElement('div',{className:"flex items-center justify-between text-[10px] text-slate-400"},
                    React.createElement('span',null, 'جاري استخراج المواد من الملف...'),
                    React.createElement(I.Spin)
                  ),
                  React.createElement('div',{className:"h-1.5 rounded-full bg-white/5 overflow-hidden"},
                    React.createElement('div',{className:"h-full bg-teal-400 animate-pulse",style:{width:'100%'}})
                  )
                ),

                // زر معالجة / إعادة معالجة
                !processingLaw && React.createElement('button',{
                  onClick:()=>handleProcessLaw(law),
                  disabled: !!processingLaw,
                  className:"w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-black active:scale-95 transition-transform disabled:opacity-50",
                  style:{background:'rgba(45,212,191,0.1)', color:'#2dd4bf', border:'1px solid rgba(45,212,191,0.2)'}
                },
                  React.createElement(I.Refresh),
                  law.status === 'completed' ? 'إعادة معالجة القانون' : 'معالجة القانون واستخراج المواد'
                ),

                // أزرار التحكم
                React.createElement('div',{className:"flex items-center gap-2 pt-1"},
                  React.createElement('button',{
                    onClick:()=>{ setEditingLaw(law); setShowLawModal(true); },
                    className:"flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-[11px] font-bold active:scale-95 transition-transform"
                  }, React.createElement(I.Edit), "تعديل"),
                  React.createElement('button',{
                    onClick:()=>setConfirmDeleteLaw(law),
                    className:"flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-bold active:scale-95 transition-transform"
                  }, React.createElement(I.Trash), "حذف")
                )
              );
            })
    );
}

export default LegalLibrarySection;
