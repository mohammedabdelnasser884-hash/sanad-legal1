SELECT
  'invoices_columns=[' || COALESCE((
      SELECT string_agg(column_name, ',' ORDER BY ordinal_position)
      FROM information_schema.columns WHERE table_name='invoices'
  ), 'NONE') || ']'
  || ' || invoices_policies=[' || COALESCE((
      SELECT string_agg(policyname, ',')
      FROM pg_policies WHERE tablename='invoices'
  ), 'NONE') || ']'
  || ' || rls_enabled=' || COALESCE((
      SELECT relrowsecurity::text FROM pg_class WHERE relname='invoices'
  ), 'N/A')
  || ' || function_exists=' || (SELECT count(*) FROM pg_proc WHERE proname='generate_invoice_number')
  || ' || office_settings_has_invoice_counter=' || (
      SELECT count(*) FROM information_schema.columns
      WHERE table_name='office_settings' AND column_name='invoice_counter'
  )
  AS diagnostic_result;
