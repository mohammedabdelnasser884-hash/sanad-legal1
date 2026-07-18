import React, { useState, useCallback } from 'react';
import { db } from '../supabaseClient';
import { recordError, recordSuccess } from '../systemHealth';
import { ilikeOrClause } from '../shared/lib/sanitize';
import type { CaseRow, ClientRow, ProfileRow } from '../types';

// شكل عنصر القضية بعد التطبيع (mapping) في fetchCases/searchCases —
// نفس الحقول اللي كانت بترجع فعليًا من الـ `.map(...)` تحت، من غير أي تغيير.
//
// ⚠️ FIX (14 يوليو 2026): court_floor/court_hall/session_hall/secretary_hall/
// secretary_name/session_time كانوا مش موجودين هنا مع إنهم أعمدة حقيقية موجودة
// في جدول `cases`. الأول أربعة (session_hall/secretary_hall/secretary_name)
// بيتحفظوا صح وقت إنشاء القضية (handleSaveCase) وكان ده باگ فقدان بيانات فعلي:
// EditCaseModal.tsx كان بيقرا caseData.session_hall/secretary_hall/secretary_name
// (دايمًا undefined لأنها مش في النوع القديم)، وعلى الحفظ handleUpdateCase كان
// بيكتبهم null فوق القيم الحقيقية المحفوظة — يعني كل تعديل لقضية (حتى لو تغيير
// بسيط في العنوان) كان بيمسح قاعة/سكرتير الجلسة المحفوظين فعليًا.
// `session_time` مختلف: عمود موجود في السكيما بس مش متكتوب في جدول `cases` أصلاً
// (لا في handleSaveCase ولا handleUpdateCase — القيمة الفعلية بتتخزن على مستوى
// الجلسة في `case_sessions`)، فمفيش فقدان بيانات هنا، بس كان عرض غلط (شاشة
// التعديل كانت دايمًا بترجع لـ "صباحي" الافتراضي بدل القيمة الحقيقية لو موجودة).
// اتصلح الكل بإضافة الحقول هنا وفي الـ .map() تحت.
export interface MappedCase {
    id: string;
    number: string;
    title: string;
    court: string;
    type: string;
    court_level: string | null;
    circuit_number: string | null;
    status: string;
    date: string;
    client_id: string | null;
    plaintiff: string | null;
    defendant: string | null;
    year: number;
    updated_at: string | null;
    court_floor: string | null;
    court_hall: string | null;
    session_hall: string | null;
    secretary_hall: string | null;
    secretary_name: string | null;
    session_time: string | null;
}

// شكل عنصر الموكل بعد التطبيع في fetchClients — كل حقول ClientRow
// زي ما هي، بالإضافة لـ full_name/type اللي بيتم اشتقاقهم من client_name/client_type.
export type MappedClient = ClientRow;

// ── FIX (2.2): بناء خريطة "أقرب جلسة" الصحيحة لكل قضية ──
// ⚠️ قبل الإصلاح ده، كان بيتم الترتيب تنازليًا وأخذ أول ظهور — يعني
// كان بياخد أكبر تاريخ جلسة مسجّل للقضية (أبعد جلسة)، مش أقربها فعليًا.
// لو قضية عندها جلستين مستقبليتين، كان بيعرض الأبعد بدل الأقرب.
//
// المنطق الصحيح: "أقرب جلسة" = أقرب تاريخ من اليوم فصاعدًا (جلسة قادمة).
// لو مفيش جلسات قادمة، بنرجع لآخر جلسة ماضية (أحدث تاريخ) كـ fallback
// للعرض بس، بدل ما نسيب القضية من غير أي تاريخ.
function buildNearestSessionMap(sessionsData: { case_id: string | null; session_date: string | null }[]): { [k: string]: string } {
    const todayStr = new Date().toISOString().slice(0, 10);
    const upcoming: { [k: string]: string } = {};   // أقرب تاريخ >= اليوم
    const latestPast: { [k: string]: string } = {}; // أحدث تاريخ ماضي (fallback)

    (sessionsData || []).forEach((s) => {
        if (!s.session_date || !s.case_id) return;
        const caseId = s.case_id;
        const sessionDate = s.session_date;
        if (sessionDate >= todayStr) {
            if (!upcoming[caseId] || sessionDate < upcoming[caseId]) {
                upcoming[caseId] = sessionDate;
            }
        } else {
            if (!latestPast[caseId] || sessionDate > latestPast[caseId]) {
                latestPast[caseId] = sessionDate;
            }
        }
    });

    const merged: { [k: string]: string } = { ...latestPast, ...upcoming }; // القادمة لها أولوية لو موجودة
    return merged;
}

export function useAppData(profile: ProfileRow | null) {
    const isAdmin = profile?.role === 'admin';
    const PAGE_SIZE = 15;

    // ── State ──────────────────────────────────────────────
    const [cases,        setCases]        = useState<MappedCase[]>([]);
    const [clients,      setClients]      = useState<MappedClient[]>([]);
    const [lawyers,      setLawyers]      = useState<ProfileRow[]>([]);

    const [casesFilter,  setCasesFilter]  = useState('نشطة');
    const [casesPage,    setCasesPage]    = useState(0);
    const [casesTotal,   setCasesTotal]   = useState(0);
    const [casesLoading, setCasesLoading] = useState(false);
    const [dbError,      setDbError]      = useState<string|null>(null);
    const [casesSearch,  setCasesSearch]  = useState('');

    const [clientsPage,    setClientsPage]    = useState(0);
    const [clientsTotal,   setClientsTotal]   = useState(0);
    const [clientsLoading, setClientsLoading] = useState(false);

    // ── fetchCases ──────────────────────────────────────────
    const fetchCases = useCallback(async (page = 0, filter = casesFilter) => {
        if (!profile) return;
        setCasesLoading(true);
        setDbError(null);

        const from = page * PAGE_SIZE;
        const to   = from + PAGE_SIZE - 1;

        const { data, error, count } = await db
            .from('cases')
            .select('*', { count: 'exact' })
            .eq('status', filter)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) {
            setDbError('فشل تحميل القضايا — تحقق من الاتصال وأعد المحاولة');
            setCasesLoading(false);
            recordError('db_cases', error.message);
            return;
        }

        // جلب أقرب جلسة للقضايا المحملة فقط
        const caseIds = (data || []).map((r: CaseRow) => r.id);
        let sessionsMap: { [k: string]: string } = {};
        if (caseIds.length > 0) {
            const { data: sessionsData, error: sessErr } = await db
                .from('case_sessions')
                .select('case_id,session_date')
                .in('case_id', caseIds);

            if (sessErr) {
                recordError('db_sessions', sessErr.message);
            } else {
                sessionsMap = buildNearestSessionMap(sessionsData || []);
                recordSuccess('db_sessions');
            }
        }

        const mapped: MappedCase[] = (data || []).map((r: CaseRow) => ({
            id:             r.id,
            number:         r.case_number_official || '—',
            title:          r.title || '—',
            court:          r.court_name || '—',
            type:           r.case_type || 'عام',
            court_level:    r.court_level || null,
            circuit_number: r.circuit_number || null,
            status:         r.status || 'نشطة',
            date:           sessionsMap[r.id] || r.next_hearing || '—',
            client_id:      r.client_id,
            plaintiff:      r.plaintiff || null,
            defendant:      r.defendant || null,
            year:           r.created_at ? new Date(r.created_at).getFullYear() : new Date().getFullYear(),
            updated_at:     r.updated_at || null,  // BUG-19: محتاجينه لـ knownUpdatedAt في handleUpdateCase
            court_floor:    r.court_floor || null,
            court_hall:     r.court_hall || null,
            session_hall:   r.session_hall || null,
            secretary_hall: r.secretary_hall || null,
            secretary_name: r.secretary_name || null,
            session_time:   r.session_time || null,
        }));

        if (page === 0) setCases(mapped);
        else setCases((prev: MappedCase[]) => [...prev, ...mapped]);

        setCasesTotal(count || 0);
        setCasesPage(page);
        recordSuccess('db_cases');
        setCasesLoading(false);
    }, [profile, casesFilter]);

    // ── searchCases (بحث داخل قسم القضايا كله — مش مقيد بتاب) ──
    const searchCases = useCallback(async (term: string, filter = casesFilter) => {
        if (!profile) return;
        if (!term.trim()) {
            // عند مسح البحث، ارجع للـ listing العادي
            fetchCases(0, filter);
            return;
        }
        setCasesLoading(true);
        setDbError(null);

        const q = term.trim();

        // البحث في: عنوان الدعوى، رقم الدعوى، المدعي، المدعى عليه، موضوع الدعوى — في كل الحالات
        // FIX: فاصلة أو قوس في نص البحث كان بيكسر صياغة فلتر .or()
        const { data, error, count } = await db
            .from('cases')
            .select('*', { count: 'exact' })
            .is('deleted_at', null)
            .or([
                ilikeOrClause('title', q),
                ilikeOrClause('case_number_official', q),
                ilikeOrClause('plaintiff', q),
                ilikeOrClause('defendant', q),
            ].join(','))
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            setDbError('فشل البحث في القضايا — تحقق من الاتصال وأعد المحاولة');
            setCasesLoading(false);
            recordError('db_cases_search', error.message);
            return;
        }

        // جلب جلسات للنتائج
        const caseIds = (data || []).map((r: CaseRow) => r.id);
        let sessionsMap: { [k: string]: string } = {};
        if (caseIds.length > 0) {
            const { data: sessionsData } = await db
                .from('case_sessions')
                .select('case_id,session_date')
                .in('case_id', caseIds);
            sessionsMap = buildNearestSessionMap(sessionsData || []);
        }

        const mapped: MappedCase[] = (data || []).map((r: CaseRow) => ({
            id:             r.id,
            number:         r.case_number_official || '—',
            title:          r.title || '—',
            court:          r.court_name || '—',
            type:           r.case_type || 'عام',
            court_level:    r.court_level || null,
            circuit_number: r.circuit_number || null,
            status:         r.status || 'نشطة',
            date:           sessionsMap[r.id] || r.next_hearing || '—',
            client_id:      r.client_id,
            plaintiff:      r.plaintiff || null,
            defendant:      r.defendant || null,
            year:           r.created_at ? new Date(r.created_at).getFullYear() : new Date().getFullYear(),
            updated_at:     r.updated_at || null,
            court_floor:    r.court_floor || null,
            court_hall:     r.court_hall || null,
            session_hall:   r.session_hall || null,
            secretary_hall: r.secretary_hall || null,
            secretary_name: r.secretary_name || null,
            session_time:   r.session_time || null,
        }));

        setCases(mapped);
        setCasesTotal(count || 0);
        setCasesPage(0);
        recordSuccess('db_cases_search');
        setCasesLoading(false);
    }, [profile, casesFilter, fetchCases]);

    const fetchLawyers = useCallback(async () => {
        if (!isAdmin) return;
        const { data } = await db
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: true });
        setLawyers(data || []);
    }, [isAdmin]);

    // ── fetchClients ────────────────────────────────────────
    const fetchClients = useCallback(async (page = 0, search = '') => {
        if (!profile) return;
        setClientsLoading(true);

        const from = page * PAGE_SIZE;
        const to   = from + PAGE_SIZE - 1;

        let query = db
            .from('clients')
            .select('*', { count: 'exact' })
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (search.trim()) {
            const s = search.trim();
            // FIX: فاصلة أو قوس في نص البحث كان بيكسر صياغة فلتر .or()
            query = query.or([
                ilikeOrClause('client_name', s),
                ilikeOrClause('phone', s),
                ilikeOrClause('national_id', s),
            ].join(','));
        }

        const { data, error, count } = await query;

        if (error) {
            recordError('db_clients', error.message);
        } else {
            const mapped: MappedClient[] = (data || []).map((c: ClientRow) => ({
                ...c,
                full_name: c.client_name || '—',
                type: c.client_type || 'individual',
            }));
            if (page === 0) setClients(mapped);
            else setClients((prev: MappedClient[]) => [...prev, ...mapped]);
            setClientsTotal(count || 0);
            setClientsPage(page);
            recordSuccess('db_clients');
        }
        setClientsLoading(false);
    }, [profile]);

    return {
        cases,       setCases,
        casesFilter, setCasesFilter,
        casesPage,   setCasesPage,   casesTotal,   casesLoading,
        casesSearch, setCasesSearch,
        dbError,
        clients,     setClients,
        clientsPage, setClientsPage, clientsTotal, clientsLoading,
        lawyers,     setLawyers,
        fetchCases,  fetchLawyers,   fetchClients,  searchCases,
    };
}
