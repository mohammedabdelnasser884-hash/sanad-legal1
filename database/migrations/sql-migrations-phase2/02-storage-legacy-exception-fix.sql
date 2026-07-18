-- ══════════════════════════════════════════════════════
--  Migration 2/4 (Phase 2): إزالة ثغرة "legacy" من سياسات
--  case-docs / client-docs + تحويل الباكتات لـ private
--
--  ⚠️ ملف حساس — نفّذه على خطوتين منفصلتين، ولازم تشوف نتيجة
--  الخطوة أ قبل ما تشغّل الخطوة ب. متشغّلش الملف كله دفعة واحدة
--  من غير ما تراجع.
-- ══════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────
--  خطوة أ) تشخيص — شغّلها الأول وابعتلي (أو راجع بنفسك) النتيجة
-- ────────────────────────────────────────────────────────

-- أ.1) كل الـ policies الحالية على storage.objects لباكتات case-docs/client-docs
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage'
  AND (qual::text ILIKE '%case-docs%' OR qual::text ILIKE '%client-docs%'
       OR with_check::text ILIKE '%case-docs%' OR with_check::text ILIKE '%client-docs%');

-- أ.2) كل الملفات اللي مسارها الأول مش UUID (يعني هتفلت من فحص tenant
-- الحالي بسبب استثناء الـ legacy) — دي لازم تترحّل قبل ما نشيل الاستثناء،
-- وإلا هتبقى غير قابلة للوصول فورًا (أو تتحول لعرضة لسياسة مرفوضة تمامًا)
SELECT bucket_id, name, created_at
FROM storage.objects
WHERE bucket_id IN ('case-docs', 'client-docs')
  AND (storage.foldername(name))[1] !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
ORDER BY created_at ASC;

-- أ.3) حالة الباكتات (public/private) حاليًا
SELECT id, name, public FROM storage.buckets WHERE id IN ('case-docs', 'client-docs');

-- ────────────────────────────────────────────────────────
--  خطوة ب) لو نتيجة أ.2 فاضية (مفيش ملفات legacy على الإطلاق) —
--  آمن تشغّل الجزء ده على طول. لو فيها صفوف، لازم أولاً تنقل كل
--  ملف من دول لمسار tenant_id/<اسم الملف> (نفس نمط الملفات
--  الحديثة)، وتحدّث عمود storage_path/file_url المقابل في
--  case_documents، قبل ما تشغّل الجزء ده.
-- ────────────────────────────────────────────────────────

-- ⚠️ استبدل أسماء الـ policies تحت بالأسماء الحقيقية اللي طلعت
-- معاك من أ.1 (دول أسماء تقريبية شائعة، مش مضمون تطابق مشروعك بالظبط)
-- DROP POLICY IF EXISTS "tenant_scoped_case_docs_select" ON storage.objects;
-- DROP POLICY IF EXISTS "tenant_scoped_case_docs_insert" ON storage.objects;
-- DROP POLICY IF EXISTS "tenant_scoped_case_docs_update" ON storage.objects;
-- DROP POLICY IF EXISTS "tenant_scoped_case_docs_delete" ON storage.objects;
-- DROP POLICY IF EXISTS "tenant_scoped_client_docs_select" ON storage.objects;
-- DROP POLICY IF EXISTS "tenant_scoped_client_docs_insert" ON storage.objects;
-- DROP POLICY IF EXISTS "tenant_scoped_client_docs_update" ON storage.objects;
-- DROP POLICY IF EXISTS "tenant_scoped_client_docs_delete" ON storage.objects;
--
-- ⚠️ ده بيشيل كمان الـ policies اللي أضافها logo-storage-rls-fix-migration.sql
-- (allow_authenticated_insert/update/select_client_docs) لأنها بتفحص
-- bucket_id بس من غير أي شرط tenant — دمج مع أي policy تانية تسمح بمرور
-- عابر للمكاتب، وهي بالفعل ثغرة إضافية لازم تتقفل مع نفس الإصلاح ده.
DROP POLICY IF EXISTS "allow_authenticated_insert_client_docs" ON storage.objects;
DROP POLICY IF EXISTS "allow_authenticated_update_client_docs" ON storage.objects;
DROP POLICY IF EXISTS "allow_authenticated_select_client_docs" ON storage.objects;

-- السياسة الصارمة الجديدة (بلا استثناء legacy): أول مجلد في المسار
-- لازم يساوي tenant المستخدم الحالي، أو يكون super_admin.
CREATE POLICY "tenant_scoped_case_client_docs_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id IN ('case-docs', 'client-docs')
  AND (
    (storage.foldername(name))[1] = current_tenant_id()::text
    OR is_super_admin()
  )
);

CREATE POLICY "tenant_scoped_case_client_docs_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('case-docs', 'client-docs')
  AND (
    (storage.foldername(name))[1] = current_tenant_id()::text
    OR is_super_admin()
  )
);

CREATE POLICY "tenant_scoped_case_client_docs_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id IN ('case-docs', 'client-docs')
  AND (
    (storage.foldername(name))[1] = current_tenant_id()::text
    OR is_super_admin()
  )
)
WITH CHECK (
  bucket_id IN ('case-docs', 'client-docs')
  AND (
    (storage.foldername(name))[1] = current_tenant_id()::text
    OR is_super_admin()
  )
);

CREATE POLICY "tenant_scoped_case_client_docs_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id IN ('case-docs', 'client-docs')
  AND (
    (storage.foldername(name))[1] = current_tenant_id()::text
    OR is_super_admin()
  )
);

-- ── تحويل الباكتات لـ private (خطوة منفصلة، اختيارية بس موصى بيها) ──
-- بعد ما تتأكد إن كل قراءة/تحميل ملف في الأبلكيشن بيمر عن طريق رابط
-- موقّع (signed URL) أو عن طريق عميل مسجّل دخول (مش رابط public مباشر)،
-- شغّل السطرين دول. لو فيه أي مكان في الكود بيستخدم الـ public URL
-- المباشر (getPublicUrl) لعرض الملفات، لازم تتحول لـ createSignedUrl أولاً
-- وإلا هتتكسر الروابط دي فورًا.
-- UPDATE storage.buckets SET public = false WHERE id = 'case-docs';
-- UPDATE storage.buckets SET public = false WHERE id = 'client-docs';

-- ── تأكيد بعد التنفيذ ──
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'objects' AND schemaname = 'storage'
--     AND (qual::text ILIKE '%case-docs%' OR qual::text ILIKE '%client-docs%');
-- لازم تشوف بالظبط الـ 4 سياسات الجديدة، ومفيش أي سياسة قديمة فيها
-- كلمة "legacy" أو شرط "NOT" على شكل الـ UUID.
