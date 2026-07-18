import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../../supabaseClient';
import { ilikeOrClause } from '../../lib/sanitize';
import type { Json } from '../../../database.types';

// ── مدة الانتظار قبل ما نبعت الـ query للـ DB (ms) ──
export const DEBOUNCE_MS = 350;
// ── حد أدنى لعدد الحروف قبل ما نبدأ البحث في DB ──
export const MIN_CHARS = 2;
// ── عدد النتائج لكل نوع ──
export const LIMIT = 20;

// شكل نتيجة البحث في القضايا بعد التطبيع المحلي — نفس الحقول اللي بترجع
// فعليًا من الـ .map() على نتيجة select القضايا.
export interface SearchCaseResult {
    id: string;
    title: string;
    number: string;
    court: string;
    type: string;
    status: string;
    date: string;
    client_id: string | null;
    plaintiff: string | null;
    defendant: string | null;
    court_floor: string | null;
    court_hall: string | null;
    session_hall: string | null;
    secretary_hall: string | null;
    secretary_name: string | null;
    court_level: string | null;
    circuit_number: string | null;
    updated_at: string | null;
}

// شكل نتيجة بحث الموكلين — نفس الأعمدة المُختارة فعليًا في
// db.from('clients').select('id,full_name,phone,email,national_id,contact_info,cr_number,notes,type').
// ⚠️ contact_info/cr_number/notes/type اتضافوا هنا عشان يقفلوا فجوة بيانات
// حقيقية: ClientDetailModal.tsx بيقرا الحقول دي فعليًا، وكانت بتبان فاضية
// لو الموكل اتفتح من نتيجة البحث السريع (مش من قائمة الموكلين العادية).
export interface SearchClientResult {
    id: string;
    full_name: string | null;
    phone: string | null;
    email: string | null;
    national_id: string | null;
    contact_info: Json | null;
    cr_number: string | null;
    notes: string | null;
    type: string | null;
}

// شكل نتيجة بحث المستندات — نفس الأعمدة المُختارة فعليًا في
// db.from('case_documents').select('id,case_id,file_name,category,created_at').
// ⚠️ ملحوظة (بدون تغيير سلوك): الكود تحت بيقرا doc.original_name كمحاولة أولى
// قبل doc.file_name، لكن original_name مش من ضمن الأعمدة المُختارة هنا (عمود
// حقيقي في case_documents بس مش داخل الـ select ده تحديدًا) — قيمتها دايمًا
// undefined وقت التشغيل، فبيقع الكود دايمًا على file_name. نفس فصيلة باگ
// next_session/case_type المكتشف قبل كده في ملفات تانية. الحقل هنا optional
// بس عشان يوصف نفس السلوك الحالي من غير أي تغيير.
export interface SearchDocResult {
    id: string;
    case_id: string | null;
    file_name: string | null;
    category: string | null;
    created_at: string | null;
    original_name?: string | null;
}

// شكل نتيجة بحث الجلسات — نفس الأعمدة المُختارة فعليًا في
// db.from('case_sessions').select('id,case_id,session_date,description,result,next_action').
export interface SearchSessionResult {
    id: string;
    case_id: string | null;
    session_date: string | null;
    description: string | null;
    result: string | null;
    next_action: string | null;
}

// شكل نتيجة بحث الملاحظات — نفس الأعمدة المُختارة فعليًا في
// db.from('case_notes').select('id,case_id,content,created_at').
export interface SearchNoteResult {
    id: string;
    case_id: string | null;
    content: string | null;
    created_at: string | null;
}

// شكل عنصر الفلتر السريع (الكل/القضايا/الموكلين/الجلسات/الملاحظات/المستندات)
export interface QuickFilter {
    key: string;
    label: string;
    count: number;
}

// شكل الصف الخام اللي بيرجع من db.from('cases').select(...) (نتيجة البحث
// المباشر في قاعدة البيانات) قبل التطبيع لـ SearchCaseResult.
interface RawCaseSearchRow {
    id: string;
    title: string | null;
    case_number_official: string | null;
    court_name: string | null;
    case_type: string | null;
    plaintiff: string | null;
    defendant: string | null;
    status: string | null;
    client_id: string | null;
    next_hearing: string | null;
    court_floor: string | null;
    court_hall: string | null;
    session_hall: string | null;
    secretary_hall: string | null;
    secretary_name: string | null;
    court_level: string | null;
    circuit_number: string | null;
    updated_at: string | null;
}

export function useUniversalSearch() {
    const [q, setQ]                     = useState('');
    const [dbDocs, setDbDocs]           = useState<SearchDocResult[]>([]);
    const [dbSessions, setDbSessions]   = useState<SearchSessionResult[]>([]);
    const [dbNotes, setDbNotes]         = useState<SearchNoteResult[]>([]);
    const [dbCases, setDbCases]         = useState<SearchCaseResult[]>([]);
    const [dbClients, setDbClients]     = useState<SearchClientResult[]>([]);
    const [searching, setSearching]     = useState(false);
    const [searched, setSearched]       = useState(false); // هل اتعمل search واحد على الأقل؟
    const [viewingDoc, setViewingDoc]   = useState<SearchDocResult | null>(null);
    const [activeFilter, setActiveFilter] = useState('all');
    const inputRef  = useRef<HTMLInputElement>(null);
    const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Focus على الـ input عند الفتح ──
    useEffect(() => { inputRef.current?.focus(); }, []);

    // ── Debounced DB search ──
    useEffect(() => {
        const trimmed = q.trim();

        // مسّح النتائج القديمة لو المستخدم مسح الـ input
        if (trimmed.length < MIN_CHARS) {
            setDbDocs([]);
            setDbSessions([]);
            setDbNotes([]);
            setDbCases([]);
            setDbClients([]);
            setSearched(false);
            setSearching(false);
            if (timerRef.current) clearTimeout(timerRef.current);
            return;
        }

        // ابدأ العداد
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(async () => {
            setSearching(true);
            try {
                const pattern = `%${trimmed}%`;
                const [{ data: docs }, { data: sessions }, { data: notes }, { data: casesRes }, { data: clientsRes }] = await Promise.all([
                    db.from('case_documents')
                        .select('id,case_id,file_name,category,created_at')
                        .ilike('file_name', pattern)
                        .order('created_at', { ascending: false })
                        .limit(LIMIT),
                    db.from('case_sessions')
                        .select('id,case_id,session_date,description,result,next_action')
                        // FIX: فاصلة أو قوس في نص البحث كان بيكسر صياغة فلتر .or()
                        .or([
                            ilikeOrClause('description', trimmed),
                            ilikeOrClause('result', trimmed),
                            ilikeOrClause('next_action', trimmed),
                        ].join(','))
                        .order('session_date', { ascending: false })
                        .limit(LIMIT),
                    db.from('case_notes')
                        .select('id,case_id,content,created_at')
                        .ilike('content', pattern)
                        .order('created_at', { ascending: false })
                        .limit(LIMIT),
                    // البحث في كل القضايا بقاعدة البيانات مباشرة (مش مقيد بالـ 20 سجل المحمّلين في الشاشة)
                    db.from('cases')
                        .select('id,title,case_number_official,court_name,case_type,plaintiff,defendant,status,client_id,next_hearing,court_floor,court_hall,session_hall,secretary_hall,secretary_name,court_level,circuit_number,updated_at')
                        .or([
                            ilikeOrClause('title', trimmed),
                            ilikeOrClause('case_number_official', trimmed),
                            ilikeOrClause('court_name', trimmed),
                            ilikeOrClause('case_type', trimmed),
                            ilikeOrClause('plaintiff', trimmed),
                            ilikeOrClause('defendant', trimmed),
                        ].join(','))
                        .order('created_at', { ascending: false })
                        .limit(LIMIT),
                    // نفس الفكرة للموكلين
                    db.from('clients')
                        .select('id,full_name,phone,email,national_id,contact_info,cr_number,notes,type')
                        .or([
                            ilikeOrClause('full_name', trimmed),
                            ilikeOrClause('phone', trimmed),
                            ilikeOrClause('email', trimmed),
                            ilikeOrClause('national_id', trimmed),
                        ].join(','))
                        .order('created_at', { ascending: false })
                        .limit(LIMIT),
                ]);
                setDbDocs(docs || []);
                setDbSessions(sessions || []);
                setDbNotes(notes || []);
                setDbCases((casesRes || []).map((r: RawCaseSearchRow) => ({
                    id: r.id,
                    title: r.title || '—',
                    number: r.case_number_official || '—',
                    court: r.court_name || '—',
                    type: r.case_type || 'عام',
                    status: r.status || 'نشطة',
                    date: r.next_hearing || '—',
                    client_id: r.client_id,
                    plaintiff: r.plaintiff || null,
                    defendant: r.defendant || null,
                    court_floor: r.court_floor || null,
                    court_hall: r.court_hall || null,
                    session_hall: r.session_hall || null,
                    secretary_hall: r.secretary_hall || null,
                    secretary_name: r.secretary_name || null,
                    court_level: r.court_level || null,
                    circuit_number: r.circuit_number || null,
                    updated_at: r.updated_at || null,
                })));
                setDbClients(clientsRes || []);
                setSearched(true);
            } catch (e) {
                console.error('[Search]', e);
            } finally {
                setSearching(false);
            }
        }, DEBOUNCE_MS);

        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [q]);

    const query = q.trim().toLowerCase();

    // ── فلترة القضايا والموكلين (محلية لأنهم جايين كـ props) ──
    const fmtNum = (num: string) => {
        if (!num) return '';
        const p = num.split('/');
        return p.length === 2 ? `${p[0]} لسنة ${p[1]}` : num;
    };

    const matchedCases = query.length >= MIN_CHARS ? dbCases : [];

    const matchedClients = query.length >= MIN_CHARS ? dbClients : [];

    // ── فلتر النوع ──
    const show = {
        cases:    activeFilter === 'all' || activeFilter === 'cases',
        clients:  activeFilter === 'all' || activeFilter === 'clients',
        sessions: activeFilter === 'all' || activeFilter === 'sessions',
        notes:    activeFilter === 'all' || activeFilter === 'notes',
        docs:     activeFilter === 'all' || activeFilter === 'docs',
    };

    const totalResults =
        (show.cases    ? matchedCases.length    : 0) +
        (show.clients  ? matchedClients.length  : 0) +
        (show.sessions ? dbSessions.length      : 0) +
        (show.notes    ? dbNotes.length         : 0) +
        (show.docs     ? dbDocs.length          : 0);

    const hasResults = totalResults > 0;

    // ── Highlight النص المطابق ──
    const highlight = (text: string) => {
        if (!query || !text) return text;
        const idx = text.toLowerCase().indexOf(query);
        if (idx === -1) return text;
        return React.createElement(React.Fragment, null,
            text.slice(0, idx),
            React.createElement('mark', { className: 'bg-purple-500/30 text-white rounded px-0.5' }, text.slice(idx, idx + query.length)),
            text.slice(idx + query.length)
        );
    };

    return {
        q, setQ,
        dbDocs, dbSessions, dbNotes, dbCases, dbClients,
        searching, searched,
        viewingDoc, setViewingDoc,
        activeFilter, setActiveFilter,
        inputRef,
        query, matchedCases, matchedClients,
        show, totalResults, hasResults,
        highlight, fmtNum,
    };
}
