export const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
export const DAYS_AR   = ["أح","إث","ث","أر","خ","ج","س"];

// ══════════════════════════════════════════════════════════════
//  توحيد الـ locale لكل عرض تاريخ/رقم في التطبيق على 'ar-EG'.
//
//  ⚠️ السبب الحقيقي وراء توحيدها هنا (مش شكلي بس):
//  الكود كان فيه خلط بين 'ar-SA' و'ar-EG' من غير أي داعٍ في أماكن
//  زي الفواتير وسجل النشاط والتذكيرات (غير مرتبطة بإعداد دولة المكتب
//  في COUNTRY_CONFIGS إطلاقًا — دي مجرد نصوص عرض ثابتة).
//  المشكلة إن بعض المتصفحات (تحديدًا Safari/WebKit قديمًا) كانت بتـ
//  default لـ 'ar-SA' على التقويم الهجري بدل الميلادي لو مفيش
//  calendar: 'gregory' متحدد صراحةً — يعني ممكن مستخدم Safari يشوف
//  تاريخ جلسة أو فاتورة بالتقويم الهجري من غير أي تحذير، وده خطر
//  حقيقي في تطبيق قانوني بيتتبع مواعيد جلسات ومواعيد نهائية.
//  الحل: دالة واحدة موحّدة، بتفرض 'ar-EG' + calendar: 'gregory'
//  صراحةً، تُستخدم في كل مكان بدل التكرار المباشر لـ toLocaleDateString.
//
//  ⚠️ استثناء متعمّد: useAIAssistant.ts بيستخدم 'ar-SA-u-nu-latn' في
//  سياق مختلف تمامًا (نص يتغذى بيه الـ AI عن تاريخ النهاردة كسياق
//  قانوني)، ومش عرض للمستخدم على الشاشة — فمش جزء من هذا التوحيد.
// ══════════════════════════════════════════════════════════════
const AR_LOCALE = 'ar-EG';

function toDate(value: Date | string | number): Date {
    return value instanceof Date ? value : new Date(value);
}

export function formatArDate(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
    return toDate(value).toLocaleDateString(AR_LOCALE, { calendar: 'gregory', ...options });
}

export function formatArDateTime(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
    return toDate(value).toLocaleString(AR_LOCALE, { calendar: 'gregory', ...options });
}

export function formatArTime(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
    return toDate(value).toLocaleTimeString(AR_LOCALE, options);
}

export function formatArNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return value.toLocaleString(AR_LOCALE, options);
}
