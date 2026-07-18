import React from 'react';
import { createPortal } from 'react-dom';
import type { CaseFeeRow } from '../../types';

interface SummaryModalProps {
  showSummaryModal: boolean;
  setShowSummaryModal: (v: boolean) => void;
  loadingSummary: boolean;
  fmt: (n: number) => string;
  grandTotal: number;
  grandPaid: number;
  grandRemaining: number;
  feesByCategory: Record<string, CaseFeeRow[]>;
}

function SummaryModal({
  showSummaryModal, setShowSummaryModal, loadingSummary, fmt,
  grandTotal, grandPaid, grandRemaining, feesByCategory,
}: SummaryModalProps) {
  return showSummaryModal && createPortal(React.createElement('div',{
            className:"fixed z-50 bg-premium-card border-t border-premium-gold/20 rounded-t-3xl overflow-y-auto no-scrollbar shadow-2xl",
            style:{
                top:'calc(var(--app-header-h, 64px) + env(safe-area-inset-top, 0px))',
                bottom:'calc(var(--app-navbar-h, 80px) + env(safe-area-inset-bottom, 0px))',
                left:0, right:0,
            },
            onClick:(e: React.MouseEvent<HTMLDivElement>) =>e.stopPropagation()
        },
            React.createElement('div',{className:"p-5 space-y-4"},
                // رأس المودال
                React.createElement('div',{className:"flex items-center justify-between"},
                    React.createElement('p',{className:"text-sm font-black text-premium-gold"},"💰 الملخص المالي الإجمالي"),
                    React.createElement('button',{onClick:()=>setShowSummaryModal(false),className:"w-7 h-7 rounded-lg bg-white/5 text-slate-400 text-xs active:scale-90"},"✕")
                ),
                // الأرقام الكبيرة
                React.createElement('div',{className:"grid grid-cols-3 gap-3 text-center"},
                    React.createElement('div',{className:"bg-white/5 rounded-2xl p-3"},
                        React.createElement('p',{className:"text-[15px] font-black text-white leading-tight"},loadingSummary?'…':fmt(grandTotal)),
                        React.createElement('p',{className:"text-[8px] text-slate-500 mt-0.5 font-bold"},"إجمالي الاتفاقات")
                    ),
                    React.createElement('div',{className:"bg-emerald-500/10 rounded-2xl p-3"},
                        React.createElement('p',{className:"text-[15px] font-black text-emerald-400 leading-tight"},loadingSummary?'…':fmt(grandPaid)),
                        React.createElement('p',{className:"text-[8px] text-slate-500 mt-0.5 font-bold"},"المحصّل فعلياً")
                    ),
                    React.createElement('div',{className:"bg-rose-500/10 rounded-2xl p-3"},
                        React.createElement('p',{className:"text-[15px] font-black text-rose-400 leading-tight"},loadingSummary?'…':fmt(grandRemaining)),
                        React.createElement('p',{className:"text-[8px] text-slate-500 mt-0.5 font-bold"},"المتبقي")
                    )
                ),
                // شريط نسبة التحصيل
                grandTotal > 0 && React.createElement('div',null,
                    React.createElement('div',{className:"flex items-center justify-between mb-1"},
                        React.createElement('span',{className:"text-[9px] text-slate-500"},"نسبة التحصيل"),
                        React.createElement('span',{className:"text-[9px] font-black text-emerald-400"},Math.round((grandPaid/grandTotal)*100)+'%')
                    ),
                    React.createElement('div',{className:"h-2 rounded-full bg-white/5 overflow-hidden"},
                        React.createElement('div',{
                            className:"h-full rounded-full transition-all",
                            style:{width:Math.round((grandPaid/grandTotal)*100)+'%',background:'linear-gradient(90deg,#10b981,#34d399)'}
                        })
                    )
                ),
                // توزيع القضايا
                React.createElement('div',null,
                    React.createElement('p',{className:"text-[9px] font-black text-slate-500 mb-2 tracking-widest"},"— توزيع القضايا —"),
                    React.createElement('div',{className:"grid grid-cols-3 gap-2 text-center"},
                        [
                            {label:'محصّلة', value: feesByCategory.collected.length, color:'text-emerald-400', bg:'bg-emerald-500/10'},
                            {label:'مؤجلة',  value: feesByCategory.deferred.length,  color:'text-amber-400',   bg:'bg-amber-500/10'},
                            {label:'مفتوحة', value: feesByCategory.open.length,      color:'text-rose-400',    bg:'bg-rose-500/10'},
                        ].map((s: {label: string; value: number; color: string; bg: string}) =>React.createElement('div',{key:s.label,className:`${s.bg} rounded-xl p-2.5`},
                            React.createElement('p',{className:`text-base font-black ${s.color}`},s.value),
                            React.createElement('p',{className:"text-[8px] text-slate-500 mt-0.5"},s.label)
                        ))
                    )
                ),
                React.createElement('button',{
                    onClick:()=>setShowSummaryModal(false),
                    className:"w-full py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"
                },"إغلاق")
            )
        ), document.body);
}

export default SummaryModal;
