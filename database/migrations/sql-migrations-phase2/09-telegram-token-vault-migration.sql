-- ══════════════════════════════════════════════════════
--  Migration 09: نقل توكني بوت تيليجرام (اليومي + الفوري) من نص
--  صريح في office_settings إلى Supabase Vault — نفس نمط groq_key
--  بالضبط (راجع sql-migrations-phase1/03-groq-key-vault-migration.sql).
--
--  ⚠️ tg_daily_chat / tg_instant_chat (chat id) فضلوا أعمدة عادية —
--  مش بنفس حساسية التوكن، لأن معرفة الـ chat id لوحدها مش كافية
--  لإرسال أي رسالة بدون التوكن. اللي بيتحرك لـ Vault هو التوكن فقط،
--  لأنه اللي بيسمح بالتحكم الكامل في البوت (إرسال باسمه لأي مكان).
--
--  نفّذ الملف ده بعد نشر:
--   - office-secrets/index.ts المحدّثة (فيها saveTgDailyToken/saveTgInstantToken)
--   - telegram-send/index.ts (فانكشن جديدة للإرسال الفوري من السيرفر)
--   - session-alerts/index.ts المحدّثة (بتقرا التوكن من get_all_daily_tg_configs)
--  الترتيب هنا مش حرج، لكن التنبيهات مش هتشتغل من الفرونت إند إلا
--  بعد نشر التلاتة.
-- ══════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS supabase_vault;

ALTER TABLE office_settings
  ADD COLUMN IF NOT EXISTS tg_daily_token_secret_id uuid,
  ADD COLUMN IF NOT EXISTS tg_instant_token_secret_id uuid;

-- ── نقل القيم الحالية (لو موجودة) من النص الصريح إلى Vault ──
DO $$
DECLARE
  r RECORD;
  new_secret_id uuid;
BEGIN
  FOR r IN
    SELECT id, tenant_id, tg_daily_token
    FROM office_settings
    WHERE tg_daily_token IS NOT NULL
      AND tg_daily_token <> ''
      AND tg_daily_token_secret_id IS NULL
  LOOP
    new_secret_id := vault.create_secret(
      r.tg_daily_token,
      'tg_daily_token_' || r.tenant_id::text,
      'Telegram daily bot token لمكتب ' || r.tenant_id::text
    );
    UPDATE office_settings
    SET tg_daily_token_secret_id = new_secret_id
    WHERE id = r.id;
  END LOOP;

  FOR r IN
    SELECT id, tenant_id, tg_instant_token
    FROM office_settings
    WHERE tg_instant_token IS NOT NULL
      AND tg_instant_token <> ''
      AND tg_instant_token_secret_id IS NULL
  LOOP
    new_secret_id := vault.create_secret(
      r.tg_instant_token,
      'tg_instant_token_' || r.tenant_id::text,
      'Telegram instant bot token لمكتب ' || r.tenant_id::text
    );
    UPDATE office_settings
    SET tg_instant_token_secret_id = new_secret_id
    WHERE id = r.id;
  END LOOP;
END $$;

-- ══════════════════════════════════════════
--  توكن البوت اليومي
-- ══════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_office_tg_daily_token(p_tenant_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT vs.decrypted_secret
  FROM office_settings os
  JOIN vault.decrypted_secrets vs ON vs.id = os.tg_daily_token_secret_id
  WHERE os.tenant_id = p_tenant_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_office_tg_daily_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_office_tg_daily_token(uuid) FROM anon;
REVOKE ALL ON FUNCTION get_office_tg_daily_token(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION get_office_tg_daily_token(uuid) TO service_role;

CREATE OR REPLACE FUNCTION set_office_tg_daily_token(p_tenant_id uuid, p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  existing_secret_id uuid;
  new_secret_id uuid;
BEGIN
  SELECT tg_daily_token_secret_id INTO existing_secret_id
  FROM office_settings WHERE tenant_id = p_tenant_id;

  IF existing_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(existing_secret_id, p_token);
  ELSE
    new_secret_id := vault.create_secret(
      p_token,
      'tg_daily_token_' || p_tenant_id::text,
      'Telegram daily bot token لمكتب ' || p_tenant_id::text
    );
    UPDATE office_settings
    SET tg_daily_token_secret_id = new_secret_id
    WHERE tenant_id = p_tenant_id;

    IF NOT FOUND THEN
      INSERT INTO office_settings (tenant_id, tg_daily_token_secret_id)
      VALUES (p_tenant_id, new_secret_id);
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION set_office_tg_daily_token(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_office_tg_daily_token(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION set_office_tg_daily_token(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION set_office_tg_daily_token(uuid, text) TO service_role;

-- ══════════════════════════════════════════
--  توكن البوت الفوري
-- ══════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_office_tg_instant_token(p_tenant_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT vs.decrypted_secret
  FROM office_settings os
  JOIN vault.decrypted_secrets vs ON vs.id = os.tg_instant_token_secret_id
  WHERE os.tenant_id = p_tenant_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_office_tg_instant_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_office_tg_instant_token(uuid) FROM anon;
REVOKE ALL ON FUNCTION get_office_tg_instant_token(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION get_office_tg_instant_token(uuid) TO service_role;

CREATE OR REPLACE FUNCTION set_office_tg_instant_token(p_tenant_id uuid, p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  existing_secret_id uuid;
  new_secret_id uuid;
BEGIN
  SELECT tg_instant_token_secret_id INTO existing_secret_id
  FROM office_settings WHERE tenant_id = p_tenant_id;

  IF existing_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(existing_secret_id, p_token);
  ELSE
    new_secret_id := vault.create_secret(
      p_token,
      'tg_instant_token_' || p_tenant_id::text,
      'Telegram instant bot token لمكتب ' || p_tenant_id::text
    );
    UPDATE office_settings
    SET tg_instant_token_secret_id = new_secret_id
    WHERE tenant_id = p_tenant_id;

    IF NOT FOUND THEN
      INSERT INTO office_settings (tenant_id, tg_instant_token_secret_id)
      VALUES (p_tenant_id, new_secret_id);
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION set_office_tg_instant_token(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_office_tg_instant_token(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION set_office_tg_instant_token(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION set_office_tg_instant_token(uuid, text) TO service_role;

-- ══════════════════════════════════════════
--  قراءة دفعية لكل توكنات البوت اليومي مرة واحدة —
--  يستخدمها cron session-alerts بدل قراءة عمود tg_daily_token
--  الصريح لكل المكاتب في نداء واحد.
-- ══════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_all_daily_tg_configs()
RETURNS TABLE(tenant_id uuid, token text, chat text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT os.tenant_id, vs.decrypted_secret, os.tg_daily_chat
  FROM office_settings os
  JOIN vault.decrypted_secrets vs ON vs.id = os.tg_daily_token_secret_id
  WHERE os.tg_daily_chat IS NOT NULL AND os.tg_daily_chat <> '';
$$;

REVOKE ALL ON FUNCTION get_all_daily_tg_configs() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_all_daily_tg_configs() FROM anon;
REVOKE ALL ON FUNCTION get_all_daily_tg_configs() FROM authenticated;
GRANT EXECUTE ON FUNCTION get_all_daily_tg_configs() TO service_role;

-- ══════════════════════════════════════════
--  ⚠️ الأعمدة القديمة tg_daily_token / tg_instant_token متسيبهاش
--  تتحذف دلوقتي. سيبهم لحد ما تتأكد إن التنبيهات اليومية والفورية
--  شغالة 100% بالطريقة الجديدة لمدة أسبوع على الأقل. لما تتأكد،
--  نفّذ السطرين دول لوحدهم:
--
--    ALTER TABLE office_settings DROP COLUMN tg_daily_token;
--    ALTER TABLE office_settings DROP COLUMN tg_instant_token;
-- ══════════════════════════════════════════
