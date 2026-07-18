import React, { useState, useEffect, useRef } from 'react';

import { MONTHS_AR, DAYS_AR } from './arabicLocale';

interface DatePickerProps {
    label?: string;
    value: string;
    onChange: (value: string) => void;
    required?: boolean;
    testId?: string;
    dayTestId?: string;
}

function DatePicker({label, value, onChange, required = false, testId, dayTestId}: DatePickerProps){
    const [open, setOpen]   = useState(false);
    const ref               = useRef<HTMLDivElement>(null);
    const parsed = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value+"T00:00:00") : null;
    const today  = new Date();
    const [viewYear,  setViewYear]  = useState((parsed||today).getFullYear());
    const [viewMonth, setViewMonth] = useState((parsed||today).getMonth());
    useEffect(()=>{
        const handler = (e: MouseEvent) => { if(ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", handler);
        return ()=>document.removeEventListener("mousedown", handler);
    },[]);
    const selectDay = (d: number) => {
        const mm = String(viewMonth+1).padStart(2,"0");
        const dd = String(d).padStart(2,"0");
        onChange(viewYear+"-"+mm+"-"+dd);
        setOpen(false);
    };
    const prevMonth = () => { if(viewMonth===0){setViewMonth(11);setViewYear((y: number) =>y-1);}else setViewMonth((m: number) =>m-1); };
    const nextMonth = () => { if(viewMonth===11){setViewMonth(0);setViewYear((y: number) =>y+1);}else setViewMonth((m: number) =>m+1); };
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
    const display = parsed ? (parsed.getDate()+" "+MONTHS_AR[parsed.getMonth()]+" "+parsed.getFullYear()) : "";
    const isSelected = (d: number) => parsed && parsed.getFullYear()===viewYear && parsed.getMonth()===viewMonth && parsed.getDate()===d;
    const isToday    = (d: number) => today.getFullYear()===viewYear && today.getMonth()===viewMonth && today.getDate()===d;
    return React.createElement("div", {className:"relative", ref},
        label && React.createElement("label", {className:"block text-[10px] font-bold text-slate-400 mb-1.5"}, label, required && React.createElement("span",{className:"text-rose-400 mr-1"},"*")),
        React.createElement("button", {type:"button", onClick:()=>setOpen((o: boolean) =>!o), 'data-testid': testId, className:"w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white transition-colors flex items-center justify-between", style:{fontFamily:"Cairo,sans-serif"}},
            React.createElement("span", {className: display?"text-white":"text-slate-600"}, display || "اختر تاريخاً"),
            React.createElement("span", {className:"text-premium-gold text-sm"}, "📅")
        ),
        open && React.createElement("div", {className:"absolute z-[200] top-full mt-2 right-0 bg-premium-card border border-white/10 rounded-2xl shadow-2xl p-4 w-72", style:{fontFamily:"Cairo,sans-serif"}},
            React.createElement("div", {className:"flex items-center justify-between mb-3"},
                React.createElement("button",{type:"button",onClick:nextMonth,className:"w-7 h-7 rounded-lg bg-white/5 text-white flex items-center justify-center text-sm hover:bg-white/10"},"›"),
                React.createElement("span",{className:"text-xs font-black text-white"},MONTHS_AR[viewMonth]+" "+viewYear),
                React.createElement("button",{type:"button",onClick:prevMonth,className:"w-7 h-7 rounded-lg bg-white/5 text-white flex items-center justify-center text-sm hover:bg-white/10"},"‹")
            ),
            React.createElement("div",{className:"grid grid-cols-7 mb-1"}, DAYS_AR.map((d: string) =>React.createElement("div",{key:d,className:"text-center text-[9px] text-slate-500 font-bold py-1"},d))),
            React.createElement("div",{className:"grid grid-cols-7 gap-y-1"},
                Array.from({length:firstDay}).map((_: unknown,i: number)=>React.createElement("div",{key:"e"+i})),
                Array.from({length:daysInMonth},(_: unknown,i: number)=>i+1).map((d: number) =>
                    React.createElement("button",{key:d,type:"button",onClick:()=>selectDay(d),'data-testid': dayTestId,className:"w-8 h-8 mx-auto rounded-xl text-[11px] font-bold transition-all flex items-center justify-center "+(isSelected(d)?"bg-premium-gold text-premium-bg font-black":isToday(d)?"border border-premium-gold/50 text-premium-gold":"text-slate-300 hover:bg-white/10")},d)
                )
            ),
            value && React.createElement("button",{type:"button",onClick:()=>{onChange("");setOpen(false);},className:"mt-3 w-full text-[10px] text-rose-400 font-bold py-1"},"✕ مسح التاريخ")
        )
    );
}

export default DatePicker;
