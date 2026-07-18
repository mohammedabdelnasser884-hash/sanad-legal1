-- ══════════════════════════════════════════════════════
--  Migration: استكمال أعمدة الجلسة المستقلة
--  (الدائرة + صفة الموكل + صفة الخصم)
--
--  السبب: واجهة الجلسة المستقلة (إضافة/تعديل) فيها حقول
--  "الدائرة"، "صفة الموكل"، "صفة الخصم" — بس الأعمدة دي
--  مكانت مش موجودة في جدول case_sessions، فالبيانات كانت
--  بتُكتب في الفورم وتضيع وقت الحفظ من غير أي رسالة خطأ.
--
--  نفّذ هذا الملف في Supabase SQL Editor مرة واحدة فقط
--  الأمر IF NOT EXISTS آمن — لو العمود موجود يتجاهله
-- ══════════════════════════════════════════════════════

ALTER TABLE case_sessions
  ADD COLUMN IF NOT EXISTS circuit_number  text,
  ADD COLUMN IF NOT EXISTS plaintiff_role  text,
  ADD COLUMN IF NOT EXISTS defendant_role  text;
