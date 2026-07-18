import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ClientRow, ProfileRow, CaseFeeRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';

// ══════════════════════════════════════════════════════════════════
// Mock db (supabaseClient) — بيغطي بالظبط سلاسل الاستدعاءات الموجودة
// فعليًا في useFeesActions.ts (اتأكدت منها بقراءة الكود، مفيش تخمين):
//   - db.from('case_fees').select('id',{count,head}).eq('status',x).is('deleted_at',null)   [fetchStatusCounts]
//   - db.from('case_fees').select('total_fees,paid_fees').is('deleted_at',null)              [fetchGrandSummary]
//   - db.from('case_fees').select('*',{count}).eq('status',s).is(...).order(...).range(...)  [fetchFees]
//   - db.from('fee_payments').select('*').in('fee_id',ids).order('payment_date',...)         [fetchFees payments]
//   - db.from('case_fees').insert([...]).select().single()                                    [handleSave create]
//   - db.from('fee_payments').insert([...])                                                    [handleSave/handleAddPayment]
//   - db.from('fee_payments').select('amount').eq('fee_id', id)                                [realPaid recompute]
//   - db.from('case_fees').update({...}).eq('id', id)                                          [handleSave/handleAddPayment/handleDelete...]
//   - db.from('fee_payments').delete().eq('id', payId)                                         [handleDeletePayment]
// ══════════════════════════════════════════════════════════════════
type Result = { data?: unknown; error?: unknown; count?: number | null };
const DEFAULT_RESULT: Result = { data: [], error: null, count: 0 };

function makeMockDb() {
  const configured: Record<string, Result> = {};
  const insertSpy = vi.fn();
  const updateSpy = vi.fn();
  const deleteSpy = vi.fn();

  const setResult = (key: string, result: Result) => { configured[key] = result; };
  const get = (key: string) => configured[key] ?? DEFAULT_RESULT;

  interface SelectChain {
    eq: (col: string) => SelectChain;
    is: () => SelectChain;
    order: () => SelectChain;
    range: () => SelectChain;
    or: () => SelectChain;
    in: () => SelectChain;
    then: (resolve: (r: Result) => void) => void;
  }

  function buildSelectChain(table: string): SelectChain {
    let key = `${table}:default`;
    const c: SelectChain = {
      eq: vi.fn((col: string) => {
        if (table === 'fee_payments' && col === 'fee_id') key = `${table}:eqFeeId`;
        return c;
      }),
      is: vi.fn(() => c),
      order: vi.fn(() => c),
      range: vi.fn(() => c),
      or: vi.fn(() => c),
      in: vi.fn(() => { key = `${table}:in`; return c; }),
      then: (resolve: (r: Result) => void) => resolve(get(key)),
    };
    return c;
  }

  const from = vi.fn((table: string) => ({
    select: vi.fn(() => buildSelectChain(table)),
    insert: vi.fn((payload: unknown) => {
      insertSpy(table, payload);
      const c = {
        select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve(get(`${table}:insert`))) })),
        then: (resolve: (r: Result) => void) => resolve(get(`${table}:insert`)),
      };
      return c;
    }),
    update: vi.fn((payload: unknown) => {
      updateSpy(table, payload);
      return { eq: vi.fn(() => ({ then: (resolve: (r: Result) => void) => resolve(get(`${table}:update`)) })) };
    }),
    delete: vi.fn(() => {
      deleteSpy(table);
      return { eq: vi.fn(() => ({ then: (resolve: (r: Result) => void) => resolve(get(`${table}:delete`)) })) };
    }),
  }));

  return { from, setResult, insertSpy, updateSpy, deleteSpy };
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

import { useFeesActions } from './useFeesActions';

const cases: MappedCase[] = [{
  id: 'case-1', number: '1', title: 'قضية عمالية', court: '', type: 'عمالي',
  court_level: null, circuit_number: null, status: 'مفتوحة', date: '', client_id: 'client-1',
  plaintiff: null, defendant: null, year: 2026, updated_at: null, court_floor: null,
  court_hall: null, session_hall: null, secretary_hall: null, secretary_name: null, session_time: null,
}];
const clients: ClientRow[] = [{ id: 'client-1', full_name: 'أحمد محمد' } as ClientRow];
const profile = { id: 'lawyer-1' } as ProfileRow;

function makeFee(overrides: Partial<CaseFeeRow> = {}): CaseFeeRow {
  return {
    id: 'fee-1', case_id: 'case-1', client_id: 'client-1', client_name: null,
    total_fees: 1000, paid_fees: 500, status: 'deferred', notes: null,
    receiver: null, last_payment_date: null, created_at: null, updated_at: '2026-07-16T10:00:00.000Z',
    deleted_at: null, tenant_id: 'tenant-1', case_title: null, payment_note: null,
    ...overrides,
  } as CaseFeeRow;
}

async function renderFeesHook() {
  const view = renderHook(() => useFeesActions(cases, clients, 'EG', profile));
  // نستنى الـ effects بتاعة الـ mount (fetchGrandSummary/fetchStatusCounts/fetchFees) تخلص
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

describe('useFeesActions', () => {
  beforeEach(() => {
    mockDb = makeMockDb();
    vi.clearAllMocks();
  });

  describe('handleSave — فاليديشن', () => {
    it('من غير اختيار قضية → توست "حقل مطلوب"، مفيش أي insert', async () => {
      const { result } = await renderFeesHook();

      act(() => { result.current.setForm({ ...result.current.form, case_id: '', total: '1000' }); });
      await act(async () => { await result.current.handleSave(); });

      expect(toast).toHaveBeenCalledWith('❌ حقل "القضية" مطلوب — يرجى اختيار القضية', true);
      expect(mockDb.insertSpy).not.toHaveBeenCalled();
    });

    it('من غير إجمالي أتعاب → توست "حقل مطلوب"، مفيش أي insert', async () => {
      const { result } = await renderFeesHook();

      act(() => { result.current.setForm({ ...result.current.form, case_id: 'case-1', total: '' }); });
      await act(async () => { await result.current.handleSave(); });

      expect(toast).toHaveBeenCalledWith('❌ حقل "إجمالي الأتعاب" مطلوب', true);
      expect(mockDb.insertSpy).not.toHaveBeenCalled();
    });

    it('إجمالي أتعاب سالب → توست خطأ، مفيش أي insert', async () => {
      const { result } = await renderFeesHook();

      act(() => { result.current.setForm({ ...result.current.form, case_id: 'case-1', total: '-500' }); });
      await act(async () => { await result.current.handleSave(); });

      expect(toast).toHaveBeenCalledWith('❌ خطأ: إجمالي الأتعاب لا يمكن أن يكون سالباً', true);
      expect(mockDb.insertSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleSave — إنشاء سجل أتعاب جديد', () => {
    it('من غير دفعة مقدّمة → INSERT بـ paid_fees=0 و status محسوبة من computeFeeStatus(total,0)', async () => {
      mockDb.setResult('case_fees:insert', { data: { id: 'new-fee-1' }, error: null });
      const { result } = await renderFeesHook();

      act(() => { result.current.setForm({ ...result.current.form, case_id: 'case-1', total: '1000' }); });
      await act(async () => { await result.current.handleSave(); });

      expect(mockDb.insertSpy).toHaveBeenCalledWith('case_fees', [expect.objectContaining({
        case_id: 'case-1', case_title: 'قضية عمالية', total_fees: 1000, paid_fees: 0, status: 'deferred',
      })]);
      // مفيش دفعة مقدّمة → مفروض مفيش insert على fee_payments خالص
      expect(mockDb.insertSpy).not.toHaveBeenCalledWith('fee_payments', expect.anything());
      expect(toast).toHaveBeenCalledWith('✅ تم إضافة الأتعاب');
    });

    it('total=0 → status المحسوبة تبقى open (مطابق لمنطق computeFeeStatus الحقيقي)', async () => {
      mockDb.setResult('case_fees:insert', { data: { id: 'new-fee-2' }, error: null });
      const { result } = await renderFeesHook();

      act(() => { result.current.setForm({ ...result.current.form, case_id: 'case-1', total: '0' }); });
      await act(async () => { await result.current.handleSave(); });

      expect(mockDb.insertSpy).toHaveBeenCalledWith('case_fees', [expect.objectContaining({ status: 'open' })]);
    });

    it('بدفعة مقدّمة (paid) → بيسجّل الدفعة في fee_payments، يعيد جمع realPaid، ويحدّث case_fees بالمجموع الفعلي', async () => {
      mockDb.setResult('case_fees:insert', { data: { id: 'new-fee-3' }, error: null });
      // المجموع الفعلي بعد تسجيل الدفعة (بيتقرا من fee_payments، مش من form.paid مباشرة)
      mockDb.setResult('fee_payments:eqFeeId', { data: [{ amount: 300 }], error: null });
      const { result } = await renderFeesHook();

      act(() => {
        result.current.setForm({ ...result.current.form, case_id: 'case-1', total: '1000', paid: '300', payment_date: '2026-07-16' });
      });
      await act(async () => { await result.current.handleSave(); });

      expect(mockDb.insertSpy).toHaveBeenCalledWith('fee_payments', [expect.objectContaining({
        fee_id: 'new-fee-3', amount: 300, notes: 'مقدم أتعاب',
      })]);
      expect(mockDb.updateSpy).toHaveBeenCalledWith('case_fees', expect.objectContaining({
        paid_fees: 300, status: 'deferred', last_payment_date: '2026-07-16',
      }));
    });
  });

  describe('handleSave — تعديل سجل موجود', () => {
    it('يستخدم safeUpdate (القفل التفاؤلي) بدل UPDATE مباشر، وبيحسب status من (total الجديد, paid الحالي)', async () => {
      safeUpdate.mockResolvedValue({ success: true, conflict: false, error: null });
      const { result } = await renderFeesHook();

      const existingFee = makeFee({ id: 'fee-edit-1', total_fees: 1000, paid_fees: 1000 });
      act(() => { result.current.setFees([existingFee]); });
      act(() => {
        result.current.setEditId('fee-edit-1');
        result.current.setForm({ ...result.current.form, case_id: 'case-1', total: '2000' });
      });
      await act(async () => { await result.current.handleSave(); });

      expect(safeUpdate).toHaveBeenCalledWith(
        expect.anything(), 'case_fees', 'fee-edit-1',
        expect.objectContaining({ total_fees: 2000, status: 'deferred' }), // 1000 مدفوع من 2000 → deferred
        '2026-07-16T10:00:00.000Z',
      );
      expect(mockDb.insertSpy).not.toHaveBeenCalled();
    });

    it('تعارض (conflict:true) → بيوقف من غير toast نجاح ومن غير استكمال باقي الخطوات', async () => {
      safeUpdate.mockResolvedValue({ success: false, conflict: true, error: null });
      const { result } = await renderFeesHook();

      const existingFee = makeFee({ id: 'fee-edit-2' });
      act(() => { result.current.setFees([existingFee]); });
      act(() => {
        result.current.setEditId('fee-edit-2');
        result.current.setForm({ ...result.current.form, case_id: 'case-1', total: '2000' });
      });
      await act(async () => { await result.current.handleSave(); });

      expect(toast).not.toHaveBeenCalledWith('✅ تم تحديث الأتعاب');
      expect(logActivity).not.toHaveBeenCalled();
    });
  });

  describe('handleAddPayment', () => {
    it('مبلغ صفر أو سالب → توست تحذير فقط، من غير أي نداء لقاعدة البيانات', async () => {
      const { result } = await renderFeesHook();
      act(() => { result.current.setPayAmount('0'); });
      await act(async () => { await result.current.handleAddPayment(makeFee()); });

      expect(toast).toHaveBeenCalledWith('أدخل مبلغاً صحيحاً', true);
      expect(mockDb.insertSpy).not.toHaveBeenCalled();
    });

    it('مبلغ أكبر من المتبقي → توست تحذير لكن بيكمل التسجيل عادي (مش حظر)', async () => {
      mockDb.setResult('fee_payments:eqFeeId', { data: [{ amount: 900 }], error: null });
      const { result } = await renderFeesHook();
      const fee = makeFee({ total_fees: 1000, paid_fees: 500 }); // المتبقي 500
      act(() => { result.current.setPayAmount('900'); }); // أكبر من الـ 500 المتبقي
      await act(async () => { await result.current.handleAddPayment(fee); });

      expect(toast).toHaveBeenCalledWith(expect.stringContaining('يتجاوز المتبقي'), true);
      // برضو المفروض اتسجلت فعليًا (مفيش return مبكر في الكود الحقيقي)
      expect(mockDb.insertSpy).toHaveBeenCalledWith('fee_payments', [expect.objectContaining({ amount: 900 })]);
    });

    it('اختيار موكل من القايمة → بيتسجل client_id/client_name بتاعه (مش بتاع الأتعاب الأصلية)', async () => {
      mockDb.setResult('fee_payments:eqFeeId', { data: [{ amount: 200 }], error: null });
      const { result } = await renderFeesHook();
      const fee = makeFee({ client_id: 'client-original', client_name: 'اسم قديم' });
      act(() => { result.current.setPayAmount('200'); result.current.setPayClientName('client-1'); });
      await act(async () => { await result.current.handleAddPayment(fee); });

      expect(mockDb.insertSpy).toHaveBeenCalledWith('fee_payments', [expect.objectContaining({
        client_id: 'client-1', client_name: 'أحمد محمد',
      })]);
    });

    it('إدخال اسم يدوي (__manual__) → client_id يترجع null، client_name = النص المكتوب', async () => {
      mockDb.setResult('fee_payments:eqFeeId', { data: [{ amount: 200 }], error: null });
      const { result } = await renderFeesHook();
      const fee = makeFee();
      act(() => {
        result.current.setPayAmount('200');
        result.current.setPayClientName('__manual__');
        result.current.setPayClientNameText('اسم مكتوب يدويًا');
      });
      await act(async () => { await result.current.handleAddPayment(fee); });

      expect(mockDb.insertSpy).toHaveBeenCalledWith('fee_payments', [expect.objectContaining({
        client_id: null, client_name: 'اسم مكتوب يدويًا',
      })]);
    });

    it('من غير اختيار موكل → بيرجع لبيانات الـ fee الأصلية (fallback)', async () => {
      mockDb.setResult('fee_payments:eqFeeId', { data: [{ amount: 200 }], error: null });
      const { result } = await renderFeesHook();
      const fee = makeFee({ client_id: 'client-original', client_name: 'اسم الأتعاب الأصلي' });
      act(() => { result.current.setPayAmount('200'); });
      await act(async () => { await result.current.handleAddPayment(fee); });

      expect(mockDb.insertSpy).toHaveBeenCalledWith('fee_payments', [expect.objectContaining({
        client_id: 'client-original', client_name: 'اسم الأتعاب الأصلي',
      })]);
    });

    it('الدفعة الأخيرة تكمّل المبلغ بالكامل → status تتحول لـ collected', async () => {
      mockDb.setResult('fee_payments:eqFeeId', { data: [{ amount: 500 }, { amount: 500 }], error: null });
      const { result } = await renderFeesHook();
      const fee = makeFee({ total_fees: 1000, paid_fees: 500 });
      act(() => { result.current.setPayAmount('500'); });
      await act(async () => { await result.current.handleAddPayment(fee); });

      expect(mockDb.updateSpy).toHaveBeenCalledWith('case_fees', expect.objectContaining({
        paid_fees: 1000, status: 'collected',
      }));
      expect(toast).toHaveBeenCalledWith('✅ تم تسجيل الدفعة');
    });

    it('فشل الـ insert → توست خطأ، من غير أي محاولة تحديث case_fees', async () => {
      mockDb.setResult('fee_payments:insert', { error: { message: 'insert failed' } });
      const { result } = await renderFeesHook();
      act(() => { result.current.setPayAmount('200'); });
      await act(async () => { await result.current.handleAddPayment(makeFee()); });

      expect(toast).toHaveBeenCalledWith('❌ فشل تسجيل الدفعة، يرجى المحاولة مرة أخرى', true);
      expect(mockDb.updateSpy).not.toHaveBeenCalledWith('case_fees', expect.anything());
    });

    it('نجح تسجيل الدفعة لكن فشل تحديث case_fees → توست تحذير جزئي (مش فشل كامل)', async () => {
      mockDb.setResult('fee_payments:eqFeeId', { data: [{ amount: 200 }], error: null });
      mockDb.setResult('case_fees:update', { error: { message: 'update failed' } });
      const { result } = await renderFeesHook();
      act(() => { result.current.setPayAmount('200'); });
      await act(async () => { await result.current.handleAddPayment(makeFee()); });

      expect(toast).toHaveBeenCalledWith('⚠️ تم تسجيل الدفعة لكن فشل تحديث إجمالي المدفوع، يرجى تحديث الصفحة', true);
    });
  });

  describe('handleDeletePayment', () => {
    it('بيحذف الدفعة، يعيد حساب الرصيد من المتبقي فعليًا (مش بالطرح)، وبيحدّث status', async () => {
      // بعد الحذف، دفعة واحدة بس فاضلة بـ 200 (مش 500-300 بالطرح، القيمة بترجع من DB مباشرة)
      mockDb.setResult('fee_payments:eqFeeId', { data: [{ amount: 200 }], error: null });
      const { result } = await renderFeesHook();
      const fee = makeFee({ total_fees: 1000, paid_fees: 500 });

      await act(async () => { await result.current.handleDeletePayment('pay-1', fee); });

      expect(mockDb.deleteSpy).toHaveBeenCalledWith('fee_payments');
      expect(mockDb.updateSpy).toHaveBeenCalledWith('case_fees', expect.objectContaining({
        paid_fees: 200, status: 'deferred',
      }));
      expect(toast).toHaveBeenCalledWith('🗑 تم حذف الدفعة');
    });

    it('حذف آخر دفعة (يرجع الرصيد لصفر) → status ترجع open لو total كمان صفر، أو deferred لو لسه فيه total', async () => {
      mockDb.setResult('fee_payments:eqFeeId', { data: [], error: null });
      const { result } = await renderFeesHook();
      const fee = makeFee({ total_fees: 1000, paid_fees: 500 });

      await act(async () => { await result.current.handleDeletePayment('pay-1', fee); });

      expect(mockDb.updateSpy).toHaveBeenCalledWith('case_fees', expect.objectContaining({ paid_fees: 0, status: 'deferred' }));
    });

    it('فشل الحذف → توست خطأ، من غير أي إعادة حساب أو تحديث', async () => {
      mockDb.setResult('fee_payments:delete', { error: { message: 'delete failed' } });
      const { result } = await renderFeesHook();

      await act(async () => { await result.current.handleDeletePayment('pay-1', makeFee()); });

      expect(toast).toHaveBeenCalledWith('❌ فشل حذف الدفعة، يرجى المحاولة مرة أخرى', true);
      expect(mockDb.updateSpy).not.toHaveBeenCalledWith('case_fees', expect.anything());
    });
  });

  describe('handleDelete — أرشفة (soft delete)', () => {
    it('بيحدّث deleted_at بس (مش حذف فعلي)، وبيسجّل النشاط ببيانات القضية/الموكل الصح', async () => {
      const { result } = await renderFeesHook();
      const targetFee = makeFee({ id: 'fee-archive-1', client_name: 'موكل الأرشفة' });
      act(() => { result.current.setFees([targetFee]); });

      await act(async () => { await result.current.handleDelete('fee-archive-1'); });

      expect(mockDb.updateSpy).toHaveBeenCalledWith('case_fees', expect.objectContaining({ deleted_at: expect.any(String) }));
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'أرشفة أتعاب', expect.objectContaining({
        entity_type: 'fee', entity_id: 'fee-archive-1',
        client_name: 'موكل الأرشفة', case_name: 'قضية عمالية', case_type: 'عمالي',
      }));
      expect(toast).toHaveBeenCalledWith('📦 تم نقل الأتعاب للأرشيف');
    });

    it('فشل الأرشفة → توست خطأ، من غير logActivity', async () => {
      mockDb.setResult('case_fees:update', { error: { message: 'archive failed' } });
      const { result } = await renderFeesHook();

      await act(async () => { await result.current.handleDelete('fee-1'); });

      expect(toast).toHaveBeenCalledWith('❌ فشل أرشفة الأتعاب — تحقق من الاتصال وأعد المحاولة', true);
      expect(logActivity).not.toHaveBeenCalled();
    });
  });
});
