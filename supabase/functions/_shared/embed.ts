// ══════════════════════════════════════════════════════
//  وحدة مشتركة لتوليد embeddings
//
//  تستخدم Google Gemini Embedding API (text-embedding-004)
//  مع تحديد حجم المتجه = 384 (نفس حجم السكيما الحالية،
//  فلا حاجة لأي تعديل في قاعدة البيانات).
//
//  مجاني: حصة يومية مجانية كبيرة من Google AI Studio،
//  بدون بطاقة ائتمان. يتطلب فقط متغير بيئة GEMINI_API_KEY
//  مضاف كـ Secret في Supabase Edge Functions.
//
//  ملاحظة: تم التحول لهذا الحل بعد أن تجاوز نموذج gte-small
//  المدمج محلياً حد "CPU Time" المسموح في Edge Functions
//  بالخطة المجانية لـ Supabase.
// ══════════════════════════════════════════════════════

const EMBEDDING_DIMENSIONS = 384;
const MODEL = 'text-embedding-004';

// الحد الأقصى لعدد الأحرف المرسلة للنموذج
const MAX_CHARS = 6000;

export async function embedText(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY غير مضاف كـ Secret في Edge Functions');

  const input = (text || '').slice(0, MAX_CHARS);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${MODEL}`,
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
