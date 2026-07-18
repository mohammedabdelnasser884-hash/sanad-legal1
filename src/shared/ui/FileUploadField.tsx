import React, { useRef } from 'react';

// ── Shared File Upload Field ──
// كانت متكررة حرفيًا في NewClientModal.tsx و EditClientModal.tsx
// (نفس المنطق بالظبط، فرق شكلي بس في التنسيق) — اتوحدت هنا.
interface FileUploadFieldProps {
    label?: string;
    hint?: string;
    onChange: (file: File | null | undefined) => void;
    preview?: string | null;
}
export const FileUploadField = ({label, hint, onChange, preview}: FileUploadFieldProps) => {
    const ref = useRef<HTMLInputElement>(null);
    return React.createElement('div', null,
        React.createElement('label', {className:"block text-[10px] font-bold text-slate-400 mb-1.5"}, label),
        React.createElement('div', {
            onClick: () => ref.current!.click(),
            className:"w-full p-3 rounded-xl border border-dashed border-white/20 bg-premium-bg flex items-center gap-3 cursor-pointer hover:border-emerald-500/50 transition-colors"
        },
            preview
                ? React.createElement('img', {src:preview, className:"w-12 h-12 rounded-lg object-cover shrink-0"})
                : React.createElement('div', {className:"w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 shrink-0"},
                    React.createElement('svg',{className:"w-5 h-5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},
                        React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"})
                    )
                  ),
            React.createElement('div', null,
                React.createElement('p', {className:"text-xs text-slate-300 font-bold"}, preview ? 'تم الاختيار ✓' : 'اضغط للرفع'),
                React.createElement('p', {className:"text-[10px] text-slate-500"}, hint)
            )
        ),
        React.createElement('input', {ref, type:"file", accept:"image/*", className:"hidden", onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.files![0])})
    );
};
