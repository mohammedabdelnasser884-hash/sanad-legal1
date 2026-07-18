// القفل التفاؤلي (safeUpdate) وتسجيل النشاط (logActivity) وكشف نوع الجهاز
import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import type { Database } from '../../database.types';
import { toast } from './notifications';

// ══════════════════════════════════════════════════════════════
//  safeUpdate — Optimistic Locking
//  بيتحقق إن السجل مش اتعدل من حد تاني قبل ما يكتب
// ══════════════════════════════════════════════════════════════
/**
 * @param db         - Supabase client
 * @param table      - اسم الجدول
 * @param id         - id السجل
 * @param data       - البيانات الجديدة
 * @param knownUpdatedAt - قيمة updated_at اللي أنت شايفها (جبتها مع السجل)
 *
 * @returns { success, conflict, error }
 *   success  = true  → اتحفظ تمام
 *   conflict = true  → حد تاني عدّل السجل ده قبلك
 *   error           → خطأ من Supabase
 */
// ── تحديد نوع الجهاز من User-Agent string ──
export function detectDevice(ua: string): string {
    if (!ua) return 'جهاز غير معروف 💻';
    const u = ua.toLowerCase();
    if (u.includes('iphone') || u.includes('android') || u.includes('mobile')) return 'هاتف محمول 📱';
    if (u.includes('ipad') || u.includes('tablet')) return 'تابلت 📲';
    if (u.includes('mac'))     return 'Mac 💻';
    if (u.includes('windows')) return 'Windows 🖥';
    if (u.includes('linux'))   return 'Linux 🐧';
    return 'جهاز غير معروف 💻';
}

// ⚠️ الجداول الحقيقية الوحيدة اللي بتتنادى بيها safeUpdate فعليًا في المشروع
// (اتحقق من كل نداء في SessionUpdateModal.tsx/RemindersTab.tsx/
// StandaloneSessionDetailModal.tsx/useFeesActions.ts/useClientActions.ts/
// useCaseDetailActions.ts) — كلها عندها عمود updated_at حقيقي في database.types.ts.
// لو جدول جديد يتضاف مستقبلاً لاستخدام safeUpdate، يتضاف هنا كعضو جديد
// في الـ union بدل ما يترجع الباب مفتوح لـ `as any`.
export type SafeUpdateTable =
    | 'cases' | 'case_sessions' | 'case_fees' | 'case_notes' | 'clients' | 'reminders';

export async function safeUpdate<T extends SafeUpdateTable>(
    db: SupabaseClient<Database>,
    table: T,
    id: string | number,
    data: Database['public']['Tables'][T]['Update'],
    knownUpdatedAt: string | null
): Promise<{ success: boolean; conflict: boolean; error: PostgrestError | null }> {

    // table بقى الآن Generic مقيّد بـ SafeUpdateTable (union حقيقي من أسماء
    // الجداول)، و data بقى مطابق لنوع Update الحقيقي بتاع الجدول المحدد —
    // مفيش `as any` هنا خالص.
    //
    // ⚠️ قيد معروف في supabase-js + TypeScript: تسلسل .update()/.select() ثم
    // .eq() على db.from(table) لما `table` يكون Generic type parameter (T
    // extends SafeUpdateTable) بدل literal ثابت بيخلي المكتبة تحاول تحل
    // النوع على مستوى الـ schema كله بدل الستة جداول المسموحة بس، فبترجع
    // أخطاء ضخمة وقت البناء (نفس المشكلة بالظبط في main.tsx مع __dbWrite —
    // راجع تعليق dbFrom هناك لتفاصيل أوسع). الحل: نأكد لـ TypeScript إن
    // الجدول واحد من الستة المعروفين فعلاً (بنستخدم 'cases' كممثل — عنده
    // نفس أعمدة id/updated_at المشتركة بين كل جداول SafeUpdateTable) وقت
    // بناء الـ query builder بس. التحقق الحقيقي من اسم الجدول لسه قائم عن
    // طريق `table: T extends SafeUpdateTable` في توقيع الدالة.
    const dbFrom = () => db.from(table as unknown as 'cases');

    // لو مفيش updated_at محفوظ — نعمل UPDATE عادي بدون check (للبيانات القديمة)
    if (!knownUpdatedAt) {
        const { error } = await dbFrom().update(data as unknown as Database['public']['Tables']['cases']['Update']).eq('id', id as string);
        return { success: !error, conflict: false, error };
    }

    // 1. اتحقق إن updated_at مش اتغير من لما جبت السجل
    const { data: current, error: fetchErr } = await dbFrom()
        .select('updated_at')
        .eq('id', id as string)
        .single();

    if (fetchErr) {
        return { success: false, conflict: false, error: fetchErr };
    }

    // 2. قارن الـ timestamps — كل جداول SafeUpdateTable عندها updated_at حقيقي وقت التشغيل.
    const serverTime  = new Date(current.updated_at as string).getTime();
    const clientTime  = new Date(knownUpdatedAt).getTime();

    if (serverTime > clientTime) {
        // 💥 Conflict — حد تاني عدّل السجل ده
        toast('⚠️ هذا السجل عدّله شخص آخر — يُرجى فتحه من جديد', true);
        return { success: false, conflict: true, error: null };
    }

    // 3. آمن — نكتب
    const { error } = await dbFrom().update(data as unknown as Database['public']['Tables']['cases']['Update']).eq('id', id as string);
    return { success: !error, conflict: false, error };
}

// ══════════════════════════════════════════════════════════════
//  logActivity — تسجيل نشاط في activity_log (لوحة الإدارة)
//  ⚠️ مصممة عشان متعطلش أي عملية أساسية:
//  - لو المستخدم مش عامل لوجين (نادرًا) → بترجع بصمت
//  - لو فشل الكتابة في activity_log لأي سبب (الجدول لسه متعمل،
//    مشكلة شبكة، RLS...) → بتعمل console.error بس وما بترميش error
//  - بتُستخدم بدون await في الأماكن اللي بتنادي عليها (fire-and-forget)
//    عشان تسجيل النشاط ما يأخرش استجابة الشاشة للمستخدم.
//
//  @param db          - Supabase client (نفس النمط المستخدم في safeUpdate)
//  @param action      - وصف الإجراء بالعربي، مثلاً 'إضافة قضية'
//  @param opts.details      - تفاصيل إضافية (اسم القضية/الموكل...)
//  @param opts.entity_type  - 'case' | 'client' | 'user' | 'portal' | 'fee' | 'session' | 'note' | 'document'
//  @param opts.entity_id    - id السجل المرتبط (لو موجود)
//  @param opts.userName     - اسم المستخدم المنفِّذ — لو اتبعت من profile يُستخدم مباشرةً
//                             ويُوفَّر query على جدول profiles لكل استدعاء (N+1 fix)
//  @param opts.client_name  - اسم الموكل المرتبط (لعرضه كشارة في لوحة الإدارة)
//  @param opts.case_name    - عنوان/اسم القضية المرتبطة (لعرضها كشارة)
//  @param opts.case_type    - نوع القضية المرتبطة (لعرضه كشارة)
// ══════════════════════════════════════════════════════════════
export async function logActivity(
    db: SupabaseClient<Database>,
    action: string,
    opts?: {
        details?: string | null;
        entity_type?: string | null;
        entity_id?: string | null;
        userName?: string | null;
        client_name?: string | null;
        case_name?: string | null;
        case_type?: string | null;
    }
): Promise<void> {
    try {
        const { data: sessionData } = await db.auth.getSession();
        const user = sessionData?.session?.user;
        if (!user) return;

        // لو المستدعي بعت userName جاهز (من profile state) نستخدمه مباشرةً
        // ونوفّر query إضافي على profiles في كل استدعاء
        let userName: string | null = opts?.userName ?? null;
        let tenantId: string | null = null;
        if (!userName) {
            // fallback: نجيب الاسم والـ tenant_id من DB
            userName = user.email || null;
            const { data: prof } = await db.from('profiles').select('full_name,tenant_id').eq('user_id', user.id).maybeSingle();
            if (prof?.full_name) userName = prof.full_name;
            if (prof?.tenant_id) tenantId = prof.tenant_id;
        } else {
            // لو عندنا userName جاهز، نجيب tenant_id بس
            const { data: prof } = await db.from('profiles').select('tenant_id').eq('user_id', user.id).maybeSingle();
            if (prof?.tenant_id) tenantId = prof.tenant_id;
        }

        await db.from('activity_log').insert([{
            user_id: user.id,
            user_name: userName,
            tenant_id: tenantId,
            action,
            details: opts?.details ?? null,
            entity_type: opts?.entity_type ?? null,
            entity_id: opts?.entity_id ?? null,
            client_name: opts?.client_name ?? null,
            case_name: opts?.case_name ?? null,
            case_type: opts?.case_type ?? null,
        }]);
    } catch (e) {
        console.error('[activityLog] فشل تسجيل النشاط (تم تجاهله، العملية الأساسية لم تتأثر):', e);
    }
}
