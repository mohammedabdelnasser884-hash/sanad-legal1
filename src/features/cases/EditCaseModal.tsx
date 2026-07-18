import React, { useState } from 'react';
import { I } from '../../constants';
import { Inp } from '@/shared/ui/Inp';
import { Sel } from '@/shared/ui/Sel';
import { toast } from '../../shared/lib/notifications';
import DatePicker from '@/shared/ui/DatePicker';
import type { MappedCase } from '../../hooks/useAppData';
import type { CaseFormSubmitData } from './hooks/useCaseActions';

interface EditCaseModalProps {
    caseData: MappedCase;
    onClose: () => void;
    onSave: (form: CaseFormSubmitData) => void;
    countryCourts?: string[];
    countryCaseTypes?: string[];
}

interface EditCaseForm {
    title: string; caseNum: string; caseYear: string;
    court: string; court_other: string; court_floor: string; court_hall: string;
    type: string; type_other: string;
    court_level: string; court_level_other: string; circuit_number: string;
    status: string; date: string; session_time: string;
    client_name: string; client_capacity: string; opponent: string; opponent_capacity: string;
    session_hall: string; secretary_hall: string; secretary_name: string;
}

function EditCaseModal({caseData, onClose, onSave, countryCourts, countryCaseTypes}: EditCaseModalProps){
    const splitNum = (num: string) => {
        if(!num||num==='—') return {n:'',y:''};
        const parts = num.split('/');
        return parts.length===2 ? {n:parts[0],y:parts[1]} : {n:num,y:''};
    };
    const split = splitNum(caseData.number);

    // ⚡ توحيد منطق مكان الجلسة: كان فيه حقلين منفصلين (court_floor +
    // court_hall) بالإضافة لحقل session_hall في "بيانات إضافية" —
    // نفس المعنى مكرر في 3 حقول. من دلوقتي session_hall هو المصدر
    // الوحيد. لو القضية قديمة ومعندهاش session_hall لكن عندها
    // court_floor/court_hall، بندمجهم هنا مرة واحدة عشان البيانات
    // القديمة متضيعش (بدون ما نلمس الأعمدة القديمة في الداتابيز).
    const mergedSessionHall = caseData.session_hall || [
        caseData.court_floor ? `الدور ${caseData.court_floor}` : '',
        caseData.court_hall ? `قاعة ${caseData.court_hall}` : '',
    ].filter(Boolean).join(' - ');

    // ⚡ FIX: الموكل والصفة كانوا بيتقروا بـ regex من نص plaintiff نفسه
    // (نمط "الاسم (الصفة)") — ده كان بيتعارض مع عمود plaintiff_role/
    // defendant_role الموجود فعليًا في جدول cases (ومُستخدم بالفعل في
    // الجلسات المستقلة). دلوقتي بنقرا الصفة من عمودها المخصص مباشرة.
    // الـ fallback على الـ regex اتسيب بس لأي صف قديم لسه معندوش
    // plaintiff_role متعبي (قبل تشغيل migration الـ backfill)، عشان
    // مايضيعش بيانات صفة قديمة كانت متخزنة جوه النص.
    //
    // ⚠️ FIX تاني: الموكل ممكن يكون شركة، وأسماء الشركات المصرية غالبًا
    // بتنتهي بـ"(ش.م.م)" أو "(ذ.م.م)" — ده جزء من اسم الشركة مش صفة
    // قانونية. عشان كده الـ fallback بيقسم بس لو اللي جوه القوسين فعلاً
    // كلمة صفة معروفة (مدعي/مدعى عليه/مستأنف/طاعن...)، وإلا بيسيب النص
    // كله زي ما هو كاسم (من غير ما يقطع جزء من اسم الشركة).
    const knownCapacityPattern = /مدعي|مدعى عليه|مستأنف|طاعن|مطعون ضده|متهم|مجني عليه|محكوم عليه|خصم|مدين|دائن|موكل|وكيل|طالب|مطلوب ضده|منفذ ضده/;
    const splitParty = (val: string | null) => {
        if(!val) return {name:'',capacity:''};
        const m = val.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
        if(m && knownCapacityPattern.test(m[2])) return {name:m[1].trim(), capacity:m[2].trim()};
        return {name:val, capacity:''};
    };
    const clientParts = caseData.plaintiff_role
        ? {name: caseData.plaintiff || '', capacity: caseData.plaintiff_role}
        : splitParty(caseData.plaintiff);
    const opponentParts = caseData.defendant_role
        ? {name: caseData.defendant || '', capacity: caseData.defendant_role}
        : splitParty(caseData.defendant);

    // تحديد لو درجة التقاضي هي أخرى
    const knownLevels = ['ابتدائي','استئناف','نقض'];
    const existingLevel = caseData.court_level || '';
    const isOther = existingLevel && !knownLevels.includes(existingLevel);

    // تحديد لو المحكمة/التصنيف الحاليين مش من قوائم الدولة (قيمة نصية قديمة/يدوية)
    const existingCourt = caseData.court==='—' ? '' : (caseData.court || '');
    const isCourtOther = existingCourt && countryCourts && countryCourts.length>0 && !countryCourts.includes(existingCourt);
    const existingType = caseData.type==='عام' ? '' : (caseData.type || '');
    const isTypeOther = existingType && countryCaseTypes && countryCaseTypes.length>0 && !countryCaseTypes.includes(existingType);

    const [form, setForm] = useState<EditCaseForm>({
        title: caseData.title || '',
        caseNum: split.n,
        caseYear: split.y,
        court: isCourtOther ? 'أخرى' : existingCourt,
        court_other: isCourtOther ? existingCourt : '',
        court_floor: caseData.court_floor || '',
        court_hall: caseData.court_hall || '',
        type: isTypeOther ? 'أخرى' : existingType,
        type_other: isTypeOther ? existingType : '',
        court_level: isOther ? 'أخرى' : existingLevel,
        court_level_other: isOther ? existingLevel : '',
        circuit_number: caseData.circuit_number || '',
        status: caseData.status || 'نشطة',
        date: caseData.date==='—'?'':caseData.date || '',
        session_time: caseData.session_time || 'صباحي',
        client_name: clientParts.name,
        client_capacity: clientParts.capacity,
        opponent: opponentParts.name,
        opponent_capacity: opponentParts.capacity,
        session_hall: mergedSessionHall,
        secretary_hall: caseData.secretary_hall || '',
        secretary_name: caseData.secretary_name || '',
    });
    const s = <K extends keyof EditCaseForm>(k: K,v: EditCaseForm[K]) => setForm((p) =>({...p,[k]:v}));

    const inputCls = "w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 transition-colors";
    const inpStyle = {fontFamily:'Cairo,sans-serif'};

    return React.createElement('div', {className: "bg-premium-card w-full max-w-lg rounded-t-3xl border-t border-white/10 p-6 pb-10 shadow-2xl slide-up max-h-[90vh] overflow-y-auto no-scrollbar"},
        React.createElement('div', {className: "w-10 h-1 bg-white/20 rounded-full mx-auto mb-5"}),
        React.createElement('div', {className: "flex items-center justify-between mb-5"},
            React.createElement('h3', {className: "text-sm font-black text-white flex items-center gap-2"},
                React.createElement('span', {className: "w-1 h-4 bg-premium-gold rounded-full"}),
                "تعديل بيانات القضية"
            ),
            React.createElement('button', {onClick: onClose, className: "w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400"}, "✕")
        ),
        React.createElement('div', {className: "space-y-4"},

            // موضوع الدعوى
            React.createElement(Inp, {label:"موضوع الدعوى", value:form.title, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('title',e.target.value), placeholder:"عنوان القضية", required:true}),

            // ── أطراف الدعوى ──
            React.createElement('div', {className:"border-t border-white/5 pt-1"},
                React.createElement('p', {className:"text-[10px] font-black text-slate-500 mb-3"}, "— أطراف الدعوى —")
            ),

            // الموكل + صفته
            React.createElement('div', {className:"grid grid-cols-2 gap-2"},
                React.createElement(Inp, {label:"الموكل", value:form.client_name, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('client_name',e.target.value), placeholder:"اسم الموكل", required:true, 'data-testid':'edit-case-client-name'}),
                React.createElement(Inp, {label:"صفة الموكل", value:form.client_capacity, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('client_capacity',e.target.value), placeholder:"مثال: مدعي / متهم...", required:true, 'data-testid':'edit-case-client-capacity'})
            ),

            // الخصم + صفته
            React.createElement('div', {className:"grid grid-cols-2 gap-2"},
                React.createElement(Inp, {label:"الخصم", value:form.opponent, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('opponent',e.target.value), placeholder:"اسم الخصم", required:true, 'data-testid':'edit-case-opponent'}),
                React.createElement(Inp, {label:"صفة الخصم", value:form.opponent_capacity, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('opponent_capacity',e.target.value), placeholder:"مثال: مدعى عليه...", required:true, 'data-testid':'edit-case-opponent-capacity'})
            ),

            // ── بيانات القيد الرسمي ──
            React.createElement('div', {className:"border-t border-white/5 pt-1"},
                React.createElement('p', {className:"text-[10px] font-black text-slate-500 mb-3"}, "— بيانات القيد الرسمي —")
            ),

            // ١. درجة التقاضي
            React.createElement('div', null,
                React.createElement('label', {className:"block text-[10px] font-bold text-slate-400 mb-1.5"}, "درجة التقاضي"),
                React.createElement('div', {className:"flex gap-2"},
                    ['ابتدائي','استئناف','نقض','أخرى'].map((lvl: string) =>React.createElement('button',{
                        key:lvl, type:"button",
                        onClick:()=>s('court_level',lvl),
                        className:`flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all active:scale-95 ${form.court_level===lvl?'bg-premium-gold text-premium-bg':'bg-white/5 border border-white/10 text-slate-400'}`
                    },lvl))
                ),
                form.court_level==='أخرى'&&React.createElement('input',{
                    value:form.court_level_other, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('court_level_other',e.target.value),
                    placeholder:"اكتب درجة التقاضي",
                    className:"w-full mt-2 p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",
                    style:inpStyle
                })
            ),

            // ٢. المحكمة المختصة
            React.createElement('div', null,
                React.createElement('label', {className:"block text-[10px] font-bold text-slate-400 mb-1.5"}, "المحكمة المختصة"),
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
                    : React.createElement('input', {value:form.court, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('court',e.target.value), placeholder:"اكتب اسم المحكمة يدوياً", className:inputCls, style:inpStyle})
            ),

            // ٣. رقم الدعوى الرسمي + السنة
            React.createElement('div', null,
                React.createElement('label', {className:"block text-[10px] font-bold text-slate-400 mb-1.5"}, "رقم الدعوى الرسمي"),
                React.createElement('div', {className:"flex gap-2 items-center"},
                    React.createElement('input', {value:form.caseNum, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('caseNum',e.target.value), placeholder:"رقم الدعوى", className:"flex-1 p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 text-center", style:inpStyle}),
                    React.createElement('span', {className:"text-slate-500 font-black text-sm shrink-0"}, "/"),
                    React.createElement('input', {value:form.caseYear, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('caseYear',e.target.value), placeholder:"السنة", maxLength:4, className:"w-24 p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 text-center", style:inpStyle})
                )
            ),

            // ٤. تصنيف الدعوى
            React.createElement('div', null,
                React.createElement('label', {className:"block text-[10px] font-bold text-slate-400 mb-1.5"}, "تصنيف الدعوى"),
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
                    : React.createElement('input', {value:form.type, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('type',e.target.value), placeholder:"مثال: مدني / تجاري / جنائي...", className:inputCls, style:inpStyle})
            ),

            // ٥. رقم الدائرة
            React.createElement('div', null,
                React.createElement('label', {className:"block text-[10px] font-bold text-slate-400 mb-1.5"}, "رقم الدائرة"),
                React.createElement('input', {value:form.circuit_number, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('circuit_number',e.target.value), placeholder:"مثال: 12 تجاري", className:inputCls, style:inpStyle})
            ),

            // ٦. تاريخ الجلسة
            React.createElement(DatePicker, {label:"تاريخ الجلسة القادمة", value:form.date, onChange:(v: string) =>s("date",v)}),

            // وقت الجلسة
            form.date && React.createElement('div',{className:"space-y-3"},
                React.createElement('div',null,
                    React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},"وقت الجلسة"),
                    React.createElement('div',{className:"flex gap-2"},
                        ['صباحي','مسائي'].map((t: string) =>React.createElement('button',{
                            key:t,type:"button",
                            onClick:()=>s('session_time',t),
                            className:`flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all active:scale-95 ${form.session_time===t?'bg-premium-gold text-premium-bg':'bg-white/5 border border-white/10 text-slate-400'}`
                        },t==='صباحي'?'🌅 صباحي':'🌆 مسائي'))
                    )
                )
            ),

            // ٧. حالة القضية
            React.createElement('div', null,
                React.createElement('label', {className:"block text-[10px] font-bold text-slate-400 mb-1.5"}, "حالة القضية"),
                React.createElement('div', {className:"grid grid-cols-3 gap-2"},
                    [
                        {val:'نشطة',   emoji:'🟢', color:'emerald'},
                        {val:'مؤجلة',  emoji:'🟡', color:'amber'},
                        {val:'منتهية', emoji:'✅', color:'emerald'},
                    ].map(({val,emoji,color})=>
                        React.createElement('button',{
                            key:val, type:"button",
                            onClick:()=>s('status',val),
                            className:`py-2.5 rounded-xl text-[10px] font-black transition-all active:scale-95 border ${
                                form.status===val
                                    ? color==='emerald' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                                    : color==='amber'   ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                                    :                     'bg-slate-500/20 border-slate-500/50 text-slate-300'
                                    : 'bg-white/5 border-white/10 text-slate-500'
                            }`
                        }, emoji+' '+val)
                    )
                )
            ),

            // ── بيانات إضافية ──
            React.createElement('div', {className:"border-t border-white/10 pt-4 mt-2"},
                React.createElement('p', {className:"text-[10px] font-black text-slate-500 mb-3"}, "— بيانات إضافية (غير ضرورية) —")
            ),

            React.createElement('div', null,
                React.createElement('label', {className:"block text-[10px] font-bold text-slate-400 mb-1.5"}, "الطابق وقاعة الجلسة"),
                React.createElement('input', {value:form.session_hall, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('session_hall',e.target.value), placeholder:"مثال: الدور الأول - قاعة 5", className:inputCls, style:inpStyle})
            ),
            React.createElement('div', null,
                React.createElement('label', {className:"block text-[10px] font-bold text-slate-400 mb-1.5"}, "قاعة سكرتير الجلسة"),
                React.createElement('input', {value:form.secretary_hall, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('secretary_hall',e.target.value), placeholder:"رقم أو اسم قاعة السكرتير", className:inputCls, style:inpStyle})
            ),
            React.createElement('div', null,
                React.createElement('label', {className:"block text-[10px] font-bold text-slate-400 mb-1.5"}, "اسم سكرتير الجلسة"),
                React.createElement('input', {value:form.secretary_name, onChange:(e: React.ChangeEvent<HTMLInputElement>) =>s('secretary_name',e.target.value), placeholder:"اسم السكرتير", className:inputCls, style:inpStyle})
            ),

            // زر الحفظ
            React.createElement('button', {
                onClick: () => {
                    if(!form.title.trim()){ toast('يرجى إدخال موضوع ومسمى الدعوى', true); return; }
                    if(!form.client_name.trim()){ toast('يرجى إدخال اسم الموكل', true); return; }
                    if(!form.client_capacity.trim()){ toast('يرجى إدخال صفة الموكل', true); return; }
                    if(!form.opponent.trim()){ toast('يرجى إدخال اسم الخصم', true); return; }
                    if(!form.opponent_capacity.trim()){ toast('يرجى إدخال صفة الخصم', true); return; }
                    const number = form.caseNum&&form.caseYear ? form.caseNum+'/'+form.caseYear : form.caseNum||form.caseYear||'';
                    const finalCourtLevel = form.court_level==='أخرى' ? form.court_level_other : form.court_level;
                    const finalCourt = form.court==='أخرى' ? (form.court_other||'—') : (form.court||'—');
                    const finalType  = form.type==='أخرى'  ? (form.type_other||'عام') : (form.type||'عام');
                    const saveData = {
                        ...form,
                        number,
                        court: finalCourt,
                        type: finalType,
                        court_level: finalCourtLevel,
                        // ⚡ FIX: الاسم والصفة بيتبعتوا دلوقتي في عمودين منفصلين
                        // (plaintiff/plaintiff_role, defendant/defendant_role) بدل
                        // دمج الصفة جوه نص الاسم بأقواس — نفس الطريقة اللي
                        // case_sessions شغالة بيها من الأول.
                        plaintiff: form.client_name,
                        plaintiff_role: form.client_capacity || undefined,
                        defendant: form.opponent,
                        defendant_role: form.opponent_capacity || undefined,
                    };
                    onSave(saveData);
                },
                className: "w-full py-3.5 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform mt-2"
            }, React.createElement(I.Check), "حفظ التعديلات")
        )
    );
}

export default EditCaseModal;
