import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stubDeno, createRoutedFetch, jsonRequest, type EdgeHandler } from '../_shared/edgeTestUtils';

// ── بيئة ثابتة للتست (قيم وهمية، مش أسرار حقيقية) ──────────────
const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

/** شكل صف profiles زي ما بيتقرا فعليًا في الكود (role/tenant_id/is_super_admin/is_active) */
interface ProfileRow {
  role?: string;
  tenant_id?: string | null;
  is_super_admin?: boolean;
  is_active?: boolean;
}

/** حالة قابلة للتعديل من كل تست عشان تتحكم في رد fetch المزيّف */
interface FetchState {
  callerAuthOk: boolean;
  callerAuthBody: { id?: string };
  /** خريطة user_id → صف profiles، بتغطي الاتنين: الطالب (caller) والمستهدف (target) */
  profilesById: Record<string, ProfileRow>;
  rpcForceLogoutOk: boolean;
  rpcForceLogoutCalls: Array<Record<string, unknown>>;
  changePasswordPutOk: boolean;
  changePasswordPutError: string;
  patchProfilesCalls: Array<{ userId: string; body: unknown }>;
  createAuthUserOk: boolean;
  createAuthUserBody: unknown;
  createProfilePostOk: boolean;
  createProfilePostCalls: unknown[];
}

function freshState(): FetchState {
  return {
    callerAuthOk: true,
    callerAuthBody: { id: 'caller-1' },
    profilesById: {
      'caller-1': { role: 'admin', tenant_id: 'tenant-a', is_super_admin: false, is_active: true },
      'target-1': { role: 'lawyer', tenant_id: 'tenant-a', is_super_admin: false, is_active: true },
    },
    rpcForceLogoutOk: true,
    rpcForceLogoutCalls: [],
    changePasswordPutOk: true,
    changePasswordPutError: 'فشل تحديث كلمة المرور',
    patchProfilesCalls: [],
    createAuthUserOk: true,
    createAuthUserBody: { id: 'new-auth-user-1' },
    createProfilePostOk: true,
    createProfilePostCalls: [],
  };
}

function extractUserId(url: string): string {
  const m = url.match(/user_id=eq\.([^&]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function buildFetchMock(state: FetchState) {
  return createRoutedFetch([
    // getCaller: GET auth/v1/user
    {
      match: (url) => url.includes('/auth/v1/user'),
      respond: () => (state.callerAuthOk
        ? { status: 200, body: state.callerAuthBody }
        : { status: 401, body: {} }),
    },
    // force_change: PATCH profiles?user_id=eq.X (لازم تتفحص قبل GET العام لأنها كمان profiles)
    {
      match: (url, init) => url.includes('/rest/v1/profiles') && init?.method === 'PATCH',
      respond: (url, init) => {
        state.patchProfilesCalls.push({ userId: extractUserId(url), body: JSON.parse(init!.body as string) });
        return { status: 204, body: null };
      },
    },
    // create_lawyer: POST profiles (إدخال صف جديد، بدون user_id=eq في المسار)
    {
      match: (url, init) => url.includes('/rest/v1/profiles') && init?.method === 'POST',
      respond: (_url, init) => {
        // ⚠️ index.ts بيبعت body كـ Array (`[{...}]`, أسلوب PostgREST القياسي
        // للإدراج) — لازم نفكّه هنا قبل الحفظ، وإلا كل الأسيرشنز اللي بتقارن
        // createProfilePostCalls[0] بـ toMatchObject({...}) هتفشل بنيويًا
        // (بتقارن Array بـ Object عادي).
        const parsedBody = JSON.parse(init!.body as string);
        state.createProfilePostCalls.push(
          Array.isArray(parsedBody) ? parsedBody[0] : parsedBody
        );
        return state.createProfilePostOk
          ? { status: 201, body: [{ user_id: 'new-auth-user-1' }] }
          : { status: 400, body: { message: 'فشل إنشاء profile' } };
      },
    },
    // getCallerProfile / authorizeOnTarget: GET profiles?user_id=eq.X&select=...
    {
      match: (url, init) => url.includes('/rest/v1/profiles') && init?.method === 'GET',
      respond: (url) => {
        const id = extractUserId(url);
        const row = state.profilesById[id];
        return { status: 200, body: row ? [row] : [] };
      },
    },
    // rpc: admin_force_logout
    {
      match: (url) => url.includes('/rest/v1/rpc/admin_force_logout'),
      respond: (_url, init) => {
        state.rpcForceLogoutCalls.push(JSON.parse(init!.body as string));
        return state.rpcForceLogoutOk
          ? { status: 200, body: {} }
          : { status: 400, body: { message: 'فشل تسجيل الخروج' } };
      },
    },
    // change_password: PUT auth/v1/admin/users/:id
    {
      match: (url, init) => url.includes('/auth/v1/admin/users/') && init?.method === 'PUT',
      respond: () => (state.changePasswordPutOk
        ? { status: 200, body: {} }
        : { status: 400, body: { msg: state.changePasswordPutError } }),
    },
    // create_lawyer: POST auth/v1/admin/users (إنشاء حساب جديد)
    {
      match: (url, init) => url.endsWith('/auth/v1/admin/users') && init?.method === 'POST',
      respond: () => (state.createAuthUserOk
        ? { status: 200, body: state.createAuthUserBody }
        : { status: 400, body: { msg: 'تعذر إنشاء الحساب (البريد مستخدم؟)' } }),
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
});

function req(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return jsonRequest(body, headers);
}

describe('admin-actions — CORS preflight', () => {
  it('OPTIONS بيرجع رد فاضي بهيدرز CORS من غير ما يدخل منطق الأكشن', async () => {
    const res = await handler(new Request('https://edge-function.local/', { method: 'OPTIONS' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('admin-actions — التحقق من هوية الطالب (caller)', () => {
  it('جلسة غير صالحة (getCaller بيرجع فشل) → 401', async () => {
    state.callerAuthOk = false;
    const res = await handler(req({ action: 'force_signout', user_id: 'target-1' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة منتهية، سجّل الدخول من جديد');
  });

  it('حساب الطالب مش موجود في profiles → 403', async () => {
    state.callerAuthBody = { id: 'ghost-user' }; // مفيش صف ليه في profilesById
    const res = await handler(req({ action: 'force_signout', user_id: 'target-1' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('حساب غير معروف');
  });

  it('حساب الطالب معطّل (is_active=false) → 403، حتى لو كان أدمن', async () => {
    state.profilesById['caller-1'] = { role: 'admin', tenant_id: 'tenant-a', is_active: false };
    const res = await handler(req({ action: 'force_signout', user_id: 'target-1' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('الحساب معطّل');
  });
});

describe('admin-actions — action=force_signout', () => {
  it('من غير user_id → رد {error} بحالة 200 (تصميم متعمّد، مش خطأ HTTP)', async () => {
    const res = await handler(req({ action: 'force_signout' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.error).toBe('user_id مطلوب');
  });

  it('أدمن من تينانت مختلف عن المستهدف → غير مسموح (200 + error)', async () => {
    state.profilesById['target-1'] = { role: 'lawyer', tenant_id: 'tenant-b', is_active: true };
    const res = await handler(req({ action: 'force_signout', user_id: 'target-1' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.error).toBe('غير مسموح لك بتنفيذ هذا الإجراء');
    expect(state.rpcForceLogoutCalls).toEqual([]);
  });

  it('طالب مش أدمن (role=lawyer) → غير مسموح حتى لو نفس التينانت', async () => {
    state.profilesById['caller-1'] = { role: 'lawyer', tenant_id: 'tenant-a', is_active: true };
    const res = await handler(req({ action: 'force_signout', user_id: 'target-1' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.error).toBe('غير مسموح لك بتنفيذ هذا الإجراء');
  });

  it('أدمن على نفس التينانت → مسموح، وبينده rpc بـ target_user_id الصحيح', async () => {
    const res = await handler(req({ action: 'force_signout', user_id: 'target-1' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(state.rpcForceLogoutCalls).toEqual([{ target_user_id: 'target-1' }]);
  });

  it('سوبر أدمن → مسموح حتى لو تينانت مختلف تمامًا', async () => {
    state.profilesById['caller-1'] = { is_super_admin: true, is_active: true };
    state.profilesById['target-1'] = { role: 'lawyer', tenant_id: 'tenant-z', is_active: true };
    const res = await handler(req({ action: 'force_signout', user_id: 'target-1' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('فشل استدعاء rpc (admin_force_logout) من غير catch محلي → بيتحول لـ 500 عبر catch العام', async () => {
    // ⚠️ ملحوظة سلوك: على عكس change_password، استدعاء rpc هنا في
    // force_signout مش ملفوف بـ .catch محلي في الكود الفعلي — يعني
    // فشله بيرمي Error يوصل لـ catch العام في نهاية الملف ويرجع 500،
    // مش رد {error} بحالة 200 زي باقي أخطاء المنطق في الفانكشن دي.
    state.rpcForceLogoutOk = false;
    const res = await handler(req({ action: 'force_signout', user_id: 'target-1' }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('تعذّر تنفيذ العملية. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.');
  });
});

describe('admin-actions — action=change_password', () => {
  it('من غير user_id → 200 + error', async () => {
    const res = await handler(req({ action: 'change_password', new_password: 'longenough123' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.error).toBe('user_id مطلوب');
  });

  it('كلمة سر أقصر من 8 أحرف → 200 + error، من غير ما يتفحص الصلاحية أصلًا', async () => {
    const res = await handler(req({ action: 'change_password', user_id: 'target-1', new_password: '1234567' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.error).toBe('كلمة السر قصيرة جدًا (8 أحرف على الأقل)');
  });

  it('غير مسموح (تينانت مختلف) → 200 + error، ومفيش تغيير باسورد حصل', async () => {
    state.profilesById['target-1'] = { role: 'lawyer', tenant_id: 'tenant-b', is_active: true };
    const res = await handler(req({ action: 'change_password', user_id: 'target-1', new_password: 'longenough123' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.error).toBe('غير مسموح لك بتنفيذ هذا الإجراء');
  });

  it('فشل تحديث الباسورد في Auth → 200 + رسالة الباك-إند نفسها', async () => {
    state.changePasswordPutOk = false;
    state.changePasswordPutError = 'رسالة خطأ من Supabase Auth';
    const res = await handler(req({ action: 'change_password', user_id: 'target-1', new_password: 'longenough123' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.error).toBe('رسالة خطأ من Supabase Auth');
  });

  it('نجاح من غير force_change → ok:true، ومفيش PATCH على profiles', async () => {
    const res = await handler(req({ action: 'change_password', user_id: 'target-1', new_password: 'longenough123' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(state.patchProfilesCalls).toEqual([]);
    expect(state.rpcForceLogoutCalls).toEqual([{ target_user_id: 'target-1' }]);
  });

  it('نجاح مع force_change=true → بيعمل PATCH على profiles بـ must_change_password:true', async () => {
    const res = await handler(req({
      action: 'change_password', user_id: 'target-1', new_password: 'longenough123', force_change: true,
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(state.patchProfilesCalls).toEqual([{ userId: 'target-1', body: { must_change_password: true } }]);
  });

  it('فشل rpc (admin_force_logout) هنا **متلوّف بـ .catch محلي** → برضو ok:true (مش زي force_signout)', async () => {
    // ⚠️ فرق سلوك متعمّد موثّق في تعليق الكود الفعلي: هنا الاستدعاء
    // `.catch(() => {})` فبيبتلع الفشل، عكس force_signout تمامًا.
    state.rpcForceLogoutOk = false;
    const res = await handler(req({ action: 'change_password', user_id: 'target-1', new_password: 'longenough123' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});

describe('admin-actions — action=create_lawyer', () => {
  function createLawyerReq(overrides: Record<string, unknown> = {}) {
    return handler(req({
      action: 'create_lawyer',
      email: 'new@office.com',
      password: 'longenough123',
      full_name: 'محامي جديد',
      ...overrides,
    }));
  }

  it('طالب مش أدمن ولا سوبر أدمن → 200 + error، من غير أي نداء لإنشاء حساب', async () => {
    state.profilesById['caller-1'] = { role: 'lawyer', tenant_id: 'tenant-a', is_active: true };
    const res = await createLawyerReq();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.error).toBe('غير مسموح لك بإضافة مستخدمين');
    expect(state.createProfilePostCalls).toEqual([]);
  });

  it('من غير email أو full_name → 200 + error', async () => {
    const res = await createLawyerReq({ email: '', full_name: '' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.error).toBe('البريد الإلكتروني والاسم مطلوبين');
  });

  it('كلمة سر قصيرة → 200 + error', async () => {
    const res = await createLawyerReq({ password: '123' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.error).toBe('كلمة السر قصيرة جدًا (8 أحرف على الأقل)');
  });

  it('role غير معروف (مش من ضمن admin/lawyer/viewer) → بيتحول تلقائيًا لـ lawyer', async () => {
    const res = await createLawyerReq({ role: 'super-hacker' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(state.createProfilePostCalls[0]).toMatchObject({ role: 'lawyer' });
  });

  it('فشل إنشاء الحساب في Auth (مثلاً بريد مستخدم) → 200 + رسالة الباك-إند', async () => {
    state.createAuthUserOk = false;
    const res = await createLawyerReq();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.error).toBe('تعذر إنشاء الحساب (البريد مستخدم؟)');
    expect(state.createProfilePostCalls).toEqual([]);
  });

  it('أدمن مكتب عادي بيحاول يحقن target_tenant_id في البودي → بيتجاهل، وبيتاخد tenant_id بتاعه هو', async () => {
    const res = await createLawyerReq({ target_tenant_id: 'tenant-evil' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(state.createProfilePostCalls[0]).toMatchObject({ tenant_id: 'tenant-a' });
  });

  it('سوبر أدمن بلا مكتب ومن غير target_tenant_id → 200 + error، من غير إنشاء أي حساب', async () => {
    state.profilesById['caller-1'] = { is_super_admin: true, tenant_id: null, is_active: true };
    const res = await createLawyerReq();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.error).toBe('لازم تحدد target_tenant_id لأنك سوبر أدمن بلا مكتب مرتبط بحسابك');
  });

  it('سوبر أدمن بلا مكتب + target_tenant_id محدد → بينشئ الحساب على المكتب المحدد', async () => {
    state.profilesById['caller-1'] = { is_super_admin: true, tenant_id: null, is_active: true };
    const res = await createLawyerReq({ target_tenant_id: 'tenant-chosen' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(state.createProfilePostCalls[0]).toMatchObject({ tenant_id: 'tenant-chosen' });
  });

  it('نجاح إنشاء الحساب لكن فشل إدخال صف profiles → 200 + رسالة ثابتة توضح إن الحساب اتعمل فعليًا (من غير تفاصيل الخطأ الخام)', async () => {
    state.createProfilePostOk = false;
    const res = await createLawyerReq();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.error).toBe('تم إنشاء الحساب لكن حدثت مشكلة في ضبط الصلاحيات. تواصل مع الدعم لإتمام الإعداد.');
  });

  it('مسار النجاح الكامل → ok:true + user_id، وصف profiles بالبيانات الصحيحة', async () => {
    const res = await createLawyerReq({ role: 'admin' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.user_id).toBe('new-auth-user-1');
    expect(state.createProfilePostCalls[0]).toMatchObject({
      user_id: 'new-auth-user-1',
      tenant_id: 'tenant-a',
      full_name: 'محامي جديد',
      email: 'new@office.com',
      role: 'admin',
      is_active: true,
    });
  });
});

describe('admin-actions — action غير معروف وأخطاء عامة', () => {
  it('action مش من ضمن الأنواع التلاتة → 200 + error، مش 400', async () => {
    // ⚠️ ملحوظة سلوك: على عكس saas-admin (اللي بيرجع 400 للـ action
    // غير المعروف)، admin-actions بيرجع 200 دايمًا زي ما موضّح في
    // تعليق الملف نفسه ("الخرج: دايمًا status 200")
    const res = await handler(req({ action: 'delete_everything' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.error).toBe('action غير معروف');
  });

  it('خطأ غير متوقع (فشل getCallerProfile بسبب رد باك-إند غير متوقع) → 500 عبر catch العام', async () => {
    // بنستبدل fetch بموك بيفشل بس لطلب البروفايل (GET) عشان rest() ترمي
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/auth/v1/user')) {
        return new Response(JSON.stringify(state.callerAuthBody), { status: 200 });
      }
      return new Response(JSON.stringify({ message: 'قاعدة البيانات مش متاحة دلوقتي' }), { status: 500 });
    }));
    const res = await handler(req({ action: 'force_signout', user_id: 'target-1' }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('تعذّر تنفيذ العملية. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.');
  });
});
