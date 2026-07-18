import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAdminUsers } from './useAdminUsers';
import type { ProfileRow } from '../../../../types';

// ══════════════════════════════════════════════════════════════════
// Mock db (supabaseClient) — بيغطي الاستخدامات الفعلية في useAdminUsers.ts
// (اتأكدت منها بقراءة الكود، مفيش تخمين):
//   - db.from('profiles').update({...}).eq('id', x)   [handleEditUser, toggleUserActive, handleToggleLock]
//   - db.from('profiles').delete().eq('id', x)          [handleDeleteUser]
// handleAddUser/handleChangePassword/handleSignOutAllDevices بيعدّوا عن
// طريق callAdminAction فقط (من نفس ملف supabaseClient). toggleUserActive
// كمان بتستخدم callAdminAction (action:'force_signout') جوه try/catch
// منفصل — الفشل فيها ما بيوقفش باقي العملية (FIX موثّق في تعليق الكود نفسه).
// ══════════════════════════════════════════════════════════════════
type Result = { error?: { message?: string } | null };

function makeMockDb() {
  const configured: Record<string, Result> = {};
  const updateSpy = vi.fn();
  const deleteSpy = vi.fn();

  const setResult = (key: string, result: Result) => { configured[key] = result; };
  const get = (key: string) => configured[key] ?? { error: null };

  const from = vi.fn((table: string) => ({
    update: vi.fn((payload: Record<string, unknown>) => {
      updateSpy(table, payload);
      return { eq: vi.fn((col: string, val: unknown) => { updateSpy('eq', col, val); return Promise.resolve(get(`${table}:update`)); }) };
    }),
    delete: vi.fn(() => ({
      eq: vi.fn((col: string, val: unknown) => { deleteSpy(col, val); return Promise.resolve(get(`${table}:delete`)); }),
    })),
  }));

  return { from, setResult, updateSpy, deleteSpy };
}

let mockDb = makeMockDb();
const callAdminAction = vi.fn();
vi.mock('../../../../supabaseClient', () => ({
  db: { from: (...a: Parameters<typeof mockDb.from>) => mockDb.from(...a) },
  callAdminAction: (...a: unknown[]) => callAdminAction(...a),
}));

const toast = vi.fn();
vi.mock('../../../../shared/lib/notifications', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const logActivity = vi.fn();
vi.mock('../../../../shared/lib/dataAccess', () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

const recordError = vi.fn();
vi.mock('../../../../systemHealth', () => ({ recordError: (...a: unknown[]) => recordError(...a) }));

const PROFILE = { id: 'admin-1', full_name: 'أحمد المدير' } as unknown as ProfileRow;
const TARGET_USER = { id: 'u1', user_id: 'auth-u1', full_name: 'محمد المحامي', is_active: true, is_locked: false, failed_login_attempts: 3 } as unknown as ProfileRow;

beforeEach(() => {
  mockDb = makeMockDb();
  callAdminAction.mockClear();
  toast.mockClear();
  logActivity.mockClear();
  recordError.mockClear();
});

function setup(fetchLawyers = vi.fn(), ...profileArg: [ProfileRow | null | undefined] | []) {
  // ⚠️ ملحوظة: متستخدمش default parameter هنا (= PROFILE) — لو التست
  // بينادي setup(fetchLawyers, undefined) بالصراحة، الـ default بيتفعّل برضه
  // ويستبدل undefined بـ PROFILE، وده كان بيلغي اختبار حالة "من غير profile".
  // استخدام rest param بيفرّق بين "معدّاش الآرجيومنت خالص" و"بعته undefined بالصراحة".
  const profile = profileArg.length ? profileArg[0] : PROFILE;
  return renderHook(() => useAdminUsers(fetchLawyers, profile));
}

describe('useAdminUsers', () => {
  describe('handleEditUser', () => {
    it('نجاح → update بالحقول الأربعة، توست نجاح، logActivity بـ userName من البروفايل، setEditUser(null)، fetchLawyers', async () => {
      const fetchLawyers = vi.fn();
      const { result } = setup(fetchLawyers);
      act(() => { result.current.setEditUser(TARGET_USER); });

      await act(async () => {
        await result.current.handleEditUser({ full_name: 'محمد المعدّل', role: 'lawyer', is_active: true, permissions: { cases: true } });
      });

      expect(mockDb.updateSpy).toHaveBeenCalledWith('profiles', { full_name: 'محمد المعدّل', role: 'lawyer', is_active: true, permissions: { cases: true } });
      expect(mockDb.updateSpy).toHaveBeenCalledWith('eq', 'id', 'u1');
      expect(toast).toHaveBeenCalledWith('✅ تم تحديث بيانات المستخدم');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تعديل مستخدم', { userName: 'أحمد المدير', entity_type: 'user', entity_id: 'u1', details: 'محمد المعدّل' });
      expect(result.current.editUser).toBeNull();
      expect(fetchLawyers).toHaveBeenCalledTimes(1);
    });

    it('فشل الـ update → توست فشل، من غير logActivity/setEditUser(null)/fetchLawyers', async () => {
      mockDb.setResult('profiles:update', { error: { message: 'db error' } });
      const fetchLawyers = vi.fn();
      const { result } = setup(fetchLawyers);
      act(() => { result.current.setEditUser(TARGET_USER); });

      await act(async () => {
        await result.current.handleEditUser({ full_name: 'x', role: 'lawyer', is_active: true, permissions: {} });
      });

      expect(toast).toHaveBeenCalledWith('❌ فشل الحفظ، يرجى المحاولة مرة أخرى', true);
      expect(logActivity).not.toHaveBeenCalled();
      expect(result.current.editUser).toEqual(TARGET_USER);
      expect(fetchLawyers).not.toHaveBeenCalled();
    });

    it('من غير profile (undefined) → logActivity بـ userName:null', async () => {
      const fetchLawyers = vi.fn();
      const { result } = setup(fetchLawyers, undefined);
      act(() => { result.current.setEditUser(TARGET_USER); });
      await act(async () => {
        await result.current.handleEditUser({ full_name: 'x', role: 'lawyer', is_active: true, permissions: {} });
      });
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تعديل مستخدم', expect.objectContaining({ userName: null }));
    });
  });

  describe('handleAddUser', () => {
    it('نجاح → callAdminAction بـ action:create_lawyer بكل الحقول، توست نجاح، logActivity، setShowAddUser(false)، fetchLawyers', async () => {
      callAdminAction.mockResolvedValue({ ok: true });
      const fetchLawyers = vi.fn();
      const { result } = setup(fetchLawyers);
      act(() => { result.current.setShowAddUser(true); });

      await act(async () => {
        await result.current.handleAddUser({ full_name: 'سارة', email: 's@sanad.test', password: 'pass123', role: 'lawyer', permissions: { fees: true } });
      });

      expect(callAdminAction).toHaveBeenCalledWith({ action: 'create_lawyer', email: 's@sanad.test', password: 'pass123', full_name: 'سارة', role: 'lawyer', permissions: { fees: true } });
      expect(toast).toHaveBeenCalledWith('✅ تم إنشاء حساب سارة');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'إضافة مستخدم', expect.objectContaining({ entity_type: 'user', details: 'سارة (lawyer)' }));
      expect(result.current.showAddUser).toBe(false);
      expect(fetchLawyers).toHaveBeenCalledTimes(1);
    });

    it('نجاح من غير role → details بتستخدم "—" كـ fallback', async () => {
      callAdminAction.mockResolvedValue({ ok: true });
      const { result } = setup();
      await act(async () => {
        await result.current.handleAddUser({ full_name: 'سارة', email: 's@sanad.test', password: 'pass123', role: '', permissions: {} });
      });
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'إضافة مستخدم', expect.objectContaining({ details: 'سارة (—)' }));
    });

    it('🆕 فشل بـ Error → الرسالة الموحدة تتعرض للمستخدم، والخام يتسجل عبر recordError فقط', async () => {
      callAdminAction.mockRejectedValue(new Error('البريد مستخدم بالفعل'));
      const fetchLawyers = vi.fn();
      const { result } = setup(fetchLawyers);
      act(() => { result.current.setShowAddUser(true); });

      await act(async () => {
        await result.current.handleAddUser({ full_name: 'سارة', email: 's@sanad.test', password: 'pass123', role: 'lawyer', permissions: {} });
      });

      expect(toast).toHaveBeenCalledWith('❌ تعذّر إنشاء الحساب. تأكد من صحة البيانات وحاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', true);
      expect(recordError).toHaveBeenCalledWith('admin_create_user', 'البريد مستخدم بالفعل', expect.objectContaining({ label: 'إنشاء مستخدم' }));
      expect(logActivity).not.toHaveBeenCalled();
      expect(result.current.showAddUser).toBe(true);
      expect(fetchLawyers).not.toHaveBeenCalled();
    });

    it('🆕 فشل باستثناء غير Error → نفس الرسالة الموحدة، والخام (كنص) يتسجل عبر recordError', async () => {
      callAdminAction.mockRejectedValue('some string error');
      const { result } = setup();
      await act(async () => {
        await result.current.handleAddUser({ full_name: 'سارة', email: 's@sanad.test', password: 'pass123', role: 'lawyer', permissions: {} });
      });
      expect(toast).toHaveBeenCalledWith('❌ تعذّر إنشاء الحساب. تأكد من صحة البيانات وحاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', true);
      expect(recordError).toHaveBeenCalledWith('admin_create_user', 'some string error', expect.objectContaining({ label: 'إنشاء مستخدم' }));
    });
  });

  describe('handleDeleteUser', () => {
    it('نجاح → delete بالـ id الصحيح، توست، logActivity، setConfirmDelete(null)، fetchLawyers', async () => {
      const fetchLawyers = vi.fn();
      const { result } = setup(fetchLawyers);
      act(() => { result.current.setConfirmDelete(TARGET_USER); });

      await act(async () => { await result.current.handleDeleteUser(TARGET_USER); });

      expect(mockDb.deleteSpy).toHaveBeenCalledWith('id', 'u1');
      expect(toast).toHaveBeenCalledWith('✅ تم حذف المستخدم');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'حذف مستخدم', expect.objectContaining({ entity_id: 'u1', details: 'محمد المحامي' }));
      expect(result.current.confirmDelete).toBeNull();
      expect(fetchLawyers).toHaveBeenCalledTimes(1);
    });

    it('فشل → توست فشل، من غير logActivity/fetchLawyers', async () => {
      mockDb.setResult('profiles:delete', { error: { message: 'db error' } });
      const fetchLawyers = vi.fn();
      const { result } = setup(fetchLawyers);
      await act(async () => { await result.current.handleDeleteUser(TARGET_USER); });
      expect(toast).toHaveBeenCalledWith('❌ حدث خطأ، يرجى المحاولة مرة أخرى', true);
      expect(logActivity).not.toHaveBeenCalled();
      expect(fetchLawyers).not.toHaveBeenCalled();
    });
  });

  describe('toggleUserActive', () => {
    it('تفعيل حساب معطّل (is_active:false → true) → update بـ is_active:true، توست تفعيل، logActivity "تفعيل مستخدم"، من غير أي نداء force_signout', async () => {
      const fetchLawyers = vi.fn();
      const { result } = setup(fetchLawyers);
      const inactiveUser = { ...TARGET_USER, is_active: false };
      await act(async () => { await result.current.toggleUserActive(inactiveUser); });

      expect(mockDb.updateSpy).toHaveBeenCalledWith('profiles', { is_active: true });
      expect(callAdminAction).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith('✅ تم تفعيل الحساب');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تفعيل مستخدم', expect.objectContaining({ entity_id: 'u1' }));
      expect(fetchLawyers).toHaveBeenCalledTimes(1);
    });

    it('تعطيل حساب نشط + force_signout ناجحة → توست "تم تعطيل الحساب وإنهاء جلساته"، logActivity "تعطيل مستخدم"', async () => {
      callAdminAction.mockResolvedValue({ ok: true });
      const { result } = setup();
      await act(async () => { await result.current.toggleUserActive(TARGET_USER); });

      expect(mockDb.updateSpy).toHaveBeenCalledWith('profiles', { is_active: false });
      expect(callAdminAction).toHaveBeenCalledWith({ action: 'force_signout', user_id: 'auth-u1' });
      expect(toast).toHaveBeenCalledWith('⚠️ تم تعطيل الحساب وإنهاء جلساته');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تعطيل مستخدم', expect.objectContaining({ entity_id: 'u1' }));
    });

    it('تعطيل حساب نشط + force_signout بترمي استثناء → مفيش وقف للعملية، رسالة توضيحية مختلفة "تعذر إنهاء جلساته"، لكن logActivity وfetchLawyers لسه بيتنادوا', async () => {
      callAdminAction.mockRejectedValue(new Error('network down'));
      const fetchLawyers = vi.fn();
      const { result } = setup(fetchLawyers);
      await act(async () => { await result.current.toggleUserActive(TARGET_USER); });

      expect(toast).toHaveBeenCalledWith('⚠️ تم تعطيل الحساب، لكن تعذر إنهاء جلساته الحالية');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تعطيل مستخدم', expect.objectContaining({ entity_id: 'u1' }));
      expect(fetchLawyers).toHaveBeenCalledTimes(1);
    });

    it('تعطيل مستخدم من غير user_id (مفيش حساب auth مرتبط) → مفيش أي نداء لـ force_signout، رسالة النجاح العادية', async () => {
      const userNoAuth = { ...TARGET_USER, user_id: null };
      const { result } = setup();
      await act(async () => { await result.current.toggleUserActive(userNoAuth); });
      expect(callAdminAction).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith('⚠️ تم تعطيل الحساب وإنهاء جلساته');
    });

    it('فشل الـ update الأساسي → توست فشل، من غير أي محاولة force_signout أو logActivity أو fetchLawyers', async () => {
      mockDb.setResult('profiles:update', { error: { message: 'db error' } });
      const fetchLawyers = vi.fn();
      const { result } = setup(fetchLawyers);
      await act(async () => { await result.current.toggleUserActive(TARGET_USER); });
      expect(toast).toHaveBeenCalledWith('❌ حدث خطأ، يرجى المحاولة مرة أخرى', true);
      expect(callAdminAction).not.toHaveBeenCalled();
      expect(logActivity).not.toHaveBeenCalled();
      expect(fetchLawyers).not.toHaveBeenCalled();
    });
  });

  describe('handleChangePassword', () => {
    it('نجاح → callAdminAction بـ action:change_password، توست نجاح، logActivity، setChangePassUser(null)', async () => {
      callAdminAction.mockResolvedValue({ ok: true });
      const { result } = setup();
      act(() => { result.current.setChangePassUser(TARGET_USER); });

      await act(async () => {
        await result.current.handleChangePassword({ userId: 'u1', newPassword: 'newpass123', forceChange: true });
      });

      expect(callAdminAction).toHaveBeenCalledWith({ action: 'change_password', user_id: 'u1', new_password: 'newpass123', force_change: true });
      expect(toast).toHaveBeenCalledWith('✅ تم تحديث كلمة المرور بنجاح');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تغيير كلمة مرور مستخدم', expect.objectContaining({ entity_id: 'u1' }));
      expect(result.current.changePassUser).toBeNull();
    });

    it('فشل → رسالة توست ثابتة "فشل تحديث كلمة المرور" (مش رسالة الخطأ نفسها)، من غير logActivity أو setChangePassUser(null)', async () => {
      callAdminAction.mockRejectedValue(new Error('رسالة تفصيلية من السيرفر'));
      const { result } = setup();
      act(() => { result.current.setChangePassUser(TARGET_USER); });

      await act(async () => {
        await result.current.handleChangePassword({ userId: 'u1', newPassword: 'x', forceChange: false });
      });

      expect(toast).toHaveBeenCalledWith('❌ فشل تحديث كلمة المرور', true);
      expect(logActivity).not.toHaveBeenCalled();
      expect(result.current.changePassUser).toEqual(TARGET_USER);
    });
  });

  describe('handleSignOutAllDevices', () => {
    it('نجاح مع user_id موجودة → callAdminAction بـ user_id (مش id البروفايل)، توست باسم المستخدم، logActivity، setConfirmSignOut(null)', async () => {
      callAdminAction.mockResolvedValue({ ok: true });
      const { result } = setup();
      act(() => { result.current.setConfirmSignOut(TARGET_USER); });

      await act(async () => { await result.current.handleSignOutAllDevices(TARGET_USER); });

      expect(callAdminAction).toHaveBeenCalledWith({ action: 'force_signout', user_id: 'auth-u1' });
      expect(toast).toHaveBeenCalledWith('✅ تم تسجيل خروج محمد المحامي من جميع الأجهزة');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تسجيل خروج قسري', expect.objectContaining({ entity_id: 'auth-u1' }));
      expect(result.current.confirmSignOut).toBeNull();
    });

    it('مفيش user_id → fallback لـ id البروفايل نفسه', async () => {
      callAdminAction.mockResolvedValue({ ok: true });
      const userNoAuth = { ...TARGET_USER, user_id: null };
      const { result } = setup();
      await act(async () => { await result.current.handleSignOutAllDevices(userNoAuth); });
      expect(callAdminAction).toHaveBeenCalledWith({ action: 'force_signout', user_id: 'u1' });
    });

    it('فشل → توست فشل ثابت، من غير logActivity أو setConfirmSignOut(null)', async () => {
      callAdminAction.mockRejectedValue(new Error('x'));
      const { result } = setup();
      act(() => { result.current.setConfirmSignOut(TARGET_USER); });
      await act(async () => { await result.current.handleSignOutAllDevices(TARGET_USER); });
      expect(toast).toHaveBeenCalledWith('❌ فشل تسجيل الخروج', true);
      expect(logActivity).not.toHaveBeenCalled();
      expect(result.current.confirmSignOut).toEqual(TARGET_USER);
    });
  });

  describe('handleToggleLock', () => {
    it('قفل حساب مفتوح (is_locked:false) → update بـ is_locked:true وfailed_login_attempts بيفضل زي ما هو (3)، توست قفل، logActivity "قفل حساب"', async () => {
      const fetchLawyers = vi.fn();
      const { result } = setup(fetchLawyers);
      await act(async () => { await result.current.handleToggleLock(TARGET_USER); });

      expect(mockDb.updateSpy).toHaveBeenCalledWith('profiles', { is_locked: true, failed_login_attempts: 3 });
      expect(toast).toHaveBeenCalledWith('🔒 تم قفل الحساب');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'قفل حساب', expect.objectContaining({ entity_id: 'u1' }));
      expect(fetchLawyers).toHaveBeenCalledTimes(1);
    });

    it('فتح حساب مقفول (is_locked:true) → update بـ is_locked:false وfailed_login_attempts بيتصفّر لـ 0، توست فتح، logActivity "فتح حساب"', async () => {
      const lockedUser = { ...TARGET_USER, is_locked: true, failed_login_attempts: 5 };
      const { result } = setup();
      await act(async () => { await result.current.handleToggleLock(lockedUser); });

      expect(mockDb.updateSpy).toHaveBeenCalledWith('profiles', { is_locked: false, failed_login_attempts: 0 });
      expect(toast).toHaveBeenCalledWith('🔓 تم فتح الحساب');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'فتح حساب', expect.objectContaining({ entity_id: 'u1' }));
    });

    it('فشل الـ update → توست فشل، من غير logActivity أو fetchLawyers أو setConfirmLock(null)', async () => {
      mockDb.setResult('profiles:update', { error: { message: 'db error' } });
      const fetchLawyers = vi.fn();
      const { result } = setup(fetchLawyers);
      act(() => { result.current.setConfirmLock(TARGET_USER); });
      await act(async () => { await result.current.handleToggleLock(TARGET_USER); });
      expect(toast).toHaveBeenCalledWith('❌ حدث خطأ، يرجى المحاولة مرة أخرى', true);
      expect(logActivity).not.toHaveBeenCalled();
      expect(fetchLawyers).not.toHaveBeenCalled();
      expect(result.current.confirmLock).toEqual(TARGET_USER);
    });
  });
});
