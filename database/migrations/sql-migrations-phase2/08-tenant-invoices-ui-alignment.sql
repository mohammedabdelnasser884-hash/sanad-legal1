-- ============================================================
-- 08 - تجهيز tenant_invoices عشان يتوافق مع شاشة المدفوعات
--      الجاهزة أصلاً في offices-portal.html
-- ============================================================
-- الشاشة دي كانت بتحاول تتكلم مع جدول/عمود مش موجودين (saas_payments،
-- saas_tenants) فكانت بترجع error من غير ما حد ياخد باله، لأن الشاشة
-- بصريًا شغالة عادي. دلوقتي بنوصل الطرفين ببعض.

-- رقم فاتورة تلقائي — مش هيتطلب من شاشة الدفعة اليدوية خالص
ALTER TABLE tenant_invoices
    ALTER COLUMN invoice_number SET DEFAULT ('SAAS-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,6));

-- الشاشة الجاهزة بتعرض المبالغ بالدولار ($) — نظبط الافتراضي ليطابقها
-- (منفصل تمامًا عن جدول invoices التاني بتاع فواتير العميل بالجنيه المصري)
ALTER TABLE tenant_invoices ALTER COLUMN currency SET DEFAULT 'USD';

-- دفعة اتسجلت يدوي = مدفوعة بالفعل، من غير ما نطلب القيمة دي من الشاشة
ALTER TABLE tenant_invoices
    ALTER COLUMN payment_status SET DEFAULT 'paid';

-- أعمدة إضافية تطابق فورم "تسجيل دفعة" الموجود بالفعل في offices-portal.html
ALTER TABLE tenant_invoices ADD COLUMN IF NOT EXISTS payment_method text;   -- cash / bank_transfer / card / other
ALTER TABLE tenant_invoices ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE tenant_invoices ADD COLUMN IF NOT EXISTS plan_at_payment text; -- الخطة وقت الدفع (snapshot، مش هي المصدر الحقيقي للخطة الحالية)
