/**
 * systemHealth — نظام متابعة صحة الخدمات
 * ─────────────────────────────────────────
 * يسجّل نجاح أو فشل أي عملية في التطبيق (جلب بيانات، حفظ، تيليجرام، ...)
 * ويخزّنها في localStorage، وينشر إيفنت فوري (HEALTH_EVENT) لتحديث
 * بانر الأخطاء في الصفحة الرئيسية لحظة حدوث المشكلة من أي مكان في الكود،
 * بدون داعي لأي شاشة تكون مفتوحة وقتها.
 */

// ─── مفاتيح معروفة (لها اسم ورسالة جاهزة بالعربي) ───────────────────────────
// أي مفتاح تاني غير الموجودين هنا لسه يعمل بشكل طبيعي، وهياخد اسم/رسالة
// عامة افتراضية إلا لو تم تمرير label/message مخصصة عند التسجيل.
export type KnownServiceKey =
  | 'telegram'
  | 'db_cases'
  | 'db_cases_search'
  | 'db_clients'
  | 'db_sessions'
  | 'db_reminders'
  | 'db_dashboard'
  | 'db_fees'
  | 'session_scheduler'
  | 'office_login'
  | 'app_general';

// أي مفتاح: من القائمة المعروفة فوق، أو أي نص مخصص من أي شاشة في التطبيق
export type ServiceKey = KnownServiceKey | string;

export interface ServiceStatus {
  key: ServiceKey;
  label: string;           // اسم الخدمة بالعربي
  status: 'ok' | 'error' | 'unknown';
  lastSuccess: string | null;   // ISO timestamp
  lastError: string | null;     // ISO timestamp
  errorMsg: string | null;      // رسالة الخطأ بلغة المستخدم
  // ⚡ [جديد] نص الخطأ التقني الخام من Supabase/Postgres، لو موجود —
  // بيتعرض كتفصيلة صغيرة تحت الرسالة الودودة في بانر الداشبورد، عشان
  // لو المشكلة اتكررت نقدر نشخّصها من غير ما نحتاج نوصل للوجز/الترمينال
  // (الشغل كله من الموبايل من غير أي وصول لطرفية).
  rawError: string | null;
}

// ─── إيفنت التحديث الفوري ────────────────────────────────────────────────
// أي recordError/recordSuccess في أي ملف في التطبيق ينشر هذا الإيفنت،
// والصفحة الرئيسية مستمعة له فتحدّث البانر فورًا.
export const HEALTH_EVENT = 'sanad-health-changed';

function broadcastHealthChange() {
  try { window.dispatchEvent(new Event(HEALTH_EVENT)); } catch { /* ignore */ }
}

// ─── أسماء الخدمات المعروفة بالعربي ──────────────────────────────────────

const SERVICE_LABELS: Record<KnownServiceKey, string> = {
  telegram:          'إشعارات تيليجرام',
  db_cases:          'جلب القضايا',
  db_cases_search:   'البحث في القضايا',
  db_clients:        'جلب الموكلين',
  db_sessions:       'جلب الجلسات',
  db_reminders:      'جلب التذكيرات',
  db_dashboard:      'تحميل الرئيسية',
  db_fees:           'جلب الأتعاب',
  session_scheduler: 'جدولة الإشعارات التلقائية',
  office_login:      'تسجيل الدخول',
  app_general:       'النظام',
};

function isKnownKey(key: ServiceKey): key is KnownServiceKey {
  return Object.prototype.hasOwnProperty.call(SERVICE_LABELS, key);
}

function resolveLabel(key: ServiceKey, fallbackLabel?: string): string {
  if (isKnownKey(key)) return SERVICE_LABELS[key];
  return fallbackLabel || 'عملية في النظام';
}

// ─── رسائل الخطأ بلغة المستخدم (واضحة وبسيطة، من غير تفاصيل تقنية) ───────

const KNOWN_ERROR_MSGS: Record<KnownServiceKey, string> = {
  telegram:          'تعذّر إرسال إشعار تيليجرام. تحقق من إعدادات البوت أو الاتصال بالإنترنت.',
  db_cases:          'تعذّر تحميل قائمة القضايا. تحقق من الاتصال بالإنترنت.',
  db_cases_search:   'تعذّر البحث في القضايا. تحقق من الاتصال بالإنترنت.',
  db_clients:        'تعذّر تحميل قائمة الموكلين. تحقق من الاتصال بالإنترنت.',
  db_sessions:       'تعذّر تحميل الجلسات. تحقق من الاتصال بالإنترنت.',
  db_reminders:      'تعذّر تحميل التذكيرات. تحقق من الاتصال بالإنترنت.',
  db_dashboard:      'تعذّر تحميل بيانات الرئيسية. تحقق من الاتصال بالإنترنت.',
  db_fees:           'تعذّر تحميل بيانات الأتعاب. تحقق من الاتصال بالإنترنت.',
  session_scheduler: 'توقف نظام الإشعارات التلقائية. أعد فتح التطبيق.',
  office_login:      'تعذّر تسجيل الدخول. تحقق من اتصال الإنترنت وحاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.',
  app_general:       'حصلت مشكلة في النظام. تحقق من اتصال الإنترنت أو حاول تاني.',
};

/** رسالة بسيطة بالعربي يفهمها صاحب المكتب، حتى لو المفتاح غير معروف */
export function friendlyError(key: ServiceKey, rawError?: string, fallbackMsg?: string): string {
  if (isKnownKey(key)) return KNOWN_ERROR_MSGS[key];
  return fallbackMsg || 'حصلت مشكلة في تنفيذ العملية دي. تحقق من اتصال الإنترنت أو حاول تاني.';
}

// ─── Storage ──────────────────────────────────────────────────────────────

const LS_KEY = 'sanad_health'; // تخزين محلي لحالة الخدمات

function loadAll(): Record<string, ServiceStatus> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }

  // القيم الافتراضية للمفاتيح المعروفة بس — أي مفتاح مخصص بيتسجل أول ما يُستخدم
  const defaults = {} as Record<string, ServiceStatus>;
  (Object.keys(SERVICE_LABELS) as KnownServiceKey[]).forEach((key: KnownServiceKey) => {
    defaults[key] = {
      key,
      label: SERVICE_LABELS[key],
      status: 'unknown',
      lastSuccess: null,
      lastError: null,
      errorMsg: null,
      rawError: null,
    };
  });
  return defaults;
}

function saveAll(data: Record<string, ServiceStatus>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * سجّل نجاح عملية.
 * key: أي مفتاح معروف (db_cases, telegram...) أو نص مخصص لعملية جديدة.
 */
export function recordSuccess(key: ServiceKey, label?: string) {
  const all = loadAll();
  all[key] = {
    ...all[key],
    key,
    label: resolveLabel(key, label || all[key]?.label),
    status: 'ok',
    lastSuccess: new Date().toISOString(),
    errorMsg: null,
    rawError: null,
  };
  saveAll(all);
  broadcastHealthChange();
}

/**
 * سجّل فشل عملية — هيظهر فورًا كبانر في الصفحة الرئيسية.
 * key: أي مفتاح معروف، أو نص مخصص يوصف العملية (مثلاً 'fees_save', 'reminder_delete').
 * rawError: رسالة الخطأ التقنية (تُستخدم فقط لو مفيش رسالة جاهزة للمفتاح).
 * label/message: لمفتاح مخصص، ممكن تمرر اسم وعرض بالعربي مفهومين لغير المبرمج.
 */
export function recordError(key: ServiceKey, rawError?: string, opts?: { label?: string; message?: string }) {
  const all = loadAll();
  all[key] = {
    ...all[key],
    key,
    label: resolveLabel(key, opts?.label || all[key]?.label),
    status: 'error',
    lastError: new Date().toISOString(),
    errorMsg: friendlyError(key, rawError, opts?.message),
    rawError: rawError || null,
  };
  saveAll(all);
  broadcastHealthChange();
}

/** جيب كل الخدمات اللي فيها خطأ */
export function getFailedServices(): ServiceStatus[] {
  const all = loadAll();
  return (Object.values(all) as ServiceStatus[]).filter((s: ServiceStatus) => s.status === 'error');
}

/** جيب حالة خدمة معينة */
export function getServiceStatus(key: ServiceKey): ServiceStatus {
  return loadAll()[key];
}

/** امسح خطأ خدمة (بعد ما المستخدم يعمل retry ناجح) */
export function clearError(key: ServiceKey) {
  recordSuccess(key);
}

/**
 * شبكة أمان عامة: تمسك أي خطأ JS أو Promise مرفوض من غير catch في أي حتة
 * في التطبيق، وتسجّله كتنبيه عام في الصفحة الرئيسية. تتنادى مرة واحدة بس
 * عند بداية تشغيل التطبيق (main.tsx).
 */
// خاصية داخلية بتمنع تركيب الـ watcher أكتر من مرة — مش موجودة في نوع
// Window القياسي، فمحتاجة توسيع محلي هنا (نفس نمط __pwaInstallPrompt في main.tsx).
declare global {
  interface Window {
    __healthWatcherInstalled?: boolean;
  }
}

export function installGlobalErrorWatcher() {
  if (typeof window === 'undefined') return;
  if (window.__healthWatcherInstalled) return;
  window.__healthWatcherInstalled = true;

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason: unknown = event?.reason;
    // ⚠️ reason ممكن يكون أي حاجة (Error, نص، أو كائن مخصص) — كاست بسيط
    // زي نفس أسلوب (e as Error)?.message المستخدم في useTelegramAlerts.ts.
    const msg = (reason as { message?: string })?.message || (typeof reason === 'string' ? reason : 'خطأ غير متوقع');
    // نحاول نستنتج العملية من رسالة الخطأ
    const label = msg.includes('fetch') || msg.includes('network') ? 'الاتصال بالإنترنت'
      : msg.includes('cases') ? 'جلب القضايا'
      : msg.includes('clients') ? 'جلب الموكلين'
      : msg.includes('sessions') ? 'جلب الجلسات'
      : msg.includes('fees') ? 'جلب الأتعاب'
      : msg.includes('reminders') ? 'جلب التذكيرات'
      : 'النظام';
    const message = msg.includes('fetch') || msg.includes('network')
      ? 'تعذّر الاتصال بقاعدة البيانات. تحقق من الإنترنت وأعد المحاولة.'
      : `حصل خطأ غير متوقع في ${label}. أعد تحميل التطبيق أو تواصل مع الدعم.`;
    recordError('app_general', msg, { label, message });
  });

  window.addEventListener('error', (event: ErrorEvent) => {
    // نتجاهل أخطاء تحميل الموارد (صور/سكريبتات) عشان مايبقاش فيه ضوضاء
    if (event?.target && event.target !== window) return;
    recordError('app_general', event?.message);
  });
}

/** فورمات التوقيت بالعربي */
export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1)   return 'منذ لحظات';
    if (diffMins < 60)  return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    if (diffDays === 1) return 'منذ يوم';
    return `منذ ${diffDays} يوم`;
  } catch { return '—'; }
}
