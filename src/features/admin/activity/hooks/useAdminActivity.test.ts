import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAdminActivity } from './useAdminActivity';
import { ilikeOrClause } from '../../../../shared/lib/sanitize';

// ══════════════════════════════════════════════════════════════════
// Mock db (supabaseClient) — بيغطي بالظبط سلسلة الاستدعاء الفعلية في
// useAdminActivity.ts (اتأكدت منها بقراءة الكود، مفيش تخمين):
//   db.from('activity_log').select('*', { count: 'exact' })
//     [.or(...)]? [.eq('user_id', v)]? [.ilike('action', v)]?
//     [.gte('created_at', v)]? [.lt('created_at', v)]?
//     .order('created_at', { ascending: false }).range(from, to)
// كل خطوة اختيارية بترجع نفس الـ builder (chainable)، والـ builder نفسه
// "thenable" (عنده .then) عشان `await q` في الكود يشتغل من غير ما نحتاج
// نستدعي أي دالة .then/.select إضافية — تمامًا زي سلوك query builder
// الحقيقي بتاع supabase-js.
// ══════════════════════════════════════════════════════════════════
type Result = { data?: unknown; count?: number | null; reject?: boolean };
const DEFAULT_RESULT: Result = { data: [], count: 0 };

function makeMockDb() {
  let configured: Result = { ...DEFAULT_RESULT };
  const setResult = (result: Result) => { configured = result; };

  const selectSpy = vi.fn();
  const orSpy = vi.fn();
  const eqSpy = vi.fn();
  const ilikeSpy = vi.fn();
  const gteSpy = vi.fn();
  const ltSpy = vi.fn();
  const orderSpy = vi.fn();
  const rangeSpy = vi.fn();

  const from = vi.fn((table: string) => ({
    select: vi.fn((cols: string, opts: unknown) => {
      selectSpy(table, cols, opts);
      const builder: Record<string, unknown> = {
        or: vi.fn((clause: string) => { orSpy(clause); return builder; }),
        eq: vi.fn((col: string, val: unknown) => { eqSpy(col, val); return builder; }),
        ilike: vi.fn((col: string, val: unknown) => { ilikeSpy(col, val); return builder; }),
        gte: vi.fn((col: string, val: unknown) => { gteSpy(col, val); return builder; }),
        lt: vi.fn((col: string, val: unknown) => { ltSpy(col, val); return builder; }),
        order: vi.fn((col: string, opts2: unknown) => { orderSpy(col, opts2); return builder; }),
        range: vi.fn((f: number, t: number) => { rangeSpy(f, t); return builder; }),
        then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
          if (configured.reject) return Promise.reject(new Error('db error')).catch(reject);
          return Promise.resolve(configured).then(resolve);
        },
      };
      return builder;
    }),
  }));

  return { from, setResult, selectSpy, orSpy, eqSpy, ilikeSpy, gteSpy, ltSpy, orderSpy, rangeSpy };
}

let mockDb = makeMockDb();
vi.mock('../../../../supabaseClient', () => ({
  db: { from: (...a: Parameters<typeof mockDb.from>) => mockDb.from(...a) },
}));

beforeEach(() => {
  mockDb = makeMockDb();
});

function setup() {
  return renderHook(() => useAdminActivity());
}

describe('useAdminActivity', () => {
  it('الحالة الابتدائية → activityLog:[], activityTotal:0, loadingActivity:false, activityPage:0, ACTIVITY_PAGE_SIZE:30', () => {
    const { result } = setup();
    expect(result.current.activityLog).toEqual([]);
    expect(result.current.activityTotal).toBe(0);
    expect(result.current.loadingActivity).toBe(false);
    expect(result.current.activityPage).toBe(0);
    expect(result.current.ACTIVITY_PAGE_SIZE).toBe(30);
    expect(result.current.activityFilters).toEqual({ search: '', user_id: '', action: '', from: '', to: '' });
  });

  it('fetchActivity من غير فلاتر → select("*",{count:"exact"})، من غير or/eq/ilike/gte/lt، order+range بصفحة 0 (0..29)، البيانات بتتملي، loadingActivity بيرجع false', async () => {
    const rows = [{ id: 'a1' }, { id: 'a2' }];
    mockDb.setResult({ data: rows, count: 2 });
    const { result } = setup();

    await act(async () => { await result.current.fetchActivity(); });

    expect(mockDb.selectSpy).toHaveBeenCalledWith('activity_log', '*', { count: 'exact' });
    expect(mockDb.orSpy).not.toHaveBeenCalled();
    expect(mockDb.eqSpy).not.toHaveBeenCalled();
    expect(mockDb.ilikeSpy).not.toHaveBeenCalled();
    expect(mockDb.gteSpy).not.toHaveBeenCalled();
    expect(mockDb.ltSpy).not.toHaveBeenCalled();
    expect(mockDb.orderSpy).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(mockDb.rangeSpy).toHaveBeenCalledWith(0, 29);
    expect(result.current.activityLog).toEqual(rows);
    expect(result.current.activityTotal).toBe(2);
    expect(result.current.loadingActivity).toBe(false);
  });

  it('data:null → activityLog بتفضل [] الافتراضية من غير كراش', async () => {
    mockDb.setResult({ data: null, count: 5 });
    const { result } = setup();
    await act(async () => { await result.current.fetchActivity(); });
    expect(result.current.activityLog).toEqual([]);
    expect(result.current.activityTotal).toBe(5);
  });

  it('count:null → activityTotal بيفضل 0 الافتراضية من غير تحديث', async () => {
    mockDb.setResult({ data: [{ id: 'a1' }], count: null });
    const { result } = setup();
    await act(async () => { await result.current.fetchActivity(); });
    expect(result.current.activityTotal).toBe(0);
  });

  it('فلتر search → .or() بترتيب الأعمدة الستة الصحيح (action,details,user_name,client_name,case_name,case_type) بنفس نتيجة ilikeOrClause الحقيقية', async () => {
    const { result } = setup();
    act(() => { result.current.setActivityFilters({ search: 'محمد', user_id: '', action: '', from: '', to: '' }); });

    await act(async () => { await result.current.fetchActivity(); });

    const expectedClause = [
      ilikeOrClause('action', 'محمد'),
      ilikeOrClause('details', 'محمد'),
      ilikeOrClause('user_name', 'محمد'),
      ilikeOrClause('client_name', 'محمد'),
      ilikeOrClause('case_name', 'محمد'),
      ilikeOrClause('case_type', 'محمد'),
    ].join(',');
    expect(mockDb.orSpy).toHaveBeenCalledWith(expectedClause);
  });

  it('فلتر search بمسافات فاضية بس → متتجاهلش (زي trim فاضي)، من غير نداء لـ .or()', async () => {
    const { result } = setup();
    act(() => { result.current.setActivityFilters({ search: '   ', user_id: '', action: '', from: '', to: '' }); });
    await act(async () => { await result.current.fetchActivity(); });
    expect(mockDb.orSpy).not.toHaveBeenCalled();
  });

  it('فلتر search فيه فاصلة أو قوس → ilikeOrClause بتحيط القيمة بعلامتي اقتباس (الـ FIX الموثّق في الكود)', async () => {
    const { result } = setup();
    act(() => { result.current.setActivityFilters({ search: 'قضية (١), رقم', user_id: '', action: '', from: '', to: '' }); });
    await act(async () => { await result.current.fetchActivity(); });

    const calledClause = mockDb.orSpy.mock.calls[0][0] as string;
    expect(calledClause).toContain('action.ilike."%قضية (١), رقم%"');
  });

  it('فلتر user_id → .eq("user_id", القيمة بعد trim)', async () => {
    const { result } = setup();
    act(() => { result.current.setActivityFilters({ search: '', user_id: '  u-42  ', action: '', from: '', to: '' }); });
    await act(async () => { await result.current.fetchActivity(); });
    expect(mockDb.eqSpy).toHaveBeenCalledWith('user_id', 'u-42');
  });

  it('فلتر action → .ilike("action", "%القيمة%") بعد trim', async () => {
    const { result } = setup();
    act(() => { result.current.setActivityFilters({ search: '', user_id: '', action: ' حذف ', from: '', to: '' }); });
    await act(async () => { await result.current.fetchActivity(); });
    expect(mockDb.ilikeSpy).toHaveBeenCalledWith('action', '%حذف%');
  });

  it('فلتر from → .gte("created_at", القيمة الخام من غير تعديل)', async () => {
    const { result } = setup();
    act(() => { result.current.setActivityFilters({ search: '', user_id: '', action: '', from: '2026-01-01', to: '' }); });
    await act(async () => { await result.current.fetchActivity(); });
    expect(mockDb.gteSpy).toHaveBeenCalledWith('created_at', '2026-01-01');
  });

  it('فلتر to → .lt("created_at", اليوم التالي بصيغة YYYY-MM-DD) عشان يشمل يوم "to" بالكامل', async () => {
    const { result } = setup();
    act(() => { result.current.setActivityFilters({ search: '', user_id: '', action: '', from: '', to: '2026-01-10' }); });
    await act(async () => { await result.current.fetchActivity(); });

    const expectedDate = new Date('2026-01-10');
    expectedDate.setDate(expectedDate.getDate() + 1);
    const expected = expectedDate.toISOString().slice(0, 10);
    expect(mockDb.ltSpy).toHaveBeenCalledWith('created_at', expected);
  });

  it('صفحة رقم 2 → range بيتحسب صح (60..89)', async () => {
    const { result } = setup();
    act(() => { result.current.setActivityPage(2); });
    await act(async () => { await result.current.fetchActivity(); });
    expect(mockDb.rangeSpy).toHaveBeenCalledWith(60, 89);
  });

  it('استدعاء fetchActivity() من غير آرجيومنتس بيستخدم activityFilters/activityPage الحاليين من الـ state', async () => {
    const { result } = setup();
    act(() => {
      result.current.setActivityFilters({ search: '', user_id: 'u-99', action: '', from: '', to: '' });
      result.current.setActivityPage(1);
    });
    await act(async () => { await result.current.fetchActivity(); });
    expect(mockDb.eqSpy).toHaveBeenCalledWith('user_id', 'u-99');
    expect(mockDb.rangeSpy).toHaveBeenCalledWith(30, 59);
  });

  it('استدعاء fetchActivity(filters, page) بآرجيومنتس صريحة → بيستخدمهم بدل الـ state', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.fetchActivity({ search: '', user_id: 'explicit-user', action: '', from: '', to: '' }, 3);
    });
    expect(mockDb.eqSpy).toHaveBeenCalledWith('user_id', 'explicit-user');
    expect(mockDb.rangeSpy).toHaveBeenCalledWith(90, 119);
  });

  it('استثناء أثناء الاستعلام (جدول غير موجود بعد) → بيتلقط في catch، من غير كراش، loadingActivity بيرجع false برضه', async () => {
    mockDb.setResult({ reject: true });
    const { result } = setup();
    await act(async () => { await result.current.fetchActivity(); });
    expect(result.current.loadingActivity).toBe(false);
    expect(result.current.activityLog).toEqual([]);
  });

  it('loadingActivity بيبقى true أثناء التنفيذ ويرجع false بعد الانتهاء', async () => {
    const { result } = setup();
    let pending!: Promise<void>;
    act(() => { pending = result.current.fetchActivity(); });
    expect(result.current.loadingActivity).toBe(true);
    await act(async () => { await pending; });
    expect(result.current.loadingActivity).toBe(false);
  });
});
