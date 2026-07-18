import { useState, useEffect } from 'react';
import { db } from '../../../supabaseClient';
import { invalidateOfficeCache } from '../../../constants';
import { toast } from '../../../shared/lib/notifications';
import { showErrorToast } from '../../../shared/lib/errorReporting';
import type { ProfileRow } from '../../../types';

// ─────────────────────────────────────────────────────────
//  useAIApiKey — منقول حرفيًا من useAIAssistant.ts (دفعة 2):
//  حالة مفتاح Groq (hasKey/keyLoading/showKeyInput) + فحص
//  وجود المفتاح + saveKey. صفر تغيير في المنطق أو الصياغة.
// ─────────────────────────────────────────────────────────
export function useAIApiKey(profile: ProfileRow | null) {
    // ملحوظة أمان: مفتاح Groq بقى مخزّن على السيرفر فقط ولا يوصل للمتصفح إطلاقاً.
    // الفرونت إند بقى بس يعرف "فيه مفتاح مضبوط ولا لأ" (hasKey)، عشان يقرر
    // يعرض شاشة "ضبط المفتاح" أو لأ — مش هو اللي بيستخدم المفتاح في النداء.
    const [hasKey, setHasKey] = useState<boolean | null>(null); // null = لسه بنتحقق
    const [keyLoading, setKeyLoading] = useState(true);
    const [showKeyInput, setShowKeyInput] = useState(false);

    // ── نتحقق إن في مفتاح مضبوط للمكتب (من غير ما نجيب قيمته) ──
    useEffect(() => {
        let cancelled = false;
        const tenantId = profile?.tenant_id ?? null;
        const checkKey = async () => {
            setKeyLoading(true);
            if (!tenantId) { if (!cancelled) { setHasKey(false); setKeyLoading(false); } return; }
            try {
                // ✅ بعد نقل المفتاح لـ Vault، وجود المفتاح بيتحدد بعمود
                // groq_key_secret_id (مجرد uuid مرجعي، مش المفتاح نفسه) —
                // راجع groq-key-vault-migration.sql. العمود ده آمن يتقرا
                // من الفرونت إند لأنه مش القيمة الحساسة نفسها.
                const { data } = await db.from('office_settings').select('id').eq('tenant_id', tenantId).not('groq_key_secret_id', 'is', null).limit(1).maybeSingle();
                if (!cancelled) setHasKey(!!data?.id);
            } catch(e) {
                if (!cancelled) setHasKey(false);
            } finally {
                if (!cancelled) setKeyLoading(false);
            }
        };
        checkKey();
        return () => { cancelled = true; };
    }, [profile?.tenant_id]);

    // ✅ بعد نقل المفتاح لـ Vault: الحفظ بقى عن طريق edge function
    // office-secrets (service_role) بدل الكتابة المباشرة على عمود
    // office_settings.groq_key عبر saveOfficeSetting العادية — عشان
    // القيمة الصريحة متعديش على الفرونت إند ولا تتخزن كنص عادي في الجدول.
    const saveKey = async (k: string) => {
        const tenantId = profile?.tenant_id ?? null;
        if (!tenantId) { toast('❌ تعذر تحديد المكتب الحالي', true); return; }
        try {
            const { data, error } = await db.functions.invoke('office-secrets', {
                body: { action: 'saveGroqKey', groq_key: k },
            });
            if (error || data?.error) throw new Error(data?.error || error?.message);
            invalidateOfficeCache();
            setHasKey(true);
            setShowKeyInput(false);
            toast('✅ تم حفظ API Key بأمان على السيرفر');
        } catch(e) {
            showErrorToast('ai_api_key_save', e, 'تعذّر حفظ مفتاح المساعد الذكي. تأكد من صحة المفتاح. لو المشكلة استمرت، تواصل مع الدعم.', 'حفظ مفتاح المساعد الذكي');
        }
    };

    return { hasKey, keyLoading, showKeyInput, setShowKeyInput, saveKey };
}
