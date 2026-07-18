import { createClient } from 'npm:@supabase/supabase-js@2';
import { extractText, getDocumentProxy } from 'npm:unpdf';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL_ENV     = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY             = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY_ENV = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// خطأ متوقع برسالة عربية آمنة للعرض مباشرة للمستخدم — يُستخدم فقط
// عند throw مقصود ومكتوب يدويًا (زي "law_id مطلوب")، مش عند تمرير
// خطأ خام من نداء داخلي. أي خطأ مش من النوع ده بيتحول لرسالة عامة
// في catch. الحقل detail اختياري: بيسمح بتخزين تفاصيل تشخيصية أطول
// (زي عيّنة من النص المستخرج) في processing_error بالداتابيز، حتى
// لو الرسالة اللي بترجع فورًا للمستخدم قصيرة.
class KnownError extends Error {
  detail: string;
  constructor(message: string, detail?: string) {
    super(message);
    this.name = 'KnownError';
    this.detail = detail ?? message;
  }
}

const BIDI_MARKS = /[\u200e\u200f\u061c\u202a-\u202e]/g;

function normalizeDigits(s: string): string {
  return s
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function normalizeText(raw: string): string {
  return raw.normalize('NFKC').replace(BIDI_MARKS, '').replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ');
}

const ARTICLE_REGEX = /(?<![\u0600-\u06ff])(?:ال)?مادة[ \t]*[()]*\s*([0-9\u0660-\u0669\u06f0-\u06f9]+)\s*[()]*[ \t]*:?[ \t]*((?:مكرر(?:[ \t]*[()]*\s*[0-9\u0660-\u0669\u06f0-\u06f9]+\s*[()]*)?)?)/g;

function splitIntoArticles(rawText: string) {
  const text = normalizeText(rawText);
  const matches = [...text.matchAll(ARTICLE_REGEX)];
  if (matches.length === 0) return [];
  const byNumber = new Map<string, string>();
  const order: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    let num = normalizeDigits(m[1] || '').trim();
    if (!num) continue;
    const mokrarPart = (m[2] || '').trim();
    if (mokrarPart) {
      const mokrarDigits = normalizeDigits(mokrarPart).match(/[0-9]+/)?.[0];
      num = num + ' مكرر' + (mokrarDigits ? ' ' + mokrarDigits : '');
    }
    const body = text.slice(start, end).trim().replace(/^[()،:\s]+/, '').trim();
    if (body.length < 8) continue;
    const existing = byNumber.get(num);
    if (!existing) { byNumber.set(num, body); order.push(num); }
    else if (body.length > existing.length) { byNumber.set(num, body); }
  }
  return order.map((num, idx) => {
    const body = byNumber.get(num)!;
    return { article_number: num, article_text: body, article_preview: body.slice(0, 220), order_index: idx };
  });
}

async function getAuthorizedCaller(req: Request) {
  const authHeader = req.headers.get('Authorization') || '';
  const userRes = await fetch(`${SUPABASE_URL_ENV}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: ANON_KEY },
  });
  if (!userRes.ok) return { error: 'غير مصرح', status: 401 };
  const user = await userRes.json().catch(() => null);
  if (!user?.id) return { error: 'غير مصرح', status: 401 };
  const profileRes = await fetch(`${SUPABASE_URL_ENV}/rest/v1/profiles?user_id=eq.${user.id}&select=role,is_super_admin,is_active&limit=1`, {
    headers: { apikey: SERVICE_ROLE_KEY_ENV, Authorization: `Bearer ${SERVICE_ROLE_KEY_ENV}` },
  });
  if (!profileRes.ok) return { error: 'تعذر جلب الملف الشخصي', status: 500 };
  const profiles = await profileRes.json().catch(() => []);
  const caller = profiles?.[0];
  if (!caller) return { error: 'حساب غير معروف', status: 403 };
  if (caller.is_active === false) return { error: 'الحساب معطّل', status: 403 };
  return { caller };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authResult = await getAuthorizedCaller(req);
  if ('error' in authResult) {
    return new Response(JSON.stringify({ error: authResult.error }), {
      status: authResult.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const { caller } = authResult;
  if (caller.is_super_admin !== true && caller.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'غير مسموح' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL_ENV, SERVICE_ROLE_KEY_ENV);
  let law_id: string | undefined;

  try {
    const body = await req.json();
    law_id = body?.law_id;
    if (!law_id) throw new KnownError('law_id مطلوب');

    const { data: law, error: lawErr } = await supabase.from('laws').select('*').eq('id', law_id).single();
    if (lawErr || !law) throw new KnownError('القانون غير موجود');
    if (!law.file_path) throw new KnownError('لا يوجد ملف PDF');

    await supabase.from('laws').update({ status: 'processing', processing_error: null }).eq('id', law_id);

    const { data: fileBlob, error: dlErr } = await supabase.storage.from('legal-library').download(law.file_path);
    if (dlErr || !fileBlob) throw new KnownError('فشل تحميل الملف');

    const buffer = new Uint8Array(await fileBlob.arrayBuffer());
    const pdf = await getDocumentProxy(buffer);
    const { text } = await extractText(pdf, { mergePages: true });
    const fullText = Array.isArray(text) ? text.join('\n') : (text as string);

    if (!fullText || fullText.trim().length < 20) throw new KnownError('تعذر استخراج نص — الملف قد يكون صور ممسوحة.');

    const articles = splitIntoArticles(fullText);
    if (articles.length === 0) {
      throw new KnownError(
        'لم يتم العثور على مواد بصيغة "مادة (رقم)" في هذا الملف.',
        'لم يتم العثور على مواد بصيغة "مادة (رقم)". عينة:\n' + fullText.slice(0, 500),
      );
    }

    const { error: delErr } = await supabase.from('law_articles').delete().eq('law_id', law_id);
    if (delErr) throw delErr;

    const rows = articles.map((a) => ({ law_id, article_number: a.article_number, order_index: a.order_index, article_text: a.article_text, article_preview: a.article_preview }));
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error: insErr } = await supabase.from('law_articles').insert(rows.slice(i, i + CHUNK));
      if (insErr) throw insErr;
    }

    await supabase.rpc('refresh_law_articles_count', { p_law_id: law_id });
    await supabase.from('laws').update({ status: 'completed', processing_error: null }).eq('id', law_id);

    return new Response(JSON.stringify({ success: true, articles_count: articles.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    const rawMessage = e instanceof KnownError ? e.detail : (e instanceof Error ? e.message : String(e));
    console.error('[process-law-extract]', rawMessage);
    const message = e instanceof KnownError
      ? e.message
      : 'تعذّر معالجة الملف القانوني. لو المشكلة استمرت، تواصل مع الدعم.';
    // processing_error بتتعرض في لوحة إدارة المكتبة القانونية (LegalLibrarySection.tsx)
    // للأدمن فقط، فمن المفيد تفضل تفصيلية (rawMessage) حتى لو الرسالة
    // اللي بترجع فورًا في الـ response عامة أو مختصرة.
    if (law_id) await supabase.from('laws').update({ status: 'failed', processing_error: rawMessage }).eq('id', law_id);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});