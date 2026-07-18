import React from 'react';
import { IconSecurity, IconKey, IconDevices, IconLockSm, IconWarning, ROLE_CONFIG } from '../icons';
import type { ProfileRow } from '../../../types';

interface SecuritySectionProps {
  lawyers: ProfileRow[];
  setChangePassUser: (user: ProfileRow) => void;
  setConfirmSignOut: (user: ProfileRow) => void;
  setConfirmLock: (user: ProfileRow) => void;
}

function SecuritySection({
  lawyers, setChangePassUser, setConfirmSignOut, setConfirmLock,
}: SecuritySectionProps) {
  return React.createElement('div',{className:"space-y-3"},

      // ── هيدر القسم ──
      React.createElement('div',{className:"flex items-center gap-2 p-3 rounded-xl bg-[#C9A84C]/10 border border-[#C9A84C]/20"},
        React.createElement('div',{className:"w-8 h-8 rounded-xl bg-[#C9A84C]/20 flex items-center justify-center text-[#C9A84C]"},
          React.createElement(IconSecurity)
        ),
        React.createElement('div',null,
          React.createElement('p',{className:"text-xs font-black text-white"},"إدارة الأمان"),
          React.createElement('p',{className:"text-[10px] text-[#C9A84C]"},"تحكم كامل في أمان حسابات المستخدمين")
        )
      ),

      // ── قائمة المستخدمين مع خيارات الأمان ──
      lawyers.length === 0
        ? React.createElement('div',{className:"text-center text-slate-500 text-xs py-10"},"لا يوجد مستخدمون")
        : lawyers.map((user) => {
            const rc = ROLE_CONFIG[user.role || ''] || ROLE_CONFIG.viewer;
            const isLocked = user.is_locked === true;
            const failedAttempts = user.failed_login_attempts || 0;
            const mustChange = user.must_change_password === true;

            return React.createElement('div',{
              key:user.id,
              className:`bg-premium-card border rounded-2xl overflow-hidden ${isLocked?'border-red-500/30':'border-white/5'}`
            },
              // رأس الكارت
              React.createElement('div',{className:"p-3 flex items-center gap-3"},
                React.createElement('div',{
                  className:`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 relative ${rc.bg} ${rc.color}`
                },
                  (user.full_name||'م').charAt(0),
                  isLocked && React.createElement('div',{
                    className:"absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center",
                  }, React.createElement('svg',{className:"w-2.5 h-2.5 text-white",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                    React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75M6 21h12a2.25 2.25 0 0 0 2.25-2.25v-6.75A2.25 2.25 0 0 0 18 9.75H6a2.25 2.25 0 0 0-2.25 2.25v6.75A2.25 2.25 0 0 0 6 21Z"})
                  ))
                ),
                React.createElement('div',{className:"flex-1 min-w-0"},
                  React.createElement('div',{className:"flex items-center gap-1.5"},
                    React.createElement('p',{className:"text-xs font-black text-white truncate"},user.full_name||'—'),
                    isLocked && React.createElement('span',{className:"text-[8px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-bold"},"🔒 مقفول"),
                    mustChange && React.createElement('span',{className:"text-[8px] bg-[#C9A84C]/20 text-[#C9A84C] px-1.5 py-0.5 rounded-full font-bold"},"⚠️ يجب تغيير الكلمة")
                  ),
                  React.createElement('p',{className:"text-[10px] text-slate-500"},user.email||''),
                  failedAttempts > 0 && React.createElement('p',{className:"text-[9px] text-red-400 mt-0.5"},
                    "⚠️ "+failedAttempts+" محاولة فاشلة")
                )
              ),

              // أزرار الأمان
              React.createElement('div',{
                className:"grid grid-cols-3 gap-px",
                style:{background:'rgba(255,255,255,0.05)'}
              },
                // تغيير كلمة المرور
                React.createElement('button',{
                  onClick:()=>setChangePassUser(user),
                  className:"flex flex-col items-center gap-1 py-2.5 bg-premium-card hover:bg-[#C9A84C]/10 transition-colors active:scale-95"
                },
                  React.createElement(IconKey,{className:"w-3.5 h-3.5 text-[#C9A84C]"}),
                  React.createElement('span',{className:"text-[8px] text-slate-400"},"تغيير كلمة المرور")
                ),

                // تسجيل خروج من جميع الأجهزة
                React.createElement('button',{
                  onClick:()=>setConfirmSignOut(user),
                  className:"flex flex-col items-center gap-1 py-2.5 bg-premium-card hover:bg-[#C9A84C]/10 transition-colors active:scale-95"
                },
                  React.createElement(IconDevices,{className:"w-3.5 h-3.5 text-[#C9A84C]"}),
                  React.createElement('span',{className:"text-[8px] text-slate-400"},"تسجيل خروج")
                ),

                // قفل/فتح الحساب
                React.createElement('button',{
                  onClick:()=>setConfirmLock(user),
                  className:`flex flex-col items-center gap-1 py-2.5 bg-premium-card transition-colors active:scale-95 ${isLocked?'hover:bg-[#C9A84C]/10':'hover:bg-red-500/10'}`
                },
                  React.createElement(IconLockSm,{className:`w-3.5 h-3.5 ${isLocked?'text-[#C9A84C]':'text-red-400'}`}),
                  React.createElement('span',{className:"text-[8px] text-slate-400"},isLocked?'فتح الحساب':'قفل الحساب')
                )
              )
            );
          }),

      // ── بطاقة 2FA (مستقبلي) ──
      React.createElement('div',{
        className:"p-4 rounded-2xl border border-dashed border-white/15 bg-white/2 space-y-3"
      },
        React.createElement('div',{className:"flex items-center gap-2"},
          React.createElement('div',{className:"w-8 h-8 rounded-xl bg-[#C9A84C]/15 flex items-center justify-center"},
            React.createElement('svg',{className:"w-4 h-4 text-[#C9A84C]",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},
              React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3m-3 3h3m-3 3h3"}))
          ),
          React.createElement('div',null,
            React.createElement('p',{className:"text-xs font-black text-white"},"المصادقة الثنائية (2FA)"),
            React.createElement('span',{className:"text-[8px] bg-[#C9A84C]/20 text-[#C9A84C] px-1.5 py-0.5 rounded-full font-bold"},"قريباً")
          )
        ),
        React.createElement('p',{className:"text-[10px] text-slate-500 leading-relaxed"},
          "سيتم إضافة دعم المصادقة الثنائية عبر تطبيق Google Authenticator أو الرسائل النصية في الإصدار القادم."),
        React.createElement('div',{className:"grid grid-cols-2 gap-2"},
          ['Google Authenticator', 'SMS OTP'].map((method) =>
            React.createElement('div',{
              key:method,
              className:"flex items-center gap-2 p-2 rounded-xl bg-white/4 border border-white/8"
            },
              React.createElement('div',{className:"w-2 h-2 rounded-full bg-red-500/40"}),
              React.createElement('span',{className:"text-[9px] text-slate-500"},method)
            )
          )
        )
      ),

      // ── إعدادات قفل الحساب ──
      React.createElement('div',{className:"p-4 rounded-2xl bg-red-500/5 border border-red-500/15 space-y-3"},
        React.createElement('div',{className:"flex items-center gap-2"},
          React.createElement(IconWarning,{className:"w-4 h-4 text-red-400"}),
          React.createElement('p',{className:"text-xs font-black text-white"},"سياسة قفل الحساب")
        ),
        React.createElement('p',{className:"text-[10px] text-slate-500 leading-relaxed"},
          "الحسابات تُقفل تلقائياً بعد 5 محاولات تسجيل دخول فاشلة. يمكنك فتح أي حساب مقفول من الأزرار أعلاه."),
        React.createElement('div',{className:"flex items-center gap-2 p-2 rounded-xl bg-white/5"},
          React.createElement('div',{className:"w-5 h-5 rounded-lg bg-red-500/20 flex items-center justify-center"},
            React.createElement('span',{className:"text-[10px]"},"5")),
          React.createElement('div',null,
            React.createElement('p',{className:"text-[10px] font-bold text-white"},"الحد الأقصى للمحاولات"),
            React.createElement('p',{className:"text-[9px] text-slate-500"},"يتم القفل التلقائي بعد 5 محاولات فاشلة")
          )
        )
      )
    );
}

export default SecuritySection;
