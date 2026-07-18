// ══════════════════════════════════════════════════════
//  Edge Function: telegram-send
//
//  المهمة: إرسال رسائل تيليجرام الفورية (instant alerts) من السيرفر،
//  عشان توكن tg_instant_token ميوصلش للمتصفح أبداً. كان قبل كده
//  بيتجاب مباشرة من office_settings.tg_instant_token على الـ client
//  (useTelegramAlerts.ts) وبيتستخدم في fetch مباشر لـ api.telegram.org
//  من المتصفح — يعني أي مستخدم مسجل دخول (مش بس أدمن) كان يقدر يشوف
//  التوكن كامل في Network tab ويستخدمه بره التطبيق (يبعت باسم المكتب
//  لأي حد، أو يقرا رسائل البوت). نفس المشكلة اللي كانت في groq_key
//  قبل نقله لـ Vault — راجع ai-chat/index.ts.
//
//  دلوقتي:
//  - الفرونت إند (useTelegramAlerts.ts) بيبعت بس { text } للفنكشن.
//  - الفنكشن يتحقق إن الطالب مسجّل دخول وحسابه فعّال (أي دور، مش لازم
//    أدمن — التنبيهات الفورية بتُطلق من أي محامي بيستخدم التطبيق).
//  - الفنكشن يجيب التوكن من Vault بـ service_role لمكتب الطالب نفسه
//    فقط، والـ chat id من العمود العادي، وينده على تيليجرام، ويرجّع
//    النتيجة بس.
//
//  الإدخال:  { text: string }
//  الخرج:    { ok: true } أو { error: "..." }
// ══════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return null;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function rest(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || `status ${r.status}`);
  }
  return r.json();
}

// مين الشخص اللي عامل الطلب ده فعليًا، من خلال جلسته الحالية (نفس نمط ai-chat)
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
  const rows = await rest(`profiles?user_id=eq.${callerId}&select=tenant_id,is_active&limit=1`);
  return Array.isArray(rows) ? rows[0] : null;
}

// chat id عمود عادي (مش سرّي)، لكن التوكن لازم من Vault فقط عبر RPC
// مرفوضة تمامًا لـ anon/authenticated — نفس منطق getOfficeGroqKey في ai-chat
async function getOfficeInstantTgConfig(tenantId: string | null) {
  if (!tenantId) return null;

  const officeRows = await rest(
    `office_settings?tenant_id=eq.${tenantId}&select=tg_instant_chat&limit=1`,
  );
  const chat = Array.isArray(officeRows) ? officeRows[0]?.tg_instant_chat : null;
  if (!chat) return null;

  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_office_tg_instant_token`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_tenant_id: tenantId }),
  });
  if (!r.ok) return null;
  const token = await r.json().catch(() => null);
  if (typeof token !== 'string' || token.length === 0) return null;

  return { token, chat };
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json().catch(() => ({}));

    const callerUser = await getCaller(req);
    if (!callerUser) return json({ error: 'الجلسة منتهية، سجّل الدخول من جديد' }, 401);

    const caller = await getCallerProfile(callerUser.id);
    if (!caller) return json({ error: 'حساب غير معروف' }, 403);
    if (caller.is_active === false) return json({ error: 'الحساب معطّل' }, 403);

    const text = String(body.text || '').trim();
    if (!text) return json({ error: 'نص الرسالة مطلوب' }, 400);

    const cfg = await getOfficeInstantTgConfig(caller.tenant_id ?? null);
    // ⚠️ مش كل مكتب ضابط بوت التنبيهات الفورية — نرجّع ok بصمت هنا
    // (مش خطأ) عشان الفرونت إند (useTelegramAlerts) كان بيتصرف كذلك
    // لما التوكن/الـ chat مش موجودين، بدل ما يظهر خطأ لكل استخدام عادي
    // للتطبيق في المكاتب اللي مفعّلة الميزة دي.
    if (!cfg) return json({ ok: true, skipped: true });

    const tgRes = await fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.chat, text, parse_mode: 'HTML' }),
    });
    const data = await tgRes.json().catch(() => ({}));
    if (!tgRes.ok || !data.ok) {
      return json({ error: data.description || 'فشل إرسال رسالة تيليجرام' }, 502);
    }

    return json({ ok: true });
  } catch (e) {
    const rawMessage = e instanceof Error ? e.message : String(e);
    console.error('[telegram-send]', rawMessage);
    return json({ error: 'تعذّر إرسال الإشعار عبر تيليجرام. لو المشكلة استمرت، تواصل مع الدعم.' }, 500);
  }
});
