import React, { useState } from 'react';
import { I } from '../../constants';

interface DeleteConfirmModalProps {
    title?: string;
    itemName: string;
    itemType: string;
    /** لما mode متبعتش، المودال بيعرض شاشة اختيار (أرشفة/حذف نهائي) أول، وبعد الاختيار بينده onConfirmArchive أو onConfirmDelete المناسبة. */
    onConfirm?: () => void;
    onConfirmArchive?: () => void;
    onConfirmDelete?: () => void;
    onCancel: () => void;
    loading?: boolean;
    /** لو اتبعتت، المودال بيتخطى شاشة الاختيار ويشتغل بالسلوك القديم (onConfirm). */
    mode?: 'delete' | 'archive';
    /** نقاط تحذير مخصصة لحالة الحذف النهائي بس (تحل محل الثلاث نقاط العامة الافتراضية) —
     *  مفيدة لتوضيح إيه اللي هيتحذف فعليًا وإيه اللي هيفضل موجود بربط مصفّر (زي الأتعاب/الفواتير). */
    deleteConsequences?: string[];
    inputTestId?: string;
    confirmTestId?: string;
    cancelTestId?: string;
    choiceTestId?: string;
}

function DeleteConfirmModal({ title, itemName, itemType, onConfirm, onConfirmArchive, onConfirmDelete, onCancel, loading, mode, deleteConsequences, inputTestId, confirmTestId, cancelTestId, choiceTestId }: DeleteConfirmModalProps) {
    const [typed, setTyped] = useState('');
    const [chosenMode, setChosenMode] = useState<'delete' | 'archive' | null>(null);
    const isMatch = typed.trim() === (itemName||'').trim();

    const forcedMode = mode; // لو موجودة، ميتعرضش شاشة اختيار خالص (توافق كامل مع الاستخدام الحالي)
    const effectiveMode = forcedMode ?? chosenMode;

    // شاشة الاختيار: تظهر بس لما محدش حدد mode ثابت ولسه المستخدم ما اختارش
    if (!forcedMode && !effectiveMode) {
        return React.createElement('div',{
            className:"fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-sm p-5",
            onClick: (e: React.MouseEvent<HTMLDivElement>) => { if(e.target===e.currentTarget) onCancel(); }
        },
            React.createElement('div',{className:"w-full max-w-sm bg-premium-card border border-white/10 rounded-3xl p-6 slide-up shadow-2xl space-y-5"},
                React.createElement('div',null,
                    React.createElement('h3',{className:"text-sm font-black text-white"},title||`حذف ${itemType}`),
                    React.createElement('p',{className:"text-[10px] text-slate-400 font-bold mt-1"},itemName)
                ),
                React.createElement('div',{className:"space-y-2.5"},
                    React.createElement('button',{
                        onClick: () => setChosenMode('archive'),
                        ...(choiceTestId ? {'data-testid': `${choiceTestId}-archive`} : {}),
                        className:"w-full flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 border border-white/10 text-right active:scale-[0.98] transition-all"
                    },
                        React.createElement('span',{className:"text-2xl"},'📦'),
                        React.createElement('span',{className:"flex-1"},
                            React.createElement('span',{className:"block text-xs font-black text-white"},"أرشفة"),
                            React.createElement('span',{className:"block text-[10px] text-slate-400 font-bold mt-0.5"},"يختفي من القوائم ويمكن استرجاعه لاحقًا")
                        )
                    ),
                    React.createElement('button',{
                        onClick: () => setChosenMode('delete'),
                        ...(choiceTestId ? {'data-testid': `${choiceTestId}-delete`} : {}),
                        className:"w-full flex items-center gap-3 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-right active:scale-[0.98] transition-all"
                    },
                        React.createElement('span',{className:"text-2xl"},'🗑️'),
                        React.createElement('span',{className:"flex-1"},
                            React.createElement('span',{className:"block text-xs font-black text-rose-300"},"حذف نهائي"),
                            React.createElement('span',{className:"block text-[10px] text-slate-400 font-bold mt-0.5"},"⚠️ لا يمكن التراجع عنه")
                        )
                    )
                ),
                React.createElement('button',{
                    onClick:onCancel,
                    className:"w-full py-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs font-black active:scale-95 transition-all"
                },"إلغاء")
            )
        );
    }

    const isArchive = effectiveMode === 'archive';
    const handleConfirmClick = () => {
        if (!isMatch) return;
        if (forcedMode) { onConfirm?.(); return; }
        if (chosenMode === 'archive') { onConfirmArchive?.(); return; }
        if (chosenMode === 'delete') { onConfirmDelete?.(); return; }
    };

    return React.createElement('div',{
        className:"fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-sm p-5",
        onClick: (e: React.MouseEvent<HTMLDivElement>) => { if(e.target===e.currentTarget) onCancel(); }
    },
        React.createElement('div',{className:"w-full max-w-sm bg-premium-card border border-rose-500/30 rounded-3xl p-6 slide-up shadow-2xl space-y-5"},
            // أيقونة + عنوان
            React.createElement('div',{className:"flex items-start gap-4"},
                React.createElement('div',{className:"w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/20 flex items-center justify-center text-2xl shrink-0"},isArchive?'📦':'🗑️'),
                React.createElement('div',null,
                    React.createElement('h3',{className:"text-sm font-black text-white"},title||(isArchive?"تأكيد الأرشفة":"تأكيد الحذف النهائي")),
                    React.createElement('p',{className:"text-[10px] text-rose-400 font-bold mt-0.5"},isArchive?"سيختفي من القوائم ويمكن استرجاعه من الأرشيف":"⚠️ هذا الإجراء لا يمكن التراجع عنه")
                )
            ),
            // تحذير
            React.createElement('div',{className:"bg-rose-500/8 border border-rose-500/15 rounded-2xl p-3 space-y-1 text-[10px] text-slate-400 leading-relaxed"},
                isArchive
                    ? React.createElement(React.Fragment,null,
                        React.createElement('p',null,"• سيُنقل "+itemType+" إلى الأرشيف ويختفي من الشاشات العادية"),
                        React.createElement('p',null,"• بياناته تفضل محفوظة بالكامل ويمكن استرجاعه لاحقًا"),
                        React.createElement('p',null,"• السجلات المالية/المرتبطة (زي الفواتير الصادرة) تفضل كما هي")
                      )
                    : React.createElement(React.Fragment,null,
                        ...(deleteConsequences && deleteConsequences.length > 0
                            ? deleteConsequences.map((line, i) => React.createElement('p',{key:i},"• "+line))
                            : [
                                React.createElement('p',{key:'d1'},"• سيُحذف "+itemType+" نهائياً من قاعدة البيانات"),
                                React.createElement('p',{key:'d2'},"• لا يمكن استعادة البيانات بعد الحذف"),
                                React.createElement('p',{key:'d3'},"• ستُحذف جميع الملفات والمستندات المرتبطة"),
                              ])
                      )
            ),
            // حقل التأكيد
            React.createElement('div',{className:"space-y-2"},
                React.createElement('p',{className:"text-[10px] text-slate-400 font-bold"},
                    "اكتب اسم ",React.createElement('span',{className:"text-white font-black"}, itemType),
                    " للتأكيد:"
                ),
                React.createElement('div',{className:"bg-rose-500/5 border border-rose-500/20 rounded-xl px-3 py-2"},
                    React.createElement('p',{className:"text-[11px] font-black text-rose-300 text-center"},itemName)
                ),
                React.createElement('input',{
                    type:"text",
                    value:typed,
                    onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setTyped(e.target.value),
                    placeholder:"اكتب الاسم هنا للتأكيد...",
                    className:"w-full p-3 text-xs rounded-xl border bg-premium-bg text-white placeholder-slate-600 transition-all",
                    style:{
                        fontFamily:'Cairo,sans-serif',
                        borderColor: typed.length===0 ? 'rgba(255,255,255,0.10)' : isMatch ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.10)'
                    },
                    autoFocus:true,
                    ...(inputTestId ? {'data-testid': inputTestId} : {})
                })
            ),
            // رجوع لشاشة الاختيار (بس لو جينا منها، مش لما mode مثبتة من بره)
            !forcedMode && React.createElement('button',{
                onClick: () => { setChosenMode(null); setTyped(''); },
                className:"text-[10px] text-slate-500 font-bold underline underline-offset-2 -mt-2"
            },"← رجوع للاختيار"),
            // أزرار
            React.createElement('div',{className:"flex gap-3"},
                React.createElement('button',{
                    onClick:onCancel,
                    className:"flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs font-black active:scale-95 transition-all",
                    ...(cancelTestId ? {'data-testid': cancelTestId} : {})
                },"إلغاء"),
                React.createElement('button',{
                    onClick:handleConfirmClick,
                    disabled:!isMatch||loading,
                    ...(confirmTestId ? {'data-testid': confirmTestId} : {}),
                    className:"flex-1 py-3 rounded-xl text-white text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-35",
                    style:{background:isMatch?'linear-gradient(135deg,#dc2626,#ef4444)':'rgba(239,68,68,0.2)',
                           boxShadow:isMatch?'0 4px 16px rgba(220,38,38,0.3)':'none'}
                },
                    loading ? React.createElement(I.Spin) : React.createElement(React.Fragment,null,isArchive?'📦':'🗑️',isArchive?' أرشفة':' حذف نهائي')
                )
            )
        )
    );
}


export default DeleteConfirmModal;
