import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { login, createAndArchiveCase, openAdminArchiveTab } from './utils';

// خطوة 7 (مكمّلة لـ archive.spec.ts) — التستات دي بتغطي بالظبط الفجوة اللي
// كانت موجودة: عندنا unit tests وهمية (useAdminArchive.test.ts) بتتأكد إن
// دوال الاسترجاع/الحذف النهائي بترجع النتيجة الصح، لكن مفيش تست حقيقي بيفتح
// المتصفح ويدوس زرار "استرجاع" أو "حذف نهائي" فعليًا من شاشة الأرشيف في
// لوحة الإدارة زي ما المستخدم هيعمل بالظبط.
//
// ⚠️ شرط أساسي: حساب E2E_TEST_EMAIL لازم يكون Admin/Owner (عنده صلاحية
// الوصول للوحة الإدارة)، وإلا زرار nav-more-admin مش هيظهر أصلًا والتست
// هيفشل من أول خطوة. لو الحساب الحالي مش Admin، لازم يتغير أو يتعمل حساب
// تجريبي تاني بصلاحية Admin مخصص للـ E2E بس.
//
// دالة مشتركة لفتح اتصال Supabase مباشر (قراءة/تأكيد بس) بنفس حساب التست،
// بنفس أسلوب archive.spec.ts.
async function connectAsTestUser() {
  const supaUrl = process.env.VITE_SUPABASE_URL;
  const supaKey = process.env.VITE_SUPABASE_ANON_KEY;
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!supaUrl || !supaKey || !email || !password) {
    throw new Error(
      'لازم VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY و E2E_TEST_EMAIL/E2E_TEST_PASSWORD يكونوا متاحين كـ env vars.'
    );
  }
  const supa = createClient(supaUrl, supaKey);
  const { error } = await supa.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return supa;
}

test('استرجاع قضية من شاشة الأرشيف: تختفي من الأرشيف وترجع تظهر في القضايا النشطة', async ({ page }) => {
  const title = `اختبار E2E استرجاع - قضية ${Date.now()}`;

  await login(page);
  await createAndArchiveCase(page, title);

  await openAdminArchiveTab(page, 'cases');

  const row = page.getByTestId('archive-row').filter({ hasText: title });
  await row.first().waitFor({ state: 'visible', timeout: 10_000 });

  await row.getByTestId('archive-row-restore').click();

  // الصف المؤرشف يختفي من شاشة الأرشيف
  await expect(page.getByTestId('archive-row').filter({ hasText: title })).toHaveCount(0);

  // ── تأكيد فعلي من قاعدة البيانات (قراءة فقط) ──
  const supa = await connectAsTestUser();
  const { data, error } = await supa.from('cases').select('deleted_at').eq('title', title).single();
  if (error) throw error;
  expect(data?.deleted_at).toBeNull();

  // وتظهر تاني في قائمة القضايا النشطة
  await page.getByTestId('nav-cases').click();
  const card = page.getByTestId('case-card').filter({ hasText: title });
  await expect(card).toHaveCount(1, { timeout: 10_000 });
});

test('حذف قضية نهائيًا من شاشة الأرشيف: تختفي من الأرشيف وتتمسح فعليًا من قاعدة البيانات', async ({ page }) => {
  const title = `اختبار E2E حذف نهائي - قضية ${Date.now()}`;

  await login(page);
  await createAndArchiveCase(page, title);

  await openAdminArchiveTab(page, 'cases');

  const row = page.getByTestId('archive-row').filter({ hasText: title });
  await row.first().waitFor({ state: 'visible', timeout: 10_000 });

  await row.getByTestId('archive-row-delete').click();

  // لازم كتابة اسم القضية بالظبط عشان يتفعّل زرار التأكيد (isMatch في DeleteConfirmModal)
  await page.getByTestId('admin-archive-delete-input').fill(title);
  await page.getByTestId('admin-archive-delete-confirm').click();

  // الصف يختفي من شاشة الأرشيف بعد نجاح الحذف
  await expect(page.getByTestId('archive-row').filter({ hasText: title })).toHaveCount(0, { timeout: 10_000 });

  // ── تأكيد فعلي من قاعدة البيانات: الصف اتمسح خالص (مش deleted_at بس) ──
  const supa = await connectAsTestUser();
  const { data, error } = await supa.from('cases').select('id').eq('title', title).maybeSingle();
  if (error) throw error;
  expect(data).toBeNull();
});
