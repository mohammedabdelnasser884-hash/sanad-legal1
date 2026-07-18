import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClientRow, ProfileRow } from '../../../types';
import type { NavigationState } from '../../../useNavigation';

// ══════════════════════════════════════════════════════════════════
// Mock db (supabaseClient) — بيغطي سلاسل الاستدعاءات المباشرة الموجودة
// فعليًا في useClientActions.ts (اتأكدت منها بقراءة الكود، مفيش تخمين):
//   - db.storage.from('client-docs').upload(path, file, {upsert:true})   [handleSaveClient/handleUpdateClient]
//   - db.from('clients').update({deleted_at}).eq('id', x)                [handleDeleteClient/handleRestoreClient]
// عملية INSERT في جدول clients نفسه (إضافة موكل) بتعدي حصريًا عن طريق
// window.__dbWrite (مش db.from('clients') مباشرة) — mock منفصل على window.
// handleUpdateClient بيعدي عن طريق safeUpdate (من dataAccess.ts) مش db.from
// مباشرة. handleSaveLawyer بيعدي عن طريق callAdminAction (من نفس ملف
// supabaseClient، بيرمي Error عند الفشل).
// resolveStorageUrl (من shared/lib/storage) بتتنادى بعد كل upload ناجح —
// بنسيب validateUploadFile حقيقية (منطق نقي) ونعمل mock بس لـ resolveStorageUrl،
// نفس نمط useCaseDocuments.test.ts بالظبط.
// ══════════════════════════════════════════════════════════════════
type Result = { data?: unknown; error?: unknown };

function makeMockDb() {
  const configured: Record<string, Result> = {};
  const updateSpy = vi.fn();
  const deleteSpy = vi.fn();
  const uploadSpy = vi.fn();

  const setResult = (key: string, result: Result) => { configured[key] = result; };
  const get = (key: string, fallback: Result) => configured[key] ?? fallback;

  const from = vi.fn((table: string) => ({
    update: vi.fn((payload: unknown) => {
      updateSpy(table, payload);
      return { eq: vi.fn(() => Promise.resolve(get(`${table}:update`, { error: null }))) };
    }),
    delete: vi.fn(() => {
      deleteSpy(table);
      return { eq: vi.fn(() => Promise.resolve(get(`${table}:delete`, { error: null }))) };
    }),
  }));

  const storageFrom = vi.fn((bucket: string) => ({
    upload: vi.fn((path: string, file: unknown, opts: unknown) => {
      uploadSpy(bucket, path, file, opts);
      return Promise.resolve(get(`${bucket}:upload`, { error: null }));
    }),
  }));

  return { from, storageFrom, setResult, updateSpy, deleteSpy, uploadSpy };
}

let mockDb = makeMockDb();
const callAdminAction = vi.fn();
vi.mock('../../../supabaseClient', () => ({
  db: {
    from: (...a: Parameters<typeof mockDb.from>) => mockDb.from(...a),
    storage: { from: (...a: Parameters<typeof mockDb.storageFrom>) => mockDb.storageFrom(...a) },
  },
  callAdminAction: (...a: unknown[]) => callAdminAction(...a),
}));

const toast = vi.fn();
vi.mock('../../../shared/lib/notifications', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const logActivity = vi.fn();
const safeUpdate = vi.fn();
vi.mock('../../../shared/lib/dataAccess', () => ({
  logActivity: (...a: unknown[]) => logActivity(...a),
  safeUpdate: (...a: unknown[]) => safeUpdate(...a),
}));

// ⚠️ نفس نمط useCaseDocuments.test.ts — validateUploadFile حقيقية،
// resolveStorageUrl فقط بتتعمل mock (بتنادي db.storage.createSignedUrl
// اللي مش جزء من التستات دي).
const resolveStorageUrl = vi.fn();
vi.mock('../../../shared/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/lib/storage')>();
  return { ...actual, resolveStorageUrl: (...a: unknown[]) => resolveStorageUrl(...a) };
});

const getCurrentTenantId = vi.fn();
vi.mock('../../../constants', () => ({ getCurrentTenantId: () => getCurrentTenantId() }));

const recordError = vi.fn();
vi.mock('../../../systemHealth', () => ({ recordError: (...a: unknown[]) => recordError(...a) }));

import { useClientActions, type ClientFormData } from './useClientActions';

function dbWriteMock(): ReturnType<typeof vi.fn> {
  return window.__dbWrite as unknown as ReturnType<typeof vi.fn>;
}

function makeForm(overrides: Partial<ClientFormData> = {}): ClientFormData {
  return {
    full_name: 'أحمد محمد', type: 'individual', phone: '', phone2: '', email: '',
    address: '', notes: '', national_id: '', cr_number: '', kin_name: '', kin_phone: '',
    ...overrides,
  };
}

const clients: ClientRow[] = [{ id: 'client-1', full_name: 'أحمد محمد', updated_at: '2026-07-01T00:00:00.000Z', contact_info: null } as unknown as ClientRow];
const profile = { id: 'lawyer-1', full_name: 'المحامي سالم', email: 'salem@example.com' } as ProfileRow;

function makeParams(overrides: Partial<Parameters<typeof useClientActions>[0]> = {}) {
  return {
    sendTelegram: vi.fn(),
    fetchClients: vi.fn(),
    fetchLawyers: vi.fn(),
    clients,
    clientSearch: '',
    setClients: vi.fn(),
    setSelectedClient: vi.fn(),
    setDeleteConfirm: vi.fn(),
    setSavingClient: vi.fn(),
    setSavingLawyer: vi.fn(),
    setShowClientModal: vi.fn(),
    setShowLawyerModal: vi.fn(),
    nav: { closeModal: vi.fn() } as unknown as NavigationState,
    profile,
    ...overrides,
  };
}

// navigator.onLine — jsdom بيرجعها true افتراضيًا، بس بنتأكد ونتحكم فيها
// صراحة في كل تست يحتاجها (حالات الرفع أونلاين/أوفلاين).
function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

describe('useClientActions', () => {
  beforeEach(() => {
    mockDb = makeMockDb();
    vi.clearAllMocks();
    window.__dbWrite = vi.fn() as unknown as typeof window.__dbWrite;
    setOnline(true);
    getCurrentTenantId.mockReturnValue('tenant-1');
  });

  describe('handleSaveClient — فاليديشن الاسم', () => {
    it('اسم فاضي → توست خطأ "حقل مطلوب"، مفيش أي __dbWrite', async () => {
      const params = makeParams();
      const { handleSaveClient } = useClientActions(params);

      await handleSaveClient(makeForm({ full_name: '' }), null, null);

      expect(toast).toHaveBeenCalledWith('❌ حقل "اسم الموكل" مطلوب', true);
      expect(dbWriteMock()).not.toHaveBeenCalled();
    });

    it('اسم مسافات بس → نفس رفض الفاليديشن', async () => {
      const params = makeParams();
      const { handleSaveClient } = useClientActions(params);

      await handleSaveClient(makeForm({ full_name: '   ' }), null, null);

      expect(toast).toHaveBeenCalledWith('❌ حقل "اسم الموكل" مطلوب', true);
      expect(dbWriteMock()).not.toHaveBeenCalled();
    });
  });

  describe('handleSaveClient', () => {
    it('نجاح بدون ملفات (offline: false, غير متصل مش مهم لأنه مفيش ملفات) → INSERT عن طريق __dbWrite، توست نجاح، تسجيل نشاط، تليجرام، وfetchClients', async () => {
      dbWriteMock().mockResolvedValue({ error: null, offline: false, queued: false });
      const params = makeParams();
      const { handleSaveClient } = useClientActions(params);

      await handleSaveClient(makeForm({ phone: '0100000000' }), null, null);

      expect(dbWriteMock()).toHaveBeenCalledWith(expect.objectContaining({
        type: 'INSERT', table: 'clients',
        data: expect.objectContaining({ client_name: 'أحمد محمد', phone: '0100000000', client_type: 'individual' }),
      }));
      expect(toast).toHaveBeenCalledWith('✅ تم إضافة الموكل بنجاح!');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'إضافة موكل', expect.objectContaining({
        userName: 'المحامي سالم', entity_type: 'client', details: 'أحمد محمد', client_name: 'أحمد محمد',
      }));
      expect(params.sendTelegram).toHaveBeenCalled();
      expect(params.fetchClients).toHaveBeenCalledWith(0, '');
      expect(params.setSavingClient).toHaveBeenCalledWith(false);
      expect(params.setShowClientModal).toHaveBeenCalledWith(false);
    });

    it('مع ملفات هوية/توكيل أونلاين → رفع الاتنين على client-docs بمسار يبدأ بـ tenant_id، وresolveStorageUrl بتتنادى لكل واحد، والروابط بتتحط في contact_info', async () => {
      dbWriteMock().mockResolvedValue({ error: null, offline: false, queued: false });
      resolveStorageUrl.mockResolvedValueOnce('https://signed/id-url').mockResolvedValueOnce('https://signed/poa-url');
      const params = makeParams();
      const { handleSaveClient } = useClientActions(params);
      const idFile = new File(['id'], 'id.png', { type: 'image/png' });
      const poaFile = new File(['poa'], 'poa.pdf', { type: 'application/pdf' });

      await handleSaveClient(makeForm(), idFile, poaFile);

      expect(mockDb.uploadSpy).toHaveBeenCalledWith('client-docs', expect.stringMatching(/^tenant-1\/id_\d+\.png$/), idFile, { upsert: true });
      expect(mockDb.uploadSpy).toHaveBeenCalledWith('client-docs', expect.stringMatching(/^tenant-1\/poa_\d+\.pdf$/), poaFile, { upsert: true });
      expect(dbWriteMock()).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ contact_info: { id_url: 'https://signed/id-url', poa_url: 'https://signed/poa-url' } }),
      }));
    });

    it('offline (مفيش نت خالص) → مفيش أي محاولة رفع ملفات، والملفات بتتسجل null في contact_info', async () => {
      setOnline(false);
      dbWriteMock().mockResolvedValue({ error: null, offline: false, queued: false });
      const params = makeParams();
      const { handleSaveClient } = useClientActions(params);
      const idFile = new File(['id'], 'id.png', { type: 'image/png' });

      await handleSaveClient(makeForm(), idFile, null);

      expect(mockDb.uploadSpy).not.toHaveBeenCalled();
      expect(dbWriteMock()).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ contact_info: { id_url: null, poa_url: null } }),
      }));
    });

    it('ملف بصيغة غير مسموحة → توست فشل فوري من validateUploadFile الحقيقية، والرابط بيرجع null من غير محاولة رفع', async () => {
      dbWriteMock().mockResolvedValue({ error: null, offline: false, queued: false });
      const params = makeParams();
      const { handleSaveClient } = useClientActions(params);
      const badFile = new File(['x'], 'virus.exe', { type: 'application/octet-stream' });

      await handleSaveClient(makeForm(), badFile, null);

      expect(toast).toHaveBeenCalledWith(expect.stringContaining('❌'), true);
      expect(mockDb.uploadSpy).not.toHaveBeenCalled();
    });

    it('مفيش tenant حالي وقت رفع ملف → توست فشل تحديد المكتب، والرابط null', async () => {
      getCurrentTenantId.mockReturnValue(null);
      dbWriteMock().mockResolvedValue({ error: null, offline: false, queued: false });
      const params = makeParams();
      const { handleSaveClient } = useClientActions(params);
      const idFile = new File(['id'], 'id.png', { type: 'image/png' });

      await handleSaveClient(makeForm(), idFile, null);

      expect(toast).toHaveBeenCalledWith('❌ تعذر تحديد المكتب الحالي، أعد تحميل الصفحة وحاول مرة أخرى', true);
      expect(mockDb.uploadSpy).not.toHaveBeenCalled();
    });

    it('فشل رفع الملف نفسه (خطأ Storage) → الرابط بيرجع null من غير استدعاء resolveStorageUrl', async () => {
      mockDb.setResult('client-docs:upload', { error: { message: 'upload failed' } });
      dbWriteMock().mockResolvedValue({ error: null, offline: false, queued: false });
      const params = makeParams();
      const { handleSaveClient } = useClientActions(params);
      const idFile = new File(['id'], 'id.png', { type: 'image/png' });

      await handleSaveClient(makeForm(), idFile, null);

      expect(resolveStorageUrl).not.toHaveBeenCalled();
      expect(dbWriteMock()).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ contact_info: { id_url: null, poa_url: null } }),
      }));
    });

    it('الحقول الأربعة (phone2/address/kin_name/kin_phone) بتتبعت في الـ payload حتى في الإضافة الجديدة — FIX (2.1)', async () => {
      dbWriteMock().mockResolvedValue({ error: null, offline: false, queued: false });
      const params = makeParams();
      const { handleSaveClient } = useClientActions(params);

      await handleSaveClient(makeForm({
        phone2: '0111111111', address: 'القاهرة', kin_name: 'قريب', kin_phone: '0122222222',
      }), null, null);

      expect(dbWriteMock()).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          phone2: '0111111111', address: 'القاهرة', kin_name: 'قريب', kin_phone: '0122222222',
        }),
      }));
    });

    it('offline/queued → توست حفظ محلي، وإضافة تفاؤلية لعنصر جديد في state المحلي، من غير logActivity أو تليجرام', async () => {
      dbWriteMock().mockResolvedValue({ error: null, offline: true, queued: true });
      const params = makeParams();
      const { handleSaveClient } = useClientActions(params);

      await handleSaveClient(makeForm(), null, null);

      expect(toast).toHaveBeenCalledWith('📥 الموكل محفوظ محلياً — سيُضاف فور عودة الإنترنت');
      expect(params.setClients).toHaveBeenCalled();
      expect(logActivity).not.toHaveBeenCalled();
      expect(params.sendTelegram).not.toHaveBeenCalled();
      expect(params.fetchClients).not.toHaveBeenCalled();
    });

    it('فشل (error من غير offline) → توست فشل، وقف فوري من غير أي خطوة تانية، لكن setShowClientModal(false) لسه بتتنادى في النهاية', async () => {
      dbWriteMock().mockResolvedValue({ error: { message: 'insert failed' }, offline: false, queued: false });
      const params = makeParams();
      const { handleSaveClient } = useClientActions(params);

      await handleSaveClient(makeForm(), null, null);

      expect(toast).toHaveBeenCalledWith('❌ فشل حفظ بيانات الموكل — تحقق من الاتصال وأعد المحاولة', true);
      expect(logActivity).not.toHaveBeenCalled();
      expect(params.fetchClients).not.toHaveBeenCalled();
      expect(params.setSavingClient).toHaveBeenCalledWith(false);
    });
  });

  describe('handleDeleteClient — يعرض اختيار (بدون mode ثابتة)', () => {
    it('بينشئ deleteConfirm من غير mode ثابتة (عشان المودال يعرض شاشة اختيار أرشفة/حذف نهائي)، مع onConfirmArchive وonConfirmDelete جاهزين', async () => {
      const params = makeParams();
      const { handleDeleteClient } = useClientActions(params);

      await handleDeleteClient('client-1');

      expect(params.setDeleteConfirm).toHaveBeenCalledWith(expect.objectContaining({
        type: 'client', id: 'client-1', name: 'أحمد محمد',
      }));
      const deleteConfirmArg = (params.setDeleteConfirm as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(deleteConfirmArg.mode).toBeUndefined();
      expect(typeof deleteConfirmArg.onConfirmArchive).toBe('function');
      expect(typeof deleteConfirmArg.onConfirmDelete).toBe('function');
    });

    describe('اختيار "أرشفة" (onConfirmArchive)', () => {
      it('بيحدّث deleted_at، يقفل المودال، ويسجّل النشاط، ويصفّي الموكل من الـ state', async () => {
        mockDb.setResult('clients:update', { error: null });
        const params = makeParams();
        const { handleDeleteClient } = useClientActions(params);

        await handleDeleteClient('client-1');
        const deleteConfirmArg = (params.setDeleteConfirm as ReturnType<typeof vi.fn>).mock.calls[0][0];
        await deleteConfirmArg.onConfirmArchive();

        expect(mockDb.updateSpy).toHaveBeenCalledWith('clients', expect.objectContaining({ deleted_at: expect.any(String) }));
        expect(params.nav.closeModal).toHaveBeenCalledWith('delete');
        expect(params.setDeleteConfirm).toHaveBeenCalledWith(null);
        expect(toast).toHaveBeenCalledWith('📦 تم نقل الموكل للأرشيف');
        expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'أرشفة موكل', expect.objectContaining({
          entity_type: 'client', entity_id: 'client-1', client_name: 'أحمد محمد',
        }));
        expect(params.setSelectedClient).toHaveBeenCalledWith(null);
        expect(params.setClients).toHaveBeenCalled();
      });

      it('فشل الأرشفة → توست فشل، من غير logActivity أو تصفية الـ state', async () => {
        mockDb.setResult('clients:update', { error: { message: 'archive failed' } });
        const params = makeParams();
        const { handleDeleteClient } = useClientActions(params);

        await handleDeleteClient('client-1');
        const deleteConfirmArg = (params.setDeleteConfirm as ReturnType<typeof vi.fn>).mock.calls[0][0];
        await deleteConfirmArg.onConfirmArchive();

        expect(toast).toHaveBeenCalledWith('❌ فشل أرشفة الموكل — تحقق من الاتصال وأعد المحاولة', true);
        expect(logActivity).not.toHaveBeenCalled();
        expect(params.setSelectedClient).not.toHaveBeenCalled();
      });
    });

    describe('اختيار "حذف نهائي" (onConfirmDelete → handlePermanentDeleteClient)', () => {
      it('بيحذف صف الموكل فعليًا، يقفل المودال، ويسجّل النشاط', async () => {
        mockDb.setResult('clients:delete', { error: null });
        const params = makeParams();
        const { handleDeleteClient } = useClientActions(params);

        await handleDeleteClient('client-1');
        const deleteConfirmArg = (params.setDeleteConfirm as ReturnType<typeof vi.fn>).mock.calls[0][0];
        await deleteConfirmArg.onConfirmDelete();

        expect(mockDb.deleteSpy).toHaveBeenCalledWith('clients');
        expect(params.nav.closeModal).toHaveBeenCalledWith('delete');
        expect(params.setDeleteConfirm).toHaveBeenCalledWith(null);
        expect(toast).toHaveBeenCalledWith('🗑️ تم حذف الموكل نهائياً');
        expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'حذف موكل نهائياً', expect.objectContaining({
          entity_type: 'client', entity_id: 'client-1', client_name: 'أحمد محمد',
        }));
        expect(params.setSelectedClient).toHaveBeenCalledWith(null);
      });

      it('فشل الحذف النهائي (خطأ عام من قاعدة البيانات) → توست فشل، من غير logActivity أو تحديث state', async () => {
        mockDb.setResult('clients:delete', { error: { message: 'db error' } });
        const params = makeParams();
        const { handleDeleteClient } = useClientActions(params);

        await handleDeleteClient('client-1');
        const deleteConfirmArg = (params.setDeleteConfirm as ReturnType<typeof vi.fn>).mock.calls[0][0];
        await deleteConfirmArg.onConfirmDelete();

        expect(toast).toHaveBeenCalledWith('❌ فشل حذف الموكل نهائياً — تحقق من الاتصال وأعد المحاولة', true);
        expect(logActivity).not.toHaveBeenCalled();
        expect(params.setSelectedClient).not.toHaveBeenCalled();
      });
    });
  });

  describe('handlePermanentDeleteClient (استدعاء مباشر — نفس الدالة اللي هتُستخدم من قسم الأرشيف لاحقًا)', () => {
    it('نجاح → حذف الصف، توست نجاح، تسجيل نشاط، تحديث state المحلي', async () => {
      mockDb.setResult('clients:delete', { error: null });
      const params = makeParams();
      const { handlePermanentDeleteClient } = useClientActions(params);

      await handlePermanentDeleteClient('client-1');

      expect(mockDb.deleteSpy).toHaveBeenCalledWith('clients');
      expect(toast).toHaveBeenCalledWith('🗑️ تم حذف الموكل نهائياً');
      expect(params.setClients).toHaveBeenCalled();
    });
  });

  describe('handleRestoreClient', () => {
    it('نجاح → deleted_at:null، توست نجاح، تسجيل نشاط، وإعادة تحميل الموكلين', async () => {
      mockDb.setResult('clients:update', { error: null });
      const params = makeParams();
      const { handleRestoreClient } = useClientActions(params);

      await handleRestoreClient('client-1');

      expect(mockDb.updateSpy).toHaveBeenCalledWith('clients', { deleted_at: null });
      expect(toast).toHaveBeenCalledWith('✅ تم استرجاع الموكل');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'استرجاع موكل من الأرشيف', expect.objectContaining({
        entity_type: 'client', entity_id: 'client-1',
      }));
      expect(params.fetchClients).toHaveBeenCalledWith(0, '');
    });

    it('فشل → توست فشل، من غير تسجيل نشاط أو إعادة تحميل', async () => {
      mockDb.setResult('clients:update', { error: { message: 'restore failed' } });
      const params = makeParams();
      const { handleRestoreClient } = useClientActions(params);

      await handleRestoreClient('client-1');

      expect(toast).toHaveBeenCalledWith('❌ فشل استرجاع الموكل — تحقق من الاتصال وأعد المحاولة', true);
      expect(logActivity).not.toHaveBeenCalled();
      expect(params.fetchClients).not.toHaveBeenCalled();
    });
  });

  describe('handleUpdateClient — فاليديشن الاسم', () => {
    it('اسم فاضي → توست خطأ "حقل مطلوب"، مفيش أي safeUpdate', async () => {
      const params = makeParams();
      const { handleUpdateClient } = useClientActions(params);

      await handleUpdateClient('client-1', makeForm({ full_name: '' }));

      expect(toast).toHaveBeenCalledWith('❌ حقل "اسم الموكل" مطلوب', true);
      expect(safeUpdate).not.toHaveBeenCalled();
    });
  });

  describe('handleUpdateClient', () => {
    it('نجاح كامل (عن طريق safeUpdate) → توست نجاح، تسجيل نشاط، إعادة تحميل، إغلاق المودال، وتصفير الموكل المختار', async () => {
      safeUpdate.mockResolvedValue({ success: true, conflict: false });
      const params = makeParams();
      const { handleUpdateClient } = useClientActions(params);

      await handleUpdateClient('client-1', makeForm({ full_name: 'أحمد معدّل' }));

      expect(safeUpdate).toHaveBeenCalledWith(expect.anything(), 'clients', 'client-1', expect.objectContaining({
        client_name: 'أحمد معدّل',
      }), '2026-07-01T00:00:00.000Z');
      expect(toast).toHaveBeenCalledWith('✅ تم تحديث بيانات الموكل');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تعديل موكل', expect.objectContaining({
        entity_type: 'client', entity_id: 'client-1', client_name: 'أحمد معدّل',
      }));
      expect(params.fetchClients).toHaveBeenCalledWith(0, '');
      expect(params.nav.closeModal).toHaveBeenCalledWith('clientDetail');
      expect(params.setSelectedClient).toHaveBeenCalledWith(null);
    });

    it('تعارض (conflict:true) → وقف فوري من غير توست نجاح أو fetchClients', async () => {
      safeUpdate.mockResolvedValue({ success: false, conflict: true });
      const params = makeParams();
      const { handleUpdateClient } = useClientActions(params);

      await handleUpdateClient('client-1', makeForm());

      expect(toast).not.toHaveBeenCalledWith('✅ تم تحديث بيانات الموكل');
      expect(params.fetchClients).not.toHaveBeenCalled();
    });

    it('فشل (success:false, conflict:false) → توست فشل، من غير fetchClients', async () => {
      safeUpdate.mockResolvedValue({ success: false, conflict: false });
      const params = makeParams();
      const { handleUpdateClient } = useClientActions(params);

      await handleUpdateClient('client-1', makeForm());

      expect(toast).toHaveBeenCalledWith('❌ فشل تعديل بيانات الموكل — تحقق من الاتصال وأعد المحاولة', true);
      expect(params.fetchClients).not.toHaveBeenCalled();
    });

    it('روابط id_url/poa_url موجودة قبل كده وبدون ملفات جديدة → بتفضل زي ما هي في contact_info المبعوت لـ safeUpdate', async () => {
      safeUpdate.mockResolvedValue({ success: true, conflict: false });
      const clientWithContact = { ...clients[0], contact_info: { id_url: 'https://old/id', poa_url: 'https://old/poa' } } as unknown as ClientRow;
      const params = makeParams({ clients: [clientWithContact] });
      const { handleUpdateClient } = useClientActions(params);

      await handleUpdateClient('client-1', makeForm());

      expect(safeUpdate).toHaveBeenCalledWith(expect.anything(), 'clients', 'client-1', expect.objectContaining({
        contact_info: { id_url: 'https://old/id', poa_url: 'https://old/poa' },
      }), expect.anything());
      expect(mockDb.uploadSpy).not.toHaveBeenCalled();
    });

    it('ملف هوية جديد أونلاين → رفع بمسار tenant_id، والرابط الجديد بيستبدل القديم في contact_info، والرابط التاني (poa) بيفضل من غير تغيير', async () => {
      safeUpdate.mockResolvedValue({ success: true, conflict: false });
      resolveStorageUrl.mockResolvedValueOnce('https://new/id-url');
      const clientWithContact = { ...clients[0], contact_info: { id_url: 'https://old/id', poa_url: 'https://old/poa' } } as unknown as ClientRow;
      const params = makeParams({ clients: [clientWithContact] });
      const { handleUpdateClient } = useClientActions(params);
      const idFile = new File(['id'], 'newid.png', { type: 'image/png' });

      await handleUpdateClient('client-1', makeForm(), idFile, null);

      expect(mockDb.uploadSpy).toHaveBeenCalledWith('client-docs', expect.stringMatching(/^tenant-1\/id_\d+\.png$/), idFile, { upsert: true });
      expect(safeUpdate).toHaveBeenCalledWith(expect.anything(), 'clients', 'client-1', expect.objectContaining({
        contact_info: { id_url: 'https://new/id-url', poa_url: 'https://old/poa' },
      }), expect.anything());
    });

    it('الموكل مش موجود في الـ state المحلي (clientId مش موجود) → updated_at بيتبعت null، وcontact_info الافتراضي فاضي', async () => {
      safeUpdate.mockResolvedValue({ success: true, conflict: false });
      const params = makeParams();
      const { handleUpdateClient } = useClientActions(params);

      await handleUpdateClient('client-not-found', makeForm());

      expect(safeUpdate).toHaveBeenCalledWith(expect.anything(), 'clients', 'client-not-found', expect.objectContaining({
        contact_info: { id_url: null, poa_url: null },
      }), null);
    });
  });

  describe('handleSaveLawyer', () => {
    it('نجاح → callAdminAction بـ action:create_lawyer، توست نجاح، تسجيل نشاط، إغلاق المودال، وfetchLawyers', async () => {
      callAdminAction.mockResolvedValue({ ok: true });
      const params = makeParams();
      const { handleSaveLawyer } = useClientActions(params);

      await handleSaveLawyer({ email: 'new@example.com', password: 'pass1234', full_name: 'محامي جديد', role: 'lawyer' });

      expect(callAdminAction).toHaveBeenCalledWith({
        action: 'create_lawyer', email: 'new@example.com', password: 'pass1234', full_name: 'محامي جديد', role: 'lawyer',
      });
      expect(toast).toHaveBeenCalledWith('✅ تم إنشاء حساب محامي جديد بنجاح!');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'إضافة مستخدم', expect.objectContaining({
        userName: 'المحامي سالم', entity_type: 'user', details: 'محامي جديد (lawyer)',
      }));
      expect(params.setShowLawyerModal).toHaveBeenCalledWith(false);
      expect(params.fetchLawyers).toHaveBeenCalled();
      expect(params.setSavingLawyer).toHaveBeenCalledWith(false);
    });

    it('🆕 فشل (callAdminAction بترمي Error) → الرسالة الموحدة تتعرض، والخام يتسجل عبر recordError، من غير logActivity أو إغلاق المودال', async () => {
      callAdminAction.mockRejectedValue(new Error('البريد مستخدم بالفعل'));
      const params = makeParams();
      const { handleSaveLawyer } = useClientActions(params);

      await handleSaveLawyer({ email: 'dup@example.com', password: 'pass1234', full_name: 'محامي مكرر' });

      expect(toast).toHaveBeenCalledWith('❌ تعذّر إنشاء الحساب. تحقق من صحة البيانات وحاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', true);
      expect(recordError).toHaveBeenCalledWith('client_create_lawyer_account', 'البريد مستخدم بالفعل', expect.objectContaining({ label: 'إنشاء حساب محامي' }));
      expect(logActivity).not.toHaveBeenCalled();
      expect(params.setShowLawyerModal).not.toHaveBeenCalled();
      expect(params.fetchLawyers).not.toHaveBeenCalled();
      expect(params.setSavingLawyer).toHaveBeenCalledWith(false);
    });

    it('🆕 فشل باستثناء غير Error (مثلاً رمي قيمة عادية) → نفس الرسالة الموحدة', async () => {
      callAdminAction.mockRejectedValue('some string error');
      const params = makeParams();
      const { handleSaveLawyer } = useClientActions(params);

      await handleSaveLawyer({ email: 'x@example.com', password: 'pass1234', full_name: 'محامي' });

      expect(toast).toHaveBeenCalledWith('❌ تعذّر إنشاء الحساب. تحقق من صحة البيانات وحاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', true);
      expect(recordError).toHaveBeenCalledWith('client_create_lawyer_account', 'some string error', expect.objectContaining({ label: 'إنشاء حساب محامي' }));
    });
  });
});
