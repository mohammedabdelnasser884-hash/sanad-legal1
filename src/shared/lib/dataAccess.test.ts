import { describe, it, expect, vi } from 'vitest';
import { safeUpdate } from './dataAccess';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../database.types';

// toast() بيعتمد على document.getElementById (DOM) — مش موضوع الاختبار
// هنا (منطق التعارض نفسه)، فبنعمله mock بسيط عشان الاختبار يفضل معزول
// وميحتاجش بيئة jsdom كاملة عشان يشتغل.
vi.mock('./notifications', () => ({ toast: vi.fn() }));

// ── Mock بسيط لسلسلة استدعاءات Supabase المستخدمة فعليًا جوه safeUpdate:
//    db.from(table).select('updated_at').eq('id', id).single()
//    db.from(table).update(data).eq('id', id)
function makeMockDb(opts: {
    serverUpdatedAt?: string | null;
    fetchError?: unknown;
    updateError?: unknown;
}) {
    const updateEq = vi.fn().mockResolvedValue({ error: opts.updateError ?? null });
    const update = vi.fn(() => ({ eq: updateEq }));

    const single = vi.fn().mockResolvedValue({
        data: opts.serverUpdatedAt ? { updated_at: opts.serverUpdatedAt } : null,
        error: opts.fetchError ?? null,
    });
    const selectEq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq: selectEq }));

    const from = vi.fn(() => ({ select, update }));
    return { from, update, updateEq, select, selectEq, single } as unknown as SupabaseClient<Database> & {
        update: typeof update; updateEq: typeof updateEq; select: typeof select; single: typeof single;
    };
}

describe('safeUpdate — القفل التفاؤلي (Optimistic Locking)', () => {
    it('تحديث بدون تعارض (وقت السيرفر = وقت العميل) → ينفذ عادي', async () => {
        const t = '2026-07-16T10:00:00.000Z';
        const mockDb = makeMockDb({ serverUpdatedAt: t });

        const result = await safeUpdate(mockDb, 'cases', 'case-1', { title: 'قضية معدّلة' }, t);

        expect(result).toEqual({ success: true, conflict: false, error: null });
        expect(mockDb.update).toHaveBeenCalledTimes(1);
    });

    it('تحديث بتعارض حقيقي (وقت السيرفر أحدث) → يرجع conflict:true من غير ما ينفذ', async () => {
        const clientTime = '2026-07-16T10:00:00.000Z';
        const serverTime = '2026-07-16T10:05:00.000Z'; // حد تاني عدّل بعد ما العميل جاب السجل
        const mockDb = makeMockDb({ serverUpdatedAt: serverTime });

        const result = await safeUpdate(mockDb, 'cases', 'case-1', { title: 'محاولة كتابة فوق تعديل حد تاني' }, clientTime);

        expect(result.success).toBe(false);
        expect(result.conflict).toBe(true);
        // أهم جزء في الاختبار ده: تأكيد إن الكتابة الفعلية ما حصلتش لما فيه تعارض
        expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('أول تحديث ناجح، ثم تحديث تاني فورًا باستخدام updated_at الجديد الصحيح → لا يُكتشف كتعارض وهمي مع نفسه', async () => {
        const t0 = '2026-07-16T10:00:00.000Z'; // وقت ما العميل جاب السجل أول مرة
        const t1 = '2026-07-16T10:00:05.000Z'; // updated_at الجديد بعد أول تحديث ناجح

        // التحديث الأول: السيرفر لسه على t0 (نفس وقت العميل) → ينجح
        const firstDb = makeMockDb({ serverUpdatedAt: t0 });
        const firstResult = await safeUpdate(firstDb, 'cases', 'case-1', { title: 'تعديل 1' }, t0);
        expect(firstResult).toEqual({ success: true, conflict: false, error: null });

        // التحديث الثاني الفوري: لو الكولر استخدم updated_at الجديد (t1) اللي
        // المفروض السيرفر رجّعه بعد التحديث الأول (زي ما __dbWrite بيعمل فعليًا) —
        // مينفعش يتكشف كتعارض وهمي مع نفسه
        const secondDb = makeMockDb({ serverUpdatedAt: t1 });
        const secondResult = await safeUpdate(secondDb, 'cases', 'case-1', { title: 'تعديل 2' }, t1);

        expect(secondResult).toEqual({ success: true, conflict: false, error: null });
        expect(secondDb.update).toHaveBeenCalledTimes(1);
    });

    it('لو مفيش knownUpdatedAt (سجل قديم من غير عمود) → UPDATE مباشر من غير أي تحقق مسبق', async () => {
        const mockDb = makeMockDb({});

        const result = await safeUpdate(mockDb, 'cases', 'case-1', { title: 'تعديل بدون تحقق' }, null);

        expect(result).toEqual({ success: true, conflict: false, error: null });
        // مفروض ميحصلش استدعاء select('updated_at') خالص في المسار ده
        expect(mockDb.select).not.toHaveBeenCalled();
        expect(mockDb.update).toHaveBeenCalledTimes(1);
    });

    it('لو فشل جلب updated_at الحالي (خطأ شبكة/RLS) → يرجع error من غير محاولة كتابة', async () => {
        const fetchError = { message: 'network error', code: 'PGRST000' };
        const mockDb = makeMockDb({ fetchError });

        const result = await safeUpdate(mockDb, 'cases', 'case-1', { title: 'تعديل' }, '2026-07-16T10:00:00.000Z');

        expect(result.success).toBe(false);
        expect(result.conflict).toBe(false);
        expect(result.error).toEqual(fetchError);
        expect(mockDb.update).not.toHaveBeenCalled();
    });
});
