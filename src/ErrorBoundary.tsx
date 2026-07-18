import React from 'react';

// ══════════════════════════════════════════════════════════
//  Error Boundary — منقول من main.tsx (اتفصل بتاريخ 15 يوليو 2026
//  كجزء من خطة تخفيف main.tsx)
// ══════════════════════════════════════════════════════════
export default class ErrorBoundary extends React.Component<{children: React.ReactNode}, {err: Error | null, showDetails: boolean}> {
    constructor(p: {children: React.ReactNode}) { super(p); this.state = { err: null, showDetails: false }; }
    static getDerivedStateFromError(e: Error) { return { err: e }; }
    render() {
        if (this.state.err) {
            return React.createElement('div', {
                style: {
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    minHeight: '100vh', padding: '32px 24px', fontFamily: 'Cairo,sans-serif',
                    direction: 'rtl', background: '#070d1a', textAlign: 'center'
                }
            },
                // أيقونة
                React.createElement('div', {
                    style: { width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', marginBottom: '24px' }
                }, '⚠️'),

                // العنوان
                React.createElement('p', {
                    style: { fontSize: '18px', fontWeight: '900', color: '#f1f5f9', marginBottom: '8px' }
                }, 'حدث خطأ غير متوقع'),

                // الرسالة
                React.createElement('p', {
                    style: { fontSize: '13px', color: '#94a3b8', marginBottom: '32px', maxWidth: '280px', lineHeight: '1.7' }
                }, 'نأسف على هذا الإزعاج. يمكنك إعادة تحميل التطبيق وستعود بياناتك كما هي.'),

                // زر إعادة التحميل
                React.createElement('button', {
                    onClick: () => window.location.reload(),
                    style: {
                        padding: '14px 32px', borderRadius: '14px', border: 'none', cursor: 'pointer',
                        fontSize: '14px', fontWeight: '900', fontFamily: 'Cairo,sans-serif',
                        background: 'linear-gradient(135deg,#D4AF37,#E8C84A)', color: '#070d1a',
                        marginBottom: '24px', boxShadow: '0 4px 20px rgba(212,175,55,0.3)'
                    }
                }, '🔄 إعادة تحميل التطبيق'),

                // تفاصيل الخطأ للمطور — مخفية افتراضياً
                React.createElement('button', {
                    onClick: () => this.setState((s) => ({ showDetails: !s.showDetails })),
                    style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#475569', fontFamily: 'Cairo,sans-serif' }
                }, this.state.showDetails ? '▲ إخفاء التفاصيل' : '▼ تفاصيل تقنية'),

                this.state.showDetails && React.createElement('pre', {
                    style: {
                        marginTop: '12px', fontSize: '10px', whiteSpace: 'pre-wrap', color: '#fca5a5',
                        background: 'rgba(239,68,68,0.08)', padding: '12px', borderRadius: '8px',
                        border: '1px solid rgba(239,68,68,0.2)', textAlign: 'left', direction: 'ltr',
                        maxWidth: '100%', overflowX: 'auto'
                    }
                }, String(this.state.err?.message || this.state.err))
            );
        }
        return this.props.children;
    }
}
