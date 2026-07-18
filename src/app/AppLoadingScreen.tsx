import React from 'react';
import { I, SanadMark } from '../constants';

// ─────────────────────────────────────────────────────────
//  Loading screen
//  منقول حرفيًا من App.tsx (كان بيتعرض لما authLoading === true).
//  JSX بحت، صفر منطق أو state — نفس الماركب بالظبط.
// ─────────────────────────────────────────────────────────
function AppLoadingScreen() {
    return React.createElement('div', {
        className: 'h-full flex flex-col items-center justify-center bg-premium-bg',
        style: { gap: 0 }
    },
        React.createElement('div', {
            style: {
                width: 72, height: 72, background: '#0B1320', borderRadius: 17,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid rgba(212,175,55,0.2)',
                boxShadow: '0 0 30px rgba(212,175,55,0.10)', marginBottom: 20,
            }
        }, React.createElement(SanadMark, { size: 50 })),
        React.createElement('div', { style: { fontFamily: 'Cairo,sans-serif', fontSize: 28, fontWeight: 900, color: 'white', letterSpacing: '1px', marginBottom: 8 } }, 'سَنَد'),
        React.createElement('div', { style: { fontFamily: 'Cairo,sans-serif', fontSize: 10, fontWeight: 700, color: 'rgba(212,175,55,0.6)', letterSpacing: '2px', marginBottom: 32 } }, 'نظام التشغيل القانوني'),
        React.createElement(I.Spin)
    );
}

export default AppLoadingScreen;
