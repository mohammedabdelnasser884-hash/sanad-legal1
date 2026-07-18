// ══════════════════════════════════════════════════════
//  Edge Function: office-login
//
//  تسجيل دخول المحامي/الأدمن العادي (LoginScreen.tsx).
//  هدف هذه الفانكشن: نفس حماية brute-force الموجودة بالفعل في
//  client-portal-api و saas-admin، بالإضافة لتفعيل عمود
//  profiles.is_locked فعليًا (كان معرّف في القاعدة وله واجهة كاملة
//  في لوحة الأدمن، لكن غير مُتحقق منه في أي طبقة قبل هذا الإصلاح).
//
//  الفرونت إند بقى يستدعي الفانكشن دي بدل ما ينده على
//  db.auth.signInWithPassword مباشرة، وبعد النجاح بيعمل
//  db.auth.setSession() بالـ tokens اللي بترجع من هنا — يعني
//  باقي التطبيق (RLS المبني على auth.uid()) يفضل شغال زي ما هو
//  بالظبط من غير أي تغيير تاني.
//
//  action: login { email, password }
//    → نجاح: { access_token, refresh_token, user }
//    → فشل:  { error } بحالة 401/403/429
//
//  ⚠️ نسخة self-contained (بلا استيراد من ../_shared/) بنفس نمط
//  saas-admin/office-secrets — عشان تتوافق مع النشر من لوحة
//  Supabase (ملف واحد لكل فانكشن).
// ══════════════════════════════════════════════════════

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

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ── حماية من تجربة كل الباسوردات (brute-force) ─────────
// نفس نمط client-portal-api/saas-admin: بعد MAX_ATTEMPTS محاولة
// فاشلة على نفس الإيميل أو نفس الـ IP خلال WINDOW_MINUTES دقيقة،
// نرفض أي محاولة تانية مؤقتًا.
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

async function isLockedOut(email: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
  const [byEmail, byIp] = await Promise.all([
    rest(`office_login_attempts?email=eq.${encodeURIComponent(email)}&success=eq.false&created_at=gte.${encodeURIComponent(since)}&select=id`),
    ip !== 'unknown'
      ? rest(`office_login_attempts?ip_address=eq.${encodeURIComponent(ip)}&success=eq.false&created_at=gte.${encodeURIComponent(since)}&select=id`)
      : Promise.resolve([]),
  ]);
  return (Array.isArray(byEmail) && byEmail.length >= MAX_ATTEMPTS)
      || (Array.isArray(byIp) && byIp.length >= MAX_ATTEMPTS);
}

async function recordAttempt(email: string, ip: string, success: boolean) {
  try {
    await rest('office_login_attempts', 'POST', { email, ip_address: ip, success });
  } catch (e) {
    console.error('recordAttempt failed:', e instanceof Error ? e.message : String(e));
  }
}

// ── helpers ──────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function rest(path: string, method = 'GET', body: unknown = null) {
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

/** يلغي (يعطّل) access_token صادر لتوّه — يُستخدم لو الحساب طلع مقفول/معطّل
 *  بعد ما GoTrue أصدرت الـ token بنجاح (الباسورد كان صح)، عشان الجلسة دي
 *  ميفضلش صالحة حتى لو ما رجعناهاش للفرونت إند. */
async function revokeToken(accessToken: string) {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // فشل الإلغاء لا يجب أن يُسقط الرد للمستخدم — الأهم إننا مش رجعنا الـ token له
  }
}

async function actionLogin(email: string, password: string, ip: string) {
  if (await isLockedOut(email, ip)) {
    return json({ error: `محاولات كثيرة فاشلة، حاول مرة أخرى بعد ${LOCKOUT_MINUTES} دقيقة` }, 429);
  }

  // ── تحقق الباسورد الفعلي عن طريق Supabase Auth (GoTrue) ──
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const authData = await authRes.json().catch(() => ({}));

  if (!authRes.ok || !authData?.access_token) {
    await recordAttempt(email, ip, false);
    return json({ error: 'بيانات الدخول غير صحيحة. تحقق من الإيميل وكلمة السر.' }, 401);
  }

  const user = authData.user;

  // ── هل الحساب مرتبط بمكتب ومفعّل وغير مقفول؟ ──
  const profiles = await rest(
    `profiles?user_id=eq.${user.id}&select=user_id,tenant_id,role,is_active,is_locked,full_name&limit=1`,
  );
  const profile = profiles[0];

  if (!profile) {
    await revokeToken(authData.access_token);
    await recordAttempt(email, ip, false);
    return json({ error: 'هذا الحساب غير مرتبط بأي مكتب على المنصة' }, 403);
  }

  if (profile.is_active === false) {
    await revokeToken(authData.access_token);
    await recordAttempt(email, ip, false);
    return json({ error: 'تم تعطيل هذا الحساب، تواصل مع مدير النظام' }, 403);
  }

  if (profile.is_locked === true) {
    await revokeToken(authData.access_token);
    await recordAttempt(email, ip, false);
    return json({ error: 'هذا الحساب مقفول حاليًا، تواصل مع مدير النظام لفتحه' }, 403);
  }

  // ── هل اشتراك المكتب (tenant) نفسه شغال؟ ──
  // ⚠️ الثغرة الحرجة من تقرير الأمان: كانت بنية الاشتراك (tenants.status,
  // trial_ends_at) موجودة في القاعدة من زمان، لكن مفيش أي كود بيتحقق
  // منها فعليًا — يعني أي مكتب اتلغى اشتراكه أو خلصت تجربته كان لسه
  // يقدر يدخل ويستخدم النظام بالكامل.
  const tenants = await rest(
    `tenants?id=eq.${profile.tenant_id}&select=id,status,trial_ends_at,subscription_plan&limit=1`,
  );
  const tenant = tenants[0];

  if (!tenant) {
    await revokeToken(authData.access_token);
    await recordAttempt(email, ip, false);
    return json({ error: 'تعذر التحقق من بيانات المكتب، تواصل مع الدعم الفني' }, 403);
  }

  if (tenant.status === 'suspended') {
    await revokeToken(authData.access_token);
    await recordAttempt(email, ip, false);
    return json({ error: 'تم إيقاف اشتراك المكتب مؤقتًا، تواصل مع الدعم الفني' }, 403);
  }

  if (tenant.status === 'trial' && tenant.trial_ends_at && new Date(tenant.trial_ends_at) < new Date()) {
    await revokeToken(authData.access_token);
    await recordAttempt(email, ip, false);
    return json({ error: 'انتهت الفترة التجريبية للمكتب، تواصل مع فريق سند للاشتراك' }, 403);
  }

  // ── نجاح: سجّل المحاولة، حدّث آخر دخول، رجّع الجلسة للفرونت إند ──
  await recordAttempt(email, ip, true);
  await rest(`profiles?user_id=eq.${user.id}`, 'PATCH', {
    last_login: new Date().toISOString(),
    failed_login_attempts: 0,
  }).catch(() => {
    // فشل تحديث last_login لا يجب أن يمنع تسجيل الدخول نفسه
  });

  return json({
    access_token: authData.access_token,
    refresh_token: authData.refresh_token,
    user,
  });
}

// ── Main handler ──────────────────────────────────────

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, string>;
    const { action, email, password } = body;
    const ip = getClientIp(req);

    if (action !== 'login') {
      return json({ error: `action غير معروف: ${action}` }, 400);
    }
    if (!email || !password) {
      return json({ error: 'يرجى إدخال البريد وكلمة السر' }, 400);
    }

    return await actionLogin(email.trim(), password, ip);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'خطأ غير متوقع';
    // ⚠️ ما بنرجعش msg الخام للمستخدم (كان ده مصدر تسريب رسائل تقنية
    // للفرونت إند عبر data.error). بنسجلها هنا في اللوج للتشخيص، والرسالة
    // اللي بترجع للمستخدم رسالة ثابتة موحّدة، وLoginScreen.tsx هو اللي
    // بيحط عليها جملة "تواصل مع الدعم" لأنها نفس صيغة الرسالة الموحدة هناك.
    console.error('office-login unexpected error:', msg);
    return json({ error: 'تعذّر تسجيل الدخول. تحقق من اتصال الإنترنت وحاول مرة أخرى.' }, 500);
  }
});
