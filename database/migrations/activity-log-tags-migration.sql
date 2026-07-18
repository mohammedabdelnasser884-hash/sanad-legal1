-- ══════════════════════════════════════════════════════
--  Migration: شارات سجل النشاط (Activity Log Tags)
--  نفّذ هذا الملف في Supabase SQL Editor بعد admin-panel-migration.sql
-- ══════════════════════════════════════════════════════
--
--  ليه الميجريشن دي؟
--  واجهة "سجل النشاط" في لوحة الإدارة بترسم شارات ملوّنة تحت كل سجل
--  (👥 اسم الموكل، 📁 اسم القضية، ⚖️ نوع القضية) لو الأعمدة دي موجودة.
--  الأعمدة دي مكانتش في الميجريشن الأصلية، فالشارات كانت مش بتظهر —
--  هذا الملف يضيفها فقط، بدون أي تأثير على الصفوف القديمة (هتفضل NULL).

ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS case_name   text,
  ADD COLUMN IF NOT EXISTS case_type   text;

-- ملحوظة: لا حاجة لتعديل RLS — السياسات الموجودة على مستوى الجدول
-- (admins_can_read_activity / authenticated_can_insert_activity) تغطي
-- الأعمدة الجديدة تلقائيًا.
