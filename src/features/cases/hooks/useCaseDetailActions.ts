import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../../../supabaseClient';
import { toast } from '../../../shared/lib/notifications';
import { resolveStorageUrl } from '../../../shared/lib/storage';
import { escapeHtml } from '../../../shared/lib/sanitize';
import { safeUpdate, logActivity } from '../../../shared/lib/dataAccess';
import { PDF_FONT_FAMILY, PDF_FONT_LINK } from '../../../shared/lib/pdf';
import { loadOfficeSetting } from '../../../constants';
import { formatArDate } from '../../../shared/ui/arabicLocale';
import type { ClientRow, ProfileRow, CaseNoteRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';
import { useCaseSessions } from './useCaseSessions';
import { useCaseDocuments } from './useCaseDocuments';
import type { CaseDocWithUrl } from './useCaseDocuments';

// نُبقي إعادة تصدير النوع من هنا عشان أي ملف تاني بيستورده من
// './hooks/useCaseDetailActions' (زي DocsSection.tsx وInfoSection.tsx)
// يفضل شغال من غير أي تعديل في مسار الاستيراد.
export type { CaseDocWithUrl };

export function useCaseDetailActions(
  caseData: MappedCase,
  onUpdate: ((newStatus: string) => void) | undefined,
  onDelete: ((caseId: string) => void | Promise<void>) | undefined,
  onNotify: ((msg: string) => void | Promise<void>) | undefined,
  setShowStatusPicker?: (v: boolean) => void,
  client?: ClientRow | null,
  profile?: ProfileRow | null
) {
  // ✅ FIX: caseData بقى MappedCase (مش CaseRow خام) — يعني .type و.number
  // موجودين فعليًا كحقول حقيقية، وماحتاجناش أي كاست أو `any` بعد كده.
  // (كان فيه هنا قبل كده باگ موثّق: التوقيع كان بيقول CaseRow بينما القيمة
  // الفعلية زمن التشغيل دايمًا MappedCase، فكان لازم كاست `as unknown as any`
  // وأثّر على نداءات logActivity تحت اللي كانت بتقرا caseData.case_type
  // (حقل مش موجود أصلاً في MappedCase) فبترجع undefined دايمًا — اتصلح
  // تحت باستخدام caseData.type بدل caseData.case_type.)

  const [notes, setNotes] = useState<CaseNoteRow[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [showAddNote, setShowAddNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [changingStatus, setChangingStatus] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [officeWhatsAppName, setOfficeWhatsAppName] = useState('');
  const [confirmDeleteNote, setConfirmDeleteNote] = useState<{ id: string; preview: string } | null>(null);

  // ── تجميع هوكي الجلسات والمستندات ──
  // fetchSessions (تحت) بتجيب الجلسات + الملاحظات + المستندات مع بعض في نفس
  // النداء (زي الأصل بالظبط). عشان هوكي useCaseSessions/useCaseDocuments
  // يقدروا ينادوها بعد أي إضافة/تعديل/حذف من غير مشكلة ترتيب استدعاء الهوكس
  // (fetchSessions محتاجة setSessions/setDocs الراجعين من الهوكين نفسهم)،
  // بنمرّرلهم غلاف ثابت بينادي أحدث نسخة من fetchSessions عن طريق ref.
  const refetchAllRef = useRef<() => Promise<void>>(async () => {});
  const refetchAll = useCallback(() => refetchAllRef.current(), []);

  const sessionsHook = useCaseSessions(caseData, client, profile, onNotify, refetchAll);
  const docsHook = useCaseDocuments(caseData, client, profile, refetchAll);
  const { sessions, setSessions } = sessionsHook;
  const { docs, setDocs } = docsHook;

  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    const { data } = await db.from('case_sessions').select('*').eq('case_id', caseData.id).order('session_date', { ascending: false });
    setSessions(data || []);
    const { data: nd } = await db.from('case_notes').select('*').eq('case_id', caseData.id).order('created_at', { ascending: false });
    setNotes(nd || []);
    const { data: dd } = await db.from('case_documents').select('*').eq('case_id', caseData.id).order('created_at', { ascending: false });
    // ⚠️ case-docs بقى باكت private — نولّد رابط موقّع طازة لكل مستند.
    const ddWithUrls: CaseDocWithUrl[] = await Promise.all((dd || []).map(async (d) => ({
      ...d,
      file_url: await resolveStorageUrl('case-docs', d.storage_path || d.file_url),
    })));
    setDocs(ddWithUrls);
    setLoadingSessions(false);
  }, [caseData.id, setSessions, setDocs]);

  useEffect(() => { refetchAllRef.current = fetchSessions; }, [fetchSessions]);
  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleExportPdf = async () => {
    setExportingPdf(true);
    const MONTHS_FULL = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const now = new Date();
    const dateStr = now.getDate() + ' ' + MONTHS_FULL[now.getMonth()] + ' ' + now.getFullYear();

    // جلب بيانات المكتب
    const [officeName, officeAddress, officePhone, officeEmail, officeLogo] = await Promise.all([
      loadOfficeSetting('office_name'),
      loadOfficeSetting('office_address'),
      loadOfficeSetting('office_phone'),
      loadOfficeSetting('office_email'),
      loadOfficeSetting('office_logo'),
    ]);
    const name = escapeHtml(officeName || '');
    const address = escapeHtml(officeAddress || '');
    const phone = escapeHtml(officePhone || '');
    const email = escapeHtml(officeEmail || '');
    const contactLine = [address, phone, email].filter(Boolean).join(' | ');

    // شعار سند الرسمي SVG (يُستخدم لما مفيش شعار مكتب)
    const sanadSvg = `<svg width="32" height="32" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <line x1="6" y1="13" x2="34" y2="13" stroke="#D4AF37" stroke-width="4.5" stroke-linecap="round"/>
          <line x1="9.5" y1="21" x2="34" y2="21" stroke="#D4AF37" stroke-width="4.5" stroke-linecap="round"/>
          <line x1="13" y1="29" x2="34" y2="29" stroke="#D4AF37" stroke-width="4.5" stroke-linecap="round"/>
          <line x1="6" y1="13" x2="6" y2="32" stroke="#D4AF37" stroke-width="4.5" stroke-linecap="round"/>
          <circle cx="6" cy="13" r="4.5" fill="#D4AF37"/>
          <circle cx="6" cy="33" r="3" fill="#D4AF37" opacity="0.38"/>
        </svg>`;

    const logoHtml = officeLogo
      ? `<img src="${officeLogo}" style="width:56px;height:56px;object-fit:contain;border-radius:8px;border:1px solid rgba(255,255,255,0.2);" />`
      : `<div style="width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,#0d1a2e,#0B1320);border:1px solid rgba(212,175,55,0.25);display:flex;align-items:center;justify-content:center;">${sanadSvg}</div>`;

    const displayName = name || 'سَنَد'; // name متهرّبة فعلًا أعلى الدالة
    const displaySub = name ? '' : 'نظام التشغيل القانوني';

    // تنسيق رقم القيد
    const caseNum = (() => { const p = (caseData.number || '').split('/'); return p.length === 2 ? p[0] + ' لسنة ' + p[1] : caseData.number || '—'; })();

    // ⚠️ تهريب كل قيمة جاية من المستخدم (عنوان قضية، خصوم، جلسات، ملاحظات،
    // أسماء ملفات...) قبل دمجها في HTML خام — وإلا ممكن أي حقل من دول
    // يحمل كود (مثلاً <img onerror=...>) ويتنفذ في نافذة الطباعة (XSS مخزّنة).
    const safeCaseTitle = escapeHtml(caseData.title || '');
    const safeCaseStatus = escapeHtml(caseData.status || 'نشطة');
    const safeCaseNum = escapeHtml(caseNum);
    const safeCaseType = escapeHtml(caseData.type || '—');
    const safeCaseCourt = escapeHtml(caseData.court || '—');
    const safeClientName = escapeHtml(client?.full_name || '—');
    const safePlaintiff = escapeHtml(caseData.plaintiff || '');
    const safeDefendant = escapeHtml(caseData.defendant || '');

    const win = window.open('', '_blank');
    if (!win) { setExportingPdf(false); return; }

    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head>
<meta charset="UTF-8"><title>ملف القضية - ${safeCaseTitle}</title>
${PDF_FONT_LINK}
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:${PDF_FONT_FAMILY};background:#f8f9fa;color:#1a1a2e;padding:20px;}
  .page{max-width:800px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);}
  .header{background:linear-gradient(135deg,#1a1a2e,#16213e);color:#D4AF37;padding:28px 32px;}
  .header-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
  .office-info{display:flex;align-items:center;gap:12px;}
  .office-name{font-size:16px;font-weight:900;color:#D4AF37;}
  .office-contact{font-size:10px;color:rgba(212,175,55,0.6);margin-top:2px;}
  .case-title{font-size:20px;font-weight:900;color:#fff;text-align:center;}
  .case-sub{font-size:11px;color:rgba(212,175,55,0.7);text-align:center;margin-top:6px;}
  .badge{display:inline-block;padding:4px 14px;border-radius:20px;border:1px solid #D4AF37;color:#D4AF37;font-size:11px;margin-top:8px;}
  .gold-bar{height:3px;background:linear-gradient(90deg,#D4AF37,#E8C84A,#D4AF37);}
  .section{padding:20px 24px;border-bottom:1px solid #f0f0f0;}
  .section h2{font-size:13px;font-weight:900;color:#1a1a2e;margin-bottom:14px;padding-bottom:6px;border-bottom:2px solid #D4AF37;}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
  .field{background:#f8f9fa;border-radius:8px;padding:10px 12px;}
  .field label{font-size:9px;color:#888;display:block;margin-bottom:3px;font-weight:700;}
  .field span{font-size:12px;font-weight:700;color:#1a1a2e;}
  .session-card{border:1px solid #e8e8e8;border-right:4px solid #D4AF37;border-radius:8px;padding:12px;margin-bottom:8px;}
  .session-date{font-size:12px;font-weight:900;color:#D4AF37;margin-bottom:6px;}
  .session-label{font-size:9px;color:#888;font-weight:700;margin-top:6px;}
  .session-val{font-size:11px;color:#333;margin-top:2px;line-height:1.6;}
  .doc-row{display:flex;align-items:center;gap:10px;padding:8px;border:1px solid #eee;border-radius:8px;margin-bottom:5px;}
  .doc-name{font-size:11px;font-weight:700;color:#1a1a2e;}
  .doc-cat{font-size:9px;color:#888;}
  .note-card{background:#f8f9fa;border-radius:8px;padding:10px;margin-bottom:6px;border-right:3px solid #94a3b8;}
  .note-text{font-size:11px;color:#333;line-height:1.7;}
  .note-date{font-size:9px;color:#888;margin-top:4px;}
  .footer{background:#f8f9fa;padding:14px 24px;text-align:center;font-size:9px;color:#888;}
  @media print{body{padding:0;}.page{box-shadow:none;border-radius:0;}}
</style></head><body>
<div class="page">
  <div class="header">
    <div class="header-top">
      <div class="office-info">
        ${logoHtml}
        <div>
          <div class="office-name">${displayName}</div>
          ${displaySub ? `<div style="font-size:9px;color:rgba(212,175,55,0.5);margin-top:1px;">${displaySub}</div>` : ''}
          ${contactLine ? `<div class="office-contact">${contactLine}</div>` : ''}
        </div>
      </div>
      <div style="text-align:left">
        <div style="font-size:10px;color:rgba(212,175,55,0.6);">تاريخ الإصدار</div>
        <div style="font-size:12px;font-weight:700;color:#D4AF37;">${dateStr}</div>
      </div>
    </div>
    <div style="border-top:1px solid rgba(212,175,55,0.2);padding-top:16px;text-align:center;">
      <div class="case-title">⚖️ ${safeCaseTitle}</div>
      <div class="case-sub">ملف القضية الكامل</div>
      <div class="badge">${safeCaseStatus}</div>
    </div>
  </div>
  <div class="gold-bar"></div>

  <div class="section">
    <h2>📋 بيانات القضية</h2>
    <div class="grid2">
      <div class="field"><label>رقم القيد</label><span>${safeCaseNum}</span></div>
      <div class="field"><label>نوع القضية</label><span>${safeCaseType}</span></div>
      <div class="field"><label>المحكمة</label><span>${safeCaseCourt}</span></div>
      <div class="field"><label>الموكل</label><span>${safeClientName}</span></div>
      ${safePlaintiff ? `<div class="field"><label>المدعي / الطاعن</label><span>${safePlaintiff}</span></div>` : ''}
      ${safeDefendant ? `<div class="field"><label>المدعى عليه / المطعون ضده</label><span>${safeDefendant}</span></div>` : ''}
    </div>
  </div>

  ${sessions.length > 0 ? `
  <div class="section">
    <h2>🗓 الجلسات (${sessions.length})</h2>
    ${sessions.map((s) => `
    <div class="session-card">
      <div class="session-date">📅 ${escapeHtml(s.session_date || '')}</div>
      ${s.description ? `<div class="session-label">ما جرى</div><div class="session-val">${escapeHtml(s.description)}</div>` : ''}
      ${s.result ? `<div class="session-label">النتيجة</div><div class="session-val">${escapeHtml(s.result)}</div>` : ''}
      ${s.next_action ? `<div class="session-label">الإجراء القادم</div><div class="session-val">${escapeHtml(s.next_action)}</div>` : ''}
    </div>`).join('')}
  </div>` : ''}

  ${notes.length > 0 ? `
  <div class="section">
    <h2>📝 الملاحظات (${notes.length})</h2>
    ${notes.map((n) => `
    <div class="note-card">
      <div class="note-text">${escapeHtml(n.content || '')}</div>
      <div class="note-date">${n.created_at ? formatArDate(n.created_at) : ''}</div>
    </div>`).join('')}
  </div>` : ''}

  ${docs.length > 0 ? `
  <div class="section">
    <h2>📁 المستندات (${docs.length})</h2>
    ${docs.map((d) => `
    <div class="doc-row">
      <div style="font-size:20px">${/\.pdf$/i.test(d.original_name || '') ? '📄' : /\.(jpg|jpeg|png|gif|webp)$/i.test(d.original_name || '') ? '🖼' : /\.(doc|docx)$/i.test(d.original_name || '') ? '📝' : '📎'}</div>
      <div><div class="doc-name">${escapeHtml(d.file_name || '')}</div><div class="doc-cat">${escapeHtml(d.category || 'مستند')}</div></div>
    </div>`).join('')}
  </div>` : ''}

  <div class="footer">🔒 ملف سري — ${displayName}${contactLine ? ' | ' + contactLine : ''} | تاريخ الإصدار: ${dateStr}</div>
</div>
<script>window.onload=()=>{window.print();}</script>
</body></html>`;
    win.document.write(html);
    win.document.close();
    setExportingPdf(false);
    toast('📄 جاري فتح ملف الطباعة...');
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setSavingNote(true);
    const { error } = await db.from('case_notes').insert([{
      case_id: caseData.id,
      content: noteText.trim(),
    }]);
    setSavingNote(false);
    if (error) { toast('❌ فشل إضافة الملاحظة — تحقق من الاتصال وأعد المحاولة', true); return; }
    toast('✅ تمت إضافة الملاحظة');
    logActivity(db, 'إضافة ملاحظة', {
      entity_type: 'note', details: caseData.title || null,
      case_name: caseData.title || null, case_type: caseData.type || null,
      client_name: client?.full_name || null,
      userName: profile?.full_name || null,
    });
    setNoteText('');
    setShowAddNote(false);
    fetchSessions();
  };

  const handleDeleteNote = async (noteId: string) => {
    const { error } = await db.from('case_notes').delete().eq('id', noteId);
    if (error) { toast('❌ فشل حذف الملاحظة، حاول مرة أخرى', true); return; }
    toast('🗑 تم حذف الملاحظة');
    logActivity(db, 'حذف ملاحظة', {
      entity_type: 'note', entity_id: noteId, details: caseData.title || null,
      case_name: caseData.title || null, case_type: caseData.type || null,
      client_name: client?.full_name || null,
      userName: profile?.full_name || null,
    });
    fetchSessions();
  };

  const handleUpdateNote = async (noteId: string, content: string) => {
    // نجيب updated_at الحالي من الـ notes المحفوظة في state
    const note = notes.find((n) => n.id === noteId);
    const { success, conflict } = await safeUpdate(db, 'case_notes', noteId, { content }, note?.updated_at || null);
    if (conflict) return; // safeUpdate بيعرض الـ toast تلقائياً
    if (!success) { toast('❌ فشل تعديل الملاحظة — تحقق من الاتصال وأعد المحاولة', true); return; }
    toast('✅ تم تعديل الملاحظة');
    logActivity(db, 'تعديل ملاحظة', {
      entity_type: 'note', entity_id: noteId, details: caseData.title || null,
      case_name: caseData.title || null, case_type: caseData.type || null,
      client_name: client?.full_name || null,
      userName: profile?.full_name || null,
    });
    fetchSessions();
  };

  const handleChangeStatus = async (newStatus: string) => {
    setChangingStatus(true);
    setShowStatusPicker?.(false);
    const { success, conflict } = await safeUpdate(db, 'cases', caseData.id, { status: newStatus }, caseData.updated_at || null);
    setChangingStatus(false);
    if (conflict) return;
    if (!success) { toast('❌ فشل تغيير الحالة', true); return; }
    toast('✅ تم تحديث حالة القضية');
    logActivity(db, 'تغيير حالة قضية', {
      entity_type: 'case', entity_id: caseData.id, details: `${caseData.title} — ${newStatus}`,
      case_name: caseData.title || null, case_type: caseData.type || null,
      client_name: client?.full_name || null,
      userName: profile?.full_name || null,
    });
    onUpdate?.(newStatus);
  };

  return {
    // جلسات (من useCaseSessions)
    sessions: sessionsHook.sessions, setSessions: sessionsHook.setSessions,
    showAddSession: sessionsHook.showAddSession, setShowAddSession: sessionsHook.setShowAddSession,
    editingSession: sessionsHook.editingSession, setEditingSession: sessionsHook.setEditingSession,
    deletingSessionId: sessionsHook.deletingSessionId, setDeletingSessionId: sessionsHook.setDeletingSessionId,
    sessionUpdateTarget: sessionsHook.sessionUpdateTarget, setSessionUpdateTarget: sessionsHook.setSessionUpdateTarget,
    savingSession: sessionsHook.savingSession,
    sessionForm: sessionsHook.sessionForm, setSessionForm: sessionsHook.setSessionForm,
    confirmDeleteSession: sessionsHook.confirmDeleteSession, setConfirmDeleteSession: sessionsHook.setConfirmDeleteSession,
    handleAddSession: sessionsHook.handleAddSession,
    handleUpdateSession: sessionsHook.handleUpdateSession,
    handleDeleteSession: sessionsHook.handleDeleteSession,

    // مستندات (من useCaseDocuments)
    docs: docsHook.docs, setDocs: docsHook.setDocs,
    uploadingDoc: docsHook.uploadingDoc,
    docCategory: docsHook.docCategory, setDocCategory: docsHook.setDocCategory,
    docLabel: docsHook.docLabel, setDocLabel: docsHook.setDocLabel,
    showDocForm: docsHook.showDocForm, setShowDocForm: docsHook.setShowDocForm,
    pendingFile: docsHook.pendingFile, setPendingFile: docsHook.setPendingFile,
    deletingDocId: docsHook.deletingDocId, setDeletingDocId: docsHook.setDeletingDocId,
    fileInputRef: docsHook.fileInputRef,
    confirmDeleteDoc: docsHook.confirmDeleteDoc, setConfirmDeleteDoc: docsHook.setConfirmDeleteDoc,
    handleFileSelect: docsHook.handleFileSelect,
    handleUploadDoc: docsHook.handleUploadDoc,
    handleDeleteDoc: docsHook.handleDeleteDoc,

    // ملاحظات + حالة القضية + عام (زي ما هو في الملف ده)
    notes, setNotes,
    loadingSessions,
    editingNoteId, setEditingNoteId, editingNoteText, setEditingNoteText,
    deletingNoteId, setDeletingNoteId,
    showAddNote, setShowAddNote,
    savingNote, changingStatus,
    noteText, setNoteText,
    exportingPdf, showWhatsApp, setShowWhatsApp, officeWhatsAppName, setOfficeWhatsAppName,
    confirmDeleteNote, setConfirmDeleteNote,
    fetchSessions, handleExportPdf,
    handleAddNote, handleDeleteNote, handleUpdateNote, handleChangeStatus,
  };
}
