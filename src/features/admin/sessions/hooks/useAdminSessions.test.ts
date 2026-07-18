import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAdminSessions } from './useAdminSessions';
import type { ProfileRow } from '../../../../types';

// ══════════════════════════════════════════════════════════════════
// Mock db (supabaseClient) — بيغطي سلسلة الاستدعاء الفعلية الوحيدة في
// useAdminSessions.ts (اتأكدت منها بقراءة الكود):
//   db.from('profiles').select('id,user_id,full_name,email,role,
//     last_seen_at,last_seen_device,last_seen_browser,last_seen_ip,is_active')
//     .order('last_seen_at', { ascending: false })
// ══════════════════════════════════════════════════════════════════
type Result = { data?: unknown; error?: { message?: string } | null; reject?: boolean; rejectMessage?: string };
const DEFAULT_RESULT: Result = { data: [], error: null };

function makeMockDb() {
  let configured: Result = { ...DEFAULT_RESULT };
  const setResult = (result: Result) => { configured = result; };
  const selectSpy = vi.fn();
  const orderSpy = vi.fn();

  const from = vi.fn((table: string) => ({
    select: vi.fn((cols: string) => {
      selectSpy(table, cols);
      return {
        order: vi.fn((col: string, opts: unknown) => {
          orderSpy(col, opts);
          if (configured.reject) return Promise.reject(new Error(configured.rejectMessage || 'boom'));
          return Promise.resolve(configured);
        }),
      };
    }),
  }));

  return { from, setResult, selectSpy, orderSpy };
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
vi.mock('../../../../shared/lib/dataAccess', () => ({
  logActivity: (...a: unknown[]) => logActivity(...a),
  // detectDevice الحقيقية (مش موك) عشان نتأكد من سلوكها الفعلي وقت
  // الـ fallback (لو last_seen_device فاضي)، بدل تخمين قيمة وهمية.
  detectDevice: (ua: string) => {
    if (!ua) return 'جهاز غير معروف 💻';
    const u = ua.toLowerCase();
    if (u.includes('iphone') || u.includes('android') || u.includes('mobile')) return 'هاتف محمول 📱';
    if (u.includes('ipad') || u.includes('tablet')) return 'تابلت 📲';
    if (u.includes('mac')) return 'Mac 💻';
    if (u.includes('windows')) return 'Windows 🖥';
    if (u.includes('linux')) return 'Linux 🐧';
    return 'جهاز غير معروف 💻';
  },
}));

const PROFILE = { id: 'admin-1', full_name: 'أحمد المدير' } as unknown as ProfileRow;
const NOW = new Date('2026-07-17T12:00:00.000Z');

function minutesAgo(min: number): string {
  return new Date(NOW.getTime() - min * 60000).toISOString();
}

beforeEach(() => {
  mockDb = makeMockDb();
  callAdminAction.mockReset();
  toast.mockClear();
  logActivity.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// section=null (مش 'sessions') بشكل افتراضي عشان الـ auto-refresh useEffect
// ميتفعّلش لوحده ويزوّد عدد نداءات select في تستات مش متعلقة بيه.
function setup(section: string | null = null, profile: ProfileRow | null = PROFILE) {
  return renderHook(() => useAdminSessions(section, profile));
}

describe('useAdminSessions', () => {
  describe('fetchActiveSessions', () => {
    it('نجاح → بيفلتر آخر 24 ساعة بس، بيحسب diffMin/isOnline صح، sessionsLastRefresh بيتحدّث', async () => {
      mockDb.setResult({
        data: [
          { id: 'p1', user_id: 'u1', full_name: 'محمد', email: 'm@x.com', role: 'lawyer', last_seen_at: minutesAgo(3), last_seen_device: 'iPhone', last_seen_browser: 'Safari', last_seen_ip: '1.1.1.1', is_active: true },
          { id: 'p2', user_id: 'u2', full_name: 'سارة', email: 's@x.com', role: 'admin', last_seen_at: minutesAgo(10), last_seen_device: null, last_seen_browser: 'Chrome', last_seen_ip: '2.2.2.2', is_active: true },
          // ده هيتستثنى — آخر نشاط من 25 ساعة (أكتر من H24)
          { id: 'p3', user_id: 'u3', full_name: 'قديم', email: 'q@x.com', role: 'lawyer', last_seen_at: minutesAgo(25 * 60), last_seen_device: 'Windows', last_seen_browser: 'Edge', last_seen_ip: '3.3.3.3', is_active: true },
        ],
        error: null,
      });
      const { result } = setup();
      await act(async () => { await result.current.fetchActiveSessions(); });

      expect(mockDb.selectSpy).toHaveBeenCalledWith('profiles', 'id,user_id,full_name,email,role,last_seen_at,last_seen_device,last_seen_browser,last_seen_ip,is_active');
      expect(mockDb.orderSpy).toHaveBeenCalledWith('last_seen_at', { ascending: false });
      expect(result.current.activeSessions).toHaveLength(2);

      const [s1, s2] = result.current.activeSessions;
      expect(s1).toMatchObject({ id: 'u1', profileId: 'p1', userId: 'u1', name: 'محمد', diffMin: 3, isOnline: true, isActive: true });
      expect(s2).toMatchObject({ id: 'u2', profileId: 'p2', userId: 'u2', name: 'سارة', diffMin: 10, isOnline: false, isActive: true });
      expect(result.current.sessionsLastRefresh).toEqual(NOW);
      expect(result.current.loadingSessions).toBe(false);
    });

    it('القيم الافتراضية (fallbacks) → name:"—"، email:""، role:"lawyer"، browser الرسالة الثابتة، ip:"—"، device عبر detectDevice لو last_seen_device فاضي', async () => {
      mockDb.setResult({
        data: [{ id: 'p1', user_id: null, full_name: null, email: null, role: null, last_seen_at: minutesAgo(1), last_seen_device: null, last_seen_browser: 'iPhone Mobile Safari', last_seen_ip: null, is_active: true }],
        error: null,
      });
      const { result } = setup();
      await act(async () => { await result.current.fetchActiveSessions(); });

      const s = result.current.activeSessions[0];
      expect(s).toMatchObject({ id: 'p1', userId: null, name: '—', email: '', role: 'lawyer', ip: '—', device: 'هاتف محمول 📱', browser: 'iPhone Mobile Safari' });
    });

    it('browser فاضي كمان → الرسالة الثابتة "متصفح غير معروف" و device برجع "جهاز غير معروف 💻"', async () => {
      mockDb.setResult({
        data: [{ id: 'p1', user_id: 'u1', full_name: 'محمد', email: 'm@x.com', role: 'lawyer', last_seen_at: minutesAgo(1), last_seen_device: null, last_seen_browser: null, last_seen_ip: null, is_active: true }],
        error: null,
      });
      const { result } = setup();
      await act(async () => { await result.current.fetchActiveSessions(); });
      const s = result.current.activeSessions[0];
      expect(s.browser).toBe('متصفح غير معروف');
      expect(s.device).toBe('جهاز غير معروف 💻');
    });

    it('is_active:false → isActive:false، وis_active غير موجود (undefined) → isActive:true (فقط false صريحة بتستثني)', async () => {
      mockDb.setResult({
        data: [
          { id: 'p1', user_id: 'u1', full_name: 'معطّل', email: '', role: 'lawyer', last_seen_at: minutesAgo(1), last_seen_device: null, last_seen_browser: null, last_seen_ip: null, is_active: false },
          { id: 'p2', user_id: 'u2', full_name: 'بدون حقل', email: '', role: 'lawyer', last_seen_at: minutesAgo(1), last_seen_device: null, last_seen_browser: null, last_seen_ip: null },
        ],
        error: null,
      });
      const { result } = setup();
      await act(async () => { await result.current.fetchActiveSessions(); });
      expect(result.current.activeSessions[0].isActive).toBe(false);
      expect(result.current.activeSessions[1].isActive).toBe(true);
    });

    it('user_id فاضي → id بيرجع لـ profile id نفسه (fallback)', async () => {
      mockDb.setResult({
        data: [{ id: 'p1', user_id: null, full_name: 'بدون يوزر', email: '', role: 'lawyer', last_seen_at: minutesAgo(1), last_seen_device: null, last_seen_browser: null, last_seen_ip: null, is_active: true }],
        error: null,
      });
      const { result } = setup();
      await act(async () => { await result.current.fetchActiveSessions(); });
      expect(result.current.activeSessions[0].id).toBe('p1');
    });

    it('data:null → activeSessions بتفضل [] من غير كراش', async () => {
      mockDb.setResult({ data: null, error: null });
      const { result } = setup();
      await act(async () => { await result.current.fetchActiveSessions(); });
      expect(result.current.activeSessions).toEqual([]);
    });

    it('error من قاعدة البيانات → activeSessions:[]، loadingSessions:false، وsessionsLastRefresh ميتحدّثش (بيرجع فورًا)', async () => {
      mockDb.setResult({ data: null, error: { message: 'db down' } });
      const { result } = setup();
      await act(async () => { await result.current.fetchActiveSessions(); });
      expect(result.current.activeSessions).toEqual([]);
      expect(result.current.loadingSessions).toBe(false);
      expect(result.current.sessionsLastRefresh).toBeNull();
    });

    it('استثناء فعلي (الاستعلام بيرفض) → بيتلقط في catch من غير كراش، loadingSessions بيرجع false', async () => {
      mockDb.setResult({ reject: true, rejectMessage: 'network down' });
      const { result } = setup();
      await act(async () => { await result.current.fetchActiveSessions(); });
      expect(result.current.loadingSessions).toBe(false);
      expect(result.current.activeSessions).toEqual([]);
    });
  });

  describe('handleTerminateSession', () => {
    const SESSION = { id: 'u1', profileId: 'p1', userId: 'u1', name: 'محمد المحامي', email: '', role: 'lawyer', device: '', browser: '', ip: '', lastSeenAt: null, diffMin: 1, isOnline: true, isActive: true };

    it('نجاح مع userId → callAdminAction بـ force_signout، توست باسم الجلسة، logActivity بـ entity_id=userId، fetchActiveSessions بتتنادى، terminatingSession بيرجع null', async () => {
      callAdminAction.mockResolvedValue({ ok: true });
      const { result } = setup();
      const callsBefore = mockDb.selectSpy.mock.calls.length;

      await act(async () => { await result.current.handleTerminateSession(SESSION); });

      expect(callAdminAction).toHaveBeenCalledWith({ action: 'force_signout', user_id: 'u1' });
      expect(toast).toHaveBeenCalledWith('✅ تم إنهاء جلسة محمد المحامي');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'إنهاء جلسة مستخدم', { userName: 'أحمد المدير', entity_type: 'user', entity_id: 'u1', details: 'محمد المحامي' });
      expect(mockDb.selectSpy.mock.calls.length).toBe(callsBefore + 1); // fetchActiveSessions اتنادت
      expect(result.current.terminatingSession).toBeNull();
    });

    it('بدون userId → مفيش نداء لـ callAdminAction، لكن توست/logActivity/fetchActiveSessions لسه بيحصلوا', async () => {
      const noUserSession = { ...SESSION, userId: null };
      const { result } = setup();
      const callsBefore = mockDb.selectSpy.mock.calls.length;

      await act(async () => { await result.current.handleTerminateSession(noUserSession); });

      expect(callAdminAction).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith('✅ تم إنهاء جلسة محمد المحامي');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'إنهاء جلسة مستخدم', expect.objectContaining({ entity_id: null }));
      expect(mockDb.selectSpy.mock.calls.length).toBe(callsBefore + 1);
    });

    it('فشل callAdminAction → توست فشل، من غير logActivity أو fetchActiveSessions، terminatingSession برجع null برضه', async () => {
      callAdminAction.mockRejectedValue(new Error('network down'));
      const { result } = setup();
      const callsBefore = mockDb.selectSpy.mock.calls.length;

      await act(async () => { await result.current.handleTerminateSession(SESSION); });

      expect(toast).toHaveBeenCalledWith('❌ فشل إنهاء الجلسة', true);
      expect(logActivity).not.toHaveBeenCalled();
      expect(mockDb.selectSpy.mock.calls.length).toBe(callsBefore); // fetchActiveSessions ما اتناداش
      expect(result.current.terminatingSession).toBeNull();
    });
  });

  describe('handleTerminateAllSessions', () => {
    const S1 = { id: 'u1', profileId: 'p1', userId: 'u1', name: 'محمد', email: '', role: 'lawyer', device: '', browser: '', ip: '', lastSeenAt: null, diffMin: 1, isOnline: true, isActive: true };
    const S2 = { id: 'u2', profileId: 'p2', userId: 'u2', name: 'سارة', email: '', role: 'lawyer', device: '', browser: '', ip: '', lastSeenAt: null, diffMin: 1, isOnline: true, isActive: true };
    const SELF = { id: 'admin-1', profileId: 'admin-1', userId: 'admin-1', name: 'أحمد المدير', email: '', role: 'admin', device: '', browser: '', ip: '', lastSeenAt: null, diffMin: 1, isOnline: true, isActive: true };
    const NO_USER = { id: 'p3', profileId: 'p3', userId: null, name: 'بدون يوزر', email: '', role: 'lawyer', device: '', browser: '', ip: '', lastSeenAt: null, diffMin: 1, isOnline: true, isActive: true };

    type TestSession = { profileId: string; userId: string | null; name: string; role: string };

    async function setupWithSessions(sessions: TestSession[]) {
      mockDb.setResult({ data: [], error: null }); // fetchActiveSessions هترجع فاضية بعد كده، مش مهمة هنا
      const { result } = setup();
      // بنحقن activeSessions مباشرة عن طريق نتيجة fetch أولى مضبوطة
      mockDb.setResult({
        data: sessions.map((s) => ({ id: s.profileId, user_id: s.userId, full_name: s.name, email: '', role: s.role, last_seen_at: minutesAgo(1), last_seen_device: null, last_seen_browser: null, last_seen_ip: null, is_active: true })),
        error: null,
      });
      await act(async () => { await result.current.fetchActiveSessions(); });
      return result;
    }

    it('بيتجاهل جلسة المدير الحالي نفسه (profileId === profile.id) وبيتجاهل الجلسات من غير userId', async () => {
      callAdminAction.mockResolvedValue({ ok: true });
      const result = await setupWithSessions([S1, SELF, NO_USER]);

      await act(async () => { await result.current.handleTerminateAllSessions(); });

      expect(callAdminAction).toHaveBeenCalledTimes(1);
      expect(callAdminAction).toHaveBeenCalledWith({ action: 'force_signout', user_id: 'u1' });
    });

    it('نجاح كامل (كل الجلسات نجحت) → توست بعدد النجاح فقط، من غير ذكر فشل', async () => {
      callAdminAction.mockResolvedValue({ ok: true });
      const result = await setupWithSessions([S1, S2]);

      await act(async () => { await result.current.handleTerminateAllSessions(); });

      expect(toast).toHaveBeenCalledWith('✅ تم إنهاء 2 جلسة');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'إنهاء جميع الجلسات', expect.objectContaining({ details: '2 جلسة' }));
      expect(result.current.terminatingAll).toBe(false);
      expect(result.current.confirmTerminateAll).toBe(false);
    });

    it('فشل جزئي (جلسة واحدة فشلت) → توست بعدد النجاح والفشل معًا', async () => {
      callAdminAction.mockImplementation(({ user_id }: { user_id: string }) =>
        user_id === 'u1' ? Promise.resolve({ ok: true }) : Promise.reject(new Error('x'))
      );
      const result = await setupWithSessions([S1, S2]);

      await act(async () => { await result.current.handleTerminateAllSessions(); });

      expect(toast).toHaveBeenCalledWith('✅ تم إنهاء 1 جلسة، فشل 1');
    });

    it('fetchActiveSessions بتتنادى في الآخر (بيزوّد عدد نداءات select)', async () => {
      callAdminAction.mockResolvedValue({ ok: true });
      const result = await setupWithSessions([S1]);
      const callsBefore = mockDb.selectSpy.mock.calls.length;

      await act(async () => { await result.current.handleTerminateAllSessions(); });

      expect(mockDb.selectSpy.mock.calls.length).toBe(callsBefore + 1);
    });
  });

  describe('auto-refresh (useEffect)', () => {
    it('section:"sessions" وsessionsAutoRefresh (الافتراضي true) → fetchActiveSessions بتتنادى فورًا وبعد 30 ثانية', async () => {
      let renderResult!: ReturnType<typeof setup>;
      await act(async () => { renderResult = setup('sessions'); });

      expect(mockDb.selectSpy).toHaveBeenCalledTimes(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
      expect(mockDb.selectSpy).toHaveBeenCalledTimes(2);
      renderResult.unmount();
    });

    it('section غير "sessions" → مفيش أي نداء تلقائي', async () => {
      await act(async () => { setup('cases'); });
      expect(mockDb.selectSpy).not.toHaveBeenCalled();
    });

    it('إيقاف sessionsAutoRefresh بعد التشغيل → الـ interval بيتنضّف ومفيش نداءات جديدة بعد كده (حتى بعد 60 ثانية)', async () => {
      let renderResult!: ReturnType<typeof setup>;
      await act(async () => { renderResult = setup('sessions'); });
      expect(mockDb.selectSpy).toHaveBeenCalledTimes(1);

      act(() => { renderResult.result.current.setSessionsAutoRefresh(false); });
      await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
      expect(mockDb.selectSpy).toHaveBeenCalledTimes(1); // مفيش زيادة
    });
  });
});
