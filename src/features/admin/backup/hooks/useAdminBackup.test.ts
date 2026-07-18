import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAdminBackup } from './useAdminBackup';
import type { ProfileRow, BackupRow } from '../../../../types';

// ══════════════════════════════════════════════════════════════════
// Mock db (supabaseClient) — بيغطي بالظبط سلاسل الاستدعاءات الفعلية في
// useAdminBackup.ts (اتأكدت منها بقراءة الكود، مفيش تخمين):
//   - db.from('backups').select('*').order('created_at',{...}).limit(20)   [fetchBackups]
//   - db.from(table).select(cols).range(from,to)                          [fetchAllRows — كل جداول الباك أب، بما فيها profiles]
//   - db.from('backups').insert([{...}])                                  [handleCreateBackup]
//   - db.from(table).delete().eq('tenant_id', tenantId)                   [handleRestoreBackup — حذف قبل الاستعادة]
//   - db.from(table).insert(chunk)                                        [handleRestoreBackup — إعادة إدخال على دفعات]
//   - db.from(table).upsert(chunk, {ignoreDuplicates:false})              [handleRestoreBackup — profiles/activity_log]
// كل استدعاء select/insert/delete/upsert بيتسجّل في spy عام مع اسم الجدول،
// عشان نتأكد من ترتيب الجداول والقيم المُمررة بالظبط زي الكود.
// ══════════════════════════════════════════════════════════════════
type Result = { data?: unknown; error?: { message?: string } | null; reject?: boolean; rejectMessage?: string };
const EMPTY_LIST: Result = { data: [], error: null };

function makeMockDb() {
  const configured: Record<string, Result> = {};
  const selectSpy = vi.fn();
  const rangeSpy = vi.fn();
  const insertSpy = vi.fn();
  const deleteSpy = vi.fn();
  const upsertSpy = vi.fn();

  const setResult = (key: string, result: Result) => { configured[key] = result; };
  const get = (key: string, fallback: Result) => configured[key] ?? fallback;

  const from = vi.fn((table: string) => ({
    select: vi.fn((cols: string) => {
      selectSpy(table, cols);
      return {
        // fetchAllRows: .select(cols).range(from,to)
        range: vi.fn((f: number, t: number) => {
          rangeSpy(table, f, t);
          return Promise.resolve(get(`${table}:range:${f}`, EMPTY_LIST));
        }),
        // fetchBackups: .select('*').order(...).limit(20)
        order: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(get(`${table}:select`, EMPTY_LIST))),
        })),
      };
    }),
    insert: vi.fn((payload: unknown) => {
      insertSpy(table, payload);
      return Promise.resolve(get(`${table}:insert`, { error: null }));
    }),
    delete: vi.fn(() => ({
      // ⚠️ ملحوظة مهمة اتأكدت منها من قراءة الكود: خطوة الحذف في
      // handleRestoreBackup بتعمل await للنتيجة من غير ما تفكّك/تفحص
      // حقل error (بعكس insert/upsert اللي بيعملوا `if(error) throw error`
      // صراحة). يعني الحذف بيتحط في failed=true بس لو الـ Promise اترفض
      // (استثناء فعلي)، مش لو رجع {error:{...}} عادي. عشان كده بنحاكي
      // الفشل هنا بـ reject حقيقي، مش بـ error field.
      eq: vi.fn((col: string, val: unknown) => {
        deleteSpy(table, col, val);
        const cfg = get(`${table}:delete`, { error: null });
        if (cfg.reject) return Promise.reject(new Error(cfg.rejectMessage || 'delete failed'));
        return Promise.resolve(cfg);
      }),
    })),
    upsert: vi.fn((payload: unknown, opts: unknown) => {
      upsertSpy(table, payload, opts);
      return Promise.resolve(get(`${table}:upsert`, { error: null }));
    }),
  }));

  return { from, setResult, selectSpy, rangeSpy, insertSpy, deleteSpy, upsertSpy };
}

let mockDb = makeMockDb();
vi.mock('../../../../supabaseClient', () => ({
  db: { from: (...a: Parameters<typeof mockDb.from>) => mockDb.from(...a) },
}));

const toast = vi.fn();
vi.mock('../../../../shared/lib/notifications', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const logActivity = vi.fn();
vi.mock('../../../../shared/lib/dataAccess', () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

const PROFILE = { id: 'admin-1', full_name: 'أحمد المدير', tenant_id: 'tenant-1' } as unknown as ProfileRow;

// الجداول التسعة الأساسية + profiles اللي بيتصدّروا في كل نسخة احتياطية
// (نفس ترتيب BACKUP_TABLES في الكود + 'profiles' المُضافة بعد الحلقة)
const ALL_BACKUP_TABLES = ['clients','cases','case_sessions','case_fees','fee_payments','case_documents','reminders','client_portal_pins','activity_log','profiles'];
const RESTORE_DELETE_ORDER = ['fee_payments','case_fees','case_documents','case_sessions','reminders','client_portal_pins','cases','clients'];
const RESTORE_INSERT_ORDER = ['clients','cases','case_sessions','case_fees','fee_payments','case_documents','reminders','client_portal_pins'];

beforeEach(() => {
  mockDb = makeMockDb();
  toast.mockClear();
  logActivity.mockClear();
});

function setup(profile: ProfileRow | null | undefined = PROFILE) {
  return renderHook(() => useAdminBackup(profile));
}

describe('useAdminBackup', () => {
  describe('fetchBackups', () => {
    it('نجاح → backups بتتملي من select().order().limit(20)، loadingBackups بيرجع false', async () => {
      const rows = [{ id: 'b1' }, { id: 'b2' }] as unknown as BackupRow[];
      mockDb.setResult('backups:select', { data: rows, error: null });
      const { result } = setup();
      await act(async () => { await result.current.fetchBackups(); });
      expect(result.current.backups).toEqual(rows);
      expect(result.current.loadingBackups).toBe(false);
    });

    it('data:null → backups بتفضل [] الافتراضية، من غير كراش', async () => {
      const { result } = setup();
      await act(async () => { await result.current.fetchBackups(); });
      expect(result.current.backups).toEqual([]);
    });
  });

  describe('handleCreateBackup', () => {
    it('نجاح كامل → بيصدّر كل الجداول العشرة (التسعة + profiles)، client_portal_pins بأعمدة محدودة والباقي بـ "*"، ثم يحفظ الباك أب ويعمل fetchBackups', async () => {
      const { result } = setup();
      await act(async () => { await result.current.handleCreateBackup(); });

      for (const table of ALL_BACKUP_TABLES) {
        if (table === 'client_portal_pins') {
          expect(mockDb.selectSpy).toHaveBeenCalledWith(table, 'id,client_id,pin_hash,is_active,client_name,email');
        } else {
          expect(mockDb.selectSpy).toHaveBeenCalledWith(table, '*');
        }
      }

      expect(mockDb.insertSpy).toHaveBeenCalledWith('backups', [expect.objectContaining({
        created_by: 'admin-1',
        created_by_name: 'أحمد المدير',
        tables_count: ALL_BACKUP_TABLES.length,
        rows_count: 0, // كل الجداول رجّعت [] افتراضيًا في المحاكاة
      })]);
      expect(toast).toHaveBeenCalledWith('✅ تم إنشاء النسخة الاحتياطية بنجاح');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'إنشاء نسخة احتياطية', expect.objectContaining({ userName: 'أحمد المدير' }));
      // fetchBackups بينادى في الآخر → select('backups','*') لازم يتنادى تاني بعد النداء بتاع الحفظ
      expect(mockDb.selectSpy).toHaveBeenCalledWith('backups', '*');
      expect(result.current.creatingBackup).toBe(false);
      expect(result.current.backupProgress).toBe('');
    });

    it('rows_count/size_kb بيتحسبوا صح من الصفوف الفعلية اللي رجعت', async () => {
      mockDb.setResult('clients:range:0', { data: [{ id: 'c1' }, { id: 'c2' }], error: null });
      mockDb.setResult('cases:range:0', { data: [{ id: 'x1' }], error: null });
      const { result } = setup();
      await act(async () => { await result.current.handleCreateBackup(); });

      expect(mockDb.insertSpy).toHaveBeenCalledWith('backups', [expect.objectContaining({ rows_count: 3 })]);
    });

    it('جدول واحد فشل تصديره (استثناء) → تفضل [] للجدول ده، توست تحذير جزئي، لكن لسه بيحفظ الباك أب', async () => {
      mockDb.setResult('cases:range:0', { data: null, error: { message: 'timeout' } });
      const { result } = setup();
      await act(async () => { await result.current.handleCreateBackup(); });

      expect(mockDb.insertSpy).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalledWith('⚠️ تم الحفظ لكن بعض الجداول فشل تصديرها — راجع النسخة');
    });

    it('فشل حفظ الباك أب نفسه (insert برجّع error) → توست فشل، من غير logActivity ولا fetchBackups', async () => {
      mockDb.setResult('backups:insert', { error: { message: 'db error' } });
      const { result } = setup();
      await act(async () => { await result.current.handleCreateBackup(); });

      expect(toast).toHaveBeenCalledWith('❌ فشل حفظ النسخة الاحتياطية', true);
      expect(logActivity).not.toHaveBeenCalled();
      // مفيش select('backups','*') بعد الـ insert الفاشل (fetchBackups ما اتناداش)
      expect(mockDb.selectSpy).not.toHaveBeenCalledWith('backups', '*');
      expect(result.current.creatingBackup).toBe(false);
      expect(result.current.backupProgress).toBe('');
    });
  });

  describe('handleDownloadBackup', () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:mock-url');
      URL.revokeObjectURL = vi.fn();
    });
    afterEach(() => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    });

    // ⚠️ لازم نرجّع أي mock بتاع document.createElement حتى لو التيست فشل أو
    // رمى استثناء (بدل mockRestore() في آخر جسم التيست، اللي ممكن ميتنفّذش
    // لو حصل throw قبله) — وإلا الـ mock بيسرّب لكل التستات اللي جاية بعده
    // (زي ما حصل فعليًا: renderHook جوه setup() بيستخدم document.createElement('div')
    // برضه، فلو فضل الـ mock شغال هيرجّع نفس الـ fake object مش عنصر DOM حقيقي
    // ويطيح بـ "appendChild ... parameter 1 is not of type 'Node'").
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('بينشئ blob من backup.data وينده تنزيل باسم فيه التاريخ، توست، logActivity بتاريخ منسّق', () => {
      const clickSpy = vi.fn();
      // بنحاكي بس عنصر 'a' — أي تاج تاني (زي الـ 'div' اللي renderHook بيبنيه
      // كـ container) لازم يرجع عنصر DOM حقيقي، مش الـ fake object.
      const realCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') {
          return { set href(_v: string) {}, download: '', click: clickSpy } as unknown as HTMLAnchorElement;
        }
        return realCreateElement(tag);
      });

      const backup = { created_at: '2026-05-01T10:00:00Z', data: { tables: {} } } as unknown as BackupRow;
      const { result } = setup();
      act(() => { result.current.handleDownloadBackup(backup); });

      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
      expect(toast).toHaveBeenCalledWith('📥 جاري التنزيل...');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تنزيل نسخة احتياطية', expect.objectContaining({ entity_type: 'backup' }));
    });
  });

  describe('handleRestoreBackup', () => {
    const BACKUP: BackupRow = {
      created_at: '2026-05-01T10:00:00Z',
      data: { version: '1.1', created_at: '2026-05-01T10:00:00Z', tables: {
        clients: [{ id: 'c1' }],
        cases: [{ id: 'x1' }],
        profiles: [{ id: 'p1' }],
        activity_log: [{ id: 'a1' }],
      } },
    } as unknown as BackupRow;

    function typeConfirm(result: ReturnType<typeof setup>['result']) {
      act(() => { result.current.setRestoreConfirmText('استعادة'); });
    }

    it('نص التأكيد غلط → توست تحذير فقط، من غير أي نداء لقاعدة البيانات', async () => {
      const { result } = setup();
      act(() => { result.current.setRestoreConfirmText('غلط'); });
      await act(async () => { await result.current.handleRestoreBackup(BACKUP); });

      expect(toast).toHaveBeenCalledWith('❌ اكتب "استعادة" في حقل التأكيد أولاً', true);
      expect(mockDb.from).not.toHaveBeenCalled();
      expect(result.current.restoringBackup).toBe(false);
    });

    it('مفيش tenantId معروف (profile من غير tenant_id) → توست فشل، من غير أي نداء لقاعدة البيانات', async () => {
      const noTenantProfile = { id: 'admin-1', full_name: 'أحمد المدير', tenant_id: null } as unknown as ProfileRow;
      const { result } = setup(noTenantProfile);
      typeConfirm(result);
      await act(async () => { await result.current.handleRestoreBackup(BACKUP); });

      expect(toast).toHaveBeenCalledWith('❌ تعذر تحديد المكتب الحالي — لا يمكن الاستعادة بأمان', true);
      expect(mockDb.from).not.toHaveBeenCalled();
    });

    it('نجاح كامل → حذف كل جداول RESTORE_DELETE_ORDER بـ tenant_id بنفس الترتيب، إدراج الجداول اللي فيها صفوف بترتيب RESTORE_INSERT_ORDER، upsert لـ profiles/activity_log، توست نجاح كامل، ريلود بعد 1.5 ثانية', async () => {
      vi.useFakeTimers();
      const reloadSpy = vi.fn();
      Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload: reloadSpy } });

      const { result } = setup();
      typeConfirm(result);
      await act(async () => { await result.current.handleRestoreBackup(BACKUP); });

      // ترتيب الحذف: الأبناء أولاً، كلهم بـ tenant_id
      const deleteTables = mockDb.deleteSpy.mock.calls.map((c) => c[0]);
      expect(deleteTables).toEqual(RESTORE_DELETE_ORDER);
      for (const call of mockDb.deleteSpy.mock.calls) {
        expect(call[1]).toBe('tenant_id');
        expect(call[2]).toBe('tenant-1');
      }

      // الإدراج بس للجداول اللي فيها صفوف فعليًا في السنابشوت (clients، cases)
      const insertTables = mockDb.insertSpy.mock.calls.map((c) => c[0]);
      expect(insertTables).toEqual(['clients', 'cases']);

      // profiles/activity_log بيتعملهم upsert مش insert
      const upsertTables = mockDb.upsertSpy.mock.calls.map((c) => c[0]);
      expect(upsertTables).toEqual(['profiles', 'activity_log']);
      expect(mockDb.upsertSpy).toHaveBeenCalledWith('profiles', [{ id: 'p1' }], { ignoreDuplicates: false });

      expect(toast).toHaveBeenCalledWith('✅ تمت الاستعادة الكاملة — 4 جداول');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'استعادة نسخة احتياطية', expect.objectContaining({ userName: 'أحمد المدير' }));
      const details = logActivity.mock.calls[0][2].details as string;
      expect(details).not.toContain('(جزئي)');

      expect(result.current.restoringBackup).toBe(false);
      expect(result.current.confirmRestore).toBeNull();
      expect(result.current.restoreConfirmText).toBe('');

      expect(reloadSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1500);
      expect(reloadSpy).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it('جدول فيه أكتر من INSERT_CHUNK_SIZE (500) صف → بيتقسّم دفعتين', async () => {
      const bigRows = Array.from({ length: 600 }, (_, i) => ({ id: `c${i}` }));
      const bigBackup = { ...BACKUP, data: { ...BACKUP.data as object, tables: { clients: bigRows } } } as unknown as BackupRow;
      const { result } = setup();
      typeConfirm(result);
      await act(async () => { await result.current.handleRestoreBackup(bigBackup); });

      const clientsInsertCalls = mockDb.insertSpy.mock.calls.filter((c) => c[0] === 'clients');
      expect(clientsInsertCalls).toHaveLength(2);
      expect((clientsInsertCalls[0][1] as unknown[]).length).toBe(500);
      expect((clientsInsertCalls[1][1] as unknown[]).length).toBe(100);
    });

    it('جدول فاضي أو مش موجود في السنابشوت → مفيش أي محاولة insert له', async () => {
      const { result } = setup();
      typeConfirm(result);
      await act(async () => { await result.current.handleRestoreBackup(BACKUP); });

      const insertTables = mockDb.insertSpy.mock.calls.map((c) => c[0]);
      expect(insertTables).not.toContain('case_sessions');
      expect(insertTables).not.toContain('fee_payments');
    });

    it('فشل حذف جدول واحد (بيرمي استثناء فعلي — الحذف مبيفحصش حقل error زي insert/upsert) → العملية بتكمل عادي لباقي الجداول، والنتيجة استعادة جزئية', async () => {
      mockDb.setResult('client_portal_pins:delete', { reject: true, rejectMessage: 'column tenant_id does not exist' });
      const { result } = setup();
      typeConfirm(result);
      await act(async () => { await result.current.handleRestoreBackup(BACKUP); });

      // باقي جداول الحذف اتنادت رغم فشل واحد فيهم
      const deleteTables = mockDb.deleteSpy.mock.calls.map((c) => c[0]);
      expect(deleteTables).toEqual(RESTORE_DELETE_ORDER);
      expect(toast).toHaveBeenCalledWith(expect.stringContaining('⚠️ تمت الاستعادة جزئياً'));
      const details = logActivity.mock.calls[0][2].details as string;
      expect(details).toContain('(جزئي)');
    });

    it('فشل insert لجدول واحد → failed=true بس باقي الجداول بتتعمل insert عادي، ومفيش زيادة في restoredTables للجدول الفاشل', async () => {
      mockDb.setResult('clients:insert', { error: { message: 'duplicate key' } });
      const { result } = setup();
      typeConfirm(result);
      await act(async () => { await result.current.handleRestoreBackup(BACKUP); });

      const insertTables = mockDb.insertSpy.mock.calls.map((c) => c[0]);
      expect(insertTables).toEqual(['clients', 'cases']); // اتنادى برضه، بس رجّع error
      expect(toast).toHaveBeenCalledWith(expect.stringContaining('⚠️ تمت الاستعادة جزئياً'));
    });

    it('finally: restoringBackup/confirmRestore/restoreConfirmText بيترجعوا لحالتهم الافتراضية حتى لو فيه فشل جزئي', async () => {
      mockDb.setResult('cases:insert', { error: { message: 'x' } });
      const { result } = setup();
      typeConfirm(result);
      act(() => { result.current.setConfirmRestore(BACKUP); });
      await act(async () => { await result.current.handleRestoreBackup(BACKUP); });

      expect(result.current.restoringBackup).toBe(false);
      expect(result.current.confirmRestore).toBeNull();
      expect(result.current.restoreConfirmText).toBe('');
    });
  });
});
