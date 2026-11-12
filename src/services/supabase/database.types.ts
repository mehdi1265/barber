/**
 * Supabase database type definitions.
 * These mirror the PostgreSQL schema in Supabase.
 * Generated manually for now; can be auto-generated with:
 *   npx supabase gen types typescript --project-id <id>
 */

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          user_id: string
          display_name: string
          phone: string | null
          currency_code: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      customers: {
        Row: {
          id: string
          user_id: string
          name: string
          phone: string | null
          notes: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['customers']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['customers']['Insert']>
      }
      appointments: {
        Row: {
          id: string
          user_id: string
          customer_id: string | null
          title: string
          start_at: string
          duration_minutes: number
          end_at: string
          status: string
          notes: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: Omit<
          Database['public']['Tables']['appointments']['Row'],
          'created_at' | 'updated_at'
        >
        Update: Partial<Database['public']['Tables']['appointments']['Insert']>
      }
      visits: {
        Row: {
          id: string
          user_id: string
          customer_id: string | null
          appointment_id: string | null
          is_quick_sale: boolean
          visited_at: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['visits']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['visits']['Insert']>
      }
      payments: {
        Row: {
          id: string
          user_id: string
          visit_id: string
          amount: number
          method: string
          paid_at: string
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['payments']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['payments']['Insert']>
      }
      expenses: {
        Row: {
          id: string
          user_id: string
          title: string
          category: string | null
          amount: number
          spent_at: string
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['expenses']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['expenses']['Insert']>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
