import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stubDeno, createRoutedFetch, jsonRequest, type EdgeHandler } from '../_shared/edgeTestUtils';
import { createSupabaseMock, type SupabaseMock } from '../_shared/supabaseClientMock';

// ── mock لموديول supabase-js نفسه — بعد alias في vitest.config.ts
// اللي بيوجّه 'npm:@supabase/supabase-js@2' لـ '@supabase/supabase-js'
// (الباكدج الحقيقية الموجودة في package.json). لازم نعمل mock على
// الاسم بعد الـ alias مش قبله، عشان Vite يقدر يحل المسار الأصلي أصلًا
// وقت التحويل (transform) قبل ما يوصل لمرحلة الـ mock. ──────────────
let supabaseMock: SupabaseMock;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => supabaseMock.client,
}));

// ── بيئة ثابتة للتست (قيم وهمية، مش أسرار حقيقية) ──────────────
const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  GEMINI_API_KEY: 'gemini-key-123',
};

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${ENV.GEMINI_API_KEY}`;

interface FetchState {
  authUserOk: boolean;
  authUserBody: unknown;
  profileStatus: number;
  profileRows: unknown[];
  geminiStatus: number;
  geminiBody: unknown;
  geminiCalls: Array<{ body: Record<string, unknown> }>;
}

function freshFetchState(): FetchState {
  return {
    authUserOk: true,
    authUserBody: { id: 'user-1' },
    profileStatus: 200,
    profileRows: [
      { user_id: 'user-1', tenant_id: 'tenant-a', role: 'admin', is_active: true, is_super_admin: false },
    ],
    geminiStatus: 200,
    geminiBody: { embedding: { values: [0.1, 0.2, 0.3] } },
    geminiCalls: [],
  };
}

function buildFetchMock(state: FetchState) {
  return createRoutedFetch([
    {
      match: (url) => new URL(url).pathname === '/auth/v1/user',
      respond: () => (state.authUserOk
        ? { status: 200, body: state.authUserBody }
        : { status: 401, body: { message: 'الجلسة منتهية' } }),
    },
    {
      match: (url) => new URL(url).pathname === '/rest/v1/profiles',
      respond: () => ({ status: state.profileStatus, body: state.profileStatus === 200 ? state.profileRows : [] }),
    },
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
let fetchState: FetchState;

beforeEach(async () => {
  fetchState = freshFetchState();
  supabaseMock = createSupabaseMock();
  vi.stubGlobal('fetch', buildFetchMock(fetchState));
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

describe('embed-batch — CORS preflight', () => {
  it('OPTIONS بيرجع رد فاضي بهيدرز CORS من غير ما يدخل منطق الطلب', async () => {
    const res = await handler(new Request('https://edge-function.local/', { method: 'OPTIONS' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('embed-batch — getAuthorizedCaller (نفس نمط embed-query الحرفي)', () => {
  it('من غير Authorization header → 401', async () => {
    const res = await handler(req({ law_id: 'law-1' }, {}));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة مطلوبة، سجّل الدخول من جديد');
  });

  it('توكن غير صالح → 401', async () => {
    fetchState.authUserOk = false;
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة منتهية، سجّل الدخول من جديد');
  });

  it('مفيش profile مطابق → 403', async () => {
    fetchState.profileRows = [];
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('حساب غير معروف');
  });

  it('profile.is_active === false → 403', async () => {
    fetchState.profileRows = [{ user_id: 'user-1', tenant_id: 'tenant-a', role: 'admin', is_active: false }];
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('الحساب معطّل');
  });
});

describe('embed-batch — التحقق من الصلاحية (admin/super_admin فقط)', () => {
  it('مستخدم عادي (role: lawyer، مش super_admin) → 403 "غير مسموح لك بتنفيذ هذه العملية"', async () => {
    fetchState.profileRows = [{ user_id: 'user-1', tenant_id: 'tenant-a', role: 'lawyer', is_active: true, is_super_admin: false }];
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('غير مسموح لك بتنفيذ هذه العملية');
  });

  it('role: admin → مسموح له', async () => {
    supabaseMock.queueTable('law_articles', { count: 0 });
    supabaseMock.queueTable('law_articles', { data: [], error: null });
    supabaseMock.queueTable('laws', { data: null, error: null });
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(200);
  });

  it('is_super_admin: true (حتى لو role مش admin) → مسموح له', async () => {
    fetchState.profileRows = [{ user_id: 'user-1', tenant_id: 'tenant-a', role: 'lawyer', is_active: true, is_super_admin: true }];
    supabaseMock.queueTable('law_articles', { count: 0 });
    supabaseMock.queueTable('law_articles', { data: [], error: null });
    supabaseMock.queueTable('laws', { data: null, error: null });
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(200);
  });
});

describe('embed-batch — التحقق من law_id و batch_size', () => {
  it('من غير law_id → 500 (استثناء يتلقط في try/catch الرئيسي)', async () => {
    const res = await handler(req({}));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('law_id مطلوب');
  });

  it('batch_size متعدّى MAX_BATCH_SIZE (50) → بيتقفل عند 50 في limit() المُرسَل', async () => {
    supabaseMock.queueTable('law_articles', { count: 5 });
    supabaseMock.queueTable('law_articles', { data: [], error: null });
    supabaseMock.queueTable('laws', { data: null, error: null });
    await handler(req({ law_id: 'law-1', batch_size: 999 }));
    const secondCall = supabaseMock.calls.filter((c) => c.table === 'law_articles')[1];
    const limitOp = secondCall.ops.find((o) => o.method === 'limit');
    expect(limitOp?.args[0]).toBe(50);
  });

  it('batch_size مش موجود → الافتراضي DEFAULT_BATCH_SIZE (15)', async () => {
    supabaseMock.queueTable('law_articles', { count: 5 });
    supabaseMock.queueTable('law_articles', { data: [], error: null });
    supabaseMock.queueTable('laws', { data: null, error: null });
    await handler(req({ law_id: 'law-1' }));
    const secondCall = supabaseMock.calls.filter((c) => c.table === 'law_articles')[1];
    const limitOp = secondCall.ops.find((o) => o.method === 'limit');
    expect(limitOp?.args[0]).toBe(15);
  });

  it('batch_size سالب أو صفر → بيتجاهل ويرجع للافتراضي 15', async () => {
    supabaseMock.queueTable('law_articles', { count: 5 });
    supabaseMock.queueTable('law_articles', { data: [], error: null });
    supabaseMock.queueTable('laws', { data: null, error: null });
    await handler(req({ law_id: 'law-1', batch_size: 0 }));
    const secondCall = supabaseMock.calls.filter((c) => c.table === 'law_articles')[1];
    const limitOp = secondCall.ops.find((o) => o.method === 'limit');
    expect(limitOp?.args[0]).toBe(15);
  });
});

describe('embed-batch — فشل جلب الدفعة', () => {
  it('fetchErr من الاستعلام التاني (دفعة المواد) → 500 برسالة عامة موحّدة (مش الرسالة الخام)', async () => {
    supabaseMock.queueTable('law_articles', { count: 5 });
    supabaseMock.queueTable('law_articles', { data: null, error: new Error('خطأ فعلي في قاعدة البيانات') });
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('تعذّر معالجة الفهرسة حاليًا. لو المشكلة استمرت، تواصل مع الدعم.');
  });
});

describe('embed-batch — مفيش مواد ناقصة (اكتمل القانون)', () => {
  it('batch فاضية → laws.status يتحدّث لـ completed، ويرجع done:true', async () => {
    supabaseMock.queueTable('law_articles', { count: 42 });
    supabaseMock.queueTable('law_articles', { data: [], error: null });
    supabaseMock.queueTable('laws', { data: null, error: null });
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ done: true, remaining: 0, total: 42 });

    const lawsCall = supabaseMock.calls.find((c) => c.table === 'laws');
    expect(lawsCall?.ops[0]).toEqual({ method: 'update', args: [{ status: 'completed' }] });
    expect(lawsCall?.ops[1]).toEqual({ method: 'eq', args: ['id', 'law-1'] });
    // مفيش نداء Gemini لأن مفيش مواد نتعامل معاها
    expect(fetchState.geminiCalls).toEqual([]);
  });

  it('total تيجي null (مفيش count راجع) → بيترجع 0 بدل null', async () => {
    supabaseMock.queueTable('law_articles', { count: undefined });
    supabaseMock.queueTable('law_articles', { data: [], error: null });
    supabaseMock.queueTable('laws', { data: null, error: null });
    const res = await handler(req({ law_id: 'law-1' }));
    const data = await res.json();
    expect(data.total).toBe(0);
  });
});

describe('embed-batch — مسار معالجة المواد (embedding عبر Gemini)', () => {
  it('مسار نجاح كامل: بيولّد embedding لكل مادة وبيحدّثها، وبيرجع done صح بناءً على remaining', async () => {
    supabaseMock.queueTable('law_articles', { count: 10 });
    supabaseMock.queueTable('law_articles', {
      data: [
        { id: 'art-1', article_text: 'نص المادة الأولى' },
        { id: 'art-2', article_text: 'نص المادة الثانية' },
      ],
      error: null,
    });
    supabaseMock.queueTable('law_articles', { error: null }); // update art-1
    supabaseMock.queueTable('law_articles', { error: null }); // update art-2
    supabaseMock.queueTable('law_articles', { count: 0 }); // remaining بعد المعالجة
    supabaseMock.queueTable('laws', { data: null, error: null }); // status completed لأن isDone

    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ done: true, remaining: 0, total: 10 });
    expect(fetchState.geminiCalls).toHaveLength(2);
  });

  it('لسه فاضل مواد (remaining > 0) → done:false، ومفيش تحديث laws.status', async () => {
    supabaseMock.queueTable('law_articles', { count: 20 });
    supabaseMock.queueTable('law_articles', { data: [{ id: 'art-1', article_text: 'نص' }], error: null });
    supabaseMock.queueTable('law_articles', { error: null }); // update art-1
    supabaseMock.queueTable('law_articles', { count: 5 }); // remaining

    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ done: false, remaining: 5, total: 20 });
    // مفيش نداء تاني لجدول laws لأن isDone كانت false
    expect(supabaseMock.calls.some((c) => c.table === 'laws')).toBe(false);
  });

  it('الـ embedding المُرسَل لـ update بيتحوّل لـ JSON.stringify (صيغة pgvector)', async () => {
    supabaseMock.queueTable('law_articles', { count: 1 });
    supabaseMock.queueTable('law_articles', { data: [{ id: 'art-1', article_text: 'نص' }], error: null });
    let capturedUpdateArg: unknown;
    supabaseMock.queueTable('law_articles', (ops) => {
      capturedUpdateArg = ops.find((o) => o.method === 'update')?.args[0];
      return { error: null };
    });
    supabaseMock.queueTable('law_articles', { count: 0 });
    supabaseMock.queueTable('laws', { data: null, error: null });

    await handler(req({ law_id: 'law-1' }));
    expect(capturedUpdateArg).toEqual({ embedding: JSON.stringify([0.1, 0.2, 0.3]) });
  });

  it('فشل تحديث مادة (updErr) → بيوقف فورًا ويرجع 500 برسالة عامة موحّدة (مش الرسالة الخام)', async () => {
    supabaseMock.queueTable('law_articles', { count: 5 });
    supabaseMock.queueTable('law_articles', {
      data: [
        { id: 'art-1', article_text: 'نص أول' },
        { id: 'art-2', article_text: 'نص تاني' },
      ],
      error: null,
    });
    supabaseMock.queueTable('law_articles', { error: new Error('فشل تحديث فعلي') }); // update art-1 فاشل
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('تعذّر معالجة الفهرسة حاليًا. لو المشكلة استمرت، تواصل مع الدعم.');
    // مادة تانية ماتحاولش تتحدّث بعد الفشل، ولا نداء remaining حصل
    expect(fetchState.geminiCalls).toHaveLength(1);
  });

  it('فشل Gemini أثناء المعالجة (GEMINI_API_KEY مش مضاف) → 500 من أول مادة', async () => {
    const box = stubDeno({ ...ENV, GEMINI_API_KEY: undefined });
    supabaseMock.queueTable('law_articles', { count: 5 });
    supabaseMock.queueTable('law_articles', { data: [{ id: 'art-1', article_text: 'نص' }], error: null });
    vi.resetModules();
    await import('./index.ts');
    const noKeyHandler = box.handler!;
    const res = await noKeyHandler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(500);
    const data = await res.json();
    // GEMINI_API_KEY مش KnownError — تفصيل تقني/إعدادي، مش رسالة إدخال
    // من المستخدم، فمينفعش يتعرض زي ما هو حتى لو مكتوب يدويًا بالعربي.
    expect(data.error).toBe('تعذّر معالجة الفهرسة حاليًا. لو المشكلة استمرت، تواصل مع الدعم.');
  });
});
