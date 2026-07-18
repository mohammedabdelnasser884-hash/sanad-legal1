-- ══════════════════════════════════════════════════════
--  Migration 4/4 (Phase 2): جدول محاولات دخول المحامي/الأدمن
--  العادي (منع brute-force) — نفس نمط saas_admin_login_attempts
--  و portal_pin_attempts الموجودين بالفعل في المشروع.
--
--  السياق: بوابتي السوبر أدمن والموكل عندهم حماية brute-force
--  كاملة. بوابة المحامي/الأدمن العادي (LoginScreen.tsx عن طريق
--  Supabase Auth مباشرة) كانت الوحيدة من غيرها. الجدول ده بيُستخدم
--  من إيدج فانكشن جديدة اسمها office-login (شوفها في نفس التسليم).
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS office_login_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  ip_address  text NOT NULL,
  success     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_login_attempts_email_time
  ON office_login_attempts(email, created_at);

CREATE INDEX IF NOT EXISTS idx_office_login_attempts_ip_time
  ON office_login_attempts(ip_address, created_at);

ALTER TABLE office_login_attempts ENABLE ROW LEVEL SECURITY;
-- عمدًا مفيش أي policy — يعني ممنوع الوصول تمامًا إلا من service_role
-- (الفانكشن office-login هي الوحيدة اللي بتكتب/تقرأ الجدول ده).

-- ── تنظيف دوري (اختياري لكن موصى بيه) ──
-- زي "cleanup-portal-pin-attempts" الموجود بالفعل في pg_cron عندك،
-- تقدر تضيف جوب مشابه يمسح الصفوف الأقدم من أسبوع مثلًا:
--   SELECT cron.schedule(
--     'cleanup-office-login-attempts',
--     '0 4 * * *',
--     $$DELETE FROM office_login_attempts WHERE created_at < now() - interval '7 days'$$
--   );
-- ده اختياري بحت — الجدول مش هيكبر بسرعة، وده تحسين مش إصلاح أمان.
