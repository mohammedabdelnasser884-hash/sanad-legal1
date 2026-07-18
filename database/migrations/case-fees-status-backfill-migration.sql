-- ══════════════════════════════════════════════════════
--  Migration: تصحيح status القديمة في case_fees (مرة واحدة)
--
--  السبب: كود الواجهة كان بيحدّث paid_fees مع كل دفعة، لكن عمود
--  status كان بيفضل زي ما هو من ساعة الإنشاء (اعتمادًا على الـ
--  DEFAULT بتاع القاعدة فقط) — تم إصلاح هذا في الكود (useFeesActions.ts)
--  بحيث يكتب status صراحةً مع كل عملية جديدة من الآن فصاعدًا.
--
--  لكن أي صف قديم موجود بالفعل قبل هذا الإصلاح يحتاج تصحيح يدوي
--  لمرة واحدة هنا، بنفس منطق computeFeeStatus في الكود:
--    total <= 0        → 'open'
--    paid  >= total     → 'collected'
--    غير كده            → 'deferred'
--
--  نفّذ هذا الملف في Supabase SQL Editor مرة واحدة فقط بعد نشر
--  إصلاح الكود.
-- ══════════════════════════════════════════════════════

UPDATE case_fees
SET status = CASE
    WHEN COALESCE(total_fees, 0) <= 0 THEN 'open'
    WHEN COALESCE(paid_fees, 0) >= COALESCE(total_fees, 0) THEN 'collected'
    ELSE 'deferred'
END
WHERE status IS DISTINCT FROM (
    CASE
        WHEN COALESCE(total_fees, 0) <= 0 THEN 'open'
        WHEN COALESCE(paid_fees, 0) >= COALESCE(total_fees, 0) THEN 'collected'
        ELSE 'deferred'
    END
);

-- ── تحقق بعد التنفيذ (اختياري) ──
-- شغّل الاستعلام ده للتأكد إن مفيش صفوف متضاربة بعد كده:
-- SELECT id, total_fees, paid_fees, status FROM case_fees
-- WHERE (status = 'collected' AND paid_fees < total_fees)
--    OR (status != 'collected' AND paid_fees >= total_fees AND total_fees > 0);
