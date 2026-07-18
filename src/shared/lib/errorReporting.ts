import { recordError } from '../../systemHealth';
import { toast } from './notifications';
import type { ServiceKey } from '../../systemHealth';

/**
 * دالة موحدة لعرض رسالة خطأ للمستخدم وتسجيل التفصيل الخام داخليًا في نفس الوقت.
 * تختصر التكرار اليدوي لنمط: استخراج رسالة الخطأ الخام → recordError → toast،
 * اللي كان متكرر نصًا واحدًا في كل الأماكن اللي فيها معالجة أخطاء بعد التوحيد.
 *
 * rawError: أي قيمة استثناء (Error، نص، أو أي شيء تاني) — بيتحول لنص خام
 *           ويتسجل بس عن طريق recordError (console/localStorage)، ومبيتعرضش للمستخدم خالص.
 * message:  الرسالة العربية الجاهزة والآمنة اللي يشوفها المستخدم في التوست
 *           وفي بانر صحة النظام لو رجع نفس الخطأ تاني.
 * key:      مفتاح الخدمة (زي 'case_document_upload') يتسجل بيه في نظام صحة الخدمات.
 * label:    اسم الخدمة بالعربي، يظهر في بانر الصحة لو الـ key مش من المفاتيح المعروفة مسبقًا.
 */
export function showErrorToast(
  key: ServiceKey,
  rawError: unknown,
  message: string,
  label?: string,
): void {
  // ⚠️ مهم: أخطاء Supabase (PostgrestError، StorageError...) كائنات عادية فيها
  // .message لكنها مش instanceof Error، فمينفعش نعتمد على instanceof بس —
  // غير كده هيا هترجع "[object Object]" ويضيع النص الخام المهم للتسجيل.
  const rawMessage =
    rawError == null ? ''
    : typeof rawError === 'string' ? rawError
    : (typeof rawError === 'object' && 'message' in rawError && typeof (rawError as { message?: unknown }).message === 'string')
      ? (rawError as { message: string }).message
      : String(rawError);
  recordError(key, rawMessage, { label, message });
  toast('❌ ' + message, true);
}
