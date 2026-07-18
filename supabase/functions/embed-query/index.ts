// ══════════════════════════════════════════════════════
//  Edge Function: embed-query  (نسخة مدموجة — بدون استيراد ملفات _shared)
//
//  المهمة: تحويل سؤال المستخدم (نص) إلى embedding، لاستخدامه
//  في البحث الدلالي عن المواد القانونية المناسبة عبر
//  match_law_articles.
//
//  الإدخال: { text: string }
//  الخرج:   { embedding: number[] }
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

// خطأ متوقع برسالة عربية آمنة للعرض مباشرة للمستخدم — يُستخدم فقط
// عند throw مقصود ومكتوب يدويًا (زي "text مطلوب")، مش عند تمرير
// خطأ خام من نداء داخلي أو مزوّد خارجي. أي خطأ مش من النوع ده بيتحول
// لرسالة عامة في catch، والخام يتسجل في console.error بس.
class KnownError extends Error {
  detail: string;
  constructor(message: string, detail?: string) {
    super(message);
    this.name = 'KnownError';
    this.detail = detail ?? message;
  }
}

// ── توليد embeddings عبر Google Gemini Embedding API ──
const EMBEDDING_DIMENSIONS = 384;
const EMBED_MODEL = 'text-embedding-004';
const MAX_CHARS = 6000;

async function embedText(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY غير مضاف كـ Secret في Edge Functions');

  const input = (text || '').slice(0, MAX_CHARS);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text: input }] },
        outputDimensionality: EMBEDDING_DIMENSIONS,
      }),
    },
  );

  const data = await res.json();
  if (data.error) {
    throw new Error('Gemini embedding error: ' + (data.error.message || JSON.stringify(data.error)));
  }
  const values = data?.embedding?.values;
  if (!Array.isArray(values)) {
    throw new Error('استجابة Gemini غير متوقعة: ' + JSON.stringify(data).slice(0, 300));
  }
  return values;
}

// ── التحقق من هوية الطالب (caller) قبل تنفيذ العملية ──
interface CallerProfile {
  user_id: string;
  tenant_id: string | null;
  role?: string;
  is_active?: boolean;
  is_super_admin?: boolean;
}

async function getAuthorizedCaller(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
  serviceRoleKey: string,
): Promise<{ caller: CallerProfile } | { error: string; status: number }> {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader) return { error: 'الجلسة مطلوبة، سجّل الدخول من جديد', status: 401 };

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anonKey },
  });
  if (!userRes.ok) return { error: 'الجلسة منتهية، سجّل الدخول من جديد', status: 401 };
  const user = await userRes.json().catch(() => null);
  if (!user?.id) return { error: 'الجلسة منتهية، سجّل الدخول من جديد', status: 401 };

  const profRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?user_id=eq.${user.id}&select=user_id,tenant_id,role,is_active,is_super_admin&limit=1`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );
  if (!profRes.ok) return { error: 'تعذر التحقق من الحساب', status: 500 };
  const rows = await profRes.json().catch(() => []);
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile) return { error: 'حساب غير معروف', status: 403 };
  if (profile.is_active === false) return { error: 'الحساب معطّل', status: 403 };

  return { caller: profile as CallerProfile };
}

// ── المنطق الرئيسي للفانكشن ──
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // ── لازم تكون جلسة مستخدم حقيقية ومُفعّلة، عشان حد anon مجهول
  // ما يستهلكش استدعاءات API الـ embeddings المدفوعة ──
  const authResult = await getAuthorizedCaller(req, SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY);
  if ('error' in authResult) {
    return new Response(JSON.stringify({ error: authResult.error }), {
      status: authResult.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { text } = await req.json();
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new KnownError('text مطلوب');
    }

    const embedding = await embedText(text);

    return new Response(
      JSON.stringify({ embedding }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const rawMessage = e instanceof KnownError ? e.detail : (e instanceof Error ? e.message : String(e));
    console.error('[embed-query]', rawMessage);
    const message = e instanceof KnownError
      ? e.message
      : 'تعذّر تنفيذ البحث حاليًا. لو المشكلة استمرت، تواصل مع الدعم.';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
