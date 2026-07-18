import React from 'react';
import { db } from './supabaseClient';
import { resolveStorageUrl } from './shared/lib/storage';
import type { OfficeSettingsRow } from './types';
import type { Database } from './database.types';

// شكل كل كائن دولة في COUNTRY_CONFIGS — نفس الحقول الفعلية الموجودة في
// كل الكائنات السبعة (SA/AE/EG/BH/QA/KW/JO) تحت، بدون أي حقل إضافي مفترض.
export interface CountryConfig {
  name: string;
  flag: string;
  currency: string;
  currencyCode: string;
  dateSystem: string;
  calendarNote: string;
  legalSystem: string;
  referenceCode: string;
  courts: string[];
  caseTypes: string[];
  docHeader: string;
  docFormality: string;
  legalRefs: {
    civil: string;
    labor: string;
    commercial: string;
    criminal: string;
  };
  greeting: string;
  closing: string;
  color: string;
}

const I={
    Home:({className="w-5 h-5"}:{className?: string})=>React.createElement('svg',{className,fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"})),
    Bell:({className="w-5 h-5"}:{className?: string})=>React.createElement('svg',{className,fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"})),
    Money:({className="w-5 h-5"}:{className?: string})=>React.createElement('svg',{className,fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z"})),
    CalGrid:({className="w-5 h-5"}:{className?: string})=>React.createElement('svg',{className,fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z"})),
    Brief:({className="w-5 h-5"}:{className?: string})=>React.createElement('svg',{className,fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M20.25 14.15v4.25c0 .621-.504 1.125-1.125 1.125H4.875c-.621 0-1.125-.504-1.125-1.125v-4.25m16.5 0a2.25 2.25 0 0 0-1.883-2.212c-2.435-.415-4.914-.508-7.367-.279m7.367.28A2.25 2.25 0 0 1 20.25 16m-16.5-1.85a2.25 2.25 0 0 1 1.883-2.212c2.435-.415 4.914-.508 7.367-.279m-7.367.28A2.25 2.25 0 0 0 3.75 16"})),
    Users:({className="w-5 h-5"}:{className?: string})=>React.createElement('svg',{className,fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-2.533-3.076c-2.208-.802-4.596-.319-6.328 1m0 0c.1-.651-.074-1.32-.415-1.933a4.125 4.125 0 0 0-2.533-3.076c-2.208-.802-4.596-.319-6.328 1m3 2.28a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"})),
    Folder:({className="w-5 h-5"}:{className?: string})=>React.createElement('svg',{className,fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h1.52c.314 0 .62.113.86.317l3.183 2.69a.75.75 0 0 0 .47.163h6.917a2.25 2.25 0 0 1 2.25 2.25v.75m-18 0v-4.25m18 4.25v4.25a2.25 2.25 0 0 1-2.25 2.25H4.5A2.25 2.25 0 0 1 2.25 19.5V14m18 0A2.25 2.25 0 0 0 18 11.75H4.5"})),
    Search:()=>React.createElement('svg',{className:"w-5 h-5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z"})),
    Download:()=>React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"})),
    X:()=>React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M6 18 18 6M6 6l12 12"})),
    Plus:()=>React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"3",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M12 4.5v15m7.5-7.5h-15"})),
    Spin:()=>React.createElement('svg',{className:"w-5 h-5 animate-spin",fill:"none",viewBox:"0 0 24 24"},React.createElement('circle',{className:"opacity-25",cx:"12",cy:"12",r:"10",stroke:"currentColor",strokeWidth:"4"}),React.createElement('path',{className:"opacity-75",fill:"currentColor",d:"M4 12a8 8 0 018-8v8z"})),
    Shield:({className="w-5 h-5"}:{className?: string})=>React.createElement('svg',{className,fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"})),
    Logout:()=>React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"})),
    Eye:()=>React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"}),React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"})),
    Lock:()=>React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"})),
    Trash:()=>React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"})),
    Person:({className="w-5 h-5"}:{className?: string})=>React.createElement('svg',{className,fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"})),
    Phone:()=>React.createElement('svg',{className:"w-3 h-3",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 6.75Z"})),
    // Calendar محذوف — استخدم I.CalGrid مع className="w-4 h-4" لو محتاج حجم أصغر
    Note:()=>React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"})),
    ChevronLeft:()=>React.createElement('svg',{className:"w-5 h-5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M15.75 19.5 8.25 12l7.5-7.5"})),
    ChevronRight:()=>React.createElement('svg',{className:"w-5 h-5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M8.25 4.5l7.5 7.5-7.5 7.5"})),
    Refresh:()=>React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"})),
    Check:()=>React.createElement('svg',{className:"w-3.5 h-3.5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"m4.5 12.75 6 6 9-13.5"})),
    Edit:()=>React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"})),
    Scale:()=>React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 5.491Z"})),
    AI:({cls}: {cls?: string})=>React.createElement('svg',{className:cls||"w-5 h-5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"})),
    Doc:()=>React.createElement('svg',{className:"w-5 h-5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"})),
    Send:()=>React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"})),
    GCalendar:()=>React.createElement('svg',{className:"w-3.5 h-3.5",viewBox:"0 0 24 24",fill:"currentColor"},React.createElement('path',{d:"M19.5 3h-2V1.5A.5.5 0 0 0 17 1h-1a.5.5 0 0 0-.5.5V3h-7V1.5A.5.5 0 0 0 8 1H7a.5.5 0 0 0-.5.5V3h-2A2.5 2.5 0 0 0 2 5.5v14A2.5 2.5 0 0 0 4.5 22h15a2.5 2.5 0 0 0 2.5-2.5v-14A2.5 2.5 0 0 0 19.5 3zm.5 16.5a.5.5 0 0 1-.5.5h-15a.5.5 0 0 1-.5-.5V9h16v10.5zM4 7.5V5.5a.5.5 0 0 1 .5-.5h15a.5.5 0 0 1 .5.5V7.5H4z"})),
    ICalLink:()=>React.createElement('svg',{className:"w-3.5 h-3.5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.8",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"})),
    Print:()=>React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z"})),
    Copy:()=>React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"})),
};

// ══════════════════════════════════════════
//  إعدادات الدول — Country Configurations
// ══════════════════════════════════════════
const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  SA: {
    name: 'المملكة العربية السعودية', flag: '🇸🇦', currency: 'ريال سعودي', currencyCode: 'SAR',
    dateSystem: 'هجري وميلادي', calendarNote: 'يُعرض التاريخ الهجري والميلادي معاً',
    legalSystem: 'الشريعة الإسلامية ونظام المرافعات الشرعية',
    referenceCode: 'نظام المرافعات الشرعية الصادر بالمرسوم الملكي م/1 لعام 1435هـ',
    courts: ['المحكمة العامة','المحكمة التجارية','المحكمة العمالية','المحكمة الجزائية','محكمة الاستئناف','المحكمة العليا','ديوان المظالم','المحكمة الإدارية'],
    caseTypes: ['مدني عام','تجاري','عمالي','جزائي','أحوال شخصية','عقاري','ملكية فكرية','منازعات حكومية'],
    docHeader: 'بسم الله الرحمن الرحيم\nالمملكة العربية السعودية\nوزارة العدل\n',
    docFormality: 'رسمي ديني قانوني',
    legalRefs: {
      civil: 'المادة ({{n}}) من نظام المرافعات الشرعية',
      labor: 'المادة ({{n}}) من نظام العمل الصادر بالمرسوم الملكي م/51',
      commercial: 'المادة ({{n}}) من نظام الشركات',
      criminal: 'المادة ({{n}}) من نظام الإجراءات الجزائية',
    },
    greeting: 'صاحب الفضيلة رئيس المحكمة / القاضي الموقر',
    closing: 'والله يحفظكم ويرعاكم\nوتفضلوا بقبول فائق التقدير والاحترام',
    color: '#1e7e34',
  },
  AE: {
    name: 'الإمارات العربية المتحدة', flag: '🇦🇪', currency: 'درهم إماراتي', currencyCode: 'AED',
    dateSystem: 'ميلادي', calendarNote: 'التاريخ الميلادي بالتنسيق الإماراتي',
    legalSystem: 'القانون المدني الإماراتي وقانون الإجراءات المدنية',
    referenceCode: 'قانون الإجراءات المدنية الاتحادي رقم 11 لسنة 1992 وتعديلاته',
    courts: ['محكمة أول درجة','محكمة الاستئناف','المحكمة الاتحادية العليا','محكمة دبي الدولية','مركز تسوية النزاعات','محكمة أبوظبي للأسرة'],
    caseTypes: ['مدني','تجاري','عمالي','جزائي','أحوال شخصية','عقاري','بنكي ومالي','تحكيم دولي'],
    docHeader: 'دولة الإمارات العربية المتحدة\nوزارة العدل\n',
    docFormality: 'رسمي مدني',
    legalRefs: {
      civil: 'المادة ({{n}}) من قانون المعاملات المدنية الاتحادي',
      labor: 'المادة ({{n}}) من قانون العمل الاتحادي رقم 33 لسنة 2021',
      commercial: 'المادة ({{n}}) من قانون المعاملات التجارية',
      criminal: 'المادة ({{n}}) من قانون الإجراءات الجزائية الاتحادي',
    },
    greeting: 'حضرة القاضي الموقر / رئيس الدائرة المحترم',
    closing: 'وتقبلوا وافر التحية والاحترام',
    color: '#00732f',
  },
  EG: {
    name: 'جمهورية مصر العربية', flag: '🇪🇬', currency: 'جنيه مصري', currencyCode: 'EGP',
    dateSystem: 'ميلادي', calendarNote: 'التاريخ الميلادي بالتقويم المصري',
    legalSystem: 'القانون المدني المصري وقانون المرافعات المدنية والتجارية',
    referenceCode: 'قانون المرافعات المدنية والتجارية رقم 13 لسنة 1968 وتعديلاته',
    courts: ['محكمة أول درجة','محكمة الاستئناف','محكمة النقض','المحكمة الإدارية العليا','مجلس الدولة','المحكمة الدستورية العليا','القضاء العسكري'],
    caseTypes: ['مدني','تجاري','عمالي','جنائي','أحوال شخصية','إداري','دستوري','ضرائب وجمارك'],
    docHeader: 'جمهورية مصر العربية\nوزارة العدل\n',
    docFormality: 'رسمي قانوني مدني',
    legalRefs: {
      civil: 'المادة ({{n}}) من القانون المدني المصري رقم 131 لسنة 1948',
      labor: 'المادة ({{n}}) من قانون العمل رقم 12 لسنة 2003',
      commercial: 'المادة ({{n}}) من قانون التجارة رقم 17 لسنة 1999',
      criminal: 'المادة ({{n}}) من قانون الإجراءات الجنائية',
    },
    greeting: 'السيد المستشار رئيس المحكمة الموقر',
    closing: 'وتفضلوا بقبول وافر الاحترام والتقدير',
    color: '#ce1126',
  },
  KW: {
    name: 'دولة الكويت', flag: '🇰🇼', currency: 'دينار كويتي', currencyCode: 'KWD',
    dateSystem: 'ميلادي وهجري', calendarNote: 'يُستخدم التاريخان الميلادي والهجري',
    legalSystem: 'القانون المدني الكويتي وقانون المرافعات',
    referenceCode: 'قانون المرافعات المدنية والتجارية رقم 38 لسنة 1980',
    courts: ['محكمة الدرجة الأولى','محكمة الاستئناف','محكمة التمييز','المحكمة الدستورية','محاكم الأحوال الشخصية'],
    caseTypes: ['مدني','تجاري','عمالي','جزائي','أحوال شخصية','إداري','عقاري','بحري'],
    docHeader: 'دولة الكويت\nوزارة العدل\n',
    docFormality: 'رسمي قانوني',
    legalRefs: {
      civil: 'المادة ({{n}}) من القانون المدني الكويتي رقم 67 لسنة 1980',
      labor: 'المادة ({{n}}) من قانون العمل في القطاع الأهلي رقم 6 لسنة 2010',
      commercial: 'المادة ({{n}}) من قانون الشركات التجارية',
      criminal: 'المادة ({{n}}) من قانون الإجراءات والمحاكمات الجزائية',
    },
    greeting: 'حضرة القاضي الفاضل / رئيس المحكمة المحترم',
    closing: 'وتقبلوا تحياتي الخالصة واحترامي',
    color: '#007a3d',
  },
  BH: {
    name: 'مملكة البحرين', flag: '🇧🇭', currency: 'دينار بحريني', currencyCode: 'BHD',
    dateSystem: 'ميلادي', calendarNote: 'التاريخ الميلادي',
    legalSystem: 'القانون المدني البحريني وقانون أصول المحاكمات',
    referenceCode: 'قانون أصول المحاكمات المدنية والتجارية رقم 12 لسنة 1971',
    courts: ['المحكمة الابتدائية','محكمة الاستئناف','محكمة التمييز','المحكمة الدستورية','محكمة الأسرة','مركز الفصل في المنازعات'],
    caseTypes: ['مدني','تجاري','عمالي','جزائي','أسري','مصرفي','تحكيم','إداري'],
    docHeader: 'مملكة البحرين\nوزارة العدل والشؤون الإسلامية والأوقاف\n',
    docFormality: 'رسمي مدني',
    legalRefs: {
      civil: 'المادة ({{n}}) من القانون المدني البحريني رقم 19 لسنة 2001',
      labor: 'المادة ({{n}}) من قانون العمل لسنة 2012',
      commercial: 'المادة ({{n}}) من قانون الشركات التجارية',
      criminal: 'المادة ({{n}}) من قانون الإجراءات الجنائية',
    },
    greeting: 'حضرة القاضي الموقر / السيد رئيس المحكمة',
    closing: 'وتفضلوا بقبول فائق الاحترام والتقدير',
    color: '#ce1126',
  },
  QA: {
    name: 'دولة قطر', flag: '🇶🇦', currency: 'ريال قطري', currencyCode: 'QAR',
    dateSystem: 'ميلادي', calendarNote: 'التاريخ الميلادي',
    legalSystem: 'القانون المدني القطري وقانون المرافعات المدنية والتجارية',
    referenceCode: 'قانون المرافعات المدنية والتجارية رقم 13 لسنة 1990',
    courts: ['المحكمة الابتدائية','محكمة الاستئناف','محكمة التمييز','المحكمة الدستورية','المركز القطري للتحكيم','محكمة قطر الدولية'],
    caseTypes: ['مدني','تجاري','عمالي','جزائي','أحوال شخصية','إداري','عقاري','استثماري'],
    docHeader: 'دولة قطر\nوزارة العدل\n',
    docFormality: 'رسمي قانوني مدني',
    legalRefs: {
      civil: 'المادة ({{n}}) من القانون المدني القطري رقم 22 لسنة 2004',
      labor: 'المادة ({{n}}) من قانون العمل القطري رقم 14 لسنة 2004',
      commercial: 'المادة ({{n}}) من قانون الشركات التجارية رقم 11 لسنة 2015',
      criminal: 'المادة ({{n}}) من قانون الإجراءات الجنائية رقم 23 لسنة 2004',
    },
    greeting: 'حضرة القاضي الفاضل / رئيس الدائرة الموقر',
    closing: 'وتقبلوا وافر التحية والتقدير',
    color: '#8d1b3d',
  },
  JO: {
    name: 'المملكة الأردنية الهاشمية', flag: '🇯🇴', currency: 'دينار أردني', currencyCode: 'JOD',
    dateSystem: 'ميلادي وهجري', calendarNote: 'يُستخدم التاريخان',
    legalSystem: 'القانون المدني الأردني وقانون أصول المحاكمات المدنية',
    referenceCode: 'قانون أصول المحاكمات المدنية رقم 24 لسنة 1988 وتعديلاته',
    courts: ['محكمة الصلح','المحكمة الابتدائية','محكمة الاستئناف','محكمة التمييز','المحكمة الإدارية','محكمة الأحوال الشخصية'],
    caseTypes: ['مدني','تجاري','عمالي','جزائي','أحوال شخصية','إداري','عقاري','حقوق ملكية'],
    docHeader: 'المملكة الأردنية الهاشمية\nوزارة العدل\n',
    docFormality: 'رسمي قانوني مدني',
    legalRefs: {
      civil: 'المادة ({{n}}) من القانون المدني الأردني رقم 43 لسنة 1976',
      labor: 'المادة ({{n}}) من قانون العمل رقم 8 لسنة 1996',
      commercial: 'المادة ({{n}}) من قانون الشركات رقم 22 لسنة 1997',
      criminal: 'المادة ({{n}}) من قانون أصول المحاكمات الجزائية',
    },
    greeting: 'حضرة القاضي الفاضل / رئيس المحكمة المحترم',
    closing: 'وتقبلوا فائق الاحترام والتقدير',
    color: '#007a3d',
  },
};

// ── خريطة: مفتاح الكود → عمود قاعدة البيانات ──
// `as const` بيخلي TypeScript يستنتج نوع القيم كـ literals حقيقية (أسماء
// أعمدة فعلية) بدل `string` عام — ده اللي بيسمح لاحقًا نبني OfficeSettingsColumn
// كـ union حقيقي بدل ما نحتاج `as any` وقت القراءة/الكتابة الديناميكية.
const OFFICE_KEY_MAP = {
  office_name:           'name',
  office_tagline:        'slogan',
  office_logo_url:       'logo_url',
  office_logo:           'logo_url', // ⚠️ المفتاح الفعلي المستخدم في كل الكود (Settings/Fees/CaseDetail) — كان ناقص فاتسبب في حفظ صامت فاشل على عمود غير موجود
  office_color:          'brand_color',
  office_phone:          'phone',
  office_phone2:         'phone2',
  office_email:          'email',
  office_website:        'website',
  office_address:        'address',
  office_city:           'city',
  office_whatsapp:       'whatsapp',
  office_tax_number:     'tax_number',
  office_license:        'license_number',
  office_bar:            'license_number', // ⚠️ "نقابة المحامين" في الواجهة — مفيش عمود bar مستقل، نفس عمود الترخيص
  office_bank_name:      'bank_name',
  office_bank_iban:      'bank_iban',
  office_invoice_note:   'invoice_footer',
  office_invoice_prefix: 'invoice_prefix',
  tg_token:              'tg_token',
  tg_chat:               'tg_chat',
  // ⚠️ groq_key اتشال من هنا عمدًا — بقى بيتحفظ عن طريق edge function
  // office-secrets (Supabase Vault) مش عبر saveOfficeSetting العادية.
  // راجع groq-key-vault-migration.sql و useAIAssistant.ts.
} as const;

// ⚠️ loadOfficeSetting/saveOfficeSetting بيتقبلوا كمان مفاتيح مش موجودة في
// OFFICE_KEY_MAP وبيستخدموها كاسم عمود مباشر (فرع الـ fallback `|| key` تحت) —
// اتحقق فعليًا من كل الاستدعاءات في المشروع (SettingsPage.tsx: 'tg_daily_chat'،
// 'tg_instant_chat'، CountrySettings.tsx: 'country') وكلها أعمدة حقيقية في
// office_settings. الـ union هنا بيغطي الحالتين معًا: القيم اللي في الماب
// (أسماء الأعمدة الفعلية) + أي اسم عمود حقيقي تاني في الجدول (لتغطية فرع
// الـ fallback بأمان بدل ما يفضل مفتوح على أي string).
// استثناء id (number) و invoice_counter (number|null) — الأعمدة الرقمية
// الوحيدة في الجدول، ومفيش أي مسار في loadOfficeSetting/saveOfficeSetting
// بيحاول يقرأ/يكتب فيهم (كلاهما بيتعاملوا مع string فقط).
type OfficeSettingsColumn = Exclude<
  | typeof OFFICE_KEY_MAP[keyof typeof OFFICE_KEY_MAP]
  | keyof Database['public']['Tables']['office_settings']['Row'],
  'id' | 'invoice_counter'
>;

// ══════════════════════════════════════════
//  tenant_id الحالي — Multi-tenancy
// ══════════════════════════════════════════
// ⚠️ office_settings كان قبل كده صف واحد عام بدون فلترة tenant_id —
// يعني كل المكاتب على نفس المشروع كانوا بيشتركوا في نفس الإعدادات
// (مفتاح Groq، توكن تيليجرام، اسم المكتب، البنك...). دلوقتي كل قراءة/كتابة
// لازم تتفلتر بـ tenant_id المكتب الحالي.
//
// بدل ما نغيّر الـ signature بتاع loadOfficeSetting/saveOfficeSetting في
// كل استدعاء ليهم (منتشرين في تسع ملفات مختلفة)، App.tsx بينده على
// setCurrentTenantId() مرة واحدة لما الـ profile يتحمّل بعد تسجيل
// الدخول، وكل الدوال هنا بتستخدم القيمة دي تلقائيًا.
let _currentTenantId: string | null = null;

function setCurrentTenantId(tenantId: string | null) {
  if (_currentTenantId !== tenantId) {
    _currentTenantId = tenantId;
    _officeCache = null; // لازم نمسح الكاش عند تبديل المستخدم/المكتب
  }
}

// ⚠️ يُستخدم في أماكن خارج هذا الملف (مثل رفع شعار المكتب على Storage)
// محتاجة تعرف tenant_id الحالي عشان يبنوا مسار ملف خاص بكل مكتب.
function getCurrentTenantId(): string | null {
  return _currentTenantId;
}

// cache للصف كله عشان منعملش query لكل key — مفتاحه tenant_id الحالي
// النوع Partial لأن الكاش ممكن يكون `{}` (لسه مفيش tenant/صف اتلاقاش)
// مش صف كامل مضمون كل حقوله.
let _officeCache: Partial<OfficeSettingsRow> | null = null;
let _officeCacheTenantId: string | null = null;

async function _loadOfficeRow(){
  if(_officeCache && _officeCacheTenantId === _currentTenantId) return _officeCache;
  if(!_currentTenantId){
    // لسه مفيش tenant معروف (مثلاً قبل اكتمال تحميل profile) — رجّع صف
    // فاضي بدل ما نرجّع بيانات مكتب عشوائي.
    return {};
  }
  const {data} = await db.from('office_settings')
    .select('*')
    .eq('tenant_id', _currentTenantId)
    .limit(1)
    .maybeSingle();
  _officeCache = data || {};
  _officeCacheTenantId = _currentTenantId;
  return _officeCache;
}

// المفتاح الوارد (`key`) ديناميكي حقيقةً (باراميتر function، مش literal) —
// الكاست هنا محصور في خطوة "ترجمة المفتاح لاسم عمود" بس (نفس فكرة
// OFFICE_KEY_MAP[key] القديمة لكن مكتوب بنوع Record<string,string> صريح
// بدل ما يترك بدون نوع)، ومخرجاته دايمًا OfficeSettingsColumn الحقيقي —
// ده اللي بيخلي كل استخدام لاحق للعمود (قراءة أو كتابة) متحقق منه بالكامل.
function resolveOfficeColumn(key: string): OfficeSettingsColumn {
  return ((OFFICE_KEY_MAP as Record<string, string>)[key] || key) as OfficeSettingsColumn;
}

async function loadOfficeSetting(key: string): Promise<string|null>{
  const row = (await _loadOfficeRow()) || {};
  const col = resolveOfficeColumn(key);
  const value = row[col] ?? null;
  // ⚠️ باكت client-docs بقى private — القيمة المخزّنة في logo_url ممكن
  // تكون رابط موقّع منتهي، فبنولّد رابط طازة كل مرة بدل استخدامها مباشرة
  // (مهم خصوصًا لشعار الفاتورة في قسم الأتعاب — InvoiceModal/FeesTab).
  if (col === 'logo_url' && value) {
    return await resolveStorageUrl('client-docs', value);
  }
  return value;
}

async function saveOfficeSetting(key: string, value: string): Promise<void>{
  if(!_currentTenantId){
    console.error('saveOfficeSetting: لا يوجد tenant_id حالي — تم تجاهل الحفظ');
    throw new Error('لا يمكن الحفظ: لم يتم تحديد المكتب الحالي');
  }
  const col = resolveOfficeColumn(key);
  _officeCache = null;
  const row = await _loadOfficeRow();
  const id = row?.id;
  let error;
  // col بقى OfficeSettingsColumn حقيقي (مش string عام)، فـ update/insert هنا
  // بيتحققوا وقت الكتابة إن العمود موجود فعلاً في office_settings — مفيش
  // `as any` خالص على استدعاء supabase نفسه.
  // ⚠️ [col] مفتاح محسوب (computed key) من union حقيقي (OfficeSettingsColumn) —
  // TypeScript بيدمج أي object literal بمفتاح محسوب من union إلى نوع بـ
  // index signature عام (`{ [x: string]: string }`) مش نوع بمفاتيح محددة،
  // فبيتعارض مع RejectExcessProperties اللي بيستخدمها Supabase في update/insert.
  // الـ cast هنا عبر unknown آمن لأن col مضمون ليه OfficeSettingsColumn حقيقي
  // (مفروض مسبقًا من resolveOfficeColumn فوق).
  const updatePayload = {[col]: value} as unknown as Database['public']['Tables']['office_settings']['Update'];
  const insertPayload = {[col]: value, tenant_id: _currentTenantId} as unknown as Database['public']['Tables']['office_settings']['Insert'];
  if(id){
    ({error} = await db.from('office_settings').update(updatePayload).eq('id', id));
  } else {
    ({error} = await db.from('office_settings').insert(insertPayload));
  }
  _officeCache = null; // أعد التحميل في النداء الجاي بعد التحديث
  if(error){
    console.error('saveOfficeSetting: فشل الحفظ على عمود', col, error);
    throw error;
  }
}

// ⚠️ بعض الأماكن (useAdminOffice.ts مثلاً) بتحفظ مباشرة على جدول
// office_settings بدون المرور على saveOfficeSetting أعلاه — يعني
// الكاش هنا يفضل قديم في الذاكرة وأي قراءة تالية (مثل شعار الفاتورة
// في قسم الأتعاب) ترجّع بيانات قديمة لحد ما تتم إعادة تحميل الصفحة.
// لازم تتنده هذه الدالة فورًا بعد أي حفظ مباشر زي ده.
function invalidateOfficeCache(){
  _officeCache = null;
}

// ══════════════════════════════════════════
//  مكون إعدادات الدولة
// ══════════════════════════════════════════

// ══════════════════════════════════════════
//  شعار سَنَد — Sanad Mark Components
// ══════════════════════════════════════════

const SanadMark = ({size=40, gold='#D4AF37'}: {size?:number, gold?:string}) =>
  React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 40 40',
    xmlns: 'http://www.w3.org/2000/svg', style:{flexShrink:0}
  },
    React.createElement('line', {x1:'6',y1:'13',x2:'34',y2:'13',stroke:gold,strokeWidth:'4.5',strokeLinecap:'round'}),
    React.createElement('line', {x1:'9.5',y1:'21',x2:'34',y2:'21',stroke:gold,strokeWidth:'4.5',strokeLinecap:'round'}),
    React.createElement('line', {x1:'13',y1:'29',x2:'34',y2:'29',stroke:gold,strokeWidth:'4.5',strokeLinecap:'round'}),
    React.createElement('line', {x1:'6',y1:'13',x2:'6',y2:'32',stroke:gold,strokeWidth:'4.5',strokeLinecap:'round'}),
    React.createElement('circle', {cx:'6',cy:'13',r:'4.5',fill:gold}),
    React.createElement('circle', {cx:'6',cy:'33',r:'3',fill:gold,opacity:'0.38'})
  );

const SanadLogo = ({size=40, showTagline=false}: {size?:number, showTagline?:boolean}) =>
  React.createElement('div', {style:{display:'flex',alignItems:'center',gap:12}},
    React.createElement('div', {
      style:{width:size,height:size,background:'linear-gradient(135deg,#0d1a2e,#0B1320)',
        borderRadius:size*0.22,display:'flex',alignItems:'center',justifyContent:'center',
        boxShadow:'0 0 20px rgba(212,175,55,0.10)',border:'1px solid rgba(212,175,55,0.15)',flexShrink:0}
    }, React.createElement(SanadMark, {size:size*0.72})),
    React.createElement('div', {style:{display:'flex',flexDirection:'column'}},
      React.createElement('span', {
        style:{fontSize:size*0.45,fontWeight:900,color:'white',lineHeight:1,fontFamily:'Cairo,sans-serif'}
      }, 'سَنَد'),
      showTagline && React.createElement('span', {
        style:{fontSize:size*0.19,color:'#D4AF37',fontWeight:700,fontFamily:'Cairo,sans-serif',marginTop:2}
      }, 'نظام التشغيل القانوني')
    )
  );

const SanadIcon = ({size=48}: {size?:number}) =>
  React.createElement('div', {
    style:{width:size,height:size,background:'#0B1320',borderRadius:size*0.22,
      display:'flex',alignItems:'center',justifyContent:'center',
      border:'1px solid rgba(212,175,55,0.18)',flexShrink:0}
  }, React.createElement(SanadMark, {size:size*0.68}));

export { I, COUNTRY_CONFIGS, loadOfficeSetting, saveOfficeSetting, setCurrentTenantId, getCurrentTenantId, invalidateOfficeCache, SanadMark, SanadLogo, SanadIcon };
