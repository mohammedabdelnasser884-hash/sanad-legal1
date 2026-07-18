// ══════════════════════════════════════════════════════════════
//  types.ts — أنواع الكيانات المشتركة (Case, Client, Fee...) للاستخدام
//  في كل الـ hooks/components بدل `any`.
//
//  دول اشتقاق مباشر من database.types.ts (اللي جاي من قاعدة البيانات
//  الحقيقية)، فأي عمود هنا هو عمود حقيقي موجود فعلاً في الجدول.
//  لو ضفت عمود جديد في قاعدة البيانات لاحقًا، حدّث database.types.ts
//  الأول (بنفس استعلام information_schema.columns) وده هنا هيتحدث تلقائيًا.
// ══════════════════════════════════════════════════════════════
import type { Tables } from './database.types';

export type CaseRow = Tables<'cases'>;
export type ClientRow = Tables<'clients'>;
export type CaseFeeRow = Tables<'case_fees'>;
export type FeePaymentRow = Tables<'fee_payments'>;
export type ProfileRow = Tables<'profiles'>;
export type CaseSessionRow = Tables<'case_sessions'>;
export type CaseDocumentRow = Tables<'case_documents'>;
export type CaseNoteRow = Tables<'case_notes'>;
export type CaseEventRow = Tables<'case_events'>;
export type ReminderRow = Tables<'reminders'>;
export type InvoiceRow = Tables<'invoices'>;
export type OfficeSettingsRow = Tables<'office_settings'>;
export type ActivityLogRow = Tables<'activity_log'>;
export type TenantRow = Tables<'tenants'>;
export type LawRow = Tables<'laws'>;
export type LegalCategoryRow = Tables<'legal_categories'>;
export type BackupRow = Tables<'backups'>;

// دفعات مجمّعة حسب fee_id — الشكل اللي بيترجع من fetchFees في useFeesActions
export type PaymentsByFeeId = Record<string, FeePaymentRow[]>;
