-- ══════════════════════════════════════════════════════
--  Migration: عزل office_settings بين المكاتب (Multi-tenancy)
--  نفّذ هذا الملف في Supabase SQL Editor
--
--  المشكلة قبل هذا الملف:
--  جدول office_settings كان صف واحد عام (الكود بيعمل
--  .limit(1).single() بدون فلترة tenant_id) — يعني لو فيه أكتر من
--  مكتب على نفس المشروع، كل المكاتب كانوا فعليًا بيشتركوا في نفس
--  الصف: مفتاح Groq، توكن تيليجرام، اسم المكتب، الشعار، البنك،
--  الرقم الضريبي... إلخ. أي مكتب يحفظ إعداداته كان عمليًا بيبدّل
--  إعدادات كل المكاتب التانية.
--
--  الحل:
--  1. إضافة عمود tenant_id لجدول office_settings (لو غير موجود).
--  2. ربط كل صف موجود حاليًا (لو فيه صف "تايه" من قبل) بأول tenant
--     موجود — حل وسط مؤقت لتفادي كسر بيانات قائمة؛ راجع التعليق
--     تحت قبل التنفيذ في بيئة فيها أكتر من مكتب فعلي.
--  3. UNIQUE(tenant_id) — يمنع وجود أكتر من صف إعدادات لنفس المكتب.
--  4. RLS تفلتر تلقائيًا بـ tenant_id المستخدم الحالي (من profiles)
--     — طبقة حماية حقيقية مش بس اعتماد على فلترة الكود.
-- ══════════════════════════════════════════════════════

-- 1. إضافة عمود tenant_id (لو الجدول موجود من قبل بدون العمود ده)
ALTER TABLE office_settings
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;

-- ⚠️ خطوة يدوية مطلوبة فقط لو كان فيه أكتر من مكتب فعلي قبل هذا الـ
-- migration وكانوا بيشتركوا في صف واحد: لازم تحدد بنفسك أي tenant_id
-- يخص كل صف قبل ما تفعّل NOT NULL والـ UNIQUE تحت، وتعمل نسخ يدوي
-- للصفوف الناقصة لباقي المكاتب. السطر التالي بيربط أي صف بدون
-- tenant_id بأول مكتب موجود (مناسب فقط لو كان عندك مكتب واحد فعلي
-- فعليًا يستخدم النظام لحد دلوقتي):
UPDATE office_settings
SET tenant_id = (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1)
WHERE tenant_id IS NULL;

-- 2. منع تكرار صف إعدادات لنفس المكتب
DROP INDEX IF EXISTS idx_office_settings_tenant_unique;
CREATE UNIQUE INDEX idx_office_settings_tenant_unique
  ON office_settings(tenant_id)
  WHERE tenant_id IS NOT NULL;

-- 3. RLS: كل مكتب يشوف ويعدّل صف إعداداته فقط
ALTER TABLE office_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_own_office_settings" ON office_settings;
CREATE POLICY "tenant_select_own_office_settings"
  ON office_settings FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT p.tenant_id FROM profiles p WHERE p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "tenant_insert_own_office_settings" ON office_settings;
CREATE POLICY "tenant_insert_own_office_settings"
  ON office_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (SELECT p.tenant_id FROM profiles p WHERE p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "tenant_update_own_office_settings" ON office_settings;
CREATE POLICY "tenant_update_own_office_settings"
  ON office_settings FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (SELECT p.tenant_id FROM profiles p WHERE p.user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id = (SELECT p.tenant_id FROM profiles p WHERE p.user_id = auth.uid())
  );

-- ══════════════════════════════════════════════════════
--  ملاحظات التشغيل
-- ══════════════════════════════════════════════════════
--
--  بعد تنفيذ هذا الملف:
--  1. تأكد إن كل صف في office_settings عنده tenant_id صحيح (شغّل:
--     SELECT id, tenant_id FROM office_settings; وراجعها يدويًا).
--  2. لو عندك أكتر من مكتب فعلي وكل المكاتب كانت بتشترك في صف واحد
--     قبل كده، لازم تنشئ صف office_settings مستقل لكل مكتب (الكود
--     في saas-admin/index.ts اتعدّل عشان ينشئ صف افتراضي تلقائيًا
--     لأي مكتب جديد بعد دلوقتي، لكن المكاتب القديمة محتاجة صف يدوي).
--  3. الكود في constants.ts و useAdminOffice.ts و useAIAssistant.ts
--     و ai-chat/index.ts اتعدّل عشان يبعت/يفلتر بـ tenant_id دايمًا.
-- ══════════════════════════════════════════════════════
