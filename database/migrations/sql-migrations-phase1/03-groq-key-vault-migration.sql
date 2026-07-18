-- ══════════════════════════════════════════════════════
--  Migration 3/3: نقل office_settings.groq_key من نص صريح إلى
--  Supabase Vault. نفّذ بعد نشر office-secrets/index.ts الجديدة
--  وai-chat/index.ts المحدّثة (أو قبلهم — الترتيب هنا مش حرج، لكن
--  المفتاح مش هيشتغل من الفرونت إند إلا بعد نشر الاتنين).
-- ══════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS supabase_vault;

ALTER TABLE office_settings
  ADD COLUMN IF NOT EXISTS groq_key_secret_id uuid;

DO $$
DECLARE
  r RECORD;
  new_secret_id uuid;
BEGIN
  FOR r IN
    SELECT id, tenant_id, groq_key
    FROM office_settings
    WHERE groq_key IS NOT NULL
      AND groq_key <> ''
      AND groq_key_secret_id IS NULL
  LOOP
    new_secret_id := vault.create_secret(
      r.groq_key,
      'groq_key_' || r.tenant_id::text,
      'Groq API key لمكتب ' || r.tenant_id::text
    );
    UPDATE office_settings
    SET groq_key_secret_id = new_secret_id
    WHERE id = r.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION get_office_groq_key(p_tenant_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT vs.decrypted_secret
  FROM office_settings os
  JOIN vault.decrypted_secrets vs ON vs.id = os.groq_key_secret_id
  WHERE os.tenant_id = p_tenant_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_office_groq_key(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_office_groq_key(uuid) FROM anon;
REVOKE ALL ON FUNCTION get_office_groq_key(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION get_office_groq_key(uuid) TO service_role;

CREATE OR REPLACE FUNCTION set_office_groq_key(p_tenant_id uuid, p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  existing_secret_id uuid;
  new_secret_id uuid;
BEGIN
  SELECT groq_key_secret_id INTO existing_secret_id
  FROM office_settings WHERE tenant_id = p_tenant_id;

  IF existing_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(existing_secret_id, p_key);
  ELSE
    new_secret_id := vault.create_secret(
      p_key,
      'groq_key_' || p_tenant_id::text,
      'Groq API key لمكتب ' || p_tenant_id::text
    );
    UPDATE office_settings
    SET groq_key_secret_id = new_secret_id
    WHERE tenant_id = p_tenant_id;

    IF NOT FOUND THEN
      INSERT INTO office_settings (tenant_id, groq_key_secret_id)
      VALUES (p_tenant_id, new_secret_id);
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION set_office_groq_key(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_office_groq_key(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION set_office_groq_key(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION set_office_groq_key(uuid, text) TO service_role;

-- ══════════════════════════════════════════════════════
--  ⚠️ العمود القديم office_settings.groq_key متسيبش يتحذف دلوقتي.
--  سيبه لحد ما تتأكد إن المساعد القانوني شغال 100% بالطريقة الجديدة
--  لمدة أسبوع على الأقل. لما تتأكد، نفّذ السطر ده لوحده:
--
--    ALTER TABLE office_settings DROP COLUMN groq_key;
-- ══════════════════════════════════════════════════════
