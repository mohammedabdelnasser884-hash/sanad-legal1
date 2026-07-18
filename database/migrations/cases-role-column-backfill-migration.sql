-- ══════════════════════════════════════════════════════
--  Migration: توحيد "الصفة" في جدول cases مع plaintiff_role/defendant_role
--
--  السبب: EditCaseModal.tsx / CaseDetailView.tsx / InfoSection.tsx / PDF
--  export كانوا بيخزّنوا الصفة جوه نص plaintiff/defendant نفسه بصيغة
--  "الاسم (الصفة)" ويستخرجوها بـ regex وقت العرض، رغم إن جدول cases عنده
--  عمودين مخصصين plaintiff_role و defendant_role (نفس العمودين اللي
--  case_sessions شغالة بيهم أصلاً للجلسات المستقلة). تم إصلاح الكود
--  بحيث يقرا/يكتب من العمودين المخصصين مباشرة من الآن فصاعدًا.
--
--  ⚠️ تحذير مهم قبل التنفيذ: الموكلين ممكن يكونوا شركات (النظام بيدعم
--  نوع "company")، وأسماء الشركات المصرية غالبًا بتنتهي بصيغة زي
--  "(ش.م.م)" أو "(ذ.م.م)" — دي جزء من اسم الشركة نفسه، مش صفة قانونية.
--  استخراج أي حاجة بين قوسين بعمى (بدون تصفية) كان هيمسح الجزء ده من
--  اسم الشركة نهائيًا ويحطه غلط في عمود الصفة. عشان كده الـ UPDATE تحت
--  مقيّد بقائمة كلمات الصفات القانونية المعروفة بس (مدعي، مدعى عليه،
--  مستأنف، طاعن، متهم... إلخ) — أي قوسين تانيين (زي صيغ الشركات) هيتسيبوا
--  زي ما هما من غير تعديل.
--
--  خطوات التنفيذ (بالترتيب، في Supabase SQL Editor):
--    1) شغّل استعلام المعاينة (PREVIEW) تحت وشوف النتيجة بعينك كويس.
--    2) لو مرتاح للنتيجة، شغّل UPDATE الموكل، بعدين UPDATE الخصم.
--    3) شغّل استعلام "المتبقي" في الآخر — أي صف فيه لسه قوسين معناه إن
--       الصفة فيه معرفتش تتستخرج تلقائيًا (زي حالة الشركات)، ولازم
--       تتعدّل يدويًا من شاشة "تعديل القضية" (اللي بقت بتحفظ صح دلوقتي).
-- ══════════════════════════════════════════════════════

-- ── (1) معاينة قبل أي تعديل — نفّذها الأول وراجعها بعينك ──
SELECT id, plaintiff AS current_plaintiff,
       trim(substring(plaintiff FROM '\(([^)]+)\)\s*$')) AS would_extract_role
FROM cases
WHERE plaintiff_role IS NULL
  AND plaintiff ~ '\([^)]+\)\s*$'
  AND trim(substring(plaintiff FROM '\(([^)]+)\)\s*$'))
      ~* '(مدعي|مدعى عليه|مستأنف|طاعن|مطعون ضده|متهم|مجني عليه|محكوم عليه|خصم|مدين|دائن|موكل|وكيل|طالب|مطلوب ضده|منفذ ضده)';

SELECT id, defendant AS current_defendant,
       trim(substring(defendant FROM '\(([^)]+)\)\s*$')) AS would_extract_role
FROM cases
WHERE defendant_role IS NULL
  AND defendant ~ '\([^)]+\)\s*$'
  AND trim(substring(defendant FROM '\(([^)]+)\)\s*$'))
      ~* '(مدعي|مدعى عليه|مستأنف|طاعن|مطعون ضده|متهم|مجني عليه|محكوم عليه|خصم|مدين|دائن|موكل|وكيل|طالب|مطلوب ضده|منفذ ضده)';

-- ── (2) استخراج صفة الموكل (plaintiff) — مقيّد بقائمة الكلمات فوق ──
UPDATE cases
SET
    plaintiff_role = trim(substring(plaintiff FROM '\(([^)]+)\)\s*$')),
    plaintiff = trim(regexp_replace(plaintiff, '\s*\([^)]+\)\s*$', ''))
WHERE plaintiff_role IS NULL
  AND plaintiff ~ '\([^)]+\)\s*$'
  AND trim(substring(plaintiff FROM '\(([^)]+)\)\s*$'))
      ~* '(مدعي|مدعى عليه|مستأنف|طاعن|مطعون ضده|متهم|مجني عليه|محكوم عليه|خصم|مدين|دائن|موكل|وكيل|طالب|مطلوب ضده|منفذ ضده)';

-- ── (3) استخراج صفة الخصم (defendant) — نفس القيد ──
UPDATE cases
SET
    defendant_role = trim(substring(defendant FROM '\(([^)]+)\)\s*$')),
    defendant = trim(regexp_replace(defendant, '\s*\([^)]+\)\s*$', ''))
WHERE defendant_role IS NULL
  AND defendant IS NOT NULL
  AND defendant ~ '\([^)]+\)\s*$'
  AND trim(substring(defendant FROM '\(([^)]+)\)\s*$'))
      ~* '(مدعي|مدعى عليه|مستأنف|طاعن|مطعون ضده|متهم|مجني عليه|محكوم عليه|خصم|مدين|دائن|موكل|وكيل|طالب|مطلوب ضده|منفذ ضده)';

-- ── (4) الصفوف "المتبقية" اللي لسه فيها قوسين ولم تتحدث تلقائيًا ──
-- دي غالبًا شركات (ش.م.م / ذ.م.م) أو صفة بكلمة مش في القائمة فوق —
-- افتحها واحدة واحدة من "تعديل القضية" وسجّل الصفة يدويًا (هتتحفظ صح
-- في عمودها الصحيح من غير ما تلمس اسم الشركة).
SELECT id, title, plaintiff, defendant
FROM cases
WHERE (plaintiff_role IS NULL AND plaintiff ~ '\([^)]+\)\s*$')
   OR (defendant_role IS NULL AND defendant ~ '\([^)]+\)\s*$');
