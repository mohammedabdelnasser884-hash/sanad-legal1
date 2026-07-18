import React, { useState } from 'react';
import { db } from '../../supabaseClient';
import { logActivity } from '../../shared/lib/dataAccess';
import { recordError } from '../../systemHealth';
import { I, SanadMark } from '../../constants';

import { Inp } from '@/shared/ui/Inp';

interface LoginScreenProps {
    onLogin: (user: { id: string; email?: string | null }) => void;
}

function LoginScreen({onLogin}: LoginScreenProps){
    const [email,setEmail]=useState('');
    const [pass,setPass]=useState('');
    const [showPass,setShowPass]=useState(false);
    const [loading,setLoading]=useState(false);
    const [err,setErr]=useState('');

    const handleLogin=async(e: React.MouseEvent<HTMLButtonElement>)=>{
        e.preventDefault();
        if(!email||!pass){setErr('يرجى إدخال البريد وكلمة السر');return;}
        setLoading(true);setErr('');
        // تسجيل الدخول بقى بيعدّي على إيدج فانكشن office-login بدل الاتصال
        // المباشر بـ Supabase Auth — عشان يطبّق حماية brute-force حقيقية
        // (5 محاولات/15 دقيقة على الإيميل أو الـ IP) ويتحقق من profiles.is_locked
        // قبل ما يسمح بالدخول، بدل ما يعتمد بس على صحة الباسورد.
        const {data,error}=await db.functions.invoke('office-login',{body:{action:'login',email,password:pass}});
        // ⚠️ FIX دفاعي: قبل كده كان الشرط بيفحص error/data?.error بس، وبيفترض
        // إن data.access_token موجودة أكيد لو مفيش error — لو office-login رجّعت
        // يومًا رد فاضي (data:null) من غير error (مش بيحصل بعقدها الحالي، لكن
        // مفيش ضمان مستقبلي)، الكود كان بيكراش بصمت على data.access_token
        // ويسيب المستخدم عالق على "جاري التحقق..." للأبد من غير أي رسالة.
        // إضافة فحص !data?.access_token بتقفل المسار ده بنفس رسالة الخطأ الموحّدة.
        //
        // 🔧 توحيد رسائل الأخطاء: data?.error دلوقتي مضمون إنها رسالة عربي
        // جاهزة للمستخدم (سواء حالة متوقعة زي "بيانات خاطئة"، أو الرسالة
        // الثابتة اللي بيرجّعها office-login في الـ catch العام بعد الإصلاح)
        // — فتفضل تتعرض زي ما هي. لكن error?.message جاي من مستوى الشبكة/
        // العميل نفسه (Supabase functions client)، ده اللي ممكن يكون نص
        // تقني خام (زي "Failed to fetch")، فمنعرضهوش للمستخدم؛ نسجله جوه
        // بس عبر recordError ونعرض رسالة موحّدة بدله.
        if(error||data?.error||!data?.access_token){
            setLoading(false);
            if(data?.error){
                setErr(data.error);
            } else {
                recordError('office_login', error?.message);
                setErr('تعذّر تسجيل الدخول. تحقق من اتصال الإنترنت وحاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.');
            }
            return;
        }
        // ثبّت الجلسة اللي رجعت من الفانكشن على عميل Supabase المحلي —
        // من هنا وطالع، auth.uid() هيشتغل عادي في كل مكان بالتطبيق.
        const {error:sessionErr}=await db.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});
        setLoading(false);
        if(sessionErr){
            recordError('office_login', sessionErr.message);
            setErr('تعذّر إتمام تسجيل الدخول. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.');
            return;
        }
        logActivity(db, 'تسجيل دخول', { entity_type: 'user', entity_id: data.user?.id, details: data.user?.email || null });
        onLogin(data.user);
    };

    return React.createElement('div',{className:"h-full flex flex-col items-center justify-center px-6 bg-premium-bg relative overflow-hidden"},
        // خلفية زخرفية
        React.createElement('div',{className:"absolute top-0 left-0 w-64 h-64 rounded-full bg-amber-500/5 blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none"}),
        React.createElement('div',{className:"absolute bottom-0 right-0 w-64 h-64 rounded-full bg-blue-500/5 blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none"}),

        React.createElement('div',{className:"w-full max-w-sm slide-up"},
            // شعار
            React.createElement('div',{style:{display:'flex',flexDirection:'column',alignItems:'center',gap:0,marginBottom:40}},
                React.createElement('div',{
                    style:{width:64,height:64,background:'#0B1320',borderRadius:16,display:'flex',
                      alignItems:'center',justifyContent:'center',
                      border:'1px solid rgba(212,175,55,0.18)',
                      boxShadow:'0 0 40px rgba(212,175,55,0.08)',marginBottom:20}
                },
                    React.createElement(SanadMark,{size:44})
                ),
                React.createElement('div',{style:{fontFamily:'Cairo,sans-serif',fontSize:36,fontWeight:900,
                  color:'#ffffff',letterSpacing:'1px',lineHeight:1,marginBottom:10}},'سَنَد'),
                React.createElement('div',{style:{fontFamily:'Cairo,sans-serif',fontSize:11,fontWeight:600,
                  color:'rgba(212,175,55,0.6)',letterSpacing:'3px'}},'نظام التشغيل القانوني')
            ),

            // الفورم
            React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-6 shadow-premium-shadow space-y-4"},
                React.createElement('h2',{className:"text-sm font-black text-white mb-2"},"تسجيل الدخول"),

                React.createElement(Inp,{label:"البريد الإلكتروني",type:"email",value:email,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setEmail(e.target.value),placeholder:"example@law.com",required:true,'data-testid':'login-email'}),

                // حقل كلمة السر مع زر الإظهار
                React.createElement('div',null,
                    React.createElement('label',{className:"block text-[10px] font-bold text-slate-400 mb-1.5"},
                        "كلمة السر",React.createElement('span',{className:"text-rose-400 mr-1"},"*")
                    ),
                    React.createElement('div',{className:"relative"},
                        React.createElement('input',{
                            type:showPass?'text':'password',
                            value:pass,
                            onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setPass(e.target.value),
                            placeholder:"••••••••",
                            className:"w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 pl-10",
                            style:{fontFamily:'Cairo,sans-serif'},
                            'data-testid':'login-password'
                        }),
                        React.createElement('button',{
                            type:"button",
                            onClick:()=>setShowPass(!showPass),
                            className:"absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-premium-gold transition-colors"
                        },React.createElement(I.Eye))
                    )
                ),

                err&&React.createElement('div',{className:"bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-[11px] text-rose-400 text-center",'data-testid':'login-error'},err),

                React.createElement('button',{
                    onClick:handleLogin,
                    disabled:loading,
                    className:"w-full py-3 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-xl font-black text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60",
                    'data-testid':'login-submit'
                },
                    loading?React.createElement(I.Spin):React.createElement(I.Lock),
                    loading?'جاري التحقق...':'دخول إلى سَنَد'
                )
            ),

            React.createElement('p',{className:"text-center text-[10px] text-slate-600 mt-6"},
                "🔒 سَنَد مؤمّنة — للمستخدمين المعتمدين فقط"
            )
        )
    );
}

export default LoginScreen;
