// ── FIX (1.3): حساب حالة الأتعاب (status) من الأرقام الفعلية ──
// نُقلت من useFeesActions.ts (كانت معرّفة جوه الـ hook) بدون أي تغيير
// في السلوك — دالة نقية معزولة عشان تتاح للاستيراد من ملف الاختبار.
export function computeFeeStatus(total: number, paid: number): 'collected'|'deferred'|'open' {
    const t = total || 0, p = paid || 0;
    if (t <= 0) return 'open';
    if (p >= t) return 'collected';
    return 'deferred';
}
