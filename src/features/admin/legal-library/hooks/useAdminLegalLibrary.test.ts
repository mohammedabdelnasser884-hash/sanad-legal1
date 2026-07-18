import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAdminLegalLibrary } from './useAdminLegalLibrary';
import type { ProfileRow, LawRow } from '../../../../types';

// ══════════════════════════════════════════════════════════════════
// Mock db (supabaseClient) — بيغطي بالظبط سلاسل الاستدعاءات الفعلية في
// useAdminLegalLibrary.ts (اتأكدت منها بقراءة الكود، مفيش تخمين):
//   - db.from('legal_categories').select('*').order('name_ar')      [fetchLegalCategories]
//   - db.from('laws').select('*').order('created_at',{...})          [fetchLaws]
//   - db.storage.from('legal-library').upload(path, file, {upsert:true}) [handleSaveLaw — لو فيه ملف]
//   - db.from('laws').update(payload).eq('id', x)                    [handleSaveLaw — تعديل]
//   - db.from('laws').insert({...payload, status:'pending'})         [handleSaveLaw — إضافة]
//   - db.functions.invoke('process-law-extract', {body:{law_id}})    [handleProcessLaw]
//   - db.storage.from('legal-library').remove([path])                [handleDeleteLaw — لو فيه ملف]
//   - db.from('laws').delete().eq('id', x)                           [handleDeleteLaw]
// ══════════════════════════════════════════════════════════════════
// موسّع بـ`reject`/`context` — نفس الشكلين اللي الكود فعليًا بيتحقق منهم وقت
// التشغيل (كاست `as { reject?: boolean }` في mock الـstorage، وتوقيع
// `EdgeFunctionError` الحقيقي في useAdminLegalLibrary.ts). النوع القديم كان
// أضيق من الاستخدام الفعلي في التستات، مش تغيير في سلوك المحاكاة نفسها.
type Result = {
  data?: unknown;
  error?: { message?: string; context?: { json?: () => Promise<{ error?: string } | null>; text?: () => Promise<string> } } | null;
  reject?: boolean;
};

function makeMockDb() {
  const configured: Record<string, Result> = {};
  const setResult = (key: string, result: Result) => { configured[key] = result; };
  const get = (key: string, fallback: Result) => configured[key] ?? fallback;

  const selectSpy = vi.fn();
  const orderSpy = vi.fn();
  const insertSpy = vi.fn();
  const updateSpy = vi.fn();
  const deleteSpy = vi.fn();
  const uploadSpy = vi.fn();
  const removeSpy = vi.fn();
  const invokeSpy = vi.fn();

  const from = vi.fn((table: string) => ({
    select: vi.fn((cols: string) => {
      selectSpy(table, cols);
      return {
        order: vi.fn((col: string, opts?: unknown) => {
          orderSpy(table, col, opts);
          return Promise.resolve(get(`${table}:select`, { data: [], error: null }));
        }),
      };
    }),
    insert: vi.fn((payload: unknown) => {
      insertSpy(table, payload);
      return Promise.resolve(get(`${table}:insert`, { error: null }));
    }),
    update: vi.fn((payload: unknown) => {
      updateSpy(table, payload);
      return { eq: vi.fn((col: string, val: unknown) => { updateSpy('eq', col, val); return Promise.resolve(get(`${table}:update`, { error: null })); }) };
    }),
    delete: vi.fn(() => ({
      eq: vi.fn((col: string, val: unknown) => { deleteSpy(table, col, val); return Promise.resolve(get(`${table}:delete`, { error: null })); }),
    })),
  }));

  const storage = {
    from: vi.fn((bucket: string) => ({
      upload: vi.fn((path: string, file: unknown, opts: unknown) => {
        uploadSpy(bucket, path, file, opts);
        const cfg = get('storage:upload', { error: null });
        if ((cfg as { reject?: boolean }).reject) return Promise.reject(new Error('upload failed'));
        return Promise.resolve(cfg);
      }),
      remove: vi.fn((paths: string[]) => {
        removeSpy(bucket, paths);
        const cfg = get('storage:remove', { error: null });
        if ((cfg as { reject?: boolean }).reject) return Promise.reject(new Error('remove failed'));
        return Promise.resolve(cfg);
      }),
    })),
  };

  const functions = {
    invoke: vi.fn((name: string, opts: unknown) => {
      invokeSpy(name, opts);
      return Promise.resolve(get('functions:invoke', { data: null, error: null }));
    }),
  };

  return { from, storage, functions, setResult, selectSpy, orderSpy, insertSpy, updateSpy, deleteSpy, uploadSpy, removeSpy, invokeSpy };
}

let mockDb = makeMockDb();
vi.mock('../../../../supabaseClient', () => ({
  db: {
    from: (...a: Parameters<typeof mockDb.from>) => mockDb.from(...a),
    storage: { from: (...a: Parameters<typeof mockDb.storage.from>) => mockDb.storage.from(...a) },
    functions: { invoke: (...a: Parameters<typeof mockDb.functions.invoke>) => mockDb.functions.invoke(...a) },
  },
}));

const toast = vi.fn();
vi.mock('../../../../shared/lib/notifications', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const logActivity = vi.fn();
vi.mock('../../../../shared/lib/dataAccess', () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

const recordError = vi.fn();
vi.mock('../../../../systemHealth', () => ({ recordError: (...a: unknown[]) => recordError(...a) }));

const PROFILE = { id: 'admin-1', full_name: 'أحمد المدير' } as unknown as ProfileRow;
const FORM = { title: 'قانون العمل', law_number: '12', law_year: '2003', category_id: 'cat-1' };

function makeFile(name: string, sizeBytes: number): File {
  const file = new File(['x'.repeat(Math.min(sizeBytes, 10))], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

beforeEach(() => {
  mockDb = makeMockDb();
  toast.mockClear();
  logActivity.mockClear();
  recordError.mockClear();
  vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
});

function setup(profile: ProfileRow | null | undefined = PROFILE) {
  return renderHook(() => useAdminLegalLibrary(profile));
}

describe('useAdminLegalLibrary', () => {
  describe('fetchLegalCategories', () => {
    it('نجاح → select("*").order("name_ar")، legalCategories بتتملي', async () => {
      const rows = [{ id: 'c1', name_ar: 'مدني' }];
      mockDb.setResult('legal_categories:select', { data: rows, error: null });
      const { result } = setup();
      await act(async () => { await result.current.fetchLegalCategories(); });
      expect(mockDb.orderSpy).toHaveBeenCalledWith('legal_categories', 'name_ar', undefined);
      expect(result.current.legalCategories).toEqual(rows);
    });

    it('data:null → legalCategories بتفضل [] من غير كراش', async () => {
      const { result } = setup();
      await act(async () => { await result.current.fetchLegalCategories(); });
      expect(result.current.legalCategories).toEqual([]);
    });
  });

  describe('fetchLaws', () => {
    it('نجاح → select("*").order("created_at",{ascending:false})، laws بتتملي، loadingLaws بيرجع false', async () => {
      const rows = [{ id: 'l1', title: 'قانون' }];
      mockDb.setResult('laws:select', { data: rows, error: null });
      const { result } = setup();
      await act(async () => { await result.current.fetchLaws(); });
      expect(mockDb.orderSpy).toHaveBeenCalledWith('laws', 'created_at', { ascending: false });
      expect(result.current.laws).toEqual(rows);
      expect(result.current.loadingLaws).toBe(false);
    });

    it('data:null → laws بتفضل [] من غير كراش', async () => {
      const { result } = setup();
      await act(async () => { await result.current.fetchLaws(); });
      expect(result.current.laws).toEqual([]);
    });
  });

  describe('handleSaveLaw — إضافة قانون جديد (من غير ملف)', () => {
    it('نجاح → insert بـ status:"pending" وpayload صحيح، توست إضافة، logActivity من غير entity_id، setShowLawModal(false)، fetchLaws', async () => {
      const { result } = setup();
      act(() => { result.current.setShowLawModal(true); });

      await act(async () => { await result.current.handleSaveLaw(FORM, null); });

      expect(mockDb.insertSpy).toHaveBeenCalledWith('laws', {
        title: 'قانون العمل', law_number: '12', law_year: 2003, category_id: 'cat-1',
        file_path: null, file_name: null, status: 'pending',
      });
      expect(toast).toHaveBeenCalledWith('✅ تم إضافة القانون — جاهز للمعالجة');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'إضافة قانون', { userName: 'أحمد المدير', entity_type: 'law', details: 'قانون العمل' });
      expect(result.current.showLawModal).toBe(false);
      expect(result.current.savingLaw).toBe(false);
    });

    it('law_number/law_year/category_id فاضيين → بيتحولوا null، وlaw_year بيتحول Number لو موجود', async () => {
      const { result } = setup();
      await act(async () => {
        await result.current.handleSaveLaw({ title: 'قانون', law_number: '', law_year: '', category_id: '' }, null);
      });
      expect(mockDb.insertSpy).toHaveBeenCalledWith('laws', expect.objectContaining({ law_number: null, law_year: null, category_id: null }));
    });

    it('title بيتعمله trim قبل الحفظ', async () => {
      const { result } = setup();
      await act(async () => { await result.current.handleSaveLaw({ ...FORM, title: '  قانون العمل  ' }, null); });
      expect(mockDb.insertSpy).toHaveBeenCalledWith('laws', expect.objectContaining({ title: 'قانون العمل' }));
    });

    it('فشل insert → توست بالرسالة الموحدة، والخام يتسجل عبر recordError، من غير toast نجاح أو logActivity أو fetchLaws', async () => {
      mockDb.setResult('laws:insert', { error: { message: 'duplicate key' } });
      const { result } = setup();
      await act(async () => { await result.current.handleSaveLaw(FORM, null); });
      const message = 'تعذّر رفع الملف. تأكد من نوع وحجم الملف وحاول تاني. لو المشكلة استمرت، تواصل مع الدعم.';
      expect(toast).toHaveBeenCalledWith('❌ ' + message, true);
      expect(recordError).toHaveBeenCalledWith('legal_library_upload', 'duplicate key', expect.objectContaining({ message }));
      expect(logActivity).not.toHaveBeenCalled();
      expect(result.current.savingLaw).toBe(false);
    });
  });

  describe('handleSaveLaw — تعديل قانون موجود', () => {
    const EXISTING = { id: 'l1', title: 'قديم', file_path: 'laws/old.pdf', file_name: 'old.pdf' } as unknown as LawRow;

    it('نجاح من غير ملف جديد → update بـ eq(id)، file_path/file_name القديمين بيفضلوا زي ما هما، توست تعديل، logActivity بـ entity_id', async () => {
      const { result } = setup();
      act(() => { result.current.setEditingLaw(EXISTING); });

      await act(async () => { await result.current.handleSaveLaw(FORM, null); });

      expect(mockDb.updateSpy).toHaveBeenCalledWith('laws', expect.objectContaining({ file_path: 'laws/old.pdf', file_name: 'old.pdf' }));
      expect(mockDb.updateSpy).toHaveBeenCalledWith('eq', 'id', 'l1');
      expect(toast).toHaveBeenCalledWith('✅ تم حفظ التعديلات');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تعديل قانون', { userName: 'أحمد المدير', entity_type: 'law', entity_id: 'l1', details: 'قانون العمل' });
      expect(result.current.editingLaw).toBeNull();
    });

    it('فشل update → توست بالرسالة الموحدة، من غير logActivity أو setEditingLaw(null)', async () => {
      mockDb.setResult('laws:update', { error: { message: 'x' } });
      const { result } = setup();
      act(() => { result.current.setEditingLaw(EXISTING); });
      await act(async () => { await result.current.handleSaveLaw(FORM, null); });
      expect(toast).toHaveBeenCalledWith('❌ تعذّر رفع الملف. تأكد من نوع وحجم الملف وحاول تاني. لو المشكلة استمرت، تواصل مع الدعم.', true);
      expect(logActivity).not.toHaveBeenCalled();
      expect(result.current.editingLaw).toEqual(EXISTING);
    });
  });

  describe('handleSaveLaw — رفع ملف', () => {
    it('امتداد غير PDF → توست رفض، من غير أي محاولة رفع أو حفظ', async () => {
      const { result } = setup();
      const file = makeFile('law.docx', 1000);
      await act(async () => { await result.current.handleSaveLaw(FORM, file); });
      expect(toast).toHaveBeenCalledWith('❌ المكتبة القانونية تقبل ملفات PDF فقط.', true);
      expect(mockDb.uploadSpy).not.toHaveBeenCalled();
      expect(mockDb.insertSpy).not.toHaveBeenCalled();
      expect(result.current.savingLaw).toBe(false);
    });

    it('حجم أكبر من 50 ميجا → توست رفض الحجم، من غير رفع أو حفظ', async () => {
      const { result } = setup();
      const file = makeFile('law.pdf', 51 * 1024 * 1024);
      await act(async () => { await result.current.handleSaveLaw(FORM, file); });
      expect(toast).toHaveBeenCalledWith('❌ حجم ملف القانون كبير جداً — الحد الأقصى 50 ميجابايت', true);
      expect(mockDb.uploadSpy).not.toHaveBeenCalled();
    });

    it('PDF صالح → اسم الملف بيتنضف من الرموز الغريبة ويتحط في laws/، upload بـ upsert:true، fileName الأصلي بيتحفظ في الـ payload', async () => {
      const { result } = setup();
      const file = makeFile('عقد الإيجار (نسخة)!.pdf', 1000);
      await act(async () => { await result.current.handleSaveLaw(FORM, file); });

      expect(mockDb.uploadSpy).toHaveBeenCalledWith('legal-library', 'laws/1700000000000____________________.pdf', file, { upsert: true });
      expect(mockDb.insertSpy).toHaveBeenCalledWith('laws', expect.objectContaining({
        file_path: 'laws/1700000000000____________________.pdf',
        file_name: 'عقد الإيجار (نسخة)!.pdf',
      }));
    });

    it('فشل الرفع (استثناء) → توست بالرسالة الموحدة، والخام يتسجل عبر recordError، من غير أي محاولة insert', async () => {
      mockDb.setResult('storage:upload', { reject: true });
      const { result } = setup();
      const file = makeFile('law.pdf', 1000);
      await act(async () => { await result.current.handleSaveLaw(FORM, file); });
      expect(toast).toHaveBeenCalledWith('❌ تعذّر رفع الملف. تأكد من نوع وحجم الملف وحاول تاني. لو المشكلة استمرت، تواصل مع الدعم.', true);
      expect(recordError).toHaveBeenCalledWith('legal_library_upload', 'upload failed', expect.anything());
      expect(mockDb.insertSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleProcessLaw', () => {
    const LAW = { id: 'l1', title: 'قانون العمل' } as unknown as LawRow;

    it('نجاح → functions.invoke بـ law_id، توست بعدد المواد، logActivity بـ entity_id، processingLaw:null، fetchLaws بتتنادى', async () => {
      mockDb.setResult('functions:invoke', { data: { articles_count: 12 }, error: null });
      const { result } = setup();
      await act(async () => { await result.current.handleProcessLaw(LAW); });

      expect(mockDb.invokeSpy).toHaveBeenCalledWith('process-law-extract', { body: { law_id: 'l1' } });
      expect(toast).toHaveBeenCalledWith('✅ تمت معالجة القانون وفهرسته بنجاح — 12 مادة');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'معالجة قانون', { userName: 'أحمد المدير', entity_type: 'law', entity_id: 'l1', details: 'قانون العمل — 12 مادة' });
      expect(result.current.processingLaw).toBeNull();
    });

    it('مفيش articles_count → بيستخدم 0 كـ fallback في التوست وlogActivity', async () => {
      mockDb.setResult('functions:invoke', { data: {}, error: null });
      const { result } = setup();
      await act(async () => { await result.current.handleProcessLaw(LAW); });
      expect(toast).toHaveBeenCalledWith('✅ تمت معالجة القانون وفهرسته بنجاح — 0 مادة');
    });

    it('extractErr مع context.json() → توست برسالة الـ body.error المستخرجة (آمنة من السيرفر، بتتعرض زي ما هي)', async () => {
      mockDb.setResult('functions:invoke', {
        data: null,
        error: { message: 'generic', context: { json: async () => ({ error: 'ملف PDF تالف' }) } },
      });
      const { result } = setup();
      await act(async () => { await result.current.handleProcessLaw(LAW); });
      expect(toast).toHaveBeenCalledWith('❌ ملف PDF تالف', true);
      expect(recordError).toHaveBeenCalledWith('legal_library_process', 'ملف PDF تالف', expect.anything());
    });

    it('extractErr مع context.text() بس (من غير json) → توست بنص الـ text المستخرج', async () => {
      mockDb.setResult('functions:invoke', {
        data: null,
        error: { message: 'generic', context: { text: async () => 'نص الخطأ من السيرفر' } },
      });
      const { result } = setup();
      await act(async () => { await result.current.handleProcessLaw(LAW); });
      expect(toast).toHaveBeenCalledWith('❌ نص الخطأ من السيرفر', true);
    });

    it('extractErr من غير context خالص → الفولباك العام بياخد الرسالة الموحدة (مش "حدث خطأ غير متوقع" الخام)', async () => {
      mockDb.setResult('functions:invoke', { data: null, error: { message: 'generic' } });
      const { result } = setup();
      await act(async () => { await result.current.handleProcessLaw(LAW); });
      expect(toast).toHaveBeenCalledWith('❌ تعذّر معالجة الملف. حاول تاني، ولو تكررت المشكلة تواصل مع الدعم.', true);
    });

    it('extractData.error (من غير extractErr) → بيترمي برسالة extractData.error وتتعرض زي ما هي', async () => {
      mockDb.setResult('functions:invoke', { data: { error: 'قانون مكرر بالفعل' }, error: null });
      const { result } = setup();
      await act(async () => { await result.current.handleProcessLaw(LAW); });
      expect(toast).toHaveBeenCalledWith('❌ قانون مكرر بالفعل', true);
    });

    it('فشل المعالجة → processingLaw لسه بيترجع null وfetchLaws لسه بتتنادى (مش بس في حالة النجاح)', async () => {
      mockDb.setResult('functions:invoke', { data: null, error: { message: 'x' } });
      mockDb.setResult('laws:select', { data: [{ id: 'l1' }], error: null });
      const { result } = setup();
      await act(async () => { await result.current.handleProcessLaw(LAW); });
      expect(result.current.processingLaw).toBeNull();
      expect(mockDb.orderSpy).toHaveBeenCalledWith('laws', 'created_at', { ascending: false });
    });
  });

  describe('handleDeleteLaw', () => {
    const LAW_WITH_FILE = { id: 'l1', title: 'قانون العمل', file_path: 'laws/x.pdf' } as unknown as LawRow;
    const LAW_NO_FILE = { id: 'l2', title: 'قانون بدون ملف', file_path: null } as unknown as LawRow;

    it('نجاح مع ملف → storage.remove([file_path]) ثم delete().eq(id)، توست حذف، logActivity، confirmDeleteLaw:null، fetchLaws', async () => {
      const { result } = setup();
      act(() => { result.current.setConfirmDeleteLaw(LAW_WITH_FILE); });

      await act(async () => { await result.current.handleDeleteLaw(LAW_WITH_FILE); });

      expect(mockDb.removeSpy).toHaveBeenCalledWith('legal-library', ['laws/x.pdf']);
      expect(mockDb.deleteSpy).toHaveBeenCalledWith('laws', 'id', 'l1');
      expect(toast).toHaveBeenCalledWith('🗑️ تم حذف القانون ومواده');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'حذف قانون', { userName: 'أحمد المدير', entity_type: 'law', entity_id: 'l1', details: 'قانون العمل' });
      expect(result.current.confirmDeleteLaw).toBeNull();
      expect(result.current.savingLaw).toBe(false);
    });

    it('من غير ملف (file_path:null) → storage.remove متتناداش خالص، لكن الحذف من الجدول بيكمل عادي', async () => {
      const { result } = setup();
      await act(async () => { await result.current.handleDeleteLaw(LAW_NO_FILE); });
      expect(mockDb.removeSpy).not.toHaveBeenCalled();
      expect(mockDb.deleteSpy).toHaveBeenCalledWith('laws', 'id', 'l2');
      expect(toast).toHaveBeenCalledWith('🗑️ تم حذف القانون ومواده');
    });

    it('فشل حذف السجل من الجدول (error) → توست بالرسالة الموحدة، من غير logActivity أو تصفير confirmDeleteLaw', async () => {
      mockDb.setResult('laws:delete', { error: { message: 'fk violation' } });
      const { result } = setup();
      act(() => { result.current.setConfirmDeleteLaw(LAW_NO_FILE); });
      await act(async () => { await result.current.handleDeleteLaw(LAW_NO_FILE); });
      expect(toast).toHaveBeenCalledWith('❌ تعذّر حذف الملف. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', true);
      expect(recordError).toHaveBeenCalledWith('legal_library_delete', 'fk violation', expect.anything());
      expect(logActivity).not.toHaveBeenCalled();
      expect(result.current.confirmDeleteLaw).toEqual(LAW_NO_FILE);
    });

    it('فشل حذف الملف من الـ storage (استثناء) → بيتلقط في catch، delete().eq() الجدول ما بيتناداش خالص', async () => {
      mockDb.setResult('storage:remove', { reject: true });
      const { result } = setup();
      await act(async () => { await result.current.handleDeleteLaw(LAW_WITH_FILE); });
      expect(toast).toHaveBeenCalledWith('❌ تعذّر حذف الملف. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', true);
      expect(mockDb.deleteSpy).not.toHaveBeenCalled();
    });
  });
});
