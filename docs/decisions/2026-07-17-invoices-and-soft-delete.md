# قرارات منتج محسومة — 17 يوليو 2026

مرجع: `sanad-review-report-1.md`، المرحلة واحد (البندين 1.1 و1.2).

---

## 1.1 — جدول `invoices`

**القرار:** الاحتفاظ بالنظام الجديد المبني بالفعل. لا حذف ولا رجوع للجدول القديم.

**الحالة الفعلية (بعد المراجعة):** جدول `invoices` القديم اتحذف بالفعل واتبنى بدل منه جدول فواتير جديد بالكامل — الفتشر ده مش خطة مستقبلية، هو منفّذ وشغال في الكود دلوقتي:

- **الـ migrations:** `06a-drop-old-invoices.sql` (حذف القديم) → `06b-create-new-invoices.sql` (إنشاء الجديد) → `06c-verify-invoices-migration.sql` (تحقق).
- **الجدول الجديد** مربوط بـ `fee_payments` (كل دفعة أتعاب ليها فاتورة واحدة بس، مش تتكرر)، وله ترقيم تسلسلي تلقائي لكل مكتب عبر function `generate_invoice_number` (بيستخدم عمود `invoice_counter` في `office_settings`).
- **الكود المستخدم للجدول:**
  - `src/features/fees/hooks/useInvoicePrinting.ts` — `getOrCreateInvoice`: بيدور على فاتورة موجودة للدفعة، ولو مفيش بينشئ واحدة برقم تسلسلي جديد.
  - `src/features/fees/FeeCard.tsx` — واجهة إصدار/طباعة الفاتورة.
  - `src/features/admin/office/hooks/useAdminOffice.ts` — إعدادات بادئة رقم الفاتورة (`invoice_prefix`).
- **RLS:** مفعّلة على الجدول، بسياستين (`SELECT` و`INSERT` لنفس الـ tenant فقط).

**متبقّي عليك (خارج نطاق هذا التوثيق):** التأكد إن `06a` و`06b` و`06c` اتشغّلوا فعليًا على قاعدة البيانات الحية على Supabase (لو المشروع لسه ما اتنشرش بالكامل). لو مش متأكد، شغّل `06c-verify-invoices-migration.sql` في SQL Editor — لو رجع `invoices_columns=[NONE]` يبقى المigration الجديدة لسه ما اتنفذتش.

---

## 1.2 — Hard Delete مقابل Soft Delete (قضايا / موكلين / أتعاب)

**القرار:** تحويل لـ Soft Delete (أرشفة قابلة للاسترجاع).

**الحالة الفعلية (بعد المراجعة):** منفّذ بالكامل — على مستوى قاعدة البيانات وعلى مستوى الكود:

- **الـ migration:** `05-soft-delete-archiving.sql` — بتضيف عمود `deleted_at timestamptz` على `cases`, `clients`, `case_fees`، مع فهارس جزئية للصفوف النشطة والمؤرشفة، وملاحظة صريحة إن RLS بتفضل زي ما هي (الفلترة على مستوى الكويري في الفرونت إند مش على مستوى RLS، عشان تسمح بشاشة أرشيف لاحقًا).
- **الكود:**
  - `src/features/cases/hooks/useCaseActions.ts` — الحذف بقى `.update({ deleted_at: new Date().toISOString() })` بدل `.delete()`، ومعاه دالة استرجاع (`deleted_at: null`).
  - `src/features/clients/hooks/useClientActions.ts` — نفس النمط.
  - `src/features/fees/hooks/useFeesActions.ts` — نفس النمط على `case_fees`، مع فلتر `.is('deleted_at', null)` في كل استعلامات الجلب/الإحصائيات.
- **ملاحظة:** `fee_payments` (دفعات الأتعاب الفردية، مش نفس جدول `case_fees`) لسه بتتحذف Hard Delete (`useFeesActions.ts` سطر 313) — ده لم يكن جزء من البند المطلوب أرشفته (البند خص القضايا/الموكلين/الأتعاب كسجلات رئيسية)، لكن يستأهل قرار منفصل لو حابب تراجعه لاحقًا.

**⚠️ إجراء لازم قبل أي نشر نهائي:** تأكيد إن migration `05` اتشغّلت فعليًا على قاعدة البيانات الحية على Supabase. الكود الحالي بيفترض وجود عمود `deleted_at` على الجداول التلاتة (استعلامات `.is('deleted_at', null)` و`.update({deleted_at: ...})`) — لو الـ migration لسه ما اتشغلتش على الداتابيز الحي، أي محاولة حذف أو عرض قوائم القضايا/الموكلين/الأتعاب هترجع error فورًا. راجع ملف التحقق `13-verify-soft-delete-columns.sql` المرفق مع هذا التحديث، وشغّله في Supabase SQL Editor قبل أي نشر.

---

## جدول الحالة النهائي

| البند | القرار | التنفيذ (كود) | التنفيذ (DB migration) | مطلوب منك |
|---|---|---|---|---|
| `.gitignore` | — | — | — | ✅ لا شيء |
| جدول `invoices` | نظام جديد كامل | ✅ منفّذ | ✅ ملفات جاهزة (`06a`,`06b`,`06c`) | تأكيد التشغيل على الداتابيز الحي |
| Soft Delete | أرشفة | ✅ منفّذ | ✅ ملف جاهز (`05`) | تأكيد التشغيل على الداتابيز الحي (عاجل) |
