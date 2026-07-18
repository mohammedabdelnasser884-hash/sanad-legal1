import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { login, createAndOpenCase } from './utils';

// خطوة 5 (الأخيرة) من مرحلة 7 — أرشفة قضية.
//
// ⚠️ ملحوظة منهجية مهمة (اتفق عليها مع جيمي قبل الكتابة):
// نص خطوة 5 الأصلي بيقول "التأكد من ظهورها في الأرشيف"، لكن بالفحص الفعلي
// للكود معرفنا إن مفيش شاشة "أرشيف قضايا" في الواجهة أصلاً — الأرشفة بتحدّث
// عمود deleted_at بس، وبتشيل القضية من القايمة النشطة، من غير أي مكان تاني
// تتعرض فيه. يعني نص الخطوة زي ما هو (بمعنى "تظهر في مكان تقدر تشوفها فيه")
// مش قابل للتنفيذ عن طريق تفاعل متصفح حقيقي دلوقتي.
// القرار: نتأكد من الجزء اللي فيه واجهة (الاختفاء من القايمة النشطة) عن طريق
// Playwright زي باقي الخطوات، ونتأكد من حصول الأرشفة فعليًا (deleted_at) عن
// طريق قراءة مباشرة (SELECT بس، بدون أي تعديل) لقاعدة البيانات — بنفس حساب
// المستخدم التجريبي، فمحكوم بنفس RLS المستخدم في باقي الخطوات.
test('أرشفة قضية: تختفي من القايمة النشطة، وتتأكد فعليًا في قاعدة البيانات', async ({ page }) => {
  const title = `اختبار E2E - قضية ${Date.now()}`;

  await login(page);
  await createAndOpenCase(page, title);

  // فتح مودال التأكيد المحلي (زرار السلة في شاشة تفاصيل القضية) والموافقة عليه
  await page.getByTestId('case-delete-trigger').click();
  await page.getByTestId('case-delete-local-confirm').click();

  // مودال الأرشفة الفعلي (على مستوى App، مشترك مع الموكلين) — لازم كتابة
  // اسم القضية بالظبط عشان يتفعّل زرار التأكيد (isMatch في DeleteConfirmModal)
  await page.getByTestId('archive-confirm-input').fill(title);
  await page.getByTestId('archive-confirm-button').click();

  // بعد النجاح: setSelectedCase(null) بتقفل شاشة التفاصيل
  await page.getByTestId('case-detail-view').waitFor({ state: 'hidden', timeout: 10_000 });

  // والقضية تتشال من قايمة الكروت النشطة (setCases فلترة الـ id)
  const card = page.getByTestId('case-card').filter({ hasText: title });
  await expect(card).toHaveCount(0);

  // ── تأكيد فعلي من قاعدة البيانات (قراءة فقط) ──
  const supaUrl = process.env.VITE_SUPABASE_URL;
  const supaKey = process.env.VITE_SUPABASE_ANON_KEY;
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!supaUrl || !supaKey || !email || !password) {
    throw new Error(
      'لازم VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY (زي ما التطبيق نفسه محتاجهم عشان يشغّل) و E2E_TEST_EMAIL/E2E_TEST_PASSWORD يكونوا متاحين كـ env vars.'
    );
  }

  const supa = createClient(supaUrl, supaKey);
  const { error: authError } = await supa.auth.signInWithPassword({ email, password });
  if (authError) throw authError;

  const { data, error } = await supa.from('cases').select('deleted_at').eq('title', title).single();
  if (error) throw error;
  expect(data?.deleted_at).not.toBeNull();
});
