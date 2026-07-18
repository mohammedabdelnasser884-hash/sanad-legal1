import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stubDeno, createRoutedFetch, jsonRequest, type EdgeHandler } from '../_shared/edgeTestUtils';

// ── بيئة ثابتة للتست (قيم وهمية، مش أسرار حقيقية) ──────────────
const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** حالة قابلة للتعديل من كل تست عشان تتحكم في رد fetch المزيّف */
interface FetchState {
  authUserOk: boolean;
  authUserBody: unknown;
  profileStatus: number;
  profileRows: unknown[];
  profileErrorBody: unknown;
  rpcStatus: number;
  rpcKeyValue: unknown;
  groqStatus: number;
  groqBody: unknown;
  groqCalls: Array<{ body: Record<string, unknown> }>;
}

function freshState(): FetchState {
  return {
    authUserOk: true,
    authUserBody: { id: 'user-1' },
    profileStatus: 200,
    profileRows: [{ tenant_id: 'tenant-a', is_active: true }],
    profileErrorBody: { message: 'تعذر التحقق من الحساب' },
    rpcStatus: 200,
    rpcKeyValue: 'groq-key-secret',
    groqStatus: 200,
    groqBody: { choices: [{ message: { content: 'ردّ المساعد القانوني' } }] },
    groqCalls: [],
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
    // getOfficeGroqKey: POST rest/v1/rpc/get_office_groq_key
    {
      match: (url, init) => new URL(url).pathname === '/rest/v1/rpc/get_office_groq_key' && init?.method === 'POST',
      respond: () => (state.rpcStatus === 200
        ? { status: 200, body: state.rpcKeyValue }
        : { status: state.rpcStatus, body: null }),
    },
    // Groq chat completions
    {
      match: (url) => url === GROQ_URL,
      respond: (_url, init) => {
        const body = JSON.parse(init!.body as string);
        state.groqCalls.push({ body });
        return { status: state.groqStatus, body: state.groqBody };
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

describe('ai-chat — CORS preflight', () => {
  it('OPTIONS بيرجع رد فاضي بهيدرز CORS من غير ما يدخل منطق الطلب', async () => {
    const res = await handler(new Request('https://edge-function.local/', { method: 'OPTIONS' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('ai-chat — التحقق من هوية الطالب', () => {
  it('auth/v1/user بيرجع غير ok (يشمل حالة عدم إرسال Authorization أصلًا) → 401', async () => {
    state.authUserOk = false;
    const res = await handler(req({ messages: [{ role: 'user', content: 'مرحبا' }] }, {}));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة منتهية، سجّل الدخول من جديد');
  });

  it('رد auth/v1/user من غير id → 401', async () => {
    state.authUserBody = {};
    const res = await handler(req({ messages: [{ role: 'user', content: 'مرحبا' }] }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة منتهية، سجّل الدخول من جديد');
  });

  it('مفيش profile مطابق للمستخدم → 403', async () => {
    state.profileRows = [];
    const res = await handler(req({ messages: [{ role: 'user', content: 'مرحبا' }] }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('حساب غير معروف');
  });

  it('profile.is_active === false → 403', async () => {
    state.profileRows = [{ tenant_id: 'tenant-a', is_active: false }];
    const res = await handler(req({ messages: [{ role: 'user', content: 'مرحبا' }] }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('الحساب معطّل');
  });

  it('فشل جلب profiles (status غير ok) → rest() بترمي، وبيترجع 500 برسالة عامة موحّدة (مش الرسالة الخام)', async () => {
    state.profileStatus = 500;
    state.profileErrorBody = { message: 'خطأ داخلي فعلي من السيرفر' };
    const res = await handler(req({ messages: [{ role: 'user', content: 'مرحبا' }] }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('تعذّر الحصول على رد من المساعد الذكي حاليًا. لو المشكلة استمرت، تواصل مع الدعم.');
  });
});

describe('ai-chat — مفتاح Groq الخاص بالمكتب', () => {
  it('caller.tenant_id فاضي (null) → getOfficeGroqKey بترجع null من غير أي نداء RPC → 400', async () => {
    state.profileRows = [{ tenant_id: null, is_active: true }];
    const res = await handler(req({ messages: [{ role: 'user', content: 'مرحبا' }] }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('لم يتم ضبط مفتاح المساعد القانوني لهذا المكتب بعد');
  });

  it('RPC بترجع status غير ok → المفتاح null → 400 (من غير استثناء)', async () => {
    state.rpcStatus = 400;
    const res = await handler(req({ messages: [{ role: 'user', content: 'مرحبا' }] }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('لم يتم ضبط مفتاح المساعد القانوني لهذا المكتب بعد');
  });

  it('RPC بترجع قيمة مش string (مثلاً null) → 400', async () => {
    state.rpcKeyValue = null;
    const res = await handler(req({ messages: [{ role: 'user', content: 'مرحبا' }] }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('لم يتم ضبط مفتاح المساعد القانوني لهذا المكتب بعد');
  });
});

describe('ai-chat — التحقق من messages (بعد جلب المفتاح بالفعل)', () => {
  it('messages مش موجودة → 400، لكن نداء RPC بيبقى حصل فعلًا (المفتاح بيتجاب قبل التحقق من الرسائل)', async () => {
    const res = await handler(req({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('messages مطلوبة');
    // الفانكشن بينده على Groq بس لو الرسائل سليمة، فمفيش نداء Groq هنا
    expect(state.groqCalls).toEqual([]);
  });

  it('messages مصفوفة فاضية → 400', async () => {
    const res = await handler(req({ messages: [] }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('messages مطلوبة');
  });

  it('messages مش array (مثلاً نص) → 400', async () => {
    const res = await handler(req({ messages: 'مرحبا' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('messages مطلوبة');
  });
});

describe('ai-chat — مسار النجاح ونداء Groq', () => {
  it('مسار نجاح كامل → ok:true بمحتوى الرد الفعلي من Groq', async () => {
    const res = await handler(req({ messages: [{ role: 'user', content: 'ما هي مدة الاستئناف؟' }] }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true, content: 'ردّ المساعد القانوني' });
  });

  it('system_prompt بيتحط كأول رسالة، وباقي الرسائل بعده بنفس الترتيب', async () => {
    await handler(req({
      messages: [{ role: 'user', content: 'سؤال 1' }, { role: 'assistant', content: 'رد 1' }],
      system_prompt: 'إنت مساعد قانوني مصري',
    }));
    expect(state.groqCalls[0].body.messages).toEqual([
      { role: 'system', content: 'إنت مساعد قانوني مصري' },
      { role: 'user', content: 'سؤال 1' },
      { role: 'assistant', content: 'رد 1' },
    ]);
  });

  it('من غير system_prompt → بيتبعت كنص فاضي', async () => {
    await handler(req({ messages: [{ role: 'user', content: 'سؤال' }] }));
    expect(state.groqCalls[0].body.messages[0]).toEqual({ role: 'system', content: '' });
  });

  it('model مسموح بيه (ضمن ALLOWED_MODELS) → بيتبعت زي ما هو', async () => {
    await handler(req({ messages: [{ role: 'user', content: 'سؤال' }], model: 'llama-3.1-8b-instant' }));
    expect(state.groqCalls[0].body.model).toBe('llama-3.1-8b-instant');
  });

  it('model غير مسموح بيه (مش في الـ whitelist) → بيرجع للـ DEFAULT_MODEL', async () => {
    await handler(req({ messages: [{ role: 'user', content: 'سؤال' }], model: 'gpt-4-hacked' }));
    expect(state.groqCalls[0].body.model).toBe('llama-3.3-70b-versatile');
  });

  it('من غير model في الطلب → DEFAULT_MODEL', async () => {
    await handler(req({ messages: [{ role: 'user', content: 'سؤال' }] }));
    expect(state.groqCalls[0].body.model).toBe('llama-3.3-70b-versatile');
  });

  it('max_tokens بيتقفل عند MAX_TOKENS_CAP (2000) حتى لو الفرونت طلب أكتر', async () => {
    await handler(req({ messages: [{ role: 'user', content: 'سؤال' }], max_tokens: 999999 }));
    expect(state.groqCalls[0].body.max_tokens).toBe(2000);
  });

  it('من غير max_tokens → الافتراضي 1500', async () => {
    await handler(req({ messages: [{ role: 'user', content: 'سؤال' }] }));
    expect(state.groqCalls[0].body.max_tokens).toBe(1500);
  });

  it('temperature رقم مُرسَل → بيتبعت زي ما هو', async () => {
    await handler(req({ messages: [{ role: 'user', content: 'سؤال' }], temperature: 0.9 }));
    expect(state.groqCalls[0].body.temperature).toBe(0.9);
  });

  it('temperature مش رقم أو مفقود → الافتراضي 0.3', async () => {
    await handler(req({ messages: [{ role: 'user', content: 'سؤال' }], temperature: 'حار' }));
    expect(state.groqCalls[0].body.temperature).toBe(0.3);
  });

  it('رد Groq من غير choices → content فاضي بس ok:true (مفيش استثناء)', async () => {
    state.groqBody = { choices: [] };
    const res = await handler(req({ messages: [{ role: 'user', content: 'سؤال' }] }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true, content: '' });
  });
});

describe('ai-chat — فشل Groq', () => {
  it('Groq بيرجع status غير ok → 502 برسالة data.error.message', async () => {
    state.groqStatus = 429;
    state.groqBody = { error: { message: 'تجاوزت الحد المسموح' } };
    const res = await handler(req({ messages: [{ role: 'user', content: 'سؤال' }] }));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe('تجاوزت الحد المسموح');
  });

  it('Groq بيرجع ok لكن جسم فيه data.error → 502 برسالة افتراضية لو مفيش message', async () => {
    state.groqStatus = 200;
    state.groqBody = { error: {} };
    const res = await handler(req({ messages: [{ role: 'user', content: 'سؤال' }] }));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe('تعذر الاتصال بمزوّد الذكاء الاصطناعي');
  });
});
