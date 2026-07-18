import { useState, useRef } from 'react';
import { db } from '../../../supabaseClient';
import { toast } from '../../../shared/lib/notifications';
import { validateUploadFile, resolveStorageUrl } from '../../../shared/lib/storage';
import { logActivity } from '../../../shared/lib/dataAccess';
import { getCurrentTenantId } from '../../../constants';
import { showErrorToast } from '../../../shared/lib/errorReporting';
import type { ClientRow, ProfileRow, CaseDocumentRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';

export type CaseDocWithUrl = CaseDocumentRow & { file_url: string | null };

/**
 * منطق رفع/حذف/اختيار مستندات القضية — منقول حرفيًا من useCaseDetailActions.ts
 * (نفس المنطق تمامًا، صفر تغيير سلوك). بعد أي رفع أو حذف بينادي refetchAll()
 * اللي هي fetchSessions المجمّعة (سيشنز+ملاحظات+مستندات) بالظبط زي الأصل.
 */
export function useCaseDocuments(
  caseData: MappedCase,
  client: ClientRow | null | undefined,
  profile: ProfileRow | null | undefined,
  refetchAll: () => Promise<void> | void
) {
  const [docs, setDocs] = useState<CaseDocWithUrl[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docCategory, setDocCategory] = useState('مذكرة دفاع');
  const [docLabel, setDocLabel] = useState('');
  const [showDocForm, setShowDocForm] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<{ id: string; file_name: string | null; storage_path: string | null } | null>(null);

  const handleFileSelect = (e: { target: HTMLInputElement }) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // ⚠️ فحص نوع وحجم الملف قبل القبول — يمنع رفع .html/.svg أو ملفات
    // ضخمة على باكت عام بيُفتح رابطه مباشرة لأي حد (راجع validateUploadFile).
    const validationError = validateUploadFile(file);
    if (validationError) { toast('❌ ' + validationError, true); e.target.value = ''; return; }
    setPendingFile(file);
    setDocLabel(file.name.replace(/\.[^/.]+$/, ''));
    setShowDocForm(true);
  };

  const handleUploadDoc = async () => {
    if (!pendingFile) return;
    // فحص دفاعي ثاني قبل الرفع الفعلي (في حالة تغيّرت pendingFile بأي طريقة
    // غير handleFileSelect) — راجع validateUploadFile في utils.ts.
    const validationError = validateUploadFile(pendingFile);
    if (validationError) { toast('❌ ' + validationError, true); return; }
    const tenantId = getCurrentTenantId();
    if (!tenantId) { toast('❌ تعذر تحديد المكتب الحالي، أعد تحميل الصفحة وحاول مرة أخرى', true); return; }
    setUploadingDoc(true);
    const ext = (pendingFile.name.split('.').pop() || '').toLowerCase();
    // FIX (5.6): المسار لازم يبدأ بـ tenant_id عشان نقدر نفعّل RLS
    // بتفلتر بالمكتب على bucket case-docs (كان بدون أي عزل بين المكاتب).
    const safeName = `${tenantId}/case_${caseData.id}_${Date.now()}.${ext}`;
    const { error: upErr } = await db.storage.from('case-docs').upload(safeName, pendingFile, { upsert: true });
    if (upErr) {
      setUploadingDoc(false);
      showErrorToast('case_document_upload', upErr, 'تعذّر رفع المستند. تأكد من حجم الملف والاتصال بالإنترنت. لو المشكلة استمرت، تواصل مع الدعم.', 'رفع مستند');
      return;
    }
    // الباكت private دلوقتي — بنولّد رابط موقّع مؤقت بدل الرابط العام.
    const fileUrl = await resolveStorageUrl('case-docs', safeName);
    const { error: dbErr } = await db.from('case_documents').insert([{
      case_id: caseData.id,
      file_name: docLabel.trim() || pendingFile.name,
      file_type: ext,
      file_url: fileUrl,
      storage_path: safeName,
      category: docCategory,
      original_name: pendingFile.name,
      file_size: pendingFile.size,
    }]);
    setUploadingDoc(false);
    if (dbErr) {
      showErrorToast('case_document_upload', dbErr, 'تم رفع الملف لكن تعذّر حفظ بياناته. حاول تاني. لو المشكلة استمرت، تواصل مع الدعم.', 'حفظ بيانات المستند');
      return;
    }
    toast('✅ تم رفع المستند بنجاح');
    logActivity(db, 'رفع مستند', {
      entity_type: 'document', details: `${caseData.title} — ${docLabel.trim() || pendingFile.name}`,
      case_name: caseData.title || null, case_type: caseData.type || null,
      client_name: client?.full_name || null,
      userName: profile?.full_name || null,
    });
    setShowDocForm(false); setPendingFile(null); setDocLabel(''); setDocCategory('مذكرة دفاع');
    if (fileInputRef.current) fileInputRef.current.value = '';
    refetchAll();
  };

  // ⚠️ بيتنادى من confirmDeleteDoc (شكله {id, file_name, storage_path} بس
  // — عرّفناه هنا تحت) مش من الصف الكامل CaseDocWithUrl، فالنوع لازم
  // يبقى بس الحقول الثلاثة دي عشان يتوافق مع كل نداءاته الفعليين.
  const handleDeleteDoc = async (doc: { id: string; file_name: string | null; storage_path: string | null }) => {
    setDeletingDocId(doc.id);
    const { error: storageErr } = await db.storage.from('case-docs').remove([doc.storage_path || '']);
    if (storageErr) {
      setDeletingDocId(null);
      toast('❌ فشل حذف الملف، حاول مرة أخرى', true);
      return;
    }
    const { error: dbErr } = await db.from('case_documents').delete().eq('id', doc.id);
    setDeletingDocId(null);
    if (dbErr) { toast('❌ حُذف الملف لكن فشل تحديث السجل', true); return; }
    toast('🗑 تم حذف المستند');
    logActivity(db, 'حذف مستند', {
      entity_type: 'document', entity_id: doc.id, details: `${caseData.title} — ${doc.file_name}`,
      case_name: caseData.title || null, case_type: caseData.type || null,
      client_name: client?.full_name || null,
      userName: profile?.full_name || null,
    });
    refetchAll();
  };

  return {
    docs, setDocs,
    uploadingDoc, docCategory, setDocCategory, docLabel, setDocLabel,
    showDocForm, setShowDocForm, pendingFile, setPendingFile,
    deletingDocId, setDeletingDocId, fileInputRef,
    confirmDeleteDoc, setConfirmDeleteDoc,
    handleFileSelect, handleUploadDoc, handleDeleteDoc,
  };
}
