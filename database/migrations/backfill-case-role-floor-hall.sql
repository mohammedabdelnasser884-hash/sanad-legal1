-- ══════════════════════════════════════════════════════
--  Migration: استعادة صفة الموكل/الخصم + الدور والقاعة
--  للقضايا اللي اتعملت بالفعل من "إنشاء ملف قضية" من جلسة
--  مستقلة، قبل إصلاح الكود في useClientLinking.ts /
--  useSessionLinking.ts.
--
--  السبب: قبل الإصلاح، كان إنشاء ملف القضية من الجلسة
--  المستقلة مش بينقل plaintiff_role/defendant_role/
--  session_floor(→court_floor)/session_hall من الجلسة
--  الأصلية. البيانات دي لسه موجودة وسليمة في case_sessions
--  (اللي مرتبطة بالقضية عن طريق case_id)، فالميجريشن ده
--  بيرجعها للقضية من غير ما يلمس أي بيانات كتبها المستخدم
--  يدويًا بعد كده (بيحدّث بس لو عمود القضية لسه NULL).
--
--  نفّذ هذا الملف في Supabase SQL Editor مرة واحدة فقط
-- ══════════════════════════════════════════════════════

UPDATE cases c
SET
  plaintiff_role = COALESCE(c.plaintiff_role, cs.plaintiff_role),
  defendant_role  = COALESCE(c.defendant_role, cs.defendant_role),
  court_floor     = COALESCE(c.court_floor, cs.session_floor),
  session_hall    = COALESCE(c.session_hall, cs.session_hall)
FROM case_sessions cs
WHERE cs.case_id = c.id
  AND (
    (c.plaintiff_role IS NULL AND cs.plaintiff_role IS NOT NULL) OR
    (c.defendant_role IS NULL AND cs.defendant_role IS NOT NULL) OR
    (c.court_floor IS NULL AND cs.session_floor IS NOT NULL) OR
    (c.session_hall IS NULL AND cs.session_hall IS NOT NULL)
  );
