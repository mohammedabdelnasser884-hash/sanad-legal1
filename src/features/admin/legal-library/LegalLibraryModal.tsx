import React, { useState } from 'react';
import { toast } from '../../../shared/lib/notifications';
import { I } from '../../../constants';
import { Inp } from '@/shared/ui/Inp';
import { Sel } from '@/shared/ui/Sel';
import type { LawRow, LegalCategoryRow } from '../../../types';
import type { LawForm } from './hooks/useAdminLegalLibrary';

// ══════════════════════════════════════════
//  مودال إضافة / تعديل قانون في المكتبة القانونية
// ══════════════════════════════════════════
interface LegalLibraryModalProps {
    onClose: () => void;
    onSave: (form: LawForm, file: File | null) => void;
    saving: boolean;
    categories: LegalCategoryRow[];
    editingLaw: LawRow | null;
}

function LegalLibraryModal({ onClose, onSave, saving, categories, editingLaw }: LegalLibraryModalProps) {
    const [form, setForm] = useState<LawForm>({
        title:       editingLaw?.title       || '',
        law_number:  editingLaw?.law_number  || '',
        law_year:    editingLaw?.law_year    ? String(editingLaw.law_year) : '',
        category_id: editingLaw?.category_id || (categories[0]?.id || ''),
    });
    const [file, setFile] = useState<File|null>(null);
    const s = (k: keyof LawForm, v: string) => setForm((p: LawForm) => ({ ...p, [k]: v }));

    const handleSubmit = () => {
        if (!form.title.trim()) { toast('يرجى إدخال اسم القانون', true); return; }
        if (!editingLaw && !file) { toast('يرجى رفع ملف PDF للقانون', true); return; }
        onSave(form, file);
    };

    return React.createElement('div', {
        className: "fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm",
        onClick: (e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onClose(); }
    },
        React.createElement('div', { className: "bg-premium-card w-full max-w-lg rounded-t-3xl border-t border-white/10 p-6 pb-10 shadow-2xl slide-up max-h-[88vh] overflow-y-auto no-scrollbar" },
            React.createElement('div', { className: "w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" }),
            React.createElement('h3', { className: "text-sm font-black mb-5 text-white flex items-center gap-2" },
                React.createElement('span', { className: "w-1 h-4 bg-amber-400 rounded-full" }),
                editingLaw ? 'تعديل قانون' : 'إضافة قانون جديد للمكتبة القانونية'
            ),
            React.createElement('div', { className: "space-y-4" },
                React.createElement(Inp, { label: "اسم القانون", value: form.title, onChange: (e: React.ChangeEvent<HTMLInputElement>) => s('title', e.target.value), placeholder: "مثال: القانون المدني المصري", required: true }),
                React.createElement('div', { className: "grid grid-cols-2 gap-2" },
                    React.createElement(Inp, { label: "رقم القانون", value: form.law_number, onChange: (e: React.ChangeEvent<HTMLInputElement>) => s('law_number', e.target.value), placeholder: "مثال: 131" }),
                    React.createElement(Inp, { label: "سنة القانون", value: form.law_year, onChange: (e: React.ChangeEvent<HTMLInputElement>) => s('law_year', e.target.value.replace(/[^0-9]/g, '')), placeholder: "مثال: 1948" })
                ),
                React.createElement(Sel, {
                    label: "التصنيف",
                    value: form.category_id,
                    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => s('category_id', e.target.value),
                    options: categories.map((c: LegalCategoryRow) => ({ value: c.id, label: c.name_ar }))
                }),

                // ── رفع ملف PDF ──
                React.createElement('div', null,
                    React.createElement('label', { className: "block text-[10px] font-bold text-slate-400 mb-1.5" },
                        "ملف القانون (PDF)",
                        !editingLaw && React.createElement('span', { className: "text-rose-400 mr-1" }, "*")
                    ),
                    React.createElement('label', {
                        className: "flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-dashed border-amber-400/30 bg-amber-400/5 text-amber-400 text-xs font-bold cursor-pointer active:scale-95 transition-transform"
                    },
                        React.createElement('span', null, "📄"),
                        React.createElement('span', null, file ? file.name : (editingLaw?.file_name || 'اختر ملف PDF')),
                        React.createElement('input', {
                            type: "file", accept: "application/pdf", className: "hidden",
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                if (f.type !== 'application/pdf') { toast('يجب أن يكون الملف من نوع PDF', true); return; }
                                if (f.size > 50 * 1024 * 1024) { toast('❌ حجم الملف أكبر من 50 ميجابايت', true); return; }
                                setFile(f);
                            }
                        })
                    ),
                    editingLaw && React.createElement('p', { className: "text-[9px] text-slate-600 mt-1" }, "اتركه بدون تغيير لو لا تريد استبدال الملف الحالي")
                ),

                React.createElement('button', {
                    disabled: saving,
                    onClick: handleSubmit,
                    className: "w-full py-3.5 rounded-xl font-black text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform mt-2 text-premium-bg",
                    style: { background: 'linear-gradient(135deg,#D4AF37,#E8C84A)' }
                }, saving ? React.createElement(I.Spin) : null, saving ? 'جاري الحفظ...' : (editingLaw ? 'حفظ التعديلات' : 'إضافة القانون'))
            )
        )
    );
}

export default LegalLibraryModal;
