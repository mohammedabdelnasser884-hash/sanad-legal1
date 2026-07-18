import { db } from '../supabaseClient';
import type { Database } from '../database.types';
import { showOfflineBanner, hideOfflineBanner, showSyncIndicator, hideSyncIndicator, toast } from '../shared/lib/notifications';

// ══════════════════════════════════════════════════════════
//  Offline Queue (IndexedDB) + __dbWrite — منقول من main.tsx
//  (اتفصل بتاريخ 15 يوليو 2026 كجزء من خطة تخفيف main.tsx)
// ══════════════════════════════════════════════════════════

// ⚠️ الجداول الحقيقية اللي ممكن توصل لـ __dbWrite — اتأكدت من كل نداء فعلي
// في المشروع كله (useCaseActions.ts، useClientActions.ts): القيم الوحيدة
// اللي بتتبعت فعليًا كـ `table` هي التلاتة دول. مستخدمة في توقيع __dbWrite
// نفسه، وكمان في OfflineQueueItem.table تحت (لأن __offlineEnqueue بيتنادى
// حصريًا من جوه __dbWrite بنفس القيم دي بالظبط — مفيش أي نداء تاني ليها في
// المشروع كله).
export type DbWriteTable = 'clients' | 'cases' | 'case_sessions';

// ⚠️ قيد معروف في supabase-js + TypeScript: تسلسل .insert()/.update()/.delete()
// ثم .select()/.eq() على db.from(table) لما `table` يكون Generic (T extends
// DbWriteTable) بدل literal واحد ثابت بيخلي المكتبة تحاول تحل النوع على
// مستوى الـ schema كله (كل الجداول) بدل التلات جداول المسموحة بس، فبترجع
// أخطاء ضخمة (RejectExcessProperties/keyof) وقت البناء — نفس المشكلة ظهرت
// في useAdminBackup.ts مع دالة dynFrom لكن على نطاق أوسع هنا بسبب السلسلة
// الأطول (insert().select().single()، update().eq().select().single()).
// الحل: نأكد لـ TypeScript إن الجدول واحد من التلات المعروفين فعلاً (بنستخدم
// 'cases' كممثل — عنده نفس أعمدة id/updated_at المشتركة بين التلات جداول)
// وقت بناء الـ query builder بس. التحقق الحقيقي من اسم الجدول وقت الكتابة
// لسه قائم عن طريق `table: DbWriteTable` في توقيع الدالة الخارجية — الكاست
// هنا بيأثر بس على شكل الـ builder وقت الـ type-check، مش على اسم الجدول
// أو البيانات الفعلية وقت التشغيل.
function dbFrom(table: DbWriteTable) {
  return db.from(table as 'cases');
}

// ⚠️ شكل عنصر واحد في طابور الأوفلاين (IndexedDB) — نفس الحقول اللي
// بيتضافوا فعليًا في __offlineEnqueue (timestamp/status) + الحقول اللي
// بيتبعتوا من __dbWrite (type/table/data/id/knownUpdatedAt). `data` لسه
// Record<string, unknown> عام عن قصد: العملية ممكن تكون لأي جدول من
// جداول التطبيق (نفس التفاوت الموثّق في useAdminBackup.ts — مش سهو).
//
// 🔎 اكتشاف (موثّق سابقًا، اتصلح بعد موافقة صريحة من المستخدم): `id` هنا
// فعليًا بيتخزن فيه قيمتين مختلفتين حسب نوع العملية — مش تسرّب لنوع غلط،
// ده تصميم مقصود من الأول: IndexedDB بيستخدم أي خاصية بنفس اسم الـ
// keyPath ('id') كـ *مفتاح السجل نفسه* لو كانت معرّفة، وبيولّد رقم تلقائي
// بس لو كانت `undefined`. يعني: عمليات INSERT بتتبعت من غير `id` (بيتولّد
// رقم تلقائي `number`)، وعمليات UPDATE/DELETE بتتبعت بالـ id الحقيقي بتاع
// السجل (`string`، من __dbWrite). النوع بقى `number | string` عشان يعكس
// الحالتين الحقيقيتين دول — صفر تغيير سلوك، تصحيح دقة نوع بس.
//
// 🔎 اكتشاف تاني (اتصلح بعد موافقة صريحة من المستخدم): `table` كانت معرّفة
// `string` عام. بحثت في كل المشروع عن كل نداء فعلي بيضيف عنصر للطابور —
// المصدر الوحيد هو __dbWrite (تحت)، اللي بينادي __offlineEnqueue بنفس قيمة
// `table: T` بتاعته (T extends DbWriteTable) وقت الفشل أونلاين. مفيش أي
// نداء تاني لـ __offlineEnqueue في المشروع كله. يعني القيمة الفعلية
// المخزّنة في IndexedDB دايمًا واحدة من التلاتة دول بالظبط — نفس النوع
// المُعرَّف فوق (DbWriteTable)، فاستخدمته هنا بدل `string` العام.
export interface OfflineQueueItem {
  id: number | string;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: DbWriteTable;
  data?: Record<string, unknown>;
  knownUpdatedAt?: string | null;
  timestamp: number;
  status: string;
}

declare global {
  interface Window {
    __offlineEnqueue: (op: object) => Promise<boolean>;
    __getOfflineQueue: () => Promise<OfflineQueueItem[]>;
    __getOfflineQueueCount: () => Promise<number>;
    __deleteOfflineItem: (id: number | string) => Promise<void>;
    __syncOfflineQueue: () => Promise<void>;
    // ⚠️ `table` بقى Generic (T extends DbWriteTable) بدل `string` — بيتحقق
    // وقت الكتابة إن اسم الجدول حقيقي وموجود في database.types.ts (كان ده
    // أصل الـ `any` القديم، زي نفس نمط dynFrom في useAdminBackup.ts).
    // `data` فضلت Record<string, unknown> عن قصد (مش Insert/Update الحقيقي
    // بتاع الجدول): نداء واحد فعلي (حفظ قضية أوفلاين مع جلستها الأولى في
    // useCaseActions.ts) بيبعت حقل sentinel مؤقت (`_offlineCaseTitle`) مش
    // عمود DB حقيقي — بيتحذف قبل الإدراج الفعلي وقت المزامنة. ربطها بنوع
    // صارم كان هيرفض الحقل ده غلط رغم إنه سلوك مقصود وموجود من الأول.
    // `data` المرجعة بقت `Partial<Row>` (مش `Row` الكامل) لأن مسار
    // UPDATE بيرجّع بس `updated_at` من `.select('updated_at')`، مش الصف
    // كامل — Partial بتغطي الحالتين (INSERT بيرجّع صف كامل، UPDATE بيرجّع
    // عمود واحد بس) من غير ما تدّعي شكل مش حقيقي.
    __dbWrite: <T extends DbWriteTable>(op: {
      type: 'INSERT' | 'UPDATE' | 'DELETE';
      table: T;
      data?: Record<string, unknown>;
      id?: string;
      knownUpdatedAt?: string | null;
      returning?: boolean;
    }) => Promise<{
      error: unknown;
      offline?: boolean;
      queued?: boolean;
      data?: Partial<Database['public']['Tables'][T]['Row']> | null;
      conflict?: boolean;
    }>;
  }
}

// ══════════════════════════════════════════════════════════
//  IndexedDB — Offline Queue
// ══════════════════════════════════════════════════════════
const DB_NAME    = 'sanad-offline';
const DB_VERSION = 1;
const STORE_NAME = 'queue';

function openOfflineDB(): Promise<IDBDatabase> {
    return new Promise((resolve: (db: IDBDatabase) => void, reject: (err: unknown) => void) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
        req.onsuccess  = () => resolve(req.result);
        req.onerror    = () => reject(req.error);
    });
}

window.__offlineEnqueue = async (operation: object): Promise<boolean> => {
    try {
        const db    = await openOfflineDB();
        const tx    = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.add({ ...operation, timestamp: Date.now(), status: 'pending' });
        await new Promise<void>((res: () => void, rej: (err: unknown) => void) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    } catch (err) {
        // BUG FIX: ده كان بيفشل بصمت من قبل — والـ caller كان يفتكر إن الحفظ
        // المحلي تم بنجاح وهو فعليًا لسه متضايع. دلوقتي بنرجّع false عشان
        // __dbWrite يقدر يبلّغ المستخدم إن الحفظ فشل فعلاً.
        console.error('[Offline] Failed to enqueue — data NOT saved locally:', err);
        return false;
    }
    // طبقة إضافية: نسجّل Background Sync لو المتصفح بيدعمها (Chrome/Android).
    // ده تحسين فوقي بس — مش الاعتماد الأساسي، لأن Safari/iOS مابيدعمهاش أصلاً.
    // الاعتماد الأساسي هو مستمع 'online' المباشر اللي تحت في نفس الملف.
    try {
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            const reg = await navigator.serviceWorker.ready;
            // ⚠️ Background Sync (SyncManager) لسه مش جزء من TS lib.dom القياسية
            // (API تجريبي، Chrome/Android بس) — الكاست هنا محصور في الخاصية
            // دي بس (مش الـ registration كله زي `as any` القديمة).
            await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }).sync.register('sync-offline-queue');
        }
    } catch (err) {
        // طبيعي إن ده يفشل على متصفحات مش داعمة — متجاهلين
    }
    return true;
};

window.__getOfflineQueue = async () => {
    try {
        const db    = await openOfflineDB();
        const tx    = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req   = store.getAll();
        return new Promise<OfflineQueueItem[]>((res: (items: OfflineQueueItem[]) => void, rej: (err: unknown) => void) => {
            req.onsuccess = () => res(req.result || []);
            req.onerror   = () => rej(req.error);
        });
    } catch { return []; }
};

window.__getOfflineQueueCount = async () => {
    const q = await window.__getOfflineQueue();
    return q.length;
};

window.__deleteOfflineItem = async (id: number | string) => {
    try {
        const db    = await openOfflineDB();
        const tx    = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        return new Promise<void>((res: () => void, rej: (err: unknown) => void) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    } catch (err) {
        console.error('[Offline] Failed to delete item:', err);
    }
};

// ══════════════════════════════════════════════════════════
//  Offline Sync Queue — DB Write Wrapper
// ══════════════════════════════════════════════════════════
let __syncQueueRunning = false;
window.__syncOfflineQueue = async function() {
    // BUG FIX: القفل ده كان موجود فقط في __runOfflineSyncIfNeeded، لكن
    // Service Worker بينده على __syncOfflineQueue مباشرة عند Background Sync
    // (في serviceWorkerBootstrap.ts)، فكان ممكن العمليتين تتنفذوا في نفس
    // الوقت وتعمل INSERT مكرر لنفس القضية. دلوقتي القفل بقى جوه الدالة
    // نفسها فيغطي كل المصادر.
    if (__syncQueueRunning) return;
    __syncQueueRunning = true;
    try {
    const queue = await window.__getOfflineQueue?.() || [];
    if (queue.length === 0) return;
    showSyncIndicator(`جاري مزامنة ${queue.length} عملية...`);
    let successCount = 0, failCount = 0;
    for (const op of queue) {
        try {
            let error = null;
            let conflict = false;

            if (op.type === 'INSERT') {
                // البيانات هنا Record<string, unknown> عام (زي useAdminBackup.ts) —
                // كاست ضيق مربوط باسم الجدول الحقيقي المتحقق منه فعلاً (op.table
                // بقى DbWriteTable مش string)، بنفس نمط __dbWrite تحت بالظبط.
                // BUG-20 FIX: جلسة مرتبطة بقضية أوفلاين — نجيب الـ id الحقيقي أولاً
                if (op.table === 'case_sessions' && op.data?._offlineCaseTitle) {
                    const { data: caseRow } = await db
                        .from('cases')
                        .select('id')
                        .eq('title', op.data._offlineCaseTitle as string)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    if (!caseRow) {
                        // القضية لسه مش اتزامنت — نفضل في الـ queue ونكمل
                        failCount++;
                        continue;
                    }
                    op.data = { ...op.data, case_id: caseRow.id };
                    delete op.data._offlineCaseTitle;
                }
                ({ error } = await db.from(op.table).insert([op.data as Database['public']['Tables'][typeof op.table]['Insert']]));
            } else if (op.type === 'UPDATE') {
                // op.id هنا هي الـ id الحقيقي (string) بتاع السجل — مش الرقم
                // التلقائي بتاع IndexedDB (ده بس لعمليات INSERT، زي ما موثّق
                // فوق تعريف OfflineQueueItem). كاست `as string` بنفس منطق
                // `id as string` في __dbWrite تحت.
                // Optimistic Locking — نتحقق إن السجل مش اتعدل من حد تاني
                if (op.knownUpdatedAt) {
                    const { data: current, error: fetchErr } = await db
                        .from(op.table).select('updated_at').eq('id', op.id as string).single();

                    if (!fetchErr && current && current.updated_at) {
                        const serverTime = new Date(current.updated_at).getTime();
                        const clientTime = new Date(op.knownUpdatedAt).getTime();
                        if (serverTime > clientTime) {
                            // تعارض — مش هنكتب فوق تعديل حد تاني
                            conflict = true;
                        }
                    }
                }
                if (!conflict) {
                    ({ error } = await db.from(op.table).update(op.data as Database['public']['Tables'][typeof op.table]['Update']).eq('id', op.id as string));
                }
            } else if (op.type === 'DELETE') {
                ({ error } = await db.from(op.table).delete().eq('id', op.id as string));
            }

            if (conflict) {
                // نحذف العملية من الـ Queue ونعدّ كـ conflict
                await window.__deleteOfflineItem(op.id);
                failCount++;
            } else if (!error) {
                await window.__deleteOfflineItem(op.id);
                successCount++;
            } else {
                // BUG FIX: كان بيتجاهل تفاصيل الخطأ تمامًا، فمستحيل تعرف ليه
                // عملية معينة فاضلة عالقة في الـ queue ومش بتتزامن أبدًا
                // (مثلاً قيمة مفقودة مطلوبة، أو RLS بترفض الإدراج).
                console.error('[Offline Sync] فشلت عملية', op.type, op.table, '—', error?.message || error);
                failCount++;
            }
        } catch (err) {
            console.error('[Offline Sync] استثناء غير متوقع في عملية', op.type, op.table, '—', err);
            failCount++;
        }
    }
    if (successCount > 0 && failCount === 0) {
        hideSyncIndicator(`✅ تمت المزامنة — ${successCount} عملية`);
        toast(`✅ تمت المزامنة (${successCount} عملية)`);
    } else if (failCount > 0) {
        hideSyncIndicator(`⚠️ تمت جزئياً (${successCount}/${successCount + failCount})`);
    } else { hideSyncIndicator(); }
    window.dispatchEvent(new CustomEvent('offline-sync-complete'));
    } finally {
        __syncQueueRunning = false;
    }
};

// ══════════════════════════════════════════════════════════
//  المزامنة الفعلية — الاعتماد الأساسي (يشتغل في كل المتصفحات)
//  Background Sync فوق (لو الجهاز بيدعمها) ميغطّيش Safari/iOS أبدًا،
//  فمحتاجين آلية تشتغل أونلاين مباشرة كل وقت ما التطبيق مفتوح.
// ══════════════════════════════════════════════════════════
let __syncInFlight = false;
async function __runOfflineSyncIfNeeded() {
    if (__syncInFlight) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    try {
        const count = await window.__getOfflineQueueCount?.() || 0;
        if (count === 0) return;
        __syncInFlight = true;
        await window.__syncOfflineQueue?.();
    } catch (err) {
        console.error('[Offline] Sync attempt failed:', err);
    } finally {
        __syncInFlight = false;
    }
}

// 1) أول ما ترجع أونلاين — جرّب تزامن فورًا
window.addEventListener('online', () => { __runOfflineSyncIfNeeded(); });

// 2) أول ما يفتح التطبيق (لو كانت فيه عمليات معلّقة من قبل ما يتقفل المتصفح) وإنت أصلاً أونلاين
window.addEventListener('load', () => { __runOfflineSyncIfNeeded(); });

// 3) شبكة أمان إضافية — فحص دوري كل دقيقة لو فيه عمليات معلّقة ومتصل بالنت
//    (يغطي حالات نادرة زي رجوع النت من غير ما يطلق حدث 'online' بشكل موثوق)
setInterval(() => { __runOfflineSyncIfNeeded(); }, 60000);

window.__dbWrite = async function <T extends DbWriteTable>({ type, table, data, id, knownUpdatedAt, returning }: {
    type: 'INSERT' | 'UPDATE' | 'DELETE';
    table: T;
    data?: Record<string, unknown>;
    id?: string;
    knownUpdatedAt?: string | null;
    returning?: boolean;
}) {
    if (navigator.onLine) {
        try {
            let error = null;
            let insertedRow: Partial<Database['public']['Tables'][T]['Row']> | null = null;
            let updatedRow: Partial<Database['public']['Tables'][T]['Row']> | null = null;
            if (type === 'INSERT') {
                if (returning) {
                    // بنرجّع الصف المُدرج فعليًا (بدل ما نسيب الكولر يخمّن الـ id
                    // بإعادة استعلام بالعنوان/التاريخ — ده كان بيسبب ربط غلط
                    // في حالات نادرة زي إدخال قضيتين بنفس العنوان في نفس اللحظة)
                    const res = await dbFrom(table).insert([data as Database['public']['Tables']['cases']['Insert']]).select().single();
                    error = res.error;
                    insertedRow = res.data as unknown as Partial<Database['public']['Tables'][T]['Row']> | null;
                } else {
                    ({ error } = await dbFrom(table).insert([data as Database['public']['Tables']['cases']['Insert']]));
                }
            } else if (type === 'UPDATE') {
                // Optimistic Locking — online
                if (knownUpdatedAt) {
                    const { data: current, error: fetchErr } = await dbFrom(table).select('updated_at').eq('id', id as string).single();

                    if (!fetchErr && current && current.updated_at) {
                        const serverTime = new Date(current.updated_at).getTime();
                        const clientTime = new Date(knownUpdatedAt).getTime();
                        if (serverTime > clientTime) {
                            return { error: { message: 'conflict' }, conflict: true, offline: false };
                        }
                    }
                }
                // FIX: بنرجّع updated_at الجديد بعد التحديث (بدل ما نسيب الكولر
                // فاكر updated_at القديم اللي جابها هو). من غير ده، أي تعديل
                // تاني على نفس السجل بعد التعديل الأول مباشرة كان هيتكشف غلط
                // كـ"تعارض" مع نفسه (لأن آخر updated_at محفوظة عنده محليًا
                // هتفضل أقدم من اللي فعليًا في السيرفر بعد أول تعديل ناجح).
                const res = await dbFrom(table).update(data as Database['public']['Tables']['cases']['Update']).eq('id', id as string).select('updated_at').single();
                error = res.error;
                updatedRow = res.data as unknown as Partial<Database['public']['Tables'][T]['Row']> | null;
            } else if (type === 'DELETE') {
                ({ error } = await dbFrom(table).delete().eq('id', id as string));
            }
            return { error, offline: false, data: insertedRow || updatedRow };
        } catch {
            // الشبكة بتقول أونلاين بس الطلب فشل فعليًا — نحاول نحفظ محليًا
            const saved = await window.__offlineEnqueue({ type, table, data, id, knownUpdatedAt });
            if (!saved) {
                // BUG FIX: قبل كان بيرجع queued:true دايمًا حتى لو فشل الحفظ في
                // IndexedDB، فالمستخدم يشوف "محفوظة محلياً" والبيانات ضايعة فعليًا.
                return { error: { message: 'فشل الاتصال بالسيرفر، وفشل الحفظ المحلي أيضاً — يرجى المحاولة مرة أخرى' }, offline: true, queued: false };
            }
            return { error: null, offline: true, queued: true };
        }
    } else {
        // نحفظ knownUpdatedAt في الـ Queue عشان نستخدمه وقت المزامنة
        const saved = await window.__offlineEnqueue({ type, table, data, id, knownUpdatedAt });
        if (!saved) {
            // BUG FIX: نفس المشكلة — هنا كانت أوضح، لأن المستخدم فعليًا offline
            // وملوش طريقة تانية يحفظ بيها، فلو IndexedDB فشلت (مساحة تخزين ممتلئة،
            // متصفح Private/Incognito، أو خطأ غير متوقع) كانت البيانات تتفقد بصمت
            // والمستخدم يفتكر إنها "محفوظة محلياً" زي ما الرسالة كانت بتقوله.
            return { error: { message: 'فشل الحفظ محلياً — تأكد من توفر مساحة تخزين كافية في المتصفح، أو إنك مش في وضع التصفح الخفي (Private/Incognito)' }, offline: true, queued: false };
        }
        const count = await window.__getOfflineQueueCount?.() || 0;
        showOfflineBanner(count);
        return { error: null, offline: true, queued: true };
    }
};

// ══════════════════════════════════════════════════════════
//  إشعارات حالة الشبكة (أونلاين/أوفلاين) — بانر + مؤشر مزامنة
// ══════════════════════════════════════════════════════════
window.addEventListener('network-offline', async () => {
    const count = await window.__getOfflineQueueCount?.() || 0;
    showOfflineBanner(count);
});
window.addEventListener('network-online', () => {
    hideOfflineBanner();
    showSyncIndicator('جاري المزامنة...');
});
(async () => {
    if (!navigator.onLine) {
        const count = await window.__getOfflineQueueCount?.() || 0;
        showOfflineBanner(count);
    }
})();
