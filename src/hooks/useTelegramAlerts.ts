import { useCallback } from 'react';
import { db } from '../supabaseClient';
import { recordError, recordSuccess, HEALTH_EVENT } from '../systemHealth';
import type { ProfileRow } from '../types';

// ⚠️ التوكن (tg_instant_token) بقى مخزّن في Supabase Vault ومبيوصلش
// للمتصفح إطلاقاً — راجع 09-telegram-token-vault-migration.sql.
// كان قبل كده بيتجاب بـ loadOfficeSetting كنص صريح وبيتستخدم في fetch
// مباشر لـ api.telegram.org من هنا، يعني أي مستخدم مسجل دخول (مهما
// كان دوره) كان يقدر يشوفه كامل في Network tab. دلوقتي الإرسال نفسه
// بيحصل على السيرفر عن طريق edge function telegram-send.
export function useTelegramAlerts(profile: ProfileRow | null) {
    const refreshHealth = useCallback(() => {
        window.dispatchEvent(new Event(HEALTH_EVENT));
    }, []);

    const sendTelegram = async (text: string) => {
        try {
            const { data, error } = await db.functions.invoke('telegram-send', {
                body: { text },
            });
            if (error || data?.error) {
                recordError('telegram', data?.error || error?.message);
                refreshHealth();
                return;
            }
            // data?.skipped === true يعني المكتب ده أصلاً مش ضابط بوت
            // التنبيهات الفورية — مش خطأ، فمنسجّلش لا نجاح ولا فشل.
            if (!data?.skipped) {
                recordSuccess('telegram');
                refreshHealth();
            }
        } catch (e) {
            console.error('Telegram error', e);
            recordError('telegram', (e as Error)?.message);
            refreshHealth();
        }
    };

    return { sendTelegram };
}
