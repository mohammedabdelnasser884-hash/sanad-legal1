// ══════════════════════════════════════════════════════════
//  Service Worker Registration + PWA Install Prompt
//  منقول من main.tsx (اتفصل بتاريخ 15 يوليو 2026 كجزء من خطة
//  تخفيف main.tsx). لازم يتحمّل بعد offlineQueue.ts (اللي بيعرّف
//  window.__syncOfflineQueue المستخدم هنا في مستمع رسائل الـ SW).
// ══════════════════════════════════════════════════════════

declare global {
  interface Window {
    __swReady: boolean;
    __swRegistration: ServiceWorkerRegistration | null;
    __pendingSubscription: PushSubscription | null;
    __savePushSubscription: (sub: PushSubscription) => Promise<void>;
    __pwaInstallPrompt: BeforeInstallPromptEvent | null;
    __VAPID_PUBLIC_KEY: string;
  }
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }
}

window.__swReady = false;
window.__swRegistration = null;

// PWA Install prompt
window.__pwaInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    window.__pwaInstallPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new CustomEvent('pwa-installable'));
});
window.addEventListener('appinstalled', () => {
    window.__pwaInstallPrompt = null;
    window.dispatchEvent(new CustomEvent('pwa-installed'));
});

// Service Worker registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            window.__swRegistration = reg;
            window.__swReady = true;
            if (import.meta.env.DEV) console.log('[App] Service Worker registered ✓', reg.scope);

            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        window.dispatchEvent(new CustomEvent('sw-update-available'));
                    }
                });
            });

            navigator.serviceWorker.addEventListener('message', async (event: MessageEvent) => {
                if (event.data?.type === 'SYNC_OFFLINE_QUEUE') {
                    await window.__syncOfflineQueue?.();
                }
            });
        } catch (err) {
            console.warn('[App] Service Worker registration failed:', err);
        }
    });
}
