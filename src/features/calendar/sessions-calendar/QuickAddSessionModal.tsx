import React, { useState } from 'react';
import { toast } from '../../../shared/lib/notifications';
import { escapeTelegramHtml } from '../../../shared/lib/sanitize';
import { I } from '../../../constants';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../database.types';
import type { MappedCase } from '../../../hooks/useAppData';

// ══════════════════════════════════════════
//  QuickAddSessionModal
//  إضافة جلسة سريعة بدون الدخول لتفاصيل قضية
// ══════════════════════════════════════════

const TODAY = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
};

interface QuickAddSessionForm {
    case_id: string;
    session_date: string;
    session_time: string;
    session_floor: string;
    session_hall: string;
    description: string;
}

interface QuickAddSessionModalProps {
    onClose: () => void;
    cases: MappedCase[];
    db: SupabaseClient<Database>;
    sendTelegram?: (msg: string) => void;
}

export default function QuickAddSessionModal({ onClose, cases, db, sendTelegram }: QuickAddSessionModalProps) {
    const [form, setForm] = useState<QuickAddSessionForm>({
        case_id:        '',
        session_date:   TODAY(),
        session_time:   'صباحي',
        session_floor:  '',
        session_hall:   '',
        description:    '',
    });
    const [saving, setSaving] = useState(false);
    const [caseSearch, setCaseSearch] = useState('');

    const set = (k: keyof QuickAddSessionForm, v: string) => setForm((f: QuickAddSessionForm) => ({ ...f, [k]: v }));

    // فلترة القضايا بالبحث
    const filteredCases = cases.filter((c: MappedCase) =>
        !caseSearch ||
        c.title?.includes(caseSearch) ||
        c.number?.includes(caseSearch) ||
        c.plaintiff?.includes(caseSearch) ||
        c.defendant?.includes(caseSearch)
    ).slice(0, 50);

    const selectedCase = cases.find((c: MappedCase) => c.id === form.case_id);

    const handleSave = async () => {
        if (!form.case_id) { toast('⚠️ اختر القضية أولاً', true); return; }
        if (!form.session_date) { toast('⚠️ حدد تاريخ الجلسة', true); return; }
        setSaving(true);
        const { error } = await db.from('case_sessions').insert([{
            case_id:       form.case_id,
            session_date:  form.session_date,
            session_time:  form.session_time || null,
            session_floor: form.session_floor || null,
            session_hall:  form.session_hall  || null,
            description:   form.description   || null,
        }]);
        setSaving(false);
        if (error) { toast('❌ فشل الحفظ', true); return; }
        toast('✅ تمت إضافة الجلسة');

        // إرسال تيليجرام
        if (sendTelegram && selectedCase) {
            let msg = `📅 <b>جلسة جديدة</b>\n\n`;
            msg += `⚖️ <b>${escapeTelegramHtml(selectedCase.title || '—')}</b>\n`;
            msg += `📋 رقم القيد: ${escapeTelegramHtml(selectedCase.number || '—')}\n`;
            msg += `🏛 المحكمة: ${escapeTelegramHtml(selectedCase.court || '—')}\n`;
            msg += `📆 تاريخ الجلسة: ${escapeTelegramHtml(form.session_date)}`;
            if (form.session_time) msg += ` (${escapeTelegramHtml(form.session_time)})`;
            msg += '\n';
            if (form.session_floor || form.session_hall)
                msg += `📍 ${form.session_floor ? 'الطابق ' + escapeTelegramHtml(form.session_floor) + ' ' : ''}${form.session_hall ? 'قاعة ' + escapeTelegramHtml(form.session_hall) : ''}\n`;
            if (form.description) msg += `📝 ${escapeTelegramHtml(form.description)}\n`;
            sendTelegram(msg);
        }

        onClose();
    };

    return React.createElement('div', {
        className: 'fixed inset-0 z-50 flex items-end justify-center',
        style: { background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' },
        onClick: (e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onClose(); }
    },
        React.createElement('div', {
            className: 'w-full max-w-lg rounded-t-3xl overflow-hidden',
            style: { background: '#0d1626', border: '1px solid rgba(212,175,55,0.15)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }
        },
            // ── هيدر ──
            React.createElement('div', {
                className: 'flex items-center justify-between px-5 py-4 shrink-0',
                style: { borderBottom: '1px solid rgba(255,255,255,0.06)' }
            },
                React.createElement('p', { className: 'text-sm font-black text-white' }, '📅 إضافة جلسة'),
                React.createElement('button', {
                    onClick: onClose,
                    className: 'w-8 h-8 rounded-full flex items-center justify-center text-slate-400 active:scale-90 transition-transform',
                    style: { background: 'rgba(255,255,255,0.06)' }
                }, React.createElement(I.X, { className: 'w-4 h-4' }))
            ),

            // ── المحتوى قابل للتمرير ──
            React.createElement('div', { className: 'overflow-y-auto flex-1 px-5 py-4 space-y-4' },

                // ❶ اختيار القضية
                React.createElement('div', { className: 'space-y-2' },
                    React.createElement('p', { className: 'text-[11px] font-black text-slate-400' }, '⚖️ القضية *'),

                    // بحث
                    React.createElement('div', {
                        className: 'flex items-center gap-2 px-3 py-2 rounded-xl',
                        style: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }
                    },
                        React.createElement(I.Search, { className: 'w-4 h-4 text-slate-500 shrink-0' }),
                        React.createElement('input', {
                            type: 'text',
                            placeholder: 'ابحث بالعنوان أو الرقم أو الأطراف...',
                            value: caseSearch,
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setCaseSearch(e.target.value),
                            className: 'flex-1 bg-transparent text-xs text-white outline-none placeholder-slate-600',
                            dir: 'rtl'
                        })
                    ),

                    // القضية المختارة
                    selectedCase && React.createElement('div', {
                        className: 'flex items-center gap-2 px-3 py-2 rounded-xl',
                        style: { background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)' }
                    },
                        React.createElement('span', { className: 'text-[10px] text-premium-gold font-black flex-1 truncate' },
                            '✅ ' + (selectedCase.title || selectedCase.number || '—')
                        ),
                        React.createElement('button', {
                            onClick: () => { set('case_id', ''); setCaseSearch(''); },
                            className: 'text-[9px] text-slate-500 active:scale-90'
                        }, '✕')
                    ),

                    // قائمة القضايا
                    !selectedCase && React.createElement('div', {
                        className: 'rounded-2xl overflow-hidden',
                        style: { border: '1px solid rgba(255,255,255,0.06)', maxHeight: '180px', overflowY: 'auto' }
                    },
                        filteredCases.length === 0
                            ? React.createElement('p', { className: 'text-[10px] text-slate-600 text-center py-4' }, 'لا توجد نتائج')
                            : filteredCases.map((c: MappedCase) =>
                                React.createElement('button', {
                                    key: c.id,
                                    onClick: () => { set('case_id', c.id); setCaseSearch(''); },
                                    className: 'w-full text-right px-3 py-2.5 text-xs font-bold text-slate-300 active:bg-white/10 transition-colors border-b border-white/5 last:border-0',
                                    style: { background: 'rgba(255,255,255,0.02)' }
                                },
                                    React.createElement('span', { className: 'block truncate' }, c.title || '—'),
                                    React.createElement('span', { className: 'text-[9px] text-slate-500' },
                                        [c.number, c.court].filter(Boolean).join(' · ')
                                    )
                                )
                            )
                    )
                ),

                // ❷ التاريخ + الوقت
                React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
                    React.createElement('div', { className: 'space-y-1' },
                        React.createElement('p', { className: 'text-[11px] font-black text-slate-400' }, '📆 تاريخ الجلسة *'),
                        React.createElement('input', {
                            type: 'date',
                            value: form.session_date,
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => set('session_date', e.target.value),
                            className: 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-premium-gold/40',
                            dir: 'ltr'
                        })
                    ),
                    React.createElement('div', { className: 'space-y-1' },
                        React.createElement('p', { className: 'text-[11px] font-black text-slate-400' }, '🕐 الوقت'),
                        React.createElement('div', { className: 'flex gap-2' },
                            ['صباحي','مسائي'].map((t: string) =>
                                React.createElement('button', {
                                    key: t,
                                    onClick: () => set('session_time', t),
                                    className: 'flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all active:scale-95',
                                    style: form.session_time === t
                                        ? { background: 'rgba(212,175,55,0.2)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.4)' }
                                        : { background: 'rgba(255,255,255,0.04)', color: '#64748b', border: '1px solid rgba(255,255,255,0.06)' }
                                }, t === 'صباحي' ? '🌅 صباحي' : '🌆 مسائي')
                            )
                        )
                    )
                ),

                // ❸ الطابق + القاعة
                React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
                    React.createElement('div', { className: 'space-y-1' },
                        React.createElement('p', { className: 'text-[11px] font-black text-slate-400' }, '🏛 الطابق'),
                        React.createElement('input', {
                            type: 'text', placeholder: 'مثال: 3',
                            value: form.session_floor,
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => set('session_floor', e.target.value),
                            className: 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-premium-gold/40',
                            dir: 'rtl'
                        })
                    ),
                    React.createElement('div', { className: 'space-y-1' },
                        React.createElement('p', { className: 'text-[11px] font-black text-slate-400' }, '🚪 رقم القاعة'),
                        React.createElement('input', {
                            type: 'text', placeholder: 'مثال: 12',
                            value: form.session_hall,
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => set('session_hall', e.target.value),
                            className: 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-premium-gold/40',
                            dir: 'rtl'
                        })
                    )
                ),

                // ❹ ملاحظات
                React.createElement('div', { className: 'space-y-1' },
                    React.createElement('p', { className: 'text-[11px] font-black text-slate-400' }, '📝 ملاحظات'),
                    React.createElement('textarea', {
                        placeholder: 'أي تفاصيل إضافية...',
                        value: form.description,
                        onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => set('description', e.target.value),
                        rows: 2,
                        className: 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-premium-gold/40 resize-none',
                        dir: 'rtl'
                    })
                )
            ),

            // ── زر الحفظ ──
            React.createElement('div', {
                className: 'px-5 py-4 shrink-0',
                style: { borderTop: '1px solid rgba(255,255,255,0.06)' }
            },
                React.createElement('button', {
                    onClick: handleSave,
                    disabled: saving || !form.case_id || !form.session_date,
                    className: 'w-full py-3.5 rounded-2xl text-sm font-black transition-all active:scale-95 disabled:opacity-40',
                    style: { background: 'linear-gradient(135deg,#D4AF37,#E8C84A)', color: '#070d1a' }
                }, saving ? '⏳ جاري الحفظ...' : '✅ إضافة الجلسة')
            )
        )
    );
}
