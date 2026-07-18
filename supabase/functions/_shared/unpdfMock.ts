// ══════════════════════════════════════════════════════
//  ملف اختبار فقط (مش جزء من الفانكشنز المنشورة، ومش بديل حقيقي
//  لمكتبة 'unpdf' الفعلية) — بديل محلي بسيط بنفس توقيع الدالتين
//  اللي process-law-extract/index.ts بيستوردهم من 'npm:unpdf':
//  `getDocumentProxy(buffer)` و`extractText(pdf, opts)`.
//
//  السبب: 'unpdf' مش موجودة أصلًا في package.json (بعكس supabase-js
//  اللي ليها alias لباكدج حقيقي مثبّت). بدل إضافة تبعية وهمية غير
//  مستخدمة فعليًا في المشروع بس عشان التستات، alias في vitest.config.ts
//  بيوجّه 'npm:unpdf' مباشرة لهذا الملف.
//
//  التستات بتتحكم في السلوك عن طريق استيراد `__state` من نفس الملف
//  وتعديله مباشرة قبل كل تست (زي ما بتعمل مع fetchState العادي) —
//  من غير أي حاجة لـ vi.mock هنا خالص.
// ══════════════════════════════════════════════════════

export const __state: {
  text: string | string[];
  proxyShouldThrow: boolean;
  proxyErrorMessage: string;
  extractShouldThrow: boolean;
  extractErrorMessage: string;
} = {
  text: 'نص افتراضي للتست',
  proxyShouldThrow: false,
  proxyErrorMessage: 'unpdf: فشل تحميل الملف كـ PDF',
  extractShouldThrow: false,
  extractErrorMessage: 'unpdf: فشل استخراج النص',
};

export function resetUnpdfMock() {
  __state.text = 'نص افتراضي للتست';
  __state.proxyShouldThrow = false;
  __state.proxyErrorMessage = 'unpdf: فشل تحميل الملف كـ PDF';
  __state.extractShouldThrow = false;
  __state.extractErrorMessage = 'unpdf: فشل استخراج النص';
}

export async function getDocumentProxy(_buffer: Uint8Array): Promise<unknown> {
  if (__state.proxyShouldThrow) throw new Error(__state.proxyErrorMessage);
  return { __fakePdfProxy: true };
}

export async function extractText(
  _pdf: unknown,
  _opts?: { mergePages?: boolean },
): Promise<{ text: string | string[] }> {
  if (__state.extractShouldThrow) throw new Error(__state.extractErrorMessage);
  return { text: __state.text };
}
