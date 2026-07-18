import React from 'react';
import { createPortal } from 'react-dom';
import { SanadMark } from '../../constants';
import type { InvoiceModalState } from './hooks/useFeesActions';

interface InvoiceModalProps {
  invoiceModal: InvoiceModalState | null;
  setInvoiceModal: (v: InvoiceModalState | null) => void;
  setDetailsFor: (id: string | null) => void;
  officeBrand: { name: string; logoUrl: string };
  currency: string;
  printInvoice: (inv: InvoiceModalState) => void | Promise<void>;
}

function InvoiceModal({
  invoiceModal, setInvoiceModal, setDetailsFor, officeBrand, currency, printInvoice,
}: InvoiceModalProps) {
  return invoiceModal && createPortal(React.createElement('div',{
            className:"fixed z-[60] flex items-center justify-center px-3",
            style:{background:'rgba(0,0,0,0.6)', top:'var(--app-header-h, 64px)', bottom:'var(--app-navbar-h, 80px)', left:0, right:0},
            onClick:()=>{ const fid=invoiceModal?.fee?.id||null; setInvoiceModal(null); setDetailsFor(fid); }
        },
            React.createElement('div',{
                className:"w-full max-w-sm bg-premium-card border border-premium-gold/30 rounded-2xl overflow-y-auto",
                style:{maxHeight:'100%'},
                onClick:(e: React.MouseEvent<HTMLDivElement>) =>e.stopPropagation()
            },
                // ─ رأس المودال ─
                React.createElement('div',{className:"bg-gradient-to-l from-yellow-900/30 to-amber-800/20 border-b border-premium-gold/20 px-4 py-2.5 flex items-center justify-between"},
                    React.createElement('div',{className:"flex items-center gap-2"},
                        React.createElement('div',{className:"w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center text-sm"},"🧾"),
                        React.createElement('div',null,
                            React.createElement('p',{className:"text-xs font-black text-premium-gold"},"فاتورة أتعاب"),
                            React.createElement('p',{className:"text-[9px] text-slate-400"},invoiceModal.invoiceNum)
                        )
                    ),
                    React.createElement('button',{
                        onClick:()=>{ const fid=invoiceModal?.fee?.id||null; setInvoiceModal(null); setDetailsFor(fid); },
                        className:"w-7 h-7 rounded-lg bg-white/5 text-slate-400 text-xs active:scale-90"
                    },"✕")
                ),
                // ─ بيانات الفاتورة ─
                React.createElement('div',{className:"p-3 space-y-2.5"},
                    // شعار + اسم المكتب
                    React.createElement('div',{className:"flex items-center gap-2.5 bg-white/3 rounded-xl p-2.5 border border-white/5"},
                        React.createElement('div',{style:{width:32,height:32,borderRadius:8,background:'#0B1320',
                            border:'1px solid rgba(212,175,55,0.2)',display:'flex',alignItems:'center',
                            justifyContent:'center',flexShrink:0, overflow:'hidden'}},
                            officeBrand.logoUrl
                                ? React.createElement('img',{src:officeBrand.logoUrl, alt:"شعار المكتب", style:{width:'100%',height:'100%',objectFit:'contain'}})
                                : React.createElement(SanadMark,{size:20})
                        ),
                        React.createElement('div',null,
                            React.createElement('p',{className:"text-[11px] font-black text-white"},officeBrand.name||"سَنَد"),
                            React.createElement('p',{className:"text-[8px] text-slate-500"},"نظام التشغيل القانوني")
                        )
                    ),
                    // بطاقات البيانات 2×2
                    React.createElement('div',{className:"grid grid-cols-2 gap-1.5"},
                        [
                            {label:"القضية", value: invoiceModal.caseName, cls:"text-white"},
                            {label:"الموكل", value: invoiceModal.clientName||"—", cls:"text-emerald-400"},
                            {label:"تاريخ الدفع", value: invoiceModal.payDate, cls:"text-blue-400"},
                            {label:"المستلم", value: invoiceModal.receivedBy||"—", cls:"text-purple-400"},
                        ].map((item: {label: string; value: string; cls: string}) =>
                            React.createElement('div',{key:item.label,className:"bg-white/3 rounded-xl p-2 border border-white/5"},
                                React.createElement('p',{className:"text-[7px] text-slate-500 mb-0.5"},item.label),
                                React.createElement('p',{className:`text-[10px] font-black ${item.cls} leading-tight`},item.value)
                            )
                        )
                    ),
                    // مبلغ الدفعة (بارز)
                    React.createElement('div',{className:"bg-gradient-to-l from-amber-900/40 to-yellow-900/20 border border-premium-gold/25 rounded-xl p-2.5 text-center"},
                        React.createElement('p',{className:"text-[8px] text-premium-gold/70 mb-0.5"},"💰 مبلغ هذه الدفعة"),
                        React.createElement('p',{className:"text-xl font-black text-premium-gold"},invoiceModal.amount+" "+currency)
                    ),
                    // إجماليات
                    React.createElement('div',{className:"grid grid-cols-3 gap-1"},
                        [
                            {label:"الإجمالي", value:invoiceModal.totalFees, cls:"text-white"},
                            {label:"المدفوع", value:invoiceModal.paidFees, cls:"text-emerald-400"},
                            {label:"المتبقي", value:invoiceModal.remaining, cls: invoiceModal.isFullyPaid?"text-emerald-400":"text-rose-400"},
                        ].map((item: {label: string; value: string; cls: string}) =>
                            React.createElement('div',{key:item.label,className:"bg-white/3 rounded-xl p-1.5 text-center border border-white/5"},
                                React.createElement('p',{className:`text-[10px] font-black ${item.cls}`},item.value),
                                React.createElement('p',{className:"text-[7px] text-slate-500 mt-0.5"},item.label)
                            )
                        )
                    ),
                    invoiceModal.notes && React.createElement('div',{className:"bg-white/3 rounded-xl p-2 border-r-2 border-premium-gold/50 border border-white/5"},
                        React.createElement('p',{className:"text-[9px] text-slate-400"},"📝 "+invoiceModal.notes)
                    ),
                    // أزرار
                    React.createElement('div',{className:"flex gap-2 pb-1"},
                        React.createElement('button',{
                            onClick:()=>printInvoice(invoiceModal),
                            className:"flex-1 py-2.5 bg-premium-gold text-premium-bg rounded-xl text-xs font-black flex items-center justify-center gap-1.5 active:scale-95"
                        },"🖨️ طباعة الفاتورة"),
                        React.createElement('button',{
                            onClick:()=>{ const fid=invoiceModal?.fee?.id||null; setInvoiceModal(null); setDetailsFor(fid); },
                            className:"px-4 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs active:scale-95"
                        },"رجوع ↩")
                    )
                )
            )
        ), document.body);
}

export default InvoiceModal;
