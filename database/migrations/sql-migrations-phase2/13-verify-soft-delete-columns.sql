-- ============================================================
-- تحقق: هل migration رقم 05 (Soft Delete) اتشغلت فعليًا على
-- قاعدة البيانات الحية؟ شغّل الاستعلام ده لوحده في Supabase SQL Editor.
-- ============================================================
-- الكود الحالي في الفرونت إند (useCaseActions.ts / useClientActions.ts /
-- useFeesActions.ts) بيفترض وجود عمود deleted_at على الجداول التلاتة.
-- لو النتيجة رجعت أي عمود بـ 0، لازم تشغّل 05-soft-delete-archiving.sql
-- قبل أي نشر، وإلا الحذف/الاسترجاع/عرض القوائم هيفشل فورًا.

SELECT
  'cases_deleted_at='   || (SELECT count(*) FROM information_schema.columns WHERE table_name='cases'     AND column_name='deleted_at')
  || ' || clients_deleted_at=' || (SELECT count(*) FROM information_schema.columns WHERE table_name='clients'   AND column_name='deleted_at')
  || ' || case_fees_deleted_at=' || (SELECT count(*) FROM information_schema.columns WHERE table_name='case_fees' AND column_name='deleted_at')
  || ' || indexes_present=' || (
      SELECT count(*) FROM pg_indexes
      WHERE indexname IN ('idx_cases_active','idx_clients_active','idx_case_fees_active',
                           'idx_cases_archived','idx_clients_archived','idx_case_fees_archived')
  )
  AS soft_delete_check;

-- تفسير النتيجة المتوقعة لو الـ migration اتشغلت بالكامل:
-- cases_deleted_at=1 || clients_deleted_at=1 || case_fees_deleted_at=1 || indexes_present=6
