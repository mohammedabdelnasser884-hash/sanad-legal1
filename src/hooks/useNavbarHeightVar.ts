import { useState, useCallback, useEffect } from 'react';

// ─────────────────────────────────────────────────────────
//  useNavbarHeightVar — منقول حرفيًا من App.tsx.
//
//  ⚠️ FIX: نشر الحيّز الفعلي اللي بياخده الشريط السفلي (Command Dock)
//  كـ CSS variable مركزية (--app-navbar-h) بدل ما أي مكان تاني (زي
//  مودالات FeesTab.tsx) يفترض رقم ثابت (80px) ممكن ميطابقش الحقيقة.
//  بنقيس المسافة الفعلية من أسفل الشاشة لبداية الـ nav (getBoundingClientRect)
//  — ده بيدي الحيّز الحقيقي المحجوز بغض النظر عن أي padding حواليه.
//
//  ⚠️ FIX 2 (مهم): الـ <nav> ده بيتعرض بس بعد تسجيل الدخول (فيه early
//  return لـ LoginScreen قبل ما يترسم). لو استخدمنا useRef عادي مع
//  useEffect بـ dependency array فاضية [] زي الأول، الـ effect كان
//  بيشتغل مرة واحدة بس عند أول commit — وده بيكون وقت شاشة اللوجن،
//  يعني navRef.current بيبقى null والـ CSS variable متتنشرش أبدًا حتى
//  بعد الدخول (فضل بيعتمد على الـ fallback الثابت 80px طول الوقت).
//  الحل: callback ref بيتفعّل تلقائيًا لما العنصر فعليًا يترسم في الـ
//  DOM (بعد اللوجن)، فالـ useEffect اللي بعده بيشتغل صح مع mount الحقيقي.
// ─────────────────────────────────────────────────────────
export function useNavbarHeightVar() {
    const [navEl, setNavEl] = useState<HTMLElement | null>(null);
    const navRef = useCallback((el: HTMLElement | null) => setNavEl(el), []);
    useEffect(() => {
        if (!navEl) return;
        const publish = () => {
            const offset = window.innerHeight - navEl.getBoundingClientRect().top;
            document.documentElement.style.setProperty('--app-navbar-h', `${Math.round(offset)}px`);
        };
        publish();
        window.addEventListener('resize', publish);
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publish) : null;
        ro?.observe(navEl);
        return () => {
            window.removeEventListener('resize', publish);
            ro?.disconnect();
        };
    }, [navEl]);

    return { navRef };
}
