// ══════════════════════════════════════════════════════
//  Edge Function: admin-actions
//
//  المهمة: تنفيذ عمليات إدارية حساسة (إنشاء محامي جديد،
//  تغيير باسورد مستخدم، تسجيل خروجه من كل الأجهزة) كانت
//  بتتنفذ غلط من المتصفح مباشرة بـ db.auth.admin.* (محتاجة
//  service_role، مستحيل تتعمل بالـ anon key، فكانت فعليًا
//  مكسورة أو غير موجودة).
//
//  دلوقتي بتتنفذ هنا على السيرفر باستخدام service_role، بعد
//  التحقق إن الشخص اللي طالب العملية هو فعلاً admin في نفس
//  مكتب (tenant) الشخص المستهدف، أو سوبر أدمن المنصة.
//
//  الإدخال: { action: "...", ... } — نفس الشكل اللي AdminPanel.tsx
//  بيبعته عن طريق callAdminAction() في supabaseClient.ts
//
//  أنواع action:
//   force_signout    { user_id }
//   change_password  { user_id, new_password, force_change? }
//   create_lawyer    { email, password, full_name, role, permissions? }
//
//  الخرج: دايمًا status 200 — { ok:true, ... } أو { error: "..." }
//  (عشان callAdminAction في supabaseClient.ts تقدر تقرا data.error
//  مباشرة، بدل ما تعتمد على FunctionsHttpError العامة).
// ══════════════════════════════════════════════════════

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return null;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || `status ${r.status}`);
  }
  return r.status === 204 ? null : r.json();
}

async function rpc(name: string, args: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || `status ${r.status}`);
  }
}

// مين الشخص اللي عامل الطلب ده فعليًا، من خلال جلسته الحالية
async function getCaller(req: Request) {
  const authHeader = req.headers.get('Authorization') || '';
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: ANON_KEY },
  });
  if (!r.ok) return null;
  const user = await r.json().catch(() => null);
  return user?.id ? user : null;
}

async function getCallerProfile(callerId: string) {
  const rows = await rest(`profiles?user_id=eq.${callerId}&select=role,tenant_id,is_super_admin,is_active&limit=1`);
  return Array.isArray(rows) ? rows[0] : null;
}

// هل الشخص ده admin/super_admin، ومسموح له يتصرف في حساب المستخدم المستهدف؟
async function authorizeOnTarget(caller: any, targetUserId: string): Promise<boolean> {
  if (caller.is_super_admin === true) return true;
  if (caller.role !== 'admin' || caller.tenant_id == null) return false;
  const targetRows = await rest(`profiles?user_id=eq.${targetUserId}&select=tenant_id&limit=1`);
  const target = Array.isArray(targetRows) ? targetRows[0] : null;
  return !!target && target.tenant_id === caller.tenant_id;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    const callerUser = await getCaller(req);
    if (!callerUser) return json({ error: 'الجلسة منتهية، سجّل الدخول من جديد' }, 401);

    const caller = await getCallerProfile(callerUser.id);
    if (!caller) return json({ error: 'حساب غير معروف' }, 403);
    // FIX: كان الفحص ده غايب هنا رغم إنه موجود في الـ helper المشترك
    // (_shared/auth.ts) وفي ai-chat — يعني أدمن اتعمله تعطيل (is_active:false)
    // كان يقدر يفضل يغيّر باسوردات ويعمل حسابات جديدة لحد ما جلسته تنتهي
    // بنفسها، طالما محدش عمله force_signout يدويًا. أخطر function في
    // المشروع (تغيير باسورد/إنشاء حساب) كانت أضعف حماية من ai-chat نفسه.
    if (caller.is_active === false) return json({ error: 'الحساب معطّل' }, 403);

    // ── تسجيل خروج من جميع الأجهزة ──
    if (action === 'force_signout') {
      const userId = String(body.user_id || '');
      if (!userId) return json({ error: 'user_id مطلوب' });
      const allowed = await authorizeOnTarget(caller, userId);
      if (!allowed) return json({ error: 'غير مسموح لك بتنفيذ هذا الإجراء' });

      await rpc('admin_force_logout', { target_user_id: userId });
      return json({ ok: true });
    }

    // ── تغيير كلمة مرور مستخدم ──
    if (action === 'change_password') {
      const userId = String(body.user_id || '');
      const newPassword = String(body.new_password || '');
      if (!userId) return json({ error: 'user_id مطلوب' });
      if (newPassword.length < 8) return json({ error: 'كلمة السر قصيرة جدًا (8 أحرف على الأقل)' });

      const allowed = await authorizeOnTarget(caller, userId);
      if (!allowed) return json({ error: 'غير مسموح لك بتنفيذ هذا الإجراء' });

      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        return json({ error: e.msg || e.message || 'فشل تحديث كلمة المرور' });
      }

      if (body.force_change) {
        await rest(`profiles?user_id=eq.${userId}`, 'PATCH', { must_change_password: true });
      }
      // نسجّل خروجه من كل الأجهزة عشان كلمة السر القديمة تبقى ملغية فورًا
      await rpc('admin_force_logout', { target_user_id: userId }).catch(() => {});

      return json({ ok: true });
    }

    // ── إنشاء حساب محامي/موظف جديد ──
    if (action === 'create_lawyer') {
      if (caller.is_super_admin !== true && (caller.role !== 'admin' || caller.tenant_id == null)) {
        return json({ error: 'غير مسموح لك بإضافة مستخدمين' });
      }

      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const fullName = String(body.full_name || '').trim();
      const role = ['admin', 'lawyer', 'viewer'].includes(body.role) ? body.role : 'lawyer';
      if (!email || !fullName) return json({ error: 'البريد الإلكتروني والاسم مطلوبين' });
      if (password.length < 8) return json({ error: 'كلمة السر قصيرة جدًا (8 أحرف على الأقل)' });

      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
      const authUser = await authRes.json().catch(() => ({}));
      if (!authRes.ok) {
        return json({ error: authUser.msg || authUser.error_description || 'تعذر إنشاء الحساب (البريد مستخدم؟)' });
      }

      // أدمن مكتب عادي: يتحدد tenant_id من حسابه هو نفسه (مش من البودي)
      // عشان مينفعش يحقن مكتب تاني. سوبر أدمن بلا مكتب (tenant_id=null)
      // لازم يحدد target_tenant_id صراحةً، وإلا الصف هيتعمل بلا مكتب
      // ويبقى حساب معطوب مالوش وصول لأي بيانات.
      const targetTenantId = caller.is_super_admin === true
        ? (body.target_tenant_id || caller.tenant_id)
        : caller.tenant_id;
      if (!targetTenantId) {
        return json({ error: 'لازم تحدد target_tenant_id لأنك سوبر أدمن بلا مكتب مرتبط بحسابك' });
      }

      try {
        await rest('profiles', 'POST', [{
          user_id: authUser.id,
          tenant_id: targetTenantId,
          full_name: fullName,
          email,
          role,
          is_active: true,
          permissions: body.permissions || null,
        }]);
      } catch (e) {
        const rawMessage = e instanceof Error ? e.message : String(e);
        console.error('[admin-actions:create_lawyer profile insert]', rawMessage);
        return json({ error: 'تم إنشاء الحساب لكن حدثت مشكلة في ضبط الصلاحيات. تواصل مع الدعم لإتمام الإعداد.' });
      }

      return json({ ok: true, user_id: authUser.id });
    }

    return json({ error: 'action غير معروف' });
  } catch (e) {
    const rawMessage = e instanceof Error ? e.message : String(e);
    console.error('[admin-actions]', rawMessage);
    return json({ error: 'تعذّر تنفيذ العملية. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.' }, 500);
  }
});
