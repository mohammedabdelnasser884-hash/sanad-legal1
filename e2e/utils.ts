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
// ⚠️ لازم نملأ نفس الحقول الإلزامية الخمسة المستخدمة في cases.spec.ts
// (العنوان + الموكل + صفته + الخصم + صفته) — NewCaseModal.tsx بيعتبرهم
// required:true كلهم، فلو حقل ناقص الفورم بيرفض الحفظ ويفضل مفتوح،
// والانتظار بعد كده لظهور الكارت بيعمل timeout بدل ما يفشل برسالة واضحة.
export async function createCase(page: Page, title: string): Promise<void> {
  await page.getByTestId('nav-cases').click();
  await page.getByTestId('new-case-button').click();
  await page.getByTestId('new-case-title').fill(title);
  await page.getByTestId('new-case-client-name').fill('موكل اختبار E2E');
  await page.getByTestId('new-case-client-capacity').fill('مدعي');
  await page.getByTestId('new-case-opponent').fill('خصم اختبار E2E');
  await page.getByTestId('new-case-opponent-capacity').fill('مدعى عليه');
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

// خطوة 7+ (لوحة الأدمن / الأرشيف) — إنشاء قضية وأرشفتها (نفس خطوات
// archive.spec.ts الأصلية بالحرف) عشان الاختبارات اللي محتاجة قضية
// مؤرشفة كنقطة بداية (استرجاع / حذف نهائي من شاشة الأرشيف) متكررش
// نفس التسلسل. بيسيب الصفحة بعد إغلاق شاشة تفاصيل القضية مباشرة.
export async function createAndArchiveCase(page: Page, title: string): Promise<void> {
  await createAndOpenCase(page, title);
  await page.getByTestId('case-delete-trigger').click();
  await page.getByTestId('case-delete-local-confirm').click();
  await page.getByTestId('archive-confirm-choice-archive').click();
  await page.getByTestId('archive-confirm-input').fill(title);
  await page.getByTestId('archive-confirm-button').click();
  await page.getByTestId('case-detail-view').waitFor({ state: 'hidden', timeout: 10_000 });
}

// خطوة 7+ — فتح شاشة "الأرشيف" جوه لوحة الإدارة (nav-more-toggle →
// nav-more-admin → قسم الأرشيف)، وتحديد تبويب فرعي معيّن (قضايا/موكلين/أتعاب).
export async function openAdminArchiveTab(
  page: Page,
  tab: 'cases' | 'clients' | 'fees' = 'cases'
): Promise<void> {
  await page.getByTestId('nav-more-toggle').click();
  await page.getByTestId('nav-more-admin').click();
  await page.getByTestId('admin-section-archive').click();
  await page.getByTestId('archive-tab-' + tab).click();
}

// خطوة 6 (فاليديشن) — التأكد من ظهور رسالة توست بنص معيّن ولونها بيطابق
// حالة الخطأ (نفس آلية toast() في shared/lib/notifications.ts — بتلوّن
// الحدود/النص بالأحمر #f87171 لما isErr=true، وبتضيف class 'show').
export async function expectToast(page: Page, text: string): Promise<void> {
  const toastEl = page.locator('#toast');
  await expect(toastEl).toHaveClass(/show/, { timeout: 5_000 });
  await expect(toastEl).toHaveText(text);
}
