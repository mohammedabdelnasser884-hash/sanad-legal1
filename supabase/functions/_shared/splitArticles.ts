// ══════════════════════════════════════════════════════
//  تقسيم نص القانون المستخرج من PDF إلى مواد منفصلة
//
//  يتعامل مع المشاكل الشائعة في استخراج النص العربي من PDF:
//   - "Arabic Presentation Forms" (حروف زخرفية خاصة بالعرض،
//      مثل "ﻣﺎﺩﺓ" بدل "مادة") → تُطبَّع عبر NFKC
//   - أرقام عربية (٠-٩) وأرقام فارسية/أردو (۰-۹) → تُحوَّل لأرقام إنجليزية
//   - أقواس معكوسة بسبب اتجاه النص ")١(" بدل "(1)"
//   - رموز اتجاه النص الخفية (RTL/LTR marks)
//
//  يتعرف على الصيغ الشائعة في القوانين المصرية:
//    "مادة (1)"  /  "مادة 1"  /  "المادة 1"  /  "مادة)1(:"
//    "مادة رقم (5)"  /  "مادة (1) مكرر"  /  "مادة 1 مكرر 2"
// ══════════════════════════════════════════════════════

export interface ExtractedArticle {
  article_number: string;
  article_text: string;
  article_preview: string;
  order_index: number;
}

// رموز اتجاه النص الخفية التي تتداخل مع المطابقة
const BIDI_MARKS = /[\u200e\u200f\u061c\u202a-\u202e]/g;

// تحويل الأرقام العربية (٠-٩) والفارسية/الأردو (۰-۹) إلى أرقام إنجليزية
function normalizeDigits(s: string): string {
  return s
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

// تطبيع شامل للنص قبل المطابقة
function normalizeText(rawText: string): string {
  return rawText
    .normalize('NFKC')                 // يحوّل Arabic Presentation Forms للحروف العربية العادية
    .replace(BIDI_MARKS, '')           // إزالة رموز اتجاه النص الخفية
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ');
}

// مطابقة بداية أي مادة قانونية — تقبل أقواس عادية أو معكوسة قبل/بعد الرقم، وفاصلة ":" اختيارية
const ARTICLE_REGEX =
  /(?<![\u0600-\u06ff])(?:ال)?مادة[ \t]*[()]*\s*([0-9\u0660-\u0669\u06f0-\u06f9]+)\s*[()]*[ \t]*:?[ \t]*((?:مكرر(?:[ \t]*[()]*\s*[0-9\u0660-\u0669\u06f0-\u06f9]+\s*[()]*)?)?)/g;

export function splitIntoArticles(rawText: string): ExtractedArticle[] {
  const text = normalizeText(rawText);

  const matches = [...text.matchAll(ARTICLE_REGEX)];
  if (matches.length === 0) return [];

  // article_number -> article_text (أطول نسخة موجودة)
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

    // إزالة أي أقواس متبقية في بداية نص المادة (أثر جانبي من ترتيب الأقواس المعكوس)
    const body = text.slice(start, end).trim().replace(/^[()،:\s]+/, '').trim();

    // تجاهل تطابقات وهمية قصيرة جداً (مثل ذكر "مادة" في فهرس المحتويات)
    if (body.length < 8) continue;

    const existing = byNumber.get(num);
    if (!existing) {
      byNumber.set(num, body);
      order.push(num);
    } else if (body.length > existing.length) {
      // الاحتفاظ بالنسخة الأطول (الأقرب للنص الفعلي وليس مجرد إشارة في الفهرس)
      byNumber.set(num, body);
    }
  }

  return order.map((num, idx) => {
    const body = byNumber.get(num)!;
    return {
      article_number: num,
      article_text: body,
      article_preview: body.slice(0, 220),
      order_index: idx,
    };
  });
}
