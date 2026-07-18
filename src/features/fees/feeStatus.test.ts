import { describe, it, expect } from 'vitest';
import { computeFeeStatus } from './feeStatus';

describe('computeFeeStatus', () => {
    it('total=0 → open (لا توجد أتعاب متفق عليها بعد)', () => {
        expect(computeFeeStatus(0, 0)).toBe('open');
    });

    it('paid=0, total=1000 → deferred (لسه مفيش أي دفعة، مش open)', () => {
        expect(computeFeeStatus(1000, 0)).toBe('deferred');
    });

    it('paid=500, total=1000 → deferred', () => {
        expect(computeFeeStatus(1000, 500)).toBe('deferred');
    });

    it('paid=1000, total=1000 → collected (مطابقة تامة)', () => {
        expect(computeFeeStatus(1000, 1000)).toBe('collected');
    });

    it('paid=1200, total=1000 → collected (دفعة زايدة عن المتفق عليه)', () => {
        expect(computeFeeStatus(1000, 1200)).toBe('collected');
    });

    it('paid=999.99, total=1000 → deferred (فرق كسر عشري بسيط)', () => {
        expect(computeFeeStatus(1000, 999.99)).toBe('deferred');
    });

    it('total=null/undefined → open (من غير ما يرمي خطأ)', () => {
        // @ts-expect-error - اختبار قصدًا لمدخلات غير متوقعة من DB
        expect(computeFeeStatus(null, 500)).toBe('open');
        // @ts-expect-error - اختبار قصدًا لمدخلات غير متوقعة من DB
        expect(computeFeeStatus(undefined, 500)).toBe('open');
    });

    it('paid=null/undefined مع total>0 → deferred (لسه فيه مبلغ متبقي، مش open)', () => {
        // @ts-expect-error - اختبار قصدًا لمدخلات غير متوقعة من DB
        expect(computeFeeStatus(1000, null)).toBe('deferred');
        // @ts-expect-error - اختبار قصدًا لمدخلات غير متوقعة من DB
        expect(computeFeeStatus(1000, undefined)).toBe('deferred');
    });
});
