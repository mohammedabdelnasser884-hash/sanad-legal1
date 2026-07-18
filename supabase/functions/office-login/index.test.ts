import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stubDeno, createRoutedFetch, jsonRequest, type EdgeHandler } from '../_shared/edgeTestUtils';

// ── بيئة ثابتة للتست (قيم وهمية، مش أسرار حقيقية) ──────────────
const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

/** حالة قابلة للتعديل من كل تست عشان تتحكم في رد fetch المزيّف */
interface FetchState {
  lockedOutByEmail: boolean;
  lockedOutByIp: boolean;
  recordedAttempts: Array<{ email: string; ip_address: string; success: boolean }>;
  authOk: boolean;
  authBody: Record<string, unknown>;
  profileRows: unknown[];
  tenantRows: unknown[];
  profilePatchCalls: Array<Record<string, unknown>>;
  revokeCalls: string[];
}

function freshState(): FetchState {
  return {
    lockedOutByEmail: false,
    lockedOutByIp: false,
    recordedAttempts: [],
    authOk: true,
    authBody: {
      access_token: 'access-tok-1',
      refresh_token: 'refresh-tok-1',
      user: { id: 'user-1', email: 'lawyer@example.com' },
    },
    profileRows: [
      { user_id: 'user-1', tenant_id: 'tenant-a', role: 'lawyer', is_active: true, is_locked: false, full_name: 'محامي تجريبي' },
    ],
    tenantRows: [
      { id: 'tenant-a', status: 'active', trial_ends_at: null, subscription_plan: 'pro' },
    ],
    profilePatchCalls: [],
    revokeCalls: [],
  };
}

function buildFetchMock(state: FetchState) {
  return createRoutedFetch([
    // recordAttempt: POST office_login_attempts
    {
      match: (url, init) => new URL(url).pathname === '/rest/v1/office_login_attempts' && init?.method === 'POST',
      respond: (_url, init) => {
        state.recordedAttempts.push(JSON.parse(init!.body as string));
        return { status: 201, body: [{}] };
      },
    },
    // isLockedOut byEmail: GET office_login_attempts?email=eq...
    {
      match: (url) => {
        const u = new URL(url);
        return u.pathname === '/rest/v1/office_login_attempts' && u.searchParams.has('email');
      },
      respond: () => ({ status: 200, body: state.lockedOutByEmail ? [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }] : [] }),
    },
    // isLockedOut byIp: GET office_login_attempts?ip_address=eq...
    {
      match: (url) => {
        const u = new URL(url);
        return u.pathname === '/rest/v1/office_login_attempts' && u.searchParams.has('ip_address');
      },
      respond: () => ({ status: 200, body: state.lockedOutByIp ? [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }] : [] }),
    },
    // actionLogin: POST auth/v1/token?grant_type=password (GoTrue)
    {
      match: (url, init) => new URL(url).pathname === '/auth/v1/token' && init?.method === 'POST',
      respond: () => (state.authOk
        ? { status: 200, body: state.authBody }
        : { status: 400, body: { error: 'invalid_grant', error_description: 'Invalid login credentials' } }),
    },
    // revokeToken: POST auth/v1/logout
    {
      match: (url, init) => new URL(url).pathname === '/auth/v1/logout' && init?.method === 'POST',
      respond: (_url, init) => {
        const authHeader = (init?.headers as Record<string, string>)?.Authorization
          ?? (init?.headers as Headers | undefined)?.get?.('Authorization');
        if (authHeader) state.revokeCalls.push(String(authHeader).replace('Bearer ', ''));
        return { status: 204, body: {} };
      },
    },
    // profiles: GET (بحث بروفايل المستخدم بعد الدخول)
    {
      match: (url, init) => new URL(url).pathname === '/rest/v1/profiles' && (!init?.method || init.method === 'GET'),
      respond: () => ({ status: 200, body: state.profileRows }),
    },
    // profiles: PATCH (تحديث last_login بعد نجاح الدخول)
    {
      match: (url, init) => new URL(url).pathname === '/rest/v1/profiles' && init?.method === 'PATCH',
      respond: (_url, init) => {
        state.profilePatchCalls.push(JSON.parse(init!.body as string));
        return { status: 200, body: [{}] };
      },
    },
    // tenants: GET (فحص حالة اشتراك المكتب)
    {
      match: (url) => new URL(url).pathname === '/rest/v1/tenants',
      respond: () => ({ status: 200, body: state.tenantRows }),
    },
  ]);
}

let handler: EdgeHandler;
let state: FetchState;

beforeEach(async () => {
  state = freshState();
  vi.stubGlobal('fetch', buildFetchMock(state));
  const box = stubDeno(ENV);
  vi.resetModules();
  await import('./index.ts'); // سطر حرفي — لازم يفضل هنا (شوف تعليق stubDeno في edgeTestUtils.ts)
  if (!box.handler) throw new Error('index.ts ما نداش على Deno.serve وقت الاستيراد');
  handler = box.handler;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function loginReq(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return jsonRequest({ action: 'login', ...body }, headers);
}

describe('office-login — CORS preflight', () => {
  it('OPTIONS بيرجع رد فاضي بهيدرز CORS من غير ما يدخل منطق الأكشن', async () => {
    const req = new Request('https://edge-function.local/', { method: 'OPTIONS' });
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('office-login — تحقق أساسي من المدخلات', () => {
  it('action غير "login" → 400 برسالة فيها اسم الأكشن', async () => {
    const res = await handler(jsonRequest({ action: 'doSomethingElse' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('action غير معروف: doSomethingElse');
  });

  it('من غير email → 400', async () => {
    const res = await handler(loginReq({ password: 'secret123' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('يرجى إدخال البريد وكلمة السر');
  });

  it('من غير password → 400', async () => {
    const res = await handler(loginReq({ email: 'lawyer@example.com' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('يرجى إدخال البريد وكلمة السر');
  });
});

describe('office-login — حماية brute-force (isLockedOut)', () => {
  it('lockout بالإيميل (5 محاولات فاشلة أو أكتر، من غير أي هيدر IP) → 429', async () => {
    state.lockedOutByEmail = true;
    const res = await handler(loginReq({ email: 'lawyer@example.com', password: 'secret123' }));
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toBe('محاولات كثيرة فاشلة، حاول مرة أخرى بعد 15 دقيقة');
    // من غير هيدر IP، الـ IP بيبقى 'unknown' — فحص الـ IP بيتجاوب بـ [] دايمًا
    // (Promise.resolve([]))، فالقفل هنا لازم يكون جاي من فحص الإيميل بس
    expect(state.recordedAttempts).toEqual([]); // lockout بيحصل قبل أي محاولة تسجيل GoTrue
  });

  it('lockout بالـ IP (5 محاولات فاشلة أو أكتر مع x-forwarded-for) → 429 حتى لو الإيميل مش مقفول', async () => {
    state.lockedOutByEmail = false;
    state.lockedOutByIp = true;
    const res = await handler(loginReq(
      { email: 'lawyer@example.com', password: 'secret123' },
      { 'x-forwarded-for': '9.9.9.9' },
    ));
    expect(res.status).toBe(429);
  });

  it('من غير lockout → بيكمل عادي (200 لو باقي البيانات صح)', async () => {
    const res = await handler(loginReq({ email: 'lawyer@example.com', password: 'secret123' }));
    expect(res.status).toBe(200);
  });
});

describe('office-login — actionLogin: فشل التحقق من GoTrue', () => {
  it('بيانات دخول غلط (GoTrue بيرجع فشل أو من غير access_token) → 401 + تسجيل محاولة فاشلة', async () => {
    state.authOk = false;
    const res = await handler(loginReq({ email: 'lawyer@example.com', password: 'wrong-pass' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('بيانات الدخول غير صحيحة. تحقق من الإيميل وكلمة السر.');
    expect(state.recordedAttempts).toEqual([{ email: 'lawyer@example.com', ip_address: 'unknown', success: false }]);
  });
});

describe('office-login — actionLogin: حالة الحساب (profile) بعد نجاح GoTrue', () => {
  it('مفيش profile مرتبط بالمستخدم → 403 + إلغاء التوكن + تسجيل محاولة فاشلة', async () => {
    state.profileRows = [];
    const res = await handler(loginReq({ email: 'lawyer@example.com', password: 'secret123' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('هذا الحساب غير مرتبط بأي مكتب على المنصة');
    expect(state.revokeCalls).toEqual(['access-tok-1']);
    expect(state.recordedAttempts).toEqual([{ email: 'lawyer@example.com', ip_address: 'unknown', success: false }]);
  });

  it('profile.is_active === false → 403 + إلغاء التوكن', async () => {
    state.profileRows = [{ user_id: 'user-1', tenant_id: 'tenant-a', role: 'lawyer', is_active: false, is_locked: false }];
    const res = await handler(loginReq({ email: 'lawyer@example.com', password: 'secret123' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('تم تعطيل هذا الحساب، تواصل مع مدير النظام');
    expect(state.revokeCalls).toEqual(['access-tok-1']);
  });

  it('profile.is_locked === true → 403 + إلغاء التوكن', async () => {
    state.profileRows = [{ user_id: 'user-1', tenant_id: 'tenant-a', role: 'lawyer', is_active: true, is_locked: true }];
    const res = await handler(loginReq({ email: 'lawyer@example.com', password: 'secret123' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('هذا الحساب مقفول حاليًا، تواصل مع مدير النظام لفتحه');
    expect(state.revokeCalls).toEqual(['access-tok-1']);
  });
});

describe('office-login — actionLogin: حالة اشتراك المكتب (tenant) بعد التأكد من الـ profile', () => {
  it('مفيش tenant مطابق (بيانات المكتب اتلفت) → 403 + إلغاء التوكن', async () => {
    state.tenantRows = [];
    const res = await handler(loginReq({ email: 'lawyer@example.com', password: 'secret123' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('تعذر التحقق من بيانات المكتب، تواصل مع الدعم الفني');
    expect(state.revokeCalls).toEqual(['access-tok-1']);
  });

  it('tenant.status === "suspended" → 403 + إلغاء التوكن', async () => {
    state.tenantRows = [{ id: 'tenant-a', status: 'suspended', trial_ends_at: null, subscription_plan: 'pro' }];
    const res = await handler(loginReq({ email: 'lawyer@example.com', password: 'secret123' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('تم إيقاف اشتراك المكتب مؤقتًا، تواصل مع الدعم الفني');
    expect(state.revokeCalls).toEqual(['access-tok-1']);
  });

  it('tenant.status === "trial" وانتهت trial_ends_at (تاريخ في الماضي) → 403 + إلغاء التوكن', async () => {
    state.tenantRows = [{ id: 'tenant-a', status: 'trial', trial_ends_at: '2020-01-01T00:00:00.000Z', subscription_plan: 'trial' }];
    const res = await handler(loginReq({ email: 'lawyer@example.com', password: 'secret123' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('انتهت الفترة التجريبية للمكتب، تواصل مع فريق سند للاشتراك');
    expect(state.revokeCalls).toEqual(['access-tok-1']);
  });

  it('tenant.status === "trial" لكن trial_ends_at في المستقبل → بيكمل عادي (200)', async () => {
    state.tenantRows = [{ id: 'tenant-a', status: 'trial', trial_ends_at: '2099-01-01T00:00:00.000Z', subscription_plan: 'trial' }];
    const res = await handler(loginReq({ email: 'lawyer@example.com', password: 'secret123' }));
    expect(res.status).toBe(200);
  });

  it('tenant.status === "trial" لكن trial_ends_at فاضي (null) → بيكمل عادي (200، مفيش فحص تاريخ ممكن)', async () => {
    state.tenantRows = [{ id: 'tenant-a', status: 'trial', trial_ends_at: null, subscription_plan: 'trial' }];
    const res = await handler(loginReq({ email: 'lawyer@example.com', password: 'secret123' }));
    expect(res.status).toBe(200);
  });
});

describe('office-login — مسار النجاح الكامل', () => {
  it('كل الشروط سليمة → 200 + access_token/refresh_token/user، وتسجيل محاولة ناجحة، وتحديث last_login', async () => {
    const res = await handler(loginReq({ email: 'lawyer@example.com', password: 'secret123' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.access_token).toBe('access-tok-1');
    expect(data.refresh_token).toBe('refresh-tok-1');
    expect(data.user).toEqual(state.authBody.user);
    expect(state.recordedAttempts).toEqual([{ email: 'lawyer@example.com', ip_address: 'unknown', success: true }]);
    expect(state.revokeCalls).toEqual([]); // مفيش إلغاء توكن في مسار النجاح
    expect(state.profilePatchCalls).toHaveLength(1);
    expect(state.profilePatchCalls[0].failed_login_attempts).toBe(0);
    expect(typeof state.profilePatchCalls[0].last_login).toBe('string');
  });

  it('بيستخدم x-forwarded-for كـ IP لو موجود (أول قيمة في القايمة) وقت تسجيل المحاولة', async () => {
    const res = await handler(loginReq(
      { email: 'lawyer@example.com', password: 'secret123' },
      { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    ));
    expect(res.status).toBe(200);
    expect(state.recordedAttempts).toEqual([{ email: 'lawyer@example.com', ip_address: '1.2.3.4', success: true }]);
  });

  it('الإيميل بيتقص (trim) قبل المعالجة', async () => {
    const res = await handler(loginReq({ email: '  lawyer@example.com  ', password: 'secret123' }));
    expect(res.status).toBe(200);
    expect(state.recordedAttempts).toEqual([{ email: 'lawyer@example.com', ip_address: 'unknown', success: true }]);
  });
});
