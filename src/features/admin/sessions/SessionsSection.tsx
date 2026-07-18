import React from 'react';
import { I } from '../../../constants';
import { IconSessions, ROLE_CONFIG } from '../icons';
import { formatArTime, formatArDate } from '../../../shared/ui/arabicLocale';
import type { ProfileRow } from '../../../types';
import type { ActiveSession } from './hooks/useAdminSessions';

// عنصر إحصاء سريع (متصل الآن / إجمالي / تحذيرات) — مصفوفة محلية بس.
interface SessionStatItem {
  label: string;
  value: number;
  color: string;
  bg: string;
  dot: string | null;
}

interface SessionsSectionProps {
  profile: ProfileRow | null;
  activeSessions: ActiveSession[];
  loadingSessions: boolean;
  terminatingSession: string | null;
  sessionsLastRefresh: Date | null;
  sessionsAutoRefresh: boolean;
  setSessionsAutoRefresh: React.Dispatch<React.SetStateAction<boolean>>;
  setConfirmTerminateAll: React.Dispatch<React.SetStateAction<boolean>>;
  fetchActiveSessions: () => void | Promise<void>;
  handleTerminateSession: (sess: ActiveSession) => void | Promise<void>;
}

function SessionsSection({
  profile, activeSessions, loadingSessions, terminatingSession,
  sessionsLastRefresh, sessionsAutoRefresh, setSessionsAutoRefresh,
  setConfirmTerminateAll, fetchActiveSessions, handleTerminateSession,
}: SessionsSectionProps) {
  return React.createElement('div',{className:"space-y-3"},

      // ── هيدر إحصائي ──
      React.createElement('div',{
        className:"rounded-2xl p-4 space-y-3",
        style:{background:'linear-gradient(135deg,rgba(16,185,129,0.10),rgba(16,185,129,0.03))',border:'1px solid rgba(16,185,129,0.20)'}
      },
        React.createElement('div',{className:"flex items-center justify-between"},
          React.createElement('div',{className:"flex items-center gap-3"},
            React.createElement('div',{className:"w-10 h-10 rounded-xl bg-[#C9A84C]/20 flex items-center justify-center"},
              React.createElement(IconSessions,{className:"w-5 h-5 text-[#C9A84C]"})
            ),
            React.createElement('div',null,
              React.createElement('p',{className:"text-sm font-black text-white"},"الجلسات النشطة — آخر 24 ساعة"),
              React.createElement('p',{className:"text-[10px] text-[#C9A84C]"},"مراقبة حقيقية لكل من يستخدم المنظومة الآن")
            )
          ),
          // زر refresh
          React.createElement('button',{
            onClick: fetchActiveSessions,
            disabled: loadingSessions,
            className:"w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:scale-90 transition-transform"
          }, loadingSessions ? React.createElement(I.Spin) : React.createElement('svg',{className:"w-4 h-4 text-[#C9A84C]",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2",stroke:"currentColor"},
            React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"})
          ))
        ),

        // إحصاءات سريعة
        React.createElement('div',{className:"grid grid-cols-3 gap-2"},
          (() => {
            const online = activeSessions.filter((s: ActiveSession) =>s.isOnline).length;
            const total  = activeSessions.length;
            const suspicious = activeSessions.filter((s: ActiveSession) => {
              // نعتبره مشبوهاً لو دخل من IP مختلف أو في وقت غير عادي
              const h = new Date(s.lastSeenAt as string).getHours();
              return h >= 0 && h < 5; // دخول بعد منتصف الليل تحذير
            }).length;
            return ([
              { label:'متصل الآن', value: online, color:'text-[#C9A84C]', bg:'bg-[#C9A84C]/10', dot:'bg-[#C9A84C]' },
              { label:'إجمالي الجلسات', value: total, color:'text-white', bg:'bg-white/5', dot:null },
              { label:'تحذيرات', value: suspicious, color: suspicious>0?'text-[#C9A84C]':'text-slate-500', bg: suspicious>0?'bg-[#C9A84C]/10':'bg-white/5', dot: suspicious>0?'bg-red-500':null },
            ] as SessionStatItem[]).map((item) => React.createElement('div',{key:item.label, className:`${item.bg} rounded-xl p-2.5 text-center border border-white/5`},
              React.createElement('div',{className:"flex items-center justify-center gap-1"},
                item.dot && React.createElement('span',{className:`w-1.5 h-1.5 rounded-full ${item.dot} ${item.label==='متصل الآن'?'animate-pulse':''}`}),
                React.createElement('p',{className:`text-base font-black ${item.color}`},item.value)
              ),
              React.createElement('p',{className:"text-[8px] text-slate-500 mt-0.5"},item.label)
            ));
          })()
        ),

        // شريط الـ auto-refresh + آخر تحديث
        React.createElement('div',{className:"flex items-center justify-between"},
          React.createElement('div',{className:"flex items-center gap-2"},
            React.createElement('span',{className:"text-[9px] text-slate-500"},"تحديث تلقائي كل 30 ثانية"),
            React.createElement('button',{
              onClick:()=>setSessionsAutoRefresh((s: boolean) =>!s),
              className:`w-9 h-5 rounded-full transition-all relative ${sessionsAutoRefresh?'bg-[#C9A84C]':'bg-slate-600'}`
            },
              React.createElement('div',{className:`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow ${sessionsAutoRefresh?'right-0.5':'left-0.5'}`})
            )
          ),
          sessionsLastRefresh && React.createElement('p',{className:"text-[9px] text-slate-600"},
            "آخر تحديث: "+formatArTime(sessionsLastRefresh,{hour:'2-digit',minute:'2-digit',second:'2-digit'}))
        )
      ),

      // ── زر إنهاء الكل ──
      activeSessions.filter((s: ActiveSession) =>s.profileId!==profile?.id).length > 0 &&
        React.createElement('button',{
          onClick:()=>setConfirmTerminateAll(true),
          className:"w-full py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-[#C9A84C] text-xs font-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all hover:bg-[#C9A84C]/15"
        },
          React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2",stroke:"currentColor"},
            React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M5.636 5.636a9 9 0 1 0 12.728 12.728M5.636 5.636a9 9 0 1 1 12.728 12.728M5.636 5.636 12 12m0 0 6.364 6.364"})
          ),
          "إنهاء جميع الجلسات ("+activeSessions.filter((s: ActiveSession) =>s.profileId!==profile?.id).length+")"
        ),

      // ── حالة التحميل ──
      loadingSessions && activeSessions.length === 0
        ? React.createElement('div',{className:"flex flex-col items-center justify-center py-12 gap-3"},
            React.createElement(I.Spin,{className:"text-[#C9A84C]"}),
            React.createElement('p',{className:"text-xs text-slate-500"},"جاري جلب الجلسات...")
          )

      // ── لا يوجد جلسات ──
      : activeSessions.length === 0 && !loadingSessions
        ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-xl p-10 text-center space-y-3"},
            React.createElement('div',{className:"w-12 h-12 rounded-2xl bg-[#C9A84C]/10 flex items-center justify-center mx-auto text-2xl"},"👥"),
            React.createElement('p',{className:"text-sm font-black text-white"},"لا يوجد نشاط مسجّل بعد"),
            React.createElement('p',{className:"text-[10px] text-slate-500 leading-relaxed max-w-xs mx-auto"},
              "لا يوجد مستخدمون نشطون خلال الـ 24 ساعة الماضية.")
          )

      // ── قائمة الجلسات ──
      : React.createElement('div',{className:"space-y-2"},
          activeSessions.map((sess: ActiveSession) => {
            const rc = ROLE_CONFIG[sess.role] || ROLE_CONFIG.viewer;
            const isMe = sess.profileId === profile?.id;
            const isOnline = sess.isOnline;
            const isTerminating = terminatingSession === sess.id;

            // تصنيف الجهاز
            const deviceIcon = sess.device.includes('📱') ? '📱'
              : sess.device.includes('💻') || sess.device.includes('🖥') ? '💻'
              : sess.device.includes('📲') ? '📲' : '🖥';

            // تنسيق وقت آخر نشاط
            const lastSeenLabel = isOnline
              ? (sess.diffMin === 0 ? 'الآن' : `منذ ${sess.diffMin} دقيقة`)
              : sess.diffMin < 60 ? `منذ ${sess.diffMin} دقيقة`
              : sess.diffMin < 1440 ? `منذ ${Math.floor(sess.diffMin/60)} ساعة`
              : formatArDate(sess.lastSeenAt as string,{month:'short',day:'numeric'});

            // تحذير: دخول وقت متأخر
            const loginHour = new Date(sess.lastSeenAt as string).getHours();
            const isSuspicious = loginHour >= 0 && loginHour < 5;

            return React.createElement('div',{
              key:sess.id,
              className:`rounded-2xl overflow-hidden transition-all ${
                isMe ? 'border-[#C9A84C]/30' :
                isSuspicious ? 'border-red-500/20' :
                isOnline ? 'border-[#C9A84C]/20' : 'border-white/5'
              }`,
              style:{
                background: isMe ? 'linear-gradient(135deg,rgba(16,185,129,0.07),rgba(16,185,129,0.02))'
                  : isSuspicious ? 'linear-gradient(135deg,rgba(239,68,68,0.07),rgba(239,68,68,0.02))'
                  : 'var(--card)',
                border: `1px solid ${
                  isMe ? 'rgba(16,185,129,0.30)' :
                  isSuspicious ? 'rgba(239,68,68,0.25)' :
                  isOnline ? 'rgba(16,185,129,0.20)' : 'rgba(255,255,255,0.05)'
                }`
              }
            },
              // شريط علوي ملون
              React.createElement('div',{
                className:`h-0.5 w-full ${isMe?'bg-[#C9A84C]':isSuspicious?'bg-red-500':isOnline?'bg-[#C9A84C]':'bg-white/10'}`,
                style:{opacity: isOnline||isMe ? 0.8 : 0.3}
              }),

              React.createElement('div',{className:"p-3.5"},
                // صف المعلومات الرئيسية
                React.createElement('div',{className:"flex items-start gap-3"},

                  // أيقونة الجهاز
                  React.createElement('div',{
                    className:`w-11 h-11 rounded-xl flex flex-col items-center justify-center gap-0 flex-shrink-0 relative`,
                    style:{
                      background: isMe ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${isMe?'rgba(16,185,129,0.25)':'rgba(255,255,255,0.08)'}`
                    }
                  },
                    React.createElement('span',{className:"text-lg leading-none"},deviceIcon),
                    // نقطة الحالة
                    React.createElement('div',{
                      className:`absolute -bottom-1 -left-1 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center`,
                      style:{
                        background: isOnline ? '#10b981' : '#334155',
                        borderColor: 'var(--bg)',
                      }
                    },
                      isOnline && React.createElement('div',{className:"w-1.5 h-1.5 rounded-full bg-white animate-pulse"})
                    )
                  ),

                  // بيانات الجلسة
                  React.createElement('div',{className:"flex-1 min-w-0"},
                    // اسم + بادجات
                    React.createElement('div',{className:"flex items-center gap-1.5 flex-wrap"},
                      React.createElement('p',{className:"text-xs font-black text-white truncate"},sess.name),
                      isMe && React.createElement('span',{className:"text-[8px] bg-[#C9A84C]/20 text-[#C9A84C] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0"},"أنت"),
                      React.createElement('span',{className:`text-[8px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 ${rc.bg} ${rc.color}`},rc.label),
                      isSuspicious && React.createElement('span',{className:"text-[8px] bg-[#C9A84C]/20 text-[#C9A84C] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 animate-pulse"},"⚠️ وقت مشبوه")
                    ),
                    // بريد
                    React.createElement('p',{className:"text-[9px] text-slate-500 mt-0.5 truncate"},sess.email),
                    // صف الجهاز + الوقت
                    React.createElement('div',{className:"flex items-center gap-2 mt-1 flex-wrap"},
                      React.createElement('span',{className:"text-[9px] text-slate-400 flex items-center gap-1"},
                        React.createElement('span',null,deviceIcon),
                        React.createElement('span',{className:"truncate max-w-[100px]"},
                          sess.device.replace(/[📱💻🖥📲🐧]/gu,'').trim() || 'جهاز'
                        )
                      ),
                      React.createElement('span',{className:"w-px h-3 bg-white/10"}),
                      React.createElement('span',{
                        className:`text-[9px] font-bold flex items-center gap-0.5 ${
                          isOnline ? 'text-[#C9A84C]' : 'text-slate-500'
                        }`
                      },
                        isOnline && React.createElement('span',{className:"w-1.5 h-1.5 rounded-full bg-[#C9A84C] animate-pulse flex-shrink-0"}),
                        lastSeenLabel
                      ),
                      sess.ip && sess.ip !== '—' && React.createElement(React.Fragment,null,
                        React.createElement('span',{className:"w-px h-3 bg-white/10"}),
                        React.createElement('span',{className:"text-[8px] text-slate-600 font-mono"},sess.ip)
                      )
                    )
                  ),

                  // زر إنهاء
                  !isMe && React.createElement('button',{
                    onClick:()=>handleTerminateSession(sess),
                    disabled:!!terminatingSession,
                    title:"إنهاء الجلسة",
                    className:`flex-shrink-0 flex flex-col items-center gap-1 px-2.5 py-2 rounded-xl border transition-all active:scale-90 ${
                      isSuspicious
                        ? 'bg-[#C9A84C]/20 border-[#C9A84C]/30 text-[#C9A84C] hover:bg-red-500/30'
                        : 'bg-white/5 border-white/10 text-slate-500 hover:border-[#C9A84C]/30 hover:text-[#C9A84C] hover:bg-[#C9A84C]/10'
                    } disabled:opacity-40`
                  },
                    isTerminating
                      ? React.createElement(I.Spin,{})
                      : React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2",stroke:"currentColor"},
                          React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M5.636 5.636a9 9 0 1 0 12.728 12.728M5.636 5.636a9 9 0 1 1 12.728 12.728M5.636 5.636 12 12m0 0 6.364 6.364"})
                        ),
                    React.createElement('span',{className:"text-[7px] font-bold leading-none"},isTerminating?"...":"إنهاء")
                  )
                ),

                // تحذير الوقت المشبوه
                isSuspicious && React.createElement('div',{
                  className:"mt-2.5 flex items-center gap-2 px-3 py-2 rounded-xl bg-[#C9A84C]/10 border border-[#C9A84C]/20"
                },
                  React.createElement('span',{className:"text-sm flex-shrink-0"},"⚠️"),
                  React.createElement('p',{className:"text-[9px] text-red-400 leading-relaxed"},
                    "آخر نشاط كان في الساعة "+new Date(sess.lastSeenAt as string).getHours()+":"+String(new Date(sess.lastSeenAt as string).getMinutes()).padStart(2,'0')+
                    " — نشاط في منتصف الليل قد يكون مشبوهاً"
                  )
                )
              )
            );
          })
        )
    );
}

export default SessionsSection;
