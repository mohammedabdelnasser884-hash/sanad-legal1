import React from 'react';
import { I } from '../../../constants';
import { IconActivity } from '../icons';
import { formatArDateTime } from '../../../shared/ui/arabicLocale';
import type { ProfileRow, ActivityLogRow } from '../../../types';
import type { ActivityFilters } from './hooks/useAdminActivity';

// شكل عنصر خرائط ألوان/أيقونات نوع الإجراء (actionMap) — مصفوفة محلية بس.
interface ActionStyle {
  bg: string;
  border: string;
  text: string;
  badge: string;
  icon: string;
}

interface ActivitySectionProps {
  activitySearchInput: string;
  setActivitySearchInput: React.Dispatch<React.SetStateAction<string>>;
  handleActivitySearchChange: (val: string) => void;
  activityFilters: ActivityFilters;
  setActivityFilters: React.Dispatch<React.SetStateAction<ActivityFilters>>;
  setActivityPage: React.Dispatch<React.SetStateAction<number>>;
  lawyers: ProfileRow[];
  loadingActivity: boolean;
  activityTotal: number;
  ACTIVITY_PAGE_SIZE: number;
  activityPage: number;
  activityLog: ActivityLogRow[];
}

function ActivitySection({
  activitySearchInput, setActivitySearchInput, handleActivitySearchChange,
  activityFilters, setActivityFilters, setActivityPage,
  lawyers, loadingActivity, activityTotal, ACTIVITY_PAGE_SIZE, activityPage, activityLog,
}: ActivitySectionProps) {
  return React.createElement('div',{className:"space-y-3"},

      // ── بحث حر ──
      React.createElement('div',{className:"relative"},
        React.createElement('input',{
          value: activitySearchInput,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => handleActivitySearchChange(e.target.value),
          maxLength: 100,
          placeholder:"🔍 بحث في السجلات...",
          className:"w-full p-2.5 pr-4 text-xs rounded-xl border border-white/10 bg-premium-card text-white placeholder-slate-500",
          style:{fontFamily:'Cairo,sans-serif'}
        }),
        activitySearchInput && React.createElement('button',{
          onClick:()=>{ setActivitySearchInput(''); setActivityFilters((f: ActivityFilters)=>({...f,search:''})); setActivityPage(0); },
          className:"absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
        }, React.createElement(I.X,{className:"w-3.5 h-3.5"}))
      ),

      // ── فلاتر متقدمة: نوع الإجراء + التاريخ ──
      React.createElement('div',{className:"flex gap-2"},

        // فلتر نوع الإجراء
        React.createElement('select',{
          value: activityFilters.action,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => { setActivityFilters((f: ActivityFilters) =>({...f,action:e.target.value})); setActivityPage(0); },
          className:"flex-1 p-2 text-[10px] rounded-xl border border-white/10 bg-premium-card text-white",
          style:{fontFamily:'Cairo,sans-serif'}
        },
          React.createElement('option',{value:''},'كل الإجراءات'),
          React.createElement('option',{value:'إضافة'},'➕ إضافة'),
          React.createElement('option',{value:'تعديل'},'✏️ تعديل'),
          React.createElement('option',{value:'حذف'},'🗑️ حذف'),
          React.createElement('option',{value:'تسجيل دخول'},'🔑 تسجيل دخول'),
          React.createElement('option',{value:'تسجيل خروج'},'🚪 تسجيل خروج'),
          React.createElement('option',{value:'إنهاء جلسة'},'⛔ إنهاء جلسة'),
          React.createElement('option',{value:'نسخة احتياطية'},'💾 نسخة احتياطية'),
          React.createElement('option',{value:'تصدير'},'📤 تصدير'),
          React.createElement('option',{value:'تذكير'},'🔔 تذكيرات'),
          React.createElement('option',{value:'قانون'},'⚖️ مكتبة قانونية'),
          React.createElement('option',{value:'بوابة'},'🌐 بوابة الموكل')
        ),

        // فلتر المستخدم
        React.createElement('select',{
          value: activityFilters.user_id,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => { setActivityFilters((f: ActivityFilters) =>({...f,user_id:e.target.value})); setActivityPage(0); },
          className:"flex-1 p-2 text-[10px] rounded-xl border border-white/10 bg-premium-card text-white",
          style:{fontFamily:'Cairo,sans-serif'}
        },
          React.createElement('option',{value:''},'كل المستخدمين'),
          ...lawyers.map((u: ProfileRow) => React.createElement('option',{key:u.user_id||u.id, value:u.user_id||u.id}, u.full_name||u.email||'مستخدم'))
        )
      ),

      // فلتر نطاق التاريخ
      React.createElement('div',{className:"flex gap-2 items-center"},
        React.createElement('input',{
          type:'date',
          value: activityFilters.from,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => { setActivityFilters((f: ActivityFilters) =>({...f,from:e.target.value})); setActivityPage(0); },
          className:"flex-1 p-2 text-[10px] rounded-xl border border-white/10 bg-premium-card text-white",
          style:{fontFamily:'Cairo,sans-serif'}
        }),
        React.createElement('span',{className:"text-[10px] text-slate-500 shrink-0"},"→"),
        React.createElement('input',{
          type:'date',
          value: activityFilters.to,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => { setActivityFilters((f: ActivityFilters) =>({...f,to:e.target.value})); setActivityPage(0); },
          className:"flex-1 p-2 text-[10px] rounded-xl border border-white/10 bg-premium-card text-white",
          style:{fontFamily:'Cairo,sans-serif'}
        }),
        // زر مسح كل الفلاتر
        (activityFilters.action || activityFilters.user_id || activityFilters.from || activityFilters.to) &&
        React.createElement('button',{
          onClick:()=>{ setActivityFilters({search:activityFilters.search, user_id:'', action:'', from:'', to:''}); setActivityPage(0); },
          className:"shrink-0 px-2 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[9px] font-bold active:scale-95"
        },"مسح")
      ),

      // ── عداد النتائج ──
      React.createElement('p',{className:"text-[10px] text-slate-500 px-1"},
        loadingActivity ? "جاري البحث..." :
        activityTotal > ACTIVITY_PAGE_SIZE
          ? `صفحة ${activityPage+1} من ${Math.ceil(activityTotal/ACTIVITY_PAGE_SIZE)} (${activityTotal} سجل)`
          : `${activityTotal} سجل`
      ),

      // ── النتائج ──
      loadingActivity
        ? React.createElement('div',{className:"flex items-center justify-center py-10 gap-2 text-slate-500 text-xs"},
            React.createElement(I.Spin), "جاري التحميل...")

        : activityLog.length === 0
        ? React.createElement('div',{
            className:"bg-premium-card border border-white/5 rounded-xl p-8 text-center space-y-3"
          },
            React.createElement('div',{className:"w-10 h-10 rounded-xl bg-slate-500/10 flex items-center justify-center mx-auto"},
              React.createElement(IconActivity,{className:"w-5 h-5 text-slate-500"})),
            activityFilters.search
              ? React.createElement('p',{className:"text-slate-400 text-xs font-bold"},"لا توجد نتائج للبحث المحدد")
              : React.createElement('p',{className:"text-slate-400 text-xs font-bold"},"لا يوجد سجل نشاط بعد")
          )

        : React.createElement('div',{className:"space-y-1.5"},
            ...activityLog.map((log: ActivityLogRow, i: number)=>{
              const actionMap: Record<string, ActionStyle> = {
                'إضافة':  {bg:'bg-[#C9A84C]/10', border:'border-[#C9A84C]/20', text:'text-[#C9A84C]', badge:'bg-[#C9A84C]/15 text-[#C9A84C]', icon:'➕'},
                'تعديل':  {bg:'bg-[#C9A84C]/10',    border:'border-[#C9A84C]/20',    text:'text-[#C9A84C]',    badge:'bg-[#C9A84C]/15 text-[#C9A84C]',    icon:'✏️'},
                'حذف':    {bg:'bg-red-500/10',     border:'border-red-500/20',     text:'text-red-400',     badge:'bg-red-500/15 text-red-400',     icon:'🗑️'},
                'دخول':   {bg:'bg-[#C9A84C]/10',  border:'border-[#C9A84C]/20',  text:'text-[#C9A84C]',  badge:'bg-[#C9A84C]/15 text-[#C9A84C]',  icon:'🔑'},
                'تصدير':  {bg:'bg-[#C9A84C]/10',   border:'border-[#C9A84C]/20',   text:'text-[#C9A84C]',   badge:'bg-[#C9A84C]/15 text-[#C9A84C]',   icon:'📤'},
              };
              const action = log.action || '';
              const colorKey = Object.keys(actionMap).find((k: string) =>action.includes(k));
              const s = colorKey ? actionMap[colorKey] : {bg:'bg-white/5',border:'border-white/5',text:'text-slate-400',badge:'bg-white/10 text-slate-400',icon:'📝'};

              const timeStr = log.created_at
                ? formatArDateTime(log.created_at as string, {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})
                : '';

              return React.createElement('div',{
                key:log.id||i,
                className:`bg-premium-card border ${s.border} rounded-xl p-2.5 space-y-1.5`
              },
                // ── صف 1: الأيقونة + نوع الإجراء + المنفذ + التوقيت ──
                React.createElement('div',{className:"flex items-center gap-2"},
                  React.createElement('div',{className:`w-6 h-6 rounded-lg ${s.bg} flex items-center justify-center text-[10px] flex-shrink-0`},
                    s.icon),
                  React.createElement('span',{className:`text-[10px] font-black ${s.text}`}, action),
                  React.createElement('div',{className:"flex-1"}),
                  log.user_name && React.createElement('span',{
                    className:"text-[9px] bg-white/8 text-slate-300 px-1.5 py-0.5 rounded-full font-bold"
                  }, "👤 "+log.user_name),
                  React.createElement('span',{className:"text-[9px] text-slate-600"}, timeStr)
                ),

                // ── صف 2: التفاصيل الكاملة ──
                log.details && React.createElement('p',{
                  className:"text-[10px] text-slate-300 leading-relaxed pr-8 border-r-2 border-white/10"
                }, log.details),

                // ── صف 3: وسوم السياق ──
                (log.client_name || log.case_name || log.case_type) && React.createElement('div',{className:"flex flex-wrap gap-1 pr-8"},
                  log.client_name && React.createElement('span',{
                    className:"text-[9px] bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/20 px-1.5 py-0.5 rounded-full"
                  },"👥 "+log.client_name),
                  log.case_name && React.createElement('span',{
                    className:"text-[9px] bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/20 px-1.5 py-0.5 rounded-full"
                  },"📁 "+log.case_name),
                  log.case_type && React.createElement('span',{
                    className:"text-[9px] bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/20 px-1.5 py-0.5 rounded-full"
                  },"⚖️ "+log.case_type)
                )
              );
            }),

            // ── Pagination ──
            activityTotal > ACTIVITY_PAGE_SIZE && React.createElement('div',{
              className:"flex items-center justify-between pt-1"
            },
              React.createElement('button',{
                onClick:()=>setActivityPage((p: number) =>Math.max(0,p-1)),
                disabled:activityPage===0,
                className:"flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-bold bg-white/8 text-slate-300 disabled:opacity-30 active:scale-95 transition-transform"
              }, React.createElement(I.ChevronRight,{className:"w-3 h-3"}), "السابق"),
              React.createElement('p',{className:"text-[10px] text-slate-500"},
                `${activityPage+1} / ${Math.ceil(activityTotal/ACTIVITY_PAGE_SIZE)}`),
              React.createElement('button',{
                onClick:()=>setActivityPage((p: number) =>p+1),
                disabled:(activityPage+1)*ACTIVITY_PAGE_SIZE>=activityTotal,
                className:"flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-bold bg-white/8 text-slate-300 disabled:opacity-30 active:scale-95 transition-transform"
              }, "التالي", React.createElement(I.ChevronLeft,{className:"w-3 h-3"}))
            )
          )
        );
}

export default ActivitySection;
