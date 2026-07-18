-- ══════════════════════════════════════════════════════
--  Migration: أعمدة الجلسات المستقلة في جدول case_sessions
--  نفّذ هذا الملف في Supabase SQL Editor مرة واحدة فقط
--  الأمر IF NOT EXISTS آمن — لو العمود موجود يتجاهله
-- ══════════════════════════════════════════════════════

ALTER TABLE case_sessions
  ADD COLUMN IF NOT EXISTS session_floor              text,
  ADD COLUMN IF NOT EXISTS title                      text,
  ADD COLUMN IF NOT EXISTS case_number                text,
  ADD COLUMN IF NOT EXISTS case_type                  text,
  ADD COLUMN IF NOT EXISTS plaintiff                  text,
  ADD COLUMN IF NOT EXISTS plaintiff_national_id      text,
  ADD COLUMN IF NOT EXISTS plaintiff_power_of_attorney text,
  ADD COLUMN IF NOT EXISTS defendant                  text,
  ADD COLUMN IF NOT EXISTS defendant_national_id      text;
