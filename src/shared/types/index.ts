// ======================================================
// Core shared types used across the entire application
// ======================================================

export type UUID = string

export type SyncStatus = 'pending' | 'synced' | 'failed' | 'conflict'

export type PaymentMethod = 'cash' | 'card' | 'other'

export type AppointmentStatus = 'reserved' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'

export type PhotoType = 'before' | 'after' | 'other'

export type OutboxOperation = 'insert' | 'update' | 'delete'

export type OutboxStatus = 'pending' | 'processing' | 'done' | 'failed'

// ---- Database base fields (every synced entity has these) ----

export interface BaseEntity {
  id: UUID
  user_id: UUID
  created_at: string // ISO-8601
  updated_at: string // ISO-8601
}

export interface SoftDeletable {
  deleted_at: string | null
}

// ---- Domain entities ----

export interface Profile extends BaseEntity {
  display_name: string
  phone: string | null
  currency_code: string // default: 'IRR' (Toman display)
}

export interface Customer extends BaseEntity, SoftDeletable {
  name: string
  phone: string | null
  notes: string | null
}

export interface Service extends BaseEntity {
  name: string
  default_price: number | null
  suggested_duration_minutes: number | null
  is_active: boolean
}

export interface Appointment extends BaseEntity, SoftDeletable {
  customer_id: UUID | null
  title: string
  start_at: string // ISO-8601
  duration_minutes: number
  end_at: string // ISO-8601 — derived from start_at + duration_minutes
  status: AppointmentStatus
  notes: string | null
}

export interface AppointmentService extends BaseEntity {
  appointment_id: UUID
  service_id: UUID | null
  service_name_snapshot: string
  price: number
  duration_minutes: number | null
}

/** A visit is either created from an appointment (walk-in) or a Quick Sale */
export interface Visit extends BaseEntity {
  customer_id: UUID | null
  appointment_id: UUID | null
  /** true when this visit was created via Quick Sale flow */
  is_quick_sale: boolean
  visited_at: string // ISO-8601
  notes: string | null
}

export interface VisitService extends BaseEntity {
  visit_id: UUID
  service_id: UUID | null
  service_name_snapshot: string
  quantity: number
  unit_price: number
  discount_amount: number
  line_total: number // (quantity * unit_price) - discount_amount
  duration_minutes: number | null
}

export interface Payment extends BaseEntity {
  visit_id: UUID
  amount: number
  method: PaymentMethod
  paid_at: string // ISO-8601
  note: string | null
}

export interface Expense extends BaseEntity {
  title: string
  category: string | null
  amount: number
  spent_at: string // ISO-8601
  note: string | null
}

export interface ColorFormula extends BaseEntity {
  title: string
  brand: string | null
  color_code: string | null
  oxidant_type: string | null
  oxidant_percent: number | null
  mix_ratio: string | null
  processing_minutes: number | null
  notes: string | null
  /** optional link to a customer */
  customer_id: UUID | null
  /** optional link to a visit */
  visit_id: UUID | null
}

export interface ColorFormulaItem extends BaseEntity {
  formula_id: UUID
  product_name: string
  color_code: string | null
  amount: number
  unit: string // e.g. 'g', 'ml'
}

export interface CustomerPhoto extends BaseEntity, SoftDeletable {
  customer_id: UUID | null
  visit_id: UUID | null
  /** Remote path in Supabase Storage — null until uploaded */
  storage_path: string | null
  /** Local filesystem path — only kept in SQLite, never synced to server */
  local_path: string | null
  photo_type: PhotoType
  caption: string | null
  /** true = user has given consent for this photo to be processed */
  consent_given: boolean
}

// ---- Sync Outbox (local SQLite only) ----

export interface SyncOutbox {
  id: UUID
  entity_type: string
  entity_id: UUID
  operation: OutboxOperation
  payload: string // JSON string of the full record
  created_at: string
  attempt_count: number
  last_error: string | null
  status: OutboxStatus
}

// ---- Financial report types ----

export interface DailyReport {
  date: string // YYYY-MM-DD
  visit_count: number
  service_count: number
  total_service_amount: number
  total_received: number
  total_debt: number
  total_expenses: number
  net_after_expenses: number
}

export interface FinancialSummary {
  period_start: string
  period_end: string
  total_service_amount: number
  total_received: number
  total_debt: number
  total_expenses: number
  net_after_expenses: number
}

// ---- UI helper types ----

export type LoadingState = 'idle' | 'loading' | 'success' | 'error'

export interface AppError {
  code: string
  message: string
  details?: unknown
}
