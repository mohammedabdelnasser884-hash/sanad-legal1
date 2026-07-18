// ─────────────────────────────────────────────────────────
//  aiAssistantTypes — منقول حرفيًا من useAIAssistant.ts (دفعة 1):
//  كل الـ interfaces والثوابت الساكنة (Static) اللي محتاجاها
//  المساعد القانوني. صفر منطق، صفر state، صفر تغيير في القيم.
// ─────────────────────────────────────────────────────────

// النماذج المتاحة — يجب أن تطابق ALLOWED_MODELS في edge function ai-chat
export interface GroqModel { id: string; label: string; }
export const GROQ_MODELS: GroqModel[] = [
    { id: 'llama-3.3-70b-versatile',  label: 'Llama 3.3 · 70B (موصى به)' },
    { id: 'llama-3.1-70b-versatile',  label: 'Llama 3.1 · 70B' },
    { id: 'llama-3.1-8b-instant',     label: 'Llama 3.1 · 8B (سريع)' },
    { id: 'mixtral-8x7b-32768',       label: 'Mixtral · 8x7B' },
];

// رسالة واحدة داخل موضوع محادثة (شات أو مرجع مستند مولّد)
export interface AIMessage {
    role: 'user' | 'assistant';
    text: string;
    references?: LegalArticle[];
}

// موضوع محادثة محفوظ في localStorage — قائمة رسائل مستقلة بعنوان
export interface AITopic {
    id: string;
    title: string;
    createdAt: number;
    messages: AIMessage[];
}

// شكل الصف الفعلي اللي بيرجّعه db.rpc('search_law_articles', ...) —
// الدالة بترجّع unknown (RPC مش موصوفة في database.types.ts)، وده الشكل
// الحقيقي اللي بيتقرا منه هنا (law_title/law_number/law_year جايين من
// join مع جدول laws، rank من ts_rank داخل الدالة نفسها).
export interface LegalArticle {
    law_title: string | null;
    law_number: string | null;
    law_year: number | null;
    article_number: string | null;
    article_text: string | null;
    rank: number;
}

// حقول فورم توليد المستندات القانونية — كلها نصوص حرة من المستخدم
export interface AIDocFields {
    plaintiff: string;
    plaintiffRole: string;
    defendant: string;
    defendantRole: string;
    caseNumber: string;
    court: string;
    subject: string;
    facts: string;
    claims: string;
    lawyerName: string;
}

// إعداد بطاقة نوع مستند واحد في DOC_TEMPLATES
export interface DocTemplateConfig {
    label: string;
    icon: string;
    color: string;
}

export const DOC_TEMPLATES: Record<string, DocTemplateConfig> = {
    'مذكرة_دفاع': {label:'مذكرة دفاع', icon:'⚖️', color:'blue'},
    'صحيفة_دعوى': {label:'صحيفة دعوى', icon:'📋', color:'purple'},
    'توكيل_رسمي': {label:'توكيل رسمي', icon:'📜', color:'amber'},
    'عقد_اتفاق': {label:'عقد اتفاق', icon:'🤝', color:'emerald'},
};

export const colorMap: Record<string, string> = {
    blue:'from-blue-500/20 to-blue-500/5 border-blue-500/30 text-blue-300',
    purple:'from-purple-500/20 to-purple-500/5 border-purple-500/30 text-purple-300',
    amber:'from-amber-500/20 to-amber-500/5 border-amber-500/30 text-amber-300',
    emerald:'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-300',
};
