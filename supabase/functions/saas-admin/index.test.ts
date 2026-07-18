import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stubDeno, createRoutedFetch, jsonRequest, type EdgeHandler } from '../_shared/edgeTestUtils';

// ── بيئة ثابتة للتست (قيم وهمية، مش أسرار حقيقية) ──────────────
const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  SUPABASE_ANON_KEY: 'anon-key',
  SAAS_ADMIN_PASSWORD: 'correct-horse-battery-staple',
  SAAS_ADMIN_TOKEN_SECRET: 'test-jwt-secret',
};

/** حالة قابلة للتعديل من كل تست عشان تتحكم في رد fetch المزيّف */
interface FetchState {
  loginAttemptRows: Array<{ id: number }>;
  recordedAttempts: Array<{ ip_address: string; success: boolean }>;
  tenantsPostResult: unknown;
  authUsersPostOk: boolean;
  authUsersPostBody: unknown;
  profilesPostOk: boolean;
  officeSettingsPostOk: boolean;
  tenantsDeleteCalls: string[];
  queryTableRows: unknown;
}

function freshState(): FetchState {
  return {
    loginAttemptRows: [],
    recordedAttempts: [],
    tenantsPostResult: [{ id: 'tenant-new-1', name: 'مكتب تجريبي' }],
    authUsersPostOk: true,
    authUsersPostBody: { id: 'auth-user-1' },
    profilesPostOk: true,
    officeSettingsPostOk: true,
    tenantsDeleteCalls: [],
    queryTableRows: [{ id: 'tenant-1', name: 'تينانت 1' }],
  };
}

function buildFetchMock(state: FetchState) {
  return createRoutedFetch([
    // isLockedOut: GET saas_admin_login_attempts?...
    {
      match: (url, init) => url.includes('/rest/v1/saas_admin_login_attempts') && (!init?.method || init.method === 'GET'),
      respond: () => ({ status: 200, body: state.loginAttemptRows }),
    },
    // recordAttempt: POST saas_admin_login_attempts
    {
      match: (url, init) => url.includes('/rest/v1/saas_admin_login_attempts') && init?.method === 'POST',
      respond: (_url, init) => {
        state.recordedAttempts.push(JSON.parse(init!.body as string));
        return { status: 201, body: [{ id: 1 }] };
      },
    },
    // actionCreateOffice: POST tenants
    {
      match: (url, init) => url.includes('/rest/v1/tenants') && init?.method === 'POST',
      respond: () => ({ status: 201, body: state.tenantsPostResult }),
    },
    // actionCreateOffice rollback: DELETE tenants?id=eq....
    {
      match: (url, init) => url.includes('/rest/v1/tenants') && init?.method === 'DELETE',
      respond: (url) => {
        state.tenantsDeleteCalls.push(url);
        return { status: 204, body: {} };
      },
    },
    // actionCreateOffice: POST auth/v1/admin/users
    {
      match: (url, init) => url.includes('/auth/v1/admin/users') && init?.method === 'POST',
      respond: () => (state.authUsersPostOk
        ? { status: 200, body: state.authUsersPostBody }
        : { status: 400, body: { message: 'فشل إنشاء المستخدم في Auth' } }),
    },
    // actionCreateOffice: POST profiles
    {
      match: (url, init) => url.includes('/rest/v1/profiles') && init?.method === 'POST',
      respond: () => (state.profilesPostOk
        ? { status: 201, body: [{ user_id: 'auth-user-1' }] }
        : { status: 400, body: { message: 'فشل إنشاء profile' } }),
    },
    // actionCreateOffice: POST office_settings
    {
      match: (url, init) => url.includes('/rest/v1/office_settings') && init?.method === 'POST',
      respond: () => (state.officeSettingsPostOk
        ? { status: 201, body: [{ tenant_id: 'tenant-new-1' }] }
        : { status: 400, body: { message: 'فشل إنشاء office_settings' } }),
    },
    // actionQuery: أي جدول مسموح به (tenants/tenant_invoices) GET
    {
      match: (url, init) => (url.includes('/rest/v1/tenants') || url.includes('/rest/v1/tenant_invoices')) && (!init?.method || init.method === 'GET'),
      respond: () => ({ status: 200, body: state.queryTableRows }),
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
  vi.useRealTimers();
});

async function login(password: string, extraHeaders: Record<string, string> = {}) {
  const req = jsonRequest({ action: 'login', password }, extraHeaders);
  return handler(req);
}

describe('saas-admin — CORS preflight', () => {
  it('OPTIONS بيرجع رد فاضي بهيدرز CORS من غير ما يدخل منطق الأكشن', async () => {
    const req = new Request('https://edge-function.local/', { method: 'OPTIONS' });
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('saas-admin — تسجيل الدخول (actionLogin)', () => {
  it('من غير password → 400', async () => {
    const res = await login('');
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('كلمة المرور مطلوبة');
  });

  it('IP معروف (x-forwarded-for) اتعمله lockout (5 محاولات فاشلة أو أكتر) → 429 حتى لو الباسورد صح', async () => {
    state.loginAttemptRows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
    const res = await login(ENV.SAAS_ADMIN_PASSWORD, { 'x-forwarded-for': '9.9.9.9' });
    expect(res.status).toBe(429);
  });

  it('IP مجهول (من غير أي هيدر IP) → الـ lockout بيتجاهل عمدًا (سلوك موثّق في الكود نفسه)، حتى لو فيه محاولات فاشلة كتير مسجّلة', async () => {
    state.loginAttemptRows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
    const res = await login(ENV.SAAS_ADMIN_PASSWORD);
    expect(res.status).toBe(200); // مش 429 — الكود بيستثني IP='unknown' من فحص الـ lockout عمدًا
  });

  it('باسورد غلط → 401 + تسجيل محاولة فاشلة', async () => {
    const res = await login('wrong-password');
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('كلمة المرور غير صحيحة');
    expect(state.recordedAttempts).toEqual([{ ip_address: 'unknown', success: false }]);
  });

  it('باسورد صح → 200 + token + تسجيل محاولة ناجحة', async () => {
    const res = await login(ENV.SAAS_ADMIN_PASSWORD);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.token).toBe('string');
    expect(data.token.split('.')).toHaveLength(3); // JWT: header.payload.signature
    expect(state.recordedAttempts).toEqual([{ ip_address: 'unknown', success: true }]);
  });

  it('بيستخدم x-forwarded-for كـ IP لو موجود (أول قيمة في القايمة)', async () => {
    const res = await login('wrong-password', { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(res.status).toBe(401);
    expect(state.recordedAttempts).toEqual([{ ip_address: '1.2.3.4', success: false }]);
  });
});

describe('saas-admin — بوابة التحقق من التوكن للعمليات المحمية', () => {
  it('action=query من غير token → 401', async () => {
    const res = await handler(jsonRequest({ action: 'query', path: 'tenants' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة مطلوبة');
  });

  it('token مش شكله صح (مش JWT) → 401', async () => {
    const res = await handler(jsonRequest({ action: 'query', path: 'tenants', token: 'garbage-not-a-jwt' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة منتهية، سجّل الدخول من جديد');
  });

  it('token صالح ومنتهي (بعد 8 ساعات من إصداره) → 401', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T00:00:00.000Z'));
    const loginRes = await login(ENV.SAAS_ADMIN_PASSWORD);
    const { token } = await loginRes.json();

    // نتخطى 8 ساعات + ثانية (TOKEN_TTL_MS في الكود الفعلي)
    vi.setSystemTime(new Date('2026-07-16T08:00:01.000Z'));

    const res = await handler(jsonRequest({ action: 'query', path: 'tenants', token }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة منتهية، سجّل الدخول من جديد');
  });

  it('token صالح وسليم → بيكمل للأكشن المطلوب', async () => {
    const loginRes = await login(ENV.SAAS_ADMIN_PASSWORD);
    const { token } = await loginRes.json();

    const res = await handler(jsonRequest({ action: 'query', path: 'tenants', token }));
    expect(res.status).toBe(200);
  });
});

describe('saas-admin — action=query (REST proxy بـ whitelist)', () => {
  async function queryWithToken(body: Record<string, unknown>) {
    const loginRes = await login(ENV.SAAS_ADMIN_PASSWORD);
    const { token } = await loginRes.json();
    return handler(jsonRequest({ action: 'query', token, ...body }));
  }

  it('من غير path → 400', async () => {
    const res = await queryWithToken({});
    expect(res.status).toBe(400);
  });

  it('جدول برة الـ whitelist (مثلاً profiles) → 403', async () => {
    const res = await queryWithToken({ path: 'profiles?select=*' });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('غير مسموح بالوصول لـ "profiles"');
  });

  it('DELETE من غير فلتر id=eq. → 403 (منع حذف جماعي عن طريق البروكسي)', async () => {
    const res = await queryWithToken({ path: 'tenants', method: 'DELETE' });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('حذف بدون فلتر ID غير مسموح');
  });

  it('DELETE بفلتر id=eq. على جدول مسموح → بيكمل عادي', async () => {
    const res = await queryWithToken({ path: 'tenants?id=eq.tenant-1', method: 'DELETE' });
    expect(res.status).toBe(200);
  });

  it('جدول مسموح (tenants) → 200 وبيرجع البيانات زي ما هي', async () => {
    const res = await queryWithToken({ path: 'tenants?select=*' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(state.queryTableRows);
  });
});

describe('saas-admin — action=createOfficeWithAdmin', () => {
  async function createOfficeWithToken(body: Record<string, unknown>) {
    const loginRes = await login(ENV.SAAS_ADMIN_PASSWORD);
    const { token } = await loginRes.json();
    return handler(jsonRequest({ action: 'createOfficeWithAdmin', token, ...body }));
  }

  it('من غير اسم مكتب (tenant.name) → 400', async () => {
    const res = await createOfficeWithToken({ tenant: {}, adminEmail: 'a@b.com' });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('اسم المكتب مطلوب');
  });

  it('من غير adminEmail → 400', async () => {
    const res = await createOfficeWithToken({ tenant: { name: 'مكتب جديد' } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('البريد الإلكتروني للأدمن مطلوب');
  });

  it('مسار النجاح الكامل → بيرجع tenant + tempPassword، وبينشئ auth user + profile + office_settings', async () => {
    const res = await createOfficeWithToken({
      tenant: { name: 'مكتب جديد' },
      adminEmail: 'admin@newoffice.com',
      adminName: 'أدمن المكتب',
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tenant).toEqual(state.tenantsPostResult[0]);
    expect(typeof data.tempPassword).toBe('string');
    expect(data.tempPassword.length).toBeGreaterThanOrEqual(14);
    expect(state.tenantsDeleteCalls).toEqual([]); // مفيش rollback حصل
  });

  it('فشل إنشاء حساب Auth → بيعمل rollback (حذف الـ tenant) فعليًا، والرد بيرجع JSON لطيف بحالة 500', async () => {
    // ✅ الباگ اتصلح (17 يوليو 2026): case 'createOfficeWithAdmin' بقى
    // `return await actionCreateOffice(rest);` جوه try/catch — أي استثناء
    // داخلي بقى بيتلقط صح ويرجع كـ Response بحالة 500 بدل rejection خام.
    state.authUsersPostOk = false;
    const res = await createOfficeWithToken({
      tenant: { name: 'مكتب جديد' },
      adminEmail: 'admin@newoffice.com',
    });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('فشل إنشاء المستخدم في Auth');
    // الـ rollback (حذف الـ tenant) بيحصل جوه actionCreateOffice قبل
    // الـ throw مباشرة، فبيتنفذ فعليًا وبيوصل الرد اللطيف كمان
    expect(state.tenantsDeleteCalls.length).toBe(1);
    expect(state.tenantsDeleteCalls[0]).toContain('tenant-new-1');
  });
});

describe('saas-admin — action غير معروف', () => {
  it('action مش من ضمن query/createOfficeWithAdmin → 400', async () => {
    const loginRes = await login(ENV.SAAS_ADMIN_PASSWORD);
    const { token } = await loginRes.json();
    const res = await handler(jsonRequest({ action: 'deleteEverything', token }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('action غير معروف: deleteEverything');
  });
});
