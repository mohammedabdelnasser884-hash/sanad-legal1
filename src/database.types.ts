// ══════════════════════════════════════════════════════════════
//  database.types.ts — Types مولّدة يدويًا من قاعدة بيانات سند
//  (عبر استعلام information_schema.columns بتاريخ توليد هذا الملف)
//
//  ⚠️ ملاحظات مهمة قبل الاستخدام:
//  1) الأعمدة من نوع Postgres enum (USER-DEFINED) اتحطت كـ `string` هنا
//     لأن قيم الـ enum الفعلية مش معروفة من information_schema.columns
//     وحده (محتاجة استعلام تاني على pg_enum). القيم دي موجودة في أعمدة:
//     profiles.rbac_role, tenants.status, tenants.subscription_plan,
//     tenants.billing_interval, tenant_invoices.payment_status.
//     لو عايز تحصر القيم الحقيقية (كـ union type بدل string عام)، شغّل:
//       select t.typname, e.enumlabel
//       from pg_enum e join pg_type t on t.oid = e.enumtypid
//       order by t.typname, e.enumsortorder;
//     وابعتلي النتيجة، وهحدث الملف يدويًا بقيم دقيقة.
//  2) كل الأعمدة اتحطت nullable (`| null`) بشكل متحفظ لأن استعلام
//     information_schema اللي جبناه ماكانش فيه عمود is_nullable. ده أأمن
//     من افتراض NOT NULL غلط، بس معناه TypeScript مش هيفرض عليك تبعت كل
//     الحقول المطلوبة فعليًا وقت insert. ينفع تتضيّق لاحقًا لو حبيت دقة أعلى.
//  3) الملف ده يدوي مش من `supabase gen types` الرسمي — يوصل لنفس الفايدة
//     العملية (autocomplete + كشف mismatch في أسماء الأعمدة)، لكن لو قدرت
//     تشغل الأمر الرسمي من جهاز فيه CLI يومًا ما، يفضل أدق.
// ══════════════════════════════════════════════════════════════

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      activity_log: {
        Row: {
          id: string
          user_id: string | null
          user_name: string | null
          action: string | null
          details: string | null
          entity_type: string | null
          entity_id: string | null
          ip_address: string | null
          created_at: string | null
          client_name: string | null
          case_name: string | null
          case_type: string | null
          tenant_id: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          user_name?: string | null
          action?: string | null
          details?: string | null
          entity_type?: string | null
          entity_id?: string | null
          ip_address?: string | null
          created_at?: string | null
          client_name?: string | null
          case_name?: string | null
          case_type?: string | null
          tenant_id?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          user_name?: string | null
          action?: string | null
          details?: string | null
          entity_type?: string | null
          entity_id?: string | null
          ip_address?: string | null
          created_at?: string | null
          client_name?: string | null
          case_name?: string | null
          case_type?: string | null
          tenant_id?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      backups: {
        Row: {
          id: string
          created_by: string | null
          created_by_name: string | null
          tables_count: number | null
          rows_count: number | null
          size_kb: number | null
          data: Json | null
          created_at: string | null
          tenant_id: string | null
        }
        Insert: {
          id?: string
          created_by?: string | null
          created_by_name?: string | null
          tables_count?: number | null
          rows_count?: number | null
          size_kb?: number | null
          data?: Json | null
          created_at?: string | null
          tenant_id?: string | null
        }
        Update: {
          id?: string
          created_by?: string | null
          created_by_name?: string | null
          tables_count?: number | null
          rows_count?: number | null
          size_kb?: number | null
          data?: Json | null
          created_at?: string | null
          tenant_id?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      case_documents: {
        Row: {
          id: string
          case_id: string | null
          file_name: string | null
          file_type: string | null
          file_url: string | null
          storage_path: string | null
          category: string | null
          original_name: string | null
          file_size: number | null
          created_at: string | null
          tenant_id: string | null
        }
        Insert: {
          id?: string
          case_id?: string | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          storage_path?: string | null
          category?: string | null
          original_name?: string | null
          file_size?: number | null
          created_at?: string | null
          tenant_id?: string | null
        }
        Update: {
          id?: string
          case_id?: string | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          storage_path?: string | null
          category?: string | null
          original_name?: string | null
          file_size?: number | null
          created_at?: string | null
          tenant_id?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      case_events: {
        Row: {
          id: string
          case_id: string | null
          event_type: string | null
          event_date: string | null
          description: string | null
          session_link: string | null
          ai_action_required: string | null
          is_processed_by_ai: boolean | null
          created_at: string | null
          tenant_id: string | null
        }
        Insert: {
          id?: string
          case_id?: string | null
          event_type?: string | null
          event_date?: string | null
          description?: string | null
          session_link?: string | null
          ai_action_required?: string | null
          is_processed_by_ai?: boolean | null
          created_at?: string | null
          tenant_id?: string | null
        }
        Update: {
          id?: string
          case_id?: string | null
          event_type?: string | null
          event_date?: string | null
          description?: string | null
          session_link?: string | null
          ai_action_required?: string | null
          is_processed_by_ai?: boolean | null
          created_at?: string | null
          tenant_id?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      case_fees: {
        Row: {
          id: string
          case_id: string | null
          total_fees: number | null
          paid_fees: number | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          last_payment_date: string | null
          payment_note: string | null
          tenant_id: string | null
          client_name: string | null
          receiver: string | null
          status: string | null
          client_id: string | null
          case_title: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          case_id?: string | null
          total_fees?: number | null
          paid_fees?: number | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          last_payment_date?: string | null
          payment_note?: string | null
          tenant_id?: string | null
          client_name?: string | null
          receiver?: string | null
          status?: string | null
          client_id?: string | null
          case_title?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          case_id?: string | null
          total_fees?: number | null
          paid_fees?: number | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          last_payment_date?: string | null
          payment_note?: string | null
          tenant_id?: string | null
          client_name?: string | null
          receiver?: string | null
          status?: string | null
          client_id?: string | null
          case_title?: string | null
          deleted_at?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      case_notes: {
        Row: {
          id: string
          case_id: string | null
          content: string | null
          created_at: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          case_id?: string | null
          content?: string | null
          created_at?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          case_id?: string | null
          content?: string | null
          created_at?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      case_sessions: {
        Row: {
          id: string
          case_id: string | null
          session_date: string | null
          description: string | null
          result: string | null
          next_action: string | null
          created_at: string | null
          session_time: string | null
          session_floor: string | null
          session_hall: string | null
          tenant_id: string | null
          title: string | null
          case_number: string | null
          court: string | null
          case_type: string | null
          plaintiff: string | null
          plaintiff_national_id: string | null
          plaintiff_power_of_attorney: string | null
          defendant: string | null
          defendant_national_id: string | null
          updated_at: string | null
          client_id: string | null
          circuit_number: string | null
          plaintiff_role: string | null
          defendant_role: string | null
        }
        Insert: {
          id?: string
          case_id?: string | null
          session_date?: string | null
          description?: string | null
          result?: string | null
          next_action?: string | null
          created_at?: string | null
          session_time?: string | null
          session_floor?: string | null
          session_hall?: string | null
          tenant_id?: string | null
          title?: string | null
          case_number?: string | null
          court?: string | null
          case_type?: string | null
          plaintiff?: string | null
          plaintiff_national_id?: string | null
          plaintiff_power_of_attorney?: string | null
          defendant?: string | null
          defendant_national_id?: string | null
          updated_at?: string | null
          client_id?: string | null
          circuit_number?: string | null
          plaintiff_role?: string | null
          defendant_role?: string | null
        }
        Update: {
          id?: string
          case_id?: string | null
          session_date?: string | null
          description?: string | null
          result?: string | null
          next_action?: string | null
          created_at?: string | null
          session_time?: string | null
          session_floor?: string | null
          session_hall?: string | null
          tenant_id?: string | null
          title?: string | null
          case_number?: string | null
          court?: string | null
          case_type?: string | null
          plaintiff?: string | null
          plaintiff_national_id?: string | null
          plaintiff_power_of_attorney?: string | null
          defendant?: string | null
          defendant_national_id?: string | null
          updated_at?: string | null
          client_id?: string | null
          circuit_number?: string | null
          plaintiff_role?: string | null
          defendant_role?: string | null
        }
        // ⚠️ FIX (14 يوليو 2026): كانت فاضية، وده كان بيمنع supabase-js من
        // استنتاج نوع الـ embed `cases(...)` جوه .select() (بيرجع
        // SelectQueryError بدل الشكل الحقيقي) في كل مكان بيجيب جلسات مع
        // بيانات القضية المرتبطة (useDashboardFeed.ts وغيره). العمود
        // case_id في case_sessions فعليًا FK على cases.id.
        Relationships: [
          {
            foreignKeyName: "case_sessions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          }
        ]
      },
      cases: {
        Row: {
          id: string
          firm_id: string | null
          client_id: string | null
          case_number_official: string | null
          title: string | null
          court_name: string | null
          circuit_number: string | null
          case_type: string | null
          status: string | null
          ai_summary: string | null
          last_sync_at: string | null
          created_at: string | null
          plaintiff: string | null
          defendant: string | null
          next_hearing: string | null
          court_floor: string | null
          court_hall: string | null
          session_time: string | null
          tenant_id: string | null
          updated_at: string | null
          court_level: string | null
          session_hall: string | null
          secretary_hall: string | null
          secretary_name: string | null
          case_number: string | null
          court: string | null
          plaintiff_national_id: string | null
          plaintiff_power_of_attorney: string | null
          defendant_national_id: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          firm_id?: string | null
          client_id?: string | null
          case_number_official?: string | null
          title?: string | null
          court_name?: string | null
          circuit_number?: string | null
          case_type?: string | null
          status?: string | null
          ai_summary?: string | null
          last_sync_at?: string | null
          created_at?: string | null
          plaintiff?: string | null
          defendant?: string | null
          next_hearing?: string | null
          court_floor?: string | null
          court_hall?: string | null
          session_time?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          court_level?: string | null
          session_hall?: string | null
          secretary_hall?: string | null
          secretary_name?: string | null
          case_number?: string | null
          court?: string | null
          plaintiff_national_id?: string | null
          plaintiff_power_of_attorney?: string | null
          defendant_national_id?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          firm_id?: string | null
          client_id?: string | null
          case_number_official?: string | null
          title?: string | null
          court_name?: string | null
          circuit_number?: string | null
          case_type?: string | null
          status?: string | null
          ai_summary?: string | null
          last_sync_at?: string | null
          created_at?: string | null
          plaintiff?: string | null
          defendant?: string | null
          next_hearing?: string | null
          court_floor?: string | null
          court_hall?: string | null
          session_time?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          court_level?: string | null
          session_hall?: string | null
          secretary_hall?: string | null
          secretary_name?: string | null
          case_number?: string | null
          court?: string | null
          plaintiff_national_id?: string | null
          plaintiff_power_of_attorney?: string | null
          defendant_national_id?: string | null
          deleted_at?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      client_messages: {
        Row: {
          id: string
          client_id: string | null
          content: string | null
          sender: string | null
          sender_name: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          client_id?: string | null
          content?: string | null
          sender?: string | null
          sender_name?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string | null
          content?: string | null
          sender?: string | null
          sender_name?: string | null
          created_at?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      client_portal_pins: {
        Row: {
          id: string
          client_id: string | null
          is_active: boolean | null
          client_name: string | null
          email: string | null
          created_at: string | null
          updated_at: string | null
          pin_hash: string | null
        }
        Insert: {
          id?: string
          client_id?: string | null
          is_active?: boolean | null
          client_name?: string | null
          email?: string | null
          created_at?: string | null
          updated_at?: string | null
          pin_hash?: string | null
        }
        Update: {
          id?: string
          client_id?: string | null
          is_active?: boolean | null
          client_name?: string | null
          email?: string | null
          created_at?: string | null
          updated_at?: string | null
          pin_hash?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      client_portal_sessions: {
        Row: {
          id: string
          client_id: string | null
          token: string | null
          created_at: string | null
          expires_at: string | null
        }
        Insert: {
          id?: string
          client_id?: string | null
          token?: string | null
          created_at?: string | null
          expires_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string | null
          token?: string | null
          created_at?: string | null
          expires_at?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      clients: {
        Row: {
          id: string
          firm_id: string | null
          client_name: string | null
          client_type: string | null
          cr_number: string | null
          national_id: string | null
          contact_info: Json | null
          created_at: string | null
          email: string | null
          phone: string | null
          notes: string | null
          full_name: string | null
          type: string | null
          lawyer_id: string | null
          portal_password: string | null
          portal_pin: string | null
          tenant_id: string | null
          phone2: string | null
          address: string | null
          kin_name: string | null
          kin_phone: string | null
          updated_at: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          firm_id?: string | null
          client_name?: string | null
          client_type?: string | null
          cr_number?: string | null
          national_id?: string | null
          contact_info?: Json | null
          created_at?: string | null
          email?: string | null
          phone?: string | null
          notes?: string | null
          full_name?: string | null
          type?: string | null
          lawyer_id?: string | null
          portal_password?: string | null
          portal_pin?: string | null
          tenant_id?: string | null
          phone2?: string | null
          address?: string | null
          kin_name?: string | null
          kin_phone?: string | null
          updated_at?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          firm_id?: string | null
          client_name?: string | null
          client_type?: string | null
          cr_number?: string | null
          national_id?: string | null
          contact_info?: Json | null
          created_at?: string | null
          email?: string | null
          phone?: string | null
          notes?: string | null
          full_name?: string | null
          type?: string | null
          lawyer_id?: string | null
          portal_password?: string | null
          portal_pin?: string | null
          tenant_id?: string | null
          phone2?: string | null
          address?: string | null
          kin_name?: string | null
          kin_phone?: string | null
          updated_at?: string | null
          deleted_at?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      fee_payments: {
        Row: {
          id: string
          fee_id: string | null
          amount: number | null
          payment_date: string | null
          notes: string | null
          created_at: string | null
          received_by: string | null
          tenant_id: string | null
          client_name: string | null
          client_id: string | null
        }
        Insert: {
          id?: string
          fee_id?: string | null
          amount?: number | null
          payment_date?: string | null
          notes?: string | null
          created_at?: string | null
          received_by?: string | null
          tenant_id?: string | null
          client_name?: string | null
          client_id?: string | null
        }
        Update: {
          id?: string
          fee_id?: string | null
          amount?: number | null
          payment_date?: string | null
          notes?: string | null
          created_at?: string | null
          received_by?: string | null
          tenant_id?: string | null
          client_name?: string | null
          client_id?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      invoices: {
        Row: {
          id: string
          tenant_id: string | null
          invoice_number: string | null
          fee_payment_id: string | null
          case_id: string | null
          client_id: string | null
          case_name: string | null
          client_name: string | null
          amount: number | null
          currency: string | null
          notes: string | null
          issued_by: string | null
          issued_at: string | null
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          invoice_number?: string | null
          fee_payment_id?: string | null
          case_id?: string | null
          client_id?: string | null
          case_name?: string | null
          client_name?: string | null
          amount?: number | null
          currency?: string | null
          notes?: string | null
          issued_by?: string | null
          issued_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string | null
          invoice_number?: string | null
          fee_payment_id?: string | null
          case_id?: string | null
          client_id?: string | null
          case_name?: string | null
          client_name?: string | null
          amount?: number | null
          currency?: string | null
          notes?: string | null
          issued_by?: string | null
          issued_at?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      law_articles: {
        Row: {
          id: string
          law_id: string | null
          article_number: string | null
          order_index: number | null
          article_text: string | null
          article_preview: string | null
          embedding: string | null
          created_at: string | null
          search_vector: string | null
        }
        Insert: {
          id?: string
          law_id?: string | null
          article_number?: string | null
          order_index?: number | null
          article_text?: string | null
          article_preview?: string | null
          embedding?: string | null
          created_at?: string | null
          search_vector?: string | null
        }
        Update: {
          id?: string
          law_id?: string | null
          article_number?: string | null
          order_index?: number | null
          article_text?: string | null
          article_preview?: string | null
          embedding?: string | null
          created_at?: string | null
          search_vector?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      law_firms: {
        Row: {
          id: string
          firm_name: string | null
          license_number: string | null
          subscription_tier: string | null
          created_at: string | null
          tenant_id: string | null
        }
        Insert: {
          id?: string
          firm_name?: string | null
          license_number?: string | null
          subscription_tier?: string | null
          created_at?: string | null
          tenant_id?: string | null
        }
        Update: {
          id?: string
          firm_name?: string | null
          license_number?: string | null
          subscription_tier?: string | null
          created_at?: string | null
          tenant_id?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      laws: {
        Row: {
          id: string
          title: string | null
          law_number: string | null
          law_year: number | null
          category_id: string | null
          file_path: string | null
          file_name: string | null
          status: string | null
          processing_error: string | null
          articles_count: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          title?: string | null
          law_number?: string | null
          law_year?: number | null
          category_id?: string | null
          file_path?: string | null
          file_name?: string | null
          status?: string | null
          processing_error?: string | null
          articles_count?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          title?: string | null
          law_number?: string | null
          law_year?: number | null
          category_id?: string | null
          file_path?: string | null
          file_name?: string | null
          status?: string | null
          processing_error?: string | null
          articles_count?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      legal_categories: {
        Row: {
          id: string
          key: string | null
          name_ar: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          key?: string | null
          name_ar?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          key?: string | null
          name_ar?: string | null
          created_at?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      office_login_attempts: {
        Row: {
          id: string
          email: string | null
          ip_address: string | null
          success: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          email?: string | null
          ip_address?: string | null
          success?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          email?: string | null
          ip_address?: string | null
          success?: boolean | null
          created_at?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      office_settings: {
        Row: {
          id: number
          name: string | null
          slogan: string | null
          phone: string | null
          phone2: string | null
          email: string | null
          website: string | null
          whatsapp: string | null
          address: string | null
          facebook: string | null
          instagram: string | null
          brand_color: string | null
          accent_color: string | null
          invoice_prefix: string | null
          invoice_footer: string | null
          tax_number: string | null
          license_number: string | null
          logo_url: string | null
          updated_at: string | null
          city: string | null
          bank_name: string | null
          bank_iban: string | null
          tg_token: string | null
          tg_chat: string | null
          groq_key: string | null
          tenant_id: string | null
          country: string | null
          tg_daily_token: string | null
          tg_daily_chat: string | null
          tg_instant_token: string | null
          tg_instant_chat: string | null
          groq_key_secret_id: string | null
          invoice_counter: number | null
          tg_daily_token_secret_id: string | null
          tg_instant_token_secret_id: string | null
        }
        Insert: {
          id?: number
          name?: string | null
          slogan?: string | null
          phone?: string | null
          phone2?: string | null
          email?: string | null
          website?: string | null
          whatsapp?: string | null
          address?: string | null
          facebook?: string | null
          instagram?: string | null
          brand_color?: string | null
          accent_color?: string | null
          invoice_prefix?: string | null
          invoice_footer?: string | null
          tax_number?: string | null
          license_number?: string | null
          logo_url?: string | null
          updated_at?: string | null
          city?: string | null
          bank_name?: string | null
          bank_iban?: string | null
          tg_token?: string | null
          tg_chat?: string | null
          groq_key?: string | null
          tenant_id?: string | null
          country?: string | null
          tg_daily_token?: string | null
          tg_daily_chat?: string | null
          tg_instant_token?: string | null
          tg_instant_chat?: string | null
          groq_key_secret_id?: string | null
          invoice_counter?: number | null
          tg_daily_token_secret_id?: string | null
          tg_instant_token_secret_id?: string | null
        }
        Update: {
          id?: number
          name?: string | null
          slogan?: string | null
          phone?: string | null
          phone2?: string | null
          email?: string | null
          website?: string | null
          whatsapp?: string | null
          address?: string | null
          facebook?: string | null
          instagram?: string | null
          brand_color?: string | null
          accent_color?: string | null
          invoice_prefix?: string | null
          invoice_footer?: string | null
          tax_number?: string | null
          license_number?: string | null
          logo_url?: string | null
          updated_at?: string | null
          city?: string | null
          bank_name?: string | null
          bank_iban?: string | null
          tg_token?: string | null
          tg_chat?: string | null
          groq_key?: string | null
          tenant_id?: string | null
          country?: string | null
          tg_daily_token?: string | null
          tg_daily_chat?: string | null
          tg_instant_token?: string | null
          tg_instant_chat?: string | null
          groq_key_secret_id?: string | null
          invoice_counter?: number | null
          tg_daily_token_secret_id?: string | null
          tg_instant_token_secret_id?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      pin_attempts: {
        Row: {
          id: string
          email: string | null
          attempted_at: string | null
          success: boolean | null
        }
        Insert: {
          id?: string
          email?: string | null
          attempted_at?: string | null
          success?: boolean | null
        }
        Update: {
          id?: string
          email?: string | null
          attempted_at?: string | null
          success?: boolean | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      platform_audit_logs: {
        Row: {
          id: string
          tenant_id: string | null
          user_id: string | null
          user_name: string | null
          action: string | null
          details: string | null
          ip_address: string | null
          user_agent: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          user_id?: string | null
          user_name?: string | null
          action?: string | null
          details?: string | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string | null
          user_id?: string | null
          user_name?: string | null
          action?: string | null
          details?: string | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      portal_pin_attempts: {
        Row: {
          id: string
          contact: string | null
          ip_address: string | null
          success: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          contact?: string | null
          ip_address?: string | null
          success?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          contact?: string | null
          ip_address?: string | null
          success?: boolean | null
          created_at?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      profiles: {
        Row: {
          id: string
          user_id: string | null
          full_name: string | null
          email: string | null
          role: string | null
          created_at: string | null
          tenant_id: string | null
          rbac_role: string | null
          is_super_admin: boolean | null
          is_active: boolean | null
          permissions: Json | null
          last_login: string | null
          must_change_password: boolean | null
          is_locked: boolean | null
          failed_login_attempts: number | null
          last_seen_at: string | null
          last_seen_device: string | null
          last_seen_browser: string | null
          last_seen_ip: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          full_name?: string | null
          email?: string | null
          role?: string | null
          created_at?: string | null
          tenant_id?: string | null
          rbac_role?: string | null
          is_super_admin?: boolean | null
          is_active?: boolean | null
          permissions?: Json | null
          last_login?: string | null
          must_change_password?: boolean | null
          is_locked?: boolean | null
          failed_login_attempts?: number | null
          last_seen_at?: string | null
          last_seen_device?: string | null
          last_seen_browser?: string | null
          last_seen_ip?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          full_name?: string | null
          email?: string | null
          role?: string | null
          created_at?: string | null
          tenant_id?: string | null
          rbac_role?: string | null
          is_super_admin?: boolean | null
          is_active?: boolean | null
          permissions?: Json | null
          last_login?: string | null
          must_change_password?: boolean | null
          is_locked?: boolean | null
          failed_login_attempts?: number | null
          last_seen_at?: string | null
          last_seen_device?: string | null
          last_seen_browser?: string | null
          last_seen_ip?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      push_subscriptions: {
        Row: {
          id: string
          user_id: string | null
          endpoint: string | null
          p256dh: string | null
          auth: string | null
          active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          endpoint?: string | null
          p256dh?: string | null
          auth?: string | null
          active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          endpoint?: string | null
          p256dh?: string | null
          auth?: string | null
          active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      reminders: {
        Row: {
          id: string
          title: string | null
          due_date: string | null
          notes: string | null
          done: boolean | null
          created_at: string | null
          tenant_id: string | null
          updated_at: string | null
          user_id: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          title?: string | null
          due_date?: string | null
          notes?: string | null
          done?: boolean | null
          created_at?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          title?: string | null
          due_date?: string | null
          notes?: string | null
          done?: boolean | null
          created_at?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          completed_at?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      saas_admin_login_attempts: {
        Row: {
          id: string
          ip_address: string | null
          success: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          ip_address?: string | null
          success?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          ip_address?: string | null
          success?: boolean | null
          created_at?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      tenant_invoices: {
        Row: {
          id: string
          tenant_id: string | null
          invoice_number: string | null
          billing_period_start: string | null
          billing_period_end: string | null
          amount_due: number | null
          currency: string | null
          payment_status: string | null
          paid_at: string | null
          stripe_invoice_id: string | null
          pdf_url: string | null
          created_at: string | null
          payment_method: string | null
          notes: string | null
          plan_at_payment: string | null
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          invoice_number?: string | null
          billing_period_start?: string | null
          billing_period_end?: string | null
          amount_due?: number | null
          currency?: string | null
          payment_status?: string | null
          paid_at?: string | null
          stripe_invoice_id?: string | null
          pdf_url?: string | null
          created_at?: string | null
          payment_method?: string | null
          notes?: string | null
          plan_at_payment?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string | null
          invoice_number?: string | null
          billing_period_start?: string | null
          billing_period_end?: string | null
          amount_due?: number | null
          currency?: string | null
          payment_status?: string | null
          paid_at?: string | null
          stripe_invoice_id?: string | null
          pdf_url?: string | null
          created_at?: string | null
          payment_method?: string | null
          notes?: string | null
          plan_at_payment?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      tenant_usage_stats: {
        Row: {
          id: string
          tenant_id: string | null
          cases_count: number | null
          clients_count: number | null
          storage_bytes_used: number | null
          api_requests_count: number | null
          last_login_activity: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          cases_count?: number | null
          clients_count?: number | null
          storage_bytes_used?: number | null
          api_requests_count?: number | null
          last_login_activity?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string | null
          cases_count?: number | null
          clients_count?: number | null
          storage_bytes_used?: number | null
          api_requests_count?: number | null
          last_login_activity?: string | null
          updated_at?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      tenants: {
        Row: {
          id: string
          name: string | null
          slug: string | null
          custom_domain: string | null
          status: string | null
          subscription_plan: string | null
          billing_interval: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          api_key: string | null
          api_key_created_at: string | null
          trial_ends_at: string | null
          created_at: string | null
          updated_at: string | null
          phone: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          name?: string | null
          slug?: string | null
          custom_domain?: string | null
          status?: string | null
          subscription_plan?: string | null
          billing_interval?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          api_key?: string | null
          api_key_created_at?: string | null
          trial_ends_at?: string | null
          created_at?: string | null
          updated_at?: string | null
          phone?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          name?: string | null
          slug?: string | null
          custom_domain?: string | null
          status?: string | null
          subscription_plan?: string | null
          billing_interval?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          api_key?: string | null
          api_key_created_at?: string | null
          trial_ends_at?: string | null
          created_at?: string | null
          updated_at?: string | null
          phone?: string | null
          notes?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      },
      whatsapp_logs: {
        Row: {
          id: number
          created_at: string | null
          entity_type: string | null
          phone: string | null
          template: string | null
          message: string | null
          sent_at: string | null
          entity_id: string | null
          tenant_id: string | null
        }
        Insert: {
          id?: number
          created_at?: string | null
          entity_type?: string | null
          phone?: string | null
          template?: string | null
          message?: string | null
          sent_at?: string | null
          entity_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          id?: number
          created_at?: string | null
          entity_type?: string | null
          phone?: string | null
          template?: string | null
          message?: string | null
          sent_at?: string | null
          entity_id?: string | null
          tenant_id?: string | null
        }
        // ⚠️ مطلوبة بنيويًا من supabase-js (بيتحقق منها داخليًا وقت استنتاج
        // نوع from()/insert()/update()) — من غيرها التحقق بينهار لـ `never`
        // على .insert()/.update() في كل الجداول. مفيش foreign keys متضمّنة
        // هنا (محتاجة استعلام تاني على information_schema)، فسايبينها فاضية.
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    // ⚠️ مش عندي بيانات حقيقية عن دوال RPC (Functions) في قاعدة البيانات —
    // ده محتاج استعلام على pg_proc مش عملناه. سيبناها permissive (بتقبل
    // أي اسم دالة بـ Args/Returns مرنة) بدل ما نمنع استدعاء db.rpc() تمامًا
    // زي ما كان بيحصل بـ Functions: {} فاضية. لو حبيت دقة أعلى (كشف
    // اسم دالة غلط وقت الكتابة)، ابعتلي نتيجة الاستعلام ده من SQL Editor:
    //   select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';
    Functions: {
      [key: string]: {
        Args: Record<string, unknown>
        Returns: unknown
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Shorthands (زي المذكور في توثيق سوبابيز الرسمي)
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
