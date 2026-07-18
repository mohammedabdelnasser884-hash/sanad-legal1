-- تنظيف صفوف الاختبار اللي اتسجلت أثناء تشخيص مشكلة الـ rate limiting
-- (٧ محاولات فاشلة تجريبية). آمن تشغيله في أي وقت.
DELETE FROM saas_admin_login_attempts;
