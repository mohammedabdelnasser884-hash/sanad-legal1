// ══════════════════════════════════════════════════════
//  Edge Function: ai-chat
//
//  المهمة: استدعاء Groq API (المساعد القانوني AI) من السيرفر،
//  عشان مفتاح groq_key ميوصلش للمتصفح أبداً (كان قبل كده بيتجاب
//  مباشرة من office_settings.groq_key على الـ client ويظهر في
//  Network tab لأي مستخدم مسجل دخول، مهما كان دوره).
//
//  دلوقتي:
//  - الفرونت إند بيبعت بس { messages, system_prompt } للفنكشن.
//  - الفنكشن يتحقق إن الطالب مسجّل دخول وعنده profile فعّال
//    (عبر الـ JWT في Authorization header، زي admin-actions).
//  - الفنكشن يجيب groq_key بـ service_role (يتخطى RLS) لمكتب
//    الطالب نفسه فقط، وينده على Groq، ويرجّع الرد بس.
//
//  الإدخال:
//   { messages: [{role, content}], system_prompt: string, max_tokens?, temperature?, model? }
//
//  الخرج:
//   { ok: true, content: string } أو { error: "..." }
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

// النماذج المسموح بيها فقط — whitelist للحماية من أي محاولة حقن نموذج غير معتمد
const ALLOWED_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
] as const;
const DEFAULT_MODEL  = 'llama-3.3-70b-versatile'; // الافتراضي الأقوى
const MAX_TOKENS_CAP = 2000; // حماية من استهلاك مفرط لو الفرونت إند طلب رقم ضخم

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
  const rows = await rest(`profiles?user_id=eq.${callerId}&select=tenant_id,is_active&limit=1`);
  return Array.isArray(rows) ? rows[0] : null;
}

async function getOfficeGroqKey(tenantId: string | null) {
  // ✅ المفتاح بقى متخزن في Supabase Vault (مش نص صريح في عمود عادي) —
  // راجع groq-key-vault-migration.sql. القراءة هنا عن طريق RPC
  // get_office_groq_key اللي مرفوضة تمامًا لـ anon/authenticated ومسموحة
  // بس لـ service_role، فمفيش أي مسار ممكن يسرّب المفتاح للفرونت إند.
  // هنا ما فيش fallback لأول صف موجود لو tenantId غير معروف، عشان
  // منرجّعش مفتاح مكتب تاني بالغلط.
  if (!tenantId) return null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_office_groq_key`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_tenant_id: tenantId }),
  });
  if (!r.ok) return null;
  const key = await r.json().catch(() => null);
  return typeof key === 'string' && key.length > 0 ? key : null;
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

    const groqKey = await getOfficeGroqKey(caller.tenant_id ?? null);
    if (!groqKey) return json({ error: 'لم يتم ضبط مفتاح المساعد القانوني لهذا المكتب بعد' }, 400);

    const messages = Array.isArray(body.messages) ? body.messages : null;
    if (!messages || messages.length === 0) return json({ error: 'messages مطلوبة' }, 400);

    const systemPrompt = String(body.system_prompt || '');
    const maxTokens = Math.min(Number(body.max_tokens) || 1500, MAX_TOKENS_CAP);
    const temperature = typeof body.temperature === 'number' ? body.temperature : 0.3;
    // اقبل المودل من الفرونت بس لو في الـ whitelist، وإلا استخدم الافتراضي الأقوى
    const requestedModel = String(body.model || '');
    const model = (ALLOWED_MODELS as readonly string[]).includes(requestedModel)
      ? requestedModel
      : DEFAULT_MODEL;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: maxTokens,
        temperature,
      }),
    });

    const data = await groqRes.json().catch(() => ({}));
    if (!groqRes.ok || data.error) {
      return json({ error: data.error?.message || 'تعذر الاتصال بمزوّد الذكاء الاصطناعي' }, 502);
    }

    const content = data.choices?.[0]?.message?.content || '';
    return json({ ok: true, content });
  } catch (e) {
    const rawMessage = e instanceof Error ? e.message : String(e);
    console.error('[ai-chat]', rawMessage);
    return json({ error: 'تعذّر الحصول على رد من المساعد الذكي حاليًا. لو المشكلة استمرت، تواصل مع الدعم.' }, 500);
  }
});
