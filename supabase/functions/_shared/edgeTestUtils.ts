// ══════════════════════════════════════════════════════
//  ملف اختبار فقط (مش جزء من الفانكشنز المنشورة) — بنية مشتركة
//  لاختبار ملفات supabase/functions/*/index.ts تحت Vitest/Node.
//
//  المشكلة: كل index.ts بيستخدم Deno.env.get(...) على مستوى الملف
//  (module scope) وبيسجّل الـ handler بتاعه عن طريق Deno.serve(fn)
//  بدل ما يعمل export له. الاتنين مش موجودين في بيئة Node/Vitest.
//
//  الحل هنا: قبل استيراد الملف، بنحط global.Deno وهمي (stubDeno):
//   - env.get(key) بيرجع من object بيئة بنحدده إحنا في كل تست
//   - serve(fn) بيلقط الـ handler في "صندوق" بدل ما ينده عليه فعليًا
//  والـ import() الفعلي بيتكتب كسطر حرفي جوه كل ملف تست (مش هنا)،
//  عشان Vite يقدر يحلّ مسار الملف صح من غير الاعتماد على
//  import.meta.url (اللي بيرجع رابط http: وهمي جوه بيئة jsdom مش
//  file: حقيقي — جرّبنا الأسلوب ده الأول وفشل لنفس السبب ده بالظبط).
// ══════════════════════════════════════════════════════

import { vi } from 'vitest';

export type EdgeHandler = (req: Request) => Promise<Response> | Response;

/**
 * يحط Deno global وهمي (env.get + serve) ويرجّع "صندوق" هيتحط جواه
 * الـ handler أول ما الملف المستورد ينده على Deno.serve وقت التحميل.
 *
 * ⚠️ ليه مش بيعمل الـ import بنفسه: جرّبنا كده الأول وطلعت مشكلة —
 * `import.meta.url` جوه بيئة اختبار `jsdom` بيرجع رابط بروتوكوله
 * `http:` مش `file:`، فبناء مسار الملف منه بيفشل ("Only URLs with a
 * scheme in: file and data are supported"). الحل: الـ import() نفسه
 * لازم يتكتب كسطر حرفي (literal) جوه ملف التست نفسه، عشان Vite يقدر
 * يحلّ المسار وقت الـ build مش وقت التشغيل. الاستخدام الصح:
 *
 *   const box = stubDeno(ENV);
 *   vi.resetModules();
 *   await import('./index.ts');   // سطر حرفي، جوه ملف التست نفسه
 *   handler = box.handler!;
 *
 * @param env متغيرات البيئة اللي محتاجها الفانكشن دي (Deno.env.get)
 */
export function stubDeno(env: Record<string, string | undefined>): { handler: EdgeHandler | null } {
  const box: { handler: EdgeHandler | null } = { handler: null };
  (globalThis as unknown as { Deno: unknown }).Deno = {
    env: { get: (key: string) => env[key] },
    serve: (fn: EdgeHandler) => {
      box.handler = fn;
    },
  };
  return box;
}

export interface FetchRoute {
  /** بيتنادى لكل طلب — رجّع true لو الـ route ده هو اللي هيرد */
  match: (url: string, init: RequestInit | undefined) => boolean;
  /** بيرجع جسم الرد + status اختياري (افتراضي 200) */
  respond: (
    url: string,
    init: RequestInit | undefined,
  ) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>;
}

/**
 * بيبني mock لـ global fetch بيوجّه كل طلب لأول route مطابق بالترتيب.
 * لو مفيش route اتلقط، بيرمي error واضح (بدل ما يعمل طلب شبكة حقيقي).
 */
export function createRoutedFetch(routes: FetchRoute[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const route of routes) {
      if (route.match(url, init)) {
        const { status = 200, body } = await route.respond(url, init);
        // الـ Fetch spec بيمنع أي body (حتى فاضي زي {}) على الحالات
        // دي — لو حطينا JSON.stringify(body) هنا هيرمي "Response with
        // a 204 status cannot have body" حتى لو body كان {} بسيط.
        const noBodyAllowed = status === 204 || status === 205 || status === 304;
        return new Response(noBodyAllowed ? null : JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    throw new Error(`[edgeTestUtils] لا يوجد route مطابق لهذا الطلب في التست: ${url}`);
  });
}

/** طلب Request بسيط بجسم JSON — بيوفّر تكرار إنشاء POST requests في كل تست */
export function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://edge-function.local/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
