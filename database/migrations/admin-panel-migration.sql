-- ══════════════════════════════════════════════════════
--  Migration: Admin Panel — لوحة الإدارة
--  نفّذ هذا الملف في Supabase SQL Editor
-- ══════════════════════════════════════════════════════

-- 1. أضف أعمدة جديدة لجدول profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_active   boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS permissions jsonb    DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_login  timestamptz;

-- 2. جدول سجل النشاط (activity_log)
CREATE TABLE IF NOT EXISTS activity_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name   text,
  action      text NOT NULL,
  details     text,
  entity_type text,   -- 'case' | 'client' | 'user' | 'portal'
  entity_id   uuid,
  ip_address  text,
  created_at  timestamptz DEFAULT now()
);

-- Index للبحث السريع
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id    ON activity_log(user_id);

-- RLS على activity_log — Admin فقط يشوف الكل
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "admins_can_read_activity"
  ON activity_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY IF NOT EXISTS "authenticated_can_insert_activity"
  ON activity_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Trigger لتسجيل دخول المستخدمين (اختياري)
-- يتم تحديث last_login في جدول profiles عند كل تسجيل دخول
-- هذا يتم من الكود مش من trigger (لأن auth events لا تدعم triggers مباشرة)

-- 4. تأكد إن جدول client_portal_pins موجود مع الأعمدة الصحيحة
CREATE TABLE IF NOT EXISTS client_portal_pins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid REFERENCES clients(id) ON DELETE CASCADE,
  pin         text NOT NULL,
  is_active   boolean DEFAULT true,
  client_name text,
  email       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(client_id)
);

-- RLS لبوابة الموكل
ALTER TABLE client_portal_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "admins_manage_portal_pins"
  ON client_portal_pins FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- ⚠️ ملحوظة أمان: تم حذف policy "clients_can_verify_pin" (anon/SELECT) عمدًا.
-- كانت تسمح لأي حامل anon key بقراءة كل صفوف الجدول (اسم/إيميل/PIN) مباشرة
-- عبر REST، من غير تسجيل دخول. التحقق من PIN لازم يتم فقط عن طريق دالة
-- SECURITY DEFINER (تحت) أو عبر Edge Function — لا تُعاد إضافة policy
-- مشابهة تمنح anon صلاحية SELECT على هذا الجدول.

-- 5. Function بسيطة للتحقق من PIN الموكل (SECURITY DEFINER يتخطى RLS، بدون
-- داعٍ لمنح anon صلاحية SELECT مباشرة على الجدول)
CREATE OR REPLACE FUNCTION verify_client_pin(p_email text, p_pin text)
RETURNS TABLE(client_id uuid, client_name text, is_valid boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT 
      cpp.client_id,
      cpp.client_name,
      true as is_valid
    FROM client_portal_pins cpp
    WHERE cpp.email = p_email
      AND cpp.pin = p_pin
      AND cpp.is_active = true;
END;
$$;

-- تأكد إن الدالة دي تتنفذ بمعرفة anon لو هتستخدمها مباشرة من بوابة الموكل
-- (الأفضل تتنادى من إيدج فانكشن وميتسماح anon ينده عليها مباشرة، لكن لو
-- محتاجها مباشرة، فعّل السطر ده فقط بعد ما تتأكد إنها الطريقة الوحيدة للوصول):
-- GRANT EXECUTE ON FUNCTION verify_client_pin(text, text) TO anon;

-- ══════════════════════════════════════════════════════
--  ملاحظات التشغيل
-- ══════════════════════════════════════════════════════
-- 
--  بعد تنفيذ هذا الملف:
--  1. أعد تشغيل التطبيق
--  2. افتح قسم "الإدارة" من قائمة "المزيد" (مديرون فقط)
--  3. ستجد 3 أقسام:
--     • المستخدمون: إدارة كاملة + صلاحيات + تفعيل/تعطيل
--     • بوابة الموكل: إعداد PIN لكل موكل
--     • سجل النشاط: يعمل بعد إضافة triggers
--
