import { useState, useEffect } from 'react';
import { db, SUPA_URL, SUPA_KEY } from '../supabaseClient';
import type { ProfileRow } from '../types';

// ─────────────────────────────────────────────────────────
//  useDbConnectivity — منقول حرفيًا من App.tsx (فحص اتصال قاعدة
//  البيانات الدوري كل 30 ثانية). صفر تغيير في المنطق أو الترتيب.
// ─────────────────────────────────────────────────────────
export function useDbConnectivity(profile: ProfileRow | null) {
    const [dbOnline, setDbOnline] = useState<boolean|null>(null);

    useEffect(() => {
        if (!profile) return;
        const check = async () => {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) { setDbOnline(false); return; }
            const controller = new AbortController();
            const timeoutId  = setTimeout(() => controller.abort(), 8000);
            try {
                const { data: sessionData } = await db.auth.getSession();
                const token = sessionData?.session?.access_token || SUPA_KEY;
                const res = await fetch(`${SUPA_URL}/rest/v1/profiles?select=id&limit=1`, {
                    method: 'GET', cache: 'no-store', signal: controller.signal,
                    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${token}`, 'X-Health-Check': '1' },
                });
                setDbOnline(res.ok);
            } catch { setDbOnline(false); }
            finally { clearTimeout(timeoutId); }
        };
        // named handlers عشان removeEventListener يشتغل صح —
        // arrow function جديدة في كل مرة مش بتتشال بـ removeEventListener
        const handleOffline = () => setDbOnline(false);
        check();
        const interval = setInterval(check, 30000);
        window.addEventListener('online',  check);
        window.addEventListener('offline', handleOffline);
        return () => {
            clearInterval(interval);
            window.removeEventListener('online',  check);
            window.removeEventListener('offline', handleOffline);
        };
    }, [profile]);

    return { dbOnline };
}
