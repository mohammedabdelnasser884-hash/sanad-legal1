// ══════════════════════════════════════════════════════
//  ملف اختبار فقط (مش جزء من الفانكشنز المنشورة) — بنية مشتركة
//  لعمل mock لعميل supabase-js (createClient) نفسه، بعكس
//  edgeTestUtils.ts اللي بيعمل mock لـ fetch الخام بس.
//
//  محتاجينها للفانكشنز التلاتة اللي بتستورد supabase-js فعليًا
//  (embed-batch، process-law-extract، session-alerts) بدل ما
//  تعمل fetch خام زي باقي الفانكشنز.
//
//  ⚠️ الأسلوب الفعلي المؤكّد بالتشغيل (16 يوليو 2026): جرّبنا الأول
//  vi.mock('npm:@supabase/supabase-js@2', factory) من غير أي alias،
//  وفشل فعليًا وقت التشغيل — الخطأ مش من vi.mock نفسه، لكن من
//  Vite's import-analysis plugin اللي بيحاول يحل (resolve) أي
//  import specifier وقت الـ transform قبل ما يوصل لمرحلة تسجيل
//  الـ mock أصلًا، ومسار زي 'npm:...' أو 'https://esm.sh/...' مش
//  حاجة Vite بيعرف يحلها بالـ resolvers العادية بتاعته.
//
//  الحل الصحيح: alias في vitest.config.ts يوجّه المسارين دول
//  ('npm:@supabase/supabase-js@2' و 'https://esm.sh/@supabase/supabase-js@2')
//  للباكدج الحقيقية '@supabase/supabase-js' (موجودة فعلًا في
//  package.json dependencies)، وبعدين في كل ملف تست:
//
//    vi.mock('@supabase/supabase-js', () => ({
//      createClient: () => mock.client,
//    }));
//
//  (الاسم في vi.mock لازم يكون بعد الـ alias مش قبله.)
// ══════════════════════════════════════════════════════

export interface RecordedCall {
  table: string;
  ops: Array<{ method: string; args: unknown[] }>;
}

export interface QueryResult {
  data?: unknown;
  error?: unknown;
  count?: number;
}

type Responder = QueryResult | ((ops: RecordedCall['ops']) => QueryResult | Promise<QueryResult>);
type RpcResponder = QueryResult | ((args: unknown) => QueryResult | Promise<QueryResult>);

const CHAIN_METHODS = [
  'select', 'eq', 'neq', 'is', 'in', 'lt', 'lte', 'gt', 'gte',
  'limit', 'order', 'single', 'update', 'insert', 'delete', 'upsert',
] as const;

/**
 * بيبني mock كامل لعميل supabase-js: `.from(table)...` (سلسلة chainable
 * بترجع نفسها لحد ما تتعمل عليها await، وقتها بتاخد أول رد مجهّز في
 * طابور الجدول ده بالترتيب) + `.rpc(name, args)` + `.storage.from(bucket).download(path)`.
 *
 * كل نداء `.from(table)` بيتسجّل في `calls` (اسم الجدول + تسلسل العمليات
 * اللي اتعملت عليه: select/eq/limit/...) عشان تتأكد التست إن الفانكشن
 * فعلًا بنى الاستعلام الصح (أعمدة/شروط) مش بس إنه استلم الرد المتوقع.
 *
 * ⚠️ **مهم جدًا (اكتُشف بتشغيل فعلي 16 يوليو 2026):** لو محتاج تحط `error`
 * في أي رد (`queueTable(table, { error: ... })`)، لازم يكون **instance حقيقي
 * من `Error`** (زي `new Error('رسالة الخطأ')`)، **مش object literal** زي
 * `{ message: '...' }`. السبب: `PostgrestError` الحقيقية في supabase-js
 * بتـ`extend Error` فعليًا، فالكود المصدري بيعتمد على `e instanceof Error`
 * لاستخراج `.message`. لو استخدمت object literal عادي، `instanceof Error`
 * بترجع false والكود بيقع على `String(e)` اللي بيرجع `"[object Object]"`
 * بدل الرسالة — ده اكتشفناه بتشغيل فعلي فشل بسببه (مش باگ في الكود
 * المصدري، غلطة في بناء التست بس).
 */
export function createSupabaseMock() {
  const calls: RecordedCall[] = [];
  const tableQueues: Record<string, Responder[]> = {};
  const rpcQueues: Record<string, RpcResponder[]> = {};
  const storageQueues: Record<string, unknown[]> = {};

  function queueTable(table: string, responder: Responder) {
    if (!tableQueues[table]) tableQueues[table] = [];
    tableQueues[table].push(responder);
  }

  function queueRpc(name: string, responder: RpcResponder) {
    if (!rpcQueues[name]) rpcQueues[name] = [];
    rpcQueues[name].push(responder);
  }

  function queueStorageDownload(bucket: string, responder: unknown) {
    if (!storageQueues[bucket]) storageQueues[bucket] = [];
    storageQueues[bucket].push(responder);
  }

  function countCallsForTable(table: string): number {
    return calls.filter((c) => c.table === table).length;
  }

  function makeBuilder(table: string) {
    const ops: RecordedCall['ops'] = [];
    calls.push({ table, ops });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {};
    for (const method of CHAIN_METHODS) {
      builder[method] = (...args: unknown[]) => {
        ops.push({ method, args });
        return builder;
      };
    }
    builder.then = (resolve: (v: QueryResult) => void, reject: (e: unknown) => void) => {
      const queue = tableQueues[table];
      if (!queue || queue.length === 0) {
        return Promise.reject(
          new Error(`[supabaseClientMock] لا يوجد رد مجهّز لجدول '${table}' (النداء رقم ${countCallsForTable(table)})`),
        ).catch(reject);
      }
      const responder = queue.shift()!;
      const result = typeof responder === 'function' ? responder(ops) : responder;
      return Promise.resolve(result).then(
        (r) => resolve(r ?? { data: null, error: null }),
        reject,
      );
    };
    return builder;
  }

  const client = {
    from: (table: string) => makeBuilder(table),
    rpc: (name: string, args?: unknown) => {
      const queue = rpcQueues[name];
      if (!queue || queue.length === 0) {
        return Promise.reject(new Error(`[supabaseClientMock] لا يوجد رد مجهّز لـ rpc '${name}'`));
      }
      const responder = queue.shift()!;
      const result = typeof responder === 'function' ? responder(args) : responder;
      return Promise.resolve(result);
    },
    storage: {
      from: (bucket: string) => ({
        download: (path: string) => {
          const queue = storageQueues[bucket];
          if (!queue || queue.length === 0) {
            return Promise.reject(new Error(`[supabaseClientMock] لا يوجد رد مجهّز لتحميل '${bucket}/${path}'`));
          }
          return Promise.resolve(queue.shift());
        },
      }),
    },
  };

  return { client, calls, queueTable, queueRpc, queueStorageDownload };
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>;
