-- ══════════════════════════════════════════════════════════════
--  مراجعة أمان شاملة — 2026-07-11
--  شغّل الملف ده في Supabase SQL Editor (مرة واحدة).
-- ══════════════════════════════════════════════════════════════

-- ── 1) تثبيت search_path على كل دوال SECURITY DEFINER اللي كانت
--       عرضة لهجوم search_path hijacking (فحص pg_proc أثبت غيابه) ──
-- (get_my_role اتنفذت بالفعل أثناء المراجعة، معادة هنا للتوثيق فقط)
ALTER FUNCTION public.get_my_role()          SET search_path TO 'public';
ALTER FUNCTION public.get_overdue_sessions() SET search_path TO 'public';
ALTER FUNCTION public.log_activity()         SET search_path TO 'public';
ALTER FUNCTION public.notify_telegram_message() SET search_path TO 'public';
ALTER FUNCTION public.verify_client_pin(p_email text, p_pin text) SET search_path TO 'public';

-- ── 2) إغلاق باكتس Storage اللي كانت public بالكامل ──
-- ⚠️ قبل التنفيذ: تأكد إنك نقلت أي ملفات في جذر الباكت (بدون فولدر
-- tenant_id) لفولدرها الصحيح من Supabase Dashboard → Storage، وإلا
-- هتبقى غير متاحة لصاحبها الشرعي بعد الإغلاق. راجع الملفات دي يدويًا:
--   case-docs:   archive_1780791572944.doc
--   client-docs: id_1780785145413.jpg , poa_1780785146732.jpg
-- (الأربع ملفات تحت office/... مش مشكلة — دي شعارات مكاتب، انقلها
--  لفولدر tenant_id بتاعها بنفس الطريقة لو حابب، أو سيبها زي ما هي
--  لحد ما تُستبدل بشعار جديد من الإعدادات.)
update storage.buckets set public = false where id in ('case-docs', 'client-docs');

-- legal-library كانت بالفعل private — من غير تغيير، للتأكيد فقط.
