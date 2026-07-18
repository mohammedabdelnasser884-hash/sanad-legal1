import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ══════════════════════════════════════════════════════════════════
// Mock db (supabaseClient) — بيغطي سلاسل الاستدعاءات المباشرة الموجودة
// فعليًا في useClientLinking.ts (اتأكدت منها بقراءة الكود، مفيش تخمين):
//   - db.from('cases').insert([...]).select('id').single()             [handleLinkCase]
//   - db.from('clients').select('id,full_name').ilike(...).limit(3)    [handleLinkCase — بحث عن الموكل]
//   - db.from('cases').update({client_id}).eq('id', x)                 [handleLinkExistingClient/handleAddAndLinkClient]
//   - db.from('clients').insert([...]).select('id').single()           [handleAddAndLinkClient]
//   - db.from('clients').insert([...])  (من غير select/single)         [handleAddClientOnly]
// ══════════════════════════════════════════════════════════════════
type Result = { data?: unknown; error?: unknown };

function makeMockDb() {
  const configured: Record<string, Result> = {};
  const casesInsertSpy = vi.fn();
  const clientsInsertSpy = vi.fn();
  const casesUpdateSpy = vi.fn();
  const clientsIlikeSpy = vi.fn();
  const sessionsUpdateSpy = vi.fn();

  const setResult = (key: string, result: Result) => { configured[key] = result; };
  const get = (key: string, fallback: Result) => configured[key] ?? fallback;

  const from = vi.fn((table: string) => {
    if (table === 'cases') {
      return {
        insert: vi.fn((payload: unknown) => {
          casesInsertSpy(payload);
          return {
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve(get('cases:insert', { data: { id: 'new-case-1' }, error: null }))),
            })),
          };
        }),
        update: vi.fn((payload: unknown) => {
          casesUpdateSpy(payload);
          return { eq: vi.fn(() => Promise.resolve(get('cases:update', { error: null }))) };
        }),
      };
    }
    if (table === 'clients') {
      return {
        insert: vi.fn((payload: unknown) => {
          clientsInsertSpy(payload);
          return {
            // handleAddAndLinkClient بيستخدم .select('id').single()، بينما
            // handleAddClientOnly بيستخدم النتيجة على طول من غير .select() —
            // بنرجّع object فيه الاتنين، وهو await-able مباشرة (thenable)
            // عشان تغطي حالة استخدامه من غير .select() كمان.
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve(get('clients:insert:single', { data: { id: 'new-client-1' }, error: null }))),
            })),
            then: (resolve: (v: unknown) => unknown) => resolve(get('clients:insert:plain', { error: null })),
          };
        }),
        select: vi.fn(() => ({
          ilike: vi.fn((col: string, val: string) => {
            clientsIlikeSpy(col, val);
            return { limit: vi.fn(() => Promise.resolve(get('clients:select', { data: [], error: null }))) };
          }),
        })),
      };
    }
    if (table === 'case_sessions') {
      return {
        update: vi.fn((payload: unknown) => {
          sessionsUpdateSpy(payload);
          return { eq: vi.fn(() => Promise.resolve(get('sessions:update', { error: null }))) };
        }),
      };
    }
    return {};
  });

  return { from, setResult, casesInsertSpy, clientsInsertSpy, casesUpdateSpy, clientsIlikeSpy, sessionsUpdateSpy };
}

let mockDb = makeMockDb();
vi.mock('../../../supabaseClient', () => ({
  db: { from: (...a: Parameters<typeof mockDb.from>) => mockDb.from(...a) },
}));

const toast = vi.fn();
vi.mock('../../../shared/lib/notifications', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const recordError = vi.fn();
vi.mock('../../../systemHealth', () => ({ recordError: (...a: unknown[]) => recordError(...a) }));

const getCurrentTenantId = vi.fn();
vi.mock('../../../constants', () => ({ getCurrentTenantId: () => getCurrentTenantId() }));

import { useClientLinking, type SavedFormData } from './useClientLinking';
import type { Form } from '../NewStandaloneSessionModal';

function makeSavedFormData(overrides: Partial<Form> = {}, caseOverrides: Partial<Omit<SavedFormData, 'form'>> = {}): SavedFormData {
  const form: Form = {
    title: '', court: 'محكمة الجيزة', plaintiff: 'أحمد محمد', plaintiff_national_id: '',
    plaintiff_power_of_attorney: '', defendant: '', defendant_national_id: '', circuit_number: '',
    ...overrides,
  } as Form;
  return { form, finalCaseType: 'مدني', fullCaseNumber: '10 لسنة 2026', sessionId: null, ...caseOverrides };
}

describe('useClientLinking', () => {
  beforeEach(() => {
    mockDb = makeMockDb();
    vi.clearAllMocks();
    getCurrentTenantId.mockReturnValue('tenant-1');
  });

  describe('handleLinkCase', () => {
    it('savedFormData فاضي (null) → لا تفعل شيئًا، ومفيش أي استدعاء INSERT', async () => {
      const onSaved = vi.fn();
      const { result } = renderHook(() => useClientLinking(null, onSaved));

      await act(async () => { await result.current.handleLinkCase(); });

      expect(mockDb.casesInsertSpy).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('نجاح إنشاء القضية ولقاء موكل مطابق → toast نجاح، onSaved، تخزين createdCaseId، والبحث عن الموكل بيلاقي نتيجة → clientStep=found', async () => {
      mockDb.setResult('cases:insert', { data: { id: 'new-case-1' }, error: null });
      mockDb.setResult('clients:select', { data: [{ id: 'client-1', full_name: 'أحمد محمد' }], error: null });
      const onSaved = vi.fn();
      const saved = makeSavedFormData();
      const { result } = renderHook(() => useClientLinking(saved, onSaved));

      await act(async () => { await result.current.handleLinkCase(); });

      expect(mockDb.casesInsertSpy).toHaveBeenCalledWith([expect.objectContaining({
        case_number_official: '10 لسنة 2026', case_type: 'مدني', plaintiff: 'أحمد محمد', status: 'نشطة',
      })]);
      expect(toast).toHaveBeenCalledWith('✅ تم إنشاء ملف القضية');
      expect(onSaved).toHaveBeenCalled();
      expect(result.current.createdCaseId).toBe('new-case-1');
      expect(mockDb.clientsIlikeSpy).toHaveBeenCalledWith('full_name', '%أحمد محمد%');
      expect(result.current.clientStep).toBe('found');
      expect(result.current.foundClient).toEqual({ id: 'client-1', full_name: 'أحمد محمد' });
      expect(result.current.linkingCase).toBe(false);
    });

    it('نجاح إنشاء القضية لكن مفيش موكل مطابق في البحث → clientStep=notfound', async () => {
      mockDb.setResult('cases:insert', { data: { id: 'new-case-2' }, error: null });
      mockDb.setResult('clients:select', { data: [], error: null });
      const saved = makeSavedFormData();
      const { result } = renderHook(() => useClientLinking(saved, vi.fn()));

      await act(async () => { await result.current.handleLinkCase(); });

      expect(result.current.clientStep).toBe('notfound');
      expect(result.current.foundClient).toBe(null);
    });

    it('اسم المدعي فاضي/مسافات بس بعد trim → مفيش أي بحث عن موكل، clientStep=notfound فورًا', async () => {
      mockDb.setResult('cases:insert', { data: { id: 'new-case-3' }, error: null });
      const saved = makeSavedFormData({ plaintiff: '   ' });
      const { result } = renderHook(() => useClientLinking(saved, vi.fn()));

      await act(async () => { await result.current.handleLinkCase(); });

      expect(mockDb.clientsIlikeSpy).not.toHaveBeenCalled();
      expect(result.current.clientStep).toBe('notfound');
    });

    it('العنوان الفاضي في الفورم → بيستخدم fullCaseNumber كعنوان (fallback)', async () => {
      mockDb.setResult('cases:insert', { data: { id: 'new-case-4' }, error: null });
      mockDb.setResult('clients:select', { data: [], error: null });
      const saved = makeSavedFormData({ title: '' }, { fullCaseNumber: '20 لسنة 2026' });
      const { result } = renderHook(() => useClientLinking(saved, vi.fn()));

      await act(async () => { await result.current.handleLinkCase(); });

      expect(mockDb.casesInsertSpy).toHaveBeenCalledWith([expect.objectContaining({ title: '20 لسنة 2026' })]);
    });

    it('🆕 فشل إنشاء القضية (error) → الرسالة الموحدة تتعرض، والخام يتسجل عبر recordError، وقف فوري من غير onSaved أو بحث عن موكل', async () => {
      mockDb.setResult('cases:insert', { data: null, error: { message: 'insert failed' } });
      const onSaved = vi.fn();
      const saved = makeSavedFormData();
      const { result } = renderHook(() => useClientLinking(saved, onSaved));

      await act(async () => { await result.current.handleLinkCase(); });

      expect(toast).toHaveBeenCalledWith('❌ تعذّر إنشاء القضية. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', true);
      expect(recordError).toHaveBeenCalledWith('case_create', 'insert failed', expect.objectContaining({ label: 'إنشاء قضية' }));
      expect(onSaved).not.toHaveBeenCalled();
      expect(mockDb.clientsIlikeSpy).not.toHaveBeenCalled();
      expect(result.current.linkingCase).toBe(false);
    });

    it('استثناء غير متوقع (db.from ترمي) → يتلقّط في catch، توست خطأ عام، وlinkingCase بترجع false', async () => {
      mockDb.from.mockImplementationOnce(() => { throw new Error('boom'); });
      const saved = makeSavedFormData();
      const { result } = renderHook(() => useClientLinking(saved, vi.fn()));

      await act(async () => { await result.current.handleLinkCase(); });

      expect(toast).toHaveBeenCalledWith('❌ خطأ غير متوقع', true);
      expect(result.current.linkingCase).toBe(false);
    });

    it('🆕 لو savedFormData فيه sessionId (الجلسة الأصلية) → بعد إنشاء القضية بينفذ UPDATE على case_sessions.case_id بقيمة القضية الجديدة', async () => {
      mockDb.setResult('cases:insert', { data: { id: 'case-linked-1' }, error: null });
      mockDb.setResult('clients:select', { data: [], error: null });
      const saved = makeSavedFormData({}, { sessionId: 'session-abc' });
      const { result } = renderHook(() => useClientLinking(saved, vi.fn()));

      await act(async () => { await result.current.handleLinkCase(); });

      expect(mockDb.sessionsUpdateSpy).toHaveBeenCalledWith({ case_id: 'case-linked-1' });
    });

    it('🆕 مفيش sessionId (جلسة اتعملها case مباشرة من غير مرور بالمودال ده) → مفيش أي UPDATE على case_sessions', async () => {
      mockDb.setResult('cases:insert', { data: { id: 'case-nolink-1' }, error: null });
      mockDb.setResult('clients:select', { data: [], error: null });
      const saved = makeSavedFormData({}, { sessionId: null });
      const { result } = renderHook(() => useClientLinking(saved, vi.fn()));

      await act(async () => { await result.current.handleLinkCase(); });

      expect(mockDb.sessionsUpdateSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleLinkExistingClient', () => {
    it('مفيش createdCaseId أو foundClient → لا تفعل شيئًا', async () => {
      const { result } = renderHook(() => useClientLinking(makeSavedFormData(), vi.fn()));

      await act(async () => { await result.current.handleLinkExistingClient(); });

      expect(mockDb.casesUpdateSpy).not.toHaveBeenCalled();
    });

    it('نجاح الربط (بعد ما يبقى فيه createdCaseId وfoundClient من handleLinkCase) → UPDATE للقضية بـ client_id، توست نجاح، clientStep=done', async () => {
      mockDb.setResult('cases:insert', { data: { id: 'case-x' }, error: null });
      mockDb.setResult('clients:select', { data: [{ id: 'client-found-1', full_name: 'أحمد محمد' }], error: null });
      mockDb.setResult('cases:update', { error: null });
      const { result } = renderHook(() => useClientLinking(makeSavedFormData(), vi.fn()));
      await act(async () => { await result.current.handleLinkCase(); });

      await act(async () => { await result.current.handleLinkExistingClient(); });

      expect(mockDb.casesUpdateSpy).toHaveBeenCalledWith({ client_id: 'client-found-1' });
      expect(toast).toHaveBeenCalledWith('✅ تم ربط الموكل بالقضية');
      expect(result.current.clientStep).toBe('done');
      expect(result.current.linkingToCase).toBe(false);
    });

    it('🆕 فشل الربط (error) → الرسالة الموحدة تتعرض، والخام يتسجل عبر recordError، من غير تغيير clientStep', async () => {
      mockDb.setResult('cases:insert', { data: { id: 'case-y' }, error: null });
      mockDb.setResult('clients:select', { data: [{ id: 'client-found-2', full_name: 'محمد' }], error: null });
      mockDb.setResult('cases:update', { error: { message: 'update failed' } });
      const { result } = renderHook(() => useClientLinking(makeSavedFormData(), vi.fn()));
      await act(async () => { await result.current.handleLinkCase(); });

      await act(async () => { await result.current.handleLinkExistingClient(); });

      expect(toast).toHaveBeenCalledWith('❌ تعذّر ربط الموكل بالجلسة. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', true);
      expect(recordError).toHaveBeenCalledWith('session_client_link', 'update failed', expect.objectContaining({ label: 'ربط الموكل بالجلسة' }));
      expect(result.current.clientStep).toBe('found');
    });

    it('استثناء غير متوقع → توست خطأ عام، linkingToCase ترجع false', async () => {
      mockDb.setResult('cases:insert', { data: { id: 'case-z' }, error: null });
      mockDb.setResult('clients:select', { data: [{ id: 'client-found-3', full_name: 'سالم' }], error: null });
      const { result } = renderHook(() => useClientLinking(makeSavedFormData(), vi.fn()));
      await act(async () => { await result.current.handleLinkCase(); });
      mockDb.from.mockImplementationOnce(() => { throw new Error('boom'); });

      await act(async () => { await result.current.handleLinkExistingClient(); });

      expect(toast).toHaveBeenCalledWith('❌ خطأ غير متوقع', true);
      expect(result.current.linkingToCase).toBe(false);
    });
  });

  describe('handleAddAndLinkClient', () => {
    it('مفيش savedFormData أو createdCaseId → لا تفعل شيئًا', async () => {
      const { result } = renderHook(() => useClientLinking(null, vi.fn()));

      await act(async () => { await result.current.handleAddAndLinkClient(); });

      expect(mockDb.clientsInsertSpy).not.toHaveBeenCalled();
    });

    it('اسم المدعي فاضي بعد trim → لا تفعل شيئًا حتى لو فيه createdCaseId', async () => {
      mockDb.setResult('cases:insert', { data: { id: 'case-empty' }, error: null });
      const saved = makeSavedFormData({ plaintiff: '  ' });
      const { result } = renderHook(() => useClientLinking(saved, vi.fn()));
      await act(async () => { await result.current.handleLinkCase(); });

      await act(async () => { await result.current.handleAddAndLinkClient(); });

      expect(mockDb.clientsInsertSpy).not.toHaveBeenCalled();
    });

    it('نجاح كامل (إضافة موكل جديد + ربط) → INSERT بـ full_name/national_id، UPDATE للقضية بـ client_id الجديد، توست نجاح، clientStep=done', async () => {
      mockDb.setResult('cases:insert', { data: { id: 'case-add-1' }, error: null });
      mockDb.setResult('clients:select', { data: [], error: null });
      mockDb.setResult('clients:insert:single', { data: { id: 'new-client-99' }, error: null });
      mockDb.setResult('cases:update', { error: null });
      const saved = makeSavedFormData({ plaintiff: 'موكل جديد', plaintiff_national_id: '12345' });
      const { result } = renderHook(() => useClientLinking(saved, vi.fn()));
      await act(async () => { await result.current.handleLinkCase(); });

      await act(async () => { await result.current.handleAddAndLinkClient(); });

      expect(mockDb.clientsInsertSpy).toHaveBeenCalledWith([expect.objectContaining({
        full_name: 'موكل جديد', client_name: 'موكل جديد', tenant_id: 'tenant-1', national_id: '12345',
      })]);
      expect(mockDb.casesUpdateSpy).toHaveBeenCalledWith({ client_id: 'new-client-99' });
      expect(toast).toHaveBeenCalledWith('✅ تمت إضافة الموكل وربطه بالقضية');
      expect(result.current.clientStep).toBe('done');
      expect(result.current.linkingToCase).toBe(false);
    });

    it('🆕 فشل إضافة الموكل → الرسالة الموحدة تتعرض، والخام يتسجل عبر recordError، من غير أي محاولة ربط (مفيش UPDATE)', async () => {
      mockDb.setResult('cases:insert', { data: { id: 'case-add-2' }, error: null });
      mockDb.setResult('clients:select', { data: [], error: null });
      mockDb.setResult('clients:insert:single', { data: null, error: { message: 'client insert failed' } });
      const saved = makeSavedFormData({ plaintiff: 'موكل فاشل' });
      const { result } = renderHook(() => useClientLinking(saved, vi.fn()));
      await act(async () => { await result.current.handleLinkCase(); });

      await act(async () => { await result.current.handleAddAndLinkClient(); });

      expect(toast).toHaveBeenCalledWith('❌ تعذّر إضافة الموكل. تحقق من صحة البيانات. لو المشكلة استمرت، تواصل مع الدعم.', true);
      expect(recordError).toHaveBeenCalledWith('client_create', 'client insert failed', expect.objectContaining({ label: 'إضافة موكل' }));
      expect(mockDb.casesUpdateSpy).not.toHaveBeenCalled();
    });

    it('🆕 الموكل اتضاف بنجاح لكن الربط فشل → الرسالة الموحدة الخاصة بالربط تتعرض، والخام يتسجل عبر recordError، من غير clientStep=done', async () => {
      mockDb.setResult('cases:insert', { data: { id: 'case-add-3' }, error: null });
      mockDb.setResult('clients:select', { data: [], error: null });
      mockDb.setResult('clients:insert:single', { data: { id: 'new-client-100' }, error: null });
      mockDb.setResult('cases:update', { error: { message: 'link failed' } });
      const saved = makeSavedFormData({ plaintiff: 'موكل بربط فاشل' });
      const { result } = renderHook(() => useClientLinking(saved, vi.fn()));
      await act(async () => { await result.current.handleLinkCase(); });

      await act(async () => { await result.current.handleAddAndLinkClient(); });

      expect(toast).toHaveBeenCalledWith('❌ تعذّر ربط الموكل بالجلسة. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', true);
      expect(recordError).toHaveBeenCalledWith('session_client_link', 'link failed', expect.objectContaining({ label: 'ربط الموكل بالجلسة' }));
      expect(result.current.clientStep).not.toBe('done');
    });

    it('استثناء غير متوقع → توست خطأ عام، linkingToCase ترجع false', async () => {
      mockDb.setResult('cases:insert', { data: { id: 'case-add-4' }, error: null });
      mockDb.setResult('clients:select', { data: [], error: null });
      const saved = makeSavedFormData({ plaintiff: 'موكل استثناء' });
      const { result } = renderHook(() => useClientLinking(saved, vi.fn()));
      await act(async () => { await result.current.handleLinkCase(); });
      mockDb.from.mockImplementationOnce(() => { throw new Error('boom'); });

      await act(async () => { await result.current.handleAddAndLinkClient(); });

      expect(toast).toHaveBeenCalledWith('❌ خطأ غير متوقع', true);
      expect(result.current.linkingToCase).toBe(false);
    });

    it('🆕 مفيش tenant_id متاح (getCurrentTenantId ترجع null) → توست خطأ واضح، ومفيش أي INSERT', async () => {
      mockDb.setResult('cases:insert', { data: { id: 'case-add-5' }, error: null });
      mockDb.setResult('clients:select', { data: [], error: null });
      getCurrentTenantId.mockReturnValue(null);
      const saved = makeSavedFormData({ plaintiff: 'موكل بدون تينانت' });
      const { result } = renderHook(() => useClientLinking(saved, vi.fn()));
      await act(async () => { await result.current.handleLinkCase(); });

      await act(async () => { await result.current.handleAddAndLinkClient(); });

      expect(toast).toHaveBeenCalledWith('❌ تعذر تحديد المكتب الحالي، أعد تحميل الصفحة وحاول مرة أخرى', true);
      expect(mockDb.clientsInsertSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleAddClientOnly', () => {
    it('savedFormData فاضي → لا تفعل شيئًا', async () => {
      const { result } = renderHook(() => useClientLinking(null, vi.fn()));

      await act(async () => { await result.current.handleAddClientOnly(); });

      expect(mockDb.clientsInsertSpy).not.toHaveBeenCalled();
    });

    it('اسم المدعي فاضي بعد trim → لا تفعل شيئًا', async () => {
      const saved = makeSavedFormData({ plaintiff: '   ' });
      const { result } = renderHook(() => useClientLinking(saved, vi.fn()));

      await act(async () => { await result.current.handleAddClientOnly(); });

      expect(mockDb.clientsInsertSpy).not.toHaveBeenCalled();
    });

    it('نجاح → INSERT بـ full_name/national_id (من غير select/single)، توست نجاح', async () => {
      mockDb.setResult('clients:insert:plain', { error: null });
      const saved = makeSavedFormData({ plaintiff: 'موكل مستقل', plaintiff_national_id: '999' });
      const { result } = renderHook(() => useClientLinking(saved, vi.fn()));

      await act(async () => { await result.current.handleAddClientOnly(); });

      expect(mockDb.clientsInsertSpy).toHaveBeenCalledWith([expect.objectContaining({
        full_name: 'موكل مستقل', client_name: 'موكل مستقل', tenant_id: 'tenant-1', national_id: '999',
      })]);
      expect(toast).toHaveBeenCalledWith('✅ تمت إضافة الموكل لقائمة الموكلين');
      expect(result.current.linkingClient).toBe(false);
    });

    it('🆕 فشل الإدخال → الرسالة الموحدة تتعرض، والخام يتسجل عبر recordError', async () => {
      mockDb.setResult('clients:insert:plain', { error: { message: 'plain insert failed' } });
      const saved = makeSavedFormData({ plaintiff: 'موكل فشل الإدخال' });
      const { result } = renderHook(() => useClientLinking(saved, vi.fn()));

      await act(async () => { await result.current.handleAddClientOnly(); });

      expect(toast).toHaveBeenCalledWith('❌ تعذّر إضافة الموكل. تحقق من صحة البيانات. لو المشكلة استمرت، تواصل مع الدعم.', true);
      expect(recordError).toHaveBeenCalledWith('client_create', 'plain insert failed', expect.objectContaining({ label: 'إضافة موكل' }));
    });

    it('استثناء غير متوقع → توست خطأ عام، linkingClient ترجع false', async () => {
      mockDb.from.mockImplementationOnce(() => { throw new Error('boom'); });
      const saved = makeSavedFormData({ plaintiff: 'موكل استثناء منفرد' });
      const { result } = renderHook(() => useClientLinking(saved, vi.fn()));

      await act(async () => { await result.current.handleAddClientOnly(); });

      expect(toast).toHaveBeenCalledWith('❌ خطأ غير متوقع', true);
      expect(result.current.linkingClient).toBe(false);
    });

    it('🆕 مفيش tenant_id متاح → توست خطأ واضح، ومفيش أي INSERT', async () => {
      getCurrentTenantId.mockReturnValue(null);
      const saved = makeSavedFormData({ plaintiff: 'موكل منفرد بدون تينانت' });
      const { result } = renderHook(() => useClientLinking(saved, vi.fn()));

      await act(async () => { await result.current.handleAddClientOnly(); });

      expect(toast).toHaveBeenCalledWith('❌ تعذر تحديد المكتب الحالي، أعد تحميل الصفحة وحاول مرة أخرى', true);
      expect(mockDb.clientsInsertSpy).not.toHaveBeenCalled();
    });
  });
});
