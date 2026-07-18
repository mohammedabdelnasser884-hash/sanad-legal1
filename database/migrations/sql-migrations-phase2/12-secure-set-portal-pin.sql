-- ══════════════════════════════════════════════════════════════
--  Migration 12 — تحصين set_portal_pin (لقطة أثناء فحص شامل للمشروع)
--
--  المشكلة: set_portal_pin بتقبل p_client_id من غير أي تحقق إن
--  العميل ده تابع فعلاً لمكتب المستخدم المستدعي، وكانت ممنوحة
--  EXECUTE لـ anon و PUBLIC كمان (مش بس authenticated). الدالة
--  نفسها SECURITY INVOKER (مش DEFINER)، فالحماية الفعلية كانت
--  معتمدة بالكامل على RLS جدول client_portal_pins — وهو أمر غير
--  مؤكد لأن الجدول مالوش عمود tenant_id ظاهر في عملية الكتابة.
--
--  الحل: تحقق صريح جوه الدالة نفسها (مش بالاعتماد على RLS وحده)
--  + قفل EXECUTE على authenticated بس.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_portal_pin(
  p_client_id uuid, p_pin text, p_is_active boolean,
  p_client_name text, p_email text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  -- ⚠️ الإضافة الجديدة: تأكد إن العميل ده تابع لمكتب المستخدم
  -- المستدعي (أو المستدعي سوبر أدمن)، قبل أي كتابة على الـ PIN.
  IF NOT EXISTS (
    SELECT 1 FROM clients
    WHERE id = p_client_id
      AND (tenant_id = current_tenant_id() OR is_super_admin())
  ) THEN
    RAISE EXCEPTION 'غير مصرح بتعديل بوابة عميل خارج مكتبك';
  END IF;

  IF p_pin IS NULL OR length(p_pin) <> 4 OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PIN يجب أن يكون 4 أرقام بالضبط';
  END IF;

  INSERT INTO client_portal_pins (client_id, pin_hash, is_active, client_name, email)
  VALUES (p_client_id, crypt(p_pin, gen_salt('bf')), p_is_active, p_client_name, p_email)
  ON CONFLICT (client_id) DO UPDATE
    SET pin_hash    = EXCLUDED.pin_hash,
        is_active   = EXCLUDED.is_active,
        client_name = EXCLUDED.client_name,
        email       = EXCLUDED.email;
END;
$function$;

-- ⚠️ ملاحظة مهمة: لاحظ إني ضفت SECURITY DEFINER هنا (مكنتش موجودة
-- أصلاً). ده ضروري عشان فحص "clients WHERE tenant_id = current_tenant_id()"
-- يشتغل صح بغض النظر عن صلاحيات المستدعي على جدول clients نفسه،
-- ولأن التحقق بقى جوه الدالة، مبقاش محتاجين نعتمد على RLS الجدول.

-- قفل التنفيذ على authenticated بس (شيل anon و PUBLIC)
REVOKE EXECUTE ON FUNCTION public.set_portal_pin(uuid, text, boolean, text, text)
  FROM anon, PUBLIC;

-- ── خطوة تأكيد بعد التنفيذ ──
--   SELECT grantee, privilege_type FROM information_schema.routine_privileges
--   WHERE routine_name = 'set_portal_pin';
-- المتوقع: authenticated و service_role و postgres بس (من غير anon/PUBLIC).
--
-- اختبر بعد كده: افتح لوحة الأدمن بحساب مكتب حقيقي وجرّب تحفظ PIN
-- لعميل تابع لمكتبك (المفروض يشتغل عادي)، ولو حابب تتأكد من التحصين
-- جرّب (من SQL Editor بس، مش من الواجهة) تنادي الدالة بـ client_id
-- تابع لمكتب تاني وشوف إنها بترفض برسالة "غير مصرح".
