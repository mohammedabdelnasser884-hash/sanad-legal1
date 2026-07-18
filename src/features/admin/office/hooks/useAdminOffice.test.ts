import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAdminOffice } from './useAdminOffice';
import type { ProfileRow } from '../../../../types';

// ══════════════════════════════════════════════════════════════════
// Mock db (supabaseClient) — بيغطي بالظبط سلاسل الاستدعاءات الفعلية في
// useAdminOffice.ts (اتأكدت منها بقراءة الكود، مفيش تخمين):
//   - db.from('office_settings').select('*').eq('tenant_id',x).limit(1).maybeSingle()   [fetchOfficeSettings]
//   - db.from('office_settings').select('id').eq('tenant_id',x).limit(1).maybeSingle()  [handleSaveOfficeSettings — فحص وجود صف قديم]
//   - db.from('office_settings').update(payload).eq('id', existing.id)                  [handleSaveOfficeSettings — تعديل]
//   - db.from('office_settings').insert({...payload, tenant_id})                        [handleSaveOfficeSettings — إنشاء]
//   - db.storage.from('client-docs').upload(path, file, {upsert:true})                  [handleSaveOfficeSettings — رفع شعار جديد]
// select('*') و select('id') بيترجعوا نتايج مختلفة، فبنفرّق بينهم بالـ cols
// في مفتاح التخزين المؤقت configured[].
// ══════════════════════════════════════════════════════════════════
type Result = { data?: unknown; error?: { message?: string } | null };
const EMPTY: Result = { data: null, error: null };

function makeMockDb() {
  const configured: Record<string, Result> = {};
  const updateSpy = vi.fn();
  const insertSpy = vi.fn();
  const uploadSpy = vi.fn();

  const setResult = (key: string, result: Result) => { configured[key] = result; };
  const get = (key: string) => configured[key] ?? EMPTY;

  const from = vi.fn((table: string) => ({
    select: vi.fn((cols: string) => ({
      eq: vi.fn(() => ({
        limit: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve(get(`${table}:select:${cols}`))),
        })),
      })),
    })),
    update: vi.fn((payload: Record<string, unknown>) => {
      updateSpy(table, payload);
      return { eq: vi.fn((col: string, val: unknown) => { updateSpy('eq', col, val); return Promise.resolve(get(`${table}:update`)); }) };
    }),
    insert: vi.fn((payload: Record<string, unknown>) => {
      insertSpy(table, payload);
      return Promise.resolve(get(`${table}:insert`));
    }),
  }));

  const storageFrom = vi.fn((bucket: string) => ({
    upload: vi.fn((path: string, file: unknown, opts: unknown) => {
      uploadSpy(bucket, path, file, opts);
      return Promise.resolve(get(`${bucket}:upload`));
    }),
  }));

  return { from, storageFrom, setResult, updateSpy, insertSpy, uploadSpy };
}

let mockDb = makeMockDb();
vi.mock('../../../../supabaseClient', () => ({
  db: {
    from: (...a: Parameters<typeof mockDb.from>) => mockDb.from(...a),
    storage: { from: (...a: Parameters<typeof mockDb.storageFrom>) => mockDb.storageFrom(...a) },
  },
}));

const toast = vi.fn();
vi.mock('../../../../shared/lib/notifications', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const logActivity = vi.fn();
vi.mock('../../../../shared/lib/dataAccess', () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

const validateUploadFile = vi.fn((_file: { name: string; size: number }) => null as string | null);
const resolveStorageUrl = vi.fn((_bucket: string, _pathOrUrl: string | null | undefined) => Promise.resolve('https://signed.example/logo.png' as string | null));
vi.mock('../../../../shared/lib/storage', () => ({
  validateUploadFile: (...a: unknown[]) => validateUploadFile(...(a as [{ name: string; size: number }])),
  resolveStorageUrl: (...a: unknown[]) => resolveStorageUrl(...(a as [string, string | null | undefined])),
}));

const invalidateOfficeCache = vi.fn();
vi.mock('../../../../constants', () => ({ invalidateOfficeCache: () => invalidateOfficeCache() }));

const recordError = vi.fn();
vi.mock('../../../../systemHealth', () => ({ recordError: (...a: unknown[]) => recordError(...a) }));

const PROFILE = { id: 'admin-1', full_name: 'أحمد المدير' } as unknown as ProfileRow;

beforeEach(() => {
  mockDb = makeMockDb();
  toast.mockClear();
  logActivity.mockClear();
  validateUploadFile.mockClear();
  validateUploadFile.mockReturnValue(null);
  resolveStorageUrl.mockClear();
  resolveStorageUrl.mockResolvedValue('https://signed.example/logo.png');
  invalidateOfficeCache.mockClear();
  recordError.mockClear();
});

function setup(tenantId: string | null = 'tenant-1', profile: ProfileRow | null | undefined = PROFILE) {
  return renderHook(() => useAdminOffice(tenantId, profile));
}

describe('useAdminOffice', () => {
  describe('fetchOfficeSettings', () => {
    it('من غير tenantId (null) → مفيش أي نداء لقاعدة البيانات خالص', async () => {
      const { result } = setup(null);
      await act(async () => { await result.current.fetchOfficeSettings(); });
      expect(mockDb.from).not.toHaveBeenCalled();
      expect(result.current.loadingOffice).toBe(false);
    });

    it('لقى صف موجود → بيحوّل الأعمدة من snake_case لـ camelCase صح، وبيولّد رابط موقّع للشعار', async () => {
      mockDb.setResult('office_settings:select:*', {
        data: {
          name: 'مكتب الأمل', slogan: 'شعار', logo_url: 'office/tenant-1/logo.png',
          brand_color: '#123456', accent_color: '#654321',
          tax_number: '123', license_number: '456',
          bank_name: 'بنك مصر', bank_iban: 'EG123',
          invoice_prefix: 'INV-2026-', invoice_footer: 'شكرًا',
          country: 'SA',
        },
        error: null,
      });
      const { result } = setup();
      await act(async () => { await result.current.fetchOfficeSettings(); });

      expect(result.current.officeSettings).toMatchObject({
        name: 'مكتب الأمل', slogan: 'شعار', logoUrl: 'office/tenant-1/logo.png',
        brandColor: '#123456', accentColor: '#654321',
        taxNumber: '123', licenseNumber: '456',
        bankName: 'بنك مصر', bankIban: 'EG123',
        invoicePrefix: 'INV-2026-', invoiceFooter: 'شكرًا',
        country: 'SA',
      });
      expect(resolveStorageUrl).toHaveBeenCalledWith('client-docs', 'office/tenant-1/logo.png');
      await waitFor(() => expect(result.current.logoPreview).toBe('https://signed.example/logo.png'));
      expect(result.current.loadingOffice).toBe(false);
    });

    it('مفيش صف محفوظ (data:null) → officeSettings بتفضل بالقيم الافتراضية، من غير كراش', async () => {
      const { result } = setup();
      await act(async () => { await result.current.fetchOfficeSettings(); });
      expect(result.current.officeSettings.name).toBe('');
      expect(result.current.officeSettings.brandColor).toBe('#D4AF37');
      expect(resolveStorageUrl).not.toHaveBeenCalled();
      expect(result.current.loadingOffice).toBe(false);
    });

    it('لو الاستعلام رمى استثناء (الجدول لسه مش موجود مثلًا) → بيتبلع بصمت، loadingOffice بيرجع false', async () => {
      mockDb.from = vi.fn(() => { throw new Error('relation does not exist'); });
      const { result } = setup();
      await act(async () => { await result.current.fetchOfficeSettings(); });
      expect(result.current.loadingOffice).toBe(false);
    });
  });

  describe('handleSaveOfficeSettings', () => {
    it('من غير tenantId → توست فشل فقط، savingOffice بتفضل false، مفيش أي نداء لقاعدة البيانات', async () => {
      const { result } = setup(null);
      await act(async () => { await result.current.handleSaveOfficeSettings(); });
      expect(toast).toHaveBeenCalledWith('❌ لا يمكن الحفظ، تعذر تحديد المكتب الحالي', true);
      expect(result.current.savingOffice).toBe(false);
      expect(mockDb.from).not.toHaveBeenCalled();
    });

    it('نجاح من غير شعار جديد، ومفيش صف قديم → insert بـ tenant_id، invalidateOfficeCache، توست نجاح، logActivity', async () => {
      const { result } = setup();
      act(() => { result.current.setOfficeSettings((s) => ({ ...s, name: 'مكتب الأمل' })); });

      await act(async () => { await result.current.handleSaveOfficeSettings(); });

      expect(mockDb.insertSpy).toHaveBeenCalledWith('office_settings', expect.objectContaining({ name: 'مكتب الأمل', tenant_id: 'tenant-1' }));
      expect(mockDb.updateSpy).not.toHaveBeenCalled();
      expect(invalidateOfficeCache).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalledWith('✅ تم حفظ إعدادات المكتب');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تعديل إعدادات المكتب', { userName: 'أحمد المدير', entity_type: 'office', details: 'مكتب الأمل' });
      expect(result.current.savingOffice).toBe(false);
    });

    it('نجاح ولقى صف قديم (existing.id) → update بدل insert', async () => {
      mockDb.setResult('office_settings:select:id', { data: { id: 'row-1' }, error: null });
      const { result } = setup();

      await act(async () => { await result.current.handleSaveOfficeSettings(); });

      expect(mockDb.updateSpy).toHaveBeenCalledWith('office_settings', expect.any(Object));
      expect(mockDb.updateSpy).toHaveBeenCalledWith('eq', 'id', 'row-1');
      expect(mockDb.insertSpy).not.toHaveBeenCalled();
    });

    it('فيه ملف شعار جديد لكن validateUploadFile رفضه → توست برسالة الفحص، مفيش أي محاولة رفع أو حفظ', async () => {
      validateUploadFile.mockReturnValue('صيغة الملف غير مسموحة');
      const fakeFile = { name: 'logo.exe', size: 100 } as unknown as File;
      const { result } = setup();
      act(() => { result.current.setLogoFile(fakeFile); });

      await act(async () => { await result.current.handleSaveOfficeSettings(); });

      expect(toast).toHaveBeenCalledWith('❌ صيغة الملف غير مسموحة', true);
      expect(mockDb.uploadSpy).not.toHaveBeenCalled();
      expect(mockDb.from).not.toHaveBeenCalled();
      expect(result.current.savingOffice).toBe(false);
    });

    it('رفع شعار ناجح → upload بالمسار الصح، وربط رابط موقّع جديد كـ logoUrl، وتصفير logoFile', async () => {
      const fakeFile = { name: 'logo.png', size: 100 } as unknown as File;
      resolveStorageUrl.mockResolvedValue('https://signed.example/new-logo.png');
      const { result } = setup();
      act(() => { result.current.setLogoFile(fakeFile); });

      await act(async () => { await result.current.handleSaveOfficeSettings(); });

      expect(mockDb.uploadSpy).toHaveBeenCalledWith('client-docs', 'office/tenant-1/logo.png', fakeFile, { upsert: true });
      expect(mockDb.insertSpy).toHaveBeenCalledWith('office_settings', expect.objectContaining({ logo_url: 'https://signed.example/new-logo.png' }));
      expect(result.current.officeSettings.logoUrl).toBe('https://signed.example/new-logo.png');
      expect(result.current.logoFile).toBeNull();
    });

    it('BUG FIX الموثّق بالكود: فشل رفع الشعار (upErr) → بيوقف الحفظ بالكامل ويعرض سبب الفشل، مش نجاح خادع', async () => {
      mockDb.setResult('client-docs:upload', { error: { message: 'مساحة التخزين ممتلئة' } });
      const fakeFile = { name: 'logo.png', size: 100 } as unknown as File;
      const { result } = setup();
      act(() => { result.current.setLogoFile(fakeFile); });

      await act(async () => { await result.current.handleSaveOfficeSettings(); });

      expect(toast).toHaveBeenCalledWith('❌ تعذّر رفع شعار المكتب. تأكد إن حجم الصورة مناسب وحاول تاني. لو المشكلة استمرت، تواصل مع الدعم.', true);
      expect(recordError).toHaveBeenCalledWith('office_logo_upload', 'مساحة التخزين ممتلئة', expect.objectContaining({ label: 'رفع شعار المكتب' }));
      expect(resolveStorageUrl).not.toHaveBeenCalled();
      expect(mockDb.insertSpy).not.toHaveBeenCalled();
      expect(mockDb.updateSpy).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalledWith('✅ تم حفظ إعدادات المكتب');
      expect(result.current.savingOffice).toBe(false);
    });

    it('فشل الحفظ نفسه (insert/update بيرجع error) → توست برسالة الخطأ، من غير logActivity', async () => {
      mockDb.setResult('office_settings:insert', { error: { message: 'قيمة مكررة' } });
      const { result } = setup();

      await act(async () => { await result.current.handleSaveOfficeSettings(); });

      expect(toast).toHaveBeenCalledWith('❌ تعذّر حفظ إعدادات المكتب. تحقق من الاتصال بالإنترنت وحاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', true);
      expect(recordError).toHaveBeenCalledWith('save_office_settings', 'قيمة مكررة', expect.objectContaining({ label: 'حفظ إعدادات المكتب' }));
      expect(logActivity).not.toHaveBeenCalled();
      expect(invalidateOfficeCache).not.toHaveBeenCalled();
    });

    it('🆕 فشل باستثناء غير Error (مش عنده .message) → نفس الرسالة الموحدة، والخام (String(e)) يتسجل عبر recordError', async () => {
      mockDb.from = vi.fn((table: string) => {
        if (table === 'office_settings') {
          throw 'some string error';
        }
        return { select: vi.fn(), update: vi.fn(), insert: vi.fn() };
      });
      const { result } = setup();
      await act(async () => { await result.current.handleSaveOfficeSettings(); });
      expect(toast).toHaveBeenCalledWith('❌ تعذّر حفظ إعدادات المكتب. تحقق من الاتصال بالإنترنت وحاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', true);
      expect(recordError).toHaveBeenCalledWith('save_office_settings', 'some string error', expect.objectContaining({ label: 'حفظ إعدادات المكتب' }));
    });

    it('من غير profile (undefined) → logActivity بـ userName:null', async () => {
      const { result } = renderHook(() => useAdminOffice('tenant-1', undefined));
      await act(async () => { await result.current.handleSaveOfficeSettings(); });
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تعديل إعدادات المكتب', expect.objectContaining({ userName: null }));
    });
  });
});
