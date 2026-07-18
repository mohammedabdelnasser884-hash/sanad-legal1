import React from 'react';
import { createPortal } from 'react-dom';
import type { NavigationState } from '../useNavigation';

interface ExitConfirmModalProps {
  nav: NavigationState;
}

function ExitConfirmModal({ nav }: ExitConfirmModalProps) {
  return nav.showExitConfirm && createPortal(
            React.createElement('div', {
                className: 'fixed inset-0 z-[9999] flex items-end justify-center',
                style: { background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' },
                onClick: nav.cancelExit
            },
                React.createElement('div', {
                    className: 'w-full max-w-sm mx-4 mb-8 rounded-3xl overflow-hidden',
                    style: { background: '#0d1f35', border: '1px solid rgba(255,255,255,0.08)' },
                    onClick: (e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()
                },
                    React.createElement('div', { className: 'px-6 pt-6 pb-2 text-center' },
                        React.createElement('div', {
                            className: 'w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4',
                            style: { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }
                        },
                            React.createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', className: 'w-7 h-7 text-rose-400', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 2 },
                                React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', d: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1' })
                            )
                        ),
                        React.createElement('h3', { className: 'text-base font-black text-white mb-1' }, 'الخروج من التطبيق'),
                        React.createElement('p',  { className: 'text-xs text-slate-400 font-medium' }, 'هل تريد الخروج من سند؟')
                    ),
                    React.createElement('div', { className: 'grid grid-cols-2 gap-3 p-4' },
                        React.createElement('button', { onClick: nav.cancelExit,  className: 'py-3 rounded-2xl text-sm font-black text-white active:scale-95 transition-all', style: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' } }, 'إلغاء'),
                        React.createElement('button', { onClick: nav.confirmExit, className: 'py-3 rounded-2xl text-sm font-black text-white active:scale-95 transition-all', style: { background: 'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow: '0 4px 15px rgba(239,68,68,0.3)' } }, 'خروج')
                    )
                )
            ),
            document.body
        );
}

export default ExitConfirmModal;
