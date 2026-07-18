import React from 'react';

// ── سطر الأطراف: المدعي ضد المدعى عليه (مع تباعد و"ضد" بلون مميز) ──
interface PartiesLineProps {
    plaintiff?: string | null;
    defendant?: string | null;
    fallback?: string | null;
    className?: string;
}
export function PartiesLine({ plaintiff, defendant, fallback, className = '' }: PartiesLineProps) {
    if (plaintiff && defendant) {
        return React.createElement('p', { className: `truncate leading-tight ${className}` },
            React.createElement('span', null, plaintiff),
            React.createElement('span', { className: 'mx-1.5 font-black', style: { color: '#a78bfa' } }, 'ضد'),
            React.createElement('span', null, defendant)
        );
    }
    return React.createElement('p', { className: `truncate leading-tight ${className}` }, plaintiff || defendant || fallback);
}
