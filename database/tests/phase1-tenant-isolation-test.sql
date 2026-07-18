-- ============================================================
--  اختبار عزل الـ Tenants (المرحلة 1) — منصة سند
--  16 يوليو 2026
-- ============================================================
--  ⚠️ آمن على الإنتاج: كل حاجة هنا جوه BEGIN...ROLLBACK.
--  مفيش أي COMMIT في آخر السكريبت — يعني أي بيانات تجريبية
--  (تينانتين، مستخدمين، قضايا...) بتتعمل هنا هتتمسح تلقائيًا
--  في آخر السكريبت، ومفيش أي أثر هيفضل في قاعدة البيانات.
--
--  لو حبيت تشغّله وتشوف النتايج بس من غير ما تلغي التجربة،
--  سيبه زي ما هو (فيه ROLLBACK في الآخر). لو حبيت "تثبّت" بيانات
--  تجريبية لسبب ما (مش منصوح بيه)، غيّر آخر سطر بس بعد ما تتأكد
--  من كل نتيجة.
--
--  المرجع الكامل لكل استعلام سابق مبني عليه السكريبت ده:
--  docs/reference/مرجع-فحص-Supabase-عزل-tenants.md
-- ============================================================

BEGIN;

-- ── جدول تجميع النتائج ──────────────────────────────────────
CREATE TEMP TABLE test_results (
  seq         serial PRIMARY KEY,
  test_name   text,
  expected    text,
  actual      text,
  passed      boolean
);

-- لازم نمنح صلاحية الكتابة على الجدول المؤقت للدور authenticated، لأن
-- السكريبت هيعمل SET LOCAL ROLE authenticated بعد كده عشان يحاكي مستخدم
-- عادي، والجدول ده اتعمل بصلاحية الدور الأساسي (postgres) فمش هيقدر
-- الدور التاني يكتب فيه من غير GRANT صريح.
GRANT INSERT, SELECT ON test_results TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE test_results_seq_seq TO authenticated;

-- ============================================================
-- PART A — تجهيز بيانات تجريبية (تينانتين كاملين بكل الجداول)
-- ============================================================
-- ملحوظة: الإدخال هنا بيتم بصلاحية مالك الجدول (postgres) اللي
-- بيتخطى RLS تلقائيًا، فمينفعش نستخدم الجزء ده كدليل على إن RLS
-- شغالة — ده بس تجهيز بيانات. الاختبار الحقيقي في PART B وبعدها.

DO $$
DECLARE
  tenant_a   uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  tenant_b   uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  lawyer_a   uuid := 'aaaaaaaa-1111-4000-8000-0000000000a1';
  admin_a    uuid := 'aaaaaaaa-1111-4000-8000-0000000000a2';
  inactive_a uuid := 'aaaaaaaa-1111-4000-8000-0000000000a3';
  lawyer_b   uuid := 'bbbbbbbb-1111-4000-8000-0000000000b1';
  superadmin uuid := 'ffffffff-1111-4000-8000-0000000000f1';
  firm_a     uuid := 'aaaaaaaa-2222-4000-8000-000000000001';
  firm_b     uuid := 'bbbbbbbb-2222-4000-8000-000000000002';
  client_a   uuid := 'aaaaaaaa-3333-4000-8000-000000000001';
  client_b   uuid := 'bbbbbbbb-3333-4000-8000-000000000002';
  case_a     uuid := 'aaaaaaaa-4444-4000-8000-000000000001';
  case_b     uuid := 'bbbbbbbb-4444-4000-8000-000000000002';
  fee_a      uuid := 'aaaaaaaa-5555-4000-8000-000000000001';
  fee_b      uuid := 'bbbbbbbb-5555-4000-8000-000000000002';
  payment_a  uuid := 'aaaaaaaa-6666-4000-8000-000000000001';
  payment_b  uuid := 'bbbbbbbb-6666-4000-8000-000000000002';
BEGIN
  -- التينانتين
  INSERT INTO tenants (id, name, slug) VALUES
    (tenant_a, 'TEST Tenant A', 'test-tenant-a-16jul'),
    (tenant_b, 'TEST Tenant B', 'test-tenant-b-16jul');

  -- صفوف auth.users مطلوبة إجباريًا (FK: profiles.user_id → auth.users.id،
  -- مفيش trigger على الجدول ده اتأكدنا منه، ومفيش عمود إجباري غير id).
  -- جوه نفس BEGIN...ROLLBACK العام، فمش هيسيب أثر.
  INSERT INTO auth.users (id) VALUES
    (lawyer_a), (admin_a), (inactive_a), (lawyer_b), (superadmin);

  -- البروفايلات: محامي وأدمن وموظف معطّل في تينانت A، محامي في B، سوبر أدمن بلا تينانت
  INSERT INTO profiles (user_id, tenant_id, role, rbac_role, is_super_admin, is_active, full_name) VALUES
    (lawyer_a,   tenant_a, 'lawyer', 'lawyer', false, true,  'TEST Lawyer A'),
    (admin_a,    tenant_a, 'admin',  'lawyer', false, true,  'TEST Admin A'),
    (inactive_a, tenant_a, 'lawyer', 'lawyer', false, false, 'TEST Inactive Lawyer A'),
    (lawyer_b,   tenant_b, 'lawyer', 'lawyer', false, true,  'TEST Lawyer B'),
    (superadmin, NULL,     'admin',  'lawyer', true,  true,  'TEST Super Admin');
  -- ⚠️ rbac_role='lawyer' لكل الصفوف عمدًا (مش خطأ): استعلام 7 في ملف المرجع
  -- أكّد إن كل بيانات الإنتاج الحالية، حتى صفوف الأدمن/السوبر أدمن، لسه
  -- rbac_role='lawyer'. الفرق الفعلي بين الأدوار بيتحدد من role + is_super_admin بس.

  -- مكاتب وموكلين وقضايا لكل تينانت
  INSERT INTO law_firms (id, tenant_id, firm_name) VALUES
    (firm_a, tenant_a, 'TEST Firm A'), (firm_b, tenant_b, 'TEST Firm B');

  INSERT INTO clients (id, tenant_id, firm_id, client_name) VALUES
    (client_a, tenant_a, firm_a, 'TEST Client A'),
    (client_b, tenant_b, firm_b, 'TEST Client B');

  INSERT INTO cases (id, tenant_id, client_id, firm_id, case_number_official, title, court_name) VALUES
    (case_a, tenant_a, client_a, firm_a, 'TEST-CASE-A', 'TEST Case A', 'TEST Court A'),
    (case_b, tenant_b, client_b, firm_b, 'TEST-CASE-B', 'TEST Case B', 'TEST Court B');

  -- الأتعاب والدفعات والفواتير
  INSERT INTO case_fees (id, tenant_id, case_id, client_id) VALUES
    (fee_a, tenant_a, case_a, client_a), (fee_b, tenant_b, case_b, client_b);

  INSERT INTO fee_payments (id, tenant_id, fee_id, client_id, amount) VALUES
    (payment_a, tenant_a, fee_a, client_a, 1000),
    (payment_b, tenant_b, fee_b, client_b, 1000);

  INSERT INTO invoices (tenant_id, case_id, client_id, fee_payment_id, invoice_number, amount) VALUES
    (tenant_a, case_a, client_a, payment_a, 'TEST-INV-A', 1000),
    (tenant_b, case_b, client_b, payment_b, 'TEST-INV-B', 1000);

  -- جلسات ومستندات وأحداث وملاحظات القضية
  INSERT INTO case_sessions (tenant_id, case_id, client_id) VALUES
    (tenant_a, case_a, client_a), (tenant_b, case_b, client_b);

  INSERT INTO case_documents (tenant_id, case_id) VALUES
    (tenant_a, case_a), (tenant_b, case_b);

  INSERT INTO case_events (tenant_id, case_id, event_type, event_date, description) VALUES
    (tenant_a, case_a, 'TEST', now(), 'TEST event A'),
    (tenant_b, case_b, 'TEST', now(), 'TEST event B');

  INSERT INTO case_notes (tenant_id) VALUES (tenant_a), (tenant_b);

  -- تذكيرات، سجل نشاط، واتساب، نسخ احتياطي، إعدادات مكتب
  INSERT INTO reminders (tenant_id, title, due_date) VALUES
    (tenant_a, 'TEST reminder A', current_date), (tenant_b, 'TEST reminder B', current_date);

  INSERT INTO activity_log (tenant_id, action) VALUES
    (tenant_a, 'TEST action A'), (tenant_b, 'TEST action B');

  INSERT INTO whatsapp_logs (id, tenant_id) VALUES
    (9990000001, tenant_a), (9990000002, tenant_b);

  INSERT INTO backups (tenant_id) VALUES (tenant_a), (tenant_b);

  -- ⚠️ office_settings.id هو integer NOT NULL DEFAULT 1 (قيمة ثابتة حرفيًا، مش
  -- sequence) — الجدول مصمم كصف واحد بالتاريخ، وفيه بالفعل صف حقيقي id=1.
  -- لازم نحدد id صريح غير مستخدم لكل صف تجريبي عشان مانتصادمش مع بعض ولا مع
  -- الصف الحقيقي (استعلام 10 في ملف المرجع).
  INSERT INTO office_settings (id, tenant_id) VALUES (999901, tenant_a), (999902, tenant_b);

  -- جداول مستوى الـ SaaS (super-admin)
  INSERT INTO platform_audit_logs (tenant_id, user_id, action) VALUES
    (tenant_a, lawyer_a, 'TEST platform action A');

  INSERT INTO tenant_invoices (tenant_id, billing_period_start, billing_period_end, amount_due) VALUES
    (tenant_a, now(), now() + interval '1 month', 500);

  INSERT INTO tenant_usage_stats (tenant_id) VALUES (tenant_a);

  -- بوابة العميل (عزل غير مباشر عن طريق clients)
  INSERT INTO client_messages (client_id, content) VALUES
    (client_a, 'TEST message A'), (client_b, 'TEST message B');

  INSERT INTO client_portal_sessions (client_id, token) VALUES
    (client_a, 'TEST-TOKEN-A'), (client_b, 'TEST-TOKEN-B');

  RAISE NOTICE 'PART A: بيانات الاختبار اتجهزت بنجاح';
END $$;

-- ============================================================
-- PART B — رؤية الـ SELECT: محامي في تينانت A لازم يشوف بيانات
-- تينانت A بس، وميشوفش حاجة من تينانت B، لكل الجداول اللي فيها
-- tenant_id مباشر
-- ============================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-1111-4000-8000-0000000000a1"}';

DO $$
DECLARE
  tbl text;
  tenant_a uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  tenant_b uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  cnt_a int;
  cnt_b int;
  tables_to_check text[] := ARRAY[
    -- activity_log و backups اتشالوا من هنا: الـ SELECT policy بتاعتهم
    -- مقفولة على role='admin' فقط (موثّق في استعلام 1 بملف المرجع)، فمحامي
    -- عادي مفروض يشوف 0 صف فيهم حتى في تينانته هو — ده مش نفس نمط باقي
    -- الجداول. بيتغطوا بتست مخصص بعد PART E بدور admin_a بدل كده.
    'case_documents','case_events','case_fees',
    'case_notes','case_sessions','cases','clients','fee_payments','invoices',
    'law_firms','office_settings','reminders','whatsapp_logs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_to_check LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE tenant_id = $1', tbl)
      INTO cnt_a USING tenant_a;
    EXECUTE format('SELECT count(*) FROM %I WHERE tenant_id = $1', tbl)
      INTO cnt_b USING tenant_b;

    INSERT INTO test_results (test_name, expected, actual, passed) VALUES (
      format('SELECT عزل — محامي تينانت A يشوف صفوف %s بتاعته', tbl),
      'صف تينانت A مرئي (>=1)، صف تينانت B مخفي (=0)',
      format('تينانت A مرئي=%s، تينانت B مرئي=%s', cnt_a, cnt_b),
      (cnt_a >= 1 AND cnt_b = 0)
    );
  END LOOP;
END $$;

-- حالات خاصة (سلوك مختلف عن النمط العام، اتأكدنا إنه مقصود):

-- activity_log: محامي عادي (مش أدمن) المفروض ميشوفش السجل خالص حتى بتاعه هو
DO $$
DECLARE cnt int;
BEGIN
  SELECT count(*) INTO cnt FROM activity_log;
  INSERT INTO test_results VALUES (DEFAULT,
    'activity_log — محامي عادي (مش أدمن) لازم يشوف 0 صف خالص',
    '0', cnt::text, (cnt = 0));
END $$;

-- laws/law_articles/legal_categories: محامي عادي لازم يشوف 0 صف (وصول عن طريق AI functions بس)
DO $$
DECLARE cnt int;
BEGIN
  SELECT count(*) INTO cnt FROM laws;
  INSERT INTO test_results VALUES (DEFAULT,
    'laws — مستخدم عادي (مش سوبر أدمن) لازم يشوف 0 صف',
    '0', cnt::text, (cnt = 0));
END $$;

-- ============================================================
-- PART C — منع الكتابة عبر التينانتات: محامي A يحاول يعدّل صف
-- تينانت B — لازم يتأثر 0 صف (مش error، RLS بتفلتر بصمت)
-- ============================================================

DO $$
DECLARE
  tbl text;
  tenant_b uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  affected int;
  tables_to_check text[] := ARRAY[
    'case_documents','case_events','case_fees','case_notes','case_sessions',
    'cases','clients','fee_payments','law_firms','reminders','whatsapp_logs','backups'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_to_check LOOP
    EXECUTE format('UPDATE %I SET tenant_id = tenant_id WHERE tenant_id = $1', tbl)
      USING tenant_b;
    GET DIAGNOSTICS affected = ROW_COUNT;

    INSERT INTO test_results (test_name, expected, actual, passed) VALUES (
      format('UPDATE عبر التينانت — محامي A يحاول يعدّل صف %s بتاع تينانت B', tbl),
      '0 صف اتأثر',
      format('%s صف اتأثر', affected),
      (affected = 0)
    );
  END LOOP;
END $$;

-- ============================================================
-- PART D — منع الكتابة بـ tenant_id غلط (WITH CHECK): محامي A
-- يحاول يعمل INSERT لصف وحاطط فيه tenant_id بتاع B
-- ============================================================

DO $$
DECLARE
  tenant_b uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  client_a uuid := 'aaaaaaaa-3333-4000-8000-000000000001';
  firm_a   uuid := 'aaaaaaaa-2222-4000-8000-000000000001';
  ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO cases (tenant_id, client_id, firm_id, case_number_official, title, court_name)
    VALUES (tenant_b, client_a, firm_a, 'HACK-CASE', 'Hack attempt', 'x');
    ok := true; -- لو وصل هنا يبقى الإدخال نجح (فشل أمني)
  EXCEPTION WHEN insufficient_privilege OR others THEN
    ok := false; -- اتمنع، ده المتوقع
  END;

  INSERT INTO test_results VALUES (DEFAULT,
    'INSERT بـ tenant_id مزوّر — محامي A يحاول يسجّل قضية باسم تينانت B',
    'الإدخال يتمنع (WITH CHECK)',
    CASE WHEN ok THEN 'الإدخال نجح! (خطر)' ELSE 'اتمنع زي المتوقع' END,
    (ok = false));
END $$;

-- ============================================================
-- PART E — سلوكيات مؤكَّدة كمقصودة (activity_log وinvoices بلا UPDATE/DELETE)
-- ============================================================

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-1111-4000-8000-0000000000a2"}'; -- admin_a

DO $$
DECLARE affected int;
BEGIN
  -- الأدمن نفسه (مش بس المحامي) المفروض مايقدرش يعدّل activity_log خالص
  EXECUTE 'UPDATE activity_log SET action = action WHERE tenant_id = ''aaaaaaaa-0000-4000-8000-000000000001''';
  GET DIAGNOSTICS affected = ROW_COUNT;
  INSERT INTO test_results VALUES (DEFAULT,
    'activity_log — حتى الأدمن مايقدرش يعدّل (مفيش UPDATE policy خالص، مقصود)',
    '0 صف اتأثر', format('%s صف اتأثر', affected), (affected = 0));

  -- ولا الفواتير كمان
  EXECUTE 'UPDATE invoices SET amount = amount WHERE tenant_id = ''aaaaaaaa-0000-4000-8000-000000000001''';
  GET DIAGNOSTICS affected = ROW_COUNT;
  INSERT INTO test_results VALUES (DEFAULT,
    'invoices — حتى الأدمن مايقدرش يعدّل مباشرة (مفيش UPDATE policy خالص، مقصود)',
    '0 صف اتأثر', format('%s صف اتأثر', affected), (affected = 0));
END $$;

-- ============================================================
-- PART E2 — عزل الـ tenant لجدولين مقفولين على role='admin' بس:
-- activity_log و backups. لازم أدمن تينانت A يشوف صفوف تينانته،
-- ومايشوفش صفوف تينانت B (بعكس المحامي العادي اللي شفنا في PART B
-- إنه بيشوف 0 صف في الجدولين دول، وده سلوك صحيح ومقصود ليه هو).
-- لسه شغالين بنفس جلسة admin_a من PART E، مفيش داعي لـ SET تاني.
-- ============================================================

DO $$
DECLARE
  tbl text;
  tenant_a uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  tenant_b uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  cnt_a int;
  cnt_b int;
  tables_to_check text[] := ARRAY['activity_log','backups'];
BEGIN
  FOREACH tbl IN ARRAY tables_to_check LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE tenant_id = $1', tbl)
      INTO cnt_a USING tenant_a;
    EXECUTE format('SELECT count(*) FROM %I WHERE tenant_id = $1', tbl)
      INTO cnt_b USING tenant_b;

    INSERT INTO test_results (test_name, expected, actual, passed) VALUES (
      format('SELECT عزل (دور admin) — أدمن تينانت A يشوف صفوف %s بتاعته بس', tbl),
      'صف تينانت A مرئي (>=1)، صف تينانت B مخفي (=0)',
      format('تينانت A مرئي=%s، تينانت B مرئي=%s', cnt_a, cnt_b),
      (cnt_a >= 1 AND cnt_b = 0)
    );
  END LOOP;
END $$;

-- ============================================================
-- PART F — تصعيد الصلاحيات: محامي عادي يحاول يرفّع نفسه أدمن/سوبر أدمن
-- (فيه Trigger اتعمل قبل كده لسد الثغرة دي — بنتأكد لسه شغال)
-- ============================================================

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-1111-4000-8000-0000000000a1"}'; -- lawyer_a

DO $$
DECLARE final_role text; final_super boolean; blocked boolean := false;
BEGIN
  BEGIN
    UPDATE profiles SET role = 'admin', rbac_role = 'admin', is_super_admin = true
    WHERE user_id = 'aaaaaaaa-1111-4000-8000-0000000000a1';
  EXCEPTION WHEN others THEN
    blocked := true;
  END;

  SELECT role, is_super_admin INTO final_role, final_super
  FROM profiles WHERE user_id = 'aaaaaaaa-1111-4000-8000-0000000000a1';

  INSERT INTO test_results VALUES (DEFAULT,
    'تصعيد صلاحيات — محامي يحاول يرفّع نفسه سوبر أدمن مباشرة',
    'الدور يفضل lawyer وis_super_admin يفضل false (الـ Trigger يمنع/يرجّع)',
    format('role=%s, is_super_admin=%s, الإدخال اتمنع بـ Exception=%s', final_role, final_super, blocked),
    (final_role = 'lawyer' AND final_super = false));
END $$;

-- ============================================================
-- PART G — مستخدم معطّل (is_active=false): هل current_tenant_id()
-- بتاخد بالها من is_active؟ (فحص مباشر لمصدر الدالة، مش تخمين)
-- ============================================================

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-1111-4000-8000-0000000000a3"}'; -- inactive_a

DO $$
DECLARE cnt int;
BEGIN
  SELECT count(*) INTO cnt FROM cases WHERE tenant_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  INSERT INTO test_results VALUES (DEFAULT,
    '⚠️ مستخدم معطّل (is_active=false) — current_tenant_id() بتتجاهل is_active في تعريفها الحالي',
    'لو الحماية بتعتمد على RLS بس، النتيجة المتوقعة منطقيًا = 0 (بس الدالة حاليًا مبتفحصش is_active)',
    format('عدد الصفوف المرئية له = %s', cnt),
    (cnt = 0));
END $$;

-- ============================================================
-- الملخص النهائي
-- ============================================================

RESET ROLE;

SELECT jsonb_build_object(
  'summary', jsonb_build_object(
    'passed_count', count(*) FILTER (WHERE passed),
    'failed_count', count(*) FILTER (WHERE NOT passed),
    'total_count', count(*)
  ),
  'failed_tests', (
    select jsonb_agg(jsonb_build_object(
      'seq', seq, 'test_name', test_name, 'expected', expected, 'actual', actual
    ) order by seq)
    from test_results where not passed
  )
) AS final_summary
FROM test_results;

-- ⚠️ ROLLBACK مقصود — مفيش أي بيانات تجريبية هتتسجل فعليًا.
-- لو عايز تراجع النتايج تاني قبل الـ rollback، بص على نتيجة
-- الاستعلامين فوق الأول (بيظهروا في تبويب Results في Supabase
-- قبل ما الـ ROLLBACK يتنفذ).
ROLLBACK;
