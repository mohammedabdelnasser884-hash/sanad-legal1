import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ClientRow, ProfileRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';

// ══════════════════════════════════════════════════════════════════
// Mock db (supabaseClient) — بيغطي بالظبط سلاسل الاستدعاءات المباشرة
// الموجودة فعليًا في useCaseDetailActions.ts (اتأكدت منها بقراءة الكود،
// مفيش تخمين):
//   - db.from('case_sessions').select('*').eq('case_id',x).order('session_date',{ascending:false})  [fetchSessions]
//   - db.from('case_notes').select('*').eq('case_id',x).order('created_at',{ascending:false})        [fetchSessions]
//   - db.from('case_documents').select('*').eq('case_id',x).order('created_at',{ascending:false})    [fetchSessions]
//   - db.from('case_notes').insert([{case_id,content}])                                               [handleAddNote]
//   - db.from('case_notes').delete().eq('id', noteId)                                                 [handleDeleteNote]
// تعديل حالة القضية (handleChangeStatus) وتعديل الملاحظة (handleUpdateNote)
// بيعديا عن طريق safeUpdate (دالة من dataAccess.ts) مش db.from مباشرة —
// فبنعملها mock كدالة منفصلة، مش عن طريق db.from.
// useCaseSessions/useCaseDocuments هوكس فرعية منفصلة (ليها ملفات تست
// مستقلة في الخطة) — بنعملهم mock هنا عشان نعزل منطق useCaseDetailActions.ts
// نفسه بس (fetchSessions المجمّعة + الملاحظات + تغيير الحالة).
// ══════════════════════════════════════════════════════════════════
type Result = { data?: unknown; error?: unknown };
const DEFAULT_RESULT: Result = { data: [], error: null };

function makeMockDb() {
  const configured: Record<string, Result> = {};
  const insertSpy = vi.fn();
  const deleteSpy = vi.fn();

  const setResult = (key: string, result: Result) => { configured[key] = result; };
  const get = (key: string) => configured[key] ?? DEFAULT_RESULT;

  function buildSelectChain(table: string) {
    const key = `${table}:select`;
    const c = {
      eq: vi.fn(() => c),
      order: vi.fn(() => c),
      then: (resolve: (r: Result) => void) => resolve(get(key)),
    };
    return c;
  }

  const from = vi.fn((table: string) => ({
    select: vi.fn(() => buildSelectChain(table)),
    insert: vi.fn((payload: unknown) => {
      insertSpy(table, payload);
      return Promise.resolve(get(`${table}:insert`));
    }),
    delete: vi.fn(() => {
      deleteSpy(table);
      return { eq: vi.fn(() => Promise.resolve(get(`${table}:delete`))) };
    }),
  }));

  return { from, setResult, insertSpy, deleteSpy };
}

let mockDb = makeMockDb();
vi.mock('../../../supabaseClient', () => ({ db: { from: (...a: Parameters<typeof mockDb.from>) => mockDb.from(...a) } }));

const toast = vi.fn();
vi.mock('../../../shared/lib/notifications', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const resolveStorageUrl = vi.fn();
vi.mock('../../../shared/lib/storage', () => ({ resolveStorageUrl: (...a: unknown[]) => resolveStorageUrl(...a) }));

const safeUpdate = vi.fn();
const logActivity = vi.fn();
vi.mock('../../../shared/lib/dataAccess', () => ({
  safeUpdate: (...a: unknown[]) => safeUpdate(...a),
  logActivity: (...a: unknown[]) => logActivity(...a),
}));

// useCaseSessions/useCaseDocuments هوكس فرعية — mock ثابت (مش state حقيقي)
// عشان نقدر نتحقق من setSessions/setDocs اتنادوا بإيه من جوه fetchSessions.
function makeSessionsHookMock() {
  return {
    sessions: [], setSessions: vi.fn(),
    showAddSession: false, setShowAddSession: vi.fn(),
    editingSession: null, setEditingSession: vi.fn(),
    deletingSessionId: null, setDeletingSessionId: vi.fn(),
    sessionUpdateTarget: null, setSessionUpdateTarget: vi.fn(),
    savingSession: false,
    sessionForm: {}, setSessionForm: vi.fn(),
    confirmDeleteSession: null, setConfirmDeleteSession: vi.fn(),
    handleAddSession: vi.fn(), handleUpdateSession: vi.fn(), handleDeleteSession: vi.fn(),
  };
}
function makeDocsHookMock() {
  return {
    docs: [], setDocs: vi.fn(),
    uploadingDoc: false, docCategory: 'مذكرة دفاع', setDocCategory: vi.fn(),
    docLabel: '', setDocLabel: vi.fn(), showDocForm: false, setShowDocForm: vi.fn(),
    pendingFile: null, setPendingFile: vi.fn(), deletingDocId: null, setDeletingDocId: vi.fn(),
    fileInputRef: { current: null },
    confirmDeleteDoc: null, setConfirmDeleteDoc: vi.fn(),
    handleFileSelect: vi.fn(), handleUploadDoc: vi.fn(), handleDeleteDoc: vi.fn(),
  };
}
let sessionsHookMock = makeSessionsHookMock();
let docsHookMock = makeDocsHookMock();
vi.mock('./useCaseSessions', () => ({ useCaseSessions: (...a: unknown[]) => sessionsHookMock }));
vi.mock('./useCaseDocuments', () => ({ useCaseDocuments: (...a: unknown[]) => docsHookMock }));

import { useCaseDetailActions } from './useCaseDetailActions';

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

async function renderDetailHook(caseData: MappedCase = makeCase(), onUpdate = vi.fn()) {
  const onDelete = vi.fn();
  const onNotify = vi.fn();
  const setShowStatusPicker = vi.fn();
  const view = renderHook(() => useCaseDetailActions(caseData, onUpdate, onDelete, onNotify, setShowStatusPicker, client, profile));
  await waitFor(() => expect(view.result.current.loadingSessions).toBe(false));
  return { ...view, onUpdate, onDelete, onNotify, setShowStatusPicker };
}

describe('useCaseDetailActions', () => {
  beforeEach(() => {
    mockDb = makeMockDb();
    sessionsHookMock = makeSessionsHookMock();
    docsHookMock = makeDocsHookMock();
    resolveStorageUrl.mockReset();
    resolveStorageUrl.mockResolvedValue('https://signed-url.example/doc1');
    vi.clearAllMocks();
  });

  describe('fetchSessions — التجميع عند mount', () => {
    it('بيجيب الجلسات عن طريق الهوك الفرعي، الملاحظات في state داخلي، والمستندات بروابط موقّعة طازة', async () => {
      mockDb.setResult('case_sessions:select', { data: [{ id: 'sess-1', session_date: '2026-07-01' }], error: null });
      mockDb.setResult('case_notes:select', { data: [{ id: 'note-1', case_id: 'case-1', content: 'ملاحظة أولى', updated_at: '2026-07-16T09:00:00.000Z' }], error: null });
      mockDb.setResult('case_documents:select', { data: [{ id: 'doc-1', storage_path: 'tenant/case-1/doc.pdf', file_url: null, file_name: 'doc.pdf' }], error: null });

      const { result } = await renderDetailHook();

      expect(sessionsHookMock.setSessions).toHaveBeenCalledWith([{ id: 'sess-1', session_date: '2026-07-01' }]);
      expect(result.current.notes).toEqual([{ id: 'note-1', case_id: 'case-1', content: 'ملاحظة أولى', updated_at: '2026-07-16T09:00:00.000Z' }]);
      expect(resolveStorageUrl).toHaveBeenCalledWith('case-docs', 'tenant/case-1/doc.pdf');
      expect(docsHookMock.setDocs).toHaveBeenCalledWith([expect.objectContaining({ id: 'doc-1', file_url: 'https://signed-url.example/doc1' })]);
    });
  });

  describe('handleAddNote', () => {
    it('نص فاضي (بعد trim) → مفيش أي نداء قاعدة بيانات خالص', async () => {
      const { result } = await renderDetailHook();
      act(() => { result.current.setNoteText('   '); });
      await act(async () => { await result.current.handleAddNote(); });

      expect(mockDb.insertSpy).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled();
    });

    it('نجاح → INSERT بمحتوى مقصوص (trim)، توست نجاح، تسجيل نشاط بـ case_type من caseData.type، وتصفير الفورم', async () => {
      mockDb.setResult('case_notes:insert', { error: null });
      const { result } = await renderDetailHook(makeCase({ type: 'جنائي' }));
      act(() => { result.current.setNoteText('  ملاحظة جديدة  '); });
      await act(async () => { await result.current.handleAddNote(); });

      expect(mockDb.insertSpy).toHaveBeenCalledWith('case_notes', [{ case_id: 'case-1', content: 'ملاحظة جديدة' }]);
      expect(toast).toHaveBeenCalledWith('✅ تمت إضافة الملاحظة');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'إضافة ملاحظة', expect.objectContaining({
        entity_type: 'note', case_type: 'جنائي', client_name: 'أحمد محمد', userName: 'المحامي سالم',
      }));
      expect(result.current.noteText).toBe('');
      expect(result.current.showAddNote).toBe(false);
    });

    it('فشل الإدخال → توست فشل، من غير تسجيل نشاط', async () => {
      mockDb.setResult('case_notes:insert', { error: { message: 'insert failed' } });
      const { result } = await renderDetailHook();
      act(() => { result.current.setNoteText('ملاحظة هتفشل'); });
      await act(async () => { await result.current.handleAddNote(); });

      expect(toast).toHaveBeenCalledWith('❌ فشل إضافة الملاحظة — تحقق من الاتصال وأعد المحاولة', true);
      expect(logActivity).not.toHaveBeenCalled();
    });
  });

  describe('handleDeleteNote', () => {
    it('نجاح → DELETE بالـ id، توست نجاح، تسجيل نشاط بالـ entity_id الصح', async () => {
      mockDb.setResult('case_notes:delete', { error: null });
      const { result } = await renderDetailHook();
      await act(async () => { await result.current.handleDeleteNote('note-del-1'); });

      expect(mockDb.deleteSpy).toHaveBeenCalledWith('case_notes');
      expect(toast).toHaveBeenCalledWith('🗑 تم حذف الملاحظة');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'حذف ملاحظة', expect.objectContaining({ entity_id: 'note-del-1' }));
    });

    it('فشل الحذف → توست فشل، من غير تسجيل نشاط', async () => {
      mockDb.setResult('case_notes:delete', { error: { message: 'delete failed' } });
      const { result } = await renderDetailHook();
      await act(async () => { await result.current.handleDeleteNote('note-del-2'); });

      expect(toast).toHaveBeenCalledWith('❌ فشل حذف الملاحظة، حاول مرة أخرى', true);
      expect(logActivity).not.toHaveBeenCalled();
    });
  });

  describe('handleUpdateNote', () => {
    it('نجاح → بيستخدم safeUpdate على case_notes بالـ updated_at الحقيقي المحفوظ في state الملاحظات', async () => {
      mockDb.setResult('case_notes:select', { data: [{ id: 'note-1', case_id: 'case-1', content: 'قديم', updated_at: '2026-07-16T09:00:00.000Z' }], error: null });
      safeUpdate.mockResolvedValue({ success: true, conflict: false, error: null });
      const { result } = await renderDetailHook();

      await act(async () => { await result.current.handleUpdateNote('note-1', 'نص محدّث'); });

      expect(safeUpdate).toHaveBeenCalledWith(expect.anything(), 'case_notes', 'note-1', { content: 'نص محدّث' }, '2026-07-16T09:00:00.000Z');
      expect(toast).toHaveBeenCalledWith('✅ تم تعديل الملاحظة');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تعديل ملاحظة', expect.objectContaining({ entity_id: 'note-1' }));
    });

    it('تعارض (conflict:true) → وقف فوري من غير توست نجاح أو تسجيل نشاط (الـ toast اتعرض جوه safeUpdate نفسها)', async () => {
      safeUpdate.mockResolvedValue({ success: false, conflict: true, error: null });
      const { result } = await renderDetailHook();

      await act(async () => { await result.current.handleUpdateNote('note-1', 'نص متعارض'); });

      expect(toast).not.toHaveBeenCalledWith('✅ تم تعديل الملاحظة');
      expect(logActivity).not.toHaveBeenCalled();
    });

    it('فشل (success:false, conflict:false) → توست فشل، من غير تسجيل نشاط', async () => {
      safeUpdate.mockResolvedValue({ success: false, conflict: false, error: { message: 'update failed' } });
      const { result } = await renderDetailHook();

      await act(async () => { await result.current.handleUpdateNote('note-1', 'نص فاشل'); });

      expect(toast).toHaveBeenCalledWith('❌ فشل تعديل الملاحظة — تحقق من الاتصال وأعد المحاولة', true);
      expect(logActivity).not.toHaveBeenCalled();
    });
  });

  describe('handleChangeStatus', () => {
    it('نجاح → بيقفل status picker، يستخدم safeUpdate على cases بـ updated_at بتاع caseData، وينادي onUpdate بالحالة الجديدة', async () => {
      safeUpdate.mockResolvedValue({ success: true, conflict: false, error: null });
      const caseData = makeCase({ id: 'case-status-1', title: 'قضية للتغيير', updated_at: '2026-07-16T08:00:00.000Z' });
      const { result, onUpdate, setShowStatusPicker } = await renderDetailHook(caseData);

      await act(async () => { await result.current.handleChangeStatus('مؤجلة'); });

      expect(setShowStatusPicker).toHaveBeenCalledWith(false);
      expect(safeUpdate).toHaveBeenCalledWith(expect.anything(), 'cases', 'case-status-1', { status: 'مؤجلة' }, '2026-07-16T08:00:00.000Z');
      expect(toast).toHaveBeenCalledWith('✅ تم تحديث حالة القضية');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تغيير حالة قضية', expect.objectContaining({
        entity_id: 'case-status-1', details: 'قضية للتغيير — مؤجلة',
      }));
      expect(onUpdate).toHaveBeenCalledWith('مؤجلة');
    });

    it('تعارض → وقف فوري، من غير onUpdate', async () => {
      safeUpdate.mockResolvedValue({ success: false, conflict: true, error: null });
      const { result, onUpdate } = await renderDetailHook();

      await act(async () => { await result.current.handleChangeStatus('منتهية'); });

      expect(onUpdate).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalledWith('✅ تم تحديث حالة القضية');
    });

    it('فشل → توست فشل، من غير onUpdate', async () => {
      safeUpdate.mockResolvedValue({ success: false, conflict: false, error: { message: 'status update failed' } });
      const { result, onUpdate } = await renderDetailHook();

      await act(async () => { await result.current.handleChangeStatus('منتهية'); });

      expect(toast).toHaveBeenCalledWith('❌ فشل تغيير الحالة', true);
      expect(onUpdate).not.toHaveBeenCalled();
    });
  });
});
