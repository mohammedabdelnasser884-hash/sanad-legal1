import React, { useState, useEffect, useCallback, useRef } from 'react';
import { I } from '../../constants';

// ─── Sub-components ──────────────────────
import { IconAdmin, IconToggle, IconKey, IconPortal, IconActivity, IconSecurity, IconWarning, IconBackup, IconSessions, IconOffice, ROLE_CONFIG, PERMISSION_LABELS } from './icons';
import PortalSection from './portal/PortalSection';
import ActivitySection from './activity/ActivitySection';
import SessionsSection from './sessions/SessionsSection';
import SecuritySection from './security/SecuritySection';
import BackupSection from './backup/BackupSection';
import OfficeSection from './office/OfficeSection';
import LegalLibrarySection from './legal-library/LegalLibrarySection';
import UsersSection from './users/UsersSection';
import AdminPanelModals from './AdminPanelModals';
import AdminPanelSectionConfirms from './AdminPanelSectionConfirms';

// ─── Hooks ───────────────────────────────
import { useAdminUsers } from './users/hooks/useAdminUsers';
import { useAdminSessions } from './sessions/hooks/useAdminSessions';
import { useAdminActivity } from './activity/hooks/useAdminActivity';
import type { ActivityFilters } from './activity/hooks/useAdminActivity';
import { useAdminBackup } from './backup/hooks/useAdminBackup';
import { useAdminOffice } from './office/hooks/useAdminOffice';
import { useAdminLegalLibrary } from './legal-library/hooks/useAdminLegalLibrary';
import { useAdminPortal } from './portal/hooks/useAdminPortal';
import type { PortalAccessRow } from './portal/hooks/useAdminPortal';
// ─── Types ────────────────────────────────
import type { ProfileRow, ClientRow } from '../../types';

type SectionId = 'users' | 'portal' | 'activity' | 'sessions' | 'security' | 'backup' | 'office' | 'legal_library' | null;

// شكل عنصر بطاقات التنقل الرئيسية (نفس الحقول المستخدمة فعليًا في الـ .map تحت)
interface NavCardConfig {
  id: Exclude<SectionId, null>;
  icon: React.ReactNode;
  label: string;
  desc: string;
  badge: string | null;
  accentBefore: string;
  iconBg: string;
  iconColor: string;
  activeBg: string;
  activeBorder: string;
  hoverBorder: string;
}

// شكل عنصر بطاقات الإحصائيات السريعة
interface StatCardConfig {
  label: string;
  value: number;
  icon: string;
  bg: string;
  border: string;
  numColor: string;
  glowColor: string;
}

interface AdminPanelProps {
    profile: ProfileRow | null;
    lawyers: ProfileRow[];
    clients: ClientRow[];
    fetchLawyers: () => void;
}

export default function AdminPanel({ profile, lawyers, clients, fetchLawyers }: AdminPanelProps) {
  const [section, setSection] = useState<SectionId>(null);

  // ── قفل الـ scroll ──
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;
    if (section) { main.style.overflow = 'hidden'; }
    else { main.style.overflow = ''; }
    return () => { main.style.overflow = ''; };
  }, [section]);

  // ─── Hooks ──────────────────────────────
  const users = useAdminUsers(fetchLawyers, profile);
  const sessions = useAdminSessions(section, profile);
  const activity = useAdminActivity();
  const backup = useAdminBackup(profile);
  const office = useAdminOffice(profile?.tenant_id ?? null, profile);
  const library = useAdminLegalLibrary(profile);
  const portal = useAdminPortal(profile);

  // ── destructure للـ render compatibility (نفس أسماء المتغيرات القديمة) ──
  const { editUser, setEditUser, showAddUser, setShowAddUser, saving, confirmDelete, setConfirmDelete, changePassUser, setChangePassUser, confirmSignOut, setConfirmSignOut, confirmLock, setConfirmLock, securityMsg, setSecurityMsg, handleEditUser, handleAddUser, handleDeleteUser, toggleUserActive, handleChangePassword, handleSignOutAllDevices, handleToggleLock } = users;
  const { activeSessions, loadingSessions, terminatingSession, terminatingAll, setTerminatingAll, confirmTerminateAll, setConfirmTerminateAll, sessionsLastRefresh, sessionsAutoRefresh, setSessionsAutoRefresh, fetchActiveSessions, handleTerminateSession, handleTerminateAllSessions } = sessions;
  const { activityLog, activityTotal, loadingActivity, activityPage, setActivityPage, activityFilters, setActivityFilters, ACTIVITY_PAGE_SIZE, fetchActivity } = activity;

  // ── Debounce على بحث النشاط (400ms) — يمنع query لكل حرف ──
  const [activitySearchInput, setActivitySearchInput] = useState(activityFilters.search || '');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const handleActivitySearchChange = useCallback((val: string) => {
    setActivitySearchInput(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setActivityFilters((f: ActivityFilters) => ({ ...f, search: val }));
      setActivityPage(0);
    }, 400);
  }, [setActivityFilters, setActivityPage]);
  const { backups, loadingBackups, creatingBackup, backupProgress, confirmRestore, setConfirmRestore, restoreConfirmText, setRestoreConfirmText, restoringBackup, fetchBackups, handleCreateBackup, handleDownloadBackup, handleRestoreBackup } = backup;
  const { officeSettings, setOfficeSettings, loadingOffice, savingOffice, logoFile, setLogoFile, logoPreview, setLogoPreview, fetchOfficeSettings, handleSaveOfficeSettings } = office;
  const { laws, legalCategories, loadingLaws, showLawModal, setShowLawModal, editingLaw, setEditingLaw, confirmDeleteLaw, setConfirmDeleteLaw, savingLaw, processingLaw, fetchLaws, fetchLegalCategories, handleSaveLaw, handleProcessLaw, handleDeleteLaw } = library;
  const { portalAccess, portalClient, setPortalClient, clientSearch, setClientSearch, showAddPortalUser, setShowAddPortalUser, savingPortal, fetchPortalAccess, handleSavePortal } = portal;

  // ── جلب البيانات عند تغيير القسم ──
  useEffect(() => {
    fetchPortalAccess();
    // ملاحظة: قسم activity يُعاد جلبه من useEffect منفصل (يراقب الفلاتر والصفحة)
    // عشان نتجنب double-fetch لما المستخدم يفتح القسم لأول مرة
    if (section === 'backup')   fetchBackups();
    if (section === 'office')   fetchOfficeSettings();
    if (section === 'legal_library') { fetchLaws(); fetchLegalCategories(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  // ── جلب سجل النشاط عند فتح القسم أو تغيير الفلاتر أو الصفحة ──
  // useEffect واحد بس عشان ما يتنادى مرتين عند فتح القسم لأول مرة
  useEffect(() => {
    if (section === 'activity') fetchActivity(activityFilters, activityPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, activityFilters, activityPage]);

  // ── إحصائيات المستخدمين ──
  const stats = {
    total:         lawyers.length,
    active:        lawyers.filter((u: ProfileRow) => u.is_active !== false).length,
    admins:        lawyers.filter((u: ProfileRow) => u.role === 'admin').length,
    portalEnabled: portalAccess.filter((p: PortalAccessRow) => p.is_active !== false).length,
  };

  // ── قائمة الموكلين المفلترة لبوابة الموكل ──
  const filteredClients = clients.filter((c: ClientRow) =>
    !clientSearch.trim() || (c.full_name || c.client_name || '').includes(clientSearch.trim())
  );

  return React.createElement(React.Fragment, null,

    // ── المحتوى الرئيسي — متخفي لما section مفتوح ──
    React.createElement('div',{
      className:"space-y-4 fade-in px-4 py-4 pb-32",
      style: section ? {display:'none'} : {}
    },

    // ── هيدر ──
    React.createElement('div',{className:"flex items-center justify-between"},
      React.createElement('div',{className:"flex items-center gap-2"},
        React.createElement('div',{className:"w-9 h-9 rounded-xl bg-gradient-to-tr from-[#8B6914] to-[#C9A84C] flex items-center justify-center shadow-lg"},
          React.createElement(IconAdmin)
        ),
        React.createElement('div',null,
          React.createElement('h2',{className:"text-sm font-black text-white"},"لوحة الإدارة"),
          React.createElement('p',{className:"text-[10px] text-slate-500"},"Admin Panel")
        )
      ),
      section === 'users' && React.createElement('button',{
        onClick:()=>setShowAddUser(true),
        className:"flex items-center gap-1 bg-gradient-to-tr from-[#C9A84C] to-[#C9A84C]/80 text-white px-3 py-2 rounded-xl text-xs font-black shadow-lg active:scale-95 transition-transform"
      }, React.createElement(I.Plus), "مستخدم جديد")
    ),

    // ── Nav Cards (الترتيب الجديد) ──
    React.createElement('div',{className:"grid grid-cols-2 gap-2.5"},

      // صف 1: المستخدمون + بوابة الموكل
      ...([
        {
          id:'users',
          icon: React.createElement(I.Users),
          label:'المستخدمون',
          desc:'إدارة الصلاحيات',
          badge: String(stats.total),
          accentBefore:'#60a5fa',
          iconBg:'rgba(96,165,250,0.12)', iconColor:'#60a5fa',
          activeBg:'rgba(96,165,250,0.04)', activeBorder:'rgba(96,165,250,0.22)',
          hoverBorder:'rgba(96,165,250,0.25)',
        },
        {
          id:'portal',
          icon: React.createElement(IconPortal),
          label:'بوابة الموكل',
          desc:'أرقام دخول الموكلين',
          badge: String(stats.portalEnabled),
          accentBefore:'#a78bfa',
          iconBg:'rgba(167,139,250,0.12)', iconColor:'#a78bfa',
          activeBg:'', activeBorder:'',
          hoverBorder:'rgba(167,139,250,0.25)',
        },
        // صف 2: سجل النشاط + الجلسات
        {
          id:'activity',
          icon: React.createElement(IconActivity),
          label:'سجل النشاط',
          desc:'كل ما حدث',
          badge: null,
          accentBefore:'#60a5fa',
          iconBg:'rgba(96,165,250,0.12)', iconColor:'#60a5fa',
          activeBg:'', activeBorder:'',
          hoverBorder:'rgba(96,165,250,0.25)',
        },
        {
          id:'sessions',
          icon: React.createElement(IconSessions),
          label:'الجلسات',
          desc:'نشط خلال آخر 24 ساعة',
          badge: null,
          accentBefore:'#4ade80',
          iconBg:'rgba(74,222,128,0.12)', iconColor:'#4ade80',
          activeBg:'', activeBorder:'',
          hoverBorder:'rgba(74,222,128,0.25)',
        },
        // صف 3: الأمان + نسخ احتياطي
        {
          id:'security',
          icon: React.createElement(IconSecurity),
          label:'الأمان',
          desc:'كلمات المرور',
          badge: null,
          accentBefore:'#fb7185',
          iconBg:'rgba(251,113,133,0.12)', iconColor:'#fb7185',
          activeBg:'', activeBorder:'',
          hoverBorder:'rgba(251,113,133,0.25)',
        },
        {
          id:'backup',
          icon: React.createElement(IconBackup),
          label:'نسخ احتياطي',
          desc:'CSV و JSON',
          badge: null,
          accentBefore:'#22d3ee',
          iconBg:'rgba(34,211,238,0.12)', iconColor:'#22d3ee',
          activeBg:'', activeBorder:'',
          hoverBorder:'rgba(34,211,238,0.25)',
        },
      ] as NavCardConfig[]).map((t) =>
        React.createElement('button',{
          key: t.id,
          onClick: () => setSection(t.id),
          className:'active:scale-[0.97] transition-all text-right',
          style:{
            background: section===t.id ? (t.activeBg||'rgba(96,165,250,0.04)') : 'rgba(255,255,255,0.02)',
            border: `1px solid ${section===t.id ? (t.activeBorder||t.accentBefore+'55') : 'rgba(255,255,255,0.04)'}`,
            borderRadius: '16px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: '100px',
            position: 'relative',
            overflow: 'hidden',
            cursor: 'pointer',
          }
        },
          // خط علوي ملون
          React.createElement('div',{style:{
            position:'absolute', top:0, right:'12px', left:'12px',
            height:'2px', borderRadius:'0 0 4px 4px',
            background: t.accentBefore, opacity: section===t.id ? 1 : 0.5,
          }}),
          // أيقونة + badge
          React.createElement('div',{className:'flex items-start justify-between'},
            React.createElement('div',{style:{
              width:'30px', height:'30px', borderRadius:'10px',
              display:'flex', alignItems:'center', justifyContent:'center',
              background: t.iconBg, color: t.iconColor,
            }},
              React.createElement('div',{className:'w-4 h-4'}, t.icon)
            ),
            t.badge !== null && React.createElement('span',{
              className:'text-[11px] font-black px-2 py-0.5 rounded-lg',
              style:{background: t.iconBg, color: t.iconColor}
            }, t.badge)
          ),
          // نص
          React.createElement('div',null,
            React.createElement('p',{className:'text-xs font-black text-white leading-tight'}, t.label),
            React.createElement('p',{className:'text-[9.5px] text-slate-500 mt-0.5 font-medium'}, t.desc)
          ),
          // نقطة التحديد
          section===t.id && React.createElement('div',{style:{
            position:'absolute', bottom:'10px', left:'12px',
            width:'5px', height:'5px', borderRadius:'50%',
            background: t.accentBefore,
            boxShadow:`0 0 8px ${t.accentBefore}cc`,
          }})
        )
      ),

      // صف 4: إعدادات المكتب — عريض
      React.createElement('button',{
        key:'office',
        onClick:()=>setSection('office'),
        className:'active:scale-[0.97] transition-all text-right',
        style:{
          gridColumn:'span 2',
          background: section==='office' ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.02)',
          border:`1px solid ${section==='office' ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.04)'}`,
          borderRadius:'16px', padding:'14px',
          display:'flex', flexDirection:'row', alignItems:'center', gap:'14px',
          height:'78px', position:'relative', overflow:'hidden', cursor:'pointer',
        }
      },
        React.createElement('div',{style:{
          position:'absolute', top:0, right:0, left:0,
          height:'2px', background:'#f59e0b', opacity: section==='office' ? 1 : 0.5,
        }}),
        React.createElement('div',{style:{
          width:'34px', height:'34px', borderRadius:'12px', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'center',
          background:'rgba(245,158,11,0.12)', color:'#f59e0b',
        }},
          React.createElement('div',{className:'w-5 h-5'}, React.createElement(IconOffice))
        ),
        React.createElement('div',{style:{flex:1}},
          React.createElement('p',{className:'text-xs font-black text-white leading-tight'},'إعدادات المكتب'),
          React.createElement('p',{className:'text-[9.5px] text-slate-500 mt-0.5 font-medium'},'الهوية والفاتورة للمؤسسة القانونية')
        ),
        section==='office' && React.createElement('div',{style:{
          position:'absolute', bottom:'10px', left:'12px',
          width:'5px', height:'5px', borderRadius:'50%',
          background:'#f59e0b', boxShadow:'0 0 8px rgba(245,158,11,0.8)',
        }})
      ),

      // صف 5: المكتبة القانونية — عريض
      React.createElement('button',{
        key:'legal_library',
        onClick:()=>setSection('legal_library'),
        className:'active:scale-[0.97] transition-all text-right',
        style:{
          gridColumn:'span 2',
          background: section==='legal_library' ? 'rgba(45,212,191,0.06)' : 'rgba(255,255,255,0.02)',
          border:`1px solid ${section==='legal_library' ? 'rgba(45,212,191,0.3)' : 'rgba(255,255,255,0.04)'}`,
          borderRadius:'16px', padding:'14px',
          display:'flex', flexDirection:'row', alignItems:'center', gap:'14px',
          height:'78px', position:'relative', overflow:'hidden', cursor:'pointer',
        }
      },
        React.createElement('div',{style:{
          position:'absolute', top:0, right:0, left:0,
          height:'2px', background:'#2dd4bf', opacity: section==='legal_library' ? 1 : 0.5,
        }}),
        React.createElement('div',{style:{
          width:'34px', height:'34px', borderRadius:'12px', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'center',
          background:'rgba(45,212,191,0.12)', color:'#2dd4bf',
        }},
          React.createElement('div',{className:'w-5 h-5'}, React.createElement(I.Scale))
        ),
        React.createElement('div',{style:{flex:1}},
          React.createElement('p',{className:'text-xs font-black text-white leading-tight'},'المكتبة القانونية'),
          React.createElement('p',{className:'text-[9.5px] text-slate-500 mt-0.5 font-medium'},'القوانين والمواد التي يعتمد عليها المساعد الذكي')
        ),
        React.createElement('span',{
          className:'text-[11px] font-black px-2 py-0.5 rounded-lg',
          style:{background:'rgba(45,212,191,0.12)', color:'#2dd4bf'}
        }, String(laws.length)),
        section==='legal_library' && React.createElement('div',{style:{
          position:'absolute', bottom:'10px', left:'12px',
          width:'5px', height:'5px', borderRadius:'50%',
          background:'#2dd4bf', boxShadow:'0 0 8px rgba(45,212,191,0.8)',
        }})
      )
    ),

    // ── بوابة إدارة المكاتب المشتركة ──
    React.createElement('button',{
      onClick:()=> window.open('/offices-portal.html', '_blank'),
      className:'active:scale-[0.97] transition-all text-right w-full',
      style:{
        gridColumn:'span 2',
        background:'linear-gradient(135deg, rgba(139,105,20,0.12) 0%, rgba(201,168,76,0.08) 100%)',
        border:'1px solid rgba(201,168,76,0.3)',
        borderRadius:'16px', padding:'14px',
        display:'flex', flexDirection:'row', alignItems:'center', gap:'14px',
        height:'78px', position:'relative', overflow:'hidden', cursor:'pointer',
      }
    },
      React.createElement('div',{style:{
        position:'absolute', top:0, right:0, left:0,
        height:'2px', background:'linear-gradient(90deg,#8B6914,#C9A84C)', opacity:0.8,
      }}),
      React.createElement('div',{style:{
        width:'34px', height:'34px', borderRadius:'12px', flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'center',
        background:'rgba(201,168,76,0.15)', color:'#C9A84C',
      }},
        React.createElement('svg',{className:'w-5 h-5',fill:'none',viewBox:'0 0 24 24',stroke:'currentColor',strokeWidth:'1.5'},
          React.createElement('path',{strokeLinecap:'round',strokeLinejoin:'round',d:'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21'})
        )
      ),
      React.createElement('div',{style:{flex:1}},
        React.createElement('p',{className:'text-xs font-black text-white leading-tight'},'بوابة إدارة المكاتب'),
        React.createElement('p',{className:'text-[9.5px] mt-0.5 font-medium',style:{color:'#C9A84C'}},'إدارة المكاتب المشتركة في المنظومة ↗')
      ),
      React.createElement('div',{style:{
        width:'20px', height:'20px', borderRadius:'8px', flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'center',
        background:'rgba(201,168,76,0.15)', color:'#C9A84C',
      }},
        React.createElement('svg',{className:'w-3 h-3',fill:'none',viewBox:'0 0 24 24',stroke:'currentColor',strokeWidth:'2.5'},
          React.createElement('path',{strokeLinecap:'round',strokeLinejoin:'round',d:'M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25'})
        )
      )
    ),

    // ── إحصائيات سريعة ──
    React.createElement('div',{className:'space-y-2'},
      React.createElement('p',{className:'text-[9px] font-black text-slate-600 tracking-widest px-1'},'إحصائيات سريعة'),
      React.createElement('div',{className:'grid grid-cols-4 gap-2'},
        ([
          { label:'الإجمالي', value:stats.total,         icon:'👥', bg:'rgba(255,255,255,0.03)', border:'rgba(255,255,255,0.06)', numColor:'#e2e8f0', glowColor:'rgba(255,255,255,0.2)' },
          { label:'نشط',      value:stats.active,        icon:'⚡', bg:'rgba(74,222,128,0.06)',  border:'rgba(74,222,128,0.15)',  numColor:'#4ade80', glowColor:'rgba(74,222,128,0.6)' },
          { label:'مديرون',   value:stats.admins,        icon:'🛡', bg:'rgba(96,165,250,0.06)',  border:'rgba(96,165,250,0.15)',  numColor:'#60a5fa', glowColor:'rgba(96,165,250,0.6)' },
          { label:'بوابات',   value:stats.portalEnabled, icon:'🔑', bg:'rgba(245,158,11,0.06)',  border:'rgba(245,158,11,0.15)',  numColor:'#fbbf24', glowColor:'rgba(245,158,11,0.6)' },
        ] as StatCardConfig[]).map((s) => React.createElement('div',{
          key:s.label,
          style:{
            background:s.bg, border:`1px solid ${s.border}`,
            borderRadius:'13px', padding:'10px 6px 9px',
            textAlign:'center', position:'relative', overflow:'hidden',
          }
        },
          // خط علوي متوهج
          React.createElement('div',{style:{
            position:'absolute', top:0, left:'20%', right:'20%',
            height:'1.5px', borderRadius:'0 0 3px 3px',
            background:s.numColor, boxShadow:`0 0 6px ${s.glowColor}`,
          }}),
          React.createElement('div',{style:{fontSize:'13px', marginBottom:'4px', lineHeight:1}}, s.icon),
          React.createElement('p',{style:{fontSize:'19px', fontWeight:800, color:s.numColor, lineHeight:1, marginBottom:'3px'}}, s.value),
          React.createElement('p',{style:{fontSize:'8.5px', color:'#475569', fontWeight:700}}, s.label)
        ))
      )
    ),
  ), // ── نهاية div المحتوى الرئيسي ──

    // ══════════════════════════════════════
    //  FULL-SCREEN OVERLAY
    // ══════════════════════════════════════
    section && React.createElement('div',{
      className:"fixed inset-x-0 bottom-0 z-[60] flex flex-col bg-premium-bg slide-up-full",style:{top:"52px"}
    },

      // ── هيدر القسم مع لون مميز لكل قسم ──
      React.createElement('div',{
        className:"shrink-0 px-4 pb-3 backdrop-blur-lg flex flex-col",
        style:{
          paddingTop:'6px',
          background:'rgba(13,21,39,0.97)',
          borderBottom:'1px solid rgba(255,255,255,0.05)',
        }
      },
        // الشريط الملون العلوي لكل قسم
        React.createElement('div',{style:{
          position:'absolute', top:0, right:0, left:0, height:'3px',
          background:({
            users:   'linear-gradient(90deg,#3b82f6,#60a5fa)',
            portal:  'linear-gradient(90deg,#7c3aed,#a78bfa)',
            activity:'linear-gradient(90deg,#2563eb,#60a5fa)',
            sessions:'linear-gradient(90deg,#16a34a,#4ade80)',
            security:'linear-gradient(90deg,#e11d48,#fb7185)',
            backup:  'linear-gradient(90deg,#0891b2,#22d3ee)',
            office:  'linear-gradient(90deg,#d97706,#fbbf24)',
            legal_library: 'linear-gradient(90deg,#0d9488,#2dd4bf)',
          } as Record<string, string>)[section as string]||'transparent',
          boxShadow:({
            users:   '0 0 12px rgba(96,165,250,0.5)',
            portal:  '0 0 12px rgba(167,139,250,0.5)',
            activity:'0 0 12px rgba(96,165,250,0.5)',
            sessions:'0 0 12px rgba(74,222,128,0.5)',
            security:'0 0 12px rgba(251,113,133,0.5)',
            backup:  '0 0 12px rgba(34,211,238,0.5)',
            office:  '0 0 12px rgba(251,191,36,0.5)',
            legal_library: '0 0 12px rgba(45,212,191,0.5)',
          } as Record<string, string>)[section as string]||'none',
        }}),

        // صف الهيدر
        React.createElement('div',{className:"flex items-center justify-between mt-1"},
          React.createElement('div',{className:"flex items-center gap-3"},
            // زرار رجوع بسهم
            React.createElement('button',{
              onClick:()=>setSection(null),
              className:"w-9 h-9 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center text-slate-400 active:scale-90 transition-transform"
            },
              React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"})
              )
            ),
            React.createElement('div',null,
              React.createElement('h2',{className:"text-sm font-black text-white"},
                ({users:'المستخدمون',sessions:'الجلسات',portal:'بوابة الموكل',activity:'سجل النشاط',security:'الأمان',backup:'نسخ احتياطي',office:'إعدادات المكتب',legal_library:'المكتبة القانونية'} as Record<string, string>)[section as string]||''
              ),
              React.createElement('p',{className:"text-[10px] text-slate-500"},"لوحة الإدارة")
            )
          ),
          section === 'users' && React.createElement('button',{
            onClick:()=>setShowAddUser(true),
            className:"flex items-center gap-1 bg-gradient-to-tr from-[#C9A84C] to-[#C9A84C]/80 text-white px-3 py-2 rounded-xl text-xs font-black active:scale-95 transition-transform"
          }, React.createElement(I.Plus), "مستخدم جديد"),
          section === 'portal' && React.createElement('button',{
            onClick:()=>setShowAddPortalUser(true),
            className:"flex items-center gap-1 bg-gradient-to-tr from-[#C9A84C] to-[#E8C97A] text-white px-3 py-2 rounded-xl text-xs font-black active:scale-95 transition-transform"
          }, React.createElement(I.Plus), "وصول جديد"),
          section === 'legal_library' && React.createElement('button',{
            onClick:()=>{ setEditingLaw(null); setShowLawModal(true); },
            className:"flex items-center gap-1 bg-gradient-to-tr from-teal-500 to-teal-400 text-white px-3 py-2 rounded-xl text-xs font-black active:scale-95 transition-transform"
          }, React.createElement(I.Plus), "قانون جديد")
        )
      ),
      React.createElement('div',{className:"flex-1 overflow-y-auto no-scrollbar px-4 py-4 pb-10 space-y-3"},

    section === 'users' && React.createElement(UsersSection, { lawyers, profile, toggleUserActive, setChangePassUser, setEditUser, setConfirmDelete }),

    // ══════════════════════════
    //  SECTION: إدارة الجلسات
    // ══════════════════════════
    section === 'sessions' && React.createElement(SessionsSection, { profile, activeSessions, loadingSessions, terminatingSession, sessionsLastRefresh, sessionsAutoRefresh, setSessionsAutoRefresh, setConfirmTerminateAll, fetchActiveSessions, handleTerminateSession }),

    // ══════════════════════════
    //  SECTION: بوابة الموكل
    // ══════════════════════════
    section === 'portal' && React.createElement(PortalSection, { clientSearch, setClientSearch, filteredClients, portalAccess, setPortalClient }),

    // ══════════════════════════
    //  SECTION: سجل النشاط
    // ══════════════════════════
    section === 'activity' && React.createElement(ActivitySection, { activitySearchInput, setActivitySearchInput, handleActivitySearchChange, activityFilters, setActivityFilters, setActivityPage, lawyers, loadingActivity, activityTotal, ACTIVITY_PAGE_SIZE, activityPage, activityLog }),

    // ══════════════════════════
    //  SECTION: الأمان
    // ══════════════════════════
    section === 'security' && React.createElement(SecuritySection, { lawyers, setChangePassUser, setConfirmSignOut, setConfirmLock }),

    // ══════════════════════════
    //  SECTION: النسخ الاحتياطي
    // ══════════════════════════
    section === 'backup' && React.createElement(BackupSection, { handleCreateBackup, creatingBackup, backupProgress, fetchBackups, loadingBackups, backups, handleDownloadBackup, setConfirmRestore }),

    // ══════════════════════════
    //  SECTION: إعدادات المكتب
    // ══════════════════════════
    section === 'office' && React.createElement(OfficeSection, { loadingOffice, logoPreview, setLogoFile, setLogoPreview, officeSettings, setOfficeSettings, savingOffice, handleSaveOfficeSettings }),

    // ══════════════════════════
    //  SECTION: المكتبة القانونية
    // ══════════════════════════
    section === 'legal_library' && React.createElement(LegalLibrarySection, { loadingLaws, laws, legalCategories, processingLaw, handleProcessLaw, setEditingLaw, setShowLawModal, setConfirmDeleteLaw }),


    // مودالز مستقلة (مستخدم/بوابة موكل/كلمة مرور/مكتبة قانونية/حذف قانون/حذف مستخدم)
    // اتنقلت لملف منفصل AdminPanelModals.tsx — نفس المنطق تمامًا، صفر تغيير سلوك
    React.createElement(AdminPanelModals, {
      editUser, setEditUser, handleEditUser, saving,
      showAddUser, setShowAddUser, handleAddUser,
      showAddPortalUser, setShowAddPortalUser, clients, portalAccess, handleSavePortal, savingPortal,
      portalClient, setPortalClient,
      changePassUser, setChangePassUser, handleChangePassword,
      showLawModal, setShowLawModal, legalCategories, editingLaw, setEditingLaw, savingLaw, handleSaveLaw,
      confirmDeleteLaw, setConfirmDeleteLaw, handleDeleteLaw,
      confirmDelete, setConfirmDelete, handleDeleteUser,
    }),

    // تأكيدات القسم المفتوح (تسجيل خروج / قفل حساب / استعادة نسخة / إنهاء جلسات)
    // اتنقلت لملف منفصل AdminPanelSectionConfirms.tsx — نفس الموضع جوه overlay القسم بالظبط
    React.createElement(AdminPanelSectionConfirms, {
      confirmSignOut, setConfirmSignOut, handleSignOutAllDevices, saving,
      confirmLock, setConfirmLock, handleToggleLock,
      confirmRestore, setConfirmRestore, restoreConfirmText, setRestoreConfirmText, restoringBackup, handleRestoreBackup,
      confirmTerminateAll, setConfirmTerminateAll, activeSessions, profile, terminatingAll, handleTerminateAllSessions,
    }),
      ) // end scroll div
    ) // end overlay
  ); // Fragment
}
