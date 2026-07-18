import { useState, useMemo } from 'react';
import { COUNTRY_CONFIGS } from '../../../constants';
import type { ProfileRow } from '../../../types';
import type { AIMessage, AITopic } from './aiAssistantTypes';

// ─────────────────────────────────────────────────────────
//  useAITopics — منقول حرفيًا من useAIAssistant.ts (دفعة 4):
//  إدارة مواضيع المحادثة في localStorage + messages/setMessages.
//  صفر تغيير في المنطق أو الصياغة.
// ─────────────────────────────────────────────────────────
export function useAITopics(profile: ProfileRow | null, country: string) {
    // ── Topics persisted in localStorage — مفتاح مخصص لكل مستخدم ──
    // ⚠️ لو المفتاح ثابت، محامي تاني على نفس الجهاز يشوف محادثات زميله
    const userId = profile?.id || profile?.user_id || 'guest';
    const TOPICS_KEY = `sanad_ai_topics_v2_${userId}`;
    const loadTopics = (): AITopic[] => { try { return JSON.parse(localStorage.getItem(TOPICS_KEY)||'[]'); } catch(e){ return []; } };
    const saveTopics = (t: AITopic[]) => {
        try {
            localStorage.setItem(TOPICS_KEY, JSON.stringify(t));
        } catch (e) {
            // ⚠️ FIX: كان بيتجاهل الخطأ بصمت — لو localStorage ممتلئة أو
            // في وضع تصفح خاص، المستخدم كان بيفقد تاريخ محادثاته من غير
            // أي تنبيه. تسجيل في الكونسول على الأقل يسهّل تشخيص المشكلة.
            console.warn('[AI Assistant] تعذر حفظ مواضيع المحادثة محليًا:', (e as Error)?.message || e);
        }
    };

    const [topics, setTopics] = useState(() => loadTopics());
    const [activeTopicId, setActiveTopicId] = useState(() => { const t = loadTopics(); return t.length > 0 ? t[0].id : null; });
    const [showTopics, setShowTopics] = useState(false);

    const activeCfgEarly = COUNTRY_CONFIGS[country||'SA'];
    const welcomeMsg: AIMessage = {role:'assistant', text:'مرحباً ⚖️ أنا مستشارك القانوني المتخصص في قانون '+activeCfgEarly.name+'.\n\nفي كل رد سأقدم لك:\n📋 التكييف القانوني الدقيق\n⚖️ نصوص المواد حرفياً مع أرقامها\n📚 مصدر القانون ورقمه وسنته\n🏛️ أحكام المحاكم ذات الصلة\n💡 التطبيق العملي الواقعي\n⚠️ تنبيهات إجرائية مهمة\n\nاسألني في أي مسألة قانونية.\n\n⚠️ تنبيه مهم: هذا المساعد أداة استرشادية بالذكاء الاصطناعي ولا يُغني عن استشارة محامٍ مرخّص. يُرجى مراجعة أي معلومة أو مستند قانوني مع محامٍ مختص قبل الاعتماد عليه في أي إجراء رسمي.'};

    const activeMessages = useMemo(() => {
        const t = topics.find((t: AITopic) => t.id === activeTopicId);
        return t ? t.messages : [welcomeMsg];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [topics, activeTopicId]);

    const setMessages = (msgs: AIMessage[] | ((prev: AIMessage[]) => AIMessage[])) => {
        setTopics((prev: AITopic[]) => {
            let updated;
            const resolvedMsgs = typeof msgs === 'function' ? msgs(activeMessages) : msgs;
            if (!activeTopicId) {
                const newId = 'topic_' + Date.now();
                const firstUser = resolvedMsgs.find((m: AIMessage) => m.role === 'user');
                const title = firstUser ? firstUser.text.replace(/\[سياق.*?\]/g,'').trim().substring(0, 35) : 'موضوع جديد';
                updated = [{ id: newId, title, createdAt: Date.now(), messages: resolvedMsgs }, ...prev];
                setActiveTopicId(newId);
            } else {
                updated = prev.map((t: AITopic) => t.id === activeTopicId ? { ...t, messages: resolvedMsgs } : t);
            }
            saveTopics(updated);
            return updated;
        });
    };

    const messages = activeMessages;

    const newTopic = () => { setActiveTopicId(null); setShowTopics(false); };
    const deleteTopic = (id: string) => {
        setTopics((prev: AITopic[]) => {
            const updated = prev.filter((t: AITopic) => t.id !== id);
            saveTopics(updated);
            if (activeTopicId === id) setActiveTopicId(updated.length > 0 ? updated[0].id : null);
            return updated;
        });
    };

    return {
        topics, setTopics, activeTopicId, setActiveTopicId,
        showTopics, setShowTopics, newTopic, deleteTopic,
        messages, setMessages,
    };
}
