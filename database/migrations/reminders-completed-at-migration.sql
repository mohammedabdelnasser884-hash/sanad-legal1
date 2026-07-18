-- إضافة عمود تاريخ الإنجاز لجدول التذكيرات
ALTER TABLE reminders
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL;

-- المهام المنجزة الموجودة: نضع تاريخ افتراضي = updated_at لو موجود
UPDATE reminders
SET completed_at = updated_at
WHERE done = true AND completed_at IS NULL AND updated_at IS NOT NULL;
