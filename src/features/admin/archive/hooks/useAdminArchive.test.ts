import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAdminArchive, ARCHIVE_PAGE_SIZE } from './useAdminArchive';
import { ilikeOrClause } from '../../../../shared/lib/sanitize';
import type { ClientRow, ProfileRow } from '../../../../types';

// ══════════════════════════════════════════════════════════════════
// Mock db (supabaseClient) — بيغطي بالظبط سلاسل الاستدعاءات الفعلية في
// useAdminArchive.ts (اتأكدت منها بقراءة الكود، مفيش تخمين):
//   - db.from('cases').select('*',{count:'exact'}).not('deleted_at','is',null)
//       [.or(...)]? .order('deleted_at',{ascending:false}).range(from,to)   [fetchArchivedCases]
//   - db.from('cases').update({deleted_at:null}).eq('id', caseId)          [handleRestoreCase]
//   - db.from('case_documents').select('storage_path').eq('case_id', X)   [handlePermanentDeleteCase — خطوة 1]
//   - db.storage.from('case-docs').remove(paths)                          [handlePermanentDeleteCase — خطوة 1]
//   - db.from('cases').delete().eq('id', caseId)                          [handlePermanentDeleteCase — خطوة 2]
// نفس فلسفة الموك في useAdminActivity.test.ts (query builder thenable قابل
// للتسلسل) مدموجة مع نمط case_documents/storage الموجود فعليًا فى
// useCaseActions.test.ts (نفس المنطق بالحرف، منقول هنا لهوك مستقل).
// ══════════════════════════════════════════════════════════════════
type SelectResult = { data?: unknown; count?: number | null; reject?: boolean };
const DEFAULT_SELECT: SelectResult = { data: [], count: 0 };

type SimpleResult = { data?: unknown; error?: unknown };
const DEFAULT_SIMPLE: SimpleResult = { data: null, error: null };

function makeMockDb() {
  let selectResult: SelectResult = { ...DEFAULT_SELECT };
  const simpleResults: Record<string, SimpleResult> = {};

  const setSelectResult = (r: SelectResult) => { selectResult = r; };
  const setSimpleResult = (key: string, r: SimpleResult) => { simpleResults[key] = r; };
  const getSimple = (key: string) => simpleResults[key] ?? DEFAULT_SIMPLE;

  const selectSpy = vi.fn();
  const notSpy = vi.fn();
  const orSpy = vi.fn();
  const orderSpy = vi.fn();
  const rangeSpy = vi.fn();
  const updateSpy = vi.fn();
  const deleteSpy = vi.fn();
  const storageRemoveSpy = vi.fn();

  const from = vi.fn((table: string) => {
    if (table === 'cases') {
      return {
        // fetchArchivedCases: .select('*',{count:'exact'}).not(...).or(...)?.order(...).range(...)
        select: vi.fn((cols: string, opts: unknown) => {
          selectSpy(table, cols, opts);
          const builder: Record<string, unknown> = {
            not: vi.fn((col: string, op: string, val: unknown) => { notSpy(col, op, val); return builder; }),
            or: vi.fn((clause: string) => { orSpy(clause); return builder; }),
            order: vi.fn((col: string, o: unknown) => { orderSpy(col, o); return builder; }),
            range: vi.fn((f: number, t: number) => { rangeSpy(f, t); return builder; }),
            then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
              if (selectResult.reject) return Promise.reject(new Error('db error')).catch(reject);
              return Promise.resolve(selectResult).then(resolve);
            },
          };
          return builder;
        }),
        // handleRestoreCase: .update({deleted_at:null}).eq('id', caseId)
        update: vi.fn((payload: unknown) => {
          updateSpy(table, payload);
          return { eq: vi.fn(() => Promise.resolve(getSimple('cases:update'))) };
        }),
        // handlePermanentDeleteCase خطوة 2: .delete().eq('id', caseId)
        delete: vi.fn(() => {
          deleteSpy(table);
          return { eq: vi.fn(() => Promise.resolve(getSimple('cases:delete'))) };
        }),
      };
    }
    if (table === 'case_documents') {
      return {
        // handlePermanentDeleteCase خطوة 1: .select('storage_path').eq('case_id', X)
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve(getSimple('case_documents:select'))),
        })),
      };
    }
    if (table === 'clients') {
      return {
        // fetchArchivedClients: نفس نمط cases بالحرف
        select: vi.fn((cols: string, opts: unknown) => {
          selectSpy(table, cols, opts);
          const builder: Record<string, unknown> = {
            not: vi.fn((col: string, op: string, val: unknown) => { notSpy(col, op, val); return builder; }),
            or: vi.fn((clause: string) => { orSpy(clause); return builder; }),
            order: vi.fn((col: string, o: unknown) => { orderSpy(col, o); return builder; }),
            range: vi.fn((f: number, t: number) => { rangeSpy(f, t); return builder; }),
            then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
              if (selectResult.reject) return Promise.reject(new Error('db error')).catch(reject);
              return Promise.resolve(selectResult).then(resolve);
            },
          };
          return builder;
        }),
        // handleRestoreClient: .update({deleted_at:null}).eq('id', clientId)
        update: vi.fn((payload: unknown) => {
          updateSpy(table, payload);
          return { eq: vi.fn(() => Promise.resolve(getSimple('clients:update'))) };
        }),
        // handlePermanentDeleteClient: .delete().eq('id', clientId)
        delete: vi.fn(() => {
          deleteSpy(table);
          return { eq: vi.fn(() => Promise.resolve(getSimple('clients:delete'))) };
        }),
      };
    }
    if (table === 'case_fees') {
      return {
        // fetchArchivedFees: نفس نمط cases بالحرف
        select: vi.fn((cols: string, opts: unknown) => {
          selectSpy(table, cols, opts);
          const builder: Record<string, unknown> = {
            not: vi.fn((col: string, op: string, val: unknown) => { notSpy(col, op, val); return builder; }),
            or: vi.fn((clause: string) => { orSpy(clause); return builder; }),
            order: vi.fn((col: string, o: unknown) => { orderSpy(col, o); return builder; }),
            range: vi.fn((f: number, t: number) => { rangeSpy(f, t); return builder; }),
            then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
              if (selectResult.reject) return Promise.reject(new Error('db error')).catch(reject);
              return Promise.resolve(selectResult).then(resolve);
            },
          };
          return builder;
        }),
        // handleRestoreFee: .update({deleted_at:null}).eq('id', feeId)
        update: vi.fn((payload: unknown) => {
          updateSpy(table, payload);
          return { eq: vi.fn(() => Promise.resolve(getSimple('case_fees:update'))) };
        }),
        // handlePermanentDeleteFee: .delete().eq('id', feeId)
        delete: vi.fn(() => {
          deleteSpy(table);
          return { eq: vi.fn(() => Promise.resolve(getSimple('case_fees:delete'))) };
        }),
      };
    }
    return {};
  });

  const storage = {
    from: vi.fn(() => ({
      remove: vi.fn((paths: string[]) => {
        storageRemoveSpy(paths);
        return Promise.resolve(getSimple('case-docs:remove'));
      }),
    })),
  };

  return {
    from, storage, setSelectResult, setSimpleResult,
    selectSpy, notSpy, orSpy, orderSpy, rangeSpy, updateSpy, deleteSpy, storageRemoveSpy,
  };
}

let mockDb = makeMockDb();
vi.mock('../../../../supabaseClient', () => ({
  db: {
    from: (...a: Parameters<typeof mockDb.from>) => mockDb.from(...a),
    storage: { from: (...a: Parameters<typeof mockDb.storage.from>) => mockDb.storage.from(...a) },
  },
}));

const toast = vi.fn();
vi.mock('../../../../shared/lib/notifications', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const logActivity = vi.fn();
vi.mock('../../../../shared/lib/dataAccess', () => ({
  logActivity: (...a: unknown[]) => logActivity(...a),
}));

beforeEach(() => {
  mockDb = makeMockDb();
  toast.mockClear();
  logActivity.mockClear();
});

const clients: ClientRow[] = [
  { id: 'cl-1', full_name: 'محمد عبدالناصر' } as ClientRow,
];
const profile: ProfileRow = { full_name: 'أدمن' } as ProfileRow;

function setup() {
  return renderHook(() => useAdminArchive(clients, profile));
}

describe('useAdminArchive', () => {
  it('الحالة الابتدائية → archivedCases:[], archivedCasesTotal:0, loadingArchivedCases:false, archivedCasesPage:0, ARCHIVE_PAGE_SIZE:20', () => {
    const { result } = setup();
    expect(result.current.archivedCases).toEqual([]);
    expect(result.current.archivedCasesTotal).toBe(0);
    expect(result.current.loadingArchivedCases).toBe(false);
    expect(result.current.archivedCasesPage).toBe(0);
    expect(ARCHIVE_PAGE_SIZE).toBe(20);
    expect(result.current.confirmDeleteCase).toBeNull();
    expect(result.current.restoringCaseId).toBeNull();
    expect(result.current.deletingCase).toBe(false);
  });

  it('fetchArchivedCases من غير بحث → select("*",{count:"exact"}) ثم not(deleted_at,is,null)، من غير or، order+range بصفحة 0 (0..19)', async () => {
    const rows = [{ id: 'c1', title: 'قضية 1' }, { id: 'c2', title: 'قضية 2' }];
    mockDb.setSelectResult({ data: rows, count: 2 });
    const { result } = setup();

    await act(async () => { await result.current.fetchArchivedCases(); });

    expect(mockDb.selectSpy).toHaveBeenCalledWith('cases', '*', { count: 'exact' });
    expect(mockDb.notSpy).toHaveBeenCalledWith('deleted_at', 'is', null);
    expect(mockDb.orSpy).not.toHaveBeenCalled();
    expect(mockDb.orderSpy).toHaveBeenCalledWith('deleted_at', { ascending: false });
    expect(mockDb.rangeSpy).toHaveBeenCalledWith(0, 19);
    expect(result.current.archivedCases).toEqual(rows);
    expect(result.current.archivedCasesTotal).toBe(2);
    expect(result.current.loadingArchivedCases).toBe(false);
  });

  it('فلتر بحث → .or() بعمودي title/case_number_official بنفس نتيجة ilikeOrClause الحقيقية', async () => {
    const { result } = setup();
    await act(async () => { await result.current.fetchArchivedCases(0, 'محمد'); });

    const expectedClause = [
      ilikeOrClause('title', 'محمد'),
      ilikeOrClause('case_number_official', 'محمد'),
    ].join(',');
    expect(mockDb.orSpy).toHaveBeenCalledWith(expectedClause);
  });

  it('بحث بمسافات فاضية بس → متتجاهلش، من غير نداء لـ .or()', async () => {
    const { result } = setup();
    await act(async () => { await result.current.fetchArchivedCases(0, '   '); });
    expect(mockDb.orSpy).not.toHaveBeenCalled();
  });

  it('صفحة رقم 2 → range بيتحسب صح (40..59)', async () => {
    const { result } = setup();
    await act(async () => { await result.current.fetchArchivedCases(2, ''); });
    expect(mockDb.rangeSpy).toHaveBeenCalledWith(40, 59);
  });

  it('data:null → archivedCases بتفضل [] من غير كراش', async () => {
    mockDb.setSelectResult({ data: null, count: 5 });
    const { result } = setup();
    await act(async () => { await result.current.fetchArchivedCases(); });
    expect(result.current.archivedCases).toEqual([]);
    expect(result.current.archivedCasesTotal).toBe(5);
  });

  it('استثناء أثناء الاستعلام → بيتلقط في catch من غير كراش، loadingArchivedCases بيرجع false', async () => {
    mockDb.setSelectResult({ reject: true });
    const { result } = setup();
    await act(async () => { await result.current.fetchArchivedCases(); });
    expect(result.current.loadingArchivedCases).toBe(false);
    expect(result.current.archivedCases).toEqual([]);
  });

  it('handleRestoreCase نجاح → update({deleted_at:null}).eq، toast نجاح، logActivity بالنوع الصحيح، العنصر بيتشال من القائمة والعداد بينقص', async () => {
    mockDb.setSelectResult({ data: [{ id: 'c1', title: 'قضية 1', client_id: 'cl-1' }], count: 1 });
    const { result } = setup();
    await act(async () => { await result.current.fetchArchivedCases(); });

    mockDb.setSimpleResult('cases:update', { error: null });
    await act(async () => { await result.current.handleRestoreCase('c1'); });

    expect(mockDb.updateSpy).toHaveBeenCalledWith('cases', { deleted_at: null });
    expect(toast).toHaveBeenCalledWith('✅ تم استرجاع القضية — قد تحتاج لتحديث الصفحة لرؤيتها في القوائم الأخرى');
    expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'استرجاع قضية من الأرشيف', expect.objectContaining({ entity_type: 'case', entity_id: 'c1' }));
    expect(result.current.archivedCases).toEqual([]);
    expect(result.current.archivedCasesTotal).toBe(0);
    expect(result.current.restoringCaseId).toBeNull();
  });

  it('handleRestoreCase فشل → toast خطأ، من غير تعديل القائمة، من غير logActivity', async () => {
    mockDb.setSelectResult({ data: [{ id: 'c1', title: 'قضية 1' }], count: 1 });
    const { result } = setup();
    await act(async () => { await result.current.fetchArchivedCases(); });

    mockDb.setSimpleResult('cases:update', { error: { message: 'fail' } });
    await act(async () => { await result.current.handleRestoreCase('c1'); });

    expect(toast).toHaveBeenCalledWith('❌ فشل استرجاع القضية — تحقق من الاتصال وأعد المحاولة', true);
    expect(logActivity).not.toHaveBeenCalled();
    expect(result.current.archivedCases).toHaveLength(1);
  });

  it('handlePermanentDeleteCase مع مستندات → بيجيب storage_path الأول، بيحذف الملفات، بعدين بيحذف صف القضية، وبيسجل النشاط مع اسم الموكل الصحيح', async () => {
    mockDb.setSelectResult({ data: [{ id: 'c1', title: 'قضية 1', client_id: 'cl-1', case_type: 'مدني' }], count: 1 });
    const { result } = setup();
    await act(async () => { await result.current.fetchArchivedCases(); });

    mockDb.setSimpleResult('case_documents:select', { data: [{ storage_path: 'docs/a.pdf' }, { storage_path: 'docs/b.pdf' }], error: null });
    mockDb.setSimpleResult('case-docs:remove', { error: null });
    mockDb.setSimpleResult('cases:delete', { error: null });

    await act(async () => { await result.current.handlePermanentDeleteCase('c1'); });

    expect(mockDb.storageRemoveSpy).toHaveBeenCalledWith(['docs/a.pdf', 'docs/b.pdf']);
    expect(mockDb.deleteSpy).toHaveBeenCalledWith('cases');
    expect(toast).toHaveBeenCalledWith('🗑️ تم حذف القضية نهائياً');
    expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'حذف قضية نهائياً', expect.objectContaining({
      entity_type: 'case', entity_id: 'c1', case_name: 'قضية 1', case_type: 'مدني', client_name: 'محمد عبدالناصر',
    }));
    expect(result.current.archivedCases).toEqual([]);
    expect(result.current.confirmDeleteCase).toBeNull();
  });

  it('handlePermanentDeleteCase من غير مستندات → مفيش نداء لـ storage.remove، الحذف بيكمل عادي', async () => {
    mockDb.setSelectResult({ data: [{ id: 'c1', title: 'قضية 1' }], count: 1 });
    const { result } = setup();
    await act(async () => { await result.current.fetchArchivedCases(); });

    mockDb.setSimpleResult('case_documents:select', { data: [], error: null });
    mockDb.setSimpleResult('cases:delete', { error: null });

    await act(async () => { await result.current.handlePermanentDeleteCase('c1'); });

    expect(mockDb.storageRemoveSpy).not.toHaveBeenCalled();
    expect(mockDb.deleteSpy).toHaveBeenCalledWith('cases');
    expect(toast).toHaveBeenCalledWith('🗑️ تم حذف القضية نهائياً');
  });

  it('handlePermanentDeleteCase فشل جلب المستندات → بيوقف الحذف، مفيش نداء لـ delete', async () => {
    mockDb.setSelectResult({ data: [{ id: 'c1', title: 'قضية 1' }], count: 1 });
    const { result } = setup();
    await act(async () => { await result.current.fetchArchivedCases(); });

    mockDb.setSimpleResult('case_documents:select', { data: null, error: { message: 'fail' } });

    await act(async () => { await result.current.handlePermanentDeleteCase('c1'); });

    expect(mockDb.deleteSpy).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('❌ فشل التحقق من مستندات القضية — تحقق من الاتصال وأعد المحاولة', true);
  });

  it('handlePermanentDeleteCase فشل حذف بعض ملفات Storage → توست تحذير بس، الحذف بيكمل عادي', async () => {
    mockDb.setSelectResult({ data: [{ id: 'c1', title: 'قضية 1' }], count: 1 });
    const { result } = setup();
    await act(async () => { await result.current.fetchArchivedCases(); });

    mockDb.setSimpleResult('case_documents:select', { data: [{ storage_path: 'docs/a.pdf' }], error: null });
    mockDb.setSimpleResult('case-docs:remove', { error: { message: 'storage fail' } });
    mockDb.setSimpleResult('cases:delete', { error: null });

    await act(async () => { await result.current.handlePermanentDeleteCase('c1'); });

    expect(toast).toHaveBeenCalledWith('⚠️ تعذّر حذف بعض ملفات المستندات من التخزين — راجع bucket المستندات يدويًا', true);
    expect(mockDb.deleteSpy).toHaveBeenCalledWith('cases');
    expect(toast).toHaveBeenCalledWith('🗑️ تم حذف القضية نهائياً');
  });

  it('handlePermanentDeleteCase فشل حذف صف القضية → toast خطأ، من غير logActivity، القائمة تفضل زي ما هي', async () => {
    mockDb.setSelectResult({ data: [{ id: 'c1', title: 'قضية 1' }], count: 1 });
    const { result } = setup();
    await act(async () => { await result.current.fetchArchivedCases(); });

    mockDb.setSimpleResult('case_documents:select', { data: [], error: null });
    mockDb.setSimpleResult('cases:delete', { error: { message: 'fail' } });

    await act(async () => { await result.current.handlePermanentDeleteCase('c1'); });

    expect(toast).toHaveBeenCalledWith('❌ فشل حذف القضية نهائياً — تحقق من الاتصال وأعد المحاولة', true);
    expect(logActivity).not.toHaveBeenCalled();
    expect(result.current.archivedCases).toHaveLength(1);
  });

  // ══════════════════════════════════════════════════════════════
  //  المرحلة 4 — الموكلين
  // ══════════════════════════════════════════════════════════════
  describe('الموكلين (المرحلة 4)', () => {
    it('الحالة الابتدائية → archivedClients:[], archivedClientsTotal:0، من غير تحميل', () => {
      const { result } = setup();
      expect(result.current.archivedClients).toEqual([]);
      expect(result.current.archivedClientsTotal).toBe(0);
      expect(result.current.loadingArchivedClients).toBe(false);
      expect(result.current.confirmDeleteClient).toBeNull();
      expect(result.current.restoringClientId).toBeNull();
      expect(result.current.deletingClient).toBe(false);
    });

    it('fetchArchivedClients من غير بحث → select+not+order+range بصفحة 0', async () => {
      const rows = [{ id: 'cl1', full_name: 'موكل 1' }];
      mockDb.setSelectResult({ data: rows, count: 1 });
      const { result } = setup();

      await act(async () => { await result.current.fetchArchivedClients(); });

      expect(mockDb.selectSpy).toHaveBeenCalledWith('clients', '*', { count: 'exact' });
      expect(mockDb.notSpy).toHaveBeenCalledWith('deleted_at', 'is', null);
      expect(mockDb.orSpy).not.toHaveBeenCalled();
      expect(mockDb.orderSpy).toHaveBeenCalledWith('deleted_at', { ascending: false });
      expect(mockDb.rangeSpy).toHaveBeenCalledWith(0, 19);
      expect(result.current.archivedClients).toEqual(rows);
      expect(result.current.archivedClientsTotal).toBe(1);
    });

    it('فلتر بحث → .or() بعمودي full_name/client_name بنفس نتيجة ilikeOrClause الحقيقية', async () => {
      const { result } = setup();
      await act(async () => { await result.current.fetchArchivedClients(0, 'أحمد'); });

      const expectedClause = [
        ilikeOrClause('full_name', 'أحمد'),
        ilikeOrClause('client_name', 'أحمد'),
      ].join(',');
      expect(mockDb.orSpy).toHaveBeenCalledWith(expectedClause);
    });

    it('handleRestoreClient نجاح → update({deleted_at:null}).eq، toast نجاح، logActivity، العنصر بيتشال من القائمة', async () => {
      mockDb.setSelectResult({ data: [{ id: 'cl1', full_name: 'موكل 1' }], count: 1 });
      const { result } = setup();
      await act(async () => { await result.current.fetchArchivedClients(); });

      mockDb.setSimpleResult('clients:update', { error: null });
      await act(async () => { await result.current.handleRestoreClient('cl1'); });

      expect(mockDb.updateSpy).toHaveBeenCalledWith('clients', { deleted_at: null });
      expect(toast).toHaveBeenCalledWith('✅ تم استرجاع الموكل — قد تحتاج لتحديث الصفحة لرؤيته في القوائم الأخرى');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'استرجاع موكل من الأرشيف', expect.objectContaining({ entity_type: 'client', entity_id: 'cl1' }));
      expect(result.current.archivedClients).toEqual([]);
      expect(result.current.archivedClientsTotal).toBe(0);
    });

    it('handleRestoreClient فشل → toast خطأ، من غير تعديل القائمة، من غير logActivity', async () => {
      mockDb.setSelectResult({ data: [{ id: 'cl1', full_name: 'موكل 1' }], count: 1 });
      const { result } = setup();
      await act(async () => { await result.current.fetchArchivedClients(); });

      mockDb.setSimpleResult('clients:update', { error: { message: 'fail' } });
      await act(async () => { await result.current.handleRestoreClient('cl1'); });

      expect(toast).toHaveBeenCalledWith('❌ فشل استرجاع الموكل — تحقق من الاتصال وأعد المحاولة', true);
      expect(logActivity).not.toHaveBeenCalled();
      expect(result.current.archivedClients).toHaveLength(1);
    });

    it('handlePermanentDeleteClient نجاح → delete().eq فقط (من غير أي كاسكيد يدوي)، toast نجاح، logActivity، العنصر بيتشال', async () => {
      mockDb.setSelectResult({ data: [{ id: 'cl1', full_name: 'موكل 1' }], count: 1 });
      const { result } = setup();
      await act(async () => { await result.current.fetchArchivedClients(); });

      mockDb.setSimpleResult('clients:delete', { error: null });
      await act(async () => { await result.current.handlePermanentDeleteClient('cl1'); });

      expect(mockDb.deleteSpy).toHaveBeenCalledWith('clients');
      expect(toast).toHaveBeenCalledWith('🗑️ تم حذف الموكل نهائياً');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'حذف موكل نهائياً', expect.objectContaining({ entity_type: 'client', entity_id: 'cl1', client_name: 'موكل 1' }));
      expect(result.current.archivedClients).toEqual([]);
      expect(result.current.confirmDeleteClient).toBeNull();
    });

    it('handlePermanentDeleteClient فشل → toast خطأ، من غير logActivity، القائمة تفضل زي ما هي', async () => {
      mockDb.setSelectResult({ data: [{ id: 'cl1', full_name: 'موكل 1' }], count: 1 });
      const { result } = setup();
      await act(async () => { await result.current.fetchArchivedClients(); });

      mockDb.setSimpleResult('clients:delete', { error: { message: 'fail' } });
      await act(async () => { await result.current.handlePermanentDeleteClient('cl1'); });

      expect(toast).toHaveBeenCalledWith('❌ فشل حذف الموكل نهائياً — تحقق من الاتصال وأعد المحاولة', true);
      expect(logActivity).not.toHaveBeenCalled();
      expect(result.current.archivedClients).toHaveLength(1);
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  المرحلة 4 — الأتعاب
  // ══════════════════════════════════════════════════════════════
  describe('الأتعاب (المرحلة 4)', () => {
    it('الحالة الابتدائية → archivedFees:[], archivedFeesTotal:0، من غير تحميل', () => {
      const { result } = setup();
      expect(result.current.archivedFees).toEqual([]);
      expect(result.current.archivedFeesTotal).toBe(0);
      expect(result.current.loadingArchivedFees).toBe(false);
      expect(result.current.confirmDeleteFee).toBeNull();
      expect(result.current.restoringFeeId).toBeNull();
      expect(result.current.deletingFee).toBe(false);
    });

    it('fetchArchivedFees من غير بحث → select+not+order+range بصفحة 0', async () => {
      const rows = [{ id: 'f1', client_name: 'موكل 1', case_title: 'قضية 1' }];
      mockDb.setSelectResult({ data: rows, count: 1 });
      const { result } = setup();

      await act(async () => { await result.current.fetchArchivedFees(); });

      expect(mockDb.selectSpy).toHaveBeenCalledWith('case_fees', '*', { count: 'exact' });
      expect(mockDb.notSpy).toHaveBeenCalledWith('deleted_at', 'is', null);
      expect(mockDb.orSpy).not.toHaveBeenCalled();
      expect(mockDb.orderSpy).toHaveBeenCalledWith('deleted_at', { ascending: false });
      expect(mockDb.rangeSpy).toHaveBeenCalledWith(0, 19);
      expect(result.current.archivedFees).toEqual(rows);
      expect(result.current.archivedFeesTotal).toBe(1);
    });

    it('فلتر بحث → .or() بعمودي client_name/case_title بنفس نتيجة ilikeOrClause الحقيقية', async () => {
      const { result } = setup();
      await act(async () => { await result.current.fetchArchivedFees(0, 'قضية'); });

      const expectedClause = [
        ilikeOrClause('client_name', 'قضية'),
        ilikeOrClause('case_title', 'قضية'),
      ].join(',');
      expect(mockDb.orSpy).toHaveBeenCalledWith(expectedClause);
    });

    it('handleRestoreFee نجاح → update({deleted_at:null}).eq، toast نجاح، logActivity، العنصر بيتشال من القائمة', async () => {
      mockDb.setSelectResult({ data: [{ id: 'f1', client_name: 'موكل 1' }], count: 1 });
      const { result } = setup();
      await act(async () => { await result.current.fetchArchivedFees(); });

      mockDb.setSimpleResult('case_fees:update', { error: null });
      await act(async () => { await result.current.handleRestoreFee('f1'); });

      expect(mockDb.updateSpy).toHaveBeenCalledWith('case_fees', { deleted_at: null });
      expect(toast).toHaveBeenCalledWith('✅ تم استرجاع الأتعاب — قد تحتاج لتحديث الصفحة لرؤيتها في القوائم الأخرى');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'استرجاع أتعاب من الأرشيف', expect.objectContaining({ entity_type: 'fee', entity_id: 'f1' }));
      expect(result.current.archivedFees).toEqual([]);
      expect(result.current.archivedFeesTotal).toBe(0);
    });

    it('handleRestoreFee فشل → toast خطأ، من غير تعديل القائمة، من غير logActivity', async () => {
      mockDb.setSelectResult({ data: [{ id: 'f1', client_name: 'موكل 1' }], count: 1 });
      const { result } = setup();
      await act(async () => { await result.current.fetchArchivedFees(); });

      mockDb.setSimpleResult('case_fees:update', { error: { message: 'fail' } });
      await act(async () => { await result.current.handleRestoreFee('f1'); });

      expect(toast).toHaveBeenCalledWith('❌ فشل استرجاع الأتعاب — تحقق من الاتصال وأعد المحاولة', true);
      expect(logActivity).not.toHaveBeenCalled();
      expect(result.current.archivedFees).toHaveLength(1);
    });

    it('handlePermanentDeleteFee نجاح → delete().eq فقط (fee_payments/invoices بتتغطى تلقائيًا بالـ FK)، toast نجاح، logActivity، العنصر بيتشال', async () => {
      mockDb.setSelectResult({ data: [{ id: 'f1', client_name: 'موكل 1', case_title: 'قضية 1' }], count: 1 });
      const { result } = setup();
      await act(async () => { await result.current.fetchArchivedFees(); });

      mockDb.setSimpleResult('case_fees:delete', { error: null });
      await act(async () => { await result.current.handlePermanentDeleteFee('f1'); });

      expect(mockDb.deleteSpy).toHaveBeenCalledWith('case_fees');
      expect(toast).toHaveBeenCalledWith('🗑️ تم حذف الأتعاب نهائياً');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'حذف أتعاب نهائياً', expect.objectContaining({ entity_type: 'fee', entity_id: 'f1', client_name: 'موكل 1', case_name: 'قضية 1' }));
      expect(result.current.archivedFees).toEqual([]);
      expect(result.current.confirmDeleteFee).toBeNull();
    });

    it('handlePermanentDeleteFee فشل → toast خطأ، من غير logActivity، القائمة تفضل زي ما هي', async () => {
      mockDb.setSelectResult({ data: [{ id: 'f1', client_name: 'موكل 1' }], count: 1 });
      const { result } = setup();
      await act(async () => { await result.current.fetchArchivedFees(); });

      mockDb.setSimpleResult('case_fees:delete', { error: { message: 'fail' } });
      await act(async () => { await result.current.handlePermanentDeleteFee('f1'); });

      expect(toast).toHaveBeenCalledWith('❌ فشل حذف الأتعاب نهائياً — تحقق من الاتصال وأعد المحاولة', true);
      expect(logActivity).not.toHaveBeenCalled();
      expect(result.current.archivedFees).toHaveLength(1);
    });
  });
});
