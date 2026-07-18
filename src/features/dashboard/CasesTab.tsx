import React, { useState, useEffect, useRef } from 'react';
import { I } from '../../constants';
import type { MappedCase } from '../../hooks/useAppData';

const PAGE_SIZE = 15;

interface CaseSection {
    key: string; label: string; emoji: string;
    emptyMsg: string; emptyNote: string;
    activeBg: string; activeText: string;
    inactiveBg: string; inactiveText: string;
    countActiveBg: string; countInactiveBg: string;
}

const caseSections: CaseSection[] = [
    {
        key:'نشطة', label:'متداولة', emoji:'⚖️',
        emptyMsg:'لا توجد قضايا متداولة حالياً',
        emptyNote:'القضايا التي لا تزال قيد النظر أمام المحكمة ستظهر هنا',
        activeBg:'bg-amber-500/20 border-amber-500/40', activeText:'text-amber-300',
        inactiveBg:'bg-white/3 border-white/8', inactiveText:'text-slate-400',
        countActiveBg:'bg-amber-500/30 text-amber-200', countInactiveBg:'bg-white/5 text-slate-500',
    },
    {
        key:'مؤجلة', label:'موقوفة', emoji:'⏸️',
        emptyMsg:'لا توجد قضايا موقوفة حالياً',
        emptyNote:'القضايا الموقوفة بقرار المحكمة أو بطلب الخصوم ستظهر هنا',
        activeBg:'bg-blue-500/20 border-blue-500/40', activeText:'text-blue-300',
        inactiveBg:'bg-white/3 border-white/8', inactiveText:'text-slate-400',
        countActiveBg:'bg-blue-500/30 text-blue-200', countInactiveBg:'bg-white/5 text-slate-500',
    },
    {
        key:'منتهية', label:'منتهية', emoji:'✅',
        emptyMsg:'لا توجد قضايا منتهية بعد',
        emptyNote:'القضايا التي صدر فيها حكم نهائي أو تم إنهاؤها ستُحفظ هنا',
        activeBg:'bg-emerald-500/20 border-emerald-500/40', activeText:'text-emerald-300',
        inactiveBg:'bg-white/3 border-white/8', inactiveText:'text-slate-400',
        countActiveBg:'bg-emerald-500/30 text-emerald-200', countInactiveBg:'bg-white/5 text-slate-500',
    },
    {
        key:'مغلقة', label:'مغلقة', emoji:'🔒',
        emptyMsg:'لا توجد قضايا مغلقة',
        emptyNote:'القضايا التي تم إغلاقها نهائياً (بدون صدور حكم) ستظهر هنا',
        activeBg:'bg-slate-500/20 border-slate-500/40', activeText:'text-slate-300',
        inactiveBg:'bg-white/3 border-white/8', inactiveText:'text-slate-400',
        countActiveBg:'bg-slate-500/30 text-slate-200', countInactiveBg:'bg-white/5 text-slate-500',
    },
];

// تنسيق رقم القيد: "1542/2026" → "1542 لسنة 2026"
const fmtCaseNum = (num: string) => {
    if(!num || num === '—') return num;
    const parts = num.split('/');
    return parts.length === 2 ? `${parts[0]} لسنة ${parts[1]}` : num;
};

interface CasesTabProps {
    cases: MappedCase[];
    casesFilter: string;
    setCasesFilter: (key: string) => void;
    casesPage: number;
    setCasesPage: (n: number) => void;
    casesTotal: number;
    casesLoading: boolean;
    fetchCases: (page?: number, filter?: string) => void;
    searchCases: (term: string, filter?: string) => void;
    casesSearch: string;
    setCasesSearch: (v: string) => void;
    setShowCaseModal: (v: boolean) => void;
    setSelectedCase: (c: MappedCase) => void;
    loadingCases: boolean;
    dbError: string | null;
}

function CasesTab({ cases, casesFilter, setCasesFilter, casesPage, setCasesPage, casesTotal, casesLoading, fetchCases, searchCases, casesSearch, setCasesSearch, setShowCaseModal, setSelectedCase, loadingCases, dbError }: CasesTabProps) {
    const activeSection = caseSections.find((s: CaseSection) => s.key === casesFilter) || caseSections[0];

    // ── local search input state ──
    const [localSearch, setLocalSearch] = useState(casesSearch || '');
    const [searchOpen,  setSearchOpen]  = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inputRef    = useRef<HTMLInputElement>(null);

    // debounce البحث
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setCasesSearch(localSearch);
            searchCases(localSearch, casesFilter);
        }, 400);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localSearch]);

    // عند تغيير الفلتر (تاب) امسح البحث
    const handleFilterChange = (key: string) => {
        setLocalSearch('');
        setCasesSearch('');
        setCasesFilter(key);
        setCasesPage(0);
        fetchCases(0, key);
    };

    const handleSearchOpen = () => {
        setSearchOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const handleSearchClear = () => {
        setLocalSearch('');
        setCasesSearch('');
        setSearchOpen(false);
        fetchCases(0, casesFilter);
    };

    const isSearching = localSearch.trim().length > 0;

    const renderCaseCard = (c: MappedCase) => {
        return React.createElement('div', {
            key: c.id,
            onClick: () => setSelectedCase(c),
            'data-testid': 'case-card',
            className: "bg-premium-card border border-white/5 rounded-xl overflow-hidden active:scale-[0.98] transition-all cursor-pointer"
        },
            React.createElement('div', { className: "flex items-center gap-2.5 px-3 py-2.5" },
                React.createElement('div', {
                    className: "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm",
                    style: { background: 'rgba(212,175,55,0.12)' }
                }, "⚖️"),
                React.createElement('div', { className: "flex-1 min-w-0" },
                    React.createElement('div', { className: "flex items-center gap-2 justify-between" },
                        React.createElement('h4', { className: "font-black text-[12px] text-white leading-tight truncate flex-1" }, c.title),
                        c.number && c.number !== '—' && React.createElement('span', {
                            className: "text-[9px] font-black font-mono px-1.5 py-0.5 rounded-md shrink-0",
                            style: { background: 'rgba(212,175,55,0.15)', color: '#D4AF37' }
                        }, fmtCaseNum(c.number))
                    ),
                    React.createElement('div', { className: "flex items-center gap-1.5 mt-0.5 flex-wrap" },
                        (c.plaintiff || c.defendant) && React.createElement('span', { className: "text-[10px] text-slate-300 truncate max-w-[160px]" },
                            (c.plaintiff || '—') + ' ضد ' + (c.defendant || '—')
                        ),
                        c.court && c.court !== '—' && React.createElement('span', { className: "text-[9px] text-slate-500 shrink-0" }, '· ' + c.court),
                        c.type && React.createElement('span', {
                            className: "text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
                            style: { background: 'rgba(212,175,55,0.1)', color: '#D4AF37' }
                        }, c.type)
                    )
                ),
                React.createElement('svg', { className: "w-3.5 h-3.5 text-slate-600 shrink-0", fill: "none", viewBox: "0 0 24 24", strokeWidth: "2.5", stroke: "currentColor" },
                    React.createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M15.75 19.5 8.25 12l7.5-7.5" })
                )
            )
        );
    };

    return React.createElement('div', { className: "space-y-4 fade-in" },
        // ── هيدر ──
        React.createElement('div', { className: "flex items-center justify-between gap-2" },
            React.createElement('h3', { className: "text-sm font-black text-white shrink-0" }, "منظومة القضايا"),

            // ── صف الأزرار ──
            React.createElement('div', { className: "flex items-center gap-2 flex-1 justify-end" },

                // ── Search bar / زرار بحث ──
                searchOpen
                    ? React.createElement('div', {
                        className: "flex items-center gap-1.5 flex-1 bg-white/8 border border-white/12 rounded-xl px-2.5 py-1.5",
                        style: { minWidth: 0 }
                    },
                        React.createElement('svg', { className: "w-3.5 h-3.5 text-amber-400 shrink-0", fill: "none", viewBox: "0 0 24 24", strokeWidth: "2.5", stroke: "currentColor" },
                            React.createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" })
                        ),
                        React.createElement('input', {
                            ref: inputRef,
                            type: "text",
                            value: localSearch,
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setLocalSearch(e.target.value),
                            maxLength: 100,
                            placeholder: "اسم موكل · دعوى · رقم...",
                            dir: "rtl",
                            className: "flex-1 bg-transparent text-[11px] text-white placeholder-slate-500 outline-none min-w-0",
                        }),
                        React.createElement('button', {
                            onClick: handleSearchClear,
                            className: "text-slate-500 hover:text-slate-300 shrink-0 active:scale-90 transition-transform"
                        },
                            React.createElement('svg', { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", strokeWidth: "2.5", stroke: "currentColor" },
                                React.createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M6 18 18 6M6 6l12 12" })
                            )
                        )
                    )
                    : React.createElement('button', {
                        onClick: handleSearchOpen,
                        className: "flex items-center gap-1 bg-white/8 border border-white/10 text-slate-300 px-2.5 py-2 rounded-xl text-[11px] font-black active:scale-95 transition-transform hover:border-amber-500/30 hover:text-amber-300",
                        title: "بحث في القضايا"
                    },
                        React.createElement('svg', { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", strokeWidth: "2.5", stroke: "currentColor" },
                            React.createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" })
                        ),
                        React.createElement('span', null, "بحث")
                    ),

                // ── زرار تقييد قضية ──
                React.createElement('button', {
                    onClick: () => setShowCaseModal(true),
                    'data-testid': 'new-case-button',
                    className: "flex items-center bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg px-3 py-2 rounded-xl text-xs font-black shadow-lg gap-1 active:scale-95 transition-transform shrink-0"
                },
                    React.createElement(I.Plus), "تقييد قضية"
                )
            )
        ),

        // ── نتيجة البحث الحالي ──
        isSearching && React.createElement('div', {
            className: "flex items-center gap-2 px-2.5 py-1.5 bg-amber-500/8 border border-amber-500/15 rounded-xl"
        },
            React.createElement('svg', { className: "w-3 h-3 text-amber-400 shrink-0", fill: "none", viewBox: "0 0 24 24", strokeWidth: "2.5", stroke: "currentColor" },
                React.createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" })
            ),
            React.createElement('span', { className: "text-[10px] text-amber-300 flex-1" },
                `نتائج "${localSearch}" · ${casesTotal} قضية`
            ),
            !casesLoading && !loadingCases && React.createElement('span', {
                className: "text-[9px] text-amber-500/60"
            }, activeSection.label)
        ),

        // ── Pill Selector ──
        React.createElement('div', { className: "flex items-center bg-white/5 rounded-2xl p-1 gap-1" },
            caseSections.map((s: CaseSection) => {
                const isActive = casesFilter === s.key;
                const count = isActive ? casesTotal : '…';
                return React.createElement('button', {
                    key: s.key,
                    onClick: () => handleFilterChange(s.key),
                    className: `flex-1 flex items-center justify-center gap-1 py-2 px-1 rounded-xl transition-all active:scale-95 ${isActive ? s.activeBg + ' shadow-sm' : 'text-slate-500 hover:text-slate-300'}`
                },
                    React.createElement('span', { className: "text-sm leading-none" }, s.emoji),
                    React.createElement('span', { className: `text-[11px] font-black ${isActive ? s.activeText : 'text-slate-400'}` }, s.label),
                    React.createElement('span', { className: `text-[9px] font-black px-1.5 py-0.5 rounded-full ${isActive ? s.countActiveBg : 'bg-white/8 text-slate-500'}` }, count)
                );
            })
        ),

        // ── القضايا ──
        (loadingCases || casesLoading)
            ? React.createElement('div', { className: "flex items-center justify-center py-16 gap-2 text-slate-500 text-xs" }, React.createElement(I.Spin), "جاري الجلب...")
            : dbError
                ? React.createElement('div', { className: "bg-rose-500/10 border border-rose-500/20 rounded-xl p-6 text-center text-xs text-rose-400" }, "⚠️ " + dbError)
                : cases.length === 0
                    ? React.createElement('div', { className: "bg-premium-card border border-white/5 rounded-2xl px-5 py-10 text-center space-y-2" },
                        React.createElement('p', { className: "text-3xl mb-1" }, isSearching ? '🔍' : activeSection.emoji),
                        React.createElement('p', { className: `text-xs font-black ${isSearching ? 'text-slate-400' : activeSection.activeText}` },
                            isSearching ? `لا توجد نتائج لـ "${localSearch}"` : activeSection.emptyMsg
                        ),
                        React.createElement('p', { className: "text-[10px] text-slate-600 leading-relaxed mt-1" },
                            isSearching ? 'جرّب بحثاً مختلفاً أو تحقق من التاب الصحيح' : activeSection.emptyNote
                        )
                    )
                    : React.createElement('div', { className: "space-y-2" },
                        cases.map((c: MappedCase) => renderCaseCard(c)),
                        !isSearching && cases.length < casesTotal && React.createElement('button', {
                            onClick: () => { const p = casesPage + 1; fetchCases(p, casesFilter); },
                            disabled: casesLoading,
                            className: "w-full py-3 rounded-2xl text-xs font-black active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40",
                            style: { background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.18)', color: '#D4AF37' }
                        },
                            casesLoading
                                ? React.createElement(I.Spin)
                                : React.createElement('span', { className: "text-base" }, "⬇️"),
                            "تحميل المزيد",
                            React.createElement('span', {
                                className: "text-[9px] px-2 py-0.5 rounded-full font-black",
                                style: { background: 'rgba(212,175,55,0.12)', color: '#D4AF37' }
                            }, `${casesTotal - cases.length} قضية`)
                        )
                    )
    );
}

export default CasesTab;
