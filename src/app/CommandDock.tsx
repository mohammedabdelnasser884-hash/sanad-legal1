import React from 'react';
import { I } from '../constants';
import type { TabName } from '../useNavigation';

interface CommandDockProps {
    tab: TabName;
    setTab: (tab: TabName) => void;
    showMore: boolean;
    setShowMore: React.Dispatch<React.SetStateAction<boolean>>;
    isAdmin: boolean;
    navRef: (el: HTMLElement | null) => void;
    setShowAI: (v: boolean) => void;
    setSessionsInitialTab: React.Dispatch<React.SetStateAction<'month' | 'calendar' | 'missed' | null>>;
    setRemindersInitialFilter: React.Dispatch<React.SetStateAction<string | null>>;
}

// ─────────────────────────────────────────────────────────
//  COMMAND DOCK — منقول حرفيًا من App.tsx (الشريط السفلي كامل).
//  JSX خام بحت (تصميم بصري ثابت) — صفر منطق أعمال جديد، نفس
//  الكود بالظبط، غيّرنا بس الاعتماد من closure لـ props.
// ─────────────────────────────────────────────────────────
function CommandDock({
    tab, setTab, showMore, setShowMore, isAdmin, navRef,
    setShowAI, setSessionsInitialTab, setRemindersInitialFilter,
}: CommandDockProps) {
    return React.createElement('div', { className: 'fixed bottom-0 inset-x-0 z-50 flex flex-col items-center pb-3 px-3 pointer-events-none' },

        showMore && React.createElement('div', {
            className: 'pointer-events-auto w-full max-w-sm mb-2 rounded-2xl overflow-hidden relative z-50',
            style: { background: 'rgba(6,12,26,0.97)', border: '1px solid rgba(212,175,55,0.18)', backdropFilter: 'blur(24px)', boxShadow: '0 -8px 40px rgba(0,0,0,0.7)', animation: 'slideUp 0.22s ease' }
        },
            React.createElement('div', { className: 'px-3 pt-3 pb-1' },
                React.createElement('p', { className: 'text-[10px] font-black text-slate-500 mb-2 text-right' }, 'أقسام إضافية')
            ),
            React.createElement('div', { className: 'grid grid-cols-4 gap-2 px-3 pb-4' },
                ...[
                    { tab: 'clients' as TabName,   icon: I.Person, label: 'الموكلين',    color: 'text-emerald-400', inactiveBg: 'bg-emerald-500/15', inactiveColor: 'text-emerald-300', activeBg: 'bg-emerald-500/25' },
                    { tab: 'documents' as TabName, icon: I.Folder, label: 'المستندات',   color: 'text-purple-400',  inactiveBg: 'bg-purple-500/15',  inactiveColor: 'text-purple-300',  activeBg: 'bg-purple-500/25' },
                    { tab: 'fees' as TabName,      icon: I.Money,  label: 'الأتعاب',     color: 'text-amber-300',   inactiveBg: 'bg-amber-500/15',   inactiveColor: 'text-amber-300',   activeBg: 'bg-amber-500/25' },
                    ...(isAdmin ? [{ tab: 'admin' as TabName, icon: I.Shield, label: 'لوحة الإدارة', color: 'text-red-400', inactiveBg: 'bg-red-500/15', inactiveColor: 'text-red-300', activeBg: 'bg-red-500/25' }] : []),
                ].map((item) => React.createElement('button', {
                    key: item.tab,
                    onClick: () => { setTab(item.tab); setShowMore(false); },
                    'data-testid': 'nav-more-' + item.tab,
                    className: `flex flex-col items-center gap-2 py-3.5 rounded-xl transition-all active:scale-95 ${tab === item.tab ? 'bg-white/8 ring-1 ring-white/10' : ''}`,
                },
                    React.createElement('div', { className: `w-12 h-12 rounded-2xl flex items-center justify-center ${tab === item.tab ? item.activeBg : item.inactiveBg}` },
                        React.createElement(item.icon, { className: `w-6 h-6 ${tab === item.tab ? item.color : item.inactiveColor}` })
                    ),
                    React.createElement('span', { className: `text-[10px] font-bold ${tab === item.tab ? item.color : item.inactiveColor}` }, item.label)
                ))
            )
        ),

        showMore && React.createElement('div', {
            className: 'pointer-events-auto fixed inset-0 z-40',
            style: { background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' },
            onClick: () => setShowMore(false)
        }),

        React.createElement('nav', {
            ref: navRef,
            className: 'pointer-events-auto w-full max-w-sm h-[62px] flex items-center px-2 gap-0',
            style: {
                background: 'rgba(15,25,50,0.97)', backdropFilter: 'blur(28px) saturate(180%)',
                border: '1px solid rgba(212,175,55,0.25)', borderRadius: '24px',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset, 0 -4px 24px rgba(212,175,55,0.08), 0 20px 60px rgba(0,0,0,0.9)',
            }
        },
            // الرئيسية
            React.createElement('button', {
                onClick: () => { setTab('dashboard'); setShowMore(false); },
                className: 'flex flex-col items-center justify-center gap-[3px] flex-1 h-[50px] rounded-[18px] transition-all duration-200 active:scale-90 relative',
                style: tab === 'dashboard' ? { background: 'rgba(212,175,55,0.1)' } : {}
            },
                React.createElement(I.Home, { className: `w-6 h-6 transition-all duration-200 ${tab === 'dashboard' ? 'text-premium-gold -translate-y-[1px]' : 'text-white/80'}` }),
                React.createElement('span', { className: `text-[9.5px] font-bold transition-colors duration-200 ${tab === 'dashboard' ? 'text-premium-gold' : 'text-white/70'}` }, 'الرئيسية'),
                tab === 'dashboard' && React.createElement('div', { className: 'absolute bottom-[5px] left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-full', style: { background: '#D4AF37', boxShadow: '0 0 10px 3px rgba(212,175,55,0.5)', animation: 'glowPulse 2.5s ease-in-out infinite' } })
            ),
            // الجلسات
            React.createElement('button', {
                onClick: () => { setSessionsInitialTab(null); setTab('calendar'); setShowMore(false); },
                className: 'flex flex-col items-center justify-center gap-[3px] flex-1 h-[50px] rounded-[18px] transition-all duration-200 active:scale-90 relative',
                style: tab === 'calendar' ? { background: 'rgba(212,175,55,0.1)' } : {}
            },
                React.createElement(I.CalGrid, { className: `w-6 h-6 transition-all duration-200 ${tab === 'calendar' ? 'text-premium-gold -translate-y-[1px]' : 'text-white/80'}` }),
                React.createElement('span', { className: `text-[9.5px] font-bold transition-colors duration-200 ${tab === 'calendar' ? 'text-premium-gold' : 'text-white/70'}` }, 'الجلسات'),
                tab === 'calendar' && React.createElement('div', { className: 'absolute bottom-[5px] left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-full', style: { background: '#D4AF37', boxShadow: '0 0 10px 3px rgba(212,175,55,0.5)', animation: 'glowPulse 2.5s ease-in-out infinite' } })
            ),
            // AI
            React.createElement('div', { className: 'relative flex flex-col items-center justify-center px-2 flex-shrink-0' },
                React.createElement('button', {
                    onClick: () => { setShowAI(true); setShowMore(false); },
                    className: 'w-[48px] h-[48px] rounded-[16px] flex items-center justify-center active:scale-90 transition-transform relative overflow-hidden',
                    style: { background: 'linear-gradient(135deg,#c9922a,#D4AF37,#E8C84A)', boxShadow: '0 4px 24px rgba(212,175,55,0.55), 0 0 0 1px rgba(212,175,55,0.3)', animation: 'pulseGlow 3s ease-in-out infinite' }
                }, React.createElement(I.AI, { cls: 'w-6 h-6 text-[#070d1a]' })),
                React.createElement('span', { className: 'text-[7.5px] font-black text-premium-gold mt-[2px] leading-none' }, 'AI')
            ),
            // القضايا
            React.createElement('button', {
                onClick: () => { setTab('cases'); setShowMore(false); },
                'data-testid': 'nav-cases',
                className: 'flex flex-col items-center justify-center gap-[3px] flex-1 h-[50px] rounded-[18px] transition-all duration-200 active:scale-90 relative',
                style: tab === 'cases' ? { background: 'rgba(212,175,55,0.1)' } : {}
            },
                React.createElement(I.Brief, { className: `w-6 h-6 transition-all duration-200 ${tab === 'cases' ? 'text-premium-gold -translate-y-[1px]' : 'text-white/80'}` }),
                React.createElement('span', { className: `text-[9.5px] font-bold transition-colors duration-200 ${tab === 'cases' ? 'text-premium-gold' : 'text-white/70'}` }, 'القضايا'),
                tab === 'cases' && React.createElement('div', { className: 'absolute bottom-[5px] left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-full', style: { background: '#D4AF37', boxShadow: '0 0 10px 3px rgba(212,175,55,0.5)', animation: 'glowPulse 2.5s ease-in-out infinite' } })
            ),
            // المهام
            React.createElement('button', {
                onClick: () => { setRemindersInitialFilter(null); setTab('reminders'); setShowMore(false); },
                className: 'flex flex-col items-center justify-center gap-[3px] flex-1 h-[50px] rounded-[18px] transition-all duration-200 active:scale-90 relative',
                style: tab === 'reminders' ? { background: 'rgba(212,175,55,0.1)' } : {}
            },
                React.createElement(I.Bell, { className: `w-6 h-6 transition-all duration-200 ${tab === 'reminders' ? 'text-premium-gold -translate-y-[1px]' : 'text-white/80'}` }),
                React.createElement('span', { className: `text-[9.5px] font-bold transition-colors duration-200 ${tab === 'reminders' ? 'text-premium-gold' : 'text-white/70'}` }, 'المهام'),
                tab === 'reminders' && React.createElement('div', { className: 'absolute bottom-[5px] left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-full', style: { background: '#D4AF37', boxShadow: '0 0 10px 3px rgba(212,175,55,0.5)', animation: 'glowPulse 2.5s ease-in-out infinite' } })
            ),
            // المزيد
            React.createElement('button', {
                onClick: () => setShowMore((v) => !v),
                'data-testid': 'nav-more-toggle',
                className: 'flex flex-col items-center justify-center gap-[3px] flex-1 h-[50px] rounded-[18px] transition-all duration-200 active:scale-90 relative',
                style: (showMore || ['clients', 'fees', 'documents', 'admin'].includes(tab)) ? { background: 'rgba(212,175,55,0.1)' } : {}
            },
                React.createElement('svg', {
                    className: `w-6 h-6 transition-all duration-200 ${(showMore || ['clients', 'fees', 'documents', 'admin'].includes(tab)) ? 'text-premium-gold -translate-y-[1px]' : 'text-white/80'}`,
                    fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: '2'
                },
                    React.createElement('circle', { cx: '5',  cy: '12', r: '1.5', fill: 'currentColor' }),
                    React.createElement('circle', { cx: '12', cy: '12', r: '1.5', fill: 'currentColor' }),
                    React.createElement('circle', { cx: '19', cy: '12', r: '1.5', fill: 'currentColor' })
                ),
                React.createElement('span', { className: `text-[9.5px] font-bold transition-colors duration-200 ${(showMore || ['clients', 'fees', 'documents', 'admin'].includes(tab)) ? 'text-premium-gold' : 'text-white/70'}` }, 'المزيد'),
                (showMore || ['clients', 'fees', 'documents', 'admin'].includes(tab)) && React.createElement('div', { className: 'absolute bottom-[5px] left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-full', style: { background: '#D4AF37', boxShadow: '0 0 10px 3px rgba(212,175,55,0.5)', animation: 'glowPulse 2.5s ease-in-out infinite' } })
            )
        )
    );
}

export default CommandDock;
