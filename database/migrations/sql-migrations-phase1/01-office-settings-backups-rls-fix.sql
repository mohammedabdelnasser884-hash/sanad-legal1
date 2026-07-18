-- ══════════════════════════════════════════════════════
--  Migration 1/3: إصلاح صلاحيات office_settings و backups
--  اكتُشفت هذه الثغرات أثناء فحص RLS الفعلي على قاعدة البيانات
--  الحية (Phase 0 من خطة التنفيذ) — نفّذ هذا الملف في Supabase
--  SQL Editor مرة واحدة، بالكامل، بنفس الترتيب.
-- ══════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────
-- ١) office_settings: حذف الـ policies القديمة اللي بتلغي
--    شرط "أدمن بس" في الـ policies الجديدة (INSERT/UPDATE)
--
--    المشكلة: policies من نوع PERMISSIVE بتتجمع بـ OR في بوستجرس.
--    وجود tenant_insert_own_office_settings (بدون شرط دور) جنب
--    office_settings_insert (بشرط admin) كان معناه عمليًا إن أي
--    مستخدم في المكتب (مش بس الأدمن) يقدر يعدّل إعدادات حساسة
--    زي groq_key وتوكن تيليجرام والبيانات البنكية.
-- ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tenant_insert_own_office_settings ON office_settings;
DROP POLICY IF EXISTS tenant_update_own_office_settings ON office_settings;
DROP POLICY IF EXISTS tenant_select_own_office_settings ON office_settings;

-- تأكيد: بعد الحذف، لازم يفضل بالظبط 4 policies على office_settings
-- (select / insert / update / delete) كلهم بشرط admin أو super_admin.
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'office_settings';

-- ────────────────────────────────────────────────────────
-- ٢) backups: تغيير النطاق من "المنشئ نفسه فقط" لـ "أي أدمن
--    في نفس المكتب" — عشان لو الأدمن اللي عمل النسخة مش موجود،
--    باقي أدمنز المكتب يقدروا يوصلوا لها.
-- ────────────────────────────────────────────────────────

ALTER TABLE backups
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;

UPDATE backups b
SET tenant_id = p.tenant_id
FROM profiles p
WHERE b.created_by = p.user_id
AND b.tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_backups_tenant_id ON backups(tenant_id);

DROP TRIGGER IF EXISTS trg_tenant_id_backups ON backups;
CREATE TRIGGER trg_tenant_id_backups
  BEFORE INSERT ON backups
  FOR EACH ROW
  EXECUTE FUNCTION set_tenant_id_from_profile();

DROP POLICY IF EXISTS tenant_scoped_backups ON backups;
CREATE POLICY tenant_scoped_backups ON backups
  FOR ALL
  USING (
    (get_my_role() = 'admin' AND tenant_id = current_tenant_id())
    OR is_super_admin()
  )
  WITH CHECK (
    (get_my_role() = 'admin' AND tenant_id = current_tenant_id())
    OR is_super_admin()
  );

-- تأكيد بعد التنفيذ:
--   SELECT policyname, qual, with_check FROM pg_policies WHERE tablename = 'backups';
