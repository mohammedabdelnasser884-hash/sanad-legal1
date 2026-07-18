import { useState } from 'react';
import { toast } from '../../../shared/lib/notifications';
import { db } from '../../../supabaseClient';
import { showErrorToast } from '../../../shared/lib/errorReporting';
import { getCurrentTenantId } from '../../../constants';
import type { Form } from '../NewStandaloneSessionModal';

export type SavedFormData = { form: Form; finalCaseType: string; fullCaseNumber: string; sessionId: string | null };

/**
 * منطق إنشاء قضية من بيانات جلسة مستقلة + ربط/إضافة الموكل — منقول حرفيًا
 * من NewStandaloneSessionModal.tsx (نفس المنطق تمامًا، صفر تغيير سلوك):
 * handleLinkCase, handleLinkExistingClient, handleAddAndLinkClient,
 * handleAddClientOnly.
 */
export function useClientLinking(savedFormData: SavedFormData | null, onSaved: () => void, onClientAdded?: () => void) {
  const [linkingCase, setLinkingCase] = useState(false);
  const [linkingClient, setLinkingClient] = useState(false);
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);
  const [clientStep, setClientStep] = useState<'idle' | 'found' | 'notfound' | 'done'>('idle');
  const [foundClient, setFoundClient] = useState<{ id: string; full_name: string | null } | null>(null);
  const [linkingToCase, setLinkingToCase] = useState(false);

  const handleLinkCase = async () => {
    if (!savedFormData) return;
    setLinkingCase(true);
    try {
      const { form: f, finalCaseType: ct, fullCaseNumber: cn } = savedFormData;
      const caseTitle = f.title || cn || 'قضية من جلسة مستقلة';
      const { data, error } = await db.from('cases').insert([{
        title: caseTitle,
        court_name: f.court || caseTitle,
        case_number_official: cn || caseTitle,
        case_number: cn || null,
        court: f.court || null,
        case_type: ct || null,
        plaintiff: f.plaintiff || null,
        plaintiff_role: f.plaintiff_role || null,
        plaintiff_national_id: f.plaintiff_national_id || null,
        plaintiff_power_of_attorney: f.plaintiff_power_of_attorney || null,
        defendant: f.defendant || null,
        defendant_role: f.defendant_role || null,
        defendant_national_id: f.defendant_national_id || null,
        circuit_number: f.circuit_number || null,
        // ⚡ FIX: كانت الصفة (plaintiff_role/defendant_role) والدور/القاعة
        // (session_floor→court_floor, session_hall) بيتسجلوا صح في الجلسة
        // المستقلة لكن بيضيعوا وقت تحويلها لملف قضية، لأن الإدراج القديم
        // هنا كان مش بينقلهم خالص رغم إن الأعمدة دلوقتي موجودة في cases.
        court_floor: f.session_floor || null,
        session_hall: f.session_hall || null,
        status: 'نشطة',
      }]).select('id').single();
      if (error) {
        showErrorToast('case_create', error, 'تعذّر إنشاء القضية. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'إنشاء قضية');
        return;
      }
      toast('✅ تم إنشاء ملف القضية');
      setCreatedCaseId(data.id);
      // ⚡ ربط الجلسة المستقلة الأصلية بالقضية الجديدة — من غير الخطوة دي
      // الجلسة كانت هتفضل "مستقلة" (case_id = null) حتى بعد إنشاء ملف
      // القضية، وده كان بيمنع فتح صفحة جلسات القضية عند الضغط عليها تاني.
      if (savedFormData.sessionId) {
        const { error: sessionLinkErr } = await db.from('case_sessions')
          .update({ case_id: data.id })
          .eq('id', savedFormData.sessionId);
        if (sessionLinkErr) {
          showErrorToast('session_case_link', sessionLinkErr, 'تم إنشاء القضية لكن تعذّر ربط الجلسة بها. حاول تحديث الصفحة.', 'ربط الجلسة بالقضية');
        }
      }
      onSaved(); // تحديث قائمة القضايا والجلسات فوراً (بعد اكتمال الربط)
      // ابحث عن الموكل
      const plaintiffName = f.plaintiff?.trim();
      if (!plaintiffName) { setClientStep('notfound'); return; }
      const { data: clients } = await db.from('clients').select('id,full_name').ilike(`full_name`, `%${plaintiffName}%`).limit(3);
      if (clients && clients.length > 0) {
        setFoundClient(clients[0]);
        setClientStep('found');
      } else {
        setClientStep('notfound');
      }
    } catch { toast('❌ خطأ غير متوقع', true); }
    finally { setLinkingCase(false); }
  };

  const handleLinkExistingClient = async () => {
    if (!createdCaseId || !foundClient) return;
    setLinkingToCase(true);
    try {
      const { error } = await db.from('cases').update({ client_id: foundClient.id }).eq('id', createdCaseId);
      if (error) {
        showErrorToast('session_client_link', error, 'تعذّر ربط الموكل بالجلسة. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'ربط الموكل بالجلسة');
      }
      else { toast('✅ تم ربط الموكل بالقضية'); setClientStep('done'); }
    } catch { toast('❌ خطأ غير متوقع', true); }
    finally { setLinkingToCase(false); }
  };

  const handleAddAndLinkClient = async () => {
    if (!savedFormData || !createdCaseId) return;
    setLinkingToCase(true);
    try {
      const { form: f } = savedFormData;
      const name = f.plaintiff?.trim();
      if (!name) return;
      const tenantId = getCurrentTenantId();
      if (!tenantId) { toast('❌ تعذر تحديد المكتب الحالي، أعد تحميل الصفحة وحاول مرة أخرى', true); return; }
      const { data, error } = await db.from('clients').insert([{
        // ⚠️ باگ حقيقي كان هنا (اتأكد بالاستعلام على information_schema):
        // 1) client_name هو العمود الإجباري (NOT NULL) في جدول clients —
        //    full_name عمود تاني اختياري بيتحدّث معاه، مش بديل عنه. الإدراج
        //    القديم كان بيبعت full_name بس فيفشل بـ not-null constraint.
        // 2) tenant_id كان مفقود تمامًا، والـ RLS policy على الجدول
        //    (tenant_id = current_tenant_id()) كانت بترفض الإدراج بصمت.
        client_name: name,
        full_name: name,
        tenant_id: tenantId,
        national_id: f.plaintiff_national_id || null,
        // power_of_attorney مش عمود موجود في جدول clients — التوكيل بيتسجل
        // فعلاً على مستوى الجلسة نفسها (plaintiff_power_of_attorney في
        // case_sessions فوق)، فمحتاجش يتكرر هنا.
      }]).select('id').single();
      if (error) {
        showErrorToast('client_create', error, 'تعذّر إضافة الموكل. تحقق من صحة البيانات. لو المشكلة استمرت، تواصل مع الدعم.', 'إضافة موكل');
        return;
      }
      const { error: linkErr } = await db.from('cases').update({ client_id: data.id }).eq('id', createdCaseId);
      if (linkErr) {
        showErrorToast('session_client_link', linkErr, 'تعذّر ربط الموكل بالجلسة. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'ربط الموكل بالجلسة');
      }
      else { toast('✅ تمت إضافة الموكل وربطه بالقضية'); setClientStep('done'); onClientAdded?.(); }
    } catch { toast('❌ خطأ غير متوقع', true); }
    finally { setLinkingToCase(false); }
  };

  const handleAddClientOnly = async () => {
    if (!savedFormData) return;
    setLinkingClient(true);
    try {
      const { form: f } = savedFormData;
      const name = f.plaintiff?.trim();
      if (!name) return;
      const tenantId = getCurrentTenantId();
      if (!tenantId) { toast('❌ تعذر تحديد المكتب الحالي، أعد تحميل الصفحة وحاول مرة أخرى', true); return; }
      const { error } = await db.from('clients').insert([{
        // نفس الإصلاح المذكور فوق في handleAddAndLinkClient — client_name
        // هو العمود الإجباري الحقيقي، وtenant_id مطلوب عشان الـ RLS.
        client_name: name,
        full_name: name,
        tenant_id: tenantId,
        national_id: f.plaintiff_national_id || null,
        // power_of_attorney مش عمود موجود في clients، والتوكيل متسجل على
        // مستوى الجلسة.
      }]);
      if (error) {
        showErrorToast('client_create', error, 'تعذّر إضافة الموكل. تحقق من صحة البيانات. لو المشكلة استمرت، تواصل مع الدعم.', 'إضافة موكل');
      }
      else { toast('✅ تمت إضافة الموكل لقائمة الموكلين'); onClientAdded?.(); }
    } catch { toast('❌ خطأ غير متوقع', true); }
    finally { setLinkingClient(false); }
  };

  return {
    linkingCase, linkingClient, linkingToCase,
    createdCaseId, setCreatedCaseId,
    clientStep, setClientStep,
    foundClient, setFoundClient,
    handleLinkCase, handleLinkExistingClient, handleAddAndLinkClient, handleAddClientOnly,
  };
}
