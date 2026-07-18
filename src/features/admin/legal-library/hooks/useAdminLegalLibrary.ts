import React, { useState, useCallback } from 'react';
import { toast } from '../../../../shared/lib/notifications';
import { logActivity } from '../../../../shared/lib/dataAccess';
import { showErrorToast } from '../../../../shared/lib/errorReporting';
import { db } from '../../../../supabaseClient';
import type { ProfileRow, LawRow, LegalCategoryRow } from '../../../../types';

// فورم إضافة/تعديل قانون — نفس الحقول اللي بيبعتها LegalLibraryModal.tsx
export interface LawForm {
  title: string;
  law_number: string;
  law_year: string;
  category_id: string;
}

// شكل خطأ استدعاء edge function (duck-typing زي ما كان الكود بيتحقق منه
// فعليًا — context ممكن يكون Response حقيقي فيه json()/text())
interface EdgeFunctionError {
  message?: string;
  context?: {
    json?: () => Promise<{ error?: string } | null>;
    text?: () => Promise<string>;
  };
}

export function useAdminLegalLibrary(profile?: ProfileRow | null) {
  const _userName = profile?.full_name || null;
  const [laws, setLaws] = useState<LawRow[]>([]);
  const [legalCategories, setLegalCategories] = useState<LegalCategoryRow[]>([]);
  const [loadingLaws, setLoadingLaws] = useState(false);
  const [showLawModal, setShowLawModal] = useState(false);
  const [editingLaw, setEditingLaw] = useState<LawRow | null>(null);
  const [confirmDeleteLaw, setConfirmDeleteLaw] = useState<LawRow | null>(null);
  const [savingLaw, setSavingLaw] = useState(false);
  const [processingLaw, setProcessingLaw] = useState<{ id: string } | null>(null);

  const fetchLegalCategories = useCallback(async () => {
    try {
      const { data } = await db.from('legal_categories').select('*').order('name_ar');
      if (data) setLegalCategories(data);
    } catch(e) { /* الجدول غير موجود بعد */ }
  }, []);

  // ── المكتبة القانونية: جلب القوانين ──
  const fetchLaws = useCallback(async () => {
    setLoadingLaws(true);
    try {
      const { data } = await db.from('laws').select('*').order('created_at', { ascending: false });
      if (data) setLaws(data);
    } catch(e) { /* الجدول غير موجود بعد */ }
    setLoadingLaws(false);
  }, []);

  // ── المكتبة القانونية: إضافة / تعديل قانون ──
  const handleSaveLaw = async (form: LawForm, file: File|null) => {
    setSavingLaw(true);
    try {
      let filePath = editingLaw?.file_path;
      let fileName = editingLaw?.file_name;

      if (file) {
        // ⚠️ المكتبة القانونية بتقبل PDF فقط (نص القانون بيُستخرج منه بعد كده) —
        // فحص أضيق من validateUploadFile العامة، لمنع رفع .html/.svg هنا كمان.
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (ext !== 'pdf') {
          toast('❌ المكتبة القانونية تقبل ملفات PDF فقط.', true);
          setSavingLaw(false);
          return;
        }
        const MAX_LAW_PDF_SIZE = 50 * 1024 * 1024; // 50 MB
        if (file.size > MAX_LAW_PDF_SIZE) {
          toast('❌ حجم ملف القانون كبير جداً — الحد الأقصى 50 ميجابايت', true);
          setSavingLaw(false);
          return;
        }
        const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
        filePath = `laws/${safeName}`;
        const { error: upErr } = await db.storage.from('legal-library').upload(filePath, file, { upsert: true });
        if (upErr) throw upErr;
        fileName = file.name;
      }

      const payload = {
        title:       form.title.trim(),
        law_number:  form.law_number || null,
        law_year:    form.law_year ? Number(form.law_year) : null,
        category_id: form.category_id || null,
        file_path:   filePath || null,
        file_name:   fileName || null,
      };

      if (editingLaw) {
        const { error } = await db.from('laws').update(payload).eq('id', editingLaw.id);
        if (error) throw error;
        toast('✅ تم حفظ التعديلات');
        logActivity(db, 'تعديل قانون', { userName: _userName, entity_type: 'law', entity_id: editingLaw.id, details: payload.title });
      } else {
        const { error } = await db.from('laws').insert({ ...payload, status: 'pending' });
        if (error) throw error;
        toast('✅ تم إضافة القانون — جاهز للمعالجة');
        logActivity(db, 'إضافة قانون', { userName: _userName, entity_type: 'law', details: payload.title });
      }

      setShowLawModal(false);
      setEditingLaw(null);
      fetchLaws();
    } catch(e) {
      showErrorToast('legal_library_upload', e, 'تعذّر رفع الملف. تأكد من نوع وحجم الملف وحاول تاني. لو المشكلة استمرت، تواصل مع الدعم.', 'المكتبة القانونية');
    }
    setSavingLaw(false);
  };

  // ── المكتبة القانونية: معالجة قانون (استخراج المواد + توليد embeddings) ──
  // ── استخراج رسالة الخطأ الحقيقية من Edge Function (supabase-js بيرجع رسالة عامة بشكل افتراضي) ──
  const getFnErrorMessage = async (error: EdgeFunctionError | null | undefined): Promise<string> => {
    if (!error) return '';
    try {
      if (error.context && typeof error.context.json === 'function') {
        const body = await error.context.json();
        if (body?.error) return body.error;
      }
      if (error.context && typeof error.context.text === 'function') {
        const text = await error.context.text();
        if (text) return text;
      }
    } catch (_) { /* تجاهل */ }
    return 'حدث خطأ غير متوقع';
  };

  const handleProcessLaw = async (law: LawRow) => {
    // ملحوظة: المعالجة هنا خطوة واحدة فقط (استخراج المواد من PDF) — المساعد
    // القانوني يعتمد على بحث نصي (search_law_articles) فلا توجد خطوة
    // "فهرسة دلالية" لاحقة تنتظرها الواجهة قبل اكتمال المعالجة.
    setProcessingLaw({ id: law.id });
    try {
      const { data: extractData, error: extractErr } = await db.functions.invoke('process-law-extract', { body: { law_id: law.id } });
      if (extractErr) throw new Error(await getFnErrorMessage(extractErr as EdgeFunctionError));
      if (extractData?.error) throw new Error(extractData.error);

      toast('✅ تمت معالجة القانون وفهرسته بنجاح — ' + (extractData?.articles_count || 0) + ' مادة');
      logActivity(db, 'معالجة قانون', { userName: _userName, entity_type: 'law', entity_id: law.id, details: law.title + ' — ' + (extractData?.articles_count || 0) + ' مادة' });
    } catch (e) {
      const _msg = e instanceof Error ? e.message : String(e);
      // 🆕 process-law-extract بقى (بعد إصلاح المرحلة 2) بيرجّع رسائل عربية
      // آمنة ومفيدة أصلاً (زي "الملف قد يكون صور ممسوحة")، مش تسريب خام —
      // نعرضها زي ما هي. الاستثناء الوحيد هو الفولباك العام لـ getFnErrorMessage
      // (استثناء غير متوقع من غير الفانكشن، زي فشل شبكة)، وده بياخد الرسالة الموحدة.
      const message = (_msg && _msg !== 'حدث خطأ غير متوقع')
        ? _msg
        : 'تعذّر معالجة الملف. حاول تاني، ولو تكررت المشكلة تواصل مع الدعم.';
      showErrorToast('legal_library_process', e, message, 'معالجة القانون');
    }
    setProcessingLaw(null);
    fetchLaws();
  };


  const handleDeleteLaw = async (law: LawRow) => {
    setSavingLaw(true);
    try {
      if (law.file_path) {
        await db.storage.from('legal-library').remove([law.file_path]);
      }
      const { error } = await db.from('laws').delete().eq('id', law.id);
      if (error) throw error;
      toast('🗑️ تم حذف القانون ومواده');
      logActivity(db, 'حذف قانون', { userName: _userName, entity_type: 'law', entity_id: law.id, details: law.title });
      setConfirmDeleteLaw(null);
      fetchLaws();
    } catch(e) {
      showErrorToast('legal_library_delete', e, 'تعذّر حذف الملف. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'المكتبة القانونية');
    }
    setSavingLaw(false);
  };

  // ── تعديل مستخدم ──

  return {
    laws, legalCategories, loadingLaws,
    showLawModal, setShowLawModal,
    editingLaw, setEditingLaw,
    confirmDeleteLaw, setConfirmDeleteLaw,
    savingLaw, processingLaw,
    fetchLaws, fetchLegalCategories,
    handleSaveLaw, handleProcessLaw, handleDeleteLaw
  };
}
