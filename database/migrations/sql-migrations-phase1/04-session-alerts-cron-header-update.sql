-- ══════════════════════════════════════════════════════
--  إضافة x-cron-secret header لجوبات session-alerts الموجودة
--  (morning-alerts, evening-alerts) بدون تغيير المواعيد أو أي
--  حاجة تانية — بس إضافة header واحد جنب اللي موجودين.
-- ══════════════════════════════════════════════════════

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'morning-alerts'),
  command := $$SELECT net.http_post(
      url := 'https://lrdshyohvymbdanoxgyy.supabase.co/functions/v1/session-alerts',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyZHNoeW9odnltYmRhbm94Z3l5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDc2NTU4MCwiZXhwIjoyMDk2MzQxNTgwfQ.Lg48hLDDOiXi40uEghzd4400FDKgmdVSCTLjXeccLmU", "x-cron-secret": "8SaKQkBDu89eRGdVUEuigWocSlCqBWnJNxqmcqb73cc"}'::jsonb,
      body := '{"type":"morning"}'::jsonb
    );$$
);

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'evening-alerts'),
  command := $$SELECT net.http_post(
      url := 'https://lrdshyohvymbdanoxgyy.supabase.co/functions/v1/session-alerts',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyZHNoeW9odnltYmRhbm94Z3l5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDc2NTU4MCwiZXhwIjoyMDk2MzQxNTgwfQ.Lg48hLDDOiXi40uEghzd4400FDKgmdVSCTLjXeccLmU", "x-cron-secret": "8SaKQkBDu89eRGdVUEuigWocSlCqBWnJNxqmcqb73cc"}'::jsonb,
      body := '{"type":"evening"}'::jsonb
    );$$
);

-- تأكيد إن التحديث نجح — لازم تشوف x-cron-secret في الأمرين:
SELECT jobname, command FROM cron.job WHERE jobname IN ('morning-alerts', 'evening-alerts');
