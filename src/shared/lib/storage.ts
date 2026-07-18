// روابط Storage الموقّعة + فحص ملفات الرفع
import { useState, useEffect } from 'react';
import { db } from '../../supabaseClient';

// ══════════════════════════════════════════════════════════════
//  روابط Storage الموقّعة (Signed URLs)
//  ⚠️ باكتس case-docs / client-docs كانت public بالكامل — أي حد
//  عنده رابط الملف (حتى لو مش مسجّل دخول) كان يقدر يفتح مستندات
//  القضايا وصور هوية/توكيل العملاء مباشرة. اتقفلت الباكتس دلوقتي
//  (public = false)، فأي ملف محتاج رابط موقّع مؤقت الصلاحية بدل
//  الرابط العام الثابت. الدوال دي بتغطي التوليد + التوافق مع أي
//  سجلات قديمة اتحفظت وهي لسه شايلة رابط عام/موقّع سابق.
// ══════════════════════════════════════════════════════════════

const DEFAULT_SIGNED_URL_TTL = 3600 * 6; // 6 ساعات — كفاية لجلسة استخدام عادية

/** يستخرج المسار الداخلي للملف جوه الباكت من رابط (عام أو موقّع قديم).
 *  لو القيمة مسار مجرد أصلاً (مفيهاش http)، بترجع زي ما هي. */
export function extractStoragePath(bucket: string, urlOrPath: string | null | undefined): string | null {
    if (!urlOrPath) return null;
    if (!/^https?:\/\//i.test(urlOrPath)) return urlOrPath.split('?')[0];
    const markers = [
        `/storage/v1/object/public/${bucket}/`,
        `/storage/v1/object/sign/${bucket}/`,
        `/storage/v1/object/authenticated/${bucket}/`,
    ];
    for (const marker of markers) {
        const idx = urlOrPath.indexOf(marker);
        if (idx !== -1) {
            const raw = urlOrPath.slice(idx + marker.length).split('?')[0];
            try { return decodeURIComponent(raw); } catch { return raw; }
        }
    }
    return null;
}

/** بيرجع رابط موقّع مؤقت لملف جوه باكت خاص.
 *  @returns null لو المسار فاضي أو فشل التوليد (اتمسح الملف، صلاحيات...) */
export async function getSignedUrl(bucket: string, path: string | null | undefined, expiresIn = DEFAULT_SIGNED_URL_TTL): Promise<string | null> {
    if (!path) return null;
    try {
        const { data, error } = await db.storage.from(bucket).createSignedUrl(path, expiresIn);
        if (error || !data) return null;
        return data.signedUrl;
    } catch {
        return null;
    }
}

/** نسخة مرنة بتقبل مسار مجرد أو رابط (عام/موقّع، حتى لو قديم/منتهي) وترجع
 *  رابط موقّع طازة صالح للاستخدام فورًا. ده اللي المفروض يُستخدم في كل
 *  حتة بتقرا file_url/id_url/poa_url/logo_url محفوظين من قبل. */
export async function resolveStorageUrl(bucket: string, pathOrUrl: string | null | undefined, expiresIn = DEFAULT_SIGNED_URL_TTL): Promise<string | null> {
    const path = extractStoragePath(bucket, pathOrUrl);
    return getSignedUrl(bucket, path, expiresIn);
}

/** Hook: بيرجع رابط موقّع طازة لملف في باكت خاص، وبيعيد توليده تلقائيًا
 *  كل ما المصدر (pathOrUrl) يتغيّر — مفيد لمعاينة صور id/poa/logo في
 *  المودالات. لو القيمة معاينة محلية (blob:/data:) بترجع زي ما هي من
 *  غير أي استدعاء لـ Storage. */
export function useResolvedStorageUrl(bucket: string, pathOrUrl: string | null | undefined, expiresIn = DEFAULT_SIGNED_URL_TTL): string | null {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        if (!pathOrUrl) { setUrl(null); return; }
        if (pathOrUrl.startsWith('blob:') || pathOrUrl.startsWith('data:')) { setUrl(pathOrUrl); return; }
        resolveStorageUrl(bucket, pathOrUrl, expiresIn).then((u) => { if (!cancelled) setUrl(u); });
        return () => { cancelled = true; };
    }, [bucket, pathOrUrl, expiresIn]);
    return url;
}

// ══════════════════════════════════════════════════════════════
//  validateUploadFile — فحص نوع وحجم الملف قبل رفعه على Storage
//
//  ⚠️ المشكلة: كان أي مستخدم يقدر يرفع ملف بأي امتداد (حتى .html
//  أو .svg) على باكتس عامة (case-docs / client-docs)، وبعد كده
//  الرابط (getPublicUrl) بيُفتح مباشرة في تاب جديد (target=_blank)
//  من غير ما يتحمّل كملف. لو الملف .html أو .svg فيه <script>،
//  الكود بيتنفذ فورًا في متصفح أي حد فاتح اللينك — حتى لو مش
//  مسجّل دخول في النظام، لأن الرابط عام (Stored XSS via upload).
//
//  الحل: قائمة بيضاء (whitelist) لامتدادات مستندات قانونية فعلية
//  فقط، وحد أقصى لحجم الملف. لازم تُستخدم في كل مكان بيرفع ملف
//  حر من المستخدم قبل استدعاء storage.upload().
//
//  @returns null لو الملف سليم، أو رسالة خطأ بالعربي توضّح للمستخدم
//  ليه الملف مرفوض.
// ══════════════════════════════════════════════════════════════
const ALLOWED_UPLOAD_EXTENSIONS = [
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'jpg', 'jpeg', 'png', 'gif', 'webp',
];
const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export function validateUploadFile(file: { name: string; size: number }): string | null {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_UPLOAD_EXTENSIONS.includes(ext)) {
        return `صيغة الملف ".${ext}" غير مسموحة. الصيغ المسموحة: PDF، Word، Excel، PowerPoint، أو صورة (jpg/png/gif/webp).`;
    }
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
        return 'حجم الملف أكبر من المسموح (20 ميجابايت كحد أقصى).';
    }
    return null;
}
