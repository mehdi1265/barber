import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { AppointmentStatus, Customer, Service, UUID } from '@shared/types'
import { buildLikePattern, normalizeSearchTerm, sqlNormalizeDigits } from '@shared/utils/search'

export const DEFAULT_GROUP_LIMIT = 10

export type SearchCustomer = Pick<Customer, 'id' | 'name' | 'phone'>
export type SearchService = Pick<Service, 'id' | 'name' | 'default_price' | 'is_active'>

export interface SearchAppointment {
  id: UUID
  title: string
  start_at: string
  status: AppointmentStatus
  customer_name: string | null
}

export interface SearchFormula {
  id: UUID
  title: string
  brand: string | null
  color_code: string | null
  customer_name: string | null
}

export interface SearchGroup<T> {
  items: T[]
  has_more: boolean
}

export interface SearchResults {
  customers: SearchGroup<SearchCustomer>
  services: SearchGroup<SearchService>
  appointments: SearchGroup<SearchAppointment>
  formulas: SearchGroup<SearchFormula>
}

/** `ESCAPE '\'` pairs with the escaping done in buildLikePattern. */
const LIKE_ESCAPE = "ESCAPE '\\'"

function emptyResults(): SearchResults {
  return {
    customers: { items: [], has_more: false },
    services: { items: [], has_more: false },
    appointments: { items: [], has_more: false },
    formulas: { items: [], has_more: false },
  }
}

function toGroup<T>(rows: T[], limit: number): SearchGroup<T> {
  return { items: rows.slice(0, limit), has_more: rows.length > limit }
}

export class SearchRepository {
  constructor(
    private readonly db: SQLiteDBConnection,
    private readonly userId: UUID
  ) {}

  /**
   * Runs one normalised query per domain. Each query fetches `limit + 1` rows
   * so the caller can tell whether a "see all" action is needed.
   */
  async searchAll(rawQuery: string, limit = DEFAULT_GROUP_LIMIT): Promise<SearchResults> {
    const term = normalizeSearchTerm(rawQuery)
    if (!term) return emptyResults()

    const take = Math.max(1, Math.floor(limit))
    const pattern = buildLikePattern(term)
    const fetch = take + 1

    const customerName = sqlNormalizeDigits('name')
    const customerPhone = sqlNormalizeDigits('phone')
    const customers = await this.db.query(
      `SELECT id, name, phone FROM customers
       WHERE user_id = ? AND deleted_at IS NULL
         AND (${customerName} LIKE ? ${LIKE_ESCAPE}
              OR ${customerPhone} LIKE ? ${LIKE_ESCAPE})
       ORDER BY name ASC
       LIMIT ?`,
      [this.userId, pattern, pattern, fetch]
    )

    const serviceName = sqlNormalizeDigits('name')
    const services = await this.db.query(
      `SELECT id, name, default_price, is_active FROM services
       WHERE user_id = ? AND ${serviceName} LIKE ? ${LIKE_ESCAPE}
       ORDER BY is_active DESC, name ASC
       LIMIT ?`,
      [this.userId, pattern, fetch]
    )

    const appointmentTitle = sqlNormalizeDigits('a.title')
    const appointmentNotes = sqlNormalizeDigits('a.notes')
    const appointmentCustomer = sqlNormalizeDigits('c.name')
    const appointmentService = sqlNormalizeDigits('s.service_name_snapshot')
    const appointments = await this.db.query(
      `SELECT a.id, a.title, a.start_at, a.status, c.name AS customer_name
       FROM appointments a
       LEFT JOIN customers c ON c.id = a.customer_id AND c.user_id = a.user_id
       WHERE a.user_id = ? AND a.deleted_at IS NULL
         AND (${appointmentTitle} LIKE ? ${LIKE_ESCAPE}
              OR ${appointmentNotes} LIKE ? ${LIKE_ESCAPE}
              OR ${appointmentCustomer} LIKE ? ${LIKE_ESCAPE}
              OR EXISTS (
                SELECT 1 FROM appointment_services s
                WHERE s.appointment_id = a.id AND s.user_id = a.user_id
                  AND ${appointmentService} LIKE ? ${LIKE_ESCAPE}
              ))
       ORDER BY a.start_at DESC
       LIMIT ?`,
      [this.userId, pattern, pattern, pattern, pattern, fetch]
    )

    const formulaTitle = sqlNormalizeDigits('f.title')
    const formulaBrand = sqlNormalizeDigits('f.brand')
    const formulaCode = sqlNormalizeDigits('f.color_code')
    const formulaCustomer = sqlNormalizeDigits('c.name')
    const formulas = await this.db.query(
      `SELECT f.id, f.title, f.brand, f.color_code, c.name AS customer_name
       FROM color_formulas f
       LEFT JOIN customers c ON c.id = f.customer_id AND c.user_id = f.user_id
       WHERE f.user_id = ?
         AND (${formulaTitle} LIKE ? ${LIKE_ESCAPE}
              OR ${formulaBrand} LIKE ? ${LIKE_ESCAPE}
              OR ${formulaCode} LIKE ? ${LIKE_ESCAPE}
              OR ${formulaCustomer} LIKE ? ${LIKE_ESCAPE})
       ORDER BY f.updated_at DESC
       LIMIT ?`,
      [this.userId, pattern, pattern, pattern, pattern, fetch]
    )

    return {
      customers: toGroup((customers.values as SearchCustomer[]) ?? [], take),
      services: toGroup((services.values as SearchService[]) ?? [], take),
      appointments: toGroup((appointments.values as SearchAppointment[]) ?? [], take),
      formulas: toGroup((formulas.values as SearchFormula[]) ?? [], take),
    }
  }
}
