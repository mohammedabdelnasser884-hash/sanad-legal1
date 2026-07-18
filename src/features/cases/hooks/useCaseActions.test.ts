import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClientRow, ProfileRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';
import type { NavigationState } from '../../../useNavigation';

// ══════════════════════════════════════════════════════════════════
// Mock db (supabaseClient) — بيغطي بالظبط سلاسل الاستدعاءات المباشرة
// (مش عن طريق window.__dbWrite) الموجودة فعليًا في useCaseActions.ts
// (اتأكدت منها بقراءة الكود، مفيش تخمين):
//   - db.auth.signOut()                                                          [handleLogout]
//   - db.from('case_sessions').insert([...])                                     [handleSaveCase — نجاح أونلاين]
//   - db.from('cases').update({deleted_at}).eq('id', caseId)                     [handleDeleteCase/handleRestoreCase]
//   - db.from('case_sessions').select('id').eq('case_id',x).eq('session_date',y).maybeSingle()  [handleUpdateCase]
//   - db.from('case_sessions').insert([...])                                     [handleUpdateCase — تاريخ جلسة جديد]
// عمليات INSERT/UPDATE لجدول cases نفسه (إنشاء/تعديل القضية) بتعدي حصريًا
// عن طريق window.__dbWrite (global function من src/lib/offlineQueue.ts)، مش
// db.from('cases') مباشرة — فبنعمله mock منفصل كـ vi.fn() على window.
// ══════════════════════════════════════════════════════════════════
type Result = { data?: unknown; error?: unknown };
const DEFAULT_RESULT: Result = { data: null, error: null };

function makeMockDb() {
  const configured: Record<string, Result> = {};
  const insertSpy = vi.fn();
  const updateSpy = vi.fn();
  const authSignOut = vi.fn(() => Promise.resolve({ error: null }));

  const setResult = (key: string, result: Result) => { configured[key] = result; };
  const get = (key: string) => configured[key] ?? DEFAULT_RESULT;

  const from = vi.fn((table: string) => {
    if (table === 'case_sessions') {
      return {
        insert: vi.fn((payload: unknown) => {
          insertSpy(table, payload);
          return Promise.resolve(get(`${table}:insert`));
        }),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve(get(`${table}:maybeSingle`))),
            })),
          })),
        })),
      };
    }
    if (table === 'cases') {
      return {
        update: vi.fn((payload: unknown) => {
          updateSpy(table, payload);
          return { eq: vi.fn(() => Promise.resolve(get(`${table}:update`))) };
        }),
      };
    }
    return {};
  });

  return { from, setResult, insertSpy, updateSpy, authSignOut };
}

let mockDb = makeMockDb();
vi.mock('../../../supabaseClient', () => ({
  db: {
    from: (...a: Parameters<typeof mockDb.from>) => mockDb.from(...a),
    auth: { signOut: () => mockDb.authSignOut() },
  },
}));

const toast = vi.fn();
vi.mock('../../../shared/lib/notifications', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const logActivity = vi.fn();
vi.mock('../../../shared/lib/dataAccess', () => ({
  logActivity: (...a: unknown[]) => logActivity(...a),
}));

import { useCaseActions } from './useCaseActions';

// window.__dbWrite معرّفة global بتوقيع Generic حقيقي (src/lib/offlineQueue.ts)
// بيتحقق فيه من اسم الجدول وقت الكتابة (compile-time) — بنعمله cast لـ Mock
// عشان نقدر نتحكم في القيمة الراجعة في كل تست من غير ما نكسر الـ typing العام.
function dbWriteMock(): ReturnType<typeof vi.fn> {
  return window.__dbWrite as unknown as ReturnType<typeof vi.fn>;
}

const clients: ClientRow[] = [{ id: 'client-1', full_name: 'أحمد محمد' } as ClientRow];
const profile = { id: 'lawyer-1', full_name: 'المحامي سالم', email: 'salem@example.com' } as ProfileRow;

function makeCase(overrides: Partial<MappedCase> = {}): MappedCase {
  return {
    id: 'case-1', number: '10', title: 'قضية مدنية', court: 'محكمة الجيزة', type: 'مدني',
    court_level: null, circuit_number: null, status: 'نشطة', date: '2026-07-01', client_id: 'client-1',
    plaintiff: null, defendant: null, year: 2026, updated_at: '2026-07-16T10:00:00.000Z', court_floor: null,
    court_hall: null, session_hall: null, secretary_hall: null, secretary_name: null, session_time: null,
    ...overrides,
  } as MappedCase;
}

function makeParams(overrides: Partial<Parameters<typeof useCaseActions>[0]> = {}) {
  const cases = overrides.cases ?? [makeCase()];
  return {
    sendTelegram: vi.fn(),
    fetchCases: vi.fn(),
    cases,
    lawyers: [],
    clients,
    selectedCase: null,
    setCases: vi.fn(),
    setLawyers: vi.fn(),
    setClients: vi.fn(),
    setProfile: vi.fn(),
    setAuthUser: vi.fn(),
    setSelectedCase: vi.fn(),
    setDeleteConfirm: vi.fn(),
    setSavingCase: vi.fn(),
    setShowCaseModal: vi.fn(),
    casesFilter: 'all',
    nav: { closeModal: vi.fn() } as unknown as NavigationState,
    profile,
    ...overrides,
  };
}

describe('useCaseActions', () => {
  beforeEach(() => {
    mockDb = makeMockDb();
    vi.clearAllMocks();
    window.__dbWrite = vi.fn() as unknown as typeof window.__dbWrite;
  });

  describe('handleLogout', () => {
    it('يسجّل النشاط، يعمل signOut، ويفضي كل الـ state المحلي', async () => {
      const params = makeParams();
      const { handleLogout } = useCaseActions(params);

      await handleLogout();

      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تسجيل خروج', expect.objectContaining({
        userName: 'المحامي سالم', entity_type: 'user', details: 'salem@example.com',
      }));
      expect(mockDb.authSignOut).toHaveBeenCalled();
      expect(params.setCases).toHaveBeenCalledWith([]);
      expect(params.setLawyers).toHaveBeenCalledWith([]);
      expect(params.setClients).toHaveBeenCalledWith([]);
      expect(params.setProfile).toHaveBeenCalledWith(null);
      expect(params.setAuthUser).toHaveBeenCalledWith(null);
    });
  });

  describe('handleSaveCase — فاليديشن العنوان', () => {
    it('عنوان فاضي تماماً → توست خطأ "حقل مطلوب"، مفيش أي __dbWrite', async () => {
      const params = makeParams();
      const { handleSaveCase } = useCaseActions(params);

      await handleSaveCase({ title: '' });

      expect(toast).toHaveBeenCalledWith('❌ حقل "موضوع ومسمى الدعوى" مطلوب', true);
      expect(dbWriteMock()).not.toHaveBeenCalled();
      expect(params.setSavingCase).not.toHaveBeenCalledWith(true);
    });

    it('عنوان مسافات بس (بدون trim) → نفس رفض الفاليديشن', async () => {
      const params = makeParams();
      const { handleSaveCase } = useCaseActions(params);

      await handleSaveCase({ title: '    ' });

      expect(toast).toHaveBeenCalledWith('❌ حقل "موضوع ومسمى الدعوى" مطلوب', true);
      expect(dbWriteMock()).not.toHaveBeenCalled();
    });
  });

  describe('handleSaveCase', () => {
    it('نجاح أونلاين مع تاريخ جلسة → INSERT في case_sessions بـ id القضية الحقيقي من نتيجة الإدراج، وتوست نجاح + تليجرام + fetchCases', async () => {
      dbWriteMock().mockResolvedValue({
        error: null, offline: false, queued: false, data: { id: 'new-case-1' },
      });
      const params = makeParams();
      const { handleSaveCase } = useCaseActions(params);

      await handleSaveCase({ title: 'قضية جديدة', client_id: 'client-1', date: '2026-08-01', session_time: 'مسائي' });

      expect(dbWriteMock()).toHaveBeenCalledWith(expect.objectContaining({
        type: 'INSERT', table: 'cases', returning: true,
        data: expect.objectContaining({ title: 'قضية جديدة', client_id: 'client-1' }),
      }));
      expect(mockDb.insertSpy).toHaveBeenCalledWith('case_sessions', [expect.objectContaining({
        case_id: 'new-case-1', session_date: '2026-08-01', session_time: 'مسائي',
      })]);
      expect(toast).toHaveBeenCalledWith('✅ تم تقييد الدعوى في السيرفر السحابي!');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'إضافة قضية', expect.objectContaining({
        case_name: 'قضية جديدة', client_name: 'أحمد محمد',
      }));
      expect(params.sendTelegram).toHaveBeenCalled();
      expect(params.fetchCases).toHaveBeenCalledWith(0, 'all');
      expect(params.setSavingCase).toHaveBeenCalledWith(false);
      expect(params.setShowCaseModal).toHaveBeenCalledWith(false);
    });

    it('نجاح أونلاين من غير تاريخ جلسة → مفيش أي INSERT في case_sessions', async () => {
      dbWriteMock().mockResolvedValue({
        error: null, offline: false, queued: false, data: { id: 'new-case-2' },
      });
      const params = makeParams();
      const { handleSaveCase } = useCaseActions(params);

      await handleSaveCase({ title: 'قضية بدون جلسة' });

      expect(mockDb.insertSpy).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith('✅ تم تقييد الدعوى في السيرفر السحابي!');
    });

    it('نجاح لكن مفيش id راجع للقضية (RLS مانعة SELECT بعد الإدراج) مع وجود تاريخ → توست تحذير إضافي، بس بيكمل باقي الخطوات', async () => {
      dbWriteMock().mockResolvedValue({
        error: null, offline: false, queued: false, data: null,
      });
      const params = makeParams();
      const { handleSaveCase } = useCaseActions(params);

      await handleSaveCase({ title: 'قضية بدون id راجع', date: '2026-08-02' });

      expect(toast).toHaveBeenCalledWith('⚠️ القضية اتسجلت، بس الجلسة الأولى محتاجة تتضاف يدويًا من صفحة القضية', true);
      expect(toast).toHaveBeenCalledWith('✅ تم تقييد الدعوى في السيرفر السحابي!');
      expect(mockDb.insertSpy).not.toHaveBeenCalled();
      expect(params.fetchCases).toHaveBeenCalled();
    });

    it('offline/queued مع تاريخ جلسة → بيحفظ الجلسة في الطابور بـ _offlineCaseTitle، توست حفظ محلي، وتحديث تفاؤلي للـ state', async () => {
      dbWriteMock().mockResolvedValue({
        error: null, offline: true, queued: true,
      });
      const params = makeParams();
      const { handleSaveCase } = useCaseActions(params);

      await handleSaveCase({ title: 'قضية أوفلاين', date: '2026-08-03', session_time: 'صباحي' });

      expect(dbWriteMock()).toHaveBeenCalledTimes(2);
      expect(dbWriteMock()).toHaveBeenNthCalledWith(2, expect.objectContaining({
        type: 'INSERT', table: 'case_sessions',
        data: expect.objectContaining({ _offlineCaseTitle: 'قضية أوفلاين', case_id: null, session_date: '2026-08-03' }),
      }));
      expect(toast).toHaveBeenCalledWith('📥 محفوظة محلياً — ستُضاف فور عودة الإنترنت');
      expect(params.setCases).toHaveBeenCalled();
      // في حالة الأوفلاين مفيش تسجيل نشاط/تليجرام/fetchCases (مش نفس مسار النجاح الأونلاين)
      expect(logActivity).not.toHaveBeenCalled();
      expect(params.fetchCases).not.toHaveBeenCalled();
    });

    it('فشل (error، من غير offline) → توست فشل، وقف فوري من غير استكمال أي خطوة تانية', async () => {
      dbWriteMock().mockResolvedValue({
        error: { message: 'insert failed' }, offline: false, queued: false,
      });
      const params = makeParams();
      const { handleSaveCase } = useCaseActions(params);

      await handleSaveCase({ title: 'قضية فاشلة' });

      expect(toast).toHaveBeenCalledWith('❌ فشل تسجيل القضية الجديدة — تحقق من الاتصال وأعد المحاولة', true);
      expect(logActivity).not.toHaveBeenCalled();
      expect(params.fetchCases).not.toHaveBeenCalled();
      expect(params.setSavingCase).toHaveBeenCalledWith(false);
      // مفيش استدعاء setShowCaseModal(false) في مسار الفشل (فيه return مبكر قبلها)
      expect(params.setShowCaseModal).not.toHaveBeenCalled();
    });
  });

  describe('handleDeleteCase — أرشفة (soft delete)', () => {
    it('بينشئ deleteConfirm بوضع archive، وعند onConfirm بيحدّث deleted_at، يقفل المودال، ويسجّل النشاط بـ case_type من MappedCase (type مش case_type)', async () => {
      mockDb.setResult('cases:update', { error: null });
      const targetCase = makeCase({ id: 'case-archive-1', title: 'قضية للأرشفة', type: 'جنائي', client_id: 'client-1' });
      const params = makeParams({ cases: [targetCase] });
      const { handleDeleteCase } = useCaseActions(params);

      await handleDeleteCase('case-archive-1');

      expect(params.setDeleteConfirm).toHaveBeenCalledWith(expect.objectContaining({
        type: 'case', id: 'case-archive-1', mode: 'archive', name: 'قضية للأرشفة',
      }));
      const deleteConfirmArg = (params.setDeleteConfirm as ReturnType<typeof vi.fn>).mock.calls[0][0];
      await deleteConfirmArg.onConfirm();

      expect(mockDb.updateSpy).toHaveBeenCalledWith('cases', expect.objectContaining({ deleted_at: expect.any(String) }));
      expect(params.nav.closeModal).toHaveBeenCalledWith('delete');
      expect(params.setDeleteConfirm).toHaveBeenCalledWith(null);
      expect(toast).toHaveBeenCalledWith('📦 تم نقل القضية للأرشيف');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'أرشفة قضية', expect.objectContaining({
        entity_type: 'case', entity_id: 'case-archive-1',
        case_name: 'قضية للأرشفة', case_type: 'جنائي', client_name: 'أحمد محمد',
      }));
      expect(params.setSelectedCase).toHaveBeenCalledWith(null);
    });

    it('فشل الأرشفة → توست فشل، من غير logActivity أو تحديث state', async () => {
      mockDb.setResult('cases:update', { error: { message: 'archive failed' } });
      const targetCase = makeCase({ id: 'case-archive-2' });
      const params = makeParams({ cases: [targetCase] });
      const { handleDeleteCase } = useCaseActions(params);

      await handleDeleteCase('case-archive-2');
      const deleteConfirmArg = (params.setDeleteConfirm as ReturnType<typeof vi.fn>).mock.calls[0][0];
      await deleteConfirmArg.onConfirm();

      expect(toast).toHaveBeenCalledWith('❌ فشل أرشفة القضية — تحقق من الاتصال وأعد المحاولة', true);
      expect(logActivity).not.toHaveBeenCalled();
      expect(params.setSelectedCase).not.toHaveBeenCalled();
    });
  });

  describe('handleRestoreCase', () => {
    it('نجاح → deleted_at:null، توست نجاح، تسجيل نشاط، وإعادة تحميل القضايا', async () => {
      mockDb.setResult('cases:update', { error: null });
      const params = makeParams();
      const { handleRestoreCase } = useCaseActions(params);

      await handleRestoreCase('case-1');

      expect(mockDb.updateSpy).toHaveBeenCalledWith('cases', { deleted_at: null });
      expect(toast).toHaveBeenCalledWith('✅ تم استرجاع القضية');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'استرجاع قضية من الأرشيف', expect.objectContaining({
        entity_type: 'case', entity_id: 'case-1',
      }));
      expect(params.fetchCases).toHaveBeenCalledWith(0, 'all');
    });

    it('فشل → توست فشل، من غير تسجيل نشاط أو إعادة تحميل', async () => {
      mockDb.setResult('cases:update', { error: { message: 'restore failed' } });
      const params = makeParams();
      const { handleRestoreCase } = useCaseActions(params);

      await handleRestoreCase('case-1');

      expect(toast).toHaveBeenCalledWith('❌ فشل استرجاع القضية — تحقق من الاتصال وأعد المحاولة', true);
      expect(logActivity).not.toHaveBeenCalled();
      expect(params.fetchCases).not.toHaveBeenCalled();
    });
  });

  describe('handleUpdateCase — فاليديشن العنوان', () => {
    it('عنوان فاضي → توست خطأ "حقل مطلوب"، مفيش أي __dbWrite', async () => {
      const existingCase = makeCase({ id: 'case-1' });
      const params = makeParams({ cases: [existingCase], selectedCase: existingCase });
      const { handleUpdateCase } = useCaseActions(params);

      await handleUpdateCase('case-1', { title: '' });

      expect(toast).toHaveBeenCalledWith('❌ حقل "موضوع ومسمى الدعوى" مطلوب', true);
      expect(dbWriteMock()).not.toHaveBeenCalled();
    });
  });

  describe('handleUpdateCase', () => {
    it('نجاح من غير تغيير تاريخ الجلسة → مفيش استعلام/INSERT جديد في case_sessions، وتحديث فوري بـ updated_at الجديد من الاستجابة', async () => {
      dbWriteMock().mockResolvedValue({
        error: null, offline: false, queued: false, conflict: false,
        data: { updated_at: '2026-07-16T12:00:00.000Z' },
      });
      const existingCase = makeCase({ id: 'case-1', date: '2026-07-01' });
      const params = makeParams({ cases: [existingCase], selectedCase: existingCase });
      const { handleUpdateCase } = useCaseActions(params);

      await handleUpdateCase('case-1', { title: 'قضية محدثة', date: '2026-07-01' });

      expect(mockDb.insertSpy).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith('✅ تم تحديث القضية');
      expect(params.setCases).toHaveBeenCalled();
      expect(params.fetchCases).toHaveBeenCalledWith(0, 'all');
    });

    it('تغيير تاريخ الجلسة ومفيش جلسة موجودة بنفس التاريخ → INSERT جلسة جديدة في case_sessions', async () => {
      dbWriteMock().mockResolvedValue({
        error: null, offline: false, queued: false, conflict: false,
        data: { updated_at: '2026-07-16T12:00:00.000Z' },
      });
      mockDb.setResult('case_sessions:maybeSingle', { data: null, error: null });
      const existingCase = makeCase({ id: 'case-1', date: '2026-07-01' });
      const params = makeParams({ cases: [existingCase], selectedCase: existingCase });
      const { handleUpdateCase } = useCaseActions(params);

      await handleUpdateCase('case-1', { title: 'قضية بجلسة جديدة', date: '2026-09-01', session_time: 'مسائي' });

      expect(mockDb.insertSpy).toHaveBeenCalledWith('case_sessions', [expect.objectContaining({
        case_id: 'case-1', session_date: '2026-09-01', session_time: 'مسائي',
      })]);
    });

    it('تغيير تاريخ الجلسة لكن فيه جلسة موجودة بالفعل بنفس التاريخ → مفيش INSERT مكرر', async () => {
      dbWriteMock().mockResolvedValue({
        error: null, offline: false, queued: false, conflict: false,
        data: { updated_at: '2026-07-16T12:00:00.000Z' },
      });
      mockDb.setResult('case_sessions:maybeSingle', { data: { id: 'existing-session-1' }, error: null });
      const existingCase = makeCase({ id: 'case-1', date: '2026-07-01' });
      const params = makeParams({ cases: [existingCase], selectedCase: existingCase });
      const { handleUpdateCase } = useCaseActions(params);

      await handleUpdateCase('case-1', { title: 'قضية بجلسة مكررة', date: '2026-09-05' });

      expect(mockDb.insertSpy).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith('✅ تم تحديث القضية');
    });

    it('تعارض (conflict:true) → توست تحذير، وقف فوري من غير توست نجاح أو fetchCases', async () => {
      dbWriteMock().mockResolvedValue({
        error: null, offline: false, queued: false, conflict: true,
      });
      const existingCase = makeCase({ id: 'case-1' });
      const params = makeParams({ cases: [existingCase], selectedCase: existingCase });
      const { handleUpdateCase } = useCaseActions(params);

      await handleUpdateCase('case-1', { title: 'محاولة تعديل متعارضة' });

      expect(toast).toHaveBeenCalledWith('⚠️ هذه القضية عدّلها شخص آخر بعد ما فتحتها — أعد فتحها وحاول التعديل مرة أخرى', true);
      expect(toast).not.toHaveBeenCalledWith('✅ تم تحديث القضية');
      expect(params.fetchCases).not.toHaveBeenCalled();
    });

    it('فشل (error) → توست فشل، من غير fetchCases', async () => {
      dbWriteMock().mockResolvedValue({
        error: { message: 'update failed' }, offline: false, queued: false, conflict: false,
      });
      const existingCase = makeCase({ id: 'case-1' });
      const params = makeParams({ cases: [existingCase], selectedCase: existingCase });
      const { handleUpdateCase } = useCaseActions(params);

      await handleUpdateCase('case-1', { title: 'محاولة تعديل فاشلة' });

      expect(toast).toHaveBeenCalledWith('❌ فشل تعديل بيانات القضية — تحقق من الاتصال وأعد المحاولة', true);
      expect(params.fetchCases).not.toHaveBeenCalled();
    });

    it('offline/queued → توست حفظ محلي، تحديث فوري للـ state المحلي بالفورم', async () => {
      dbWriteMock().mockResolvedValue({
        error: null, offline: true, queued: true, conflict: false,
      });
      const existingCase = makeCase({ id: 'case-1' });
      const params = makeParams({ cases: [existingCase], selectedCase: existingCase });
      const { handleUpdateCase } = useCaseActions(params);

      await handleUpdateCase('case-1', { title: 'تعديل أوفلاين' });

      expect(toast).toHaveBeenCalledWith('📥 التعديل محفوظ محلياً — سيُزامن عند عودة الإنترنت');
      expect(params.setCases).toHaveBeenCalled();
      expect(params.setSelectedCase).toHaveBeenCalled();
    });

    it('استثناء غير متوقع (مثلاً window.__dbWrite بترمي) → يتلقّط في catch، توست خطأ اتصال عام', async () => {
      dbWriteMock().mockRejectedValue(new Error('network down'));
      const existingCase = makeCase({ id: 'case-1' });
      const params = makeParams({ cases: [existingCase], selectedCase: existingCase });
      const { handleUpdateCase } = useCaseActions(params);

      await handleUpdateCase('case-1', { title: 'تعديل هيرمي استثناء' });

      expect(toast).toHaveBeenCalledWith('❌ خطأ في الاتصال، تحقق من الإنترنت وأعد المحاولة', true);
    });
  });
});
