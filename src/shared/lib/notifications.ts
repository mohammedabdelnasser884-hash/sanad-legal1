// إشعارات الواجهة: toast، بانر الأوفلاين، مؤشر المزامنة
export function toast(msg: string, isErr = false) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    (el as HTMLElement).style.borderColor = isErr ? '#f87171' : '#D4AF37';
    (el as HTMLElement).style.color = isErr ? '#f87171' : '#D4AF37';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3400);
}

export function showOfflineBanner(pendingCount = 0) {
    const banner = document.getElementById('offline-banner');
    const badge  = document.getElementById('offline-queue-badge');
    if (!banner) return;
    banner.classList.add('visible');
    if (badge) {
        if (pendingCount > 0) { badge.textContent = `${pendingCount} معلّق`; (badge as HTMLElement).style.display = 'inline'; }
        else (badge as HTMLElement).style.display = 'none';
    }
}

export function hideOfflineBanner() {
    const banner = document.getElementById('offline-banner');
    if (banner) banner.classList.remove('visible');
}

export function showSyncIndicator(text = 'جاري المزامنة...') {
    const el = document.getElementById('sync-indicator');
    const tx = document.getElementById('sync-text');
    if (el) el.classList.add('visible');
    if (tx) tx.textContent = text;
}

export function hideSyncIndicator(successText: string | null = null) {
    const el = document.getElementById('sync-indicator');
    const tx = document.getElementById('sync-text');
    if (successText && tx) {
        tx.textContent = successText;
        setTimeout(() => { if (el) el.classList.remove('visible'); }, 2000);
    } else {
        if (el) el.classList.remove('visible');
    }
}

export async function flushPendingSubscription() {
    if (window.__pendingSubscription) {
        await window.__savePushSubscription(window.__pendingSubscription);
        window.__pendingSubscription = null;
    }
}
