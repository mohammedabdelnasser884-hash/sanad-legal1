-- ══════════════════════════════════════════════════════
--  Migration: تحديثات صفحة تفاصيل القضية (واتساب + قاعة الجلسة + الكاتب)
--  نفّذ هذا الملف في Supabase SQL Editor
--  لو الأعمدة دي موجودة بالفعل، الأمر IF NOT EXISTS هيتجاهله بأمان
-- ══════════════════════════════════════════════════════

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS session_hall   text,
  ADD COLUMN IF NOT EXISTS secretary_hall text,
  ADD COLUMN IF NOT EXISTS secretary_name text;
