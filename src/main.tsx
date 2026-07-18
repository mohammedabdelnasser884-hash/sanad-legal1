import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { installGlobalErrorWatcher } from './systemHealth';
import ErrorBoundary from './ErrorBoundary';
// ⚠️ ترتيب الاستيراد هنا مقصود: offlineQueue.ts لازم يتحمّل قبل
// serviceWorkerBootstrap.ts لأن مستمع رسائل الـ Service Worker
// (SYNC_OFFLINE_QUEUE) بينادي window.__syncOfflineQueue المُعرّف
// في offlineQueue.ts. الاستيرادات دي كلها side-effect فقط (بتسجّل
// دوال على window وبتضيف event listeners)، مفيش exports مستخدمة هنا.
import './lib/offlineQueue';
import './lib/serviceWorkerBootstrap';
import './lib/heartbeat';

// شبكة أمان: تمسك أي خطأ غير متوقع (JS error أو Promise مرفوض بلا catch)
// من أي مكان في التطبيق وتسجّله كتنبيه في الصفحة الرئيسية
installGlobalErrorWatcher();

// ══════════════════════════════════════════════════════════
//  Mount — بعد تعريف كل الـ globals (offlineQueue/serviceWorkerBootstrap)
//  عشان Service Worker يلاقيها جاهزة لو طلب sync قبل أو أثناء أول render
// ══════════════════════════════════════════════════════════
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);
