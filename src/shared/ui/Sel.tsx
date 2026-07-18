import React from 'react';

// ── Shared Select Component ──
// ⚠️ FIX (14 يوليو 2026): label في options كان لازم يكون string إجباريًا، لكن
// أغلب أماكن الاستخدام بتجيب label من عمود nullable في قاعدة البيانات
// (مثلاً c.title أو c.name_ar)، فكانت بتاخد string | null فعليًا — ده كان بيكسر
// كل نداء بيحط label من عمود DB nullable (FeesTab/LegalLibraryModal/NewCaseModal).
// السماح بـ null/undefined هنا وعرضه كـ '—' وقت العرض بس، من غير أي تغيير
// في شكل الـ options اللي بيتبعتوا فعليًا من الأماكن التانية.
export const Sel = ({ label, value, onChange, options, testId }: {
    label?: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    options: Array<{ value: string; label: string | null | undefined } | string>;
    testId?: string;
}) =>
    React.createElement('div', null,
        label && React.createElement('label', { className: "block text-[10px] font-bold text-slate-400 mb-1.5" }, label),
        React.createElement('select', {
            value, onChange,
            'data-testid': testId,
            className: "w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white transition-colors",
            style: { fontFamily: 'Cairo,sans-serif' }
        },
            options.map((o) => {
                const val = typeof o === 'string' ? o : o.value;
                const lbl = typeof o === 'string' ? o : (o.label ?? '—');
                return React.createElement('option', { key: val, value: val }, lbl);
            })
        )
    );
