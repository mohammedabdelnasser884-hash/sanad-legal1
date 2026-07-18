-- ============================================================
-- 07 - فرض حالة اشتراك المكتب على مستوى RLS
-- إغلاق الثغرة الحرجة: "غياب فرض الاشتراك على الـ tenant"
-- ============================================================
-- الفكرة: current_tenant_id() هي الدالة اللي كل سياسة RLS في
-- النظام كله بتعتمد عليها (tenant_id = current_tenant_id()).
-- بدل ما نلف على كل جدول ونعدّل سياسته لوحده (تغيير ضخم وخطر)،
-- بنعدّل نقطة واحدة مركزية: لو المكتب موقوف/ملغي/تجربته خلصت،
-- الدالة ترجع NULL بدل tenant_id الحقيقي — فأي سياسة في أي جدول
-- بتتحقق منها بتفشل تلقائيًا (tenant_id = NULL مش بيتحقق أبدًا)،
-- يعني قفل فوري وشامل حتى لو المستخدم فاتح جلسة شغالة من الأول.
--
-- ⚠️ ده منفصل تمامًا عن فحص تسجيل الدخول (office-login/client-portal-api)
-- اللي عملناه قبل كده — ده بيقفل الدخول الجديد، وده بيقفل حتى
-- الجلسات المفتوحة فعليًا وقت ما حالة المكتب تتغيّر.

CREATE OR REPLACE FUNCTION public.current_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.tenant_id
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  where p.user_id = auth.uid()
    -- مكتب من غير status محدد (لسه مبعتش/default) → نعتبره شغال،
    -- عشان منقفلش مكاتب جديدة بالغلط لسه ما اتصنفتش
    and (t.status is null or t.status <> 'suspended')
    -- تجربة منتهية = زي الموقوف بالظبط
    and (t.status is distinct from 'trial' or t.trial_ends_at is null or t.trial_ends_at >= now())
$function$;

-- ── ملاحظة مهمة قبل التنفيذ ──
-- الدالة دي SECURITY DEFINER وبتتنفذ بصلاحيات مين عملها (عادة postgres/owner)،
-- فمينفعش نغيرها بأمان من غير ما نتأكد إن التوقيع (RETURNS uuid) واسم
-- الفانكشن (current_tenant_id) فضلوا زي ما هم بالظبط — وده اللي حصل هنا،
-- فأي سياسة موجودة في أي جدول هتشتغل مع النسخة الجديدة من غير أي تعديل
-- تاني مطلوب منك.

-- ── للتراجع (لو احتجت ترجع للسلوك القديم بسرعة) ──
-- CREATE OR REPLACE FUNCTION public.current_tenant_id()
--  RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
-- AS $function$ select tenant_id from public.profiles where user_id = auth.uid() $function$;
