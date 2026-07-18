// ══════════════════════════════════════════════════════════════
//  سَنَد — Service Worker
//  الإصدار: 2.0  |  Offline + Push Notifications
// ══════════════════════════════════════════════════════════════

const SW_VERSION   = 'sanad-v2.3';
const STATIC_CACHE = SW_VERSION + '-static';
const DATA_CACHE   = SW_VERSION + '-data';

// ── الملفات الأساسية للـ App Shell ──
const APP_SHELL = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap',
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

// ══════════════════════════════════════════
//  INSTALL — تنزيل الـ App Shell
// ══════════════════════════════════════════
self.addEventListener('install', event => {
  console.log('[SW] Installing v' + SW_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        // نحاول نعمل cache للملفات الأساسية — لو فشل واحد منها مش مشكلة
        return Promise.allSettled(
          APP_SHELL.map(url =>
            cache.add(url).catch(err =>
              console.warn('[SW] Cache miss for', url, err)
            )
          )
        );
      })
      .then(() => {
        console.log('[SW] App Shell cached ✓');
        return self.skipWaiting(); // خليه يشتغل فوراً
      })
  );
});

// ══════════════════════════════════════════
//  ACTIVATE — تنظيف الـ cache القديم
// ══════════════════════════════════════════
self.addEventListener('activate', event => {
  console.log('[SW] Activating v' + SW_VERSION);
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== DATA_CACHE)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      );
    }).then(() => self.clients.claim()) // تحكم في كل الصفحات المفتوحة
  );
});

// ══════════════════════════════════════════
//  FETCH — استراتيجية Cache
// ══════════════════════════════════════════
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // ── 1. Supabase API — Network Only (لا cache لبيانات حساسة) ──
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // ── 2. Google Fonts ── Cache First
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirstWithNetwork(event.request));
    return;
  }

  // ── 3. CDN Scripts (Tailwind, Supabase SDK) — Cache First ──
  if (url.hostname.includes('cdn.tailwindcss.com') ||
      url.hostname.includes('cdn.jsdelivr.net') ||
      url.hostname.includes('esm.sh')) {
    event.respondWith(cacheFirstWithNetwork(event.request));
    return;
  }

  // ── 4. App نفسه (HTML, SW) — Network First ──
  if (url.hostname === self.location.hostname ||
      event.request.mode === 'navigate') {
    event.respondWith(networkFirstWithCache(event.request));
    return;
  }
});

// ── Network First: حاول الشبكة، لو فشلت رجّع الـ Cache ──
async function networkFirstWithCache(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const networkResponse = await fetch(request.clone());
    if (networkResponse && networkResponse.status === 200) {
      // حفظ في الـ cache
      if (request.method === 'GET') {
        cache.put(request, networkResponse.clone());
      }
    }
    return networkResponse;
  } catch (err) {
    // الشبكة فشلت — نرجع من الـ cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      console.log('[SW] Serving from cache (offline):', request.url);
      return cachedResponse;
    }
    // لو مفيش cache للـ HTML، نرجع الـ app shell
    if (request.mode === 'navigate') {
      return caches.match('./') || caches.match('./index.html');
    }
    return new Response(
      JSON.stringify({ error: 'أنت offline — لا يوجد اتصال بالإنترنت' }),
      { headers: { 'Content-Type': 'application/json' }, status: 503 }
    );
  }
}

// ── Cache First: رجّع من الـ Cache، لو مفيش جرّب الشبكة ──
async function cacheFirstWithNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    console.warn('[SW] Fetch failed for:', request.url);
    return new Response('', { status: 408 });
  }
}

// ══════════════════════════════════════════
//  BACKGROUND SYNC — مزامنة الـ Offline Queue
// ══════════════════════════════════════════
self.addEventListener('sync', event => {
  console.log('[SW] Background Sync triggered:', event.tag);
  if (event.tag === 'sync-offline-queue') {
    event.waitUntil(syncOfflineQueue());
  }
});

async function syncOfflineQueue() {
  // نبعت رسالة للـ app عشان يعمل المزامنة
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_OFFLINE_QUEUE' });
  });
}

// ══════════════════════════════════════════
//  PUSH NOTIFICATIONS — استقبال الإشعارات
// ══════════════════════════════════════════
self.addEventListener('push', event => {
  console.log('[SW] Push received');

  let data = { title: '⚖️ سَنَد', body: 'لديك تذكير جديد', tag: 'default' };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (e) {
    console.warn('[SW] Could not parse push data', e);
  }

  const options = {
    body: data.body,
    icon: data.icon || 'data:image/svg+xml,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect width="100" height="100" rx="22" fill="#0B1320"/>
        <line x1="22" y1="34" x2="78" y2="34" stroke="#D4AF37" stroke-width="9" stroke-linecap="round"/>
        <line x1="28" y1="50" x2="78" y2="50" stroke="#D4AF37" stroke-width="9" stroke-linecap="round"/>
        <line x1="34" y1="66" x2="78" y2="66" stroke="#D4AF37" stroke-width="9" stroke-linecap="round"/>
        <line x1="22" y1="34" x2="22" y2="72" stroke="#D4AF37" stroke-width="9" stroke-linecap="round"/>
        <circle cx="22" cy="34" r="9" fill="#D4AF37"/>
        <circle cx="22" cy="73" r="5.5" fill="#D4AF37" opacity="0.38"/>
      </svg>
    `),
    badge: data.badge || undefined,
    tag: data.tag || 'sanad',
    data: { url: data.url || './' },
    dir: 'rtl',
    lang: 'ar',
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [
      { action: 'open', title: '📱 فتح التطبيق' },
      { action: 'dismiss', title: '✕ إغلاق' }
    ],
    vibrate: [200, 100, 200],
    timestamp: Date.now(),
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ── التعامل مع الضغط على الإشعار ──
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification clicked:', event.action);
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // لو التطبيق مفتوح — فوكس عليه
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // لو مفيش — افتح تاب جديد
        return clients.openWindow(targetUrl);
      })
  );
});

// ── إغلاق الإشعار بدون ضغط ──
self.addEventListener('notificationclose', event => {
  console.log('[SW] Notification dismissed');
});

// ══════════════════════════════════════════
//  MESSAGES — التواصل مع الـ App
// ══════════════════════════════════════════
self.addEventListener('message', event => {
  const { type, payload } = event.data || {};

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: SW_VERSION });
  }
});
