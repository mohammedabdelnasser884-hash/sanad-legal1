import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAdminPortal } from './useAdminPortal';
import type { ProfileRow, ClientRow } from '../../../../types';

// ══════════════════════════════════════════════════════════════════
// Mock db (supabaseClient) — بيغطي بالظبط سلاسل الاستدعاءات الفعلية في
// useAdminPortal.ts (اتأكدت منها بقراءة الكود، مفيش تخمين):
//   - db.from('client_portal_pins').select('client_id,is_active,client_name,email')  [fetchPortalAccess]
//   - db.rpc('set_portal_pin', { p_client_id, p_pin, p_is_active, p_client_name, p_email })  [handleSavePortal]
// ══════════════════════════════════════════════════════════════════
type Result = { data?: unknown; error?: { message?: string } | null };

const selectSpy = vi.fn();
const rpcSpy = vi.fn();
let selectResult: Result = { data: null, error: null };
let rpcResult: Result = { data: null, error: null };

const from = vi.fn((table: string) => ({
  select: vi.fn((cols: string) => {
    selectSpy(table, cols);
    return Promise.resolve(selectResult);
  }),
}));
const rpc = vi.fn((fn: string, args: unknown) => {
  rpcSpy(fn, args);
  return Promise.resolve(rpcResult);
});

vi.mock('../../../../supabaseClient', () => ({
  db: {
    from: (...a: Parameters<typeof from>) => from(...a),
    rpc: (...a: Parameters<typeof rpc>) => rpc(...a),
  },
}));

const toast = vi.fn();
vi.mock('../../../../shared/lib/notifications', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const logActivity = vi.fn();
vi.mock('../../../../shared/lib/dataAccess', () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

const PROFILE = { id: 'admin-1', full_name: 'أحمد المدير' } as unknown as ProfileRow;

const SAVE_FORM = { client_id: 'client-1', pin: '1234', is_active: true, client_name: 'محمد الموكل', email: 'm@sanad.test' };

beforeEach(() => {
  selectSpy.mockClear();
  rpcSpy.mockClear();
  from.mockClear();
  rpc.mockClear();
  toast.mockClear();
  logActivity.mockClear();
  selectResult = { data: null, error: null };
  rpcResult = { data: null, error: null };
});

function setup(profile: ProfileRow | null | undefined = PROFILE) {
  return renderHook(() => useAdminPortal(profile));
}

describe('useAdminPortal', () => {
  describe('fetchPortalAccess', () => {
    it('نجاح → بيجيب الأعمدة المحدودة بس (من غير pin/pin_hash)، وبيملي portalAccess', async () => {
      const rows = [{ client_id: 'c1', is_active: true, client_name: 'محمد', email: 'm@sanad.test' }];
      selectResult = { data: rows, error: null };
      const { result } = setup();

      await act(async () => { await result.current.fetchPortalAccess(); });

      expect(selectSpy).toHaveBeenCalledWith('client_portal_pins', 'client_id,is_active,client_name,email');
      expect(result.current.portalAccess).toEqual(rows);
    });

    it('data:null → portalAccess بتفضل [] الافتراضية، من غير كراش', async () => {
      const { result } = setup();
      await act(async () => { await result.current.fetchPortalAccess(); });
      expect(result.current.portalAccess).toEqual([]);
    });
  });

  describe('handleSavePortal', () => {
    it('نجاح → db.rpc بـ set_portal_pin بكل الحقول الخمسة (p_ prefix)، توست نجاح باسم الموكل، logActivity، setPortalClient(null)، وإعادة تحميل portalAccess', async () => {
      const { result } = setup();
      act(() => { result.current.setPortalClient({ id: 'client-1' } as unknown as ClientRow); });

      await act(async () => { await result.current.handleSavePortal(SAVE_FORM); });

      expect(rpcSpy).toHaveBeenCalledWith('set_portal_pin', {
        p_client_id: 'client-1', p_pin: '1234', p_is_active: true,
        p_client_name: 'محمد الموكل', p_email: 'm@sanad.test',
      });
      expect(toast).toHaveBeenCalledWith('✅ تم حفظ إعدادات بوابة محمد الموكل');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'حفظ بوابة موكل', {
        userName: 'أحمد المدير', entity_type: 'portal', entity_id: 'client-1',
        details: 'محمد الموكل — مفعّلة', client_name: 'محمد الموكل',
      });
      expect(result.current.portalClient).toBeNull();
      // fetchPortalAccess اتنادى تاني بعد الحفظ
      expect(selectSpy).toHaveBeenCalledWith('client_portal_pins', 'client_id,is_active,client_name,email');
      expect(result.current.savingPortal).toBe(false);
    });

    it('بوابة معطّلة (is_active:false) → التفاصيل في logActivity بتقول "معطّلة"', async () => {
      const { result } = setup();
      await act(async () => { await result.current.handleSavePortal({ ...SAVE_FORM, is_active: false }); });
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'حفظ بوابة موكل', expect.objectContaining({ details: 'محمد الموكل — معطّلة' }));
    });

    it('فشل الـ rpc → توست فشل عام، من غير logActivity ولا setPortalClient(null) ولا إعادة تحميل', async () => {
      rpcResult = { error: { message: 'db error' } };
      const { result } = setup();
      act(() => { result.current.setPortalClient({ id: 'client-1' } as unknown as ClientRow); });

      await act(async () => { await result.current.handleSavePortal(SAVE_FORM); });

      expect(toast).toHaveBeenCalledWith('❌ حدث خطأ، يرجى المحاولة مرة أخرى', true);
      expect(logActivity).not.toHaveBeenCalled();
      expect(result.current.portalClient).not.toBeNull();
      expect(selectSpy).not.toHaveBeenCalled();
      expect(result.current.savingPortal).toBe(false);
    });

    it('من غير profile (undefined) → logActivity بـ userName:null', async () => {
      const { result } = renderHook(() => useAdminPortal(undefined));
      await act(async () => { await result.current.handleSavePortal(SAVE_FORM); });
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'حفظ بوابة موكل', expect.objectContaining({ userName: null }));
    });

    it('بريد فاضي (email:null) → بيتبعت زي ما هو p_email:null، وclient_name بيتحط زي ما هو في التفاصيل', async () => {
      const { result } = setup();
      await act(async () => { await result.current.handleSavePortal({ ...SAVE_FORM, email: null }); });
      expect(rpcSpy).toHaveBeenCalledWith('set_portal_pin', expect.objectContaining({ p_email: null }));
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'حفظ بوابة موكل', expect.objectContaining({ client_name: 'محمد الموكل' }));
    });
  });
});
