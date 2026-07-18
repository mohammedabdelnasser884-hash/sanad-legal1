import React from 'react';
import { I } from '../../constants';
import { IconDevices, IconLockSm } from './icons';
import { formatArDate, formatArNumber } from '../../shared/ui/arabicLocale';
import type { ProfileRow, BackupRow } from '../../types';
import type { ActiveSession } from './sessions/hooks/useAdminSessions';

// تأكيدات مرتبطة بقسم مفتوح حاليًا (أمان / نسخ احتياطي / جلسات) — بتترندر
// جوه الـ overlay/scroll div بتاع القسم بنفس الموضع بالظبط زي الأصل في AdminPanel.tsx
// (صفر تغيير سلوك أو تغيير في ترتيب DOM).
interface AdminPanelSectionConfirmsProps {
  // تأكيد تسجيل الخروج من الأجهزة
  confirmSignOut: ProfileRow | null;
  setConfirmSignOut: (u: ProfileRow | null) => void;
  handleSignOutAllDevices: (user: ProfileRow) => void;
  saving: boolean;

  // تأكيد قفل/فتح الحساب
  confirmLock: ProfileRow | null;
  setConfirmLock: (u: ProfileRow | null) => void;
  handleToggleLock: (user: ProfileRow) => void;

  // تأكيد استعادة نسخة احتياطية
  confirmRestore: BackupRow | null;
  setConfirmRestore: (b: BackupRow | null) => void;
  restoreConfirmText: string;
  setRestoreConfirmText: (v: string) => void;
  restoringBackup: boolean;
  handleRestoreBackup: (backup: BackupRow) => void;

  // تأكيد إنهاء جميع الجلسات
  confirmTerminateAll: boolean;
  setConfirmTerminateAll: (v: boolean) => void;
  activeSessions: ActiveSession[];
  profile: ProfileRow | null;
  terminatingAll: boolean;
  handleTerminateAllSessions: () => void;
}

export function AdminPanelSectionConfirms(props: AdminPanelSectionConfirmsProps) {
  const {
    confirmSignOut, setConfirmSignOut, handleSignOutAllDevices, saving,
    confirmLock, setConfirmLock, handleToggleLock,
    confirmRestore, setConfirmRestore, restoreConfirmText, setRestoreConfirmText, restoringBackup, handleRestoreBackup,
    confirmTerminateAll, setConfirmTerminateAll, activeSessions, profile, terminatingAll, handleTerminateAllSessions,
  } = props;

  return React.createElement(React.Fragment, null,

    // تأكيد تسجيل الخروج من الأجهزة
    confirmSignOut && React.createElement('div', {
      className: "fixed inset-0 z-50 flex items-center justify-center px-4",
      style: { background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }
    },
      React.createElement('div', {
        className: "w-full max-w-xs rounded-2xl p-5 space-y-4 text-center",
        style: { background: '#0d1a2e', border: '1px solid rgba(244,63,94,0.3)' }
      },
        React.createElement('div', { className: "w-14 h-14 rounded-2xl bg-[#C9A84C]/15 flex items-center justify-center mx-auto" },
          React.createElement(IconDevices, { className: "w-7 h-7 text-[#C9A84C]" })
        ),
        React.createElement('div', null,
          React.createElement('p', { className: "text-sm font-black text-white" }, "تسجيل خروج من جميع الأجهزة؟"),
          React.createElement('p', { className: "text-xs text-slate-500 mt-1" },
            "سيتم إنهاء جميع جلسات " + confirmSignOut.full_name + " على كل الأجهزة فوراً")
        ),
        React.createElement('div', { className: "grid grid-cols-2 gap-2" },
          React.createElement('button', {
            onClick: () => setConfirmSignOut(null),
            className: "py-2.5 rounded-xl text-xs font-black bg-white/8 text-slate-300 active:scale-95 transition-transform"
          }, "إلغاء"),
          React.createElement('button', {
            onClick: () => handleSignOutAllDevices(confirmSignOut),
            disabled: saving,
            className: "py-2.5 rounded-xl text-xs font-black bg-red-500 text-white active:scale-95 transition-transform disabled:opacity-50"
          }, saving ? 'جاري...' : 'تسجيل خروج')
        )
      )
    ),

    // تأكيد قفل/فتح الحساب
    confirmLock && React.createElement('div', {
      className: "fixed inset-0 z-50 flex items-center justify-center px-4",
      style: { background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }
    },
      React.createElement('div', {
        className: "w-full max-w-xs rounded-2xl p-5 space-y-4 text-center",
        style: { background: '#0d1a2e', border: `1px solid ${confirmLock.is_locked ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }
      },
        React.createElement('div', {
          className: `w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${confirmLock.is_locked ? 'bg-[#C9A84C]/15' : 'bg-red-500/15'}`
        },
          React.createElement(IconLockSm, { className: `w-7 h-7 ${confirmLock.is_locked ? 'text-[#C9A84C]' : 'text-red-400'}` })
        ),
        React.createElement('div', null,
          React.createElement('p', { className: "text-sm font-black text-white" },
            confirmLock.is_locked ? "فتح حساب " + confirmLock.full_name + "؟" : "قفل حساب " + confirmLock.full_name + "؟"),
          React.createElement('p', { className: "text-xs text-slate-500 mt-1" },
            confirmLock.is_locked
              ? "سيتمكن المستخدم من تسجيل الدخول مجدداً"
              : "لن يستطيع المستخدم تسجيل الدخول حتى يُفتح حسابه")
        ),
        React.createElement('div', { className: "grid grid-cols-2 gap-2" },
          React.createElement('button', {
            onClick: () => setConfirmLock(null),
            className: "py-2.5 rounded-xl text-xs font-black bg-white/8 text-slate-300 active:scale-95 transition-transform"
          }, "إلغاء"),
          React.createElement('button', {
            onClick: () => handleToggleLock(confirmLock),
            disabled: saving,
            className: `py-2.5 rounded-xl text-xs font-black text-white active:scale-95 transition-transform disabled:opacity-50 ${confirmLock.is_locked ? 'bg-[#C9A84C]' : 'bg-red-500'}`
          }, saving ? 'جاري...' : (confirmLock.is_locked ? 'فتح الحساب' : 'قفل الحساب'))
        )
      )
    ),

    // تأكيد الاستعادة
    confirmRestore && React.createElement('div', {
      className: "fixed inset-0 z-50 flex items-center justify-center px-4",
      style: { background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }
    },
      React.createElement('div', {
        className: "w-full max-w-xs rounded-2xl p-5 space-y-4",
        style: { background: '#0d1a2e', border: '1px solid rgba(245,158,11,0.3)' }
      },
        // أيقونة
        React.createElement('div', { className: "text-center space-y-2" },
          React.createElement('div', { className: "w-14 h-14 rounded-2xl bg-[#C9A84C]/15 flex items-center justify-center mx-auto text-2xl" }, "🔄"),
          React.createElement('p', { className: "text-sm font-black text-white" }, "استعادة النسخة الاحتياطية؟"),
          React.createElement('p', { className: "text-xs text-slate-500" },
            formatArDate(confirmRestore.created_at || Date.now(), { year: 'numeric', month: 'long', day: 'numeric' }))
        ),

        // تحذير
        React.createElement('div', { className: "p-3 rounded-xl bg-red-500/10 border border-red-500/20 space-y-1" },
          React.createElement('p', { className: "text-[10px] font-black text-red-400" }, "⚠️ تحذير مهم"),
          React.createElement('p', { className: "text-[9px] text-slate-400 leading-relaxed" },
            "ستُستبدل البيانات الحالية بالنسخة المحددة. هذه العملية لا يمكن التراجع عنها. يُنصح بإنشاء نسخة احتياطية جديدة أولاً.")
        ),

        // حقل التأكيد المزدوج — اكتب "استعادة" للمتابعة
        React.createElement('div', { className: "space-y-1" },
          React.createElement('p', { className: "text-[9px] text-slate-400 text-center" },
            'اكتب ', React.createElement('span', { className: "text-red-400 font-black" }, '"استعادة"'), ' للتأكيد:'
          ),
          React.createElement('input', {
            type: 'text', value: restoreConfirmText,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setRestoreConfirmText(e.target.value),
            placeholder: 'استعادة',
            className: 'w-full p-2 text-center text-xs rounded-xl border border-red-500/30 bg-red-500/5 text-white placeholder-slate-600',
            style: { fontFamily: 'Cairo,sans-serif' }
          })
        ),

        // معلومات النسخة
        confirmRestore.rows_count && React.createElement('div', { className: "flex justify-between text-[10px] text-slate-500 px-1" },
          React.createElement('span', null, formatArNumber(confirmRestore.rows_count) + " سجل"),
          React.createElement('span', null, confirmRestore.size_kb + " KB"),
          React.createElement('span', null, "بواسطة: " + (confirmRestore.created_by_name || '—'))
        ),

        // أزرار
        React.createElement('div', { className: "grid grid-cols-2 gap-2" },
          React.createElement('button', {
            onClick: () => { setConfirmRestore(null); setRestoreConfirmText(''); },
            className: "py-2.5 rounded-xl text-xs font-black bg-white/8 text-slate-300 active:scale-95 transition-transform"
          }, "إلغاء"),
          React.createElement('button', {
            onClick: () => handleRestoreBackup(confirmRestore),
            disabled: restoringBackup || restoreConfirmText.trim() !== 'استعادة',
            className: "py-2.5 rounded-xl text-xs font-black bg-[#C9A84C] text-white active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-1"
          },
            restoringBackup ? React.createElement(React.Fragment, null, React.createElement(I.Spin), "جاري الاستعادة...")
              : "استعادة الآن"
          )
        )
      )
    ),

    // تأكيد إنهاء جميع الجلسات
    confirmTerminateAll && React.createElement('div', {
      className: "fixed inset-0 z-50 flex items-center justify-center px-4",
      style: { background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(4px)' }
    },
      React.createElement('div', {
        className: "w-full max-w-xs rounded-2xl p-5 space-y-4 text-center",
        style: { background: '#0d1a2e', border: '1px solid rgba(239,68,68,0.35)' }
      },
        React.createElement('div', { className: "w-14 h-14 rounded-2xl bg-[#C9A84C]/15 flex items-center justify-center mx-auto text-2xl" }, "⛔"),
        React.createElement('div', null,
          React.createElement('p', { className: "text-sm font-black text-white" }, "إنهاء جميع الجلسات؟"),
          React.createElement('p', { className: "text-xs text-slate-500 mt-1 leading-relaxed" },
            "سيتم فصل جميع المستخدمين (",
            activeSessions.filter((s: ActiveSession) => s.profileId !== profile?.id).length,
            " مستخدم) وإجبارهم على تسجيل الدخول مجدداً. جلستك الحالية لن تتأثر."
          )
        ),
        React.createElement('div', { className: "grid grid-cols-2 gap-2" },
          React.createElement('button', {
            onClick: () => setConfirmTerminateAll(false),
            className: "py-2.5 rounded-xl text-xs font-black bg-white/8 text-slate-300 active:scale-95 transition-transform"
          }, "إلغاء"),
          React.createElement('button', {
            onClick: handleTerminateAllSessions,
            disabled: terminatingAll,
            className: "py-2.5 rounded-xl text-xs font-black bg-red-500 text-white active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-1"
          }, terminatingAll
            ? React.createElement(React.Fragment, null, React.createElement(I.Spin), "جاري الإنهاء...")
            : "إنهاء الكل الآن"
          )
        )
      )
    )
  );
}

export default AdminPanelSectionConfirms;
