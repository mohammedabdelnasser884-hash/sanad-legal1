import React, { useState, useEffect, useRef } from 'react';
import { toast } from '../../shared/lib/notifications';
import { Inp } from '@/shared/ui/Inp';
import { Sel } from '@/shared/ui/Sel';
import { createPortal } from 'react-dom';
import { I, COUNTRY_CONFIGS, loadOfficeSetting } from '../../constants';
import { useFeesActions } from './hooks/useFeesActions';
import { useInvoicePrinting } from './hooks/useInvoicePrinting';
import DeleteConfirmModal from '@/shared/modals/DeleteConfirmModal';
import SummaryModal from './SummaryModal';
import InvoiceModal from './InvoiceModal';
import FeeCard from './FeeCard';
import type { ClientRow, ProfileRow } from '../../types';
import type { MappedCase } from '../../hooks/useAppData';

// ⚠️ FIX (14 يوليو 2026): كان متوقع CaseRow[] (الشكل الخام من قاعدة البيانات)،
// لكن App.tsx بيبعت فعليًا `cases` المُطبَّعة (MappedCase[]) من useAppData —
// نفس الحقول المستخدمة هنا فعليًا (id/title) موجودة في MappedCase.
interface FeesTabProps {
    cases: MappedCase[];
    clients: ClientRow[];
    showSummaryModal: boolean;
    setShowSummaryModal: (v: boolean) => void;
    country?: string;
    profile?: ProfileRow | null;
}

// شكل عناصر feesSections الثابتة (تابات محصّلة/مؤجلة/مفتوحة) — من useFeesActions
interface FeeSectionInfo {
    key: 'collected' | 'deferred' | 'open';
    label: string;
    emoji: string;
    desc: string;
    activeBg: string;
    activeText: string;
    countActiveBg: string;
}

function FeesTab({cases, clients, showSummaryModal, setShowSummaryModal, country, profile=null}: FeesTabProps){
    const {
      fees, payments, expandedPayments, setExpandedPayments,
      loading, showForm, setShowForm, form, setForm, saving, editId, setEditId,
      addPaymentFor, setAddPaymentFor, payAmount, setPayAmount, payDate, setPayDate,
      payNote, setPayNote, confirmDeletePay, setConfirmDeletePay,
      confirmDeleteFee, setConfirmDeleteFee, invoiceModal, setInvoiceModal,
      payReceiver, setPayReceiver, payClientName, setPayClientName,
      payClientNameText, setPayClientNameText, feesSearch, setFeesSearch,
      feesFilter, setFeesFilter,
      fetchFees, handleSave, handleAddPayment, handleDeletePayment, handleDelete,
      // ── قيم محسوبة من الـ hook (مركزية — لا تُعاد هنا) ──
      fmt, fmtDate,
      feesByCategory, feesSections, feesAfterCategoryFilter, filteredFees,
      grandTotal, grandPaid, grandRemaining, loadingSummary,
      statusCounts,
    } = useFeesActions(cases, clients, country, profile);

    const [detailsFor, setDetailsFor] = useState<string | null>(null); // معرف بطاقة الأتعاب المفتوحة تفاصيلها
    const [invoiceLoadingFor, setInvoiceLoadingFor] = useState<string | null>(null); // معرف الدفعة اللي بيتصدر لها فاتورة دلوقتي
    // ── بيانات المكتب (الاسم/الشعار) لعرضها في معاينة الفاتورة على الشاشة ──
    const [officeBrand, setOfficeBrand] = useState({ name: '', logoUrl: '' });
    useEffect(() => {
        Promise.all([
            loadOfficeSetting('office_name'),
            loadOfficeSetting('office_logo'),
        ]).then(([officeName, officeLogo]: [string | null, string | null]) => {
            setOfficeBrand({ name: officeName || '', logoUrl: officeLogo || '' });
        });
    }, []);
    // ── حالة أيقونة البحث القابلة للفتح في الهيدر ──
    const [searchOpen, setSearchOpen] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    // ── FIX (تصحيح لملاحظة سابقة كانت غلط): البحث هنا كان بيبعت طلب لقاعدة
    // البيانات مع كل حرف بدون أي debounce فعلي — الـ setTimeout الوحيد
    // الموجود قبل كده كان بس لعمل focus على الخانة، مش لتأخير البحث.
    // دلوقتي فيه state محلي للعرض الفوري (searchInput) بينفصل عن feesSearch
    // (اللي فعليًا بيشغّل الاستعلام جوه useFeesActions)، وبنأخر تحديث
    // feesSearch بـ 300ms بعد آخر حرف.
    const [searchInput, setSearchInput] = useState(feesSearch);
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
    }, []);
    const handleSearchInputChange = (val: string) => {
        setSearchInput(val);
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(() => setFeesSearch(val), 300);
    };
    const handleSearchOpen = () => { setSearchOpen(true); setTimeout(()=>searchInputRef.current?.focus(), 50); };
    const handleSearchClose = () => {
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        setSearchInput(''); setFeesSearch(''); setSearchOpen(false);
    };
    // ── عملة الدولة المختارة في الإعدادات (افتراضي جنيه مصري) ──
    const currency = COUNTRY_CONFIGS[country||'EG']?.currency || 'جنيه مصري';

    const { getOrCreateInvoice, printInvoice, printAllPayments } = useInvoicePrinting(cases, clients, profile, currency);

    // ── المتغيرات المحسوبة تأتي من useFeesActions مباشرة ──

    return React.createElement('div',{className:"space-y-4 fade-in"},

        // ── هيدر القسم: العنوان + أيقونة البحث ──
        React.createElement('div',{className:"flex items-center justify-between gap-2"},
            React.createElement('h3',{className:"text-sm font-black text-white shrink-0"},"💰 نظام الأتعاب"),
            searchOpen
                ? React.createElement('div',{
                    className:"flex items-center gap-1.5 flex-1 bg-white/8 border border-white/12 rounded-xl px-2.5 py-1.5",
                    style:{minWidth:0}
                },
                    React.createElement('svg',{className:"w-3.5 h-3.5 text-amber-400 shrink-0",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                        React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"})
                    ),
                    React.createElement('input',{
                        ref:searchInputRef,
                        type:"text",
                        value:searchInput,
                        onChange:(e: React.ChangeEvent<HTMLInputElement>) =>handleSearchInputChange(e.target.value),
                        maxLength:100,
                        placeholder:"اسم الموكل أو القضية...",
                        dir:"rtl",
                        className:"flex-1 bg-transparent text-[11px] text-white placeholder-slate-500 outline-none min-w-0"
                    }),
                    React.createElement('button',{
                        onClick:handleSearchClose,
                        className:"text-slate-500 hover:text-slate-300 shrink-0 active:scale-90 transition-transform"
                    },
                        React.createElement('svg',{className:"w-3.5 h-3.5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                            React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M6 18 18 6M6 6l12 12"})
                        )
                    )
                )
                : React.createElement('button',{
                    onClick:handleSearchOpen,
                    className:"flex items-center gap-1 bg-white/8 border border-white/10 text-slate-300 px-2.5 py-2 rounded-xl text-[11px] font-black active:scale-95 transition-transform hover:border-amber-500/30 hover:text-amber-300",
                    title:"بحث في الأتعاب"
                },
                    React.createElement('svg',{className:"w-3.5 h-3.5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                        React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"})
                    ),
                    React.createElement('span',null,"بحث")
                )
        ),

        // ── Modal الملخص المالي الإجمالي ──
        React.createElement(SummaryModal, { showSummaryModal, setShowSummaryModal, loadingSummary, fmt, grandTotal, grandPaid, grandRemaining, feesByCategory }),

        // ── Pill Selector — أتعاب محصلة / مؤجلة / مفتوحة ──
        React.createElement('div',{className:"flex items-center bg-white/5 rounded-2xl p-1 gap-1"},
            feesSections.map((s: FeeSectionInfo) => {
                const count = statusCounts[s.key] ?? feesByCategory[s.key].length;
                const isActive = feesFilter === s.key;
                return React.createElement('button',{
                    key: s.key,
                    onClick: () => setFeesFilter(s.key),
                    className: `flex-1 flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl transition-all active:scale-95 ${
                        isActive
                            ? s.activeBg + ' shadow-sm'
                            : 'text-slate-500 hover:text-slate-300'
                    }`
                },
                    React.createElement('span',{className:"text-sm leading-none"}, s.emoji),
                    React.createElement('span',{className:`text-[10px] font-black ${isActive ? s.activeText : 'text-slate-400'}`}, s.label),
                    React.createElement('span',{
                        className: `text-[9px] font-black px-1.5 py-0.5 rounded-full ${isActive ? s.countActiveBg : 'bg-white/8 text-slate-500'}`
                    }, count)
                );
            })
        ),

        // ─ زر الملخص المالي (بقى هنا مكان شريط البحث القديم) ─
        React.createElement('button',{
            onClick:()=>setShowSummaryModal(true),
            className:"w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-premium-gold/10 border border-premium-gold/25 text-premium-gold text-xs font-black active:scale-95 transition-all hover:bg-premium-gold/15"
        },"📊 الملخص المالي الإجمالي"),

        // ─ زر الإضافة ─
        React.createElement('button',{
            onClick:()=>{setShowForm(!showForm);setEditId(null);setForm({case_id:'',client_id:'',client_name_manual:'',client_name_text:'',receiver:'',total:'',paid:'',payment_date:'',notes:''}); },
            'data-testid':'add-fee-button',
            className:"w-full py-3 border border-dashed border-premium-gold/30 rounded-2xl flex items-center justify-center gap-2 text-premium-gold text-xs font-black hover:bg-premium-gold/5 transition-all active:scale-[0.98]"
        }, React.createElement(I.Plus), "إضافة أتعاب قضية"),

        // ─ فورم الإضافة/التعديل (modal) ─
        showForm && createPortal(
            React.createElement('div',{
                className:"fixed z-[70] bg-premium-card border-t border-premium-gold/20 rounded-t-3xl overflow-y-auto no-scrollbar p-5 space-y-3 shadow-2xl",
                style:{
                    top:'calc(var(--app-header-h, 64px) + env(safe-area-inset-top, 0px))',
                    bottom:'calc(var(--app-navbar-h, 80px) + env(safe-area-inset-bottom, 0px))',
                    left:0, right:0,
                },
                onClick:(e: React.MouseEvent) =>e.stopPropagation()
            },
                    React.createElement('div',{className:"flex items-center justify-between mb-1"},
                        React.createElement('h4',{className:"text-xs font-black text-premium-gold"},editId ? "✏️ تعديل الأتعاب" : "📋 إضافة أتعاب"),
                        React.createElement('button',{onClick:()=>{setShowForm(false);setEditId(null);},className:"w-7 h-7 rounded-lg bg-white/5 text-slate-400 text-xs active:scale-90"},"✕")
                    ),
                    React.createElement(Sel,{
                        label:"القضية",value:form.case_id,
                        testId:'fee-case-select',
                        onChange:(e: React.ChangeEvent<HTMLSelectElement>) =>{
                            const cid = e.target.value;
                            const lc = cases.find((c) =>c.id===cid);
                            const lcl = lc ? clients.find((cl) =>cl.id===lc.client_id) : null;
                            setForm((p) =>({...p, case_id:cid, client_id: lcl ? '' : p.client_id, client_name_manual: lcl ? '' : p.client_name_manual}));
                        },
                        options:[{value:'',label:'اختر القضية...'}, ...cases.map((c) =>({value:c.id,label:c.title}))]
                    }),
                    React.createElement('div',{className:"space-y-1.5"},
                        React.createElement('label',{className:"text-[10px] text-slate-400 font-bold"},"اسم الموكل"),
                        React.createElement('select',{
                            value: form.client_name_manual === '__manual__' ? '__manual__' : (form.client_id || ''),
                            onChange:(e: React.ChangeEvent<HTMLSelectElement>) =>{
                                const v = e.target.value;
                                if(v==='__manual__') setForm((p) =>({...p, client_name_manual:'__manual__', client_id:''}));
                                else setForm((p) =>({...p, client_name_manual:'', client_id: v}));
                            },
                            className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-black/30 text-white",
                            style:{fontFamily:'Cairo,sans-serif',colorScheme:'dark'}
                        },
                            React.createElement('option',{value:''},'اختر موكل...'),
                            clients.map((cl) =>React.createElement('option',{key:cl.id, value:cl.id}, cl.full_name)),
                            React.createElement('option',{value:'__manual__'},'➕ آخر (اكتب يدوي)')
                        ),
                        form.client_name_manual==='__manual__' && React.createElement('input',{
                            type:"text",
                            value:form.client_name_text||'',
                            onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setForm((p) =>({...p, client_name_text:e.target.value})),
                            placeholder:"اكتب اسم الموكل...",
                            className:"w-full p-2.5 text-xs rounded-xl border border-premium-gold/30 bg-black/30 text-white placeholder-slate-600",
                            style:{fontFamily:'Cairo,sans-serif'},
                            autoFocus:true
                        })
                    ),
                    React.createElement(Inp,{label:"المستلم من المكتب",value:form.receiver,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setForm((p) =>({...p,receiver:e.target.value})),placeholder:"اسم المحامي أو الموظف المستلم"}),
                    React.createElement(Inp,{label:"إجمالي الأتعاب",type:"number",value:form.total,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setForm((p) =>({...p,total:e.target.value})),placeholder:"0",'data-testid':'fee-total'}),
                    React.createElement(Inp,{label:"المبلغ المدفوع",type:"number",value:form.paid,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setForm((p) =>({...p,paid:e.target.value})),placeholder:"0"}),
                    React.createElement('div',{className:"space-y-1"},
                        React.createElement('label',{className:"text-[10px] text-slate-400 font-bold"},"تاريخ الدفعة"),
                        React.createElement('input',{
                            type:"date",value:form.payment_date,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setForm((p) =>({...p,payment_date:e.target.value})),
                            className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-black/30 text-white",
                            style:{fontFamily:'Cairo,sans-serif',colorScheme:'dark'}
                        })
                    ),
                    React.createElement(Inp,{label:"ملاحظات",value:form.notes,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setForm((p) =>({...p,notes:e.target.value})),placeholder:"أي ملاحظات..."}),
                    React.createElement('div',{className:"flex gap-2"},
                        React.createElement('button',{onClick:handleSave,disabled:saving,'data-testid':'save-fee-button',className:"flex-1 py-2.5 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-xl text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95"},
                            saving?React.createElement(I.Spin):React.createElement(I.Check),"حفظ"),
                        React.createElement('button',{onClick:()=>{setShowForm(false);setEditId(null);},className:"px-4 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"},"إلغاء")
                    )
                )
            ,
            document.body
        ),

        // ─ قائمة الأتعاب ─
        loading ? React.createElement('div',{className:"flex items-center justify-center py-10 gap-2 text-slate-500 text-xs"},React.createElement(I.Spin),"جاري التحميل...")
        : feesAfterCategoryFilter.length===0
            ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-xl p-10 text-center space-y-2"},
                React.createElement('div',{className:"text-3xl"},
                    feesFilter==='collected' ? '✅' : feesFilter==='deferred' ? '⏳' : '⚠️'
                ),
                React.createElement('p',{className:"text-white/60 font-black text-sm"},
                    feesFilter==='collected' ? 'لا توجد أتعاب محصّلة بعد'
                    : feesFilter==='deferred' ? 'لا توجد أتعاب مؤجلة'
                    : 'لا توجد أتعاب مفتوحة'
                ),
                React.createElement('p',{className:"text-slate-500 text-xs"},
                    feesFilter==='collected' ? 'الأتعاب المدفوعة بالكامل ستظهر هنا'
                    : feesFilter==='deferred' ? 'الأتعاب المتفق عليها وغير المسددة بالكامل ستظهر هنا'
                    : 'القضايا التي بدون اتفاق على مبلغ الأتعاب ستظهر هنا'
                )
              )
            : filteredFees.length===0
            ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-xl p-8 text-center space-y-2"},
                React.createElement('div',{className:"text-2xl"},"🔍"),
                React.createElement('p',{className:"text-white/60 font-black text-sm"},"لا توجد نتائج"),
                React.createElement('p',{className:"text-slate-500 text-xs"},'جرب كلمة بحث مختلفة')
              )
            : React.createElement('div',{className:"space-y-3"},
                filteredFees.map((fee) => React.createElement(FeeCard, {
                    key: fee.id, fee, cases, clients, currency, fmt, fmtDate,
                    detailsFor, setDetailsFor,
                    expandedPayments, setExpandedPayments,
                    invoiceLoadingFor, setInvoiceLoadingFor, getOrCreateInvoice, setInvoiceModal, toast,
                    printAllPayments, setConfirmDeletePay,
                    addPaymentFor, setAddPaymentFor,
                    payClientName, setPayClientName, payClientNameText, setPayClientNameText,
                    payAmount, setPayAmount, payDate, setPayDate, payReceiver, setPayReceiver, payNote, setPayNote,
                    handleAddPayment, setEditId, setForm, setShowForm, setConfirmDeleteFee,
                    payments,
                }))
              ),

        // ─ مودال تأكيد حذف الأتعاب الرئيسية ─
        confirmDeleteFee && createPortal(React.createElement(DeleteConfirmModal,{
            title:"أرشفة الأتعاب",
            itemName: cases.find((c) =>c.id===confirmDeleteFee.case_id)?.title || fees.find((f) =>f.id===confirmDeleteFee.id)?.case_title || 'غير معروفة',
            itemType:"الأتعاب",
            mode:"archive",
            loading:false,
            onConfirm:()=>{ handleDelete(confirmDeleteFee.id); setConfirmDeleteFee(null); },
            onCancel:()=>setConfirmDeleteFee(null)
        }), document.body),

        // ─ مودال تأكيد حذف الدفعة ─
        confirmDeletePay && createPortal(React.createElement(DeleteConfirmModal,{
            title:"حذف الدفعة",
            itemName: fmt(confirmDeletePay.amount) + ' - ' + fmtDate(confirmDeletePay.payDate),
            itemType:"الدفعة",
            mode:"delete",
            loading:false,
            onConfirm:()=>{ handleDeletePayment(confirmDeletePay.payId, confirmDeletePay.fee); setConfirmDeletePay(null); },
            onCancel:()=>setConfirmDeletePay(null)
        }), document.body),

        // ─ مودال معاينة الفاتورة (bottom sheet مضغوط) ─
        React.createElement(InvoiceModal, { invoiceModal, setInvoiceModal, setDetailsFor, officeBrand, currency, printInvoice })
    );
}

export default FeesTab;
