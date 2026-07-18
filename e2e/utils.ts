import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

// خطوة 2+ من مرحلة 7 (E2E) — هيلبر تسجيل دخول مشترك.
// كل خطوة بعد الأولى محتاجة تعدّي شاشة الدخول الأول عشان توصل للشاشة
// اللي هتختبرها. بدل ما نكرر نفس الأربع سطور في كل ملف تست، بنلمّها هنا.
// (ملف auth.spec.ts بتاع خطوة 1 اتسيب زي ما هو من غير تعديل، لحد ما
// يتأكد بتشغيل فعلي — التعديل فيه دلوقتي هيبقى مخاطرة غير ضرورية.)
export async function login(page: Page): Promise<void> {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'لازم تضبط E2E_TEST_EMAIL و E2E_TEST_PASSWORD كـ Codespace secrets قبل تشغيل تستات E2E.'
    );
  }

  await page.goto('/');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await page.getByTestId('app-shell').waitFor({ state: 'visible', timeout: 15_000 });
}

// خطوة 4 محتاجة قضية موجودة (عشان تظهر في قايمة "القضية" وقت إضافة
// الأتعاب) من غير ما يكون لازم تتفتح فعليًا — فصلنا جزء الإنشاء لوحده
// عن جزء الفتح، وخلّينا createAndOpenCase يستخدم النسخة دي بدل ما
// يكرر نفس الأربع سطور.
export async function createCase(page: Page, title: string): Promise<void> {
  await page.getByTestId('nav-cases').click();
  await page.getByTestId('new-case-button').click();
  await page.getByTestId('new-case-title').fill(title);
  await page.getByTestId('new-case-save').click();

  const card = page.getByTestId('case-card').filter({ hasText: title });
  await card.first().waitFor({ state: 'visible', timeout: 15_000 });
}

// خطوة 3+ — خطوات زي "تسجيل جلسة"/"إضافة أتعاب"/"أرشفة" محتاجة قضية
// مفتوحة عشان تبدأ منها. بدل ما كل ملف يكرر نفس خطوات إنشاء وفتح
// القضية (نفس منطق cases.spec.ts بتاع خطوة 2)، الهيلبر ده بيعمل الاتنين
// ويسيب الصفحة على شاشة تفاصيل القضية (case-detail-view) جاهزة.
// (نفس ملحوظة auth.spec.ts فوق: cases.spec.ts اتسيب من غير تعديل عمدًا.)
export async function createAndOpenCase(page: Page, title: string): Promise<void> {
  await createCase(page, title);
  const card = page.getByTestId('case-card').filter({ hasText: title });
  await card.first().click();
  await page.getByTestId('case-detail-view').waitFor({ state: 'visible', timeout: 10_000 });
}

// خطوة 6 (فاليديشن) — التأكد من ظهور رسالة توست بنص معيّن ولونها بيطابق
// حالة الخطأ (نفس آلية toast() في shared/lib/notifications.ts — بتلوّن
// الحدود/النص بالأحمر #f87171 لما isErr=true، وبتضيف class 'show').
export async function expectToast(page: Page, text: string): Promise<void> {
  const toastEl = page.locator('#toast');
  await expect(toastEl).toHaveClass(/show/, { timeout: 5_000 });
  await expect(toastEl).toHaveText(text);
}
