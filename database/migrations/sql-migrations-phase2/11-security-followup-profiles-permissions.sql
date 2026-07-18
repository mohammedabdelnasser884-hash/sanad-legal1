-- ══════════════════════════════════════════════════════════════
--  Migration 11 (توثيقي/متابعة) — مراجعة أمان 2026-07-11
--
--  ⚠️ ملاحظة مهمة: البنود التلاتة دول (8، 9، 12.1، 12.2، 12.3 في
--  تقرير المراجعة) اتنفذوا فعليًا على قاعدة الإنتاج وقت المراجعة،
--  لكن محدش سجّلهم كملف migration في الريبو. الملف ده لتوثيق
--  الإصلاحات دي في الكود المصدري فقط — لو شغّلته على قاعدة فيها
--  الإصلاحات دي بالفعل، معظم الأوامر safe للتكرار (idempotent)،
--  ما عدا الأجزاء اللي محتاجة تدخل يدوي (موضّحة تحت).
-- ══════════════════════════════════════════════════════════════


-- ── 1) بند 8: قفل تصعيد الصلاحيات عبر profiles insert ──
-- المشكلة كانت: أي أدمن مكتب عادي يقدر يضيف صف profiles جديد لنفسه
-- بـ is_super_admin = true ويسيطر على المنصة بالكامل.

-- منع تكرار صف profile لنفس المستخدم نهائيًا
-- (DO block بدل ALTER مباشر عشان ما يوقفش لو الـ constraint موجود
-- بالفعل من تنفيذ سابق — زي ما ظهر عندك دلوقتي)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_user_id_key'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- قفل الإضافة المباشرة على super admin فقط
-- (كل إنشاء حسابات فعلي يمر عبر admin-actions بصلاحية service_role)
drop policy if exists "profiles_insert" on profiles;
drop policy if exists "profiles_insert_super_admin_only" on profiles;
create policy "profiles_insert_super_admin_only" on profiles
  for insert
  with check (is_super_admin());

-- ── خطوة تأكيد ──
--   select policyname, cmd, with_check from pg_policies
--   where tablename = 'profiles' and cmd = 'INSERT';
-- المتوقع: سياسة واحدة بس هي "profiles_insert_super_admin_only".


-- ── 2) بند 12.1: منع تسريب جلسات كل المكاتب عبر get_overdue_sessions ──
-- الدالة كانت SECURITY DEFINER بترجع بيانات قضايا حساسة من كل
-- المكاتب بدون فلترة tenant_id، وممنوحة لـ anon/authenticated.
-- كود ميت (مش مستخدمة في أي مكان بالفرونت إند)، فالحل قفلها.
revoke execute on function public.get_overdue_sessions() from anon, authenticated, public;


-- ── 3) بند 12.2: منع التلاعب بعداد فواتير مكتب تاني ──
-- generate_invoice_number كانت بتقبل p_tenant_id من غير تحقق إن
-- المستخدم المستدعي فعلاً من نفس المكتب ده. التعريف الأصلي
-- اتاخد حرفيًا من sql-migrations-phase2/06b-create-new-invoices.sql
-- (سطر 38-59) وضيف عليه بس فحص واحد جديد بعد BEGIN مباشرة —
-- الباقي من غير أي تغيير.
CREATE OR REPLACE FUNCTION generate_invoice_number(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prefix text;
    v_counter integer;
BEGIN
    -- ⚠️ الإضافة الجديدة (بند 12.2): امنع أي مستخدم من زيادة عداد
    -- فواتير مكتب غير مكتبه، إلا لو سوبر أدمن.
    IF p_tenant_id IS DISTINCT FROM current_tenant_id() AND NOT is_super_admin() THEN
        RAISE EXCEPTION 'غير مصرح بإنشاء رقم فاتورة لمكتب آخر';
    END IF;

    UPDATE office_settings
        SET invoice_counter = invoice_counter + 1
        WHERE tenant_id = p_tenant_id
        RETURNING invoice_counter, COALESCE(NULLIF(invoice_prefix, ''), 'INV') INTO v_counter, v_prefix;

    IF v_counter IS NULL THEN
        RAISE EXCEPTION 'No office_settings row found for tenant %', p_tenant_id;
    END IF;

    RETURN v_prefix || '-' || to_char(now(), 'YYYY') || '-' || lpad(v_counter::text, 4, '0');
END;
$$;

-- ── خطوة تأكيد ──
--   select routine_definition from information_schema.routines
--   where routine_name = 'generate_invoice_number';
-- تأكد إن الشرط الجديد ظاهر أول حاجة جوه BEGIN.


-- ── 4) بند 12.3: تنظيف صلاحيات دوال الـ trigger ──
-- log_activity() و notify_telegram_message() من نوع RETURNS trigger
-- ومش المفروض تتنادى مباشرة، لكن كانت ممنوحة EXECUTE لـ anon/
-- authenticated بلا داعٍ عملي (تقليل سطح الهجوم).
revoke execute on function public.log_activity() from anon, authenticated, public;
revoke execute on function public.notify_telegram_message() from anon, authenticated, public;


-- ── 5) بند 9: أسرار cron.job (service_role key + cron secret) في Vault ──
-- ⚠️ الجزء ده مش تلقائي — استبدل القيم الفعلية بدل placeholders
-- قبل التنفيذ، ولازم service_role key الحالي (لسه معلّق تدويره،
-- راجع القسم "بنود متبقية" في التقرير).
--
-- select vault.create_secret('<service_role_key>', 'cron_service_role_key');
-- select vault.create_secret('<cron_secret>', 'session_alerts_cron_secret_value');
--
-- select cron.alter_job(job_id := 12, command := $cmd$
--   select net.http_post(
--     url := 'https://<project-ref>.supabase.co/functions/v1/session-alerts',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key'),
--       'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'session_alerts_cron_secret_value')
--     ),
--     body := '{"type":"morning"}'::jsonb
--   );
-- $cmd$);
-- -- ونفس التعديل لـ job_id := 9 (evening-alerts)
--
-- ── خطوة تأكيد ──
--   select jobid, jobname, command from cron.job;
-- تأكد إن عمود command ما فيهوش أي نص صريح للمفتاح أو السر.
