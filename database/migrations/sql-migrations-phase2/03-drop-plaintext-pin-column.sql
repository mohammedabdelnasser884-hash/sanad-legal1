-- ══════════════════════════════════════════════════════
--  Migration 3/4 (Phase 2): حذف عمود client_portal_pins.pin
--  (النص الصريح القديم) نهائيًا
--
--  السياق: pin-hash-migration.sql (منفّذ من قبل) حوّل التحقق كله
--  لـ pin_hash (bcrypt) عن طريق set_portal_pin()/verify_portal_pin(),
--  وترك عمود pin القديم موجود عمدًا "لحد ما نتأكد إن كل حاجة شغالة".
--  التقرير أكّد إن العمود لسه موجود فعليًا في القاعدة — الوقت
--  حان لحذفه.
-- ══════════════════════════════════════════════════════

-- ── خطوة تحقق قبل الحذف (لازم تشغّلها وتتأكد من النتيجة) ──
-- تأكد إن كل الصفوف عندها pin_hash فعلاً (يعني محتاجة صفر صفوف بالاستعلام ده)
SELECT count(*) AS rows_missing_hash
FROM client_portal_pins
WHERE pin_hash IS NULL;

-- لو النتيجة 0 → آمن تكمل. لو مش صفر، فيه صفوف اتضافت بعد
-- pin-hash-migration.sql من غير ما يتعمل لها backfill (مثلاً لو
-- set_portal_pin() اتحاوز/حصل insert مباشر تاني). في الحالة دي:
--   UPDATE client_portal_pins
--   SET pin_hash = crypt(pin, gen_salt('bf'))
--   WHERE pin IS NOT NULL AND pin_hash IS NULL;
-- وبعدين أعد تشغيل استعلام التحقق فوق لحد ما ترجع 0.

ALTER TABLE client_portal_pins DROP COLUMN pin;

-- ── تأكيد بعد التنفيذ ──
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'client_portal_pins';
-- تأكد إن عمود "pin" اختفى، وإن "pin_hash" موجود.
--
-- اختبر فعليًا بعدها: افتح بوابة الموكل وجرب تسجل دخول بـ PIN
-- موكل حقيقي (اللي كان شغال قبل الحذف) وتأكد إنه لسه بينجح.
