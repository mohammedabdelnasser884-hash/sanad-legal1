import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stubDeno, createRoutedFetch, jsonRequest, type EdgeHandler } from '../_shared/edgeTestUtils';
import { createSupabaseMock, type SupabaseMock } from '../_shared/supabaseClientMock';

// ── mock لـ supabase-js نفسه (بعد alias 'npm:@supabase/supabase-js@2' في
// vitest.config.ts). ملحوظة: process-law-extract مختلطة — بتستخدم fetch
// خام لـ getAuthorizedCaller (زي ai-chat/telegram-send) وكمان createClient
// لكل حاجة تانية (زي embed-batch/session-alerts)، فالملف ده محتاج الاتنين
// مع بعض. ──────────────────────────────────────────────────────────────
let supabaseMock: SupabaseMock;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => supabaseMock.client,
}));

// ⚠️ **تصحيح مهم (17 يوليو 2026، بعد فشل فعلي بالتشغيل — 7 تستات فشلت):**
// أول نسخة من الملف ده كانت بتستورد `__state` من `_shared/unpdfMock.ts`
// مباشرة (عن طريق alias 'npm:unpdf' بس، من غير `vi.mock`) وتعدّل عليه في
// كل تست. المشكلة: `vi.resetModules()` (اللي بننده عليه قبل كل
// `import('./index.ts')`) بيمسح كاش كل الموديولز، فـ`index.ts` كان بياخد
// نسخة **جديدة تمامًا** من `unpdfMock.ts` (بحالتها الافتراضية) منفصلة
// عن النسخة اللي التست بيعدّل عليها فوق (اتحمّلت مرة واحدة بس وقت أول
// `import` في أول الملف). النتيجة: أي تعديل من أي تست على حالة unpdf
// (نص مخصص، عطل متعمد...) **مكانش بيوصل خالص** لـ`index.ts` وقت التشغيل،
// فكل تست كان بياخد النص الافتراضي القصير ويفشل بنفس الرسالة.
//
// الحل: زي `@supabase/supabase-js` بالظبط — `vi.mock` بفاكتوري بيقرا
// متغيّر `let` خارجي وقت **النداء الفعلي** (مش وقت التحميل)، فمهما
// اتعمل `resetModules`، القراءة دايمًا من آخر قيمة اتحطت في التست الحالي.
interface UnpdfState {
  text: string | string[];
  proxyShouldThrow: boolean;
  proxyErrorMessage: string;
  extractShouldThrow: boolean;
  extractErrorMessage: string;
}
function freshUnpdfState(): UnpdfState {
  return {
    text: 'نص افتراضي للتست',
    proxyShouldThrow: false,
    proxyErrorMessage: 'unpdf: فشل تحميل الملف كـ PDF',
    extractShouldThrow: false,
    extractErrorMessage: 'unpdf: فشل استخراج النص',
  };
}
let unpdfState: UnpdfState = freshUnpdfState();
vi.mock('../_shared/unpdfMock', () => ({
  getDocumentProxy: async () => {
    if (unpdfState.proxyShouldThrow) throw new Error(unpdfState.proxyErrorMessage);
    return { __fakePdfProxy: true };
  },
  extractText: async () => {
    if (unpdfState.extractShouldThrow) throw new Error(unpdfState.extractErrorMessage);
    return { text: unpdfState.text };
  },
}));

const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

interface FetchState {
  authUserOk: boolean;
  authUserBody: unknown;
  profileStatus: number;
  profileRows: unknown[];
}

function freshState(): FetchState {
  return {
    authUserOk: true,
    authUserBody: { id: 'user-1' },
    profileStatus: 200,
    // افتراضيًا: أدمن مصرّح له بالكامل، عشان نختبر منطق كل تست من غير
    // ما نكرر إعداد صلاحيات الأدمن في كل مرة.
    profileRows: [{ role: 'admin', is_super_admin: false, is_active: true }],
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
      respond: () => (state.profileStatus === 200
        ? { status: 200, body: state.profileRows }
        : { status: state.profileStatus, body: {} }),
    },
  ]);
}

let handler: EdgeHandler;
let state: FetchState;

beforeEach(async () => {
  state = freshState();
  vi.stubGlobal('fetch', buildFetchMock(state));
  supabaseMock = createSupabaseMock();
  unpdfState = freshUnpdfState();
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

function req(body: unknown, headers: Record<string, string> = { Authorization: 'Bearer valid-token' }) {
  return jsonRequest(body, headers);
}

function fakeBlob(bytes: number[] = [1, 2, 3]) {
  return { arrayBuffer: async () => new Uint8Array(bytes).buffer };
}

/** بيبني نص فيه n "مادة" حقيقية بالصيغة اللي ARTICLE_REGEX بيتوقعها */
function buildManyArticlesText(n: number): string {
  const parts: string[] = [];
  for (let i = 1; i <= n; i++) {
    parts.push(`مادة ${i} : نص تجريبي كافي الطول لهذه المادة رقم ${i} في القانون التجريبي المستخدم في الاختبار.`);
  }
  return parts.join('\n');
}

/** يجهّز نجاح select('laws').single() — أول نداء متوقع دايمًا على جدول laws */
function queueLawFound(filePath = 'laws/test.pdf') {
  supabaseMock.queueTable('laws', { data: { id: 'law-1', file_path: filePath }, error: null });
}

describe('process-law-extract — CORS preflight', () => {
  it('OPTIONS بيرجع 200 بهيدرز CORS من غير ما يدخل منطق الطلب', async () => {
    const res = await handler(new Request('https://edge-function.local/', { method: 'OPTIONS' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('process-law-extract — التحقق من هوية الطالب وصلاحياته', () => {
  it('auth/v1/user بيرجع غير ok → 401 "غير مصرح"', async () => {
    state.authUserOk = false;
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('غير مصرح');
  });

  it('رد auth/v1/user من غير id → 401 "غير مصرح"', async () => {
    state.authUserBody = {};
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('غير مصرح');
  });

  it('فشل جلب profiles (status غير ok) → 500 "تعذر جلب الملف الشخصي"', async () => {
    state.profileStatus = 500;
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('تعذر جلب الملف الشخصي');
  });

  it('مفيش profile مطابق → 403 "حساب غير معروف"', async () => {
    state.profileRows = [];
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('حساب غير معروف');
  });

  it('profile.is_active === false → 403 "الحساب معطّل"', async () => {
    state.profileRows = [{ role: 'admin', is_super_admin: false, is_active: false }];
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('الحساب معطّل');
  });

  it('مستخدم عادي (مش أدمن ولا super admin) → 403 "غير مسموح"', async () => {
    state.profileRows = [{ role: 'lawyer', is_super_admin: false, is_active: true }];
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('غير مسموح');
  });

  it('is_super_admin === true (حتى لو role مش admin) → مسموح له يكمل للمنطق الأساسي', async () => {
    state.profileRows = [{ role: 'lawyer', is_super_admin: true, is_active: true }];
    // من غير law_id عشان نتأكد إنه عدّى فحص الصلاحيات ووصل للتحقق من الجسم
    const res = await handler(req({}));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('law_id مطلوب');
  });
});

describe('process-law-extract — التحقق من بيانات الطلب والقانون', () => {
  it('من غير law_id في الجسم → 500 "law_id مطلوب" ومن غير أي تحديث على laws', async () => {
    const res = await handler(req({}));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('law_id مطلوب');
    expect(supabaseMock.calls.some((c) => c.table === 'laws')).toBe(false);
  });

  it('القانون مش موجود (lawErr) → 500 "القانون غير موجود" + تسجيل status=failed', async () => {
    supabaseMock.queueTable('laws', { data: null, error: new Error('not-found') }); // select().single()
    supabaseMock.queueTable('laws', { data: null, error: null }); // update failed في catch
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('القانون غير موجود');
    const lawsCalls = supabaseMock.calls.filter((c) => c.table === 'laws');
    expect(lawsCalls.length).toBe(2);
    const failedUpdate = lawsCalls[1].ops.find((o) => o.method === 'update')!;
    expect((failedUpdate.args[0] as Record<string, unknown>).status).toBe('failed');
  });

  it('القانون من غير file_path → 500 "لا يوجد ملف PDF" + تسجيل status=failed', async () => {
    supabaseMock.queueTable('laws', { data: { id: 'law-1', file_path: null }, error: null });
    supabaseMock.queueTable('laws', { data: null, error: null }); // update failed
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('لا يوجد ملف PDF');
  });

  it('فشل تحميل الملف من التخزين → 500 "فشل تحميل الملف" + status: processing ثم failed', async () => {
    queueLawFound();
    supabaseMock.queueTable('laws', { data: null, error: null }); // update processing
    supabaseMock.queueStorageDownload('legal-library', { data: null, error: new Error('download-fail') });
    supabaseMock.queueTable('laws', { data: null, error: null }); // update failed (catch)
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('فشل تحميل الملف');
    const lawsCalls = supabaseMock.calls.filter((c) => c.table === 'laws');
    expect(lawsCalls[1].ops.find((o) => o.method === 'update')!.args[0]).toMatchObject({ status: 'processing' });
    expect(lawsCalls[2].ops.find((o) => o.method === 'update')!.args[0]).toMatchObject({ status: 'failed' });
  });
});

describe('process-law-extract — استخراج النص عبر unpdf', () => {
  it('فشل getDocumentProxy (ملف تالف) → 500 برسالة عامة موحّدة، مع الاحتفاظ برسالة unpdf الخام في processing_error فقط', async () => {
    queueLawFound();
    supabaseMock.queueTable('laws', { data: null, error: null }); // update processing
    supabaseMock.queueStorageDownload('legal-library', { data: fakeBlob(), error: null });
    supabaseMock.queueTable('laws', { data: null, error: null }); // update failed
    unpdfState.proxyShouldThrow = true;
    unpdfState.proxyErrorMessage = 'unpdf: فشل تحميل الملف كـ PDF';
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(500);
    // خطأ خام من مكتبة unpdf نفسها، مش throw مقصود من الكود بتاعنا —
    // يبقى مش KnownError، ولازم يتحول لرسالة عامة في الـ response.
    expect((await res.json()).error).toBe('تعذّر معالجة الملف القانوني. لو المشكلة استمرت، تواصل مع الدعم.');
    // لكن processing_error في الداتابيز (اللي بيشوفه الأدمن في لوحة
    // المكتبة القانونية) لازم يفضل فيه التفصيل الخام للتشخيص.
    const lawsCalls = supabaseMock.calls.filter((c) => c.table === 'laws');
    const failedUpdate = lawsCalls[lawsCalls.length - 1].ops.find((o) => o.method === 'update')!;
    expect((failedUpdate.args[0] as Record<string, unknown>).processing_error).toBe('unpdf: فشل تحميل الملف كـ PDF');
  });

  it('النص المستخرج قصير جدًا (<20 حرف) → 500 "تعذر استخراج نص — الملف قد يكون صور ممسوحة."', async () => {
    queueLawFound();
    supabaseMock.queueTable('laws', { data: null, error: null }); // update processing
    supabaseMock.queueStorageDownload('legal-library', { data: fakeBlob(), error: null });
    supabaseMock.queueTable('laws', { data: null, error: null }); // update failed
    unpdfState.text = 'نص قصير';
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('تعذر استخراج نص — الملف قد يكون صور ممسوحة.');
  });

  it('مفيش أي "مادة" اتلقطت في النص → 500 برسالة قصيرة للمستخدم، وعينة من النص في processing_error بس', async () => {
    queueLawFound();
    supabaseMock.queueTable('laws', { data: null, error: null }); // update processing
    supabaseMock.queueStorageDownload('legal-library', { data: fakeBlob(), error: null });
    supabaseMock.queueTable('laws', { data: null, error: null }); // update failed
    unpdfState.text = 'هذا نص طويل بما فيه الكفاية لكنه لا يحتوي على أي صيغة مواد قانونية معروفة إطلاقًا هنا.';
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(500);
    const errMsg = (await res.json()).error as string;
    // الرسالة اللي بترجع فورًا للمستخدم قصيرة ومفيهاش عينة النص (KnownError.message)
    expect(errMsg).toBe('لم يتم العثور على مواد بصيغة "مادة (رقم)" في هذا الملف.');
    // العينة الكاملة (KnownError.detail) بتتخزن في processing_error بس، للتشخيص الإداري
    const lawsCalls = supabaseMock.calls.filter((c) => c.table === 'laws');
    const failedUpdate = lawsCalls[lawsCalls.length - 1].ops.find((o) => o.method === 'update')!;
    const storedError = (failedUpdate.args[0] as Record<string, unknown>).processing_error as string;
    expect(storedError).toContain('لم يتم العثور على مواد بصيغة "مادة (رقم)"');
    expect(storedError).toContain('هذا نص طويل');
  });

  it('unpdf.extractText برجّع array من الصفحات → بيتجمّع بـ join("\\n") قبل التقسيم', async () => {
    queueLawFound();
    supabaseMock.queueTable('laws', { data: null, error: null }); // update processing
    supabaseMock.queueStorageDownload('legal-library', { data: fakeBlob(), error: null });
    supabaseMock.queueTable('laws', { data: null, error: null }); // update completed
    unpdfState.text = ['مادة 1 : نص الصفحة الأولى كافي الطول لهذا الاختبار المحدد.', 'مادة 2 : نص الصفحة الثانية كافي الطول لهذا الاختبار أيضًا.'];
    supabaseMock.queueTable('law_articles', { data: null, error: null }); // delete
    supabaseMock.queueTable('law_articles', { data: null, error: null }); // insert
    supabaseMock.queueRpc('refresh_law_articles_count', { data: null, error: null });
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(200);
    expect((await res.json()).articles_count).toBe(2);
  });
});

describe('process-law-extract — تحديث/حذف/إدراج law_articles', () => {
  it('فشل حذف المواد القديمة (delErr) → 500 برسالة عامة موحّدة (مش الرسالة الخام)', async () => {
    queueLawFound();
    supabaseMock.queueTable('laws', { data: null, error: null }); // update processing
    supabaseMock.queueStorageDownload('legal-library', { data: fakeBlob(), error: null });
    supabaseMock.queueTable('laws', { data: null, error: null }); // update failed
    unpdfState.text = 'مادة 1 : نص كافي الطول لهذه المادة الأولى في الاختبار الحالي.';
    supabaseMock.queueTable('law_articles', { data: null, error: new Error('delete-fail') }); // delete
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('تعذّر معالجة الملف القانوني. لو المشكلة استمرت، تواصل مع الدعم.');
  });

  it('فشل إدراج المواد الجديدة (insErr) → 500 برسالة عامة موحّدة (مش الرسالة الخام)', async () => {
    queueLawFound();
    supabaseMock.queueTable('laws', { data: null, error: null }); // update processing
    supabaseMock.queueStorageDownload('legal-library', { data: fakeBlob(), error: null });
    supabaseMock.queueTable('laws', { data: null, error: null }); // update failed
    unpdfState.text = 'مادة 1 : نص كافي الطول لهذه المادة الأولى في الاختبار الحالي.';
    supabaseMock.queueTable('law_articles', { data: null, error: null }); // delete
    supabaseMock.queueTable('law_articles', { data: null, error: new Error('insert-fail') }); // insert
    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('تعذّر معالجة الملف القانوني. لو المشكلة استمرت، تواصل مع الدعم.');
  });

  it('تدفق ناجح كامل: مادة واحدة → 200 + articles_count صحيح + rpc وتحديث status=completed', async () => {
    queueLawFound();
    supabaseMock.queueTable('laws', { data: null, error: null }); // update processing
    supabaseMock.queueStorageDownload('legal-library', { data: fakeBlob(), error: null });
    supabaseMock.queueTable('laws', { data: null, error: null }); // update completed
    unpdfState.text = 'مادة 1 : نص كافي الطول لهذه المادة الأولى في الاختبار الحالي.';
    supabaseMock.queueTable('law_articles', { data: null, error: null }); // delete
    supabaseMock.queueTable('law_articles', { data: null, error: null }); // insert

    let rpcArgsSeen: unknown = null;
    supabaseMock.queueRpc('refresh_law_articles_count', (args) => {
      rpcArgsSeen = args;
      return { data: null, error: null };
    });

    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, articles_count: 1 });
    expect(rpcArgsSeen).toEqual({ p_law_id: 'law-1' });

    // تأكيد إن الحذف تم بشرط law_id الصحيح
    const deleteCall = supabaseMock.calls.find((c) => c.table === 'law_articles');
    const eqOp = deleteCall!.ops.find((o) => o.method === 'eq')!;
    expect(eqOp.args).toEqual(['law_id', 'law-1']);

    // تأكيد إن التحديث الأخير على laws بحالة completed
    const lawsCalls = supabaseMock.calls.filter((c) => c.table === 'laws');
    const lastUpdate = lawsCalls[lawsCalls.length - 1].ops.find((o) => o.method === 'update')!;
    expect(lastUpdate.args[0]).toMatchObject({ status: 'completed', processing_error: null });
  });

  it('أكتر من 100 مادة → إدراج على دفعتين (100 + الباقي)', async () => {
    queueLawFound();
    supabaseMock.queueTable('laws', { data: null, error: null }); // update processing
    supabaseMock.queueStorageDownload('legal-library', { data: fakeBlob(), error: null });
    supabaseMock.queueTable('laws', { data: null, error: null }); // update completed
    unpdfState.text = buildManyArticlesText(150);
    supabaseMock.queueTable('law_articles', { data: null, error: null }); // delete
    supabaseMock.queueTable('law_articles', { data: null, error: null }); // insert chunk 1 (100)
    supabaseMock.queueTable('law_articles', { data: null, error: null }); // insert chunk 2 (50)
    supabaseMock.queueRpc('refresh_law_articles_count', { data: null, error: null });

    const res = await handler(req({ law_id: 'law-1' }));
    expect(res.status).toBe(200);
    expect((await res.json()).articles_count).toBe(150);

    const insertOps = supabaseMock.calls
      .filter((c) => c.table === 'law_articles')
      .flatMap((c) => c.ops.filter((o) => o.method === 'insert'));
    expect(insertOps.length).toBe(2);
    expect((insertOps[0].args[0] as unknown[]).length).toBe(100);
    expect((insertOps[1].args[0] as unknown[]).length).toBe(50);
  });
});

describe('process-law-extract — جسم طلب غير صالح', () => {
  it('جسم الطلب مش JSON صالح → 500 من غير أي محاولة تحديث على laws (law_id يفضل undefined)', async () => {
    const badReq = new Request('https://edge-function.local/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
      body: 'not-valid-json{{{',
    });
    const res = await handler(badReq);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(typeof json.error).toBe('string');
    expect(supabaseMock.calls.some((c) => c.table === 'laws')).toBe(false);
  });
});
