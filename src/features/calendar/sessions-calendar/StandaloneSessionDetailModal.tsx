import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '../../../shared/lib/notifications';
import { safeUpdate } from '../../../shared/lib/dataAccess';
import { showErrorToast } from '../../../shared/lib/errorReporting';
import { I } from '../../../constants';
import { Inp } from '@/shared/ui/Inp';
import { Sel } from '@/shared/ui/Sel';
import SessionUpdateModal from './SessionUpdateModal';
import DeleteConfirmModal from '@/shared/modals/DeleteConfirmModal';
import type { CaseSessionRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../database.types';

const CASE_TYPES = ['مدني', 'تجاري', 'جنائي', 'عمالي', 'إداري', 'أسرة', 'أخرى'];
const inputCls = 'w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600';
const inputStyle = { fontFamily: 'Cairo,sans-serif' };

interface EditStandaloneModalProps {
    session: CaseSessionRow;
    db: SupabaseClient<Database>;
    onClose: () => void;
    onSaved: () => void;
}

interface StandaloneEditForm {
    court: string;
    title: string;
    case_number: string;
    case_year: string;
    case_type: string;
    case_type_custom: string;
    circuit_number: string;
    session_date: string;
    session_time: string;
    plaintiff: string;
    plaintiff_role: string;
    plaintiff_national_id: string;
    plaintiff_power_of_attorney: string;
    defendant: string;
    defendant_role: string;
    defendant_national_id: string;
    next_action: string;
}

function EditStandaloneModal({ session, db, onClose, onSaved }: EditStandaloneModalProps) {
    const [form, setForm] = useState<StandaloneEditForm>({
        court: session.court || '',
        title: session.title || '',
        case_number: session.case_number?.split('/')?.[0] || '',
        case_year: session.case_number?.split('/')?.[1] || '',
        case_type: CASE_TYPES.includes(session.case_type as string) ? (session.case_type as string) : (session.case_type ? 'أخرى' : ''),
        case_type_custom: CASE_TYPES.includes(session.case_type as string) ? '' : (session.case_type || ''),
        circuit_number: session.circuit_number || '',
        session_date: session.session_date || '',
        session_time: session.session_time || 'صباحي',
        plaintiff: session.plaintiff || '',
        plaintiff_role: session.plaintiff_role || '',
        plaintiff_national_id: session.plaintiff_national_id || '',
        plaintiff_power_of_attorney: session.plaintiff_power_of_attorney || '',
        defendant: session.defendant || '',
        defendant_role: session.defendant_role || '',
        defendant_national_id: session.defendant_national_id || '',
        next_action: session.next_action || '',
    });
    const [saving, setSaving] = useState(false);
    const set = (k: keyof StandaloneEditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const handleSave = async () => {
        if (!form.session_date) { toast('⚠️ تاريخ الجلسة مطلوب', true); return; }
        setSaving(true);
        const finalCaseType = form.case_type === 'أخرى' ? (form.case_type_custom || 'أخرى') : form.case_type;
        const fullCaseNumber = [form.case_number, form.case_year].filter(Boolean).join('/');
        const { success, conflict, error } = await safeUpdate(db, 'case_sessions', session.id, {
            court: form.court || null,
            title: form.title || null,
            case_number: fullCaseNumber || null,
            case_type: finalCaseType || null,
            circuit_number: form.circuit_number || null,
            session_date: form.session_date,
            session_time: form.session_time || null,
            plaintiff: form.plaintiff || null,
            plaintiff_role: form.plaintiff_role || null,
            plaintiff_national_id: form.plaintiff_national_id || null,
            plaintiff_power_of_attorney: form.plaintiff_power_of_attorney || null,
            defendant: form.defendant || null,
            defendant_role: form.defendant_role || null,
            defendant_national_id: form.defendant_national_id || null,
            next_action: form.next_action || null,
        }, session.updated_at || null);
        setSaving(false);
        if (conflict) return;
        if (!success) {
            showErrorToast('session_save', error, 'تعذّر حفظ الجلسة. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'حفظ الجلسة');
            return;
        }
        toast('✅ تم تعديل الجلسة');
        onSaved();
        onClose();
    };

    return createPortal(
        React.createElement('div', {
            className: 'fixed inset-0 z-[60] flex items-end justify-center',
            style: { background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' },
            onClick: (e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onClose(); }
        },
            React.createElement('div', {
                className: 'w-full max-w-lg rounded-t-3xl overflow-hidden',
                style: { background: '#0f1623', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '92vh' }
            },
                React.createElement('div', { className: 'flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/5' },
                    React.createElement('div', { className: 'flex items-center gap-2' },
                        React.createElement('span', { className: 'text-xl' }, '✏️'),
                        React.createElement('h2', { className: 'text-sm font-black text-white' }, 'تعديل الجلسة المستقلة')
                    ),
                    React.createElement('button', { onClick: onClose, className: 'w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-slate-400' }, React.createElement(I.X))
                ),
                React.createElement('div', {
                    className: 'overflow-y-auto px-5 py-4 space-y-3',
                    style: { maxHeight: 'calc(92vh - 130px)' }
                },
                    React.createElement(Inp, { label: 'المحكمة', value: form.court, onChange: set('court'), placeholder: 'مثال: محكمة جنوب القاهرة' }),
                    React.createElement(Inp, { label: 'موضوع الجلسة / عنوان', value: form.title, onChange: set('title'), placeholder: 'مثال: قضية إيجار' }),
                    React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
                        React.createElement(Inp, { label: 'رقم القضية', value: form.case_number, onChange: set('case_number'), placeholder: '1234' }),
                        React.createElement(Inp, { label: 'السنة', value: form.case_year, onChange: set('case_year'), placeholder: '2024' })
                    ),
                    React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
                        React.createElement(Sel, { label: 'نوع القضية', value: form.case_type, onChange: set('case_type'), options: [{ value: '', label: '— اختر —' }, ...CASE_TYPES.map((t: string) => ({ value: t, label: t }))] }),
                        React.createElement(Inp, { label: 'الدائرة', value: form.circuit_number, onChange: set('circuit_number'), placeholder: 'الدائرة 7' })
                    ),
                    form.case_type === 'أخرى' && React.createElement(Inp, { label: 'نوع القضية (تفصيل)', value: form.case_type_custom, onChange: set('case_type_custom'), placeholder: 'أحوال شخصية' }),
                    React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
                        React.createElement('div', null,
                            React.createElement('label', { className: 'block text-[10px] font-bold text-slate-400 mb-1.5' }, 'تاريخ الجلسة', React.createElement('span', { className: 'text-rose-400 mr-0.5' }, ' *')),
                            React.createElement('input', { type: 'date', value: form.session_date, onChange: set('session_date'), className: inputCls, style: inputStyle })
                        ),
                        React.createElement(Sel, { label: 'توقيت الجلسة', value: form.session_time, onChange: set('session_time'), options: [{ value: 'صباحي', label: '🌅 صباحي' }, { value: 'مسائي', label: '🌆 مسائي' }] })
                    ),
                    React.createElement('div', { className: 'border-t border-white/5 my-1' }),
                    React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
                        React.createElement(Inp, { label: 'الموكل', value: form.plaintiff, onChange: set('plaintiff'), placeholder: 'الاسم بالكامل' }),
                        React.createElement(Inp, { label: 'الصفة', value: form.plaintiff_role, onChange: set('plaintiff_role'), placeholder: 'مدعي، مستأنف' })
                    ),
                    React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
                        React.createElement(Inp, { label: 'الرقم القومي', value: form.plaintiff_national_id, onChange: set('plaintiff_national_id'), placeholder: '14 رقم' }),
                        React.createElement(Inp, { label: 'رقم التوكيل', value: form.plaintiff_power_of_attorney, onChange: set('plaintiff_power_of_attorney'), placeholder: 'رقم التوكيل' })
                    ),
                    React.createElement('div', { className: 'border-t border-white/5 my-1' }),
                    React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
                        React.createElement(Inp, { label: 'الخصم', value: form.defendant, onChange: set('defendant'), placeholder: 'الاسم بالكامل' }),
                        React.createElement(Inp, { label: 'الصفة', value: form.defendant_role, onChange: set('defendant_role'), placeholder: 'مدعى عليه' })
                    ),
                    React.createElement(Inp, { label: 'الرقم القومي للخصم', value: form.defendant_national_id, onChange: set('defendant_national_id'), placeholder: '14 رقم' }),
                    React.createElement(Inp, { label: 'الإجراء القادم', value: form.next_action, onChange: set('next_action'), placeholder: 'مثال: تقديم مذكرة دفاع' }),
                    React.createElement('div', { className: 'h-4' })
                ),
                React.createElement('div', { className: 'px-5 py-4 border-t border-white/5 flex gap-3' },
                    React.createElement('button', { onClick: onClose, className: 'flex-1 py-3 rounded-2xl text-xs font-bold text-slate-400 bg-white/5 hover:bg-white/10 transition-all' }, 'إلغاء'),
                    React.createElement('button', {
                        onClick: handleSave, disabled: saving || !form.session_date,
                        className: 'flex-grow-[2] py-3 rounded-2xl text-xs font-black text-premium-bg transition-all disabled:opacity-40',
                        style: { background: saving ? '#888' : 'linear-gradient(135deg,#d4af37,#f0c040)' }
                    }, saving ? '⏳ جاري الحفظ...' : '✅ حفظ التعديلات')
                )
            )
        ),
        document.body
    );
}

interface StandaloneSessionDetailModalProps {
    session: CaseSessionRow;
    db: SupabaseClient<Database>;
    onClose: () => void;
    onDone: () => void;
    onNotify?: (msg: string) => void;
}

function StandaloneSessionDetailModal({ session, db, onClose, onDone, onNotify }: StandaloneSessionDetailModalProps) {
    const [showUpdate, setShowUpdate] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // كائن قضية اصطناعي خفيف بيتبنى من بيانات الجلسة المستقلة نفسها (مفيش قضية حقيقية أصلاً)
    // عشان يتمرر لـ SessionUpdateModal اللي بيتوقع caseData: MappedCase — نفس القيم بالظبط
    // اللي كانت بتتبني قبل التنظيف، مع كاست موثّق واحد لأن الشكل مش مطابق 100% لـ MappedCase
    // الحقيقي (الحقول دي بس شكل محلي يخدم الحقول اللي SessionUpdateModal.tsx بيقرأها فعليًا:
    // id/title/number/court).
    const caseData = {
        id: null,
        title: session.title || session.case_number || 'جلسة مستقلة',
        number: session.case_number || null,
        court: session.court || null,
        plaintiff: session.plaintiff || null,
        defendant: session.defendant || null,
        type: session.case_type || null,
        case_type: session.case_type || null,
    } as unknown as MappedCase;

    const rows: { label: string; value: string | null }[] = [
        { label: '📅 التاريخ', value: session.session_date || null },
        { label: '🕐 التوقيت', value: session.session_time || null },
        { label: '🏛 المحكمة', value: session.court || null },
        { label: '📋 رقم القضية', value: session.case_number || null },
        { label: '📂 نوع القضية', value: session.case_type || null },
        { label: '⚖️ الدائرة', value: session.circuit_number || null },
        { label: '👤 الموكل', value: session.plaintiff || null },
        { label: '🏷 صفة الموكل', value: session.plaintiff_role || null },
        { label: '👤 الخصم', value: session.defendant || null },
        { label: '🏷 صفة الخصم', value: session.defendant_role || null },
        { label: '⚡ الإجراء القادم', value: session.next_action || null },
        { label: '📝 ما تم', value: session.result || null },
    ].filter((r) => r.value);

    const handleDelete = async () => {
        setDeleting(true);
        try {
            const { error } = await db.from('case_sessions').delete().eq('id', session.id);
            if (error) {
                showErrorToast('session_delete', error, 'تعذّر حذف الجلسة. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'حذف الجلسة');
                return;
            }
            toast('✅ تم حذف الجلسة');
            onDone();
            onClose();
        } catch { toast('❌ خطأ غير متوقع', true); }
        finally { setDeleting(false); setShowConfirmDelete(false); }
    };

    const modal = React.createElement('div', {
        className: 'fixed inset-0 z-50 flex items-end justify-center',
        style: { background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' },
        onClick: (e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onClose(); }
    },
        React.createElement('div', {
            className: 'w-full max-w-lg rounded-t-3xl overflow-hidden',
            style: { background: '#0f1623', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '90vh' }
        },
            // ── هيدر ──
            React.createElement('div', { className: 'flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/5' },
                React.createElement('div', { className: 'flex items-center gap-2' },
                    React.createElement('span', { className: 'text-xl' }, '⚡'),
                    React.createElement('div', null,
                        React.createElement('h2', { className: 'text-sm font-black text-white' }, session.title || 'جلسة مستقلة'),
                        React.createElement('p', { className: 'text-[10px] text-amber-400/70' }, 'جلسة غير مرتبطة بملف قضية')
                    )
                ),
                React.createElement('button', {
                    onClick: onClose,
                    className: 'w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-slate-400 hover:bg-white/10'
                }, React.createElement(I.X))
            ),

            // ── تفاصيل ──
            React.createElement('div', {
                className: 'overflow-y-auto px-5 py-4 space-y-2',
                style: { maxHeight: 'calc(90vh - 160px)' }
            },
                ...rows.map(({ label, value }) =>
                    React.createElement('div', {
                        key: label,
                        className: 'flex items-start justify-between gap-3 py-2 border-b border-white/5'
                    },
                        React.createElement('span', { className: 'text-[10px] font-bold text-slate-500 shrink-0' }, label),
                        React.createElement('span', { className: 'text-[11px] font-semibold text-white text-left' }, value)
                    )
                )
            ),

            // ── Footer ──
            React.createElement('div', { className: 'px-5 pb-5 pt-3 border-t border-white/5 space-y-2' },
                // زر تحديث الجلسة — كبير ذهبي
                React.createElement('button', {
                    onClick: () => setShowUpdate(true),
                    className: 'w-full py-3 rounded-2xl text-xs font-black text-premium-bg transition-all',
                    style: { background: 'linear-gradient(135deg,#d4af37,#f0c040)' }
                }, '⚡ تحديث الجلسة'),

                // صف الأزرار الصغيرة
                React.createElement('div', { className: 'flex gap-2' },
                    React.createElement('button', {
                        onClick: onClose,
                        className: 'flex-1 py-2.5 rounded-2xl text-xs font-bold text-slate-400 bg-white/5 hover:bg-white/10 transition-all'
                    }, 'إغلاق'),
                    React.createElement('button', {
                        onClick: () => toast('🔗 قريباً', false),
                        className: 'flex-1 py-2.5 rounded-2xl text-xs font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-all'
                    }, '🔗 ربط'),
                    React.createElement('button', {
                        onClick: () => setShowEdit(true),
                        className: 'flex-1 py-2.5 rounded-2xl text-xs font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-all'
                    }, '✏️ تعديل'),
                    React.createElement('button', {
                        onClick: () => setShowConfirmDelete(true),
                        disabled: deleting,
                        className: 'flex-1 py-2.5 rounded-2xl text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 transition-all disabled:opacity-40'
                    }, '🗑 حذف')
                )
            )
        )
    );

    return React.createElement(React.Fragment, null,
        createPortal(modal, document.body),
        showConfirmDelete && createPortal(React.createElement(DeleteConfirmModal, {
            title: "حذف الجلسة",
            itemName: session.title || session.case_number || 'جلسة مستقلة',
            itemType: "الجلسة",
            mode: "delete",
            loading: deleting,
            onConfirm: handleDelete,
            onCancel: () => setShowConfirmDelete(false)
        }), document.body),
        showEdit && React.createElement(EditStandaloneModal, {
            session, db,
            onClose: () => setShowEdit(false),
            onSaved: () => { onDone(); onClose(); }
        }),
        showUpdate && React.createElement(SessionUpdateModal, {
            session, caseData, db,
            onClose: () => setShowUpdate(false),
            onDone: () => { onDone(); onClose(); },
            onNotify
        })
    );
}

export default StandaloneSessionDetailModal;
