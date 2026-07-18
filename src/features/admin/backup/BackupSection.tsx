import React from 'react';
import { I } from '../../../constants';
import { IconBackup, IconWarning } from '../icons';
import { formatArDate, formatArTime, formatArNumber } from '../../../shared/ui/arabicLocale';
import type { BackupRow } from '../../../types';

interface BackupSectionProps {
  handleCreateBackup: () => void | Promise<void>;
  creatingBackup: boolean;
  backupProgress: string;
  fetchBackups: () => void | Promise<void>;
  loadingBackups: boolean;
  backups: BackupRow[];
  handleDownloadBackup: (backup: BackupRow) => void;
  setConfirmRestore: React.Dispatch<React.SetStateAction<BackupRow | null>>;
}

function BackupSection({
  handleCreateBackup, creatingBackup, backupProgress,
  fetchBackups, loadingBackups, backups,
  handleDownloadBackup, setConfirmRestore,
}: BackupSectionProps) {
  return React.createElement('div',{className:"space-y-4"},

      // ── هيدر + زر إنشاء ──
      React.createElement('div',{
        className:"p-4 rounded-2xl bg-gradient-to-br from-[#C9A84C]/10 to-[#C9A84C]/05 border border-[#C9A84C]/20 space-y-3"
      },
        React.createElement('div',{className:"flex items-center gap-3"},
          React.createElement('div',{className:"w-10 h-10 rounded-xl bg-[#C9A84C]/20 flex items-center justify-center text-[#C9A84C]"},
            React.createElement(IconBackup)
          ),
          React.createElement('div',{className:"flex-1"},
            React.createElement('p',{className:"text-sm font-black text-white"},"النسخ الاحتياطي"),
            React.createElement('p',{className:"text-[10px] text-[#C9A84C]"},
              "يشمل: القضايا، الموكلين، الجلسات، الأتعاب، المستندات")
          )
        ),

        // زر إنشاء نسخة
        React.createElement('button',{
          onClick: handleCreateBackup,
          disabled: creatingBackup,
          className:"w-full py-3 rounded-xl text-xs font-black text-white bg-gradient-to-tr from-[#C9A84C] to-[#C9A84C]/80 shadow-lg active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
        },
          creatingBackup
            ? React.createElement(React.Fragment,null,
                React.createElement(I.Spin),
                React.createElement('span',null, backupProgress || 'جاري إنشاء النسخة...')
              )
            : React.createElement(React.Fragment,null,
                React.createElement('span',{className:"text-base"},"💾"),
                React.createElement('span',null,"إنشاء نسخة احتياطية الآن")
              )
        ),

        // تحذير مهم
        React.createElement('div',{className:"flex items-start gap-2"},
          React.createElement(IconWarning,{className:"w-3.5 h-3.5 text-[#C9A84C] flex-shrink-0 mt-0.5"}),
          React.createElement('p',{className:"text-[9px] text-slate-500 leading-relaxed"},
            "النسخ الاحتياطية تُخزَّن في Supabase ويمكن تنزيلها كملف JSON. احتفظ بنسخة محلية دورياً.")
        )
      ),

      // ── النسخ السابقة ──
      React.createElement('div',null,
        React.createElement('div',{className:"flex items-center justify-between mb-2"},
          React.createElement('p',{className:"text-xs font-black text-white"},"النسخ السابقة"),
          React.createElement('button',{
            onClick:fetchBackups,
            className:"text-[10px] text-slate-500 hover:text-white flex items-center gap-1"
          }, React.createElement(I.Refresh,{className:"w-3 h-3"}), "تحديث")
        ),

        loadingBackups
          ? React.createElement('div',{className:"flex items-center justify-center py-8 gap-2 text-slate-500 text-xs"},
              React.createElement(I.Spin), "جاري التحميل...")

          : backups.length === 0
          ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-xl p-8 text-center space-y-2"},
              React.createElement('p',{className:"text-2xl"},"💾"),
              React.createElement('p',{className:"text-slate-400 text-xs font-bold"},"لا توجد نسخ احتياطية بعد"),
              React.createElement('p',{className:"text-slate-600 text-[10px]"},"أنشئ أول نسخة الآن لحماية بياناتك")
            )

          : React.createElement('div',{className:"space-y-2"},
              ...backups.map((backup: BackupRow, i: number) => {
                const date = new Date(backup.created_at as string);
                const isToday = new Date().toDateString() === date.toDateString();
                return React.createElement('div',{
                  key:backup.id||i,
                  className:"bg-premium-card border border-white/5 rounded-2xl overflow-hidden"
                },
                  // معلومات النسخة
                  React.createElement('div',{className:"p-3 flex items-center gap-3"},
                    React.createElement('div',{className:`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg flex-shrink-0 ${i===0?'bg-[#C9A84C]/15':'bg-white/5'}`},
                      i===0?'🟢':'💾'),
                    React.createElement('div',{className:"flex-1 min-w-0"},
                      React.createElement('div',{className:"flex items-center gap-2"},
                        React.createElement('p',{className:"text-xs font-black text-white"},
                          formatArDate(date,{year:'numeric',month:'long',day:'numeric'})),
                        i===0 && React.createElement('span',{className:"text-[8px] bg-[#C9A84C]/20 text-[#C9A84C] px-1.5 py-0.5 rounded-full font-bold"},"الأحدث"),
                        isToday && React.createElement('span',{className:"text-[8px] bg-[#C9A84C]/20 text-[#C9A84C] px-1.5 py-0.5 rounded-full font-bold"},"اليوم")
                      ),
                      React.createElement('div',{className:"flex items-center gap-3 mt-0.5"},
                        React.createElement('p',{className:"text-[9px] text-slate-500"},
                          formatArTime(date,{hour:'2-digit',minute:'2-digit'})),
                        backup.rows_count && React.createElement('span',{className:"text-[9px] text-slate-600"},
                          formatArNumber(backup.rows_count)+" سجل"),
                        backup.size_kb && React.createElement('span',{className:"text-[9px] text-slate-600"},
                          backup.size_kb+" KB"),
                        backup.created_by_name && React.createElement('span',{className:"text-[9px] text-slate-600"},
                          "بواسطة: "+backup.created_by_name)
                      )
                    )
                  ),

                  // أزرار
                  React.createElement('div',{
                    className:"grid grid-cols-2 gap-px",
                    style:{background:'rgba(255,255,255,0.04)'}
                  },
                    // تنزيل
                    React.createElement('button',{
                      onClick:()=>handleDownloadBackup(backup),
                      className:"flex items-center justify-center gap-1.5 py-2.5 bg-premium-card hover:bg-[#C9A84C]/10 transition-colors active:scale-95"
                    },
                      React.createElement('span',{className:"text-xs"},"📥"),
                      React.createElement('span',{className:"text-[10px] font-bold text-[#C9A84C]"},"تنزيل JSON")
                    ),

                    // استعادة
                    React.createElement('button',{
                      onClick:()=>setConfirmRestore(backup),
                      className:"flex items-center justify-center gap-1.5 py-2.5 bg-premium-card hover:bg-[#C9A84C]/10 transition-colors active:scale-95"
                    },
                      React.createElement('span',{className:"text-xs"},"🔄"),
                      React.createElement('span',{className:"text-[10px] font-bold text-[#C9A84C]"},"استعادة")
                    )
                  )
                );
              })
            )
      )
    );
}

export default BackupSection;
