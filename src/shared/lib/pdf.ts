// خط الطباعة/التصدير الموحّد لكل مسارات PDF في النظام
// ══════════════════════════════════════════════════════════════
//  خط الطباعة/التصدير الموحّد لكل مسارات PDF في النظام
//  (مذكرات AI، تفاصيل القضية/الجلسة، إيصالات الأتعاب)
//  Amiri: خط نسخ عربي كلاسيكي مناسب للمستندات الرسمية والقانونية
//  Cairo: احتياطي حديث لو Amiri اتأخر في التحميل
// ══════════════════════════════════════════════════════════════
export const PDF_FONT_FAMILY = "'Amiri','Cairo',serif";
export const PDF_FONT_LINK =
    '<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">';
export const PDF_PRINT_STYLE =
    `<style>@page{margin:2cm;}body{font-family:${PDF_FONT_FAMILY};}</style>`;

// خط الإيصالات/الفواتير — مختلف عمدًا عن خط المستندات القانونية (Amiri)
// لأنه هوية بصرية تجارية (Cairo) مش مستند رسمي بصيغة قانونية
export const RECEIPT_FONT_FAMILY = "Cairo,sans-serif";
