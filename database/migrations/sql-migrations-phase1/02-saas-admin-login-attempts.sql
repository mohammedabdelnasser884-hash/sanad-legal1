-- ══════════════════════════════════════════════════════
--  Migration 2/3: جدول محاولات دخول saas-admin (منع brute-force)
--  نفس نمط portal_pin_attempts المستخدم في client-portal-api
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS saas_admin_login_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address  text NOT NULL,
  success     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saas_admin_attempts_ip_time
  ON saas_admin_login_attempts(ip_address, created_at);

ALTER TABLE saas_admin_login_attempts ENABLE ROW LEVEL SECURITY;
-- عمدًا مفيش أي policy — يعني ممنوع الوصول تمامًا إلا من service_role.
