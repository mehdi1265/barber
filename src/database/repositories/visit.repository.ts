import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { Visit, VisitService, Payment, UUID, PaymentMethod } from '@shared/types'
import { generateUUID, nowISO, tomanToStorage } from '@shared/utils/helpers'
import { addToOutbox } from '@sync/outbox/outbox.repository'
import { withTransaction } from '@database/sqlite/transaction'
import { localDayRange } from '@shared/utils/datetime'

// ── Input types ───────────────────────────────────────────────────────────────

export interface VisitServiceInput {
  service_id?: string | null
  service_name_snapshot: string
  quantity?: number
  unit_price: number // Toman (display)
  discount_amount?: number // Toman (display)
  duration_minutes?: number | null
}

export interface InitialPaymentInput {
  amount: number // Toman (display)
  method: PaymentMethod
  note?: string | null
}

export interface CreateVisitInput {
  customer_id?: string | null
  appointment_id?: string | null
  is_quick_sale?: boolean
  visited_at?: string // ISO-8601; defaults to now
  notes?: string | null
  services: VisitServiceInput[]
  /** Optional payment recorded in the same transaction as the visit. */
  payment?: InitialPaymentInput | null
}

export interface VisitSummary extends Visit {
  customer_name: string | null
  service_total: number
  paid_total: number
}

/** Thrown when a payment would exceed the visit's remaining balance. */
export class OverpaymentError extends Error {
  constructor(readonly remaining: number) {
    super(`Payment exceeds remaining balance (${remaining})`)
    this.name = 'OverpaymentError'
  }
}

export interface AddPaymentInput {
  visit_id: UUID
  amount: number // Toman (display)
  method: PaymentMethod
  paid_at?: string // ISO-8601; defaults to now
  note?: string | null
}

// ── Repository ────────────────────────────────────────────────────────────────

export class VisitRepository {
  constructor(
    private readonly db: SQLiteDBConnection,
    private readonly userId: UUID
  ) {}

  // ── Read ──────────────────────────────────────────────────────────────────

  async findById(id: UUID): Promise<Visit | null> {
    const result = await this.db.query(
      `SELECT * FROM visits WHERE id = ? AND user_id = ? LIMIT 1`,
      [id, this.userId]
    )
    return (result.values?.[0] as Visit) ?? null
  }

  async findByCustomer(customerId: UUID): Promise<Visit[]> {
    const result = await this.db.query(
      `SELECT * FROM visits WHERE user_id = ? AND customer_id = ?
       ORDER BY visited_at DESC`,
      [this.userId, customerId]
    )
    return (result.values as Visit[]) ?? []
  }

  /** Customer visits with service and paid totals for history screens. */
  async findSummariesByCustomer(customerId: UUID): Promise<VisitSummary[]> {
    const result = await this.db.query(
      `SELECT v.*,
              c.name AS customer_name,
              COALESCE((
                SELECT SUM(vs.line_total) FROM visit_services vs
                WHERE vs.visit_id = v.id AND vs.user_id = v.user_id
              ), 0) AS service_total,
              COALESCE((
                SELECT SUM(p.amount) FROM payments p
                WHERE p.visit_id = v.id AND p.user_id = v.user_id
              ), 0) AS paid_total
       FROM visits v
       LEFT JOIN customers c ON c.id = v.customer_id AND c.user_id = v.user_id
       WHERE v.user_id = ? AND v.customer_id = ?
       ORDER BY v.visited_at DESC`,
      [this.userId, customerId]
    )
    return (result.values as VisitSummary[]) ?? []
  }

  async findByDateRange(startISO: string, endISO: string): Promise<Visit[]> {
    const result = await this.db.query(
      `SELECT * FROM visits
       WHERE user_id = ? AND visited_at >= ? AND visited_at < ?
       ORDER BY visited_at DESC`,
      [this.userId, startISO, endISO]
    )
    return (result.values as Visit[]) ?? []
  }

  async findByDay(dateISO: string): Promise<Visit[]> {
    const { start, end } = localDayRange(dateISO)
    return this.findByDateRange(start, end)
  }

  /** Day visits with customer name, service total and paid total for lists. */
  async findSummariesByDay(dateISO: string): Promise<VisitSummary[]> {
    const { start, end } = localDayRange(dateISO)
    const result = await this.db.query(
      `SELECT v.*,
              c.name AS customer_name,
              COALESCE((
                SELECT SUM(vs.line_total) FROM visit_services vs
                WHERE vs.visit_id = v.id AND vs.user_id = v.user_id
              ), 0) AS service_total,
              COALESCE((
                SELECT SUM(p.amount) FROM payments p
                WHERE p.visit_id = v.id AND p.user_id = v.user_id
              ), 0) AS paid_total
       FROM visits v
       LEFT JOIN customers c ON c.id = v.customer_id AND c.user_id = v.user_id
       WHERE v.user_id = ? AND v.visited_at >= ? AND v.visited_at < ?
       ORDER BY v.visited_at DESC`,
      [this.userId, start, end]
    )
    return (result.values as VisitSummary[]) ?? []
  }

  async getServicesForVisit(visitId: UUID): Promise<VisitService[]> {
    const result = await this.db.query(
      `SELECT * FROM visit_services WHERE visit_id = ? AND user_id = ?`,
      [visitId, this.userId]
    )
    return (result.values as VisitService[]) ?? []
  }

  async getPaymentsForVisit(visitId: UUID): Promise<Payment[]> {
    const result = await this.db.query(
      `SELECT * FROM payments WHERE visit_id = ? AND user_id = ?
       ORDER BY paid_at ASC`,
      [visitId, this.userId]
    )
    return (result.values as Payment[]) ?? []
  }

  async getPaymentsByDateRange(startISO: string, endISO: string): Promise<Payment[]> {
    const result = await this.db.query(
      `SELECT * FROM payments
       WHERE user_id = ? AND paid_at >= ? AND paid_at < ?
       ORDER BY paid_at DESC`,
      [this.userId, startISO, endISO]
    )
    return (result.values as Payment[]) ?? []
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  async create(input: CreateVisitInput): Promise<Visit> {
    const now = nowISO()
    const clientOpId = generateUUID()
    const visit: Visit = {
      id: generateUUID(),
      user_id: this.userId,
      customer_id: input.customer_id ?? null,
      appointment_id: input.appointment_id ?? null,
      is_quick_sale: input.is_quick_sale ?? false,
      visited_at: input.visited_at ?? now,
      notes: input.notes?.trim() ?? null,
      created_at: now,
      updated_at: now,
    }

    const services: VisitService[] = input.services.map(svc => {
      const quantity = svc.quantity ?? 1
      const unitPrice = tomanToStorage(svc.unit_price)
      const discount = tomanToStorage(svc.discount_amount ?? 0)
      return {
        id: generateUUID(),
        user_id: this.userId,
        visit_id: visit.id,
        service_id: svc.service_id ?? null,
        service_name_snapshot: svc.service_name_snapshot,
        quantity,
        unit_price: unitPrice,
        discount_amount: discount,
        line_total: quantity * unitPrice - discount,
        duration_minutes: svc.duration_minutes ?? null,
        created_at: now,
        updated_at: now,
      }
    })

    const serviceTotal = services.reduce((sum, svc) => sum + svc.line_total, 0)
    const initialPayment: Payment | null = input.payment
      ? {
          id: generateUUID(),
          user_id: this.userId,
          visit_id: visit.id,
          amount: tomanToStorage(input.payment.amount),
          method: input.payment.method,
          paid_at: visit.visited_at,
          note: input.payment.note?.trim() ?? null,
          created_at: now,
          updated_at: now,
        }
      : null

    if (initialPayment && initialPayment.amount > serviceTotal) {
      throw new OverpaymentError(serviceTotal)
    }

    await withTransaction(this.db, async () => {
      await this.db.run(
        `INSERT INTO visits
          (id, user_id, customer_id, appointment_id, is_quick_sale, visited_at, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          visit.id,
          visit.user_id,
          visit.customer_id,
          visit.appointment_id,
          visit.is_quick_sale ? 1 : 0,
          visit.visited_at,
          visit.notes,
          visit.created_at,
          visit.updated_at,
        ]
      )

      for (const svc of services) {
        await this.db.run(
          `INSERT INTO visit_services
            (id, user_id, visit_id, service_id, service_name_snapshot,
             quantity, unit_price, discount_amount, line_total, duration_minutes,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            svc.id,
            svc.user_id,
            svc.visit_id,
            svc.service_id,
            svc.service_name_snapshot,
            svc.quantity,
            svc.unit_price,
            svc.discount_amount,
            svc.line_total,
            svc.duration_minutes,
            svc.created_at,
            svc.updated_at,
          ]
        )
      }

      await addToOutbox(this.db, {
        user_id: this.userId,
        entity_type: 'visits',
        entity_id: visit.id,
        operation: 'insert',
        payload: JSON.stringify(visit),
        client_op_id: clientOpId,
      })

      for (const svc of services) {
        await addToOutbox(this.db, {
          user_id: this.userId,
          entity_type: 'visit_services',
          entity_id: svc.id,
          operation: 'insert',
          payload: JSON.stringify(svc),
          client_op_id: `${clientOpId}:${svc.id}`,
        })
      }

      if (initialPayment) {
        await this.db.run(
          `INSERT INTO payments
            (id, user_id, visit_id, amount, method, paid_at, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            initialPayment.id,
            initialPayment.user_id,
            initialPayment.visit_id,
            initialPayment.amount,
            initialPayment.method,
            initialPayment.paid_at,
            initialPayment.note,
            initialPayment.created_at,
            initialPayment.updated_at,
          ]
        )

        await addToOutbox(this.db, {
          user_id: this.userId,
          entity_type: 'payments',
          entity_id: initialPayment.id,
          operation: 'insert',
          payload: JSON.stringify(initialPayment),
          client_op_id: `${clientOpId}:pay:${initialPayment.id}`,
        })
      }
    })

    return visit
  }

  async addPayment(input: AddPaymentInput): Promise<Payment> {
    const now = nowISO()
    const payment: Payment = {
      id: generateUUID(),
      user_id: this.userId,
      visit_id: input.visit_id,
      amount: tomanToStorage(input.amount),
      method: input.method,
      paid_at: input.paid_at ?? now,
      note: input.note?.trim() ?? null,
      created_at: now,
      updated_at: now,
    }

    await withTransaction(this.db, async () => {
      const visitResult = await this.db.query(
        `SELECT id FROM visits WHERE id = ? AND user_id = ? LIMIT 1`,
        [payment.visit_id, this.userId]
      )
      if (!visitResult.values?.length) {
        throw new Error('Visit not found')
      }

      const totals = await this.db.query(
        `SELECT
           COALESCE((SELECT SUM(line_total) FROM visit_services
             WHERE visit_id = ? AND user_id = ?), 0) AS service_total,
           COALESCE((SELECT SUM(amount) FROM payments
             WHERE visit_id = ? AND user_id = ?), 0) AS paid_total`,
        [payment.visit_id, this.userId, payment.visit_id, this.userId]
      )
      const row = totals.values?.[0] as { service_total: number; paid_total: number } | undefined
      const remaining = (row?.service_total ?? 0) - (row?.paid_total ?? 0)

      if (payment.amount > remaining) {
        throw new OverpaymentError(remaining)
      }

      await this.db.run(
        `INSERT INTO payments
          (id, user_id, visit_id, amount, method, paid_at, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payment.id,
          payment.user_id,
          payment.visit_id,
          payment.amount,
          payment.method,
          payment.paid_at,
          payment.note,
          payment.created_at,
          payment.updated_at,
        ]
      )

      await addToOutbox(this.db, {
        user_id: this.userId,
        entity_type: 'payments',
        entity_id: payment.id,
        operation: 'insert',
        payload: JSON.stringify(payment),
      })
    })

    return payment
  }

  async countByDay(dateISO: string): Promise<number> {
    const { start, end } = localDayRange(dateISO)
    const result = await this.db.query(
      `SELECT COUNT(*) as cnt FROM visits
       WHERE user_id = ? AND visited_at >= ? AND visited_at < ?`,
      [this.userId, start, end]
    )
    return (result.values?.[0] as { cnt: number })?.cnt ?? 0
  }
}
