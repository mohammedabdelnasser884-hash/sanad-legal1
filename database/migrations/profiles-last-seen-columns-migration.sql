-- ══════════════════════════════════════════════════════
--  Migration: أعمدة last_seen_* في جدول profiles
--
--  السبب: main.tsx (heartbeat) وuseAdminSessions.ts (لوحة الإدارة
--  → قسم "الجلسات النشطة") بيستخدموا 4 أعمدة على profiles مش موثّقة
--  في أي migration سابق في هذا المشروع:
--    last_seen_at, last_seen_browser, last_seen_device, last_seen_ip
--
--  لو الأعمدة دي أصلاً موجودة في القاعدة الحية (اتعملت يدويًا قبل
--  كده)، الأمر IF NOT EXISTS هيتجاهل الإضافة بأمان من غير أي خطأ.
--  لو مش موجودة، ده سبب حقيقي إن heartbeat بيفشل بصمت وقسم "الجلسات
--  النشطة" فاضل فاضي دايمًا من غير أي رسالة خطأ واضحة.
--
--  نفّذ هذا الملف في Supabase SQL Editor مرة واحدة.
-- ══════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_seen_at      timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_browser text,
  ADD COLUMN IF NOT EXISTS last_seen_device  text,
  ADD COLUMN IF NOT EXISTS last_seen_ip      text;

-- index للترتيب السريع في useAdminSessions.ts (.order('last_seen_at', ...))
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at ON profiles(last_seen_at DESC);
