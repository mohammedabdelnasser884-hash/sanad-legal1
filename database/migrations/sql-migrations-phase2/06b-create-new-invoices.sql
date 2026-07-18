-- ============================================================
-- خطوة 2/2 — إنشاء جدول invoices الجديد (سجل فواتير ثابت)
-- شغّل الملف ده لوحده، بعد ما تتأكد إن 06a نجح (الجدول القديم اتحذف)
-- ============================================================

ALTER TABLE office_settings ADD COLUMN IF NOT EXISTS invoice_counter integer NOT NULL DEFAULT 0;

CREATE TABLE invoices (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    invoice_number  text NOT NULL,
    fee_payment_id  uuid REFERENCES fee_payments(id) ON DELETE SET NULL,
    case_id         uuid REFERENCES cases(id) ON DELETE SET NULL,
    client_id       uuid REFERENCES clients(id) ON DELETE SET NULL,
    case_name       text,
    client_name     text,
    amount          numeric(12,2) NOT NULL,
    currency        text NOT NULL DEFAULT 'جنيه مصري',
    notes           text,
    issued_by       uuid,
    issued_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, invoice_number)
);

CREATE INDEX idx_invoices_ledger_tenant ON invoices (tenant_id);
CREATE INDEX idx_invoices_ledger_fee_payment ON invoices (fee_payment_id);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select_own_tenant" ON invoices
    FOR SELECT
    USING (tenant_id = current_tenant_id() OR is_super_admin());

CREATE POLICY "invoices_insert_own_tenant" ON invoices
    FOR INSERT
    WITH CHECK (tenant_id = current_tenant_id());

CREATE OR REPLACE FUNCTION generate_invoice_number(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prefix text;
    v_counter integer;
BEGIN
    UPDATE office_settings
        SET invoice_counter = invoice_counter + 1
        WHERE tenant_id = p_tenant_id
        RETURNING invoice_counter, COALESCE(NULLIF(invoice_prefix, ''), 'INV') INTO v_counter, v_prefix;

    IF v_counter IS NULL THEN
        RAISE EXCEPTION 'No office_settings row found for tenant %', p_tenant_id;
    END IF;

    RETURN v_prefix || '-' || to_char(now(), 'YYYY') || '-' || lpad(v_counter::text, 4, '0');
END;
$$;
