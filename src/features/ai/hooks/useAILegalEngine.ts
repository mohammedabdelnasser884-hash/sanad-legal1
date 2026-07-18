import { db } from '../../../supabaseClient';
import { showErrorToast } from '../../../shared/lib/errorReporting';
import type { ProfileRow } from '../../../types';
import type { CountryConfig } from '../../../constants';
import type { AIMessage, LegalArticle } from './aiAssistantTypes';

// ─────────────────────────────────────────────────────────
//  useAILegalEngine — منقول حرفيًا من useAIAssistant.ts (دفعة 3):
//  SYSTEM_PROMPT + buildLegalContextBlock + retrieveLegalArticles
//  + callAI. صفر تغيير في المنطق أو الصياغة.
// ─────────────────────────────────────────────────────────
export function useAILegalEngine(profile: ProfileRow | null, activeCfg: CountryConfig, today: string, selectedModel: string) {
    const SYSTEM_PROMPT = `أنت مستشار قانوني متخصص في قوانين ${activeCfg.name}، تعمل لصالح سَنَد.
المحامي: ${profile?.full_name||'المحامي'} | التاريخ: ${today}

في كل رد اتبع هذا الهيكل:
**📋 التكييف القانوني** — طبيعة المسألة وفرعها.
**⚖️ النصوص القانونية** — نص المادة حرفياً مع رقمها واسم قانونها.
**📚 المصادر** — اسم القانون ورقمه وسنته.
**🏛️ أحكام المحاكم** — إن وجدت.
**💡 التطبيق العملي** — الرأي الواقعي والإجراء الأنسب.
**⚠️ تنبيهات إجرائية** — مواعيد التقادم والشروط الحاسمة.

قواعد: اكتب النصوص حرفياً، الرد بالعربية الفصحى، اذكر الخلاف الفقهي إن وجد.
• المحاكم المختصة: ${activeCfg.courts.join('، ')}`;

    // ══════════════════════════════════════════
    //  Legal RAG: بناء كتلة السياق القانوني من المواد المسترجعة
    // ══════════════════════════════════════════
    const buildLegalContextBlock = (articles: LegalArticle[] | null | undefined, forDocument = false) => {
        const confidenceLine = forDocument
            ? ''
            : '\nاختم ردك دائماً بسطر مستقل بصيغة: "مستوى الثقة: [مرتفع/متوسط/منخفض]" حسب مدى ارتباط هذه المواد المسترجعة بالسؤال المطروح.';

        if (!articles || articles.length === 0) {
            return `

═══ قاعدة المعرفة القانونية الداخلية ═══
لم يتم العثور على مواد قانونية ذات صلة بهذا السؤال داخل قاعدة القوانين المخزنة في النظام.
أجب بناءً على معرفتك القانونية العامة فقط، ووضّح بصراحة أن الإجابة استرشادية وتعتمد على المعرفة العامة فقط ولم يتم العثور على نصوص مطابقة في قاعدة القوانين المخزنة.${forDocument ? '' : '\nاختم ردك دائماً بسطر مستقل بصيغة: "مستوى الثقة: منخفض (لا توجد مواد مسترجعة من قاعدة المعرفة)".'}`;
        }
        const list = articles.map((a: LegalArticle) =>
            `• ${a.law_title}${a.law_number ? ` رقم ${a.law_number}` : ''}${a.law_year ? ` لسنة ${a.law_year}` : ''} — المادة ${a.article_number}:
"${(a.article_text||'').slice(0,300)}"`
        ).join('\n\n');

        return `

═══ مواد قانونية مسترجعة من قاعدة المعرفة الداخلية (اعتمد عليها كمصدر أساسي) ═══
${list}

تعليمات صارمة بشأن المواد أعلاه:
- اعتمد على هذه المواد كمصدر أساسي عند الإجابة، واذكر اسم القانون ورقم المادة بدقة عند الاستناد إلى أي منها.
- لا تخترع مطلقاً مواد قانونية أو أرقام مواد أو أحكام غير موجودة في هذه القائمة أو في معرفتك الموثوقة.
- إذا لم تكن هذه المواد كافية وحدها للإجابة الكاملة على السؤال، وضّح ذلك صراحةً واستكمل بمعرفتك العامة مع التنبيه إلى ذلك.${confidenceLine}`;
    };

    // ══════════════════════════════════════════
    //  Legal RAG: البحث النصي عن المواد القانونية (Full-Text Search)
    // ══════════════════════════════════════════
    const MIN_RANK = 0.01;
    const retrieveLegalArticles = async (query: string): Promise<LegalArticle[]> => {
        try {
            const { data: matches, error } = await db.rpc('search_law_articles', {
                query_text: query,
                match_count: 3,
            });
            if (error) {
                showErrorToast('ai_legal_query', error, 'تعذّر تنفيذ البحث القانوني. حاول تاني. لو المشكلة استمرت، تواصل مع الدعم.', 'البحث القانوني');
                return [];
            }
            if (!matches) return [];
            // ⚠️ db.rpc() بقى مكتوب-النوع (Functions permissive) فبيرجّع
            // unknown بدل any — بنعرف شكل الصفوف فعليًا (نتيجة search_law_articles)
            // فبنعمل cast صريح هنا بدل ما نسيب .filter() يفشل وقت الكتابة.
            return (matches as LegalArticle[]).filter((a) => a.rank >= MIN_RANK);
        } catch (e) {
            showErrorToast('ai_legal_query', e, 'تعذّر تنفيذ البحث القانوني. حاول تاني. لو المشكلة استمرت، تواصل مع الدعم.', 'البحث القانوني');
            return [];
        }
    };

    // ── نداء المساعد القانوني عبر الإيدج فانكشن ai-chat (المفتاح يفضل على السيرفر) ──
    const callAI = async (prompt: string | null, history: AIMessage[] | null, legalContextBlock = '') => {
        const chatMessages = history
            ? history.map((m: AIMessage) =>({role: m.role==='assistant'?'assistant':'user', content: m.text}))
            : [{role:'user', content: prompt}];
        const { data, error } = await db.functions.invoke('ai-chat', {
            body: {
                messages: chatMessages,
                system_prompt: SYSTEM_PROMPT + legalContextBlock,
                max_tokens: 1500,
                temperature: 0.3,
                model: selectedModel,
            },
        });
        if (error) throw new Error(error.message || 'تعذر الاتصال بالمساعد القانوني');
        if (data?.error) throw new Error(data.error);
        return data?.content || 'لم يتم الحصول على رد.';
    };

    return { SYSTEM_PROMPT, buildLegalContextBlock, retrieveLegalArticles, callAI };
}
