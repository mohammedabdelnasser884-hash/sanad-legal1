import React, { useState } from 'react';
import { toast } from '../../shared/lib/notifications';
import { I } from '../../constants';
import { Inp } from '@/shared/ui/Inp';
import { Sel } from '@/shared/ui/Sel';
import DatePicker from '@/shared/ui/DatePicker';
import type { ClientRow, ProfileRow } from '../../types';
import type { CaseFormSubmitData } from './hooks/useCaseActions';

interface NewCaseModalProps {
    onClose: () => void;
    onSave: (form: CaseFormSubmitData) => void;
    loading?: boolean;
    lawyers: ProfileRow[];
    isAdmin: boolean;
    clients: ClientRow[];
    countryCourts?: string[];
    countryCaseTypes?: string[];
}

interface NewCaseForm {
    title: string; court: string; court_other: string; court_floor: string; court_hall: string;
    type: string; type_other: string; caseNum: string; caseYear: string;
    court_level: string; court_level_other: string; circuit_number: string; date: string; session_time: string;
    client_id: string; client_name: string; client_capacity: string; opponent: string; opponent_capacity: string;
    session_hall: string; secretary_hall: string; secretary_name: string;
}

function NewCaseModal({onClose,onSave,loading,lawyers,isAdmin,clients,countryCourts,countryCaseTypes}: NewCaseModalProps){
    const [form,setForm]=useState<NewCaseForm>({
        title:'',court:'',court_other:'',court_floor:'',court_hall:'',type:'',type_other:'',caseNum:'',caseYear:'',
        court_level:'',court_level_other:'',circuit_number:'',date:'',session_time:'صباحي',
        client_id:'',client_name:'',client_capacity:'',opponent:'',opponent_capacity:'',
        session_hall:'',secretary_hall:'',secretary_name:''
    });
    const s=<K extends keyof NewCaseForm>(k: K,v: NewCaseForm[K])=>setForm((p) =>({...p,[k]:v}));

    const inputCls = "w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 transition-colors";
    const inpStyle = {fontFamily:'Cairo,sans-serif'};

    return React.createElement('div',{className:"fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm",onClick:(e: React.MouseEvent<HTMLDivElement>) =>{if(e.target===e.currentTarget)onClose();}},
        React.createElement('div',{className:"bg-premium-card w-full max-w-lg rounded-t-3xl border-t border-white/10 p-6 pb-10 shadow-2xl slide-up max-h-[90vh] overflow-y-auto no-scrollbar"},
            React.createElement('div',{className:"w-10 h-1 bg-white/20 rounded-full mx-auto mb-5"}),
            React.createElement('div',{className:"flex items-center justify-between mb-5"},
                React.createElement('h3',{className:"text-sm font-black text-white flex items-center gap-2"},
                    React.createElement('span',{className:"w-1 h-4 bg-premium-gold rounded-full"}),
                    "تقييد دعوى جديدة في سند"
                ),
                React.createElement('button',{onClick:onClose,className:"w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 active:scale-90 transition-all shrink-0"},React.createElement(I.X))
            ),
            React.createElement('div',{className:"space-y-4"},

                // موضوع الدعوى
                React.createElement(Inp,{label:"موضوع ومسمى الدعوى",value:form.title,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('title',e.target.value),placeholder:"مثال: نزاع تجاري بين شركة .. وآخرين",required:true,'data-testid':'new-case-title'}),

                // ── أطراف الدعوى ──
                React.createElement('div',{className:"border-t border-white/5 pt-1"},
                    React.createElement('p',{className:"text-[10px] font-black text-slate-500 mb-3"},"— أطراف الدعوى —")
                ),

                // الموكل + صفته
                React.createElement('div',{className:"grid grid-cols-2 gap-2"},
                    React.createElement('div',null,
                        React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"الموكل"),
                        React.createElement('input',{value:form.client_name,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('client_name',e.target.value),placeholder:"اسم الموكل",className:inputCls,style:inpStyle})
                    ),
                    React.createElement('div',null,
                        React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"صفة الموكل"),
                        React.createElement('input',{value:form.client_capacity,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('client_capacity',e.target.value),placeholder:"مثال: مدعي / متهم...",className:inputCls,style:inpStyle})
                    )
                ),

                // الخصم + صفته
                React.createElement('div',{className:"grid grid-cols-2 gap-2"},
                    React.createElement('div',null,
                        React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"الخصم"),
                        React.createElement('input',{value:form.opponent,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('opponent',e.target.value),placeholder:"اسم الخصم",className:inputCls,style:inpStyle})
                    ),
                    React.createElement('div',null,
                        React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"صفة الخصم"),
                        React.createElement('input',{value:form.opponent_capacity,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('opponent_capacity',e.target.value),placeholder:"مثال: مدعى عليه...",className:inputCls,style:inpStyle})
                    )
                ),

                // ── بيانات القيد الرسمي ──
                React.createElement('div',{className:"border-t border-white/5 pt-1"},
                    React.createElement('p',{className:"text-[10px] font-black text-slate-500 mb-3"},"— بيانات القيد الرسمي —")
                ),

                // ١. درجة التقاضي (أول عنصر)
                React.createElement('div',null,
                    React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"درجة التقاضي"),
                    React.createElement('div',{className:"flex gap-2"},
                        ['ابتدائي','استئناف','نقض','أخرى'].map((lvl: string) =>React.createElement('button',{
                            key:lvl,type:"button",
                            onClick:()=>s('court_level',lvl),
                            className:`flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all active:scale-95 ${form.court_level===lvl?'bg-premium-gold text-premium-bg':'bg-white/5 border border-white/10 text-slate-400'}`
                        },lvl))
                    ),
                    form.court_level==='أخرى'&&React.createElement('input',{
                        value:form.court_level_other,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('court_level_other',e.target.value),
                        placeholder:"اكتب درجة التقاضي",
                        className:"w-full mt-2 p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",
                        style:inpStyle
                    })
                ),

                // ٢. المحكمة المختصة
                React.createElement('div',null,
                    React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"المحكمة المختصة"),
                    (countryCourts && countryCourts.length>0)
                        ? React.createElement(React.Fragment,null,
                            React.createElement(Sel,{
                                value:form.court,
                                onChange:(e: React.ChangeEvent<HTMLSelectElement>) =>s('court',e.target.value),
                                options:[{value:'',label:'— اختر المحكمة —'},...countryCourts.map((c:string)=>({value:c,label:c})),{value:'أخرى',label:'أخرى (اكتب يدوياً)'}]
                            }),
                            form.court==='أخرى'&&React.createElement('input',{
                                value:form.court_other,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('court_other',e.target.value),
                                placeholder:"اكتب اسم المحكمة",
                                className:"w-full mt-2 p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",
                                style:inpStyle
                            })
                        )
                        : React.createElement('input',{value:form.court,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('court',e.target.value),placeholder:"اكتب اسم المحكمة يدوياً",className:inputCls,style:inpStyle})
                ),

                // ٣. رقم الدعوى الرسمي + السنة
                React.createElement('div',null,
                    React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"رقم الدعوى الرسمي"),
                    React.createElement('div',{className:"flex gap-2 items-center"},
                        React.createElement('input',{value:form.caseNum,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('caseNum',e.target.value),placeholder:"رقم الدعوى",className:"flex-1 p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 text-center",style:inpStyle}),
                        React.createElement('span',{className:"text-slate-500 font-black text-sm shrink-0"},"/"),
                        React.createElement('input',{value:form.caseYear,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('caseYear',e.target.value),placeholder:"السنة",maxLength:4,className:"w-24 p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 text-center",style:inpStyle})
                    )
                ),

                // ٤. تصنيف الدعوى
                React.createElement('div',null,
                    React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"تصنيف الدعوى"),
                    (countryCaseTypes && countryCaseTypes.length>0)
                        ? React.createElement(React.Fragment,null,
                            React.createElement(Sel,{
                                value:form.type,
                                onChange:(e: React.ChangeEvent<HTMLSelectElement>) =>s('type',e.target.value),
                                options:[{value:'',label:'— اختر التصنيف —'},...countryCaseTypes.map((t:string)=>({value:t,label:t})),{value:'أخرى',label:'أخرى (اكتب يدوياً)'}]
                            }),
                            form.type==='أخرى'&&React.createElement('input',{
                                value:form.type_other,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('type_other',e.target.value),
                                placeholder:"اكتب تصنيف الدعوى",
                                className:"w-full mt-2 p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",
                                style:inpStyle
                            })
                        )
                        : React.createElement('input',{value:form.type,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('type',e.target.value),placeholder:"مثال: مدني / تجاري / جنائي...",className:inputCls,style:inpStyle})
                ),

                // ٥. رقم الدائرة
                React.createElement('div',null,
                    React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"رقم الدائرة"),
                    React.createElement('input',{value:form.circuit_number,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('circuit_number',e.target.value),placeholder:"مثال: 12 تجاري",className:inputCls,style:inpStyle})
                ),

                // ٦. تاريخ الجلسة
                React.createElement(DatePicker,{label:"تاريخ الجلسة القادمة",value:form.date,onChange:(v: string) =>s("date",v)}),

                // وقت الجلسة (يظهر بعد اختيار التاريخ)
                form.date&&React.createElement('div',{className:"space-y-3"},
                    React.createElement('div',null,
                        React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"وقت الجلسة"),
                        React.createElement('div',{className:"flex gap-2"},
                            ['صباحي','مسائي'].map((t: string) =>React.createElement('button',{
                                key:t,type:"button",
                                onClick:()=>s('session_time',t),
                                className:`flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all active:scale-95 ${form.session_time===t?'bg-premium-gold text-premium-bg':'bg-white/5 border border-white/10 text-slate-400'}`
                            },t==='صباحي'?'🌅 صباحي':'🌆 مسائي'))
                        )
                    ),
                    React.createElement('div',{className:"grid grid-cols-2 gap-2"},
                        React.createElement('div',null,
                            React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"الطابق"),
                            React.createElement('input',{value:form.court_floor,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('court_floor',e.target.value),placeholder:"مثال: الأول",className:inputCls,style:inpStyle})
                        ),
                        React.createElement('div',null,
                            React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"رقم القاعة"),
                            React.createElement('input',{value:form.court_hall,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('court_hall',e.target.value),placeholder:"مثال: 5",className:inputCls,style:inpStyle})
                        )
                    )
                ),

                // ٧. الموكل من القائمة (اختياري)
                clients.length>0&&React.createElement(Sel,{
                    label:"ربط بموكل من النظام (اختياري)",
                    value:form.client_id,
                    onChange:(e: React.ChangeEvent<HTMLSelectElement>) =>s('client_id',e.target.value),
                    options:[{value:'',label:'— اختر موكلاً (اختياري) —'},...clients.map((c: ClientRow) =>({value:c.id,label:c.full_name}))]
                }),

                // ── بيانات إضافية ──
                React.createElement('div',{className:"border-t border-white/10 pt-4 mt-2"},
                    React.createElement('p',{className:"text-[10px] font-black text-slate-500 mb-3"},"— بيانات إضافية (غير ضرورية) —")
                ),

                React.createElement('div',null,
                    React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"قاعة الجلسة"),
                    React.createElement('input',{value:form.session_hall,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('session_hall',e.target.value),placeholder:"رقم أو اسم قاعة الجلسة",className:inputCls,style:inpStyle})
                ),
                React.createElement('div',null,
                    React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"قاعة سكرتير الجلسة"),
                    React.createElement('input',{value:form.secretary_hall,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('secretary_hall',e.target.value),placeholder:"رقم أو اسم قاعة السكرتير",className:inputCls,style:inpStyle})
                ),
                React.createElement('div',null,
                    React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"اسم سكرتير الجلسة"),
                    React.createElement('input',{value:form.secretary_name,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('secretary_name',e.target.value),placeholder:"اسم السكرتير",className:inputCls,style:inpStyle})
                ),

                // زر الحفظ
                React.createElement('button',{
                    disabled:loading,
                    'data-testid':'new-case-save',
                    onClick:()=>{
                        if(!form.title){toast('يرجى إدخال موضوع الدعوى',true);return;}
                        const number = form.caseNum&&form.caseYear ? form.caseNum+'/'+form.caseYear : form.caseNum||form.caseYear||'';
                        const finalCourtLevel = form.court_level==='أخرى' ? form.court_level_other : form.court_level;
                        const finalCourt = form.court==='أخرى' ? (form.court_other||'—') : (form.court||'—');
                        const finalType  = form.type==='أخرى'  ? (form.type_other||'عام') : (form.type||'عام');
                        onSave({
                            ...form,
                            number,
                            court: finalCourt,
                            type: finalType,
                            court_level: finalCourtLevel,
                            plaintiff: form.client_name + (form.client_capacity ? ` (${form.client_capacity})` : ''),
                            defendant: form.opponent + (form.opponent_capacity ? ` (${form.opponent_capacity})` : ''),
                        });
                    },
                    className:"w-full py-3.5 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-xl font-black text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform mt-2"
                },loading?React.createElement(I.Spin):React.createElement(I.Plus),loading?'جاري الحفظ...':'حفظ وتقييد الدعوى ☁️')
            )
        )
    );
}

export default NewCaseModal;
