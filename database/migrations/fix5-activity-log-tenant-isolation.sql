-- ══════════════════════════════════════════════════════
--  Migration: عزل activity_log بين المكاتب (tenants) — نسخة كاملة
--
--  ده استكمال لملف activity-log-tenant-id-migration.sql الأصلي.
--  السياسة المقترحة هناك (كتعليق) كانت ناقصة حالتين:
--   1) حسابات is_super_admin هتفقد الرؤية بالكامل (مقارنة NULL بتفشل دايمًا)
--   2) السجلات القديمة (قبل إضافة العمود) هتبقى NULL وتختفي من عرض
--      الأدمن العادي فجأة، حتى لو المكتب نفسه واحد بس
--
--  آمن يتنفذ حتى لو عندك مكتب واحد بس دلوقتي — مفيش أي تأثير عملي
--  ظاهر ليك إلا إنه بيقفل ثغرة نظرية قبل ما تفتحوا مكتب تاني.
--
--  نفّذه في Supabase SQL Editor، خطوة خطوة أو كامل مرة واحدة.
-- ══════════════════════════════════════════════════════

-- 1) تأكيد وجود العمود والـ index (آمن لو اتنفذوا قبل كده، IF NOT EXISTS)
ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activity_log_tenant_id ON activity_log(tenant_id);


-- 2) فحص أولاً — قبل أي تعديل: كام مكتب فعليًا موجود، وكام سطر NULL؟
--    شغّل السطرين دول لوحدهم الأول وشوف النتيجة قبل ما تكمل للخطوة 3.
--    لو عدد المكاتب أكتر من 1، متكملش على الـ backfill التلقائي تحت —
--    ده مصمم لحالة "مكتب واحد بس" اللي إنت مؤكدها دلوقتي.
SELECT count(*) AS tenants_count FROM tenants;
SELECT count(*) AS null_activity_rows FROM activity_log WHERE tenant_id IS NULL;


-- 3) Backfill — تعبئة السجلات القديمة بمعرّف المكتب الوحيد الموجود
--    (آمن فقط لو تأكدت من نتيجة الخطوة 2 إن tenants_count = 1)
UPDATE activity_log
SET tenant_id = (SELECT id FROM tenants LIMIT 1)
WHERE tenant_id IS NULL;


-- 4) السياسة المُصححة — بتراعي is_super_admin كمان، مش بس تطابق tenant_id
DROP POLICY IF EXISTS "admins_can_read_activity" ON activity_log;

CREATE POLICY "admins_can_read_activity"
  ON activity_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'admin'
        AND (
          profiles.is_super_admin = true            -- سوبر أدمن: يشوف كل المكاتب (زي ما كان قبل الإصلاح)
          OR profiles.tenant_id = activity_log.tenant_id  -- أدمن عادي: مكتبه بس
        )
    )
  );


-- 5) تحقق نهائي بعد التنفيذ — المفروض ترجع صفر
SELECT count(*) AS remaining_null_rows FROM activity_log WHERE tenant_id IS NULL;
