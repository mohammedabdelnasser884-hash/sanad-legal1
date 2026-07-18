import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from '../../../shared/lib/notifications';
import { safeUpdate, logActivity } from '../../../shared/lib/dataAccess';
import { recordError, recordSuccess } from '../../../systemHealth';
import { db } from '../../../supabaseClient';
import type { ReminderRow, ProfileRow } from '../../../types';

export interface ReminderForm {
    title: string;
    due_date: string;
    notes: string;
}

// شكل عنصر الـ pill selector (تاب قادمة/متأخرة/منجزة) — hasMore/loadMore
// اختياريين لأن تاب "قادمة" مش paginated فمفيهوش زرار تحميل مزيد أصلاً.
export interface PillSection {
    key: string;
    label: string;
    emoji: string;
    data: ReminderRow[];
    total: number;
    paginated: boolean;
    hasMore?: boolean;
    loadMore?: () => void;
    activeBg: string;
    activeText: string;
    countBg: string;
    emptyMsg: string;
    emptyNote: string;
    emptyEmoji: string;
}

export function useRemindersTab(initialFilter?: string | null, profile: ProfileRow | null = null) {
    const _userName = profile?.full_name || null;
    const [reminders, setReminders] = useState<ReminderRow[]>([]);
    const [loading, setLoading]     = useState(true);
    const [showForm, setShowForm]   = useState(false);
    const [form, setForm]           = useState<ReminderForm>({title:'', due_date:'', notes:''});
    const [saving, setSaving]       = useState(false);
    const [editTarget, setEditTarget]   = useState<ReminderRow | null>(null);
    const [editForm, setEditForm]       = useState<ReminderForm>({title:'', due_date:'', notes:''});
    const [editSaving, setEditSaving]   = useState(false);
    const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<ReminderRow | null>(null);  // BUG-15 FIX
    const [viewTarget, setViewTarget] = useState<ReminderRow | null>(null);

    const PAGE_SIZE = 15;

    // ── state للـ pagination ──
    const [overdueList,   setOverdueList]   = useState<ReminderRow[]>([]);
    const [overdueTotal,  setOverdueTotal]  = useState(0);
    const [overduePage,   setOverduePage]   = useState(0);
    const [overdueMore,   setOverdueMore]   = useState(false);

    const [doneList,      setDoneList]      = useState<ReminderRow[]>([]);
    const [doneTotal,     setDoneTotal]     = useState(0);
    const [donePage,      setDonePage]      = useState(0);
    const [doneMore,      setDoneMore]      = useState(false);

    // ── جلب القادمة (كلها دفعة واحدة) ──
    const fetchUpcoming = useCallback(async () => {
        const today = new Date();
        const todayStr = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
        const {data, error} = await db.from('reminders')
            .select('*')
            .eq('done', false)
            .gte('due_date', todayStr)
            .order('due_date', {ascending: true});
        if(error){ recordError('db_reminders', error.message); }
        else { recordSuccess('db_reminders'); }
        return data || [];
    }, []);

    // ── جلب المتأخرة (paginated) ──
    const fetchOverdue = useCallback(async (page = 0, append = false) => {
        const today = new Date();
        const todayStr = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
        const from = page * PAGE_SIZE;
        const to   = from + PAGE_SIZE - 1;
        const {data, error, count} = await db.from('reminders')
            .select('*', {count: 'exact'})
            .eq('done', false)
            .lt('due_date', todayStr)
            .order('due_date', {ascending: false})
            .range(from, to);
        if(error){ recordError('db_reminders', error.message); return; }
        const list = data || [];
        if(append) setOverdueList((prev) => [...prev, ...list]);
        else setOverdueList(list);
        setOverdueTotal(count || 0);
        setOverduePage(page);
        setOverdueMore((page + 1) * PAGE_SIZE < (count || 0));
    }, []);

    // ── جلب المنجزة (paginated) ──
    const fetchDone = useCallback(async (page = 0, append = false) => {
        const from = page * PAGE_SIZE;
        const to   = from + PAGE_SIZE - 1;
        const {data, error, count} = await db.from('reminders')
            .select('*', {count: 'exact'})
            .eq('done', true)
            .order('due_date', {ascending: false})
            .range(from, to);
        if(error){ recordError('db_reminders', error.message); return; }
        const list = data || [];
        if(append) setDoneList((prev) => [...prev, ...list]);
        else setDoneList(list);
        setDoneTotal(count || 0);
        setDonePage(page);
        setDoneMore((page + 1) * PAGE_SIZE < (count || 0));
    }, []);

    // ── جلب كل البيانات عند الفتح ──
    const fetchReminders = useCallback(async () => {
        setLoading(true);
        const [upcomingData] = await Promise.all([
            fetchUpcoming(),
            fetchOverdue(0, false),
            fetchDone(0, false),
        ]);
        setReminders(upcomingData);
        setLoading(false);
    }, [fetchUpcoming, fetchOverdue, fetchDone]);

    useEffect(()=>{ if(profile) fetchReminders(); },[fetchReminders, profile]);

    const handleSave = async () => {
        if(!form.title||!form.due_date){ toast('يرجى إدخال العنوان والتاريخ',true); return; }
        // ⚠️ BUG FIX: عمود tenant_id في جدول reminders من غير DEFAULT في قاعدة
        // البيانات، وسياسة RLS (tenant_scoped_reminders) بتشترط
        // tenant_id = current_tenant_id() حتى على الإضافة (WITH CHECK). من غير
        // السطر ده، أي مستخدم عادي (مش super admin) كان الـ insert بيترفض بصمت
        // من RLS، ويشوف رسالة خطأ عامة من غير ما يعرف السبب الحقيقي.
        const tenantId = profile?.tenant_id ?? null;
        if(!tenantId){ toast('❌ تعذر تحديد المكتب الحالي، أعد تسجيل الدخول وحاول مرة أخرى', true); return; }
        setSaving(true);
        const {error} = await db.from('reminders').insert([{
            title: form.title.trim(),
            due_date: form.due_date,
            notes: form.notes||null,
            done: false,
            tenant_id: tenantId
        }]);
        setSaving(false);
        if(error){
            recordError('reminder_save', error.message, {label:'حفظ التذكيرات', message:'تعذّر حفظ التذكير. تحقق من الاتصال بالإنترنت.'});
            toast('❌ حدث خطأ، يرجى المحاولة مرة أخرى', true);
            return;
        }
        toast('✅ تم إضافة التذكير');
        logActivity(db, 'إضافة تذكير', { userName: _userName, entity_type: 'reminder', details: form.title.trim() });
        setShowForm(false); setForm({title:'',due_date:'',notes:''});
        fetchReminders(); // refresh كل الأقسام
    };

    const handleToggleDone = async (r: ReminderRow) => {
        const nowISO = new Date().toISOString();
        const update = r.done
            ? { done: false,  completed_at: null }
            : { done: true,   completed_at: nowISO };
        const {success, error} = await safeUpdate(db, 'reminders', r.id, update, r.updated_at || null);
        if(!success){
            recordError('reminder_save', error?.message, {label:'حفظ التذكيرات', message:'تعذّر تحديث التذكير. تحقق من الاتصال بالإنترنت.'});
            toast('❌ تعذّر تحديث التذكير',true);
            return;
        }
        toast(r.done ? '↩️ تم إلغاء الإنجاز' : '✅ تم تسجيل الإنجاز');
        fetchReminders();
    };

    const handleDelete = async (id: string) => {
        const {error} = await db.from('reminders').delete().eq('id',id);
        if(error){
            recordError('reminder_save', error.message, {label:'حذف التذكيرات', message:'تعذّر حذف التذكير. تحقق من الاتصال بالإنترنت.'});
            toast('❌ تعذّر حذف التذكير',true);
            return;
        }
        toast('🗑 تم حذف التذكير');
        logActivity(db, 'حذف تذكير', { userName: _userName, entity_type: 'reminder', entity_id: id });
        fetchReminders();
    };

    const handleEdit = async () => {
        if(!editForm.title||!editForm.due_date){ toast('يرجى إدخال العنوان والتاريخ',true); return; }
        setEditSaving(true);
        // editTarget مضمون موجود هنا وقت التشغيل — الدالة دي بتتنفذ بس من زر
        // الحفظ جوه EditReminderModal، اللي أصلاً مبيتعرضش غير لما editTarget موجود.
        const { success, conflict } = await safeUpdate(db, 'reminders', editTarget!.id, {
            title: editForm.title.trim(),
            due_date: editForm.due_date,
            notes: editForm.notes||null,
        }, editTarget!.updated_at || null);
        setEditSaving(false);
        if(conflict) return;
        if(!success){
            recordError('reminder_save', '', {label:'حفظ التذكيرات', message:'تعذّر تعديل المهمة. تحقق من الاتصال بالإنترنت.'});
            toast('❌ حدث خطأ، يرجى المحاولة مرة أخرى', true);
            return;
        }
        toast('✅ تم تعديل المهمة');
        logActivity(db, 'تعديل تذكير', { userName: _userName, entity_type: 'reminder', entity_id: editTarget?.id, details: editForm.title.trim() });
        setEditTarget(null);
        fetchReminders();
    };

    const today = new Date();
    const todayStr = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');

    // القادمة: من reminders state (محملة كلها)
    const upcoming = reminders;

    const [filter, setFilter] = useState(initialFilter || 'upcoming');

    // ── بحث server-side ──
    const [searchOpen,  setSearchOpen]  = useState(false);
    const [searchTerm,  setSearchTerm]  = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);

    // نتائج البحث (تظهر بدل العرض العادي لما فيه search term)
    const [searchResults,      setSearchResults]      = useState<ReminderRow[]>([]);
    const [searchLoading,      setSearchLoading]      = useState(false);

    const handleSearchOpen = () => {
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
    };
    const handleSearchClear = () => {
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        latestSearchTermRef.current = '';
        setSearchTerm('');
        setSearchResults([]);
        setSearchOpen(false);
    };

    // ── بحث في الـ DB على كل التابات ──
    // BUG-10 FIX: استعلامين ilike منفصلين بدل .or() عشان فاصلة أو قوس في نص
    // البحث ماتكسرش صياغة فلتر PostgREST. بندمج النتيجتين ونشيل المكرر بالـ id.
    const latestSearchTermRef = useRef('');
    const searchReminders = useCallback(async (term: string) => {
        const s = term.trim();
        if (!s) { setSearchResults([]); return; }
        setSearchLoading(true);
        const [titleRes, notesRes] = await Promise.all([
            db.from('reminders').select('*').ilike('title', `%${s}%`).order('due_date', {ascending:false}).limit(50),
            db.from('reminders').select('*').ilike('notes', `%${s}%`).order('due_date', {ascending:false}).limit(50),
        ]);
        // نتيجة قديمة وصلت بعد ما المستخدم غيّر نص البحث تاني — نتجاهلها
        if (latestSearchTermRef.current !== term) return;
        if (titleRes.error) recordError('db_reminders_search', titleRes.error.message);
        if (notesRes.error) recordError('db_reminders_search', notesRes.error.message);
        const merged = [...(titleRes.data||[]), ...(notesRes.data||[])];
        const seen = new Set<string>();
        const deduped = merged.filter((r: ReminderRow) => {
            if (seen.has(r.id)) return false;
            seen.add(r.id);
            return true;
        });
        deduped.sort((a: ReminderRow,b: ReminderRow) => (b.due_date||'').localeCompare(a.due_date||''));
        setSearchResults(deduped.slice(0, 50));
        setSearchLoading(false);
    }, []);

    // BUG-08 FIX: debounce 300ms بدل ما نبعت طلب لقاعدة البيانات مع كل حرف
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
    }, []);

    const handleSearchChange = (val: string) => {
        setSearchTerm(val);
        latestSearchTermRef.current = val;
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        if (!val.trim()) { setSearchResults([]); setSearchLoading(false); return; }
        searchDebounceRef.current = setTimeout(() => { searchReminders(val); }, 300);
    };

    const pillSections: PillSection[] = [
        {
            key: 'upcoming',
            label: 'قادمة',
            emoji: '📅',
            data: upcoming,
            total: upcoming.length,
            paginated: false,
            activeBg: 'bg-blue-500/20 border-blue-500/40',
            activeText: 'text-blue-300',
            countBg: 'bg-blue-500/30 text-blue-200',
            emptyMsg: 'لا توجد مهام قادمة',
            emptyNote: 'المهام التي لم يحن موعدها بعد ستظهر هنا',
            emptyEmoji: '📅',
        },
        {
            key: 'overdue',
            label: 'متأخرة',
            emoji: '⚠️',
            data: overdueList,
            total: overdueTotal,
            hasMore: overdueMore,
            loadMore: () => fetchOverdue(overduePage + 1, true),
            paginated: true,
            activeBg: 'bg-rose-500/20 border-rose-500/40',
            activeText: 'text-rose-300',
            countBg: 'bg-rose-500/30 text-rose-200',
            emptyMsg: 'لا توجد مهام متأخرة',
            emptyNote: 'أنت في الموعد — استمر هكذا!',
            emptyEmoji: '🎯',
        },
        {
            key: 'done',
            label: 'منجزة',
            emoji: '✅',
            data: doneList,
            total: doneTotal,
            hasMore: doneMore,
            loadMore: () => fetchDone(donePage + 1, true),
            paginated: true,
            activeBg: 'bg-emerald-500/20 border-emerald-500/40',
            activeText: 'text-emerald-300',
            countBg: 'bg-emerald-500/30 text-emerald-200',
            emptyMsg: 'لا توجد مهام منجزة بعد',
            emptyNote: 'المهام التي أتممتها ستُحفظ هنا',
            emptyEmoji: '✅',
        },
    ];

    const activeSection = pillSections.find((s) => s.key === filter)!;

    // في وضع البحث نعرض searchResults، غير كده نعرض activeSection.data
    const filteredData = searchTerm.trim() ? searchResults : activeSection.data;

    return {
        // بيانات أساسية
        loading, todayStr,
        // فورم إضافة
        showForm, setShowForm, form, setForm, saving, handleSave,
        // فورم تعديل
        editTarget, setEditTarget, editForm, setEditForm, editSaving, handleEdit,
        // تأكيد حذف
        confirmDeleteTarget, setConfirmDeleteTarget, handleDelete,
        // مودال عرض
        viewTarget, setViewTarget,
        // إنجاز
        handleToggleDone,
        // فلتر التابات
        filter, setFilter, pillSections, activeSection,
        // بحث
        searchOpen, searchTerm, searchInputRef, searchLoading, filteredData,
        handleSearchOpen, handleSearchClear, handleSearchChange,
    };
}
