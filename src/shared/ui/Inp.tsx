import React from 'react';

// ── Shared Input Component ──
// ملاحظة: أي خصائص زيادة (maxLength, disabled, autoFocus, onKeyDown, min, max...) بتتمرر
// مباشرة لعنصر <input> عبر ...rest، بدل ما تتجاهل بصمت.
type InpOwnProps = {
    label?: string; type?: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string; required?: boolean; className?: string; style?: React.CSSProperties;
    'data-testid'?: string;
};
export const Inp = ({ label, type = "text", value, onChange, placeholder, required, className, style, ...rest }:
    InpOwnProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, keyof InpOwnProps>
) =>
    React.createElement('div', null,
        label && React.createElement('label', { className: "block text-[10px] font-bold text-slate-400 mb-1.5" },
            label,
            required && React.createElement('span', { className: "text-rose-400 mr-1" }, "*")
        ),
        React.createElement('input', {
            type, value, onChange, placeholder,
            className: className || "w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 transition-colors",
            style: style || { fontFamily: 'Cairo,sans-serif' },
            ...rest
        })
    );
