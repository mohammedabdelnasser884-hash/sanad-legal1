-- ══════════════════════════════════════════════════════
--  Migration: تصحيح صلاحيات Storage لرفع شعار المكتب
--  نفّذ هذا الملف في Supabase SQL Editor (مرة واحدة)
--
--  المشكلة:
--  رفع شعار المكتب كان بيستخدم مسار ثابت واحد لكل المكاتب
--  (office/logo.png). أول رفع كان "Insert" في storage.objects
--  وينجح، لكن أي رفع تاني (تغيير الشعار) بيتحول لـ "Update" على
--  نفس الصف، وده يحتاج RLS Policy من نوع UPDATE على bucket
--  client-docs — وهي غالبًا غير موجودة، فيظهر الخطأ:
--  "new row violates row-level security policy"
--
--  الحل في الكود (تم فعلاً):
--  المسار بقى office/<tenant_id>/logo.<ext> — يعني كل مكتب
--  له مساره الخاص، ومفيش تعارض بين المكاتب.
--
--  الحل هنا في قاعدة البيانات:
--  إضافة الصلاحيات الناقصة (INSERT + UPDATE + SELECT) على
--  storage.objects لبكت client-docs للمستخدمين المسجلين.
-- ══════════════════════════════════════════════════════

-- يمنع تكرار تنفيذ الملف من رمي error لو الـ policy موجودة بالفعل
DROP POLICY IF EXISTS "allow_authenticated_insert_client_docs" ON storage.objects;
DROP POLICY IF EXISTS "allow_authenticated_update_client_docs" ON storage.objects;
DROP POLICY IF EXISTS "allow_authenticated_select_client_docs" ON storage.objects;

-- اسمح بالرفع (INSERT) — أول مرة يترفع فيها ملف على مسار جديد
CREATE POLICY "allow_authenticated_insert_client_docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'client-docs');

-- اسمح بالتحديث (UPDATE) — لما يتم استبدال ملف موجود (upsert: true)
-- ده اللي كان ناقص وهو السبب الرئيسي لفشل رفع الشعار
CREATE POLICY "allow_authenticated_update_client_docs"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'client-docs')
WITH CHECK (bucket_id = 'client-docs');

-- اسمح بالقراءة (SELECT) — لازمة لو الباكت غير Public بالكامل
CREATE POLICY "allow_authenticated_select_client_docs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'client-docs');

-- ══════════════════════════════════════════════════════
--  ملاحظات بعد التنفيذ
-- ══════════════════════════════════════════════════════
--
--  1. تأكد إن bucket "client-docs" أصلاً موجود من:
--     Supabase Dashboard → Storage → Buckets
--
--  2. لو عندك شعارات قديمة مرفوعة على المسار القديم
--     (office/logo.png بدون tenant_id)، هي هتفضل موجودة على
--     Storage لكن مش هتُستخدم تلقائيًا بعد التعديل، لأن الكود
--     بقى بيقرا من office/<tenant_id>/logo.<ext>. لازم ترفع
--     الشعار تاني مرة واحدة من شاشة إعدادات المكتب بعد هذا
--     الـ migration عشان يتخزن على المسار الجديد الصحيح.
--
--  3. لو لسه ماشغّلتش multi-tenant-office-settings-migration.sql
--     قبل كده، شغّله الأول (أو في نفس الجلسة)، لأن منطق tenant_id
--     في الكود (office_settings) مبني عليه.
-- ══════════════════════════════════════════════════════
