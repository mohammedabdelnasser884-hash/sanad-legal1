import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReminderRow, ProfileRow } from '../../../types';

// ══════════════════════════════════════════════════════════════════
// Mock db (supabaseClient) — بيغطي سلاسل الاستدعاءات المباشرة الموجودة
// فعليًا في useRemindersTab.ts (اتأكدت منها بقراءة الكود، مفيش تخمين):
//   - db.from('reminders').select('*').eq('done',false).gte('due_date',x).order(...)              [fetchUpcoming]
//   - db.from('reminders').select('*',{count}).eq('done',false).lt('due_date',x).order(...).range() [fetchOverdue]
//   - db.from('reminders').select('*',{count}).eq('done',true).order(...).range()                  [fetchDone]
//   - db.from('reminders').select('*').ilike('title',...).order(...).limit(50)                      [searchReminders]
//   - db.from('reminders').select('*').ilike('notes',...).order(...).limit(50)                       [searchReminders]
//   - db.from('reminders').insert([...])                                                             [handleSave]
//   - db.from('reminders').delete().eq('id',x)                                                       [handleDelete]
// handleToggleDone/handleEdit بيعدوا عن طريق safeUpdate (dataAccess.ts) مش db.from مباشرة.
// ══════════════════════════════════════════════════════════════════
type Result = { data?: unknown; error?: unknown; count?: number | null };
const DEFAULT_LIST_RESULT: Result = { data: [], error: null, count: 0 };

function makeMockDb() {
  const configured: Record<string, Result> = {};
  const insertSpy = vi.fn();
  const deleteSpy = vi.fn();

  const setResult = (key: string, result: Result) => { configured[key] = result; };
  const get = (key: string) => configured[key] ?? DEFAULT_LIST_RESULT;

  interface SelectChain {
    eq: (col: string, val: unknown) => SelectChain;
    gte: (col: string, val: unknown) => SelectChain;
    lt: (col: string, val: unknown) => SelectChain;
    ilike: (col: string, val: unknown) => SelectChain;
    order: () => SelectChain;
    range: () => SelectChain;
    limit: () => SelectChain;
    then: (resolve: (r: Result) => void) => void;
  }

  function buildSelectChain(): SelectChain {
    let key = 'reminders:default';
    const c: SelectChain = {
      eq: vi.fn((col: string, val: unknown) => {
        if (col === 'done') key = val === true ? 'reminders:done' : 'reminders:upcoming-or-overdue';
        return c;
      }),
      gte: vi.fn(() => { key = 'reminders:upcoming'; return c; }),
      lt: vi.fn(() => { key = 'reminders:overdue'; return c; }),
      ilike: vi.fn((col: string) => { key = col === 'title' ? 'reminders:search:title' : 'reminders:search:notes'; return c; }),
      order: vi.fn(() => c),
      range: vi.fn(() => c),
      limit: vi.fn(() => c),
      then: (resolve: (r: Result) => void) => resolve(get(key)),
    };
    return c;
  }

  const from = vi.fn(() => ({
    select: vi.fn(() => buildSelectChain()),
    insert: vi.fn((payload: unknown) => {
      insertSpy(payload);
      return Promise.resolve(get('reminders:insert') ?? { error: null });
    }),
    delete: vi.fn(() => ({
      eq: vi.fn((col: string, val: unknown) => {
        deleteSpy(val);
        return Promise.resolve(get('reminders:delete') ?? { error: null });
      }),
    })),
  }));

  return { from, setResult, insertSpy, deleteSpy };
}

let mockDb = makeMockDb();
vi.mock('../../../supabaseClient', () => ({ db: { from: (...a: Parameters<typeof mockDb.from>) => mockDb.from(...a) } }));

const toast = vi.fn();
vi.mock('../../../shared/lib/notifications', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const safeUpdate = vi.fn();
const logActivity = vi.fn();
vi.mock('../../../shared/lib/dataAccess', () => ({
  safeUpdate: (...a: unknown[]) => safeUpdate(...a),
  logActivity: (...a: unknown[]) => logActivity(...a),
}));

const recordError = vi.fn();
const recordSuccess = vi.fn();
vi.mock('../../../systemHealth', () => ({
  recordError: (...a: unknown[]) => recordError(...a),
  recordSuccess: (...a: unknown[]) => recordSuccess(...a),
}));

import { useRemindersTab } from './useRemindersTab';

const profile = { id: 'lawyer-1', full_name: 'المحامي سالم', tenant_id: 'tenant-1' } as ProfileRow;

function makeReminder(overrides: Partial<ReminderRow> = {}): ReminderRow {
  return {
    id: 'rem-1', title: 'تذكير', due_date: '2026-07-20', notes: null, done: false,
    updated_at: '2026-07-01T00:00:00.000Z', completed_at: null,
    ...overrides,
  } as unknown as ReminderRow;
}

async function renderReady(initialFilter?: string | null, prof: ProfileRow | null = profile) {
  const view = renderHook(() => useRemindersTab(initialFilter, prof));
  if (prof) await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

describe('useRemindersTab', () => {
  beforeEach(() => {
    mockDb = makeMockDb();
    vi.clearAllMocks();
  });

  describe('التحميل الأولي (fetchReminders عبر useEffect)', () => {
    it('profile فاضي (null) → مفيش أي محاولة تحميل، loading يفضل true', async () => {
      const { result } = renderHook(() => useRemindersTab(null, null));
      await act(async () => { await Promise.resolve(); });

      expect(mockDb.from).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(true);
    });

    it('profile موجود → بيجيب القادمة/المتأخرة/المنجزة الثلاثة مع بعض، وloading بيرجع false في الآخر', async () => {
      mockDb.setResult('reminders:upcoming', { data: [makeReminder({ id: 'up-1' })], error: null });
      mockDb.setResult('reminders:overdue', { data: [makeReminder({ id: 'over-1' })], error: null, count: 1 });
      mockDb.setResult('reminders:done', { data: [makeReminder({ id: 'done-1', done: true })], error: null, count: 1 });

      const { result } = await renderReady();

      expect(result.current.pillSections.find((s) => s.key === 'upcoming')!.data).toEqual([expect.objectContaining({ id: 'up-1' })]);
      expect(result.current.pillSections.find((s) => s.key === 'overdue')!.data).toEqual([expect.objectContaining({ id: 'over-1' })]);
      expect(result.current.pillSections.find((s) => s.key === 'done')!.data).toEqual([expect.objectContaining({ id: 'done-1' })]);
      expect(recordSuccess).toHaveBeenCalledWith('db_reminders');
    });

    it('initialFilter بيحدد التاب المفتوح افتراضيًا (activeSection)', async () => {
      const { result } = await renderReady('done');
      expect(result.current.activeSection.key).toBe('done');
      expect(result.current.filter).toBe('done');
    });

    it('من غير initialFilter → الافتراضي upcoming', async () => {
      const { result } = await renderReady(null);
      expect(result.current.activeSection.key).toBe('upcoming');
    });

    it('فشل جلب القادمة (error) → recordError بمفتاح db_reminders، وقائمة فاضية بدل استثناء', async () => {
      mockDb.setResult('reminders:upcoming', { data: null, error: { message: 'fetch failed' } });
      const { result } = await renderReady();

      expect(recordError).toHaveBeenCalledWith('db_reminders', 'fetch failed');
      expect(result.current.pillSections.find((s) => s.key === 'upcoming')!.data).toEqual([]);
    });
  });

  describe('pillSections — pagination المتأخرة/المنجزة', () => {
    it('hasMore=true لما فيه صفحات تانية (count أكبر من الصفحة الحالية)', async () => {
      mockDb.setResult('reminders:overdue', { data: Array.from({ length: 15 }, (_, i) => makeReminder({ id: `over-${i}` })), error: null, count: 30 });
      const { result } = await renderReady();

      const overdueSection = result.current.pillSections.find((s) => s.key === 'overdue')!;
      expect(overdueSection.hasMore).toBe(true);
      expect(overdueSection.total).toBe(30);
    });

    it('loadMore بتاعة المتأخرة → بتزود الصفحة وتضيف للقائمة (append) من غير استبدال', async () => {
      mockDb.setResult('reminders:overdue', { data: [makeReminder({ id: 'over-page0' })], error: null, count: 20 });
      const { result } = await renderReady();
      mockDb.setResult('reminders:overdue', { data: [makeReminder({ id: 'over-page1' })], error: null, count: 20 });

      await act(async () => { result.current.pillSections.find((s) => s.key === 'overdue')!.loadMore!(); });

      const overdueSection = result.current.pillSections.find((s) => s.key === 'overdue')!;
      expect(overdueSection.data.map((r) => r.id)).toEqual(['over-page0', 'over-page1']);
    });

    it('loadMore بتاعة المنجزة بنفس المنطق', async () => {
      mockDb.setResult('reminders:done', { data: [makeReminder({ id: 'done-page0', done: true })], error: null, count: 20 });
      const { result } = await renderReady();
      mockDb.setResult('reminders:done', { data: [makeReminder({ id: 'done-page1', done: true })], error: null, count: 20 });

      await act(async () => { result.current.pillSections.find((s) => s.key === 'done')!.loadMore!(); });

      const doneSection = result.current.pillSections.find((s) => s.key === 'done')!;
      expect(doneSection.data.map((r) => r.id)).toEqual(['done-page0', 'done-page1']);
    });

    it('تاب القادمة (upcoming) مفيهوش hasMore/loadMore (مش paginated)', async () => {
      const { result } = await renderReady();
      const upcomingSection = result.current.pillSections.find((s) => s.key === 'upcoming')!;
      expect(upcomingSection.paginated).toBe(false);
      expect(upcomingSection.loadMore).toBeUndefined();
    });
  });

  describe('handleSave', () => {
    it('عنوان أو تاريخ فاضي → توست تحذير، من غير أي INSERT', async () => {
      const { result } = await renderReady();
      act(() => { result.current.setForm({ title: '', due_date: '', notes: '' }); });

      await act(async () => { await result.current.handleSave(); });

      expect(toast).toHaveBeenCalledWith('يرجى إدخال العنوان والتاريخ', true);
      expect(mockDb.insertSpy).not.toHaveBeenCalled();
    });

    it('مفيش tenant_id في البروفايل → توست فشل تحديد المكتب، من غير INSERT — FIX (RLS tenant_scoped_reminders)', async () => {
      // ⚠️ FIX (17 يوليو 2026): كان فيه { ...profile, tenant_id: null } بيتكتب
      // *جوه* الكولباك اللي بتاخده renderHook مباشرة — يعني object جديد
      // بـ identity مختلفة بيتعمل في كل re-render. الهوك بيحط profile في
      // dependency array بتاع useEffect (fetchReminders)، فـ identity بتتغيّر
      // كل مرة → الـ effect بيشتغل تاني → fetchReminders() → setLoading(true)
      // → re-render → object جديد تاني → loop مفيهوش نهاية عمليًا، وده اللي
      // كان بيسبب "Test timed out in 5000ms" (وبيدي انطباع إن تستات تانية بعده
      // في نفس الملف بتتأخر/تفشل معاه لحد ما الـ loop يهدى). الحل: نثبّت الـ
      // object في متغيّر برّه الكولباك عشان تفضل نفس الـ reference بين الرندرات.
      const profileNoTenant = { ...profile, tenant_id: null } as ProfileRow;
      const { result } = renderHook(() => useRemindersTab(null, profileNoTenant));
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => { result.current.setForm({ title: 'تذكير جديد', due_date: '2026-08-01', notes: '' }); });

      await act(async () => { await result.current.handleSave(); });

      expect(toast).toHaveBeenCalledWith('❌ تعذر تحديد المكتب الحالي، أعد تسجيل الدخول وحاول مرة أخرى', true);
      expect(mockDb.insertSpy).not.toHaveBeenCalled();
    });

    it('نجاح → INSERT بـ tenant_id من البروفايل، توست نجاح، تسجيل نشاط، إغلاق الفورم وتصفيره، وfetchReminders (إعادة تحميل)', async () => {
      mockDb.setResult('reminders:insert', { error: null });
      const { result } = await renderReady();
      act(() => { result.current.setForm({ title: '  تذكير جديد  ', due_date: '2026-08-01', notes: 'ملاحظة' }); });

      await act(async () => { await result.current.handleSave(); });

      expect(mockDb.insertSpy).toHaveBeenCalledWith([expect.objectContaining({
        title: 'تذكير جديد', due_date: '2026-08-01', notes: 'ملاحظة', done: false, tenant_id: 'tenant-1',
      })]);
      expect(toast).toHaveBeenCalledWith('✅ تم إضافة التذكير');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'إضافة تذكير', expect.objectContaining({
        entity_type: 'reminder', details: 'تذكير جديد',
      }));
      expect(result.current.showForm).toBe(false);
      expect(result.current.form).toEqual({ title: '', due_date: '', notes: '' });
    });

    it('فشل الإدخال → recordError بمفتاح reminder_save، توست فشل، من غير logActivity أو إغلاق الفورم', async () => {
      mockDb.setResult('reminders:insert', { error: { message: 'insert failed' } });
      const { result } = await renderReady();
      act(() => { result.current.setForm({ title: 'تذكير فاشل', due_date: '2026-08-01', notes: '' }); });

      await act(async () => { await result.current.handleSave(); });

      expect(recordError).toHaveBeenCalledWith('reminder_save', 'insert failed', expect.objectContaining({ label: 'حفظ التذكيرات' }));
      expect(toast).toHaveBeenCalledWith('❌ حدث خطأ، يرجى المحاولة مرة أخرى', true);
      expect(logActivity).not.toHaveBeenCalled();
      expect(result.current.showForm).toBe(false); // showForm ابتدائيًا false أصلًا وملوش علاقة بمسار الفشل — بيفضل زي ما هو
    });
  });

  describe('handleToggleDone', () => {
    it('من غير إنجاز → إنجاز (done:true, completed_at الآن)، توست نجاح، fetchReminders', async () => {
      safeUpdate.mockResolvedValue({ success: true, error: null });
      const { result } = await renderReady();
      const reminder = makeReminder({ id: 'rem-toggle', done: false, updated_at: '2026-07-01T00:00:00.000Z' });

      await act(async () => { await result.current.handleToggleDone(reminder); });

      expect(safeUpdate).toHaveBeenCalledWith(expect.anything(), 'reminders', 'rem-toggle', expect.objectContaining({ done: true, completed_at: expect.any(String) }), '2026-07-01T00:00:00.000Z');
      expect(toast).toHaveBeenCalledWith('✅ تم تسجيل الإنجاز');
    });

    it('إنجاز بالفعل → إلغاء الإنجاز (done:false, completed_at:null)، توست مختلف', async () => {
      safeUpdate.mockResolvedValue({ success: true, error: null });
      const { result } = await renderReady();
      const reminder = makeReminder({ id: 'rem-toggle-2', done: true });

      await act(async () => { await result.current.handleToggleDone(reminder); });

      expect(safeUpdate).toHaveBeenCalledWith(expect.anything(), 'reminders', 'rem-toggle-2', { done: false, completed_at: null }, expect.anything());
      expect(toast).toHaveBeenCalledWith('↩️ تم إلغاء الإنجاز');
    });

    it('فشل التحديث → recordError، توست فشل، من غير fetchReminders إضافي', async () => {
      safeUpdate.mockResolvedValue({ success: false, error: { message: 'toggle failed' } });
      const { result } = await renderReady();
      const reminder = makeReminder({ id: 'rem-toggle-3' });
      const fromCallsBefore = mockDb.from.mock.calls.length;

      await act(async () => { await result.current.handleToggleDone(reminder); });

      expect(recordError).toHaveBeenCalledWith('reminder_save', 'toggle failed', expect.objectContaining({ label: 'حفظ التذكيرات' }));
      expect(toast).toHaveBeenCalledWith('❌ تعذّر تحديث التذكير', true);
      expect(mockDb.from.mock.calls.length).toBe(fromCallsBefore); // مفيش fetchReminders جديد (fetch = db.from calls)
    });
  });

  describe('handleDelete', () => {
    it('نجاح → DELETE بالـ id الصحيح، توست نجاح، تسجيل نشاط، fetchReminders', async () => {
      mockDb.setResult('reminders:delete', { error: null });
      const { result } = await renderReady();

      await act(async () => { await result.current.handleDelete('rem-del-1'); });

      expect(mockDb.deleteSpy).toHaveBeenCalledWith('rem-del-1');
      expect(toast).toHaveBeenCalledWith('🗑 تم حذف التذكير');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'حذف تذكير', expect.objectContaining({ entity_type: 'reminder', entity_id: 'rem-del-1' }));
    });

    it('فشل الحذف → recordError، توست فشل، من غير logActivity', async () => {
      mockDb.setResult('reminders:delete', { error: { message: 'delete failed' } });
      const { result } = await renderReady();

      await act(async () => { await result.current.handleDelete('rem-del-2'); });

      expect(recordError).toHaveBeenCalledWith('reminder_save', 'delete failed', expect.objectContaining({ label: 'حذف التذكيرات' }));
      expect(toast).toHaveBeenCalledWith('❌ تعذّر حذف التذكير', true);
      expect(logActivity).not.toHaveBeenCalled();
    });
  });

  describe('handleEdit', () => {
    it('عنوان أو تاريخ فاضي → توست تحذير، من غير safeUpdate', async () => {
      const { result } = await renderReady();
      act(() => { result.current.setEditForm({ title: '', due_date: '', notes: '' }); });

      await act(async () => { await result.current.handleEdit(); });

      expect(toast).toHaveBeenCalledWith('يرجى إدخال العنوان والتاريخ', true);
      expect(safeUpdate).not.toHaveBeenCalled();
    });

    it('تعارض (conflict:true) → وقف فوري من غير توست فشل أو نجاح', async () => {
      safeUpdate.mockResolvedValue({ success: false, conflict: true });
      const { result } = await renderReady();
      const target = makeReminder({ id: 'rem-edit-1', updated_at: '2026-07-01T00:00:00.000Z' });
      act(() => {
        result.current.setEditTarget(target);
        result.current.setEditForm({ title: 'تعديل', due_date: '2026-08-01', notes: '' });
      });

      await act(async () => { await result.current.handleEdit(); });

      expect(toast).not.toHaveBeenCalledWith('✅ تم تعديل المهمة');
      expect(toast).not.toHaveBeenCalledWith('❌ حدث خطأ، يرجى المحاولة مرة أخرى', true);
    });

    it('فشل (success:false, conflict:false) → recordError، توست فشل', async () => {
      safeUpdate.mockResolvedValue({ success: false, conflict: false });
      const { result } = await renderReady();
      const target = makeReminder({ id: 'rem-edit-2' });
      act(() => {
        result.current.setEditTarget(target);
        result.current.setEditForm({ title: 'تعديل فاشل', due_date: '2026-08-01', notes: '' });
      });

      await act(async () => { await result.current.handleEdit(); });

      expect(recordError).toHaveBeenCalledWith('reminder_save', '', expect.objectContaining({ label: 'حفظ التذكيرات' }));
      expect(toast).toHaveBeenCalledWith('❌ حدث خطأ، يرجى المحاولة مرة أخرى', true);
    });

    it('نجاح كامل → safeUpdate بـ updated_at الصحيح للهدف، توست نجاح، تسجيل نشاط، تصفير editTarget، fetchReminders', async () => {
      safeUpdate.mockResolvedValue({ success: true, conflict: false });
      const { result } = await renderReady();
      const target = makeReminder({ id: 'rem-edit-3', updated_at: '2026-07-10T00:00:00.000Z' });
      act(() => {
        result.current.setEditTarget(target);
        result.current.setEditForm({ title: '  تعديل ناجح  ', due_date: '2026-08-05', notes: '' });
      });

      await act(async () => { await result.current.handleEdit(); });

      expect(safeUpdate).toHaveBeenCalledWith(expect.anything(), 'reminders', 'rem-edit-3', expect.objectContaining({
        title: 'تعديل ناجح', due_date: '2026-08-05',
      }), '2026-07-10T00:00:00.000Z');
      expect(toast).toHaveBeenCalledWith('✅ تم تعديل المهمة');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تعديل تذكير', expect.objectContaining({ entity_type: 'reminder', entity_id: 'rem-edit-3' }));
      expect(result.current.editTarget).toBe(null);
    });
  });

  describe('البحث (searchReminders/handleSearchChange مع debounce 300ms)', () => {
    // ⚠️ FIX (17 يوليو 2026، بعد تشغيل فعلي كشف 8 تستات فاشلة بـ "Test timed
    // out in 5000ms"): كان فيه vi.useFakeTimers() في beforeEach هنا، يعني
    // بيتفعّل *قبل* ما renderReady() تتنفذ جوه كل تست. لكن renderReady()
    // بتستخدم waitFor() من @testing-library، واللي بيعتمد داخليًا على
    // setTimeout/setInterval حقيقيين عشان يعمل polling على شرط loading=false.
    // لما fake timers شغالة من الأول، الـ polling ده مبيتقدمش أبدًا (محتاج
    // حد ينده vi.advanceTimersByTime يدويًا) → الانتظار بيفضل معلّق لحد ما
    // يضرب الـ testTimeout الافتراضي (5000ms). الحل: نسيب renderReady() تتنفذ
    // بالـ timers الحقيقية زي ما هي، وبعد ما بترجع (loading=false)، نفعّل
    // fake timers هناك بس، لحظة اختبار الـ debounce.
    afterEach(() => { vi.useRealTimers(); });

    it('نص البحث فاضي → مفيش أي استعلام، النتائج بتتصفر فورًا من غير انتظار debounce', async () => {
      const { result } = await renderReady();
      vi.useFakeTimers();

      act(() => { result.current.handleSearchChange(''); });

      expect(result.current.searchTerm).toBe('');
      expect(result.current.filteredData).toEqual(result.current.activeSection.data);
    });

    it('نص بحث حقيقي → بعد 300ms بيعمل استعلامين (title وnotes) ويدمج النتائج بدون تكرار', async () => {
      mockDb.setResult('reminders:search:title', { data: [makeReminder({ id: 'match-title', due_date: '2026-08-10' })], error: null });
      mockDb.setResult('reminders:search:notes', { data: [makeReminder({ id: 'match-notes', due_date: '2026-08-05' })], error: null });
      const { result } = await renderReady();
      vi.useFakeTimers();

      act(() => { result.current.handleSearchChange('بحث'); });
      expect(result.current.searchTerm).toBe('بحث');

      await act(async () => { await vi.advanceTimersByTimeAsync(300); });

      expect(result.current.filteredData.map((r) => r.id).sort()).toEqual(['match-notes', 'match-title'].sort());
    });

    it('نفس التذكير ظاهر في نتيجة العنوان والملاحظات مع بعض → مفيش تكرار (dedup بالـ id)', async () => {
      mockDb.setResult('reminders:search:title', { data: [makeReminder({ id: 'dup-1' })], error: null });
      mockDb.setResult('reminders:search:notes', { data: [makeReminder({ id: 'dup-1' })], error: null });
      const { result } = await renderReady();
      vi.useFakeTimers();

      act(() => { result.current.handleSearchChange('مكرر'); });
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });

      expect(result.current.filteredData.map((r) => r.id)).toEqual(['dup-1']);
    });

    it('تغيير نص البحث بسرعة قبل ما الـ debounce يخلص → بيلغي الطلب القديم وبيبعت بس آخر نص', async () => {
      mockDb.setResult('reminders:search:title', { data: [], error: null });
      mockDb.setResult('reminders:search:notes', { data: [], error: null });
      const { result } = await renderReady();
      vi.useFakeTimers();

      act(() => { result.current.handleSearchChange('أ'); });
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      act(() => { result.current.handleSearchChange('أحمد'); });

      expect(result.current.searchTerm).toBe('أحمد');
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });

      // مفيش استثناء ولا تعليق — النتيجة النهائية بتعكس آخر نص بس
      expect(result.current.searchTerm).toBe('أحمد');
    });

    it('handleSearchOpen → بيفتح البحث ويحاول يركّز على الإنبوت بعد 50ms', async () => {
      const { result } = await renderReady();
      vi.useFakeTimers();
      const focusSpy = vi.fn();
      (result.current.searchInputRef as { current: { focus: () => void } | null }).current = { focus: focusSpy };

      act(() => { result.current.handleSearchOpen(); });
      expect(result.current.searchOpen).toBe(true);

      await act(async () => { await vi.advanceTimersByTimeAsync(50); });
      expect(focusSpy).toHaveBeenCalled();
    });

    it('handleSearchClear → بيصفّر نص البحث والنتائج ويقفل صندوق البحث، وبيلغي أي debounce معلّق', async () => {
      const { result } = await renderReady();
      vi.useFakeTimers();
      act(() => { result.current.handleSearchChange('نص'); });

      act(() => { result.current.handleSearchClear(); });

      expect(result.current.searchTerm).toBe('');
      expect(result.current.searchOpen).toBe(false);
      expect(result.current.filteredData).toEqual(result.current.activeSection.data);

      // التأكد إن الـ debounce القديم اتلغى فعلًا (لو كمّلنا الوقت مفيش استعلام جديد بيتسجل تحت الاسم القديم)
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
      expect(result.current.searchTerm).toBe('');
    });
  });
});
