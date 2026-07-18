import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stubDeno, jsonRequest, type EdgeHandler } from '../_shared/edgeTestUtils';
import { createSupabaseMock, type SupabaseMock } from '../_shared/supabaseClientMock';

// ── mock لموديول supabase-js نفسه — بعد alias في vitest.config.ts اللي
// بيوجّه 'https://esm.sh/@supabase/supabase-js@2' (الصيغة اللي بيستخدمها
// session-alerts/index.ts فعليًا، بعكس 'npm:...' بتاعة embed-batch) لـ
// '@supabase/supabase-js' الحقيقية. لازم نعمل mock على الاسم بعد الـ
// alias مش قبله. ──────────────────────────────────────────────────
let supabaseMock: SupabaseMock;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => supabaseMock.client,
}));

// ── بيئة ثابتة للتست (قيم وهمية، مش أسرار حقيقية) ──────────────
const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  SESSION_ALERTS_CRON_SECRET: 'cron-secret-123',
};

// ⚠️ session-alerts/index.ts بترمي Error على مستوى الموديول (وقت
// الاستيراد) لو SESSION_ALERTS_CRON_SECRET مش موجودة — راجع الكود:
// `if (!CRON_SECRET) throw new Error(...)`. يعني أي تست عادي لازم
// يستورد بالبيئة الكاملة، وتست منفصل بيتأكد من سلوك الاستيراد الفاشل.

interface TgCall { token: string; chat: string; text: string; }

interface FetchState {
  tgOk: boolean;
  tgDescription: string;
  tgThrows: boolean;
  tgCalls: TgCall[];
}

function freshFetchState(): FetchState {
  return { tgOk: true, tgDescription: 'خطأ افتراضي من تيليجرام', tgThrows: false, tgCalls: [] };
}

// session-alerts (بعكس ai-chat/telegram-send) مبيستخدمش fetch خام إلا
// لإرسال رسائل تيليجرام بس (كل حاجة تانية عن طريق عميل supabase-js
// المموّك). فمحتاجين نلقط بس نداءات api.telegram.org.
function buildFetchMock(state: FetchState) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.includes('api.telegram.org/bot')) {
      throw new Error(`[test] رابط غير متوقع في التست: ${url}`);
    }
    if (state.tgThrows) throw new Error('شبكة معطوبة');
    const body = JSON.parse(init!.body as string);
    const match = url.match(/\/bot([^/]+)\/sendMessage/);
    state.tgCalls.push({ token: match ? match[1] : '', chat: body.chat_id, text: body.text });
    const respBody = state.tgOk ? { ok: true } : { ok: false, description: state.tgDescription };
    return new Response(JSON.stringify(respBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

// نفس دالة fmt الموجودة حرفيًا في index.ts — بنعيد كتابتها هنا عشان
// نحسب تواريخ الغد/بعد غد المتوقعة بنفس الطريقة بالظبط (getFullYear/
// getMonth/getDate محليين، مش UTC) على تاريخ ثابت مجمّد بـ vi.setSystemTime،
// عشان التست يبقى حتمي (deterministic) مهما كان توقيت تشغيله.
function fmt(d: Date): string {
  return d.toISOString().split('T')[0];
}
const FIXED_NOW = new Date(2026, 6, 16, 8, 0, 0); // 16 يوليو 2026، الساعة 8 صباحًا (محلي)
const TODAY_STR = fmt(FIXED_NOW);
const TMRW_STR = fmt(new Date(FIXED_NOW.getFullYear(), FIXED_NOW.getMonth(), FIXED_NOW.getDate() + 1));
const DAY2_STR = fmt(new Date(FIXED_NOW.getFullYear(), FIXED_NOW.getMonth(), FIXED_NOW.getDate() + 2));
void TODAY_STR; // مستخدم في تعليقات/قراءة فقط في بعض التستات

let handler: EdgeHandler;
let fetchState: FetchState;

async function importHandler(env: Record<string, string | undefined> = ENV) {
  const box = stubDeno(env);
  vi.resetModules();
  await import('./index.ts'); // سطر حرفي — لازم يفضل هنا (شوف تعليق stubDeno في edgeTestUtils.ts)
  if (!box.handler) throw new Error('index.ts ما نداش على Deno.serve وقت الاستيراد');
  handler = box.handler;
}

function correctReq(body: unknown = {}) {
  return jsonRequest(body, { 'x-cron-secret': ENV.SESSION_ALERTS_CRON_SECRET });
}

// helper لتسجيل قوائم فاضية لكل من case_sessions وreminders — مسار
// morning بيعمل نداء واحد بس لكل جدول (مجمّع لتاريخي الغد وبعد غد معًا
// عبر .in()), والفلترة بين اليومين بتتم في JS جوه الكود المصدري.
function queueEmptyMorning() {
  supabaseMock.queueTable('case_sessions', { data: [], error: null });
  supabaseMock.queueTable('reminders', { data: [], error: null });
}

// هامش أمان: أي تست بيتوقع أكتر من نداء logError واحد (مثلاً لو كل
// رسائل التيليجرام فشلت) محتاج ردود activity_log كفاية للعدد المتوقع،
// لأن كل عنصر في الطابور بيتاخد مرة واحدة بس (shift). بنحط هامش سخي.
function queueActivityLogOk(times = 8) {
  for (let i = 0; i < times; i++) {
    supabaseMock.queueTable('activity_log', { data: null, error: null });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  fetchState = freshFetchState();
  supabaseMock = createSupabaseMock();
  vi.stubGlobal('fetch', buildFetchMock(fetchState));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('session-alerts — التحقق من CRON_SECRET', () => {
  it('استيراد الملف من غير SESSION_ALERTS_CRON_SECRET في البيئة → بيفشل فورًا وقت الاستيراد', async () => {
    const box = stubDeno({ ...ENV, SESSION_ALERTS_CRON_SECRET: undefined });
    vi.resetModules();
    await expect(import('./index.ts')).rejects.toThrow('SESSION_ALERTS_CRON_SECRET');
    void box; // مش محتاجين handler هنا، الفشل بيحصل وقت الاستيراد نفسه
  });

  it('من غير هيدر x-cron-secret خالص → 401 "غير مصرح"', async () => {
    await importHandler();
    const req = jsonRequest({});
    const res = await handler(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'غير مصرح' });
  });

  it('هيدر x-cron-secret غلط → 401', async () => {
    await importHandler();
    const req = jsonRequest({}, { 'x-cron-secret': 'wrong-secret' });
    const res = await handler(req);
    expect(res.status).toBe(401);
  });
});

describe('session-alerts — جلب المكاتب (RPC get_all_daily_tg_configs)', () => {
  it('فشل RPC → تسجيل خطأ في activity_log وإرجاع 500 برسالة الخطأ', async () => {
    await importHandler();
    supabaseMock.queueRpc('get_all_daily_tg_configs', { data: null, error: new Error('rpc-fail') });
    queueActivityLogOk();
    const res = await handler(correctReq());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('rpc-fail');
    const logCall = supabaseMock.calls.find((c) => c.table === 'activity_log');
    const insertArg = logCall!.ops.find((o) => o.method === 'insert')!.args[0] as Record<string, unknown>;
    expect(insertArg.action).toBe('خطأ جلب بيانات المكاتب');
    expect(insertArg.details).toBe('rpc-fail');
  });

  it('مفيش أي مكتب ضابط بوت → 200 برسالة نصية ومن غير أي محاولة إرسال', async () => {
    await importHandler();
    supabaseMock.queueRpc('get_all_daily_tg_configs', { data: [], error: null });
    const res = await handler(correctReq());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('لا يوجد أي مكتب ضابط بوت التذكيرات اليومية');
    expect(fetchState.tgCalls.length).toBe(0);
  });

  it('مكتب من غير token أو chat → يتخطاه بصمت، لكن العدّاد النهائي بيحسبه', async () => {
    await importHandler();
    supabaseMock.queueRpc('get_all_daily_tg_configs', {
      data: [{ tenant_id: 't1', token: null, chat: null }],
      error: null,
    });
    const res = await handler(correctReq({ type: 'morning' }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('لـ 1 مكتب');
    expect(fetchState.tgCalls.length).toBe(0);
  });

  it('عدة مكاتب: واحد ناقص token والتاني كامل → الكامل بس بيبعت رسائل', async () => {
    await importHandler();
    supabaseMock.queueRpc('get_all_daily_tg_configs', {
      data: [
        { tenant_id: 't1', token: 'tok1', chat: 'chat1' },
        { tenant_id: 't2', token: null, chat: null },
      ],
      error: null,
    });
    queueEmptyMorning();
    const res = await handler(correctReq({ type: 'morning' }));
    expect(await res.text()).toContain('لـ 2 مكتب');
    expect(fetchState.tgCalls.length).toBe(4);
    expect(fetchState.tgCalls.every((c) => c.chat === 'chat1' && c.token === 'tok1')).toBe(true);
  });
});

describe('session-alerts — تحديد النوع (type)', () => {
  it('من غير type في الجسم → افتراضي "morning"', async () => {
    await importHandler();
    supabaseMock.queueRpc('get_all_daily_tg_configs', {
      data: [{ tenant_id: 't1', token: 'tok1', chat: 'chat1' }],
      error: null,
    });
    queueEmptyMorning();
    const res = await handler(correctReq({}));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('تم تنفيذ "morning" لـ 1 مكتب');
    expect(fetchState.tgCalls.length).toBe(4);
  });

  it('جسم الطلب مش JSON صالح → يتجاهل الخطأ ويكمل بـ type الافتراضي "morning"', async () => {
    await importHandler();
    supabaseMock.queueRpc('get_all_daily_tg_configs', {
      data: [{ tenant_id: 't1', token: 'tok1', chat: 'chat1' }],
      error: null,
    });
    queueEmptyMorning();
    const req = new Request('https://edge-function.local/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': ENV.SESSION_ALERTS_CRON_SECRET },
      body: 'not-valid-json{{{',
    });
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('تم تنفيذ "morning" لـ 1 مكتب');
  });
});

describe('session-alerts — مسار "morning"', () => {
  it('مفيش جلسات ولا مهام لبكرة/بعد بكرة → 4 رسائل حالة فارغة بالترتيب الصح', async () => {
    await importHandler();
    supabaseMock.queueRpc('get_all_daily_tg_configs', {
      data: [{ tenant_id: 't1', token: 'tok1', chat: 'chat1' }],
      error: null,
    });
    queueEmptyMorning();
    const res = await handler(correctReq({ type: 'morning' }));
    expect(res.status).toBe(200);
    expect(fetchState.tgCalls.length).toBe(4);
    expect(fetchState.tgCalls[0].text).toContain(`جلسات الغد ${TMRW_STR}`);
    expect(fetchState.tgCalls[0].text).toContain('لا توجد جلسات مقررة للغد');
    expect(fetchState.tgCalls[1].text).toContain(`جلسات بعد غد ${DAY2_STR}`);
    expect(fetchState.tgCalls[2].text).toContain(`مهام الغد ${TMRW_STR}`);
    expect(fetchState.tgCalls[3].text).toContain(`مهام بعد غد ${DAY2_STR}`);
  });

  it('جلسات ومهام فعلية + fallback من جدول cases للعنوان/المحكمة الناقصين', async () => {
    await importHandler();
    supabaseMock.queueRpc('get_all_daily_tg_configs', {
      data: [{ tenant_id: 't1', token: 'tok1', chat: 'chat1' }],
      error: null,
    });
    supabaseMock.queueTable('case_sessions', {
      data: [
        {
          session_date: TMRW_STR, description: 'مرافعة', result: null,
          title: 'قضية أ', case_number: '10/2026', court: 'محكمة الجيزة',
          plaintiff: 'س', defendant: 'ص', case_id: 'c1', tenant_id: 't1',
        },
        {
          session_date: DAY2_STR, description: null, result: null,
          title: null, case_number: null, court: null,
          plaintiff: null, defendant: null, case_id: 'c2', tenant_id: 't1',
        },
      ],
      error: null,
    });
    supabaseMock.queueTable('cases', {
      data: [{
        id: 'c2', title: 'قضية ب (fallback)', case_number_official: '20/2026',
        court_name: 'محكمة القاهرة', plaintiff: null, defendant: null,
      }],
      error: null,
    });
    supabaseMock.queueTable('reminders', {
      data: [{ title: 'مهمة الغد', notes: 'ملاحظة مهمة', due_date: TMRW_STR, done: false, tenant_id: 't1' }],
      error: null,
    });

    const res = await handler(correctReq({ type: 'morning' }));
    expect(res.status).toBe(200);

    const tmrwSessMsg = fetchState.tgCalls.find((c) => c.text.includes(`جلسات الغد ${TMRW_STR}`));
    expect(tmrwSessMsg!.text).toContain('قضية أ');
    expect(tmrwSessMsg!.text).toContain('10/2026');

    const day2SessMsg = fetchState.tgCalls.find((c) => c.text.includes(`جلسات بعد غد ${DAY2_STR}`));
    expect(day2SessMsg!.text).toContain('قضية ب (fallback)');
    expect(day2SessMsg!.text).toContain('محكمة القاهرة');

    const tmrwRemMsg = fetchState.tgCalls.find((c) => c.text.includes(`مهام الغد ${TMRW_STR}`));
    expect(tmrwRemMsg!.text).toContain('مهمة الغد');

    // تأكيد إن استعلام fallback جدول cases اتبنى صح: .in('id', ['c2'])
    const casesCall = supabaseMock.calls.find((c) => c.table === 'cases');
    const inOp = casesCall!.ops.find((o) => o.method === 'in')!;
    expect(inOp.args).toEqual(['id', ['c2']]);
  });

  it('فشل جلب جلسات الصبح (sErr) → تسجيل خطأ في activity_log ويكمل بمصفوفة فاضية', async () => {
    await importHandler();
    supabaseMock.queueRpc('get_all_daily_tg_configs', {
      data: [{ tenant_id: 't1', token: 'tok1', chat: 'chat1' }],
      error: null,
    });
    supabaseMock.queueTable('case_sessions', { data: null, error: new Error('session-fetch-fail') });
    supabaseMock.queueTable('reminders', { data: [], error: null });
    queueActivityLogOk();

    const res = await handler(correctReq({ type: 'morning' }));
    expect(res.status).toBe(200);

    const logCall = supabaseMock.calls.find((c) => c.table === 'activity_log');
    const insertArg = logCall!.ops.find((o) => o.method === 'insert')!.args[0] as Record<string, unknown>;
    expect(insertArg.action).toBe('خطأ جلب جلسات الصبح');
    expect(insertArg.details).toBe('session-fetch-fail');

    // برضو المفروض يكمل ويبعت رسائل الحالة الفارغة عادي (مصفوفة فاضية fallback)
    expect(fetchState.tgCalls.some((c) => c.text.includes('لا توجد جلسات مقررة للغد'))).toBe(true);
  });
});

describe('session-alerts — مسار "evening"', () => {
  it('مفيش جلسات/مهام غد ولا فايتة → 4 رسائل حالة سليمة بالترتيب الصح', async () => {
    await importHandler();
    supabaseMock.queueRpc('get_all_daily_tg_configs', {
      data: [{ tenant_id: 't1', token: 'tok1', chat: 'chat1' }],
      error: null,
    });
    supabaseMock.queueTable('case_sessions', { data: [], error: null }); // tmrwSessions
    supabaseMock.queueTable('reminders', { data: [], error: null }); // tmrwReminders
    supabaseMock.queueTable('case_sessions', { data: [], error: null }); // allPastSessions
    supabaseMock.queueTable('reminders', { data: [], error: null }); // overdueReminders

    const res = await handler(correctReq({ type: 'evening' }));
    expect(res.status).toBe(200);
    expect(fetchState.tgCalls.length).toBe(4);
    expect(fetchState.tgCalls[0].text).toContain('تنبيه مبكر — جلسات الغد');
    expect(fetchState.tgCalls[0].text).toContain('لا توجد جلسات مقررة للغد');
    expect(fetchState.tgCalls[1].text).toContain('تنبيه مبكر — مهام الغد');
    expect(fetchState.tgCalls[2].text).toContain('جميع الجلسات السابقة تم تسجيل نتائجها');
    expect(fetchState.tgCalls[3].text).toContain('لا توجد مهام متأخرة');
  });

  it('جلسات فائتة بدون نتيجة + fallback من جدول cases → قائمة + رسالة تذكير إضافية', async () => {
    await importHandler();
    supabaseMock.queueRpc('get_all_daily_tg_configs', {
      data: [{ tenant_id: 't1', token: 'tok1', chat: 'chat1' }],
      error: null,
    });
    supabaseMock.queueTable('case_sessions', { data: [], error: null }); // tmrwSessions
    supabaseMock.queueTable('reminders', { data: [], error: null }); // tmrwReminders
    supabaseMock.queueTable('case_sessions', {
      data: [{
        session_date: '2026-07-10', description: null, result: null,
        title: null, case_number: null, court: null,
        plaintiff: null, defendant: null, case_id: 'case-1', tenant_id: 't1',
      }],
      error: null,
    }); // allPastSessions
    supabaseMock.queueTable('cases', {
      data: [{
        id: 'case-1', title: 'قضية اختبار', case_number_official: '123/2026',
        court_name: 'محكمة الأسرة', plaintiff: 'أحمد', defendant: 'محمود',
      }],
      error: null,
    });
    supabaseMock.queueTable('reminders', { data: [], error: null }); // overdueReminders

    const res = await handler(correctReq({ type: 'evening' }));
    expect(res.status).toBe(200);

    const overdueMsg = fetchState.tgCalls.find((c) => c.text.includes('جلسات فائتة بدون نتيجة'));
    expect(overdueMsg!.text).toContain('قضية اختبار');
    expect(overdueMsg!.text).toContain('محكمة الأسرة');

    const followUp = fetchState.tgCalls.find((c) => c.text.includes('افتح التطبيق وسجّل نتيجة كل جلسة'));
    expect(followUp).toBeTruthy();
  });

  it('مهام فائتة موجودة → قائمة + رسالة تذكير إضافية', async () => {
    await importHandler();
    supabaseMock.queueRpc('get_all_daily_tg_configs', {
      data: [{ tenant_id: 't1', token: 'tok1', chat: 'chat1' }],
      error: null,
    });
    supabaseMock.queueTable('case_sessions', { data: [], error: null }); // tmrwSessions
    supabaseMock.queueTable('reminders', { data: [], error: null }); // tmrwReminders
    supabaseMock.queueTable('case_sessions', { data: [], error: null }); // allPastSessions
    supabaseMock.queueTable('reminders', {
      data: [{ title: 'مهمة متأخرة', notes: 'راجع الملف', due_date: '2026-07-01' }],
      error: null,
    }); // overdueReminders

    const res = await handler(correctReq({ type: 'evening' }));
    expect(res.status).toBe(200);

    const msg = fetchState.tgCalls.find((c) => c.text.includes('مهام فائتة لم تُنجز'));
    expect(msg!.text).toContain('مهمة متأخرة');

    const followUp = fetchState.tgCalls.find((c) => c.text.includes('أغلق المنجز أو حدّث التاريخ'));
    expect(followUp).toBeTruthy();
  });
});

describe('session-alerts — فشل إرسال تيليجرام نفسه', () => {
  it('رد تيليجرام ok:false → تسجيل خطأ في activity_log برسالة الوصف ويكمل من غير ما يفشل الطلب كله', async () => {
    await importHandler();
    fetchState.tgOk = false;
    fetchState.tgDescription = 'bot blocked by user';
    supabaseMock.queueRpc('get_all_daily_tg_configs', {
      data: [{ tenant_id: 't1', token: 'tok1', chat: 'chat1' }],
      error: null,
    });
    queueEmptyMorning();
    queueActivityLogOk();

    const res = await handler(correctReq({ type: 'morning' }));
    expect(res.status).toBe(200);

    const logCall = supabaseMock.calls.find((c) => c.table === 'activity_log');
    const insertArg = logCall!.ops.find((o) => o.method === 'insert')!.args[0] as Record<string, unknown>;
    expect(insertArg.action).toBe('فشل إرسال تيليجرام');
    expect(insertArg.details).toContain('bot blocked by user');
  });

  it('استثناء شبكة أثناء إرسال تيليجرام → تسجيل "استثناء" في activity_log ويكمل', async () => {
    await importHandler();
    fetchState.tgThrows = true;
    supabaseMock.queueRpc('get_all_daily_tg_configs', {
      data: [{ tenant_id: 't1', token: 'tok1', chat: 'chat1' }],
      error: null,
    });
    queueEmptyMorning();
    queueActivityLogOk();

    const res = await handler(correctReq({ type: 'morning' }));
    expect(res.status).toBe(200);

    const logCall = supabaseMock.calls.find((c) => c.table === 'activity_log');
    const insertArg = logCall!.ops.find((o) => o.method === 'insert')!.args[0] as Record<string, unknown>;
    expect(insertArg.action).toBe('فشل إرسال تيليجرام');
    expect(insertArg.details).toContain('استثناء');
  });
});
