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
  authUserOk: boolean;
  authUserBody: unknown;
  profileRows: unknown[];
  rpcOk: boolean;
  rpcErrorBody: unknown;
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
}

function freshState(): FetchState {
  return {
    authUserOk: true,
    authUserBody: { id: 'user-1' },
    profileRows: [
      { user_id: 'user-1', tenant_id: 'tenant-a', role: 'admin', is_active: true, is_super_admin: false },
    ],
    rpcOk: true,
    rpcErrorBody: { message: 'فشل تنفيذ RPC' },
    rpcCalls: [],
  };
}

function buildFetchMock(state: FetchState) {
  return createRoutedFetch([
    // getAuthorizedCaller: GET auth/v1/user
    {
      match: (url) => new URL(url).pathname === '/auth/v1/user',
      respond: () => (state.authUserOk
        ? { status: 200, body: state.authUserBody }
        : { status: 401, body: { message: 'الجلسة منتهية' } }),
    },
    // getAuthorizedCaller: GET profiles
    {
      match: (url) => new URL(url).pathname === '/rest/v1/profiles',
      respond: () => ({ status: 200, body: state.profileRows }),
    },
    // rpc: POST rpc/set_office_groq_key / set_office_tg_daily_token / set_office_tg_instant_token
    {
      match: (url, init) => new URL(url).pathname.startsWith('/rest/v1/rpc/') && init?.method === 'POST',
      respond: (url, init) => {
        const name = new URL(url).pathname.replace('/rest/v1/rpc/', '');
        const args = JSON.parse(init!.body as string);
        state.rpcCalls.push({ name, args });
        return state.rpcOk ? { status: 200, body: {} } : { status: 400, body: state.rpcErrorBody };
      },
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

function req(body: Record<string, unknown>, headers: Record<string, string> = { Authorization: 'Bearer valid-token' }) {
  return jsonRequest(body, headers);
}

describe('office-secrets — CORS preflight', () => {
  it('OPTIONS بيرجع رد فاضي بهيدرز CORS من غير ما يدخل منطق الأكشن', async () => {
    const res = await handler(new Request('https://edge-function.local/', { method: 'OPTIONS' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('office-secrets — getAuthorizedCaller', () => {
  it('من غير Authorization header → 401', async () => {
    const res = await handler(req({ action: 'saveGroqKey', groq_key: 'gk-1' }, {}));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة مطلوبة، سجّل الدخول من جديد');
  });

  it('توكن غير صالح (auth/v1/user بيرجع غير ok) → 401', async () => {
    state.authUserOk = false;
    const res = await handler(req({ action: 'saveGroqKey', groq_key: 'gk-1' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة منتهية، سجّل الدخول من جديد');
  });

  it('رد auth/v1/user من غير user.id → 401', async () => {
    state.authUserBody = {};
    const res = await handler(req({ action: 'saveGroqKey', groq_key: 'gk-1' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة منتهية، سجّل الدخول من جديد');
  });

  it('مفيش profile مطابق للمستخدم → 403', async () => {
    state.profileRows = [];
    const res = await handler(req({ action: 'saveGroqKey', groq_key: 'gk-1' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('حساب غير معروف');
  });

  it('profile.is_active === false → 403', async () => {
    state.profileRows = [{ user_id: 'user-1', tenant_id: 'tenant-a', role: 'admin', is_active: false, is_super_admin: false }];
    const res = await handler(req({ action: 'saveGroqKey', groq_key: 'gk-1' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('الحساب معطّل');
  });
});

describe('office-secrets — تحقق الصلاحية والمكتب', () => {
  it('حساب فعّال بس مش admin ولا super_admin → 403', async () => {
    state.profileRows = [{ user_id: 'user-1', tenant_id: 'tenant-a', role: 'lawyer', is_active: true, is_super_admin: false }];
    const res = await handler(req({ action: 'saveGroqKey', groq_key: 'gk-1' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('غير مسموح لك بتنفيذ هذه العملية');
  });

  it('is_super_admin === true (حتى لو role مش admin) → مسموح له يكمل', async () => {
    state.profileRows = [{ user_id: 'user-1', tenant_id: 'tenant-a', role: 'lawyer', is_active: true, is_super_admin: true }];
    const res = await handler(req({ action: 'saveGroqKey', groq_key: 'gk-1' }));
    expect(res.status).toBe(200);
  });

  it('caller.tenant_id فاضي (null) → 400', async () => {
    state.profileRows = [{ user_id: 'user-1', tenant_id: null, role: 'admin', is_active: true, is_super_admin: false }];
    const res = await handler(req({ action: 'saveGroqKey', groq_key: 'gk-1' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('تعذر تحديد المكتب الحالي');
  });
});

describe('office-secrets — action=saveGroqKey', () => {
  it('من غير groq_key (فاضي بعد trim) → 400، من غير أي نداء RPC', async () => {
    const res = await handler(req({ action: 'saveGroqKey', groq_key: '   ' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('المفتاح مطلوب');
    expect(state.rpcCalls).toEqual([]);
  });

  it('مسار النجاح → ok:true، وبينده على set_office_groq_key بـ tenant_id الطالب (مش من البودي)', async () => {
    const res = await handler(req({ action: 'saveGroqKey', groq_key: 'gk-secret-123', tenant_id: 'attacker-tenant' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(state.rpcCalls).toEqual([{ name: 'set_office_groq_key', args: { p_tenant_id: 'tenant-a', p_key: 'gk-secret-123' } }]);
  });

  it('فشل الـ RPC → 500 برسالة عامة موحّدة (مش الرسالة الخام)', async () => {
    state.rpcOk = false;
    const res = await handler(req({ action: 'saveGroqKey', groq_key: 'gk-secret-123' }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('تعذّر تنفيذ العملية المطلوبة. لو المشكلة استمرت، تواصل مع الدعم.');
  });
});

describe('office-secrets — action=saveTgDailyToken', () => {
  it('من غير tg_daily_token → 400', async () => {
    const res = await handler(req({ action: 'saveTgDailyToken' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('التوكن مطلوب');
  });

  it('مسار النجاح → ok:true، وبينده على set_office_tg_daily_token', async () => {
    const res = await handler(req({ action: 'saveTgDailyToken', tg_daily_token: 'tok-daily-1' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(state.rpcCalls).toEqual([{ name: 'set_office_tg_daily_token', args: { p_tenant_id: 'tenant-a', p_token: 'tok-daily-1' } }]);
  });
});

describe('office-secrets — action=saveTgInstantToken', () => {
  it('من غير tg_instant_token → 400', async () => {
    const res = await handler(req({ action: 'saveTgInstantToken' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('التوكن مطلوب');
  });

  it('مسار النجاح → ok:true، وبينده على set_office_tg_instant_token', async () => {
    const res = await handler(req({ action: 'saveTgInstantToken', tg_instant_token: 'tok-instant-1' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(state.rpcCalls).toEqual([{ name: 'set_office_tg_instant_token', args: { p_tenant_id: 'tenant-a', p_token: 'tok-instant-1' } }]);
  });
});

describe('office-secrets — action غير معروف', () => {
  it('action مش من ضمن الأنواع التلاتة → 400', async () => {
    const res = await handler(req({ action: 'deleteEverything' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('action غير معروف');
  });
});
