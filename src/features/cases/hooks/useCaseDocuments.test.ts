import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ClientRow, ProfileRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';

// ══════════════════════════════════════════════════════════════════
// Mock db (supabaseClient) — بيغطي بالظبط سلاسل الاستدعاءات المباشرة
// الموجودة فعليًا في useCaseDocuments.ts (اتأكدت منها بقراءة الكود):
//   - db.storage.from('case-docs').upload(safeName, file, {upsert:true})  [handleUploadDoc]
//   - db.storage.from('case-docs').remove([path])                        [handleDeleteDoc]
//   - db.from('case_documents').insert([{...}])                          [handleUploadDoc]
//   - db.from('case_documents').delete().eq('id', x)                     [handleDeleteDoc]
// ══════════════════════════════════════════════════════════════════
type Result = { data?: unknown; error?: unknown };

function makeMockDb() {
  const configured: Record<string, Result> = {};
  const insertSpy = vi.fn();
  const deleteSpy = vi.fn();
  const uploadSpy = vi.fn();
  const removeSpy = vi.fn();

  const setResult = (key: string, result: Result) => { configured[key] = result; };
  const get = (key: string, fallback: Result) => configured[key] ?? fallback;

  const from = vi.fn((table: string) => ({
    insert: vi.fn((payload: unknown) => {
      insertSpy(table, payload);
      return Promise.resolve(get(`${table}:insert`, { error: null }));
    }),
    delete: vi.fn(() => ({
      eq: vi.fn((col: string, val: unknown) => {
        deleteSpy(table, val);
        return Promise.resolve(get(`${table}:delete`, { error: null }));
      }),
    })),
  }));

  const storageFrom = vi.fn((bucket: string) => ({
    upload: vi.fn((path: string, file: unknown, opts: unknown) => {
      uploadSpy(bucket, path, file, opts);
      return Promise.resolve(get(`${bucket}:upload`, { error: null }));
    }),
    remove: vi.fn((paths: string[]) => {
      removeSpy(bucket, paths);
      return Promise.resolve(get(`${bucket}:remove`, { error: null }));
    }),
  }));

  return { from, storageFrom, setResult, insertSpy, deleteSpy, uploadSpy, removeSpy };
}

let mockDb = makeMockDb();
vi.mock('../../../supabaseClient', () => ({
  db: {
    from: (...a: Parameters<typeof mockDb.from>) => mockDb.from(...a),
    storage: { from: (...a: Parameters<typeof mockDb.storageFrom>) => mockDb.storageFrom(...a) },
  },
}));

const toast = vi.fn();
vi.mock('../../../shared/lib/notifications', () => ({ toast: (...a: unknown[]) => toast(...a) }));

// ⚠️ بنسيب validateUploadFile حقيقية (منطق نقي مفيدلنا نختبره فعليًا)
// وبنعمل mock بس لـ resolveStorageUrl (بتنادي db.storage.createSignedUrl
// اللي مش جزء من التستات دي).
const resolveStorageUrl = vi.fn();
vi.mock('../../../shared/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/lib/storage')>();
  return { ...actual, resolveStorageUrl: (...a: unknown[]) => resolveStorageUrl(...a) };
});

const logActivity = vi.fn();
vi.mock('../../../shared/lib/dataAccess', () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

const getCurrentTenantId = vi.fn();
vi.mock('../../../constants', () => ({ getCurrentTenantId: () => getCurrentTenantId() }));

const recordError = vi.fn();
vi.mock('../../../systemHealth', () => ({ recordError: (...a: unknown[]) => recordError(...a) }));

import { useCaseDocuments } from './useCaseDocuments';

const client: ClientRow = { id: 'client-1', full_name: 'أحمد محمد' } as ClientRow;
const profile: ProfileRow = { id: 'lawyer-1', full_name: 'المحامي سالم' } as ProfileRow;

function makeCase(overrides: Partial<MappedCase> = {}): MappedCase {
  return {
    id: 'case-1', number: '10', title: 'قضية مدنية', court: 'محكمة الجيزة', type: 'مدني',
    court_level: null, circuit_number: null, status: 'نشطة', date: '2026-07-01', client_id: 'client-1',
    plaintiff: null, plaintiff_role: null, defendant: null, defendant_role: null, year: 2026, updated_at: '2026-07-16T10:00:00.000Z', court_floor: null,
    court_hall: null, session_hall: null, secretary_hall: null, secretary_name: null, session_time: null,
    ...overrides,
  } as MappedCase;
}

function fakeFile(name: string, size = 1000) {
  return { name, size } as unknown as File;
}

function fakeEvent(file: File | undefined) {
  return { target: { files: file ? [file] : [], value: 'C:\\fakepath\\x' } } as unknown as { target: HTMLInputElement };
}

function renderDocsHook(caseData: MappedCase = makeCase()) {
  const refetchAll = vi.fn();
  const view = renderHook(() => useCaseDocuments(caseData, client, profile, refetchAll));
  return { ...view, refetchAll };
}

beforeEach(() => {
  mockDb = makeMockDb();
  vi.clearAllMocks();
  getCurrentTenantId.mockReturnValue('tenant-a');
  resolveStorageUrl.mockResolvedValue('https://signed-url.example/doc');
});

describe('useCaseDocuments — handleFileSelect', () => {
  it('من غير ملف مختار خالص → مفيش أي تغيير في الحالة', () => {
    const { result } = renderDocsHook();
    act(() => { result.current.handleFileSelect(fakeEvent(undefined)); });
    expect(result.current.pendingFile).toBeNull();
    expect(result.current.showDocForm).toBe(false);
  });

  it('صيغة ملف غير مسموحة → توست خطأ حقيقي من validateUploadFile، وتصفير قيمة input', () => {
    const { result } = renderDocsHook();
    const evt = fakeEvent(fakeFile('malware.exe', 1000));
    act(() => { result.current.handleFileSelect(evt); });
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('صيغة الملف ".exe" غير مسموحة'), true);
    expect(evt.target.value).toBe('');
    expect(result.current.pendingFile).toBeNull();
  });

  it('حجم الملف أكبر من 20 ميجا → توست خطأ الحجم', () => {
    const { result } = renderDocsHook();
    const evt = fakeEvent(fakeFile('big.pdf', 21 * 1024 * 1024));
    act(() => { result.current.handleFileSelect(evt); });
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('حجم الملف أكبر من المسموح'), true);
    expect(result.current.pendingFile).toBeNull();
  });

  it('ملف صحيح → pendingFile محفوظ، docLabel من الاسم بدون الامتداد، وshowDocForm يتفتح', () => {
    const { result } = renderDocsHook();
    const evt = fakeEvent(fakeFile('مذكرة الدفاع.pdf', 1000));
    act(() => { result.current.handleFileSelect(evt); });
    expect(result.current.pendingFile).not.toBeNull();
    expect(result.current.docLabel).toBe('مذكرة الدفاع');
    expect(result.current.showDocForm).toBe(true);
  });
});

describe('useCaseDocuments — handleUploadDoc', () => {
  it('من غير pendingFile → مفيش أي نداء رفع خالص', async () => {
    const { result } = renderDocsHook();
    await act(async () => { await result.current.handleUploadDoc(); });
    expect(mockDb.uploadSpy).not.toHaveBeenCalled();
  });

  it('مفيش tenant حالي → توست خطأ، من غير محاولة رفع', async () => {
    getCurrentTenantId.mockReturnValue(null);
    const { result } = renderDocsHook();
    act(() => { result.current.handleFileSelect(fakeEvent(fakeFile('ملف.pdf', 1000))); });
    await act(async () => { await result.current.handleUploadDoc(); });
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('تعذر تحديد المكتب الحالي'), true);
    expect(mockDb.uploadSpy).not.toHaveBeenCalled();
  });

  it('🆕 فشل الرفع للتخزين → الرسالة الموحدة تتعرض، والخام يتسجل عبر recordError، من غير أي إدخال في case_documents', async () => {
    mockDb.setResult('case-docs:upload', { error: { message: 'network error' } });
    const { result } = renderDocsHook();
    act(() => { result.current.handleFileSelect(fakeEvent(fakeFile('ملف.pdf', 1000))); });
    await act(async () => { await result.current.handleUploadDoc(); });
    expect(toast).toHaveBeenCalledWith('❌ تعذّر رفع المستند. تأكد من حجم الملف والاتصال بالإنترنت. لو المشكلة استمرت، تواصل مع الدعم.', true);
    expect(recordError).toHaveBeenCalledWith('case_document_upload', 'network error', expect.objectContaining({ label: 'رفع مستند' }));
    expect(mockDb.insertSpy).not.toHaveBeenCalled();
    expect(result.current.uploadingDoc).toBe(false);
  });

  it('نجاح كامل → رفع بمسار يبدأ بـ tenant_id، رابط موقّع، إدخال صحيح، توست نجاح، تسجيل نشاط، وتصفير الفورم', async () => {
    mockDb.setResult('case-docs:upload', { error: null });
    mockDb.setResult('case_documents:insert', { error: null });
    const { result, refetchAll } = renderDocsHook(makeCase({ type: 'تجاري' }));
    act(() => { result.current.handleFileSelect(fakeEvent(fakeFile('عقد.pdf', 2000))); });
    act(() => { result.current.setDocLabel('عقد إيجار'); });
    await act(async () => { await result.current.handleUploadDoc(); });

    expect(mockDb.uploadSpy).toHaveBeenCalledTimes(1);
    const [bucket, path, , opts] = mockDb.uploadSpy.mock.calls[0];
    expect(bucket).toBe('case-docs');
    expect(path).toMatch(/^tenant-a\/case_case-1_\d+\.pdf$/);
    expect(opts).toEqual({ upsert: true });

    expect(resolveStorageUrl).toHaveBeenCalledWith('case-docs', path);
    expect(mockDb.insertSpy).toHaveBeenCalledWith('case_documents', [expect.objectContaining({
      case_id: 'case-1', file_name: 'عقد إيجار', file_type: 'pdf',
      file_url: 'https://signed-url.example/doc', storage_path: path,
      category: 'مذكرة دفاع', original_name: 'عقد.pdf', file_size: 2000,
    })]);
    expect(toast).toHaveBeenCalledWith('✅ تم رفع المستند بنجاح');
    expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'رفع مستند', expect.objectContaining({
      entity_type: 'document', case_type: 'تجاري', client_name: 'أحمد محمد', userName: 'المحامي سالم',
    }));
    expect(result.current.showDocForm).toBe(false);
    expect(result.current.pendingFile).toBeNull();
    expect(result.current.docLabel).toBe('');
    expect(result.current.docCategory).toBe('مذكرة دفاع');
    expect(refetchAll).toHaveBeenCalled();
  });

  it('لو docLabel فاضي → بيستخدم اسم الملف الأصلي كـ file_name', async () => {
    mockDb.setResult('case-docs:upload', { error: null });
    mockDb.setResult('case_documents:insert', { error: null });
    const { result } = renderDocsHook();
    act(() => { result.current.handleFileSelect(fakeEvent(fakeFile('مستند.pdf', 500))); });
    act(() => { result.current.setDocLabel('   '); }); // فاضي بعد trim
    await act(async () => { await result.current.handleUploadDoc(); });
    expect(mockDb.insertSpy).toHaveBeenCalledWith('case_documents', [expect.objectContaining({ file_name: 'مستند.pdf' })]);
  });

  it('🆕 فشل الإدخال في case_documents (بعد رفع ناجح) → الرسالة الموحدة تتعرض، والخام يتسجل عبر recordError، من غير توست نجاح', async () => {
    mockDb.setResult('case-docs:upload', { error: null });
    mockDb.setResult('case_documents:insert', { error: { message: 'insert failed' } });
    const { result, refetchAll } = renderDocsHook();
    act(() => { result.current.handleFileSelect(fakeEvent(fakeFile('ملف.pdf', 1000))); });
    await act(async () => { await result.current.handleUploadDoc(); });

    expect(toast).toHaveBeenCalledWith('❌ تم رفع الملف لكن تعذّر حفظ بياناته. حاول تاني. لو المشكلة استمرت، تواصل مع الدعم.', true);
    expect(recordError).toHaveBeenCalledWith('case_document_upload', 'insert failed', expect.objectContaining({ label: 'حفظ بيانات المستند' }));
    expect(toast).not.toHaveBeenCalledWith('✅ تم رفع المستند بنجاح');
    expect(logActivity).not.toHaveBeenCalled();
    expect(refetchAll).not.toHaveBeenCalled();
  });
});

describe('useCaseDocuments — handleDeleteDoc', () => {
  const doc = { id: 'doc-1', file_name: 'ملف قديم.pdf', storage_path: 'tenant-a/case_case-1_123.pdf' };

  it('فشل حذف الملف من التخزين → توست فشل ثابت، من غير أي محاولة حذف من الجدول', async () => {
    mockDb.setResult('case-docs:remove', { error: { message: 'storage error' } });
    const { result, refetchAll } = renderDocsHook();
    await act(async () => { await result.current.handleDeleteDoc(doc); });

    expect(mockDb.removeSpy).toHaveBeenCalledWith('case-docs', [doc.storage_path]);
    expect(toast).toHaveBeenCalledWith('❌ فشل حذف الملف، حاول مرة أخرى', true);
    expect(mockDb.deleteSpy).not.toHaveBeenCalled();
    expect(result.current.deletingDocId).toBeNull();
    expect(refetchAll).not.toHaveBeenCalled();
  });

  it('نجح حذف الملف لكن فشل تحديث السجل في الجدول → توست مخصوص لهذه الحالة', async () => {
    mockDb.setResult('case-docs:remove', { error: null });
    mockDb.setResult('case_documents:delete', { error: { message: 'db error' } });
    const { result, refetchAll } = renderDocsHook();
    await act(async () => { await result.current.handleDeleteDoc(doc); });

    expect(toast).toHaveBeenCalledWith('❌ حُذف الملف لكن فشل تحديث السجل', true);
    expect(logActivity).not.toHaveBeenCalled();
    expect(refetchAll).not.toHaveBeenCalled();
  });

  it('نجاح كامل → حذف من التخزين ثم الجدول، توست نجاح، تسجيل نشاط بـ entity_id، وrefetchAll', async () => {
    mockDb.setResult('case-docs:remove', { error: null });
    mockDb.setResult('case_documents:delete', { error: null });
    const { result, refetchAll } = renderDocsHook();
    await act(async () => { await result.current.handleDeleteDoc(doc); });

    expect(mockDb.deleteSpy).toHaveBeenCalledWith('case_documents', 'doc-1');
    expect(toast).toHaveBeenCalledWith('🗑 تم حذف المستند');
    expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'حذف مستند', expect.objectContaining({
      entity_type: 'document', entity_id: 'doc-1',
    }));
    expect(result.current.deletingDocId).toBeNull();
    expect(refetchAll).toHaveBeenCalled();
  });

  it('storage_path فاضي (null) → بيبعت مصفوفة فيها سترنج فاضي بدل ما يفشل', async () => {
    mockDb.setResult('case-docs:remove', { error: null });
    mockDb.setResult('case_documents:delete', { error: null });
    const { result } = renderDocsHook();
    await act(async () => { await result.current.handleDeleteDoc({ id: 'doc-2', file_name: 'x', storage_path: null }); });
    expect(mockDb.removeSpy).toHaveBeenCalledWith('case-docs', ['']);
  });
});
