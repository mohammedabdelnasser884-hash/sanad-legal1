-- ============================================================
-- 05 - أرشفة بدل الحذف النهائي (Soft Delete)
-- البند 8 من قائمة الإجراءات: القضايا / الموكلين / الأتعاب
-- ============================================================
-- الفكرة: عمود deleted_at (timestamp) بدل حذف الصف فعليًا.
-- - NULL  = السجل نشط وظاهر عاديًا في كل الشاشات
-- - له قيمة = مؤرشف (متاح للاسترجاع، مش ظاهر في القوائم العادية)
-- الحذف النهائي الحقيقي يفضل استثناء نادر (سوبر أدمن بس، لو احتجناه لاحقًا).

ALTER TABLE cases      ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE clients    ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE case_fees  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- فهارس جزئية: تسرّع أي استعلام "الصفوف النشطة فقط" (الحالة الافتراضية في كل الشاشات)
CREATE INDEX IF NOT EXISTS idx_cases_active
    ON cases (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clients_active
    ON clients (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_case_fees_active
    ON case_fees (tenant_id) WHERE deleted_at IS NULL;

-- فهارس عكسية: لتحميل الأرشيف بسرعة (شاشة أرشيف لاحقًا)
CREATE INDEX IF NOT EXISTS idx_cases_archived
    ON cases (tenant_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_archived
    ON clients (tenant_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_case_fees_archived
    ON case_fees (tenant_id, deleted_at) WHERE deleted_at IS NOT NULL;

-- ملاحظة مهمة: RLS الحالية (tenant_id = current_tenant_id() OR is_super_admin())
-- بتفضل شغالة زي ما هي بالظبط — الأرشفة مش قرار أمان (مين يشوف الصف)،
-- هي قرار عرض (هل يظهر في القوائم الافتراضية ولا لأ)، فبيتفلتر على مستوى
-- الكويري في الفرونت إند (WHERE/​.is('deleted_at', null))، مش على مستوى RLS.
-- ده مقصود: لو حطينا الفلتر جوه RLS، هيبقى صعب تعمل شاشة "أرشيف" تسترجع منها.
