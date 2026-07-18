-- ══════════════════════════════════════════════════════
--  Migration: تشفير PIN بوابة الموكلين (Hash بدل نص صريح)
--  نفّذ هذا الملف في Supabase SQL Editor مرة واحدة فقط
--
--  المشكلة قبل هذا الملف:
--  عمود client_portal_pins.pin كان مخزّن كنص واضح (plaintext).
--  أي حد عنده وصول لقاعدة البيانات (حتى مؤقتًا) كان يقدر يشوف
--  PIN أي موكل زي ما هو.
--
--  الحل:
--  1. تفعيل pgcrypto (موجودة افتراضيًا في Supabase، بس التفعيل آمن idempotent).
--  2. عمود جديد pin_hash يخزّن الـ PIN بعد bcrypt hash.
--  3. تحويل كل الصفوف الموجودة حاليًا لـ hash تلقائيًا (backfill).
--  4. دالة set_portal_pin() — تستخدمها لوحة الإدارة لحفظ PIN جديد
--     (بتعمل الـ hashing جوه قاعدة البيانات، مفيش نص صريح بيتخزن
--     أو يتبعت من المتصفح بعد كده).
--  5. دالة verify_portal_pin() — يستخدمها فانكشن client-portal-api
--     للتحقق من الـ PIN وقت الدخول بدون قراءة أي نص صريح.
--
--  ملحوظة: عمود pin القديم لسه موجود مؤقتًا (مش بيتحذف هنا) —
--  بعد ما تتأكد إن كل حاجة شغالة كويس كام يوم، ارجع نفّذ آخر سطر
--  في الملف ده (DROP COLUMN) يدويًا عشان تمسح النص الصريح نهائيًا.
-- ══════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE client_portal_pins
  ADD COLUMN IF NOT EXISTS pin_hash text;

-- تحويل كل PIN موجود حاليًا لـ hash (مرة واحدة، آمن لو اتنفذ تاني
-- لأنه بيتجاهل الصفوف اللي عندها pin_hash بالفعل)
UPDATE client_portal_pins
SET pin_hash = crypt(pin, gen_salt('bf'))
WHERE pin IS NOT NULL AND pin_hash IS NULL;

-- ── حفظ PIN جديد (تستخدمها لوحة الإدارة عن طريق db.rpc) ──
-- SECURITY INVOKER (الافتراضي) — يعني بتشتغل بصلاحيات المستخدم
-- الطالب نفسه، فسياسات RLS الموجودة على الجدول تفضل سارية زي ما هي
-- بالظبط زي لما كان في upsert مباشر من المتصفح.
CREATE OR REPLACE FUNCTION set_portal_pin(
  p_client_id   uuid,
  p_pin         text,
  p_is_active   boolean,
  p_client_name text,
  p_email       text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_pin IS NULL OR length(p_pin) <> 4 OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PIN يجب أن يكون 4 أرقام بالضبط';
  END IF;

  INSERT INTO client_portal_pins (client_id, pin_hash, is_active, client_name, email)
  VALUES (p_client_id, crypt(p_pin, gen_salt('bf')), p_is_active, p_client_name, p_email)
  ON CONFLICT (client_id) DO UPDATE
    SET pin_hash    = EXCLUDED.pin_hash,
        is_active   = EXCLUDED.is_active,
        client_name = EXCLUDED.client_name,
        email       = EXCLUDED.email;
END;
$$;

-- ── التحقق من PIN وقت الدخول (يستخدمها فانكشن client-portal-api) ──
-- بترجع true/false بس، من غير ما ترجّع أي نص صريح أبدًا.
CREATE OR REPLACE FUNCTION verify_portal_pin(
  p_client_id uuid,
  p_pin       text
) RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM client_portal_pins
    WHERE client_id = p_client_id
      AND is_active = true
      AND pin_hash IS NOT NULL
      AND pin_hash = crypt(p_pin, pin_hash)
  );
$$;

-- ══════════════════════════════════════════════════════
--  خطوة تالية يدوية (نفّذها بعد كام يوم من التأكد إن كل حاجة شغالة):
--
--  ALTER TABLE client_portal_pins DROP COLUMN pin;
-- ══════════════════════════════════════════════════════
