import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stubDeno, createRoutedFetch, jsonRequest, type EdgeHandler } from '../_shared/edgeTestUtils';

// ── بيئة ثابتة للتست (قيم وهمية، مش أسرار حقيقية) ──────────────
const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

const RPC_URL = 'https://project.supabase.co/rest/v1/rpc/get_office_tg_instant_token';

/** حالة قابلة للتعديل من كل تست عشان تتحكم في رد fetch المزيّف */
interface FetchState {
  authUserOk: boolean;
  authUserBody: unknown;
  profileStatus: number;
  profileRows: unknown[];
  profileErrorBody: unknown;
  officeSettingsStatus: number;
  officeSettingsRows: unknown[];
  officeSettingsErrorBody: unknown;
  rpcStatus: number;
  rpcTokenValue: unknown;
  tgStatus: number;
  tgBody: unknown;
  tgCalls: Array<{ url: string; body: Record<string, unknown> }>;
}

function freshState(): FetchState {
  return {
    authUserOk: true,
    authUserBody: { id: 'user-1' },
    profileStatus: 200,
    profileRows: [{ tenant_id: 'tenant-a', is_active: true }],
    profileErrorBody: { message: 'تعذر التحقق من الحساب' },
    officeSettingsStatus: 200,
    officeSettingsRows: [{ tg_instant_chat: 'chat-123' }],
    officeSettingsErrorBody: { message: 'خطأ فعلي من جلب office_settings' },
    rpcStatus: 200,
    rpcTokenValue: 'tg-token-secret',
    tgStatus: 200,
    tgBody: { ok: true, result: {} },
    tgCalls: [],
  };
}

function buildFetchMock(state: FetchState) {
  return createRoutedFetch([
    // getCaller: GET auth/v1/user
    {
      match: (url) => new URL(url).pathname === '/auth/v1/user',
      respond: () => (state.authUserOk
        ? { status: 200, body: state.authUserBody }
        : { status: 401, body: { message: 'الجلسة منتهية' } }),
    },
    // getCallerProfile: GET rest/v1/profiles (عن طريق rest())
    {
      match: (url) => new URL(url).pathname === '/rest/v1/profiles',
      respond: () => (state.profileStatus === 200
        ? { status: 200, body: state.profileRows }
        : { status: state.profileStatus, body: state.profileErrorBody }),
    },
    // getOfficeInstantTgConfig: GET rest/v1/office_settings (عن طريق rest())
    {
      match: (url) => new URL(url).pathname === '/rest/v1/office_settings',
      respond: () => (state.officeSettingsStatus === 200
        ? { status: 200, body: state.officeSettingsRows }
        : { status: state.officeSettingsStatus, body: state.officeSettingsErrorBody }),
    },
    // getOfficeInstantTgConfig: POST rest/v1/rpc/get_office_tg_instant_token (فetch خام مش rest())
    {
      match: (url, init) => url === RPC_URL && init?.method === 'POST',
      respond: () => (state.rpcStatus === 200
        ? { status: 200, body: state.rpcTokenValue }
        : { status: state.rpcStatus, body: null }),
    },
    // Telegram sendMessage
    {
      match: (url) => url.startsWith('https://api.telegram.org/bot'),
      respond: (url, init) => {
        const body = JSON.parse(init!.body as string);
        state.tgCalls.push({ url, body });
        return { status: state.tgStatus, body: state.tgBody };
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

describe('telegram-send — CORS preflight', () => {
  it('OPTIONS بيرجع رد فاضي بهيدرز CORS من غير ما يدخل منطق الطلب', async () => {
    const res = await handler(new Request('https://edge-function.local/', { method: 'OPTIONS' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('telegram-send — التحقق من هوية الطالب (نفس نمط ai-chat)', () => {
  it('auth/v1/user بيرجع غير ok (يشمل حالة عدم إرسال Authorization أصلًا) → 401', async () => {
    state.authUserOk = false;
    const res = await handler(req({ text: 'رسالة' }, {}));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة منتهية، سجّل الدخول من جديد');
  });

  it('رد auth/v1/user من غير id → 401', async () => {
    state.authUserBody = {};
    const res = await handler(req({ text: 'رسالة' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة منتهية، سجّل الدخول من جديد');
  });

  it('مفيش profile مطابق للمستخدم → 403', async () => {
    state.profileRows = [];
    const res = await handler(req({ text: 'رسالة' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('حساب غير معروف');
  });

  it('profile.is_active === false → 403', async () => {
    state.profileRows = [{ tenant_id: 'tenant-a', is_active: false }];
    const res = await handler(req({ text: 'رسالة' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('الحساب معطّل');
  });

  it('فشل جلب profiles (status غير ok) → rest() بترمي، وبيترجع 500 برسالة عامة موحّدة (مش الرسالة الخام)', async () => {
    state.profileStatus = 500;
    state.profileErrorBody = { message: 'خطأ داخلي فعلي من السيرفر' };
    const res = await handler(req({ text: 'رسالة' }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('تعذّر إرسال الإشعار عبر تيليجرام. لو المشكلة استمرت، تواصل مع الدعم.');
  });

  it('مستخدم عادي (مش أدمن) بحساب فعّال → مسموح له (مفيش تحقق role هنا أصلًا)', async () => {
    const res = await handler(req({ text: 'رسالة' }));
    expect(res.status).toBe(200);
  });
});

describe('telegram-send — التحقق من text', () => {
  it('من غير text → 400، ومفيش أي نداء لـ office_settings/RPC/تيليجرام', async () => {
    const res = await handler(req({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('نص الرسالة مطلوب');
    expect(state.tgCalls).toEqual([]);
  });

  it('text فاضي بعد trim (مسافات بس) → 400 بنفس الرسالة', async () => {
    const res = await handler(req({ text: '   ' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('نص الرسالة مطلوب');
  });
});

describe('telegram-send — getOfficeInstantTgConfig', () => {
  it('caller.tenant_id فاضي (null) → مفيش نداء office_settings/RPC، وبيرجع skipped بصمت', async () => {
    state.profileRows = [{ tenant_id: null, is_active: true }];
    const res = await handler(req({ text: 'رسالة' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true, skipped: true });
    expect(state.tgCalls).toEqual([]);
  });

  it('فشل جلب office_settings (status غير ok) → rest() بترمي → 500 برسالة عامة موحّدة (مش الرسالة الخام)', async () => {
    state.officeSettingsStatus = 500;
    state.officeSettingsErrorBody = { message: 'خطأ فعلي من جلب office_settings' };
    const res = await handler(req({ text: 'رسالة' }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('تعذّر إرسال الإشعار عبر تيليجرام. لو المشكلة استمرت، تواصل مع الدعم.');
  });

  it('office_settings من غير صف (مفيش تسجيل) → tg_instant_chat فاضي → skipped بصمت من غير نداء RPC', async () => {
    state.officeSettingsRows = [];
    const res = await handler(req({ text: 'رسالة' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true, skipped: true });
  });

  it('tg_instant_chat فاضي/null في الصف → skipped بصمت من غير نداء RPC', async () => {
    state.officeSettingsRows = [{ tg_instant_chat: null }];
    const res = await handler(req({ text: 'رسالة' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true, skipped: true });
    expect(state.tgCalls).toEqual([]);
  });

  it('RPC بترجع status غير ok → مفيش استثناء، بيرجع null → skipped بصمت', async () => {
    state.rpcStatus = 400;
    const res = await handler(req({ text: 'رسالة' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true, skipped: true });
    expect(state.tgCalls).toEqual([]);
  });

  it('RPC بترجع قيمة فاضية (مش string أو string فاضي) → skipped بصمت', async () => {
    state.rpcTokenValue = '';
    const res = await handler(req({ text: 'رسالة' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true, skipped: true });
  });

  it('RPC بترجع null → skipped بصمت', async () => {
    state.rpcTokenValue = null;
    const res = await handler(req({ text: 'رسالة' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true, skipped: true });
  });
});

describe('telegram-send — مسار النجاح ونداء تيليجرام', () => {
  it('مسار نجاح كامل → {ok: true} وبيتنادى على رابط بوت تيليجرام بالتوكن الصح', async () => {
    const res = await handler(req({ text: 'جلستك بكرة الساعة 10' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
    expect(state.tgCalls).toHaveLength(1);
    expect(state.tgCalls[0].url).toBe('https://api.telegram.org/bottg-token-secret/sendMessage');
  });

  it('الجسم المُرسَل لتيليجرام فيه chat_id الصح، النص، وparse_mode=HTML', async () => {
    await handler(req({ text: 'تذكير مهم' }));
    expect(state.tgCalls[0].body).toEqual({
      chat_id: 'chat-123',
      text: 'تذكير مهم',
      parse_mode: 'HTML',
    });
  });

  it('النص بيتقص (trim) قبل الإرسال', async () => {
    await handler(req({ text: '   رسالة بمسافات   ' }));
    expect(state.tgCalls[0].body.text).toBe('رسالة بمسافات');
  });
});

describe('telegram-send — فشل تيليجرام', () => {
  it('تيليجرام بيرجع status غير ok → 502 برسالة data.description', async () => {
    state.tgStatus = 400;
    state.tgBody = { ok: false, description: 'Bad Request: chat not found' };
    const res = await handler(req({ text: 'رسالة' }));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe('Bad Request: chat not found');
  });

  it('تيليجرام بيرجع status ok لكن data.ok=false → 502 برسالة data.description', async () => {
    state.tgStatus = 200;
    state.tgBody = { ok: false, description: 'Forbidden: bot was blocked by the user' };
    const res = await handler(req({ text: 'رسالة' }));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe('Forbidden: bot was blocked by the user');
  });

  it('فشل تيليجرام من غير description → 502 برسالة افتراضية', async () => {
    state.tgStatus = 500;
    state.tgBody = {};
    const res = await handler(req({ text: 'رسالة' }));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe('فشل إرسال رسالة تيليجرام');
  });
});
