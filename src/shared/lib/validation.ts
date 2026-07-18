// دوال التحقق من صحة البيانات (Validation)
// ══════════════════════════════════════════════════════════════
//  دوال التحقق من صحة البيانات (Validation)
//  ── مرنة: بترجع رسالة تحذير بس، مفيش منع للحفظ ──
// ══════════════════════════════════════════════════════════════

/**
 * يتحقق من رقم الهاتف (مصر + دول الخليج)
 * يقبل: مسافات / شرطات / + في البداية — بيشيلهم قبل الفحص
 * @returns null لو الرقم سليم، أو رسالة تحذير بالعربي لو فيه مشكلة
 */
export function validatePhone(phone: string): string | null {
    if (!phone || !phone.trim()) return null; // حقل اختياري — مفيش تحذير لو فاضي

    const cleaned = phone.replace(/[\s-]/g, '');

    // مصر: 01[0125]xxxxxxxx (11 رقم) — مع أو بدون +20 / 0020
    const egyptPattern = /^(\+20|0020|0)?1[0125]\d{8}$/;

    // دول الخليج: +966/+971/+965/+973/+974/+968 + رقم محلي
    // (نطاق طول مرن 7-9 أرقام بعد كود الدولة لاختلاف الأنظمة بين الدول)
    const gulfPattern = /^(\+966|00966|\+971|00971|\+965|00965|\+973|00973|\+974|00974|\+968|00968)\d{7,9}$/;

    if (egyptPattern.test(cleaned) || gulfPattern.test(cleaned)) return null;

    return 'رقم الهاتف غير معتاد لمصر أو دول الخليج — تأكد منه';
}

/**
 * يحوّل رقم هاتف (بأي صيغة: مسافات / شرطات / + / أرقام محلية) لصيغة أرقام
 * فقط صالحة لروابط wa.me — نقطة موحّدة بدل تكرار regex التنظيف في كل مكوّن.
 * ⚠️ الدالة دي بتشيل غير الأرقام بس، ومفيهاش أي منطق تحقق أو كود دولة —
 * استخدم validatePhone لو محتاج تتأكد إن الرقم سليم أصلاً.
 * @returns سلسلة أرقام فقط، أو '' لو الإدخال فاضي
 */
export function formatPhoneForWhatsApp(phone: string | null | undefined): string {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
}

/**
 * يتحقق من صيغة البريد الإلكتروني (فحص عام بسيط)
 * @returns null لو سليم، أو رسالة تحذير
 */
export function validateEmail(email: string): string | null {
    if (!email || !email.trim()) return null; // حقل اختياري

    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (pattern.test(email.trim())) return null;

    return 'صيغة البريد الإلكتروني غير صحيحة';
}
