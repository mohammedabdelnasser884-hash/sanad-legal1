import React, { useEffect, useRef } from 'react';
import { I, SanadMark } from '../../constants';
import type { ProfileRow } from '../../types';

interface AppHeaderProps {
    profile: ProfileRow | null;
    setShowMenu: (v: boolean) => void;
    setShowSearch: (v: boolean) => void;
    isAdmin: boolean;
    fetchCases: (page?: number, filter?: string) => void | Promise<void>;
    casesFilter: string;
    loadingCases: boolean;
}

// ── FIX: نشر الارتفاع الفعلي للهيدر كـ CSS variable مركزية (--app-header-h) ──
// ⚠️ قبل الإصلاح ده، أماكن زي مودالات FeesTab.tsx كانت بتفترض رقم ثابت
// (64px) لارتفاع الهيدر عشان تحسب مكانها (top). الرقم ده مش مضمون يطابق
// الارتفاع الحقيقي (بيعتمد على المحتوى/padding)، فكان بيسبب تداخل أو
// فراغ بين الهيدر والمحتوى. دلوقتي بنقيس الارتفاع الفعلي بـ ResizeObserver
// وننشره كـ CSS variable على document.documentElement، وأي مكان تاني في
// المشروع محتاج "ارتفاع الهيدر" بيقرأ var(--app-header-h) بدل ما يخمّن رقم.
function AppHeader({ profile, setShowMenu, setShowSearch, isAdmin, fetchCases, casesFilter, loadingCases }: AppHeaderProps) {
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const publish = () => {
      document.documentElement.style.setProperty('--app-header-h', `${el.offsetHeight}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    React.createElement('header',{ref:headerRef, className:"w-full bg-premium-card/80 backdrop-blur-lg border-b border-white/5 px-4 py-2.5 shrink-0 z-40 sticky top-0 relative"},
        // ── الصف الوحيد: أفاتار + اسم + بحث + هامبرغر (هامبرغر على اليسار) ──
        React.createElement('div',{className:"flex items-center gap-2.5"},
            // أفاتار + اسم + رول
            React.createElement('div',{className:"flex items-center gap-2 flex-1 min-w-0"},
                React.createElement('div',{
                    style:{width:32,height:32,background:'#0B1320',borderRadius:9,display:'flex',
                      alignItems:'center',justifyContent:'center',
                      border:'1px solid rgba(212,175,55,0.22)',
                      boxShadow:'0 0 12px rgba(212,175,55,0.10)',flexShrink:0}
                },
                    React.createElement(SanadMark,{size:22})
                ),
                React.createElement('div',{className:"flex flex-col min-w-0"},
                    React.createElement('h1',{className:"text-xs font-black tracking-tight text-white leading-tight truncate"},
                        profile?.full_name||'سَنَد'
                    ),
                    React.createElement('p',{className:"text-[10px] font-bold flex items-center gap-1",style:{color:isAdmin?'#60a5fa':'#D4AF37'}},
                        React.createElement('span',{className:`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${isAdmin?'bg-blue-400':'bg-premium-gold'}`}),
                        React.createElement('span',{className:"truncate"},isAdmin?'مدير المكتب':'محامي')
                    )
                )
            ),
            // أيقونة البحث دايمة ظاهرة
            React.createElement('button',{
                onClick:()=>setShowSearch(true),
                className:"w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:scale-95 transition-transform text-slate-400 shrink-0"
            }, React.createElement(I.Search)),
            // أيقونة تحديث البيانات
            React.createElement('button',{
                onClick:()=>fetchCases(0,casesFilter),
                className:"w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:scale-95 transition-transform shrink-0"
            },
                loadingCases
                    ? React.createElement(I.Spin)
                    : React.createElement('svg',{className:"w-4 h-4 text-premium-gold",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2",stroke:"currentColor"},
                          React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"})
                      )
            ),
            // زر الهامبرغر — على الشمال (آخر العناصر في RTL)
            React.createElement('button',{
                onClick:()=>(setShowMenu as unknown as (updater: (prev: boolean) => boolean) => void)((p: boolean)=>!p),
                className:"w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-[5px] active:scale-95 transition-transform shrink-0",
                title:"القائمة"
            },
                React.createElement('span',{className:"block w-4 h-0.5 bg-premium-gold rounded-full"}),
                React.createElement('span',{className:"block w-4 h-0.5 bg-premium-gold rounded-full"}),
                React.createElement('span',{className:"block w-4 h-0.5 bg-premium-gold rounded-full"})
            )
        )
    )
  );
}

export default AppHeader;
