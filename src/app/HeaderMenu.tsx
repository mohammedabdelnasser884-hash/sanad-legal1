import React from 'react';
import { createPortal } from 'react-dom';
import { I, COUNTRY_CONFIGS } from '../constants';
import { toast } from '@/shared/lib/notifications';

// امتداد نوع Window محلي لخاصية __requestPushPermission (بتتضاف فعليًا من main.tsx
// وقت التشغيل) — نفس نمط __dbWrite/__pendingSubscription المُعرّف هناك، بس
// بتصريح محلي هنا عشان الملف يستغني عن (window as any) من غير أي تعديل على
// main.tsx نفسه (مؤجل عمدًا في المرحلة 5).
declare global {
    interface Window {
        __requestPushPermission?: () => Promise<boolean>;
    }
}

interface HeaderMenuProps {
  showMenu: boolean;
  setShowHeaderMenu: (v: boolean) => void;
  darkMode: boolean;
  toggleTheme: () => void;
  handlePwaInstall: () => void | Promise<void>;
  setShowSettings: (v: boolean) => void;
  country: string;
  handleLogout: () => void | Promise<void>;
}

function HeaderMenu({
  showMenu, setShowHeaderMenu, darkMode, toggleTheme, handlePwaInstall,
  setShowSettings, country, handleLogout,
}: HeaderMenuProps) {
  return showMenu && createPortal(
            React.createElement(React.Fragment, null,
                React.createElement('div', {
                    onClick: () => setShowHeaderMenu(false),
                    className: 'fixed inset-0 cursor-default',
                    style: { zIndex: 9998, background: 'rgba(0,0,0,0.6)' }
                }),
                React.createElement('div', {
                    className: 'fixed right-0 left-0 border-b border-white/10 px-4 py-3 flex flex-col gap-2 shadow-2xl',
                    style: { top: '52px', zIndex: 9999, background: darkMode ? '#0d1a2e' : '#ffffff' }
                },
                    React.createElement('button', {
                        onClick: () => { toggleTheme(); setShowHeaderMenu(false); },
                        className: 'w-full h-10 rounded-xl flex items-center gap-3 px-3 active:scale-[0.98] transition-all text-sm font-bold',
                        style: darkMode
                            ? { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: '#E8C84A' }
                            : { background: 'rgba(184,134,11,0.10)',  border: '1px solid rgba(184,134,11,0.28)', color: '#92650a' }
                    },
                        React.createElement('span', { className: 'text-base' }, darkMode ? '☀️' : '🌙'),
                        React.createElement('span', null, darkMode ? 'التحويل للوضع النهاري' : 'التحويل للوضع الليلي')
                    ),
                    (typeof Notification !== 'undefined' && Notification.permission !== 'granted') && React.createElement('button', {
                        onClick: async () => {
                            if (window.__requestPushPermission) {
                                const ok = await window.__requestPushPermission();
                                if (ok) toast('✅ سيتم تنبيهك بالجلسات القادمة');
                                else    toast('لم يُمنح إذن الإشعارات', true);
                            } else {
                                Notification.requestPermission().then((p: NotificationPermission) => { if (p === 'granted') toast('✅ تفعّلت الإشعارات'); });
                            }
                            setShowHeaderMenu(false);
                        },
                        className: 'w-full h-10 rounded-xl border flex items-center gap-3 px-3 active:scale-[0.98] transition-all text-sm font-bold',
                        style: { background: 'rgba(251,191,36,0.10)', borderColor: 'rgba(251,191,36,0.30)', color: '#fbbf24' }
                    }, React.createElement('span', { className: 'text-base' }, '🔔'), React.createElement('span', null, 'تفعيل إشعارات الجلسات')),
                    React.createElement('button', {
                        onClick: () => { handlePwaInstall(); setShowHeaderMenu(false); },
                        className: 'w-full h-10 rounded-xl border flex items-center gap-3 px-3 active:scale-[0.98] transition-all text-sm font-bold',
                        style: { background: 'rgba(212,175,55,0.12)', borderColor: 'rgba(212,175,55,0.35)', color: '#D4AF37' }
                    }, React.createElement('span', { className: 'text-base' }, '📲'), React.createElement('span', null, 'تثبيت التطبيق')),
                    React.createElement('button', {
                        onClick: () => { setShowSettings(true); setShowHeaderMenu(false); },
                        className: 'w-full h-10 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3 px-3 active:scale-[0.98] transition-transform text-sm font-bold text-slate-200'
                    },
                        React.createElement('span', { className: 'text-base' }, COUNTRY_CONFIGS[country]?.flag || '🌍'),
                        React.createElement('span', null, 'إعدادات الدولة')
                    ),
                    React.createElement('div', { className: 'h-px bg-white/10 my-0.5' }),
                    React.createElement('button', {
                        onClick: () => { handleLogout(); setShowHeaderMenu(false); },
                        className: 'w-full h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-3 px-3 active:scale-[0.98] transition-transform text-sm font-bold text-rose-400'
                    }, React.createElement(I.Logout), React.createElement('span', null, 'تسجيل الخروج'))
                )
            ),
            document.body
        );
}

export default HeaderMenu;
