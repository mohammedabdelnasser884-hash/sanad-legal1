// ══════════════════════════════════════════════════════
//  Edge Function: embed-batch  (نسخة مدموجة — بدون استيراد ملفات _shared)
//
//  المهمة:
//   توليد embedding لدفعة من المواد القانونية (التي لا تملك
//   embedding بعد) التابعة لقانون معيّن، وتحديثها في قاعدة
//   البيانات.
//
//   تُستدعى بشكل متكرر (Loop) من لوحة الإدارة حتى تنتهي كل
//   المواد — وذلك لتجنب تجاوز حدود زمن تنفيذ الـ Edge Function
//   عند معالجة قوانين تحتوي آلاف المواد.
//
//  الإدخال: { law_id: string, batch_size?: number }
//  الخرج:   { done: boolean, remaining: number, total: number }
// ══════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2';

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
// عند throw مقصود ومكتوب يدويًا (زي "law_id مطلوب")، مش عند تمرير
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
const DEFAULT_BATCH_SIZE = 15;
const MAX_BATCH_SIZE = 50;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // ── دي عملية إدارية مكلفة (معالجة آلاف المواد + استدعاءات embedding
  // مدفوعة) بتتنادى من لوحة الإدارة فقط — نتحقق إن الطالب admin/super_admin ──
  const authResult = await getAuthorizedCaller(req, SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY);
  if ('error' in authResult) {
    return new Response(JSON.stringify({ error: authResult.error }), {
      status: authResult.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const { caller } = authResult;
  if (caller.is_super_admin !== true && caller.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'غير مسموح لك بتنفيذ هذه العملية' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { law_id, batch_size } = await req.json();
    if (!law_id) throw new KnownError('law_id مطلوب');

    const limit = batch_size && batch_size > 0
      ? Math.min(batch_size, MAX_BATCH_SIZE)
      : DEFAULT_BATCH_SIZE;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // إجمالي عدد مواد هذا القانون
    const { count: total } = await supabase
      .from('law_articles')
      .select('id', { count: 'exact', head: true })
      .eq('law_id', law_id);

    // دفعة من المواد التي تحتاج embedding
    const { data: batch, error: fetchErr } = await supabase
      .from('law_articles')
      .select('id, article_text')
      .eq('law_id', law_id)
      .is('embedding', null)
      .limit(limit);
    if (fetchErr) throw fetchErr;

    if (!batch || batch.length === 0) {
      // اكتملت كل المواد — تحديث حالة القانون
      await supabase.from('laws').update({ status: 'completed' }).eq('id', law_id);
      return new Response(
        JSON.stringify({ done: true, remaining: 0, total: total ?? 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    for (const row of batch) {
      const embedding = await embedText(row.article_text);
      // pgvector يقبل النص بصيغة "[0.1,0.2,...]" — وهي نفس صيغة JSON.stringify لمصفوفة أرقام
      const { error: updErr } = await supabase
        .from('law_articles')
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', row.id);
      if (updErr) throw updErr;
    }

    const { count: remaining } = await supabase
      .from('law_articles')
      .select('id', { count: 'exact', head: true })
      .eq('law_id', law_id)
      .is('embedding', null);

    const isDone = (remaining ?? 0) === 0;
    if (isDone) {
      await supabase.from('laws').update({ status: 'completed' }).eq('id', law_id);
    }

    return new Response(
      JSON.stringify({ done: isDone, remaining: remaining ?? 0, total: total ?? 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const rawMessage = e instanceof KnownError ? e.detail : (e instanceof Error ? e.message : String(e));
    console.error('[embed-batch]', rawMessage);
    const message = e instanceof KnownError
      ? e.message
      : 'تعذّر معالجة الفهرسة حاليًا. لو المشكلة استمرت، تواصل مع الدعم.';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
