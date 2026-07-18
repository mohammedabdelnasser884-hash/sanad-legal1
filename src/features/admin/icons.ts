import React from 'react';

const IconAdmin = () => React.createElement('svg',{className:"w-5 h-5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},
  React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"}));

const IconToggle = ({on}: {on: boolean}) => React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},
  on
    ? React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"})
    : React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"})
);

const IconKey = ({className="w-4 h-4"}:{className?:string}) => React.createElement('svg',{className,fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},
  React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z"}));

const IconPortal = () => React.createElement('svg',{className:"w-5 h-5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},
  React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"}),
  React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z",opacity:"0"})
);

const IconActivity = () => React.createElement('svg',{className:"w-5 h-5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},
  React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"}));

const IconSecurity = () => React.createElement('svg',{className:"w-5 h-5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},
  React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"}));

const IconLockSm = ({className="w-4 h-4"}:{className?:string}) => React.createElement('svg',{className,fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},
  React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"}));

const IconDevices = ({className="w-4 h-4"}:{className?:string}) => React.createElement('svg',{className,fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},
  React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z"}));

const IconWarning = () => React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},
  React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"}));

const IconBackup = () => React.createElement('svg',{className:"w-5 h-5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},
  React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"}));

const IconSessions = () => React.createElement('svg',{className:"w-5 h-5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},
  React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z"}),
  React.createElement('circle',{cx:"12",cy:"10",r:"2",fill:"currentColor",opacity:"0.5"}));

const IconOffice = () => React.createElement('svg',{className:"w-5 h-5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},
  React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"}));

// ─────────────────────────────────────────
//  الألوان لكل دور
// ─────────────────────────────────────────
type RoleConfigEntry = { label: string; color: string; bg: string; border: string };

const ROLE_CONFIG: Record<string, RoleConfigEntry> = {
  admin:  { label:'مدير', color:'text-[#C9A84C]',   bg:'bg-[#C9A84C]/15',   border:'border-[#C9A84C]/30' },
  lawyer: { label:'محامي', color:'text-[#C9A84C]',  bg:'bg-[#C9A84C]/15',  border:'border-[#C9A84C]/30' },
  viewer: { label:'مشاهد', color:'text-[#C9A84C]', bg:'bg-[#C9A84C]/15', border:'border-[#C9A84C]/30' },
};

const PERMISSION_LABELS = {
  can_add_cases:    { label:'إضافة قضايا',     icon:'⚖️' },
  can_edit_cases:   { label:'تعديل قضايا',     icon:'✏️' },
  can_delete_cases: { label:'حذف قضايا',       icon:'🗑️' },
  can_view_fees:    { label:'عرض الأتعاب',     icon:'💰' },
  can_edit_fees:    { label:'تعديل الأتعاب',   icon:'💳' },
  can_add_clients:  { label:'إضافة موكلين',    icon:'👤' },
  can_view_reports: { label:'عرض التقارير',    icon:'📊' },
  can_export_data:  { label:'تصدير البيانات',  icon:'📤' },
};

// ─────────────────────────────────────────
//  مودال تعديل المستخدم
// ─────────────────────────────────────────

export { IconAdmin, IconToggle, IconKey, IconPortal, IconActivity, IconSecurity, IconLockSm, IconDevices, IconWarning, IconBackup, IconSessions, IconOffice, ROLE_CONFIG, PERMISSION_LABELS };
