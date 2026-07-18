import { describe, it, expect } from 'vitest';
import { formatArDate, formatArDateTime, formatArTime, formatArNumber } from './arabicLocale';

// ── الاختبارات هنا بتحوّل الأرقام العربية-الهندية (١٢٣) والفواصل
//    الخاصة (٬ ٫) لأرقام/فواصل غربية عادية قبل المقارنة. السبب: ناتج
//    toLocaleString بيختلف شكله (اتجاه العلامات، نوع الفاصلة) حسب نسخة
//    ICU المتاحة في البيئة، فمقارنة السلسلة النصية الكاملة حرفيًا هشة
//    ومعرّضة لفشل زائف مش متعلق بمنطق الكود. اللي بنتأكد منه فعليًا هو
//    القيم الرقمية نفسها (السنة، الفاصل الألفي)، مش شكل العرض بالحرف.
function toWesternDigits(s: string): string {
    return s
        .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/\u066c/g, ',')
        .replace(/\u066b/g, '.')
        .replace(/[\u200e\u200f]/g, '');
}

describe('formatArDate', () => {
    it('بترجع تقويم ميلادي دايمًا (مش هجري) — الاختبار الأهم هنا', () => {
        const d = new Date(Date.UTC(2026, 6, 16)); // 16 يوليو 2026 ميلادي
        const result = toWesternDigits(formatArDate(d));
        // لو رجعت هجري كانت هتبقى سنة قريبة من ١٤٤٧ مش ٢٠٢٦
        expect(result).toContain('2026');
        expect(result).not.toMatch(/144[0-9]/);
    });

    it('تتعامل صح مع Date object كمدخل', () => {
        const d = new Date(Date.UTC(2026, 0, 1));
        expect(toWesternDigits(formatArDate(d))).toContain('2026');
    });

    it('تتعامل صح مع string (ISO) كمدخل', () => {
        expect(toWesternDigits(formatArDate('2026-01-01T00:00:00Z'))).toContain('2026');
    });

    it('تتعامل صح مع number (timestamp) كمدخل', () => {
        const ts = Date.UTC(2026, 0, 1);
        expect(toWesternDigits(formatArDate(ts))).toContain('2026');
    });
});

describe('formatArNumber', () => {
    it('تنسيق رقم بفواصل آلاف صحيح', () => {
        expect(toWesternDigits(formatArNumber(1234567))).toBe('1,234,567');
    });

    it('تنسيق رقم بكسر عشري صحيح', () => {
        expect(toWesternDigits(formatArNumber(1234567.5))).toBe('1,234,567.5');
    });

    it('رقم أصغر من 1000 → من غير فاصل آلاف', () => {
        expect(toWesternDigits(formatArNumber(500))).toBe('500');
    });
});

describe('formatArDateTime و formatArTime', () => {
    it('formatArDateTime بترجع تاريخ ووقت مع تقويم ميلادي', () => {
        const d = new Date(Date.UTC(2026, 6, 16, 12, 0, 0));
        expect(toWesternDigits(formatArDateTime(d))).toContain('2026');
    });

    it('formatArTime بترجع وقت من غير ما ترمي خطأ لأنواع الإدخال المختلفة', () => {
        expect(() => formatArTime(new Date())).not.toThrow();
        expect(() => formatArTime(Date.now())).not.toThrow();
        expect(() => formatArTime(new Date().toISOString())).not.toThrow();
    });
});
