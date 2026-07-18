-- ══════════════════════════════════════════════════════
--  Migration: عمود tenant_id في جدول activity_log
--
--  السبب: logActivity() في utils.ts بيكتب tenant_id مع كل سطر نشاط،
--  لكن CREATE TABLE activity_log الأصلية (admin-panel-migration.sql)
--  ماكانتش فيها العمود ده، ولا أي migration لاحق ضافه.
--
--  logActivity() مصممة عمدًا تبتلع أي خطأ (عشان تسجيل النشاط ميعطلش
--  العملية الأساسية زي إضافة قضية أو دفعة) — يعني لو العمود فعلاً
--  ناقص، سجل النشاط بالكامل ممكن يكون بيفشل بصمت من غير أي أثر ظاهر
--  غير إن قسم "سجل النشاط" في لوحة الإدارة فاضل فاضي دايمًا.
--
--  نفّذ هذا الملف في Supabase SQL Editor مرة واحدة.
-- ══════════════════════════════════════════════════════

ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activity_log_tenant_id ON activity_log(tenant_id);

-- ⚠️ ملحوظة: لو عندك أكتر من مكتب (tenant) على نفس المشروع، لازم كمان
-- تراجع سياسة RLS "admins_can_read_activity" (في admin-panel-migration.sql)
-- وتضيف فلترة بـ tenant_id، وإلا أي admin هيشوف نشاط كل المكاتب مش
-- مكتبه بس:
--
-- DROP POLICY IF EXISTS "admins_can_read_activity" ON activity_log;
-- CREATE POLICY "admins_can_read_activity"
--   ON activity_log FOR SELECT
--   TO authenticated
--   USING (
--     EXISTS (
--       SELECT 1 FROM profiles
--       WHERE profiles.user_id = auth.uid()
--         AND profiles.role = 'admin'
--         AND profiles.tenant_id = activity_log.tenant_id
--     )
--   );
