import { useEffect } from 'react';
import type { ProfileRow } from '../types';

interface UseInitialDataSyncArgs {
    profile: ProfileRow | null;
    casesFilter: string;
    clientSearch: string;
    fetchTodaySessions: () => Promise<void>;
    fetchMissedSessions: () => Promise<void>;
    fetchTasks: () => Promise<void>;
    fetchCases: (page?: number, filter?: string) => Promise<void>;
    fetchClients: (page?: number, search?: string) => Promise<void>;
    fetchUpcomingSessions: () => Promise<void>;
    fetchLawyers: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────
//  useInitialDataSync — منقول حرفيًا من App.tsx (دفعة 3):
//  1) التحميل الأولي للبيانات بعد ما الـ profile يتحمّل.
//  2) مستمع 'offline-sync-complete' اللي بيعيد تحميل القوائم
//     بعد ما مزامنة العمليات الأوفلاين تخلص في الخلفية.
//  صفر تغيير في المنطق أو الترتيب أو أسماء الـ dependencies.
// ─────────────────────────────────────────────────────────
export function useInitialDataSync({
    profile, casesFilter, clientSearch,
    fetchTodaySessions, fetchMissedSessions, fetchTasks,
    fetchCases, fetchClients, fetchUpcomingSessions, fetchLawyers,
}: UseInitialDataSyncArgs) {
    // ── Initial data fetch ────────────────────────────────────
    useEffect(() => {
        if (!profile) return;
        // Priority 1 — dashboard-critical (today's sessions, missed, tasks)
        Promise.all([fetchTodaySessions(), fetchMissedSessions(), fetchTasks()]);
        // Priority 2 — secondary data
        Promise.all([fetchCases(0, casesFilter), fetchClients(0, clientSearch), fetchUpcomingSessions(), fetchLawyers()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile]);

    // ── إعادة تحميل القوائم بعد ما المزامنة الأوفلاين تخلص ──────
    // العمليات اللي كانت محفوظة محلياً بتتزامن مع السيرفر في الخلفية،
    // وبدون هذا المستمع، القوائم المعروضة تفضل قديمة (تبدو كإن البيانات
    // "اختفت") لحد ما المستخدم يعمل ريفريش تاني بنفسه.
    useEffect(() => {
        if (!profile) return;
        const onSyncComplete = () => {
            Promise.all([
                fetchCases(0, casesFilter),
                fetchClients(0, clientSearch),
                fetchUpcomingSessions(),
                fetchTodaySessions(),
                fetchMissedSessions(),
            ]);
        };
        window.addEventListener('offline-sync-complete', onSyncComplete);
        return () => window.removeEventListener('offline-sync-complete', onSyncComplete);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile]);
}
