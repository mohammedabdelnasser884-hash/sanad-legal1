import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stubDeno, createRoutedFetch, jsonRequest, type EdgeHandler } from '../_shared/edgeTestUtils';

// ── بيئة ثابتة للتست (قيم وهمية، مش أسرار حقيقية) ──────────────
const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  CLIENT_PORTAL_TOKEN_SECRET: 'test-portal-jwt-secret',
};

const CASE_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_CASE_ID = '22222222-2222-2222-2222-222222222222';

interface ClientRow {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  type?: string;
  tenant_id: string;
}

/** حالة قابلة للتعديل من كل تست عشان تتحكم في رد fetch المزيّف */
interface FetchState {
  lockedOutContact: boolean;
  lockedOutIp: boolean;
  recordAttemptCalls: Array<{ contact: string; ip_address: string; success: boolean }>;
  clientsFindRows: ClientRow[];
  portalPinRows: Array<{ id: string; is_active: boolean }>;
  verifyPortalPinOk: boolean;
  tenantsRows: Array<{ id: string; status: string; trial_ends_at: string | null }>;
  casesOwnershipRows: Array<{ id: string }>;
  casesListRows: unknown[];
  caseFeesRows: unknown[];
  caseSessionsRows: unknown[];
  caseDocumentsRows: unknown[];
  clientMessagesRows: unknown[];
  sendMessagePostCalls: Array<Record<string, unknown>>;
  signStorageUrlOk: boolean;
}

function freshState(): FetchState {
  return {
    lockedOutContact: false,
    lockedOutIp: false,
    recordAttemptCalls: [],
    clientsFindRows: [
      { id: 'client-1', full_name: 'أحمد محمد علي', phone: '01000000000', email: 'ahmed@example.com', type: 'فرد', tenant_id: 'tenant-a' },
    ],
    portalPinRows: [{ id: 'pin-1', is_active: true }],
    verifyPortalPinOk: true,
    tenantsRows: [{ id: 'tenant-a', status: 'active', trial_ends_at: null }],
    casesOwnershipRows: [{ id: CASE_ID }],
    casesListRows: [
      { id: CASE_ID, case_number: '123', case_number_official: 'رقم-123', case_type: 'مدني', court: null, court_name: 'محكمة الجيزة الابتدائية', status: 'active', created_at: '2026-01-01T00:00:00Z' },
    ],
    caseFeesRows: [
      { id: 'fee-1', total_fees: 10000, paid_fees: 5000, status: 'deferred', last_payment_date: '2026-01-01', notes: null },
    ],
    caseSessionsRows: [
      { id: 'sess-1', session_date: '2026-02-01', session_time: '10:00', session_floor: '2', session_hall: 'أ', description: 'مرافعة', result: null, next_action: 'تأجيل' },
    ],
    caseDocumentsRows: [
      { id: 'doc-1', file_name: 'مذكرة.pdf', file_type: 'pdf', file_url: null, storage_path: 'tenant-a/case-1/doc1.pdf', category: 'مذكرات', created_at: '2026-01-01T00:00:00Z' },
    ],
    clientMessagesRows: [
      { id: 'msg-1', content: 'مرحبا، إزيك؟', sender: 'office', sender_name: 'المكتب', created_at: '2026-01-01T00:00:00Z' },
    ],
    sendMessagePostCalls: [],
    signStorageUrlOk: true,
  };
}

function buildFetchMock(state: FetchState) {
  return createRoutedFetch([
    // recordAttempt: POST portal_pin_attempts
    {
      match: (url, init) => new URL(url).pathname === '/rest/v1/portal_pin_attempts' && init?.method === 'POST',
      respond: (_url, init) => {
        state.recordAttemptCalls.push(JSON.parse(init!.body as string));
        return { status: 201, body: [{}] };
      },
    },
    // isLockedOut byContact: GET portal_pin_attempts?contact=eq...
    {
      match: (url) => {
        const u = new URL(url);
        return u.pathname === '/rest/v1/portal_pin_attempts' && u.searchParams.has('contact');
      },
      respond: () => ({ status: 200, body: state.lockedOutContact ? [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }] : [] }),
    },
    // isLockedOut byIp: GET portal_pin_attempts?ip_address=eq...
    {
      match: (url) => {
        const u = new URL(url);
        return u.pathname === '/rest/v1/portal_pin_attempts' && u.searchParams.has('ip_address');
      },
      respond: () => ({ status: 200, body: state.lockedOutIp ? [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }] : [] }),
    },
    // clients: GET (find + verify، الاتنين بيستخدموا نفس الجدول والـ or filter)
    {
      match: (url) => new URL(url).pathname === '/rest/v1/clients',
      respond: () => ({ status: 200, body: state.clientsFindRows }),
    },
    // client_portal_pins
    {
      match: (url) => new URL(url).pathname === '/rest/v1/client_portal_pins',
      respond: () => ({ status: 200, body: state.portalPinRows }),
    },
    // rpc/verify_portal_pin
    {
      match: (url) => new URL(url).pathname === '/rest/v1/rpc/verify_portal_pin',
      respond: () => ({ status: 200, body: state.verifyPortalPinOk }),
    },
    // tenants
    {
      match: (url) => new URL(url).pathname === '/rest/v1/tenants',
      respond: () => ({ status: 200, body: state.tenantsRows }),
    },
    // cases: فحص الملكية (فيه param اسمه id بالظبط) — لازم يتفحص قبل قائمة القضايا العامة
    {
      match: (url) => {
        const u = new URL(url);
        return u.pathname === '/rest/v1/cases' && u.searchParams.has('id');
      },
      respond: () => ({ status: 200, body: state.casesOwnershipRows }),
    },
    // cases: actionGetCases (قائمة كاملة، من غير id)
    {
      match: (url) => new URL(url).pathname === '/rest/v1/cases',
      respond: () => ({ status: 200, body: state.casesListRows }),
    },
    // case_fees
    {
      match: (url) => new URL(url).pathname === '/rest/v1/case_fees',
      respond: () => ({ status: 200, body: state.caseFeesRows }),
    },
    // case_sessions
    {
      match: (url) => new URL(url).pathname === '/rest/v1/case_sessions',
      respond: () => ({ status: 200, body: state.caseSessionsRows }),
    },
    // case_documents
    {
      match: (url) => new URL(url).pathname === '/rest/v1/case_documents',
      respond: () => ({ status: 200, body: state.caseDocumentsRows }),
    },
    // client_messages: POST (sendMessage)
    {
      match: (url, init) => new URL(url).pathname === '/rest/v1/client_messages' && init?.method === 'POST',
      respond: (_url, init) => {
        state.sendMessagePostCalls.push(JSON.parse(init!.body as string));
        return { status: 201, body: [{}] };
      },
    },
    // client_messages: GET (getMessages)
    {
      match: (url) => new URL(url).pathname === '/rest/v1/client_messages',
      respond: () => ({ status: 200, body: state.clientMessagesRows }),
    },
    // storage: توقيع رابط مستند
    {
      match: (url) => new URL(url).pathname.startsWith('/storage/v1/object/sign/'),
      respond: () => (state.signStorageUrlOk
        ? { status: 200, body: { signedURL: '/object/sign/case-docs/tenant-a/case-1/doc1.pdf?token=abc' } }
        : { status: 400, body: {} }),
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

function req(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return jsonRequest(body, headers);
}

/** تدفق verify كامل وحقيقي (بدون تزييف signToken/verifyToken) يرجّع توكن صالح فعليًا */
async function getValidToken(): Promise<string> {
  const res = await handler(req({ action: 'verify', contact: '01000000000', pin: '1234' }));
  const data = await res.json();
  if (!data.token) throw new Error('فشل الحصول على توكن صالح في التست — تأكد من إعداد state قبل النداء');
  return data.token as string;
}

// ══════════════════════════════════════════════════════
//  تشغيل الموديول
// ══════════════════════════════════════════════════════
describe('client-portal-api — تشغيل الموديول', () => {
  it('من غير CLIENT_PORTAL_TOKEN_SECRET → الموديول بيرمي استثناء وقت التحميل (رفض تشغيل بدون سر)', async () => {
    vi.stubGlobal('fetch', buildFetchMock(state));
    stubDeno({ ...ENV, CLIENT_PORTAL_TOKEN_SECRET: undefined });
    vi.resetModules();
    await expect(import('./index.ts')).rejects.toThrow(/CLIENT_PORTAL_TOKEN_SECRET/);
  });
});

// ══════════════════════════════════════════════════════
//  CORS
// ══════════════════════════════════════════════════════
describe('client-portal-api — CORS preflight', () => {
  it('OPTIONS بيرجع رد فاضي بهيدرز CORS من غير ما يدخل منطق الأكشن', async () => {
    const res = await handler(new Request('https://edge-function.local/', { method: 'OPTIONS' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

// ══════════════════════════════════════════════════════
//  action=find
// ══════════════════════════════════════════════════════
describe('client-portal-api — action=find', () => {
  it('من غير contact → 400', async () => {
    const res = await handler(req({ action: 'find' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('أدخل رقم الهاتف');
  });

  it('محاولات كتير فاشلة على نفس الـ contact (مفتاح find:) → 429، من غير أي بحث في clients', async () => {
    state.lockedOutContact = true;
    const res = await handler(req({ action: 'find', contact: '01000000000' }));
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toBe('محاولات كثيرة، حاول مرة أخرى بعد بعض الوقت');
  });

  it('مفيش حساب بهذا الرقم/الإيميل → 404 + تسجيل محاولة فاشلة', async () => {
    state.clientsFindRows = [];
    const res = await handler(req({ action: 'find', contact: '01099999999' }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('لم يُعثر على حساب بهذا الرقم');
    expect(state.recordAttemptCalls).toEqual([{ contact: 'find:01099999999', ip_address: 'unknown', success: false }]);
  });

  it('حساب موجود → 200 + الاسم مقنّع جزئيًا (الاسم الأول كامل والباقي مقنّع)', async () => {
    const res = await handler(req({ action: 'find', contact: '01000000000' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.client_name).toBe('أحمد م*** ع**');
  });

  it('اسم من كلمة واحدة فقط → بيترجع من غير تقنيع (مفيش أجزاء تانية)', async () => {
    state.clientsFindRows = [{ id: 'client-1', full_name: 'سند', phone: '01000000000', email: '', tenant_id: 'tenant-a' }];
    const res = await handler(req({ action: 'find', contact: '01000000000' }));
    const data = await res.json();
    expect(data.client_name).toBe('سند');
  });
});

// ══════════════════════════════════════════════════════
//  action=verify
// ══════════════════════════════════════════════════════
describe('client-portal-api — action=verify', () => {
  it('من غير contact أو pin → 400', async () => {
    const res = await handler(req({ action: 'verify', contact: '01000000000' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('بيانات ناقصة');
  });

  it('محاولات كتير فاشلة → 429 برسالة فيها مدة القفل، من غير أي بحث في clients', async () => {
    state.lockedOutContact = true;
    const res = await handler(req({ action: 'verify', contact: '01000000000', pin: '1234' }));
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toBe('محاولات كثيرة فاشلة، حاول مرة أخرى بعد 15 دقيقة');
  });

  it('قفل بسبب الـ IP (x-forwarded-for) بدل الـ contact → برضو 429', async () => {
    state.lockedOutIp = true;
    const res = await handler(req({ action: 'verify', contact: '01000000000', pin: '1234' }, { 'x-forwarded-for': '1.2.3.4' }));
    expect(res.status).toBe(429);
  });

  it('مفيش حساب بهذا الرقم/الإيميل → 404 + تسجيل محاولة فاشلة', async () => {
    state.clientsFindRows = [];
    const res = await handler(req({ action: 'verify', contact: '01099999999', pin: '1234' }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('لم يُعثر على الحساب');
    expect(state.recordAttemptCalls).toEqual([{ contact: '01099999999', ip_address: 'unknown', success: false }]);
  });

  it('مفيش صف بوابة مفعّل للموكل (client_portal_pins فاضي) → 403 + محاولة فاشلة', async () => {
    state.portalPinRows = [];
    const res = await handler(req({ action: 'verify', contact: '01000000000', pin: '1234' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('لم يتم تفعيل بوابتك بعد، تواصل مع المكتب');
    expect(state.recordAttemptCalls).toEqual([{ contact: '01000000000', ip_address: 'unknown', success: false }]);
  });

  it('صف البوابة موجود لكن is_active=false → 403 بنفس رسالة عدم التفعيل', async () => {
    state.portalPinRows = [{ id: 'pin-1', is_active: false }];
    const res = await handler(req({ action: 'verify', contact: '01000000000', pin: '1234' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('لم يتم تفعيل بوابتك بعد، تواصل مع المكتب');
  });

  it('PIN غلط (rpc verify_portal_pin بيرجع false) → 401 + محاولة فاشلة', async () => {
    state.verifyPortalPinOk = false;
    const res = await handler(req({ action: 'verify', contact: '01000000000', pin: '0000' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('رمز الدخول غير صحيح ❌');
    expect(state.recordAttemptCalls).toEqual([{ contact: '01000000000', ip_address: 'unknown', success: false }]);
  });

  it('التينانت غير موجود أصلًا → 403 + محاولة فاشلة', async () => {
    state.tenantsRows = [];
    const res = await handler(req({ action: 'verify', contact: '01000000000', pin: '1234' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('الخدمة متوقفة مؤقتًا لهذا المكتب، تواصل مع المكتب مباشرة');
  });

  it('التينانت status=suspended → 403', async () => {
    state.tenantsRows = [{ id: 'tenant-a', status: 'suspended', trial_ends_at: null }];
    const res = await handler(req({ action: 'verify', contact: '01000000000', pin: '1234' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('الخدمة متوقفة مؤقتًا لهذا المكتب، تواصل مع المكتب مباشرة');
  });

  it('التينانت trial وانتهت مدته → 403', async () => {
    state.tenantsRows = [{ id: 'tenant-a', status: 'trial', trial_ends_at: '2020-01-01T00:00:00Z' }];
    const res = await handler(req({ action: 'verify', contact: '01000000000', pin: '1234' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('الخدمة متوقفة مؤقتًا لهذا المكتب، تواصل مع المكتب مباشرة');
  });

  it('التينانت trial لكن لسه ساري (تاريخ في المستقبل) → مسموح، بيكمل للنجاح', async () => {
    state.tenantsRows = [{ id: 'tenant-a', status: 'trial', trial_ends_at: '2099-01-01T00:00:00Z' }];
    const res = await handler(req({ action: 'verify', contact: '01000000000', pin: '1234' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.token).toBeTruthy();
  });

  it('مسار النجاح الكامل → 200 + token + client، وتسجيل محاولة ناجحة', async () => {
    const res = await handler(req({ action: 'verify', contact: '01000000000', pin: '1234' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.token).toBe('string');
    expect(data.client).toEqual(state.clientsFindRows[0]);
    expect(state.recordAttemptCalls).toEqual([{ contact: '01000000000', ip_address: 'unknown', success: true }]);
  });
});

// ══════════════════════════════════════════════════════
//  التحقق من الـ token على أكشنز البوابة
// ══════════════════════════════════════════════════════
describe('client-portal-api — التحقق من التوكن على الأكشنز المحمية', () => {
  it('من غير token → 401', async () => {
    const res = await handler(req({ action: 'getClient' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة منتهية، سجّل الدخول من جديد');
  });

  it('token مشوّه (شكل غلط تمامًا) → 401', async () => {
    const res = await handler(req({ action: 'getClient', token: 'not-a-jwt' }));
    expect(res.status).toBe(401);
  });

  it('token بتوقيع متلاعب فيه (آخر حرف اتغيّر) → 401', async () => {
    const token = await getValidToken();
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    const res = await handler(req({ action: 'getClient', token: tampered }));
    expect(res.status).toBe(401);
  });

  it('token منتهي الصلاحية (بعد 7 أيام) → 401', async () => {
    const token = await getValidToken();
    const future = Date.now() + 8 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(future);
    const res = await handler(req({ action: 'getClient', token }));
    expect(res.status).toBe(401);
  });

  it('token صالح وحديث (قبل 7 أيام) → بيكمل عادي', async () => {
    const token = await getValidToken();
    const almostExpired = Date.now() + 6 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(almostExpired);
    const res = await handler(req({ action: 'getClient', token }));
    expect(res.status).toBe(200);
  });
});

// ══════════════════════════════════════════════════════
//  الأكشنز المحمية — كل واحد بياخد claims (client_id/tenant_id) من التوكن الموقّع فعليًا
// ══════════════════════════════════════════════════════
describe('client-portal-api — action=getCases', () => {
  it('مسار النجاح → 200 + قائمة القضايا', async () => {
    const token = await getValidToken();
    const res = await handler(req({ action: 'getCases', token }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toEqual(state.casesListRows);
  });
});

describe('client-portal-api — action=getClient', () => {
  it('مسار النجاح → 200 + بيانات الموكل', async () => {
    const token = await getValidToken();
    const res = await handler(req({ action: 'getClient', token }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toEqual(state.clientsFindRows[0]);
  });

  it('مفيش صف موكل (اتحذف بعد التوثيق مثلًا) → 200 + data:null', async () => {
    const token = await getValidToken();
    state.clientsFindRows = [];
    const res = await handler(req({ action: 'getClient', token }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toBeNull();
  });
});

describe('client-portal-api — action=getCaseFees / getCaseSessions / getCaseDocuments (نفس منطق فحص الملكية)', () => {
  const actions = ['getCaseFees', 'getCaseSessions', 'getCaseDocuments'];

  for (const action of actions) {
    it(`${action} — من غير caseId → 400`, async () => {
      const token = await getValidToken();
      const res = await handler(req({ action, token }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('caseId مطلوب');
    });

    it(`${action} — caseId مش شكل UUID صحيح → 400، من غير أي استعلام فحص ملكية`, async () => {
      const token = await getValidToken();
      const res = await handler(req({ action, token, caseId: 'not-a-uuid' }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('caseId غير صالح');
    });

    it(`${action} — القضية مش تابعة للموكل (فحص الملكية بيرجع فاضي) → 403`, async () => {
      const token = await getValidToken();
      state.casesOwnershipRows = [];
      const res = await handler(req({ action, token, caseId: OTHER_CASE_ID }));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('غير مصرح');
    });
  }

  it('getCaseFees — مسار النجاح → 200 + بيانات الأتعاب', async () => {
    const token = await getValidToken();
    const res = await handler(req({ action: 'getCaseFees', token, caseId: CASE_ID }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toEqual(state.caseFeesRows);
  });

  it('getCaseSessions — مسار النجاح → 200 + بيانات الجلسات', async () => {
    const token = await getValidToken();
    const res = await handler(req({ action: 'getCaseSessions', token, caseId: CASE_ID }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toEqual(state.caseSessionsRows);
  });
});

describe('client-portal-api — action=getCaseDocuments (تخصيص إضافي: توقيع رابط التخزين)', () => {
  it('مستند بعمود storage_path → بيولّد رابط موقّع طازة ويستبدل به file_url', async () => {
    const token = await getValidToken();
    const res = await handler(req({ action: 'getCaseDocuments', token, caseId: CASE_ID }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data[0].file_url).toBe('https://project.supabase.co/storage/v1/object/sign/case-docs/tenant-a/case-1/doc1.pdf?token=abc');
  });

  it('مستند من غير storage_path → بيسيب file_url القديم زي ما هو من غير محاولة توقيع', async () => {
    const token = await getValidToken();
    state.caseDocumentsRows = [
      { id: 'doc-2', file_name: 'ملف-قديم.pdf', file_type: 'pdf', file_url: 'https://old-url.example/f.pdf', storage_path: null, category: null, created_at: '2026-01-01T00:00:00Z' },
    ];
    const res = await handler(req({ action: 'getCaseDocuments', token, caseId: CASE_ID }));
    const data = await res.json();
    expect(data.data[0].file_url).toBe('https://old-url.example/f.pdf');
  });

  it('فشل توقيع الرابط (storage بيرجع خطأ) → file_url بيرجع null، والرد لسه 200', async () => {
    const token = await getValidToken();
    state.signStorageUrlOk = false;
    const res = await handler(req({ action: 'getCaseDocuments', token, caseId: CASE_ID }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data[0].file_url).toBeNull();
  });
});

describe('client-portal-api — action=getMessages', () => {
  it('مسار النجاح → 200 + قائمة الرسائل', async () => {
    const token = await getValidToken();
    const res = await handler(req({ action: 'getMessages', token }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toEqual(state.clientMessagesRows);
  });
});

describe('client-portal-api — action=sendMessage', () => {
  it('رسالة فاضية (بعد trim) → 400، من غير أي POST', async () => {
    const token = await getValidToken();
    const res = await handler(req({ action: 'sendMessage', token, content: '   ' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('الرسالة فاضية');
    expect(state.sendMessagePostCalls).toEqual([]);
  });

  it('رسالة أطول من 2000 حرف → 400', async () => {
    const token = await getValidToken();
    const res = await handler(req({ action: 'sendMessage', token, content: 'أ'.repeat(2001) }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('الرسالة طويلة جداً');
  });

  it('مسار النجاح → ok:true، وبيتبعت client_id من claims التوكن + sender:client', async () => {
    const token = await getValidToken();
    const res = await handler(req({ action: 'sendMessage', token, content: 'محتاج تحديث عن القضية' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(state.sendMessagePostCalls).toEqual([{ client_id: 'client-1', content: 'محتاج تحديث عن القضية', sender: 'client' }]);
  });
});

// ══════════════════════════════════════════════════════
//  action غير معروف
// ══════════════════════════════════════════════════════
describe('client-portal-api — action غير معروف', () => {
  it('action مش من ضمن الأنواع المعروفة → 400 برسالة فيها اسم الأكشن', async () => {
    const token = await getValidToken();
    const res = await handler(req({ action: 'deleteEverything', token }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('action غير معروف: deleteEverything');
  });
});

// ══════════════════════════════════════════════════════
//  ✅ إصلاح باگ نمط return بدون await (كان موثّق سابقًا في saas-admin)
// ══════════════════════════════════════════════════════
describe('client-portal-api — باگ return بدون await (تم إصلاحه)', () => {
  it('فشل استعلام داخلي (مثلاً getClient) → الرد بيرجع JSON بحالة 500 (مش rejection)، ورسالة موحدة بدون تسريب الخام', async () => {
    // ✅ الباگ اتصلح (17 يوليو 2026): كل حالات الـ switch وكمان actionFind/
    // actionVerify بقوا `return await actionX(...)` جوه try/catch واحد شامل
    // كل الـ handler. أي استثناء داخلي (زي فشل rest() هنا) بقى بيتلقط صح
    // ويرجع كـ Response بحالة 500 برسالة عربية لطيفة بدل rejection خام.
    // موثّق بالتفصيل في تقرير-اختبار-edge-functions-المرحلة-2-16-7.md.
    //
    // 🆕 (خطة توحيد رسائل الأخطاء — المرحلة 6): الرسالة الخام
    // ('قاعدة البيانات مش متاحة دلوقتي') كانت قبل كده بترجع زي ما هي في
    // data.error — تسريب حقيقي، لأن client-portal.html بيعرض data.error
    // مباشرة للموكل. دلوقتي الـ catch العام بيرجّع رسالة ثابتة موحدة
    // بس، والخام يتسجل في console.error فقط.
    const token = await getValidToken();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const u = new URL(url);
      if (u.pathname === '/rest/v1/clients') {
        return new Response(JSON.stringify({ message: 'قاعدة البيانات مش متاحة دلوقتي' }), { status: 500 });
      }
      // أي طلب تاني (زي verify اللي عمل التوكن) استخدم المسار العادي
      return buildFetchMock(state)(input, init);
    }));
    const res = await handler(req({ action: 'getClient', token }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('تعذّر الدخول للبوابة حاليًا. حاول مرة أخرى بعد قليل. لو المشكلة استمرت، تواصل مع الدعم.');
    expect(data.error).not.toContain('قاعدة البيانات مش متاحة دلوقتي');
  });
});
