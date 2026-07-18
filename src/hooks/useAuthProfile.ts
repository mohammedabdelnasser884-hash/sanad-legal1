import { useState, useEffect, useCallback } from 'react';
import { db } from '../supabaseClient';
import { toast } from '../shared/lib/notifications';
import { recordError } from '../systemHealth';
import { setCurrentTenantId } from '../constants';
import type { ProfileRow } from '../types';

// ─────────────────────────────────────────────────────────
//  useAuthProfile — منقول حرفيًا من App.tsx.
//  بيجمّع: profile/authUser/authLoading state + loadProfile +
//  effect الاستماع لـ onAuthStateChange + effect ضبط tenant_id.
//  ⚠️ أخطر جزء في المشروع كله (auth) — صفر تغيير في المنطق أو
//  الترتيب، نفس الكود بالظبط بس جوه hook منفصل.
// ─────────────────────────────────────────────────────────
export function useAuthProfile() {
    const [profile,    setProfile]    = useState<ProfileRow | null>(null);
    const [authUser,   setAuthUser]   = useState<{ id: string; email?: string | null } | null>(null);
    const [authLoading,setAuthLoading]= useState(true);

    // ── Auth ──────────────────────────────────────────────────
    // ⚠️ FIX: قبل كده كان الكود بيتجاهل error تحميل البروفايل تمامًا.
    // لو المستخدم مسجّل دخول فعليًا في Supabase Auth بس صف البروفايل
    // مش موجود (لسه ما اتضبطش) أو RLS رافضة القراءة، .single() كانت
    // بترجع error والـ data بترجع undefined من غير أي رسالة — فالمستخدم
    // كان بيترمى تاني على شاشة اللوجن من غير أي تفسير ليه (يبان "مش قادر
    // أدخل" من غير سبب واضح). استخدمنا .maybeSingle() (مبترميش error لو
    // الصف مش موجود) وبنعرض toast واضح لو حصل أي error فعلي (زي تكرار
    // بيانات أو رفض RLS).
    const loadProfile = useCallback(async (user: { id: string; email?: string | null } | null) => {
        if (!user) { setProfile(null); setAuthUser(null); return; }
        setAuthUser(user);
        const { data, error } = await db.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
        if (error) {
            recordError('auth_profile_load', error.message, {
                label: 'تحميل بيانات الحساب',
                message: 'تعذّر تحميل بيانات حسابك. أعد تحميل الصفحة. لو المشكلة استمرت، تواصل مع الدعم.',
            });
            toast('تعذّر تحميل بيانات حسابك. أعد تحميل الصفحة. لو المشكلة استمرت، تواصل مع الدعم.');
        } else if (!data) {
            toast('لا يوجد ملف شخصي مرتبط بهذا الحساب — تواصل مع مدير المكتب');
        }
        setProfile(data || null);
    }, []);

    useEffect(() => {
        db.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) loadProfile(session.user);
            else setAuthLoading(false);
        });
        const { data: listener } = db.auth.onAuthStateChange((_event, session) => {
            if (session?.user) loadProfile(session.user);
            else { setProfile(null); setAuthUser(null); }
        });
        return () => listener.subscription.unsubscribe();
    }, [loadProfile]);

    // ── ضبط tenant_id الحالي لكل قراءات/كتابات office_settings —
    // لازم يحصل قبل أي نداء لـ loadOfficeSetting/saveOfficeSetting، وكمان
    // عند تسجيل الخروج (profile=null) عشان منفضلش شايلين tenant قديم في
    // الكاش لمستخدم بعده على نفس الجهاز. ──
    useEffect(() => {
        setCurrentTenantId(profile?.tenant_id ?? null);
    }, [profile]);

    useEffect(() => {
        if (profile !== null) setAuthLoading(false);
    }, [profile]);

    return { profile, setProfile, authUser, setAuthUser, authLoading, loadProfile };
}
