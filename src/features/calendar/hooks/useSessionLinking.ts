import { useState } from 'react';
import { toast } from '../../../shared/lib/notifications';
import { showErrorToast } from '../../../shared/lib/errorReporting';
import { getCurrentTenantId } from '../../../constants';
import { ilikeOrClause } from '../../../shared/lib/sanitize';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../database.types';
import type { CaseSessionRow } from '../../../types';

export type ClientSearchResult = { id: string; full_name: string | null; client_name: string | null; national_id: string | null };

/**
 * منطق ربط جلسة مستقلة *محفوظة بالفعل* (session already في الـ DB، مش
 * بيانات form لسه ما اتحفظتش) — بيغطي 3 مسارات:
 *  1) إنشاء ملف قضية من بيانات الجلسة (ونفس البحث التلقائي عن موكل مطابق
 *     زي ما كان موجود في useClientLinking، بس هنا بيربط createdCaseId
 *     بدل savedFormData.sessionId لأن الجلسة already موجودة).
 *  2) إضافة الموكل لقائمة الموكلين فقط (من غير ربط).
 *  3) [جديد] بحث يدوي في الموكلين الموجودين بالفعل وربط الجلسة مباشرة
 *     بـ client_id بتاعه (case_sessions.client_id) من غير إنشاء قضية.
 */
export function useSessionLinking(session: CaseSessionRow, db: SupabaseClient<Database>, onDone: () => void, onClientAdded?: () => void) {
  const [linkingCase, setLinkingCase] = useState(false);
  const [linkingClient, setLinkingClient] = useState(false);
  const [linkingToCase, setLinkingToCase] = useState(false);
  const [linkingExisting, setLinkingExisting] = useState(false);
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);
  const [clientStep, setClientStep] = useState<'idle' | 'found' | 'notfound' | 'searching' | 'done'>('idle');
  const [foundClient, setFoundClient] = useState<{ id: string; full_name: string | null } | null>(null);

  const [clientSearch, setClientSearch] = useState('');
  const [searchResults, setSearchResults] = useState<ClientSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedExistingClient, setSelectedExistingClient] = useState<ClientSearchResult | null>(null);

  // ── 1) إنشاء ملف قضية من بيانات الجلسة ──
  const handleLinkCase = async () => {
    setLinkingCase(true);
    try {
      const caseTitle = session.title || session.case_number || 'قضية من جلسة مستقلة';
      const { data, error } = await db.from('cases').insert([{
        title: caseTitle,
        court_name: session.court || caseTitle,
        case_number_official: session.case_number || caseTitle,
        case_number: session.case_number || null,
        court: session.court || null,
        case_type: session.case_type || null,
        plaintiff: session.plaintiff || null,
        plaintiff_role: session.plaintiff_role || null,
        plaintiff_national_id: session.plaintiff_national_id || null,
        plaintiff_power_of_attorney: session.plaintiff_power_of_attorney || null,
        defendant: session.defendant || null,
        defendant_role: session.defendant_role || null,
        defendant_national_id: session.defendant_national_id || null,
        circuit_number: session.circuit_number || null,
        // ⚡ نفس إصلاح useClientLinking.ts — نقل الصفة والدور/القاعة من
        // الجلسة لملف القضية الجديد بدل ما يضيعوا.
        court_floor: session.session_floor || null,
        session_hall: session.session_hall || null,
        status: 'نشطة',
      }]).select('id').single();
      if (error) {
        showErrorToast('case_create', error, 'تعذّر إنشاء القضية. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'إنشاء قضية');
        return;
      }
      toast('✅ تم إنشاء ملف القضية');
      setCreatedCaseId(data.id);
      const { error: sessionLinkErr } = await db.from('case_sessions').update({ case_id: data.id }).eq('id', session.id);
      if (sessionLinkErr) {
        showErrorToast('session_case_link', sessionLinkErr, 'تم إنشاء القضية لكن تعذّر ربط الجلسة بها. حاول تحديث الصفحة.', 'ربط الجلسة بالقضية');
      }
      onDone();
      const plaintiffName = session.plaintiff?.trim();
      if (!plaintiffName) { setClientStep('notfound'); return; }
      const { data: clients } = await db.from('clients').select('id,full_name').is('deleted_at', null).ilike('full_name', `%${plaintiffName}%`).limit(3);
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
        showErrorToast('session_client_link', error, 'تعذّر ربط الموكل بالقضية. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'ربط الموكل بالقضية');
      } else { toast('✅ تم ربط الموكل بالقضية'); setClientStep('done'); }
    } catch { toast('❌ خطأ غير متوقع', true); }
    finally { setLinkingToCase(false); }
  };

  const handleAddAndLinkClient = async () => {
    if (!createdCaseId) return;
    setLinkingToCase(true);
    try {
      const name = session.plaintiff?.trim();
      if (!name) return;
      const tenantId = getCurrentTenantId();
      if (!tenantId) { toast('❌ تعذر تحديد المكتب الحالي، أعد تحميل الصفحة وحاول مرة أخرى', true); return; }
      const { data, error } = await db.from('clients').insert([{
        client_name: name,
        full_name: name,
        tenant_id: tenantId,
        national_id: session.plaintiff_national_id || null,
      }]).select('id').single();
      if (error) {
        showErrorToast('client_create', error, 'تعذّر إضافة الموكل. تحقق من صحة البيانات. لو المشكلة استمرت، تواصل مع الدعم.', 'إضافة موكل');
        return;
      }
      const { error: linkErr } = await db.from('cases').update({ client_id: data.id }).eq('id', createdCaseId);
      if (linkErr) {
        showErrorToast('session_client_link', linkErr, 'تعذّر ربط الموكل بالقضية. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'ربط الموكل بالقضية');
      } else { toast('✅ تمت إضافة الموكل وربطه بالقضية'); setClientStep('done'); onClientAdded?.(); }
    } catch { toast('❌ خطأ غير متوقع', true); }
    finally { setLinkingToCase(false); }
  };

  // ── 2) إضافة الموكل لقائمة الموكلين فقط (من غير ربط) ──
  const handleAddClientOnly = async () => {
    setLinkingClient(true);
    try {
      const name = session.plaintiff?.trim();
      if (!name) return;
      const tenantId = getCurrentTenantId();
      if (!tenantId) { toast('❌ تعذر تحديد المكتب الحالي، أعد تحميل الصفحة وحاول مرة أخرى', true); return; }
      const { error } = await db.from('clients').insert([{
        client_name: name,
        full_name: name,
        tenant_id: tenantId,
        national_id: session.plaintiff_national_id || null,
      }]);
      if (error) {
        showErrorToast('client_create', error, 'تعذّر إضافة الموكل. تحقق من صحة البيانات. لو المشكلة استمرت، تواصل مع الدعم.', 'إضافة موكل');
      } else { toast('✅ تمت إضافة الموكل لقائمة الموكلين'); onClientAdded?.(); }
    } catch { toast('❌ خطأ غير متوقع', true); }
    finally { setLinkingClient(false); }
  };

  // ── 3) [جديد] بحث يدوي في الموكلين الموجودين وربط الجلسة مباشرة بيه ──
  const searchExistingClients = async (term: string) => {
    setClientSearch(term);
    setSelectedExistingClient(null);
    const q = term.trim();
    if (!q) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const { data, error } = await db.from('clients')
        .select('id,full_name,client_name,national_id')
        .is('deleted_at', null)
        .or([ilikeOrClause('client_name', q), ilikeOrClause('full_name', q), ilikeOrClause('national_id', q), ilikeOrClause('phone', q)].join(','))
        .limit(15);
      if (error) {
        showErrorToast('client_search', error, 'تعذّر البحث عن الموكلين. حاول مرة أخرى.', 'بحث الموكلين');
        return;
      }
      setSearchResults((data as ClientSearchResult[]) || []);
    } catch { toast('❌ خطأ غير متوقع أثناء البحث', true); }
    finally { setSearching(false); }
  };

  const confirmLinkToExistingClient = async () => {
    if (!selectedExistingClient) return;
    setLinkingExisting(true);
    try {
      const { error } = await db.from('case_sessions').update({ client_id: selectedExistingClient.id }).eq('id', session.id);
      if (error) {
        showErrorToast('session_client_link', error, 'تعذّر ربط الموكل بالجلسة. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'ربط الموكل بالجلسة');
        return;
      }
      toast('✅ تم ربط الجلسة بالموكل');
      onDone();
      setClientStep('done');
    } catch { toast('❌ خطأ غير متوقع', true); }
    finally { setLinkingExisting(false); }
  };

  return {
    linkingCase, linkingClient, linkingToCase, linkingExisting,
    createdCaseId, clientStep, setClientStep, foundClient,
    clientSearch, searchResults, searching, selectedExistingClient, setSelectedExistingClient,
    handleLinkCase, handleLinkExistingClient, handleAddAndLinkClient, handleAddClientOnly,
    searchExistingClients, confirmLinkToExistingClient,
  };
}
