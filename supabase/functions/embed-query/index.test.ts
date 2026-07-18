import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stubDeno, createRoutedFetch, jsonRequest, type EdgeHandler } from '../_shared/edgeTestUtils';

// ── بيئة ثابتة للتست (قيم وهمية، مش أسرار حقيقية) ──────────────
const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  GEMINI_API_KEY: 'gemini-key-123',
};

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${ENV.GEMINI_API_KEY}`;

/** حالة قابلة للتعديل من كل تست عشان تتحكم في رد fetch المزيّف */
interface FetchState {
  authUserOk: boolean;
  authUserBody: unknown;
  profileStatus: number;
  profileRows: unknown[];
  geminiStatus: number;
  geminiBody: unknown;
  geminiCalls: Array<{ body: Record<string, unknown> }>;
}

function freshState(): FetchState {
  return {
    authUserOk: true,
    authUserBody: { id: 'user-1' },
    profileStatus: 200,
    profileRows: [
      { user_id: 'user-1', tenant_id: 'tenant-a', role: 'lawyer', is_active: true, is_super_admin: false },
    ],
    geminiStatus: 200,
    geminiBody: { embedding: { values: [0.1, 0.2, 0.3] } },
    geminiCalls: [],
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
      respond: () => ({ status: state.profileStatus, body: state.profileStatus === 200 ? state.profileRows : [] }),
    },
    // embedText: POST Gemini embedContent
    {
      match: (url) => url === GEMINI_URL,
      respond: (_url, init) => {
        const body = JSON.parse(init!.body as string);
        state.geminiCalls.push({ body });
        return { status: state.geminiStatus, body: state.geminiBody };
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

describe('embed-query — CORS preflight', () => {
  it('OPTIONS بيرجع رد فاضي بهيدرز CORS من غير ما يدخل منطق الطلب', async () => {
    const res = await handler(new Request('https://edge-function.local/', { method: 'OPTIONS' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('embed-query — getAuthorizedCaller', () => {
  it('من غير Authorization header → 401 (الفحص بيحصل قبل أي fetch)', async () => {
    const res = await handler(req({ text: 'نص' }, {}));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة مطلوبة، سجّل الدخول من جديد');
  });

  it('توكن غير صالح (auth/v1/user بيرجع غير ok) → 401', async () => {
    state.authUserOk = false;
    const res = await handler(req({ text: 'نص' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة منتهية، سجّل الدخول من جديد');
  });

  it('رد auth/v1/user من غير user.id → 401', async () => {
    state.authUserBody = {};
    const res = await handler(req({ text: 'نص' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة منتهية، سجّل الدخول من جديد');
  });

  it('فشل جلب profiles (status غير ok) → 500', async () => {
    state.profileStatus = 500;
    const res = await handler(req({ text: 'نص' }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('تعذر التحقق من الحساب');
  });

  it('مفيش profile مطابق للمستخدم → 403', async () => {
    state.profileRows = [];
    const res = await handler(req({ text: 'نص' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('حساب غير معروف');
  });

  it('profile.is_active === false → 403', async () => {
    state.profileRows = [{ user_id: 'user-1', tenant_id: 'tenant-a', role: 'lawyer', is_active: false, is_super_admin: false }];
    const res = await handler(req({ text: 'نص' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('الحساب معطّل');
  });

  it('مستخدم عادي (role: lawyer) من غير صلاحية admin → مسموح له (مفيش تحقق role في الفانكشن ده أصلًا)', async () => {
    const res = await handler(req({ text: 'نص' }));
    expect(res.status).toBe(200);
  });
});

describe('embed-query — التحقق من text', () => {
  it('من غير text → 500 (الاستثناء بيتلقط في try/catch بتاع المنطق الرئيسي، مش validation بـ 400)', async () => {
    const res = await handler(req({}));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('text مطلوب');
    expect(state.geminiCalls).toEqual([]);
  });

  it('text فاضي بعد trim (مسافات بس) → 500 بنفس الرسالة', async () => {
    const res = await handler(req({ text: '   ' }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('text مطلوب');
  });

  it('text مش string (رقم) → 500', async () => {
    const res = await handler(req({ text: 123 }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('text مطلوب');
  });
});

describe('embed-query — مسار النجاح ونداء Gemini', () => {
  it('مسار نجاح كامل → {embedding: [...]} بنفس القيم الراجعة من Gemini', async () => {
    const res = await handler(req({ text: 'ما هي مدة التقادم؟' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ embedding: [0.1, 0.2, 0.3] });
  });

  it('النص المُرسَل لـ Gemini بيتقص عند 6000 حرف (MAX_CHARS)', async () => {
    const longText = 'أ'.repeat(7000);
    await handler(req({ text: longText }));
    const sentText = state.geminiCalls[0].body.content as { parts: Array<{ text: string }> };
    expect(sentText.parts[0].text.length).toBe(6000);
    expect(sentText.parts[0].text).toBe('أ'.repeat(6000));
  });

  it('outputDimensionality المُرسَل = 384، والموديل = text-embedding-004', async () => {
    await handler(req({ text: 'نص قصير' }));
    expect(state.geminiCalls[0].body.outputDimensionality).toBe(384);
    expect(state.geminiCalls[0].body.model).toBe('models/text-embedding-004');
  });
});

describe('embed-query — فشل Gemini', () => {
  it('GEMINI_API_KEY مش مضاف كـ Secret → 500 برسالة عامة موحّدة (مش تفاصيل تقنية داخلية)', async () => {
    const box = stubDeno({ ...ENV, GEMINI_API_KEY: undefined });
    vi.resetModules();
    await import('./index.ts');
    const noKeyHandler = box.handler!;
    const res = await noKeyHandler(req({ text: 'نص' }));
    expect(res.status).toBe(500);
    const data = await res.json();
    // GEMINI_API_KEY مش KnownError — تفصيل تقني/إعدادي، مش رسالة إدخال
    // من المستخدم، فمينفعش يتعرض زي ما هو حتى لو مكتوب يدويًا بالعربي.
    expect(data.error).toBe('تعذّر تنفيذ البحث حاليًا. لو المشكلة استمرت، تواصل مع الدعم.');
    expect(state.geminiCalls).toEqual([]);
  });

  it('Gemini بيرجع data.error → 500 برسالة عامة موحّدة (مش رسالة Gemini الخام)', async () => {
    state.geminiBody = { error: { message: 'quota exceeded' } };
    const res = await handler(req({ text: 'نص' }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('تعذّر تنفيذ البحث حاليًا. لو المشكلة استمرت، تواصل مع الدعم.');
  });

  it('رد Gemini بشكل غير متوقع (من غير embedding.values array) → 500 برسالة عامة موحّدة', async () => {
    state.geminiBody = { unexpected: 'shape' };
    const res = await handler(req({ text: 'نص' }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('تعذّر تنفيذ البحث حاليًا. لو المشكلة استمرت، تواصل مع الدعم.');
  });
});
