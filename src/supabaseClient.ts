import { createClient } from '@supabase/supabase-js';
import { recordError } from './systemHealth';
import type { Database } from './database.types';

export const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPA_URL || !SUPA_KEY) {
  console.error('[Supabase] Missing environment variables: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

// تمرير <Database> هنا هو اللي بيخلي db.from('cases').select('...') يتحقق
// من أسماء الجداول والأعمدة وقت الكتابة (compile-time)، بدل ما يكتشف أي
// اسم عمود غلط بس وقت التشغيل الفعلي.
export const db = createClient<Database>(SUPA_URL, SUPA_KEY);

// شكل الـ payload الحقيقي لكل نوع عملية إدارية بيتبعت لـ Edge Function
// admin-actions — اتحقق من كل نداء فعلي في useAdminSessions.ts/useAdminUsers.ts/
// useClientActions.ts. لو نوع عملية جديد يتضاف مستقبلاً، يتضاف هنا كعضو جديد
// في الـ union بدل ما يترجع الباب مفتوح لـ Record<string, any>.
export type AdminActionPayload =
  | { action: 'force_signout'; user_id: string }
  | { action: 'change_password'; user_id: string; new_password: string; force_change: boolean }
  | { action: 'create_lawyer'; email: string; password: string; full_name: string; role?: string; permissions?: Record<string, boolean> };

// استدعاء Edge Function للعمليات الإدارية (تسجيل خروج قسري، تغيير باسورد، إنشاء محامي...)
// الدالة تُرمي Error عند الفشل، عشان الكولرز تستخدم try/catch
const GENERIC_OPERATION_MSG = 'حصلت مشكلة أثناء تنفيذ العملية. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.';

export async function callAdminAction(payload: AdminActionPayload) {
  const { data, error } = await db.functions.invoke('admin-actions', { body: payload });
  if (error) {
    recordError('generic_operation', error.message || String(error), {
      label: 'عملية إدارية',
      message: GENERIC_OPERATION_MSG,
    });
    throw new Error(GENERIC_OPERATION_MSG);
  }
  // data?.error يرجع من الفانكشن نفسها — إما رسالة مقصودة (KnownError) أو
  // رسالة عامة ثابتة بالفعل (بعد إصلاح المرحلة 2)، مفيهاش e.message خام.
  if (data?.error) throw new Error(data.error);
  return data;
}
