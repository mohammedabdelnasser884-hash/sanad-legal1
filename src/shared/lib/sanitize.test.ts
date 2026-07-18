import { describe, it, expect } from 'vitest';
import { escapeHtml, ilikeOrClause, escapeTelegramHtml } from './sanitize';

describe('escapeHtml', () => {
    it('نص عادي → يرجع زي ما هو', () => {
        expect(escapeHtml('hello world')).toBe('hello world');
    });

    it('<script>alert(1)</script> → يتحول لكيانات HTML آمنة بالكامل', () => {
        expect(escapeHtml('<script>alert(1)</script>')).toBe(
            '&lt;script&gt;alert(1)&lt;/script&gt;'
        );
    });

    it('علامات اقتباس مزدوجة ومفردة → تتحول صح', () => {
        expect(escapeHtml(`He said "hi" and 'bye'`)).toBe(
            'He said &quot;hi&quot; and &#39;bye&#39;'
        );
    });

    it('& لوحدها → &amp; (لازم قبل أي تهريب تاني، وإلا تتضاعف)', () => {
        expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('null → نص فاضي من غير ما يرمي خطأ', () => {
        expect(escapeHtml(null)).toBe('');
    });

    it('undefined → نص فاضي من غير ما يرمي خطأ', () => {
        expect(escapeHtml(undefined)).toBe('');
    });

    it('رقم كمدخل → يتحول لنص من غير ما يرمي خطأ', () => {
        expect(escapeHtml(123)).toBe('123');
    });

    it('نص عربي مختلط بعلامات خاصة → يتهرّب صح مع الحفاظ على النص العربي', () => {
        expect(escapeHtml('اسم الموكل: "أحمد" <محامي>')).toBe(
            'اسم الموكل: &quot;أحمد&quot; &lt;محامي&gt;'
        );
    });
});

describe('escapeTelegramHtml', () => {
    it('نص عادي → يرجع زي ما هو', () => {
        expect(escapeTelegramHtml('hello')).toBe('hello');
    });

    it('يهرّب & < > بس، ومش بيهرّب علامات الاقتباس (تيليجرام مش محتاجها)', () => {
        expect(escapeTelegramHtml('<a href="x">link</a> & more')).toBe(
            '&lt;a href="x"&gt;link&lt;/a&gt; &amp; more'
        );
    });

    it('null → نص فاضي من غير ما يرمي خطأ', () => {
        expect(escapeTelegramHtml(null)).toBe('');
    });
});

describe('ilikeOrClause', () => {
    it('حالة بسيطة → يلف النتيجة بـ % وعلامات اقتباس', () => {
        expect(ilikeOrClause('client_name', 'ahmed')).toBe(
            'client_name.ilike."%ahmed%"'
        );
    });

    it('فاصلة وأقواس داخل نص البحث → تتحفظ حرفيًا جوه علامات الاقتباس من غير ما تكسر شرط الـ OR', () => {
        expect(ilikeOrClause('notes', 'a,b(c)')).toBe(
            'notes.ilike."%a,b(c)%"'
        );
    });

    it('علامة اقتباس مزدوجة جوه نص البحث → تتهرّب بـ backslash', () => {
        expect(ilikeOrClause('notes', 'say "hi"')).toBe(
            'notes.ilike."%say \\"hi\\"%"'
        );
    });

    it('backslash جوه نص البحث → يتضاعف (تهريب صحيح)', () => {
        expect(ilikeOrClause('notes', 'a\\b')).toBe(
            'notes.ilike."%a\\\\b%"'
        );
    });

    it('% و _ (خاصين في SQL LIKE) داخل نص البحث → بيتحطوا حرفيًا من غير كسر الاستعلام', () => {
        expect(ilikeOrClause('notes', '50%_off')).toBe(
            'notes.ilike."%50%_off%"'
        );
    });

    it('نص بحث فاضي → برضه بيرجع شرط صالح من غير خطأ', () => {
        expect(ilikeOrClause('notes', '')).toBe('notes.ilike."%%"');
    });
});
