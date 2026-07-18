import { useState } from 'react';
import { db } from '../../../supabaseClient';
import { toast } from '../../../shared/lib/notifications';
import { escapeTelegramHtml } from '../../../shared/lib/sanitize';
import { safeUpdate, logActivity } from '../../../shared/lib/dataAccess';
import type { ClientRow, ProfileRow, CaseSessionRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';
import type { EditingSessionForm } from '../case-detail/TimelineSection';

/**
 * منطق جلسات القضية (إضافة/تعديل/حذف + إعادة حساب next_hearing) — منقول
 * حرفيًا من useCaseDetailActions.ts (نفس المنطق تمامًا، صفر تغيير سلوك).
 * بعد أي إضافة/تعديل/حذف بينادي refetchAll() اللي هي fetchSessions المجمّعة
 * (سيشنز+ملاحظات+مستندات) بالظبط زي الأصل.
 */
export function useCaseSessions(
  caseData: MappedCase,
  client: ClientRow | null | undefined,
  profile: ProfileRow | null | undefined,
  onNotify: ((msg: string) => void | Promise<void>) | undefined,
  refetchAll: () => Promise<void> | void
) {
  const [sessions, setSessions] = useState<CaseSessionRow[]>([]);
  const [showAddSession, setShowAddSession] = useState(false);
  // ⚠️ FIX (14 يوليو 2026): كان متوقع CaseSessionRow (شكل صف قاعدة البيانات
  // الخام)، لكن القيمة الفعلية اللي بتتحط هنا (في TimelineSection.tsx عند
  // بدء التعديل) شكلها EditingSessionForm المُطبَّع (date/location_floor/
  // location_hall...) مش (session_date/session_floor/session_hall...).
  const [editingSession, setEditingSession] = useState<EditingSessionForm | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [sessionUpdateTarget, setSessionUpdateTarget] = useState<CaseSessionRow | null>(null);
  const [savingSession, setSavingSession] = useState(false);
  const [sessionForm, setSessionForm] = useState({ date: '', time_period: 'صباحي', location_floor: '', location_hall: '', description: '', result: '', next_action: '' });
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<{ id: string; date: string } | null>(null);

  // ── FIX (2.3): إعادة حساب next_hearing بشكل صحيح ──
  // ⚠️ قبل الإصلاح ده، next_hearing كان بيتحط عليه تاريخ أي جلسة تتضاف
  // مباشرة من غير أي مقارنة — لو المحامي سجّل جلسة قديمة بأثر رجعي
  // (لتوثيق نتيجة جلسة فاتت مثلاً)، next_hearing كان بيتلخبط ويصير
  // تاريخ ماضي رغم وجود جلسة قادمة فعلية مسجّلة قبل كده. كمان تعديل
  // أو حذف جلسة مكانش بيحدّث next_hearing إطلاقًا.
  // دلوقتي: بعد أي إضافة/تعديل/حذف جلسة، بنجيب كل جلسات القضية
  // ونحسب أقرب تاريخ فعلي >= اليوم، ونحدّث next_hearing بيه (أو null
  // لو مفيش جلسات قادمة خالص).
  const recalcNextHearing = async (caseId: string) => {
    const { data: allSessions } = await db
      .from('case_sessions')
      .select('session_date')
      .eq('case_id', caseId);
    const todayStr = new Date().toISOString().slice(0, 10);
    let nearest: string | null = null;
    (allSessions || []).forEach((s) => {
      if (!s.session_date || s.session_date < todayStr) return;
      if (!nearest || s.session_date < nearest) nearest = s.session_date;
    });
    await db.from('cases').update({ next_hearing: nearest }).eq('id', caseId);
  };

  const handleAddSession = async () => {
    if (!sessionForm.date) return;
    setSavingSession(true);
    const { error } = await db.from('case_sessions').insert([{
      case_id: caseData.id,
      session_date: sessionForm.date,
      session_time: sessionForm.time_period || null,
      session_floor: sessionForm.location_floor || null,
      session_hall: sessionForm.location_hall || null,
      description: sessionForm.description || null,
      result: sessionForm.result || null,
      next_action: sessionForm.next_action || null,
    }]);
    if (!error) {
      // تحديث أقرب جلسة في جدول القضايا — بمقارنة حقيقية، مش استبدال أعمى
      await recalcNextHearing(caseData.id);
    }
    setSavingSession(false);
    if (error) { toast('❌ فشل إضافة الجلسة — تحقق من الاتصال وأعد المحاولة', true); return; }
    toast('✅ تمت إضافة الجلسة');
    logActivity(db, 'إضافة جلسة', {
      entity_type: 'session', details: `${caseData.title} — ${sessionForm.date}`,
      case_name: caseData.title || null, case_type: caseData.type || null,
      client_name: client?.full_name || null,
      userName: profile?.full_name || null,
    });
    if (onNotify) {
      let msg = `📅 <b>جلسة جديدة</b>\n\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `⚖️ <b>${escapeTelegramHtml(caseData.title || '—')}</b>\n`;
      msg += `📋 رقم القيد: ${escapeTelegramHtml(caseData.number || '—')}\n`;
      msg += `🏛 المحكمة: ${escapeTelegramHtml(caseData.court || '—')}\n`;
      msg += `📆 تاريخ الجلسة: ${escapeTelegramHtml(sessionForm.date)}`;
      if (sessionForm.time_period) msg += ` (${escapeTelegramHtml(sessionForm.time_period)})`;
      msg += `\n`;
      if (sessionForm.location_floor || sessionForm.location_hall) msg += `📍 ${sessionForm.location_floor ? 'الطابق ' + escapeTelegramHtml(sessionForm.location_floor) + ' ' : ''} ${sessionForm.location_hall ? 'قاعة ' + escapeTelegramHtml(sessionForm.location_hall) : ''}\n`;
      if (sessionForm.description) msg += `📝 ${escapeTelegramHtml(sessionForm.description)}\n`;
      onNotify(msg);
    }
    setSessionForm({ date: '', time_period: 'صباحي', location_floor: '', location_hall: '', description: '', result: '', next_action: '' });
    setShowAddSession(false);
    refetchAll();
  };

  const handleDeleteSession = async (sessionId: string) => {
    const { error } = await db.from('case_sessions').delete().eq('id', sessionId);
    if (error) { toast('❌ فشل حذف الجلسة، حاول مرة أخرى', true); return; }
    // FIX (2.3): لو الجلسة المحذوفة كانت هي الأقرب، لازم next_hearing يتحدّث
    await recalcNextHearing(caseData.id);
    toast('🗑 تم حذف الجلسة');
    logActivity(db, 'حذف جلسة', {
      entity_type: 'session', entity_id: sessionId, details: caseData.title || null,
      case_name: caseData.title || null, case_type: caseData.type || null,
      client_name: client?.full_name || null,
      userName: profile?.full_name || null,
    });
    refetchAll();
  };

  const handleUpdateSession = async (sessionId: string, form: { date: string; time_period?: string; location_floor?: string; location_hall?: string; description?: string; result?: string; next_action?: string }) => {
    const session = sessions.find((s) => s.id === sessionId);
    const { success, conflict } = await safeUpdate(db, 'case_sessions', sessionId, {
      session_date: form.date,
      session_time: form.time_period || null,
      session_floor: form.location_floor || null,
      session_hall: form.location_hall || null,
      description: form.description || null,
      result: form.result || null,
      next_action: form.next_action || null,
    }, session?.updated_at || null);
    if (conflict) return;
    if (!success) { toast('❌ فشل تعديل بيانات الجلسة — تحقق من الاتصال وأعد المحاولة', true); return; }
    // FIX (2.3): تاريخ الجلسة ممكن يكون اتغيّر، فلازم next_hearing يتحدّث معاه
    await recalcNextHearing(caseData.id);
    toast('✅ تم تعديل الجلسة');
    logActivity(db, 'تعديل جلسة', {
      entity_type: 'session', entity_id: sessionId, details: `${caseData.title} — ${form.date}`,
      case_name: caseData.title || null, case_type: caseData.type || null,
      client_name: client?.full_name || null,
      userName: profile?.full_name || null,
    });
    if (onNotify) {
      let msg = `✏️ <b>تم تعديل جلسة</b>\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `⚖️ <b>${escapeTelegramHtml(caseData.title || '—')}</b>\n`;
      msg += `📋 رقم القيد: ${escapeTelegramHtml(caseData.number || '—')}\n`;
      msg += `🏛 المحكمة: ${escapeTelegramHtml(caseData.court || '—')}\n`;
      msg += `📆 <b>التاريخ الجديد:</b> ${escapeTelegramHtml(form.date)}`;
      if (form.time_period) msg += ` (${escapeTelegramHtml(form.time_period)})`;
      msg += `\n`;
      if (form.description) msg += `📝 ${escapeTelegramHtml(form.description)}\n`;
      onNotify(msg);
    }
    refetchAll();
  };

  return {
    sessions, setSessions,
    showAddSession, setShowAddSession,
    editingSession, setEditingSession,
    deletingSessionId, setDeletingSessionId,
    sessionUpdateTarget, setSessionUpdateTarget,
    savingSession,
    sessionForm, setSessionForm,
    confirmDeleteSession, setConfirmDeleteSession,
    handleAddSession, handleUpdateSession, handleDeleteSession,
    recalcNextHearing,
  };
}
