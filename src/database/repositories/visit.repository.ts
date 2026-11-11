import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { Visit, VisitService, Payment, UUID, PaymentMethod } from '@shared/types'
import { generateUUID, nowISO, tomanToStorage } from '@shared/utils/helpers'
import { addToOutbox } from '@sync/outbox/outbox.repository'

// ── Input types ───────────────────────────────────────────────────────────────

export interface VisitServiceInput {
  service_id?: string | null
  service_name_snapshot: string
  quantity?: number
  unit_price: number         // Toman (display)
  discount_amount?: number   // Toman (display)
  duration_minutes?: number | null
}

export interface CreateVisitInput {
  customer_id?: string | null
  appointment_id?: string | null
  is_quick_sale?: boolean
  visited_at?: string            // ISO-8601; defaults to now
  notes?: string | null
  services: VisitServiceInput[]
}

export interface AddPaymentInput {
  visit_id: UUID
  amount: number          // Toman (display)
  method: PaymentMethod
  paid_at?: string        // ISO-8601; defaults to now
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

  async findByDateRange(startISO: string, endISO: string): Promise<Visit[]> {
    const result = await this.db.query(
      `SELECT * FROM visits
       WHERE user_id = ? AND visited_at >= ? AND visited_at <= ?
       ORDER BY visited_at DESC`,
      [this.userId, startISO, endISO]
    )
    return (result.values as Visit[]) ?? []
  }

  async findByDay(dateISO: string): Promise<Visit[]> {
    return this.findByDateRange(
      `${dateISO}T00:00:00.000Z`,
      `${dateISO}T23:59:59.999Z`
    )
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
       WHERE user_id = ? AND paid_at >= ? AND paid_at <= ?
       ORDER BY paid_at DESC`,
      [this.userId, startISO, endISO]
    )
    return (result.values as Payment[]) ?? []
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  async create(input: CreateVisitInput): Promise<Visit> {
    const now = nowISO()
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

    await this.db.run(
      `INSERT INTO visits
        (id, user_id, customer_id, appointment_id, is_quick_sale, visited_at, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        visit.id, visit.user_id, visit.customer_id, visit.appointment_id,
        visit.is_quick_sale ? 1 : 0,
        visit.visited_at, visit.notes, visit.created_at, visit.updated_at,
      ]
    )

    // Insert visit services
    for (const svc of input.services) {
      const qty = svc.quantity ?? 1
      const unitPrice = tomanToStorage(svc.unit_price)
      const discount = tomanToStorage(svc.discount_amount ?? 0)
      const lineTotal = qty * unitPrice - discount

      await this.db.run(
        `INSERT INTO visit_services
          (id, user_id, visit_id, service_id, service_name_snapshot,
           quantity, unit_price, discount_amount, line_total, duration_minutes,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateUUID(), this.userId, visit.id,
          svc.service_id ?? null, svc.service_name_snapshot,
          qty, unitPrice, discount, lineTotal,
          svc.duration_minutes ?? null,
          now, now,
        ]
      )
    }

    await addToOutbox(this.db, {
      entity_type: 'visits',
      entity_id: visit.id,
      operation: 'insert',
      payload: JSON.stringify(visit),
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

    await this.db.run(
      `INSERT INTO payments
        (id, user_id, visit_id, amount, method, paid_at, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payment.id, payment.user_id, payment.visit_id,
        payment.amount, payment.method, payment.paid_at,
        payment.note, payment.created_at, payment.updated_at,
      ]
    )

    await addToOutbox(this.db, {
      entity_type: 'payments',
      entity_id: payment.id,
      operation: 'insert',
      payload: JSON.stringify(payment),
    })

    return payment
  }

  async countByDay(dateISO: string): Promise<number> {
    const result = await this.db.query(
      `SELECT COUNT(*) as cnt FROM visits
       WHERE user_id = ? AND visited_at >= ? AND visited_at <= ?`,
      [this.userId, `${dateISO}T00:00:00.000Z`, `${dateISO}T23:59:59.999Z`]
    )
    return (result.values?.[0] as { cnt: number })?.cnt ?? 0
  }
}
