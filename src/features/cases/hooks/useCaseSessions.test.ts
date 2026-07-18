import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ClientRow, ProfileRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';

// ══════════════════════════════════════════════════════════════════
// Mock db (supabaseClient) — بيغطي بالظبط سلاسل الاستدعاءات المباشرة
// الموجودة فعليًا في useCaseSessions.ts (اتأكدت منها بقراءة الكود):
//   - db.from('case_sessions').select('session_date').eq('case_id', x)  [recalcNextHearing]
//   - db.from('cases').update({next_hearing}).eq('id', x)               [recalcNextHearing]
//   - db.from('case_sessions').insert([{...}])                         [handleAddSession]
//   - db.from('case_sessions').delete().eq('id', x)                    [handleDeleteSession]
// handleUpdateSession بيعدي عن طريق safeUpdate (دالة من dataAccess.ts)
// مش db.from مباشرة — بنعملها mock كدالة منفصلة.
// ══════════════════════════════════════════════════════════════════
type Result = { data?: unknown; error?: unknown };

function makeMockDb() {
  const configured: Record<string, Result> = {};
  const insertSpy = vi.fn();
  const deleteSpy = vi.fn();
  const updateSpy = vi.fn();
  const selectEqSpy = vi.fn();

  const setResult = (key: string, result: Result) => { configured[key] = result; };
  const get = (key: string, fallback: Result) => configured[key] ?? fallback;

  const from = vi.fn((table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn((col: string, val: unknown) => {
        selectEqSpy(table, col, val);
        return Promise.resolve(get(`${table}:select`, { data: [], error: null }));
      }),
    })),
    update: vi.fn((payload: unknown) => {
      updateSpy(table, payload);
      return { eq: vi.fn(() => Promise.resolve(get(`${table}:update`, { error: null }))) };
    }),
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

  return { from, setResult, insertSpy, deleteSpy, updateSpy, selectEqSpy };
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

import { useCaseSessions } from './useCaseSessions';

const client: ClientRow = { id: 'client-1', full_name: 'أحمد محمد' } as ClientRow;
const profile: ProfileRow = { id: 'lawyer-1', full_name: 'المحامي سالم' } as ProfileRow;

function makeCase(overrides: Partial<MappedCase> = {}): MappedCase {
  return {
    id: 'case-1', number: '10', title: 'قضية مدنية', court: 'محكمة الجيزة', type: 'مدني',
    court_level: null, circuit_number: null, status: 'نشطة', date: '2026-07-01', client_id: 'client-1',
    plaintiff: null, defendant: null, year: 2026, updated_at: '2026-07-16T10:00:00.000Z', court_floor: null,
    court_hall: null, session_hall: null, secretary_hall: null, secretary_name: null, session_time: null,
    ...overrides,
  } as MappedCase;
}

function renderSessionsHook(caseData: MappedCase = makeCase(), onNotify: ((m: string) => void) | undefined = vi.fn()) {
  const refetchAll = vi.fn();
  const view = renderHook(() => useCaseSessions(caseData, client, profile, onNotify, refetchAll));
  return { ...view, refetchAll };
}

beforeEach(() => {
  mockDb = makeMockDb();
  vi.clearAllMocks();
  // افتراضي آمن لـ recalcNextHearing (بيتنادى بعد كل إضافة/حذف/تعديل ناجح)
  mockDb.setResult('case_sessions:select', { data: [], error: null });
});

describe('useCaseSessions — recalcNextHearing', () => {
  it('بيختار أقرب تاريخ >= اليوم ويحدّث next_hearing بيه، ويتجاهل التواريخ الماضية', async () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const future1 = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const future2 = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const past = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    mockDb.setResult('case_sessions:select', {
      data: [{ session_date: past }, { session_date: future1 }, { session_date: future2 }, { session_date: todayStr }],
      error: null,
    });
    const { result } = renderSessionsHook();
    await act(async () => { await result.current.recalcNextHearing('case-1'); });
    expect(mockDb.selectEqSpy).toHaveBeenCalledWith('case_sessions', 'case_id', 'case-1');
    // أقرب تاريخ فعلي: اليوم نفسه (todayStr) لأنه <= future2 وأصغر أو يساوي كل الباقي
    expect(mockDb.updateSpy).toHaveBeenCalledWith('cases', { next_hearing: todayStr });
  });

  it('مفيش أي جلسة قادمة (كلها ماضية أو مفيش جلسات خالص) → next_hearing = null', async () => {
    const past = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    mockDb.setResult('case_sessions:select', { data: [{ session_date: past }], error: null });
    const { result } = renderSessionsHook();
    await act(async () => { await result.current.recalcNextHearing('case-1'); });
    expect(mockDb.updateSpy).toHaveBeenCalledWith('cases', { next_hearing: null });
  });
});

describe('useCaseSessions — handleAddSession', () => {
  it('من غير تاريخ (date فاضي) → مفيش أي نداء قاعدة بيانات خالص', async () => {
    const { result } = renderSessionsHook();
    await act(async () => { await result.current.handleAddSession(); });
    expect(mockDb.insertSpy).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('نجاح → INSERT صحيح، إعادة حساب next_hearing، توست نجاح، تسجيل نشاط، رسالة تيليجرام، وتصفير الفورم', async () => {
    mockDb.setResult('case_sessions:insert', { error: null });
    const onNotify = vi.fn();
    const { result, refetchAll } = renderSessionsHook(makeCase(), onNotify);
    act(() => { result.current.setSessionForm({ date: '2026-08-01', time_period: 'مسائي', location_floor: '3', location_hall: 'أ', description: 'مرافعة أولى', result: '', next_action: '' }); });
    await act(async () => { await result.current.handleAddSession(); });

    expect(mockDb.insertSpy).toHaveBeenCalledWith('case_sessions', [{
      case_id: 'case-1', session_date: '2026-08-01', session_time: 'مسائي',
      session_floor: '3', session_hall: 'أ', description: 'مرافعة أولى', result: null, next_action: null,
    }]);
    expect(mockDb.updateSpy).toHaveBeenCalledWith('cases', expect.any(Object)); // recalcNextHearing اتنادت
    expect(toast).toHaveBeenCalledWith('✅ تمت إضافة الجلسة');
    expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'إضافة جلسة', expect.objectContaining({
      entity_type: 'session', case_type: 'مدني', client_name: 'أحمد محمد', userName: 'المحامي سالم',
    }));
    expect(onNotify).toHaveBeenCalledTimes(1);
    const msg = onNotify.mock.calls[0][0] as string;
    expect(msg).toContain('جلسة جديدة');
    expect(msg).toContain('قضية مدنية');
    expect(msg).toContain('2026-08-01');
    expect(result.current.sessionForm).toEqual({ date: '', time_period: 'صباحي', location_floor: '', location_hall: '', description: '', result: '', next_action: '' });
    expect(result.current.showAddSession).toBe(false);
    expect(refetchAll).toHaveBeenCalled();
  });

  it('نجاح من غير onNotify (undefined) → يكمل عادي من غير أي استثناء', async () => {
    mockDb.setResult('case_sessions:insert', { error: null });
    const { result } = renderSessionsHook(makeCase(), undefined);
    act(() => { result.current.setSessionForm({ ...result.current.sessionForm, date: '2026-08-01' }); });
    await act(async () => { await result.current.handleAddSession(); });
    expect(toast).toHaveBeenCalledWith('✅ تمت إضافة الجلسة');
  });

  it('فشل الإدخال → توست فشل، من غير إعادة حساب next_hearing ولا تسجيل نشاط', async () => {
    mockDb.setResult('case_sessions:insert', { error: { message: 'insert failed' } });
    const { result, refetchAll } = renderSessionsHook();
    act(() => { result.current.setSessionForm({ ...result.current.sessionForm, date: '2026-08-01' }); });
    await act(async () => { await result.current.handleAddSession(); });

    expect(toast).toHaveBeenCalledWith('❌ فشل إضافة الجلسة — تحقق من الاتصال وأعد المحاولة', true);
    expect(mockDb.updateSpy).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
    expect(refetchAll).not.toHaveBeenCalled();
  });
});

describe('useCaseSessions — handleDeleteSession', () => {
  it('نجاح → DELETE صحيح، إعادة حساب next_hearing، توست نجاح، تسجيل نشاط بـ entity_id، وrefetchAll', async () => {
    mockDb.setResult('case_sessions:delete', { error: null });
    const { result, refetchAll } = renderSessionsHook();
    await act(async () => { await result.current.handleDeleteSession('sess-1'); });

    expect(mockDb.deleteSpy).toHaveBeenCalledWith('case_sessions', 'sess-1');
    expect(mockDb.updateSpy).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('🗑 تم حذف الجلسة');
    expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'حذف جلسة', expect.objectContaining({ entity_type: 'session', entity_id: 'sess-1' }));
    expect(refetchAll).toHaveBeenCalled();
  });

  it('فشل الحذف → توست فشل بس، من غير إعادة حساب أو تسجيل نشاط', async () => {
    mockDb.setResult('case_sessions:delete', { error: { message: 'delete failed' } });
    const { result, refetchAll } = renderSessionsHook();
    await act(async () => { await result.current.handleDeleteSession('sess-1'); });

    expect(toast).toHaveBeenCalledWith('❌ فشل حذف الجلسة، حاول مرة أخرى', true);
    expect(mockDb.updateSpy).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
    expect(refetchAll).not.toHaveBeenCalled();
  });
});

describe('useCaseSessions — handleUpdateSession', () => {
  it('تعارض (conflict) → مفيش توست ولا إعادة حساب ولا refetchAll', async () => {
    safeUpdate.mockResolvedValue({ success: false, conflict: true });
    const { result, refetchAll } = renderSessionsHook();
    await act(async () => { await result.current.handleUpdateSession('sess-1', { date: '2026-08-01' }); });

    expect(toast).not.toHaveBeenCalled();
    expect(mockDb.updateSpy).not.toHaveBeenCalled();
    expect(refetchAll).not.toHaveBeenCalled();
  });

  it('فشل (success: false, conflict: false) → توست فشل بس', async () => {
    safeUpdate.mockResolvedValue({ success: false, conflict: false });
    const { result, refetchAll } = renderSessionsHook();
    await act(async () => { await result.current.handleUpdateSession('sess-1', { date: '2026-08-01' }); });

    expect(toast).toHaveBeenCalledWith('❌ فشل تعديل بيانات الجلسة — تحقق من الاتصال وأعد المحاولة', true);
    expect(refetchAll).not.toHaveBeenCalled();
  });

  it('الجلسة مش موجودة في الـ state المحلي (sessions فاضية) → safeUpdate بيتنادى بـ knownUpdatedAt: null', async () => {
    safeUpdate.mockResolvedValue({ success: true, conflict: false });
    const { result } = renderSessionsHook();
    await act(async () => { await result.current.handleUpdateSession('sess-not-in-state', { date: '2026-08-01' }); });

    expect(safeUpdate).toHaveBeenCalledWith(expect.anything(), 'case_sessions', 'sess-not-in-state', expect.any(Object), null);
  });

  it('نجاح مع جلسة موجودة في الـ state → safeUpdate بـ updated_at الصحيح، إعادة حساب next_hearing، توست نجاح، تسجيل نشاط، ورسالة تيليجرام', async () => {
    safeUpdate.mockResolvedValue({ success: true, conflict: false });
    const onNotify = vi.fn();
    const { result, refetchAll } = renderSessionsHook(makeCase(), onNotify);
    act(() => { result.current.setSessions([{ id: 'sess-1', updated_at: '2026-07-01T00:00:00.000Z' } as never]); });

    await act(async () => {
      await result.current.handleUpdateSession('sess-1', { date: '2026-08-05', time_period: 'صباحي', description: 'تعديل الوصف' });
    });

    expect(safeUpdate).toHaveBeenCalledWith(
      expect.anything(), 'case_sessions', 'sess-1',
      expect.objectContaining({ session_date: '2026-08-05', session_time: 'صباحي', description: 'تعديل الوصف' }),
      '2026-07-01T00:00:00.000Z',
    );
    expect(mockDb.updateSpy).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('✅ تم تعديل الجلسة');
    expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تعديل جلسة', expect.objectContaining({ entity_type: 'session', entity_id: 'sess-1' }));
    expect(onNotify).toHaveBeenCalledTimes(1);
    expect(onNotify.mock.calls[0][0] as string).toContain('تم تعديل جلسة');
    expect(refetchAll).toHaveBeenCalled();
  });
});
