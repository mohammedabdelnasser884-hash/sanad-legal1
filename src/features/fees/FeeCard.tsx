import React from 'react';
import { createPortal } from 'react-dom';
import { I } from '../../constants';
import type { ClientRow, CaseFeeRow, FeePaymentRow, InvoiceRow, PaymentsByFeeId } from '../../types';
import type { MappedCase } from '../../hooks/useAppData';
import type { InvoiceModalState, ConfirmDeletePayState, FeeFormState } from './hooks/useFeesActions';

interface FeeCardProps {
  fee: CaseFeeRow;
  cases: MappedCase[];
  clients: ClientRow[];
  currency: string;
  fmt: (n: number | string | null | undefined) => string;
  fmtDate: (d: string | null | undefined) => string;
  detailsFor: string | null;
  setDetailsFor: (v: string | null) => void;
  expandedPayments: Record<string, boolean>;
  setExpandedPayments: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  invoiceLoadingFor: string | null;
  setInvoiceLoadingFor: (v: string | null) => void;
  getOrCreateInvoice: (payment: FeePaymentRow, fee: CaseFeeRow) => Promise<Pick<InvoiceRow, 'invoice_number' | 'issued_at'>>;
  setInvoiceModal: React.Dispatch<React.SetStateAction<InvoiceModalState | null>>;
  toast: (msg: string, isErr?: boolean) => void;
  printAllPayments: (fee: CaseFeeRow, feePayments: FeePaymentRow[], caseName: string, clientName: string | null) => Promise<void>;
  setConfirmDeletePay: React.Dispatch<React.SetStateAction<ConfirmDeletePayState | null>>;
  addPaymentFor: string | null;
  setAddPaymentFor: (v: string | null) => void;
  payClientName: string;
  setPayClientName: (v: string) => void;
  payClientNameText: string;
  setPayClientNameText: (v: string) => void;
  payAmount: string;
  setPayAmount: (v: string) => void;
  payDate: string;
  setPayDate: (v: string) => void;
  payReceiver: string;
  setPayReceiver: (v: string) => void;
  payNote: string;
  setPayNote: (v: string) => void;
  handleAddPayment: (fee: CaseFeeRow) => void;
  setEditId: (v: string | null) => void;
  setForm: React.Dispatch<React.SetStateAction<FeeFormState>>;
  setShowForm: (v: boolean) => void;
  setConfirmDeleteFee: (v: CaseFeeRow | null) => void;
  payments: PaymentsByFeeId;
}

function FeeCard({
  fee, cases, clients, currency, fmt, fmtDate,
  detailsFor, setDetailsFor,
  expandedPayments, setExpandedPayments,
  invoiceLoadingFor, setInvoiceLoadingFor, getOrCreateInvoice, setInvoiceModal, toast,
  printAllPayments, setConfirmDeletePay,
  addPaymentFor, setAddPaymentFor,
  payClientName, setPayClientName, payClientNameText, setPayClientNameText,
  payAmount, setPayAmount, payDate, setPayDate, payReceiver, setPayReceiver, payNote, setPayNote,
  handleAddPayment, setEditId, setForm, setShowForm, setConfirmDeleteFee,
  payments,
}: FeeCardProps) {
  const linkedCase = cases.find((c) => c.id===fee.case_id);
  const linkedClient = linkedCase ? clients.find((cl) => cl.id===linkedCase.client_id) : null;
  const caseTitle = linkedCase?.title || fee.case_title || 'قضية غير معروفة';
  const caseNumber = linkedCase?.number || null;
  const caseType = linkedCase?.type || null;
  const pct = (fee.total_fees||0)>0 ? Math.round(((fee.paid_fees||0)/(fee.total_fees||0))*100) : 0;
  const rem = (fee.total_fees||0)-(fee.paid_fees||0);
  const isFullyPaid = rem <= 0;
  const feePayments = payments[fee.id]||[];
  const showPays = expandedPayments[fee.id];

  return React.createElement(React.Fragment,{key:fee.id},
                        // ─ الكارت المضغوط ─
                        React.createElement('div',{
                            onClick:()=>setDetailsFor(fee.id),
                            'data-testid':'fee-card',
                            className:"bg-premium-card border border-white/5 rounded-2xl p-4 flex items-center justify-between gap-3 cursor-pointer active:scale-95 transition-transform"
                        },
                            React.createElement('div',{className:"flex-1 min-w-0"},
                                React.createElement('p',{className:"text-xs font-black text-white truncate"}, caseTitle),
                                React.createElement('div',{className:"flex items-center gap-2 mt-1.5 flex-wrap"},
                                    (fee.client_name||linkedClient?.full_name) && React.createElement('span',{className:"text-[9px] text-emerald-400 font-bold"},"👤 "+(fee.client_name||linkedClient?.full_name)),
                                    caseNumber && React.createElement('span',{className:"text-[9px] text-blue-400 font-bold"},"# "+caseNumber),
                                    caseType && React.createElement('span',{className:"text-[9px] text-purple-400 font-bold"},"⚖️ "+caseType)
                                )
                            ),
                            React.createElement('span',{className:`text-[9px] font-black px-2 py-1 rounded-full shrink-0 ${isFullyPaid?'bg-emerald-500/15 text-emerald-400':'bg-amber-500/15 text-amber-400'}`}, isFullyPaid ? '✅ مسدد' : pct+'%')
                        ),
                        // ─ مودال التفاصيل الكاملة ─
                        detailsFor===fee.id && createPortal(React.createElement('div',{
                            className:"fixed z-50 bg-premium-card border-t border-white/10 rounded-t-3xl shadow-2xl overflow-y-auto",
                            style:{
                                top:'calc(var(--app-header-h, 64px) + env(safe-area-inset-top, 0px))',
                                bottom:'calc(var(--app-navbar-h, 80px) + env(safe-area-inset-bottom, 0px))',
                                left:0, right:0,
                            },
                            onClick:(e: React.MouseEvent<HTMLDivElement>) =>e.stopPropagation()
                        },
                                React.createElement('div',{className:"px-4 pt-4 pb-2"},
                                    React.createElement('div',{className:"flex items-center justify-between"},
                                        React.createElement('p',{className:"text-[10px] text-slate-500 font-black"},"📋 تفاصيل الأتعاب"),
                                        React.createElement('button',{onClick:()=>setDetailsFor(null),className:"w-7 h-7 rounded-lg bg-white/5 text-slate-400 text-xs active:scale-90"},"✕")
                                    )
                                ),
                                React.createElement('div',{className:"pb-4"},
                        // شريط التقدم
                        React.createElement('div',{className:"h-1 w-full bg-white/5"},
                            React.createElement('div',{className:`h-full transition-all ${isFullyPaid?'bg-emerald-400':'bg-premium-gold'}`,style:{width:pct+'%'}})
                        ),
                        React.createElement('div',{className:"p-4 space-y-3"},
                            // اسم القضية
                            React.createElement('div',{className:"flex items-start justify-between gap-2"},
                                React.createElement('div',{className:"flex-1"},
                                    React.createElement('p',{className:"text-xs font-black text-white leading-tight"},caseTitle),
                                    (fee.client_name||linkedClient?.full_name) && React.createElement('p',{className:"text-[9px] text-emerald-400 mt-0.5"},"👤 "+(fee.client_name||linkedClient?.full_name)),
                                    fee.receiver && React.createElement('p',{className:"text-[9px] text-purple-400 mt-0.5"},"🏛 المستلم: "+fee.receiver),
                                    fee.last_payment_date && React.createElement('p',{className:"text-[9px] text-slate-500 mt-0.5"},"📅 "+fmtDate(fee.last_payment_date))
                                ),
                                React.createElement('span',{className:`text-[9px] font-black px-2 py-1 rounded-full ${isFullyPaid?'bg-emerald-500/15 text-emerald-400':'bg-amber-500/15 text-amber-400'}`},
                                    isFullyPaid ? '✅ مسدد' : pct+'%'
                                )
                            ),
                            // الأرقام
                            React.createElement('div',{className:"grid grid-cols-3 gap-2 text-center"},
                                React.createElement('div',{className:"bg-white/3 rounded-xl p-2"},
                                    React.createElement('p',{className:"text-[10px] font-black text-white"},fmt(fee.total_fees)),
                                    React.createElement('p',{className:"text-[8px] text-slate-500"},"الإجمالي")
                                ),
                                React.createElement('div',{className:"bg-emerald-500/8 rounded-xl p-2"},
                                    React.createElement('p',{className:"text-[10px] font-black text-emerald-400"},fmt(fee.paid_fees)),
                                    React.createElement('p',{className:"text-[8px] text-slate-500"},"المدفوع")
                                ),
                                React.createElement('div',{className:"bg-rose-500/8 rounded-xl p-2"},
                                    React.createElement('p',{className:`text-[10px] font-black ${rem>0?'text-rose-400':'text-emerald-400'}`},fmt(rem)),
                                    React.createElement('p',{className:"text-[8px] text-slate-500"},"المتبقي")
                                )
                            ),
                            // ملاحظات القضية
                            fee.notes && React.createElement('p',{className:"text-[10px] text-slate-400 bg-white/3 rounded-xl px-3 py-2"},"📝 "+fee.notes),

                            // ─ سجل الدفعات ─
                            feePayments.length>0 && React.createElement('div',{className:"space-y-1"},
                                React.createElement('div',{className:"flex gap-1"},
                                    React.createElement('button',{
                                        onClick:()=>setExpandedPayments((p: Record<string, boolean>) =>({...p,[fee.id]:!p[fee.id]})),
                                        className:"flex-1 flex items-center justify-between text-[10px] font-black text-blue-400 bg-blue-500/8 border border-blue-500/15 rounded-xl px-3 py-2 active:scale-98"
                                    },
                                        React.createElement('span',null,"🗓 سجل الدفعات ("+feePayments.length+")"),
                                        React.createElement('span',null, showPays ? '▲' : '▼')
                                    ),
                                    React.createElement('button',{
                                        title:"طباعة كل الدفعات",
                                        // ⚠️ BUG FIX: كان بيستخدم linkedClient?.full_name بس، فلو الأتعاب
                                        // مربوطة باسم موكل مكتوب يدوي (مش موكل مسجّل فعلياً) كان حقل
                                        // "الموكل" في التقرير المطبوع يطلع فاضي، رغم إن الكارت والتفاصيل
                                        // على الشاشة بيعرضوا الاسم صح (fee.client_name||linkedClient?.full_name).
                                        onClick:()=>printAllPayments(fee, feePayments, caseTitle, fee.client_name||linkedClient?.full_name||''),
                                        className:"w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center text-purple-400 text-base active:scale-90 shrink-0"
                                    },"🖨️")
                                ),
                                showPays && React.createElement('div',{className:"space-y-1 pt-1"},
                                    feePayments.map((p: FeePaymentRow)=>
                                        React.createElement('div',{key:p.id,className:"flex items-center justify-between bg-white/3 rounded-xl px-3 py-2 gap-2"},
                                            React.createElement('div',{className:"flex-1"},
                                                React.createElement('p',{className:"text-[10px] font-black text-emerald-400"},fmt(p.amount)+" "+currency),
                                                React.createElement('p',{className:"text-[9px] text-slate-500"},fmtDate(p.payment_date)),
                                                p.received_by && React.createElement('p',{className:"text-[9px] text-blue-400 mt-0.5"},"👤 استلم: "+p.received_by),
                                                p.notes && React.createElement('p',{className:"text-[9px] text-slate-400 mt-0.5"},"📝 "+p.notes)
                                            ),
                                            React.createElement('div',{className:"flex items-center gap-1 shrink-0"},
                                                React.createElement('button',{
                                                    title:"معاينة وطباعة الفاتورة",
                                                    disabled: invoiceLoadingFor === p.id,
                                                    onClick: async ()=>{
                                                        setDetailsFor(null);
                                                        setInvoiceLoadingFor(p.id);
                                                        let inv;
                                                        try {
                                                            inv = await getOrCreateInvoice(p, fee);
                                                        } catch (e) {
                                                            setInvoiceLoadingFor(null);
                                                            toast('❌ فشل إصدار الفاتورة — تحقق من الاتصال وأعد المحاولة', true);
                                                            return;
                                                        }
                                                        setInvoiceLoadingFor(null);
                                                        const rem = Math.max(0,(fee.total_fees||0)-(fee.paid_fees||0));
                                                        setInvoiceModal({
                                                            payment:p, fee,
                                                            invoiceNum: inv.invoice_number || '',
                                                            caseName: caseTitle,
                                                            // ⚠️ BUG FIX: نفس مشكلة كشف الدفعات — لازم fallback للاسم اليدوي
                                                            clientName: fee.client_name||linkedClient?.full_name||'',
                                                            receivedBy: p.received_by||'',
                                                            amount: fmt(p.amount),
                                                            payDate: fmtDate(p.payment_date),
                                                            issueDate: fmtDate((inv.issued_at||new Date().toISOString()).slice(0,10)),
                                                            totalFees: fmt(fee.total_fees),
                                                            paidFees: fmt(fee.paid_fees),
                                                            remaining: fmt(rem),
                                                            // ⚠️ BUG FIX: كان الكود بيقارن remaining (نص منسّق زي "٠" أو "1,500")
                                                            // بالقيمة الحرفية '0' عشان يحدد لو الأتعاب اتسددت بالكامل. لكن
                                                            // fmt() بترجع رقم عربي شرقي "٠" مش "0"، فالمقارنة كانت بتفشل
                                                            // دايماً والفاتورة تظهر "جزئي" حتى لو مسددة بالكامل. دلوقتي بنحفظ
                                                            // قيمة boolean صريحة من المقارنة الرقمية الأصلية.
                                                            isFullyPaid: rem === 0,
                                                            notes: p.notes||fee.notes||''
                                                        });
                                                    },
                                                    className:"w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400 text-sm active:scale-90 disabled:opacity-40"
                                                },invoiceLoadingFor===p.id?React.createElement(I.Spin):"🧾"),
                                                React.createElement('button',{
                                                    onClick:()=>setConfirmDeletePay({payId:p.id,fee,amount:p.amount||0,payDate:p.payment_date}),
                                                    className:"w-6 h-6 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400 text-[10px] active:scale-90"
                                                },"✕")
                                            )
                                        )
                                    )
                                )
                            ),

                            // زر تسجيل دفعة + تعديل + حذف
                            !isFullyPaid && addPaymentFor===fee.id
                                ? React.createElement('div',{className:"space-y-2 slide-up"},
                                    // اسم الموكل — dropdown
                                    React.createElement('div',{className:"space-y-1.5"},
                                        React.createElement('label',{className:"text-[10px] text-slate-400 font-bold"},"اسم الموكل"),
                                        React.createElement('select',{
                                            value: payClientName==='__manual__' ? '__manual__' : (payClientName||''),
                                            onChange:(e: React.ChangeEvent<HTMLSelectElement>) =>setPayClientName(e.target.value),
                                            className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white",
                                            style:{fontFamily:'Cairo,sans-serif',colorScheme:'dark'}
                                        },
                                            React.createElement('option',{value:''},'اختر موكل...'),
                                            clients.map((cl: ClientRow) =>React.createElement('option',{key:cl.id,value:cl.id},cl.full_name)),
                                            React.createElement('option',{value:'__manual__'},'➕ آخر (اكتب يدوي)')
                                        ),
                                        payClientName==='__manual__' && React.createElement('input',{
                                            type:"text",
                                            value:payClientNameText||'',
                                            onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setPayClientNameText(e.target.value),
                                            placeholder:"اكتب اسم الموكل...",
                                            className:"w-full p-2.5 text-xs rounded-xl border border-premium-gold/30 bg-premium-bg text-white placeholder-slate-600",
                                            style:{fontFamily:'Cairo,sans-serif'},
                                            autoFocus:true
                                        })
                                    ),
                                    React.createElement('input',{
                                        type:"number",value:payAmount,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setPayAmount(e.target.value),
                                        placeholder:"المبلغ...",
                                        className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",
                                        style:{fontFamily:'Cairo,sans-serif'}
                                    }),
                                    React.createElement('input',{
                                        type:"date",value:payDate,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setPayDate(e.target.value),
                                        className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white",
                                        style:{fontFamily:'Cairo,sans-serif',colorScheme:'dark'}
                                    }),
                                    React.createElement('input',{
                                        type:"text",value:payReceiver,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setPayReceiver(e.target.value),
                                        placeholder:"اسم المستلم من المكتب...",
                                        className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",
                                        style:{fontFamily:'Cairo,sans-serif'}
                                    }),
                                    React.createElement('textarea',{
                                        value:payNote,onChange:(e: React.ChangeEvent<HTMLTextAreaElement>) =>setPayNote(e.target.value),
                                        placeholder:"ملاحظات الدفعة...",rows:2,
                                        className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 resize-none",
                                        style:{fontFamily:'Cairo,sans-serif'}
                                    }),
                                    React.createElement('div',{className:"flex gap-2"},
                                        React.createElement('button',{onClick:()=>handleAddPayment(fee),className:"flex-1 py-2 bg-emerald-500 text-white rounded-xl text-xs font-black active:scale-95"},"✅ تسجيل"),
                                        React.createElement('button',{onClick:()=>{setAddPaymentFor(null);setPayDate('');setPayAmount('');setPayNote('');setPayReceiver('');setPayClientName('');setPayClientNameText('');},className:"px-3 py-2 bg-white/5 text-slate-400 rounded-xl text-xs active:scale-95"},"✕")
                                    )
                                  )
                                : React.createElement('div',{className:"flex gap-2"},
                                    !isFullyPaid && React.createElement('button',{
                                        onClick:()=>{setAddPaymentFor(fee.id);setPayAmount('');},
                                        className:"flex-1 py-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-black flex items-center justify-center gap-1 active:scale-95"
                                    },"➕ تسجيل دفعة"),
                                    React.createElement('button',{
                                        onClick:()=>{
                                            // BUG-07 FIX: كان بيخمّن "هل ده موكل مسجّل؟" بمطابقة fee.client_name
                                            // نصياً مع clients.full_name — ممكن يغلط لو فيه اسمين متطابقين أو
                                            // الاسم اتغيّر بعدين. دلوقتي بنعتمد على fee.client_id الحقيقي (FK)
                                            // اللي اتسجل وقت الحفظ، مفيش تخمين خالص.
                                            const registeredClient = fee.client_id ? clients.find((cl: ClientRow) =>cl.id===fee.client_id) : null;
                                            setEditId(fee.id);
                                            setForm({
                                                case_id:fee.case_id || '',
                                                client_id: registeredClient ? registeredClient.id : '',
                                                client_name_manual: registeredClient ? '' : (fee.client_name ? '__manual__' : ''),
                                                client_name_text: registeredClient ? '' : (fee.client_name||''),
                                                receiver:fee.receiver||'',
                                                total:fee.total_fees as unknown as string,
                                                paid:fee.paid_fees as unknown as string,
                                                payment_date:fee.last_payment_date||'',
                                                notes:fee.notes||''
                                            });
                                            setShowForm(true);
                                        },
                                        className:"w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-500 hover:text-premium-gold active:scale-90"
                                    },React.createElement(I.Edit)),
                                    React.createElement('button',{
                                        onClick:()=>setConfirmDeleteFee(fee),
                                        className:"w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400 hover:bg-rose-500/20 active:scale-90"
                                    },React.createElement(I.Trash))
                                  )
                        )
                    )
                    )
                    , document.body)
                    );
}

export default FeeCard;
