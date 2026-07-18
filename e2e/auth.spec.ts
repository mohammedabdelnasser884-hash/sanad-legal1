import { test, expect } from '@playwright/test';

// خطوة 1 من مرحلة 7 (E2E) — تسجيل الدخول بس.
// البيانات بتيجي من env vars (Codespace secrets)، عشان محدش يحتاج
// يكتب إيميل/باسورد التينانت التجريبي جوه الكود.
const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;

test.beforeAll(() => {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      'لازم تضبط E2E_TEST_EMAIL و E2E_TEST_PASSWORD كـ Codespace secrets قبل تشغيل تستات E2E.'
    );
  }
});

test('تسجيل الدخول ببيانات صحيحة يودّي للداشبورد', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('login-email').fill(EMAIL!);
  await page.getByTestId('login-password').fill(PASSWORD!);
  await page.getByTestId('login-submit').click();

  // بعد الدخول الناجح، App.tsx بيرندر الـ shell (data-testid="app-shell")
  // بدل شاشة تسجيل الدخول.
  await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('login-email')).not.toBeVisible();
});

test('تسجيل الدخول ببيانات غلط بيرجّع رسالة خطأ موحّدة', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('login-email').fill('wrong-user-not-real@law.com');
  await page.getByTestId('login-password').fill('wrong-password-123');
  await page.getByTestId('login-submit').click();

  await expect(page.getByTestId('login-error')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('app-shell')).not.toBeVisible();
});
