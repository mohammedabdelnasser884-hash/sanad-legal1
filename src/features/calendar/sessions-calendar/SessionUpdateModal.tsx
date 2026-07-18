import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '../../../shared/lib/notifications';
import { safeUpdate } from '../../../shared/lib/dataAccess';
import { escapeTelegramHtml } from '../../../shared/lib/sanitize';
import DatePicker from '@/shared/ui/DatePicker';
import { I } from '../../../constants';
import type { CaseSessionRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../database.types';

interface SessionUpdateModalProps {
    session: CaseSessionRow;
    caseData: MappedCase;
    db: SupabaseClient<Database>;
    onClose: () => void;
    onDone?: () => void;
    onNotify?: (msg: string) => void;
}

/**
 * SessionUpdateModal
 * 
 * يُعرض لما المستخدم يضغط على زر "تحديث الجلسة" في آخر جلسة.
 * 
 * المنطق:
 * 1. يسجّل "ما تم" في الجلسة الحالية (يحدّث حقل result)
 * 2. يُنشئ جلسة جديدة بالتاريخ والمطلوب الجديد
 * 3. الجلسة القديمة تفضل موجودة بدون زر تحديث (عشان مش آخر جلسة دلوقتي)
 */
function SessionUpdateModal({ session, caseData, db, onClose, onDone, onNotify }: SessionUpdateModalProps) {
    const [whatHappened, setWhatHappened] = useState(session.result || '');
    const [nextDate, setNextDate] = useState('');
    const [nextRequired, setNextRequired] = useState(session.next_action || '');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!nextDate) { toast('⚠️ حدد تاريخ الجلسة القادمة', true); return; }
        setSaving(true);

        // 1. حدّث الجلسة الحالية بـ "ما تم" — مع Optimistic Lock
        const { conflict } = await safeUpdate(db, 'case_sessions', session.id, {
            result: whatHappened || null,
        }, session.updated_at || null);
        if (conflict) { setSaving(false); return; }

        // 2. أنشئ جلسة جديدة
        const { error } = await db.from('case_sessions').insert([{
            case_id: caseData.id,
            session_date: nextDate,
            session_time: session.session_time || null,
            session_floor: session.session_floor || null,
            session_hall: session.session_hall || null,
            next_action: nextRequired || null,
        }]);

        setSaving(false);

        if (error) { toast('❌ فشل إنشاء الجلسة الجديدة', true); return; }

        toast('✅ تم تحديث الجلسة وإنشاء الجلسة القادمة');

        if (onNotify) {
            let msg = `📅 <b>جلسة جديدة تمت جدولتها</b>\n`;
            msg += `━━━━━━━━━━━━━━━━━━━━\n`;
            msg += `⚖️ <b>${escapeTelegramHtml(caseData.title || '—')}</b>\n`;
            msg += `📋 رقم القيد: ${escapeTelegramHtml(caseData.number || '—')}\n`;
            msg += `🏛 المحكمة: ${escapeTelegramHtml(caseData.court || '—')}\n`;
            if (whatHappened) msg += `📝 ما تم: ${escapeTelegramHtml(whatHappened)}\n`;
            msg += `📆 الجلسة القادمة: ${escapeTelegramHtml(nextDate)}\n`;
            if (nextRequired) msg += `⚡ المطلوب: ${escapeTelegramHtml(nextRequired)}\n`;
            onNotify(msg);
        }

        onDone?.();
        onClose();
    };

    return createPortal(
        React.createElement('div', {
            className: "fixed inset-0 z-50 flex items-end justify-center",
            style: { background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' },
            onClick: (e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onClose(); }
        },
            React.createElement('div', {
                className: "w-full max-w-lg bg-premium-bg border border-premium-gold/20 rounded-t-3xl p-5 space-y-4 slide-up",
                style: { maxHeight: '90vh', overflowY: 'auto' }
            },
                // Handle bar
                React.createElement('div', { className: "w-10 h-1 bg-white/15 rounded-full mx-auto mb-1" }),

                // Header
                React.createElement('div', { className: "flex items-center justify-between" },
                    React.createElement('div', null,
                        React.createElement('h3', { className: "text-sm font-black text-premium-gold" }, "⚡ تحديث الجلسة"),
                        React.createElement('p', { className: "text-[10px] text-slate-500 mt-0.5" },
                            `جلسة ${session.session_date} · ${caseData.title || '—'}`
                        )
                    ),
                    React.createElement('button', {
                        onClick: onClose,
                        className: "w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 active:scale-90"
                    }, React.createElement(I.X))
                ),

                // Divider
                React.createElement('div', { className: "h-px bg-white/5" }),

                // الحقل 1: ما تم في الجلسة
                React.createElement('div', { className: "space-y-1.5" },
                    React.createElement('label', { className: "block text-[10px] font-black text-slate-400" },
                        "📝 ما تم في هذه الجلسة"
                    ),
                    React.createElement('textarea', {
                        value: whatHappened,
                        onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setWhatHappened(e.target.value),
                        placeholder: "اكتب ملخص ما جرى في الجلسة...",
                        rows: 3,
                        className: "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-premium-gold/40 resize-none font-medium leading-relaxed",
                        style: { direction: 'rtl' }
                    })
                ),

                // Divider section
                React.createElement('div', { className: "flex items-center gap-2 my-1" },
                    React.createElement('div', { className: "flex-1 h-px bg-white/5" }),
                    React.createElement('span', { className: "text-[9px] text-slate-600 font-black" }, "الجلسة القادمة"),
                    React.createElement('div', { className: "flex-1 h-px bg-white/5" })
                ),

                // الحقل 2: تاريخ الجلسة القادمة
                React.createElement(DatePicker, {
                    label: "📅 تاريخ الجلسة القادمة",
                    value: nextDate,
                    onChange: (v: string) => setNextDate(v),
                    required: true
                }),

                // الحقل 3: المطلوب في الجلسة القادمة
                React.createElement('div', { className: "space-y-1.5" },
                    React.createElement('label', { className: "block text-[10px] font-black text-slate-400" },
                        "⚡ المطلوب في الجلسة القادمة"
                    ),
                    React.createElement('textarea', {
                        value: nextRequired,
                        onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setNextRequired(e.target.value),
                        placeholder: "ما المطلوب تنفيذه أو تحضيره قبل الجلسة القادمة؟",
                        rows: 2,
                        className: "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-premium-gold/40 resize-none font-medium leading-relaxed",
                        style: { direction: 'rtl' }
                    })
                ),

                // Buttons
                React.createElement('div', { className: "flex gap-2 pt-1" },
                    React.createElement('button', {
                        onClick: handleSave,
                        disabled: saving || !nextDate,
                        className: "flex-1 py-3 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                    },
                        saving
                            ? React.createElement(I.Spin)
                            : React.createElement(I.Check),
                        saving ? "جاري الحفظ..." : "حفظ وإنشاء الجلسة القادمة"
                    ),
                    React.createElement('button', {
                        onClick: onClose,
                        className: "px-4 py-3 bg-white/5 text-slate-400 rounded-2xl text-xs font-bold active:scale-95"
                    }, "إلغاء")
                )
            )
        ),
        document.body
    );
}

export default SessionUpdateModal;
