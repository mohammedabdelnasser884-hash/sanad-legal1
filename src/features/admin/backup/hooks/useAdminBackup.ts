import React, { useState, useCallback } from 'react';
import { toast } from '../../../../shared/lib/notifications';
import { logActivity } from '../../../../shared/lib/dataAccess';
import { db } from '../../../../supabaseClient';
import { formatArDate } from '../../../../shared/ui/arabicLocale';
import type { ProfileRow, BackupRow } from '../../../../types';
import type { Database } from '../../../../database.types';

// شكل الـ JSON المخزّن فعليًا في عمود backups.data (النوع الحقيقي في قاعدة
// البيانات هو Json عام، فالواجهة دي بتوصف الشكل الفعلي اللي بيتبني بيه
// جوه handleCreateBackup وبيتقرا بيه جوه handleRestoreBackup، من غير أي تغيير).
export interface BackupSnapshot {
  version: string;
  created_at: string;
  tables: Record<string, unknown[]>;
}

// ── حجم الصفحة لجلب كل صفوف الجدول عند التصدير (تجنب حد الـ 1000 صف الافتراضي في Supabase) ──
const FETCH_PAGE_SIZE = 1000;
// ── حجم الدفعة عند إعادة الإدخال وقت الاستعادة (تجنب حمولة request ضخمة دفعة واحدة) ──
const INSERT_CHUNK_SIZE = 500;

// ── جدول الجداول اللي بيغطيها الباك أب، بترتيب الإدخال (الآباء الأول) ──
const BACKUP_TABLES: BackupTableName[] = ['clients','cases','case_sessions','case_fees','fee_payments','case_documents','reminders','client_portal_pins','activity_log'];

// ── نفس الجداول لكن بترتيب الحذف (الأبناء الأول، عشان القيود الأجنبية) ──
// ⚠️ profiles و activity_log مُستثناتان عمداً من الحذف (upsert فقط) — انظر التعليق في handleRestoreBackup
const RESTORE_DELETE_ORDER: BackupTableName[] = ['fee_payments','case_fees','case_documents','case_sessions','reminders','client_portal_pins','cases','clients'];
const RESTORE_INSERT_ORDER: BackupTableName[] = ['clients','cases','case_sessions','case_fees','fee_payments','case_documents','reminders','client_portal_pins'];

// ── الجداول الحقيقية الوحيدة اللي البك أب/الاستعادة بيلفوا عليها فعليًا ──
// (نفس محتوى BACKUP_TABLES/RESTORE_*_ORDER + 'profiles'/'activity_log'
// المُضافين لاحقًا في handleCreateBackup/handleRestoreBackup) — union حقيقي
// من أسماء الجداول، بدل string عام.
type BackupTableName =
  | 'clients' | 'cases' | 'case_sessions' | 'case_fees' | 'fee_payments'
  | 'case_documents' | 'reminders' | 'client_portal_pins' | 'activity_log'
  | 'profiles';

// اسم الجدول بقى Generic مقيّد بـ BackupTableName — supabase-js بيتحقق منه
// وقت الكتابة زي أي `.from()` تاني (مفيش `as any` على اختيار الجدول خالص).
// الجزء اللي لسه محتاج كاست هو شكل الصفوف نفسها (rows: unknown[])، مش اسم
// الجدول: صفوف الـ backup راجعة من JSON مخزّن (BackupSnapshot.tables)، شكلها
// الفعلي مش معروف وقت الكتابة (ملف قديم يمكن يكون بشكل مختلف شوية عن
// database.types.ts الحالي)، فده تفاوت حقيقي مش كسل — بنسيبه `unknown[]`
// في fetchAllRows واستدعاءات insert/upsert تحت، ومسؤولية الشكل الصحيح
// بتتحمّلها قاعدة البيانات نفسها (RLS + قيود الأعمدة) وقت التنفيذ.
function dynFrom<T extends BackupTableName>(table: T) {
  return db.from(table);
}

// ⚠️ دالة عادية (مش method reference) بس عشان نقدر ناخد ReturnType بتاعها —
// `typeof db.from<'clients'>` مش صالح لأن db.from method عام (generic method)
// مش دالة مستقلة، فـ TypeScript مش بيقدر يستنتج الـ generic instantiation من
// مجرد الإشارة ليها من غير نداء. الدالة دي بس عشان النوع، مش بتتنادى فعليًا.
function _typedClientsFrom() {
  return db.from('clients');
}

// ── جلب كل صفوف جدول بالكامل عبر صفحات (بدل select('*') وحيد قد يُقتطع بصمت) ──
async function fetchAllRows(table: BackupTableName, columns: string): Promise<unknown[]> {
  let all: unknown[] = [];
  let from = 0;
  while (true) {
    const to = from + FETCH_PAGE_SIZE - 1;
    const { data, error } = await dynFrom(table).select(columns).range(from, to);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }
  return all;
}

export function useAdminBackup(profile?: ProfileRow | null) {
  const _userName = profile?.full_name || null;
  const tenantId = profile?.tenant_id ?? null;
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [backupProgress, setBackupProgress] = useState('');
  const [confirmRestore, setConfirmRestore] = useState<BackupRow | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [restoringBackup, setRestoringBackup] = useState(false);

  const fetchBackups = useCallback(async () => {
    setLoadingBackups(true);
    const { data } = await db.from('backups')
      .select('*').order('created_at', { ascending: false }).limit(20);
    if (data) setBackups(data);
    setLoadingBackups(false);
  }, []);

  // ── إنشاء نسخة احتياطية ──
  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    // profiles بتتضاف بعد الحلقة (مش فيها paging؛ حسابات المكتب عادة قليلة العدد نسبياً ومش محتاجة صفحات)
    const tables: BackupTableName[] = [...BACKUP_TABLES, 'profiles'];
    const snapshot: BackupSnapshot = { version: '1.1', created_at: new Date().toISOString(), tables: {} };

    // client_portal_pins فيها عمود pin القديم (نص صريح، لسه موجود لحد
    // ما يتحذف نهائيًا من قاعدة البيانات) — النسخة الاحتياطية لازم
    // تستثنيه صراحةً عشان ملف الباك أب ميبقاش فيه أي PIN كنص واضح،
    // حتى لو الجدول نفسه لسه فيه العمود القديم.
    const columnOverrides: Record<string, string> = {
      client_portal_pins: 'id,client_id,pin_hash,is_active,client_name,email',
    };

    let incomplete = false;
    for (const table of tables) {
      setBackupProgress('جاري تصدير: ' + table + '...');
      try {
        const rows = await fetchAllRows(table, columnOverrides[table] || '*');
        snapshot.tables[table] = rows;
      } catch (e) {
        snapshot.tables[table] = [];
        incomplete = true;
      }
    }

    setBackupProgress('جاري الحفظ...');
    const totalRows = Object.values(snapshot.tables).reduce((s: number, t: unknown[])=>s+t.length, 0);
    const sizeKb = Math.round(JSON.stringify(snapshot).length / 1024);

    const { error } = await db.from('backups').insert([{
      created_by: profile?.id,
      created_by_name: profile?.full_name || 'مدير',
      tables_count: tables.length,
      rows_count: totalRows,
      size_kb: sizeKb,
      data: snapshot,
    }]);

    setCreatingBackup(false);
    setBackupProgress('');
    if (error) { toast('❌ فشل حفظ النسخة الاحتياطية', true); return; }
    toast(incomplete ? '⚠️ تم الحفظ لكن بعض الجداول فشل تصديرها — راجع النسخة' : '✅ تم إنشاء النسخة الاحتياطية بنجاح');
    logActivity(db, 'إنشاء نسخة احتياطية', { entity_type: 'backup', details: `${totalRows} صف — ${sizeKb} KB`, userName: _userName });
    fetchBackups();
  };

  // ── تنزيل نسخة ──
  const handleDownloadBackup = (backup: BackupRow) => {
    const json = JSON.stringify(backup.data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `sanad-backup-${new Date(backup.created_at as string).toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('📥 جاري التنزيل...');
    logActivity(db, 'تنزيل نسخة احتياطية', { entity_type: 'backup', details: formatArDate(backup.created_at as string), userName: _userName });
  };

  // ── استعادة نسخة ──
  // ⚠️ تتطلب كتابة 'استعادة' يدوياً في حقل التأكيد قبل التنفيذ
  // ⚠️ استعادة حقيقية لنقطة زمنية: بنحذف بيانات المكتب الحالية من كل جدول (بالترتيب
  //    الصحيح لتفادي قيود المفاتيح الأجنبية) ثم بندخل صفوف النسخة الاحتياطية كاملة.
  //    استثناءان مقصودان من الحذف (upsert فقط بدلاً من حذف/إعادة إدخال):
  //    - profiles: حذفه قد يحذف حساب الأدمن الحالي نفسه أثناء عملية الاستعادة
  //      (RLS بتعتمد على profile المستخدم المسجل دخوله).
  //    - activity_log: سجل تدقيق قانوني — طمس الإدخالات اللي حصلت بعد
  //      تاريخ النسخة الاحتياطية (بما فيها إدخالات الاستعادة نفسها لاحقاً) غير مقبول
  //      من الناحية القانونية/المحاسبية، فبيتم فقط استكمال أي صفوف قديمة ناقصة.
  const handleRestoreBackup = async (backup: BackupRow) => {
    if (restoreConfirmText.trim() !== 'استعادة') {
      toast('❌ اكتب "استعادة" في حقل التأكيد أولاً', true);
      return;
    }
    if (!tenantId) {
      toast('❌ تعذر تحديد المكتب الحالي — لا يمكن الاستعادة بأمان', true);
      return;
    }
    setRestoringBackup(true);
    const snapshot = backup.data as BackupSnapshot | null;
    let restoredTables = 0;
    let failed = false;

    try {
      // ١) حذف بيانات المكتب الحالية (أبناء أولاً) من الجداول اللي هنعيد إدخالها بالكامل
      for (const table of RESTORE_DELETE_ORDER) {
        try {
          // ⚠️ table هنا union من عدة جداول، ومعظمها فيه عمود tenant_id مباشر
          // لكن client_portal_pins لأ (مربوط بالـ tenant عن طريق clients.tenant_id
          // مش عمود مباشر في جدوله هو) — فـ TypeScript بيحسب تقاطع أعمدة كل
          // الجداول في RESTORE_DELETE_ORDER فيرفض 'tenant_id' لأنه مش مشترك في
          // كلها. الكاست هنا موثّق ومقصود: باقي الجداول كلها فعلاً فيها العمود،
          // وحالة client_portal_pins الوحيدة هتفشل وقت التشغيل وتتلقط في catch
          // تحت (نفس السلوك الحالي، بدون أي تغيير فعلي في المنطق وقت التشغيل).
          await (dynFrom(table) as unknown as ReturnType<typeof _typedClientsFrom>)
            .delete()
            .eq('tenant_id', tenantId);
        } catch (e) {
          failed = true;
        }
      }

      // ٢) إعادة إدخال صفوف النسخة الاحتياطية (آباء أولاً)، على دفعات
      for (const table of RESTORE_INSERT_ORDER) {
        const rows = snapshot?.tables?.[table];
        if (!rows || rows.length === 0) continue;
        try {
          for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
            // ⚠️ الكاست هنا مختلف عن اختيار الجدول فوق (اللي بقى متحقق منه
            // بالكامل عبر BackupTableName): rows جايين من JSON مخزّن فعليًا
            // (BackupSnapshot.tables)، شكل كل صف مش معروف وقت الكتابة —
            // ممكن يكون من نسخة احتياطية أقدم بشكل مختلف شوية عن
            // database.types.ts الحالي. الكاست بيقول "الصف ده المفروض يطابق
            // شكل جدول `table` الحقيقي" (افتراض معقول لأنه جاي من باك أب لنفس
            // القاعدة)، مش "تجاهل النوع خالص" زي `any`.
            const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE) as Database['public']['Tables'][typeof table]['Insert'][];
            const { error } = await dynFrom(table).insert(chunk);
            if (error) throw error;
          }
          restoredTables++;
        } catch (e) {
          failed = true;
        }
      }

      // ٣) profiles و activity_log: upsert فقط (بدون حذف) — انظر التعليق أعلى الدالة
      for (const table of ['profiles', 'activity_log'] as const satisfies readonly BackupTableName[]) {
        const rows = snapshot?.tables?.[table];
        if (!rows || rows.length === 0) continue;
        try {
          for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
            // نفس ملاحظة insert فوق — الكاست هنا لشكل الصف (unknown JSON)، مش لاسم الجدول.
            const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE) as Database['public']['Tables'][typeof table]['Insert'][];
            const { error } = await dynFrom(table).upsert(chunk, { ignoreDuplicates: false });
            if (error) throw error;
          }
          restoredTables++;
        } catch (e) { failed = true; }
      }
    } finally {
      setRestoringBackup(false);
      setConfirmRestore(null);
      setRestoreConfirmText('');
    }

    const backupDate = formatArDate(backup.created_at as string);
    toast(failed ? `⚠️ تمت الاستعادة جزئياً — راجع البيانات (${restoredTables} جدول نجح)` : `✅ تمت الاستعادة الكاملة — ${restoredTables} جداول`);
    logActivity(db, 'استعادة نسخة احتياطية', { entity_type: 'backup', details: `نسخة ${backupDate} — ${restoredTables} جداول${failed ? ' (جزئي)' : ''}`, userName: _userName });
    // إعادة تحميل التطبيق عشان البيانات المستعادة تظهر فوراً
    setTimeout(() => window.location.reload(), 1500);
  };

  return {
    backups, loadingBackups,
    creatingBackup, backupProgress,
    confirmRestore, setConfirmRestore,
    restoreConfirmText, setRestoreConfirmText,
    restoringBackup,
    fetchBackups, handleCreateBackup, handleDownloadBackup, handleRestoreBackup
  };
}
