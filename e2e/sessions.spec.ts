import { test, expect } from '@playwright/test';
import { login, createAndOpenCase } from './utils';

// خطوة 3 من مرحلة 7 (E2E) — تسجيل جلسة.
// بتستخدم helper إنشاء/فتح قضية (نفس منطق خطوة 2) عشان توصل لشاشة
// تفاصيل القضية، وبعدين تضيف جلسة من TimelineSection.

test('إضافة جلسة جديدة للقضية وظهورها في التايم لاين', async ({ page }) => {
  await login(page);

  const caseTitle = `اختبار E2E - قضية 3 - ${Date.now()}`;
  await createAndOpenCase(page, caseTitle);

  // نص وصف الجلسة فريد لكل تشغيل، عشان نميّزه عن أي جلسات تانية
  // في نفس التينانت التجريبي.
  const sessionDescription = `اختبار E2E - وصف جلسة ${Date.now()}`;

  // 1) فتح فورم إضافة جلسة (شاشة تفاصيل القضية بتفتح افتراضيًا على
  // تبويب "الجلسات"، فمفيش داعي نضغط عليه، بس بنتأكد إنه ظاهر).
  await expect(page.getByTestId('case-tab-timeline')).toBeVisible();
  await page.getByTestId('add-session-button').click();

  // 2) اختيار تاريخ الجلسة (بنختار "النهاردة" — الشهر المعروض افتراضيًا
  // في الـ DatePicker هو شهر النهاردة، فرقم اليوم الحالي ظاهر مباشرة).
  await page.getByTestId('session-date-trigger').click();
  const today = new Date().getDate().toString();
  await page.getByTestId('session-date-day').filter({ hasText: new RegExp(`^${today}$`) }).click();

  // 3) اختيار وقت الجلسة "مسائي" (مختلف عن الافتراضي "صباحي")، عشان
  // نتأكد إن الاختيار فعليًا بيتسجل مش بس بيقبل القيمة الافتراضية.
  await page.getByTestId('session-time-مسائي').click();

  // 4) وصف الجلسة
  await page.getByTestId('session-description').fill(sessionDescription);

  // 5) الحفظ — useCaseSessions.handleAddSession بيقفل الفورم
  // (setShowAddSession(false)) ويعمل refetchAll() لو نجح.
  await page.getByTestId('save-session-button').click();

  await expect(page.getByTestId('session-description')).not.toBeVisible({ timeout: 15_000 });

  // 6) التأكد إن الجلسة ظهرت في التايم لاين بالوصف اللي كتبناه.
  const newSessionCard = page.getByTestId('session-card').filter({ hasText: sessionDescription });
  await expect(newSessionCard.first()).toBeVisible({ timeout: 15_000 });
});
