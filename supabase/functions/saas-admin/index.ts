// ══════════════════════════════════════════════════════
//  Edge Function: saas-admin
//
//  بوابة السوبر أدمن لإدارة المكاتب (offices-portal.html).
//  كل العمليات بتتم بـ service_role على السيرفر — مفيش
//  credentials حساسة في المتصفح.
//
//  actions:
//   login                 { password }
//     → { token }
//
//   query                 { token, path, method, body }
//     → REST proxy على Supabase (tenants فقط)
//
//   createOfficeWithAdmin { token, tenant, adminEmail, adminName }
//     → { tenant, tempPassword }
//
//  الأمان:
//   - الباسورد بيتقارن من SAAS_ADMIN_PASSWORD (env secret)
//   - الـ token: JWT موقّع بـ SAAS_JWT_SECRET، صلاحيته 8 ساعات
//   - query مسموح بيه على tenants جدول بس (whitelist)
// ══════════════════════════════════════════════════════

// ⚠️ الكود ده اتحوّل لنسخة قائمة بذاتها (self-contained) — كان بيستورد
// corsHeaders/handleCors من ../_shared/cors.ts، لكن لوحة النشر بتاعتنا
// (Supabase Dashboard، ملف واحد لكل فانكشن) مش بتدعم مجلدات مشتركة بين
// الفانكشنز. نفس نمط admin-actions/index.ts الموجود عندك بالفعل.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY           = Deno.env.get('SUPABASE_ANON_KEY')!;
const ADMIN_PASSWORD     = Deno.env.get('SAAS_ADMIN_PASSWORD');
const JWT_SECRET         = Deno.env.get('SAAS_ADMIN_TOKEN_SECRET');
const TOKEN_TTL_MS       = 8 * 60 * 60 * 1000; // 8 ساعات

// لا تعتمد أبدًا على قيم افتراضية لأسرار السوبر أدمن — لو الـ secrets
// دول مش مضبوطة فعليًا في Supabase Edge Function Secrets، رفض التشغيل
// تمامًا بدل ما تقبل بصمت كلمة سر/JWT secret معروفين من الكود نفسه.
if (!ADMIN_PASSWORD) {
  throw new Error('SAAS_ADMIN_PASSWORD غير مضبوط في إعدادات الفانكشن — لا يمكن التشغيل بدونه');
}
if (!JWT_SECRET) {
  throw new Error('SAAS_ADMIN_TOKEN_SECRET غير مضبوط في إعدادات الفانكشن — لا يمكن التشغيل بدونه');
}

// جداول مسموح بيها في الـ query action (whitelist)
const ALLOWED_TABLES = ['tenants', 'tenant_invoices'];

// ── حماية من تجربة كل الباسوردات (brute-force) ─────────
// نفس نمط client-portal-api: بعد MAX_ATTEMPTS محاولة فاشلة من نفس
// الـ IP خلال WINDOW_MINUTES دقيقة، يتم رفض أي محاولة تانية مؤقتًا.
// بوابة saas-admin أخطر بكتير من بوابة الموكلين (وصول لكل المكاتب)
// وكانت من غير أي حماية brute-force خالص قبل الإصلاح ده.
const MAX_ATTEMPTS   = 5;
const WINDOW_MINUTES  = 15;
const LOCKOUT_MINUTES = 15;

function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

async function isLockedOut(ip: string): Promise<boolean> {
  if (ip === 'unknown') return false; // مش هنقفل IP مجهول تمامًا (نادر) عشان منمنعش وصول شرعي بالغلط
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
  const rows = await supabaseRest(
    `saas_admin_login_attempts?ip_address=eq.${encodeURIComponent(ip)}&success=eq.false&created_at=gte.${encodeURIComponent(since)}&select=id`,
  );
  return Array.isArray(rows) && rows.length >= MAX_ATTEMPTS;
}

async function recordAttempt(ip: string, success: boolean) {
  try {
    await supabaseRest('saas_admin_login_attempts', 'POST', { ip_address: ip, success });
  } catch (e) {
    // تسجيل فشل حفظ المحاولة نفسه في اللوجز (بدل ما يتبلع بصمت) —
    // مفيد لو حصلت مشكلة صلاحيات أو schema مستقبلًا. فشل الحفظ هنا
    // ميعطلش عملية الدخول نفسها عمدًا.
    console.error('recordAttempt failed:', e instanceof Error ? e.message : String(e), 'ip=', ip);
  }
}

// ── helpers ──────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function supabaseRest(path: string, method = 'GET', body: unknown = null) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.message ?? data?.error ?? String(r.status));
  return data;
}

// ── JWT بسيط HMAC-SHA256 ─────────────────────────────

function b64url(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function signToken(payload: Record<string, unknown>): Promise<string> {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body   = b64url(new TextEncoder().encode(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_MS })));
  const key    = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`)));
  return `${header}.${body}.${sig}`;
}

async function verifyToken(token: string): Promise<boolean> {
  try {
    const [header, body, sig] = token.split('.');
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'HMAC', key,
      Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
      new TextEncoder().encode(`${header}.${body}`),
    );
    if (!valid) return false;
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp < Date.now()) return false;
    return payload.role === 'saas_admin';
  } catch {
    return false;
  }
}

// توليد كلمة سر عشوائية آمنة
function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % chars.length]).join('');
}

// ── actions ──────────────────────────────────────────

/** login: تحقق من الباسورد وأعد token */
async function actionLogin(body: Record<string, string>, ip: string) {
  const { password } = body;
  if (!password) return json({ error: 'كلمة المرور مطلوبة' }, 400);

  if (await isLockedOut(ip)) {
    return json({ error: `محاولات كثيرة فاشلة، حاول مرة أخرى بعد ${LOCKOUT_MINUTES} دقيقة` }, 429);
  }

  // مقارنة constant-time لتجنب timing attacks
  const enc = new TextEncoder();
  const a = enc.encode(password);
  const b = enc.encode(ADMIN_PASSWORD);

  if (a.length !== b.length) {
    await recordAttempt(ip, false);
    return json({ error: 'كلمة المرور غير صحيحة' }, 401);
  }

  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) {
    await recordAttempt(ip, false);
    return json({ error: 'كلمة المرور غير صحيحة' }, 401);
  }

  await recordAttempt(ip, true);
  const token = await signToken({ role: 'saas_admin' });
  return json({ token });
}

/** query: REST proxy على جداول الـ whitelist */
async function actionQuery(body: Record<string, unknown>) {
  const { path, method = 'GET', body: reqBody } = body as { path?: string; method?: string; body?: unknown };

  if (!path || typeof path !== 'string') return json({ error: 'path مطلوب' }, 400);

  // تحقق من إن الـ path يبدأ بجدول مسموح بيه
  const tableName = path.split('?')[0].split('/')[0];
  if (!ALLOWED_TABLES.includes(tableName)) {
    return json({ error: `غير مسموح بالوصول لـ "${tableName}"` }, 403);
  }

  // منع DELETE المباشر من الـ proxy (محتاج action خاص)
  if (method === 'DELETE' && !path.includes('id=eq.')) {
    return json({ error: 'حذف بدون فلتر ID غير مسموح' }, 403);
  }

  const data = await supabaseRest(path, method as string, reqBody ?? null);
  return json(data);
}

/** createOfficeWithAdmin: إنشاء مكتب جديد + حساب أدمن */
async function actionCreateOffice(body: Record<string, unknown>) {
  const { tenant, adminEmail, adminName } = body as {
    tenant?: Record<string, unknown>;
    adminEmail?: string;
    adminName?: string;
  };

  if (!tenant?.name) return json({ error: 'اسم المكتب مطلوب' }, 400);
  if (!adminEmail)    return json({ error: 'البريد الإلكتروني للأدمن مطلوب' }, 400);

  // 1. إنشاء الـ tenant في جدول tenants
  const tenantRows = await supabaseRest('tenants', 'POST', tenant);
  const newTenant = Array.isArray(tenantRows) ? tenantRows[0] : tenantRows;
  if (!newTenant?.id) throw new Error('فشل إنشاء سجل المكتب');

  // 2. إنشاء حساب Auth للأدمن
  const tempPassword = generatePassword(14);
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: adminEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: adminName || adminEmail },
    }),
  });

  if (!authRes.ok) {
    const authErr = await authRes.json().catch(() => ({}));
    // rollback: احذف الـ tenant اللي اتعمل
    await supabaseRest(`tenants?id=eq.${newTenant.id}`, 'DELETE').catch(() => {});
    throw new Error(authErr?.message ?? 'فشل إنشاء حساب الأدمن');
  }

  const authUser = await authRes.json();
  const userId = authUser.id ?? authUser.user?.id;

  // 3. إنشاء profile للمستخدم مرتبط بالـ tenant
  await supabaseRest('profiles', 'POST', {
    user_id: userId,
    tenant_id: newTenant.id,
    full_name: adminName || adminEmail,
    email: adminEmail,
    role: 'admin',
    is_active: true,
    force_password_change: true, // إجباري يغير الباسورد أول دخول
  });

  // 4. إنشاء صف office_settings افتراضي خاص بالمكتب الجديد — لازم يتعمل
  // هنا عشان كل مكتب يكون عنده صف مستقل من أول لحظة (راجع
  // multi-tenant-office-settings-migration.sql)، وميشاركش صف مكتب تاني
  // أو يرجع فاضي بسبب عدم وجود صف خالص له.
  await supabaseRest('office_settings', 'POST', {
    tenant_id: newTenant.id,
    name: tenant?.name,
  }).catch(() => { /* لو فشل، لوحة الإعدادات هتنشئه تلقائيًا أول مرة يحفظ فيها الأدمن */ });

  return json({ tenant: newTenant, tempPassword });
}

// ── Main handler ──────────────────────────────────────

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const { action, token, ...rest } = body;
    const ip = getClientIp(req);

    // action بدون توثيق
    if (action === 'login') return await actionLogin(rest as Record<string, string>, ip);

    // باقي الـ actions محتاجة token صالح
    if (!token || typeof token !== 'string') {
      return json({ error: 'الجلسة مطلوبة' }, 401);
    }
    const valid = await verifyToken(token);
    if (!valid) return json({ error: 'الجلسة منتهية، سجّل الدخول من جديد' }, 401);

    switch (action) {
      case 'query':                return await actionQuery(rest);
      case 'createOfficeWithAdmin': return await actionCreateOffice(rest);
      default:                     return json({ error: `action غير معروف: ${action}` }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'خطأ غير متوقع';
    return json({ error: msg }, 500);
  }
});
