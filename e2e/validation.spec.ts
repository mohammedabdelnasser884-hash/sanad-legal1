import { test, expect } from '@playwright/test';
import { login, createCase, expectToast } from './utils';

// خطوة 6 من مرحلة 7 (E2E) — فاليديشن الحقول المطلوبة (دفعة الباگات
// الخمسة اللي اتصلحت في 17/7: عنوان قضية فاضي، أتعاب من غير قضية،
// أتعاب من غير مبلغ، أتعاب بمبلغ سالب، موكل بدون اسم).
//
// كل تست بيتأكد من حاجتين: (1) رسالة التوست الصحيحة ظهرت فعليًا في
// المتصفح، و(2) السجل فعليًا ما اتحفظش (الفورم لسه مفتوح / مفيش كارت جديد).

test.describe('فاليديشن الحقول المطلوبة', () => {
  test('قضية بعنوان فاضي → رسالة خطأ، والفورم يفضل مفتوح من غير حفظ', async ({ page }) => {
    await login(page);
    await page.getByTestId('nav-cases').click();
    await page.getByTestId('new-case-button').click();

    // مفيش أي كتابة في new-case-title — بنحاول نحفظ فورًا
    await page.getByTestId('new-case-save').click();

    await expectToast(page, 'يرجى إدخال موضوع الدعوى');
    // الفورم لسه مفتوح (زرار الحفظ لسه ظاهر) — يعني ما اتقفلش زي الحفظ الناجح
    await expect(page.getByTestId('new-case-save')).toBeVisible();
  });

  test('أتعاب من غير اختيار قضية → رسالة "القضية مطلوب"، ومفيش حفظ', async ({ page }) => {
    await login(page);
    const caseTitle = `اختبار E2E - فاليديشن أتعاب 1 - ${Date.now()}`;
    await createCase(page, caseTitle);

    await page.getByTestId('nav-more-toggle').click();
    await page.getByTestId('nav-more-fees').click();
    await page.getByTestId('add-fee-button').click();

    // نملى المبلغ بس من غير ما نختار قضية
    await page.getByTestId('fee-total').fill('1000');
    await page.getByTestId('save-fee-button').click();

    await expectToast(page, '❌ حقل "القضية" مطلوب — يرجى اختيار القضية');
    await expect(page.getByTestId('save-fee-button')).toBeVisible();
  });

  test('أتعاب من غير مبلغ → رسالة "الإجمالي مطلوب"، ومفيش حفظ', async ({ page }) => {
    await login(page);
    const caseTitle = `اختبار E2E - فاليديشن أتعاب 2 - ${Date.now()}`;
    await createCase(page, caseTitle);

    await page.getByTestId('nav-more-toggle').click();
    await page.getByTestId('nav-more-fees').click();
    await page.getByTestId('add-fee-button').click();

    await page.getByTestId('fee-case-select').selectOption({ label: caseTitle });
    // مفيش كتابة في fee-total خالص
    await page.getByTestId('save-fee-button').click();

    await expectToast(page, '❌ حقل "إجمالي الأتعاب" مطلوب');
    await expect(page.getByTestId('save-fee-button')).toBeVisible();
  });

  test('أتعاب بمبلغ سالب → رسالة خطأ، ومفيش حفظ', async ({ page }) => {
    await login(page);
    const caseTitle = `اختبار E2E - فاليديشن أتعاب 3 - ${Date.now()}`;
    await createCase(page, caseTitle);

    await page.getByTestId('nav-more-toggle').click();
    await page.getByTestId('nav-more-fees').click();
    await page.getByTestId('add-fee-button').click();

    await page.getByTestId('fee-case-select').selectOption({ label: caseTitle });
    await page.getByTestId('fee-total').fill('-500');
    await page.getByTestId('save-fee-button').click();

    await expectToast(page, '❌ خطأ: إجمالي الأتعاب لا يمكن أن يكون سالباً');
    await expect(page.getByTestId('save-fee-button')).toBeVisible();
  });

  test('موكل جديد بدون اسم → رسالة خطأ، والمودال يفضل مفتوح', async ({ page }) => {
    await login(page);
    await page.getByTestId('nav-more-toggle').click();
    await page.getByTestId('nav-more-clients').click();
    await page.getByTestId('new-client-button').click();

    // مفيش كتابة في new-client-name خالص
    await page.getByTestId('save-client-button').click();

    await expectToast(page, 'يرجى إدخال اسم الموكل');
    await expect(page.getByTestId('save-client-button')).toBeVisible();
  });

  test('تعديل موكل موجود ومسح اسمه بالكامل → رسالة خطأ، ومفيش حفظ للتعديل', async ({ page }) => {
    await login(page);
    await page.getByTestId('nav-more-toggle').click();
    await page.getByTestId('nav-more-clients').click();

    // بننشئ موكل خاص بالتست ده عشان الاختبار يكون مستقل ومحكوم بالكامل،
    // مش معتمد على وجود موكل جاهز في التينانت التجريبي من تشغيلات سابقة.
    const clientName = `اختبار E2E - موكل فاليديشن - ${Date.now()}`;
    await page.getByTestId('new-client-button').click();
    await page.getByTestId('new-client-name').fill(clientName);
    await page.getByTestId('save-client-button').click();

    const newClientCard = page.getByTestId('client-card').filter({ hasText: clientName });
    await expect(newClientCard.first()).toBeVisible({ timeout: 15_000 });

    await newClientCard.first().click();
    await page.getByTestId('client-detail-view').waitFor({ state: 'visible', timeout: 10_000 });

    await page.getByTestId('client-edit-trigger').click();
    await page.getByTestId('edit-client-name').fill('');
    await page.getByTestId('save-client-edit-button').click();

    await expectToast(page, 'يرجى إدخال اسم الموكل');
    // المودال لسه مفتوح
    await expect(page.getByTestId('save-client-edit-button')).toBeVisible();
  });
});
