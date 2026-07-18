import { useState, useCallback } from 'react';
import { db } from '../../../../supabaseClient';
import { toast } from '../../../../shared/lib/notifications';
import { logActivity } from '../../../../shared/lib/dataAccess';
import { ilikeOrClause } from '../../../../shared/lib/sanitize';
import type { CaseRow, ClientRow, CaseFeeRow, ProfileRow } from '../../../../types';

// ⚠️ هوك مستقل بذاته (نفس فلسفة useAdminBackup/useAdminActivity) — AdminPanel
// مابياخدش cases كـ prop من App.tsx أصلاً (بيتاخد بس lawyers/clients)، فمفيش
// طريقة نعيد استخدام useCaseActions() هنا حرفيًا (بتطلب params كتير مرتبطة
// بشاشات القضايا الرئيسية زي setSelectedCase/nav/casesFilter مش موجودة هنا).
// القرار (متسق مع "هنعيد استخدامها أو ننقل نفس المنطق هنا" فى الخطة): نفس
// منطق handleRestoreCase/handlePermanentDeleteCase من useCaseActions.ts
// بالحرف، لكن بحالة (state) وجلب بيانات خاصة بشاشة الأرشيف فقط.

export const ARCHIVE_PAGE_SIZE = 20;

export function useAdminArchive(clients: ClientRow[], profile?: ProfileRow | null) {
    const _userName = profile?.full_name || null;

    const [archivedCases, setArchivedCases] = useState<CaseRow[]>([]);
    const [archivedCasesTotal, setArchivedCasesTotal] = useState(0);
    const [loadingArchivedCases, setLoadingArchivedCases] = useState(false);
    const [archivedCasesPage, setArchivedCasesPage] = useState(0);
    const [archivedCasesSearch, setArchivedCasesSearch] = useState('');
    const [restoringCaseId, setRestoringCaseId] = useState<string | null>(null);
    const [confirmDeleteCase, setConfirmDeleteCase] = useState<CaseRow | null>(null);
    const [deletingCase, setDeletingCase] = useState(false);

    // ─ جلب القضايا المؤرشفة (deleted_at != null) مع بحث وترقيم صفحات ─
    const fetchArchivedCases = useCallback(async (page = archivedCasesPage, search = archivedCasesSearch) => {
        setLoadingArchivedCases(true);
        try {
            let q = db.from('cases').select('*', { count: 'exact' }).not('deleted_at', 'is', null);

            if (search?.trim()) {
                const s = search.trim();
                q = q.or([
                    ilikeOrClause('title', s),
                    ilikeOrClause('case_number_official', s),
                ].join(','));
            }

            const from = page * ARCHIVE_PAGE_SIZE;
            q = q.order('deleted_at', { ascending: false }).range(from, from + ARCHIVE_PAGE_SIZE - 1);

            const { data, count } = await q;
            if (data) setArchivedCases(data);
            if (count !== null && count !== undefined) setArchivedCasesTotal(count);
        } catch (e) {
            // فشل جلب صامت (زي نمط useAdminActivity) — الشاشة هتفضل فاضية بدل ما تكسر الأبلكيشن
        }
        setLoadingArchivedCases(false);
    }, [archivedCasesPage, archivedCasesSearch]);

    // ─ استرجاع قضية من الأرشيف (نفس منطق handleRestoreCase فى useCaseActions.ts بالحرف) ─
    const handleRestoreCase = async (caseId: string) => {
        setRestoringCaseId(caseId);
        const { error } = await db.from('cases').update({ deleted_at: null }).eq('id', caseId);
        setRestoringCaseId(null);
        if (error) { toast('❌ فشل استرجاع القضية — تحقق من الاتصال وأعد المحاولة', true); return; }
        toast('✅ تم استرجاع القضية — قد تحتاج لتحديث الصفحة لرؤيتها في القوائم الأخرى');
        logActivity(db, 'استرجاع قضية من الأرشيف', { userName: _userName, entity_type: 'case', entity_id: caseId });
        setArchivedCases((prev) => prev.filter((c) => c.id !== caseId));
        setArchivedCasesTotal((prev) => Math.max(0, prev - 1));
    };

    // ─ حذف قضية نهائيًا من الأرشيف (نفس منطق handlePermanentDeleteCase فى useCaseActions.ts بالحرف —
    //   تنضيف ملفات Storage الأول، بعدين حذف الصف، والداتابيز بتكمل الباقي تلقائيًا CASCADE/SET NULL) ─
    const handlePermanentDeleteCase = async (caseId: string) => {
        const c = archivedCases.find((x) => x.id === caseId);
        setDeletingCase(true);

        const { data: docs, error: docsFetchError } = await db.from('case_documents')
            .select('storage_path').eq('case_id', caseId);
        if (docsFetchError) {
            setDeletingCase(false);
            toast('❌ فشل التحقق من مستندات القضية — تحقق من الاتصال وأعد المحاولة', true);
            return;
        }
        const paths = (docs || []).map((d) => d.storage_path).filter((p): p is string => !!p);
        if (paths.length > 0) {
            const { error: storageErr } = await db.storage.from('case-docs').remove(paths);
            if (storageErr) toast('⚠️ تعذّر حذف بعض ملفات المستندات من التخزين — راجع bucket المستندات يدويًا', true);
        }

        const { error } = await db.from('cases').delete().eq('id', caseId);
        setDeletingCase(false);
        setConfirmDeleteCase(null);
        if (error) { toast('❌ فشل حذف القضية نهائياً — تحقق من الاتصال وأعد المحاولة', true); return; }
        toast('🗑️ تم حذف القضية نهائياً');
        logActivity(db, 'حذف قضية نهائياً', {
            userName: _userName,
            entity_type: 'case', entity_id: caseId, details: c?.title || null,
            case_name: c?.title || null,
            case_type: c?.case_type || null,
            client_name: clients.find((cl) => cl.id === c?.client_id)?.full_name || null,
        });
        setArchivedCases((prev) => prev.filter((cs) => cs.id !== caseId));
        setArchivedCasesTotal((prev) => Math.max(0, prev - 1));
    };

    // ══════════════════════════════════════════════════════════════
    //  المرحلة 4 — الموكلين
    // ══════════════════════════════════════════════════════════════
    const [archivedClients, setArchivedClients] = useState<ClientRow[]>([]);
    const [archivedClientsTotal, setArchivedClientsTotal] = useState(0);
    const [loadingArchivedClients, setLoadingArchivedClients] = useState(false);
    const [archivedClientsPage, setArchivedClientsPage] = useState(0);
    const [archivedClientsSearch, setArchivedClientsSearch] = useState('');
    const [restoringClientId, setRestoringClientId] = useState<string | null>(null);
    const [confirmDeleteClient, setConfirmDeleteClient] = useState<ClientRow | null>(null);
    const [deletingClient, setDeletingClient] = useState(false);

    // ─ جلب الموكلين المؤرشفين (deleted_at != null) مع بحث وترقيم صفحات ─
    const fetchArchivedClients = useCallback(async (page = archivedClientsPage, search = archivedClientsSearch) => {
        setLoadingArchivedClients(true);
        try {
            let q = db.from('clients').select('*', { count: 'exact' }).not('deleted_at', 'is', null);

            if (search?.trim()) {
                const s = search.trim();
                q = q.or([
                    ilikeOrClause('full_name', s),
                    ilikeOrClause('client_name', s),
                ].join(','));
            }

            const from = page * ARCHIVE_PAGE_SIZE;
            q = q.order('deleted_at', { ascending: false }).range(from, from + ARCHIVE_PAGE_SIZE - 1);

            const { data, count } = await q;
            if (data) setArchivedClients(data);
            if (count !== null && count !== undefined) setArchivedClientsTotal(count);
        } catch (e) {
            // فشل جلب صامت (نفس نمط fetchArchivedCases)
        }
        setLoadingArchivedClients(false);
    }, [archivedClientsPage, archivedClientsSearch]);

    // ─ استرجاع موكل من الأرشيف (نفس منطق handleRestoreClient فى useClientActions.ts بالحرف) ─
    const handleRestoreClient = async (clientId: string) => {
        setRestoringClientId(clientId);
        const { error } = await db.from('clients').update({ deleted_at: null }).eq('id', clientId);
        setRestoringClientId(null);
        if (error) { toast('❌ فشل استرجاع الموكل — تحقق من الاتصال وأعد المحاولة', true); return; }
        toast('✅ تم استرجاع الموكل — قد تحتاج لتحديث الصفحة لرؤيته في القوائم الأخرى');
        logActivity(db, 'استرجاع موكل من الأرشيف', { userName: _userName, entity_type: 'client', entity_id: clientId });
        setArchivedClients((prev) => prev.filter((c) => c.id !== clientId));
        setArchivedClientsTotal((prev) => Math.max(0, prev - 1));
    };

    // ─ حذف موكل نهائيًا من الأرشيف (نفس منطق handlePermanentDeleteClient فى useClientActions.ts بالحرف —
    //   القرار المحسوم: حذف صف الموكل بس، الباقي (قضايا/أتعاب SET NULL، بوابة الموكل CASCADE) بيتغطى تلقائيًا بالـ FK) ─
    const handlePermanentDeleteClient = async (clientId: string) => {
        const cl = archivedClients.find((x) => x.id === clientId);
        setDeletingClient(true);
        const { error } = await db.from('clients').delete().eq('id', clientId);
        setDeletingClient(false);
        setConfirmDeleteClient(null);
        if (error) { toast('❌ فشل حذف الموكل نهائياً — تحقق من الاتصال وأعد المحاولة', true); return; }
        toast('🗑️ تم حذف الموكل نهائياً');
        logActivity(db, 'حذف موكل نهائياً', {
            userName: _userName,
            entity_type: 'client', entity_id: clientId,
            details: cl?.full_name || cl?.client_name || null,
            client_name: cl?.full_name || cl?.client_name || null,
        });
        setArchivedClients((prev) => prev.filter((c) => c.id !== clientId));
        setArchivedClientsTotal((prev) => Math.max(0, prev - 1));
    };

    // ══════════════════════════════════════════════════════════════
    //  المرحلة 4 — الأتعاب
    // ══════════════════════════════════════════════════════════════
    const [archivedFees, setArchivedFees] = useState<CaseFeeRow[]>([]);
    const [archivedFeesTotal, setArchivedFeesTotal] = useState(0);
    const [loadingArchivedFees, setLoadingArchivedFees] = useState(false);
    const [archivedFeesPage, setArchivedFeesPage] = useState(0);
    const [archivedFeesSearch, setArchivedFeesSearch] = useState('');
    const [restoringFeeId, setRestoringFeeId] = useState<string | null>(null);
    const [confirmDeleteFee, setConfirmDeleteFee] = useState<CaseFeeRow | null>(null);
    const [deletingFee, setDeletingFee] = useState(false);

    // ─ جلب الأتعاب المؤرشفة (deleted_at != null) مع بحث وترقيم صفحات ─
    const fetchArchivedFees = useCallback(async (page = archivedFeesPage, search = archivedFeesSearch) => {
        setLoadingArchivedFees(true);
        try {
            let q = db.from('case_fees').select('*', { count: 'exact' }).not('deleted_at', 'is', null);

            if (search?.trim()) {
                const s = search.trim();
                q = q.or([
                    ilikeOrClause('client_name', s),
                    ilikeOrClause('case_title', s),
                ].join(','));
            }

            const from = page * ARCHIVE_PAGE_SIZE;
            q = q.order('deleted_at', { ascending: false }).range(from, from + ARCHIVE_PAGE_SIZE - 1);

            const { data, count } = await q;
            if (data) setArchivedFees(data);
            if (count !== null && count !== undefined) setArchivedFeesTotal(count);
        } catch (e) {
            // فشل جلب صامت (نفس نمط fetchArchivedCases)
        }
        setLoadingArchivedFees(false);
    }, [archivedFeesPage, archivedFeesSearch]);

    // ─ استرجاع سجل أتعاب من الأرشيف (نفس منطق handleRestoreFee فى useFeesActions.ts بالحرف) ─
    const handleRestoreFee = async (feeId: string) => {
        setRestoringFeeId(feeId);
        const { error } = await db.from('case_fees').update({ deleted_at: null }).eq('id', feeId);
        setRestoringFeeId(null);
        if (error) { toast('❌ فشل استرجاع الأتعاب — تحقق من الاتصال وأعد المحاولة', true); return; }
        toast('✅ تم استرجاع الأتعاب — قد تحتاج لتحديث الصفحة لرؤيتها في القوائم الأخرى');
        logActivity(db, 'استرجاع أتعاب من الأرشيف', { userName: _userName, entity_type: 'fee', entity_id: feeId });
        setArchivedFees((prev) => prev.filter((f) => f.id !== feeId));
        setArchivedFeesTotal((prev) => Math.max(0, prev - 1));
    };

    // ─ حذف سجل أتعاب نهائيًا من الأرشيف (نفس منطق handlePermanentDeleteFee فى useFeesActions.ts بالحرف —
    //   fee_payments بتتحذف تلقائيًا CASCADE، invoices بتتصفّر SET NULL، مفيش كود يدوي مطلوب) ─
    const handlePermanentDeleteFee = async (feeId: string) => {
        const f = archivedFees.find((x) => x.id === feeId);
        setDeletingFee(true);
        const { error } = await db.from('case_fees').delete().eq('id', feeId);
        setDeletingFee(false);
        setConfirmDeleteFee(null);
        if (error) { toast('❌ فشل حذف الأتعاب نهائياً — تحقق من الاتصال وأعد المحاولة', true); return; }
        toast('🗑️ تم حذف الأتعاب نهائياً');
        logActivity(db, 'حذف أتعاب نهائياً', {
            userName: _userName,
            entity_type: 'fee', entity_id: feeId,
            client_name: f?.client_name || null,
            case_name: f?.case_title || null,
        });
        setArchivedFees((prev) => prev.filter((x) => x.id !== feeId));
        setArchivedFeesTotal((prev) => Math.max(0, prev - 1));
    };

    return {
        archivedCases, archivedCasesTotal, loadingArchivedCases,
        archivedCasesPage, setArchivedCasesPage,
        archivedCasesSearch, setArchivedCasesSearch,
        restoringCaseId, confirmDeleteCase, setConfirmDeleteCase, deletingCase,
        fetchArchivedCases, handleRestoreCase, handlePermanentDeleteCase,

        archivedClients, archivedClientsTotal, loadingArchivedClients,
        archivedClientsPage, setArchivedClientsPage,
        archivedClientsSearch, setArchivedClientsSearch,
        restoringClientId, confirmDeleteClient, setConfirmDeleteClient, deletingClient,
        fetchArchivedClients, handleRestoreClient, handlePermanentDeleteClient,

        archivedFees, archivedFeesTotal, loadingArchivedFees,
        archivedFeesPage, setArchivedFeesPage,
        archivedFeesSearch, setArchivedFeesSearch,
        restoringFeeId, confirmDeleteFee, setConfirmDeleteFee, deletingFee,
        fetchArchivedFees, handleRestoreFee, handlePermanentDeleteFee,
    };
}
