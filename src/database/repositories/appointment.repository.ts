import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { Appointment, AppointmentService, AppointmentStatus, UUID } from '@shared/types'
import {
  generateUUID,
  nowISO,
  calcEndAt,
  appointmentsOverlap,
  tomanToStorage,
} from '@shared/utils/helpers'
import { addToOutbox } from '@sync/outbox/outbox.repository'
import { withTransaction } from '@database/sqlite/transaction'
import { localDayRange, localWeekRange } from '@shared/utils/datetime'

// ── Input types ───────────────────────────────────────────────────────────────

export interface AppointmentServiceInput {
  service_id?: string | null
  service_name_snapshot: string
  price: number // Toman (display)
  duration_minutes?: number | null
}

export interface CreateAppointmentInput {
  customer_id?: string | null
  title: string
  start_at: string // ISO-8601
  duration_minutes: number
  notes?: string | null
  services: AppointmentServiceInput[]
}

export interface UpdateAppointmentInput {
  customer_id?: string | null
  title?: string
  start_at?: string
  duration_minutes?: number
  notes?: string | null
  status?: AppointmentStatus
  /** When provided, replaces all service lines atomically. */
  services?: AppointmentServiceInput[]
}

/** Thrown when an insert/update would overlap another appointment. */
export class AppointmentConflictError extends Error {
  constructor(readonly conflictingTitle: string) {
    super(`Appointment conflict: ${conflictingTitle}`)
    this.name = 'AppointmentConflictError'
  }
}

export interface ConflictResult {
  hasConflict: boolean
  conflictingAppointment?: Appointment
}

// ── Repository ────────────────────────────────────────────────────────────────

export class AppointmentRepository {
  constructor(
    private readonly db: SQLiteDBConnection,
    private readonly userId: UUID
  ) {}

  // ── Read ──────────────────────────────────────────────────────────────────

  async findById(id: UUID): Promise<Appointment | null> {
    const result = await this.db.query(
      `SELECT * FROM appointments WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1`,
      [id, this.userId]
    )
    return (result.values?.[0] as Appointment) ?? null
  }

  /** Appointments for a date range (ISO-8601 start/end of day) */
  async findByDateRange(startISO: string, endISO: string): Promise<Appointment[]> {
    const result = await this.db.query(
      `SELECT * FROM appointments
       WHERE user_id = ?
         AND deleted_at IS NULL
         AND status NOT IN ('cancelled', 'no_show')
         AND start_at >= ? AND start_at < ?
       ORDER BY start_at ASC`,
      [this.userId, startISO, endISO]
    )
    return (result.values as Appointment[]) ?? []
  }

  /** All non-cancelled appointments for a single local day */
  async findByDay(dateISO: string): Promise<Appointment[]> {
    const { start, end } = localDayRange(dateISO)
    return this.findByDateRange(start, end)
  }

  /** Appointments for the 7 local days starting at weekStartISO */
  async findByWeek(weekStartISO: string): Promise<Appointment[]> {
    const { start, end } = localWeekRange(weekStartISO)
    return this.findByDateRange(start, end)
  }

  async findServicesForAppointment(appointmentId: UUID): Promise<AppointmentService[]> {
    const result = await this.db.query(
      `SELECT * FROM appointment_services WHERE appointment_id = ? AND user_id = ?`,
      [appointmentId, this.userId]
    )
    return (result.values as AppointmentService[]) ?? []
  }

  // ── Conflict detection ────────────────────────────────────────────────────

  /**
   * Returns true if placing an appointment at [start_at, end_at) conflicts
   * with an existing non-cancelled appointment of the same user.
   * excludeId can be passed when editing an existing appointment.
   */
  async checkConflict(startAt: string, endAt: string, excludeId?: UUID): Promise<ConflictResult> {
    // Fetch appointments that could overlap: those starting before our end
    // and potentially ending after our start
    const result = await this.db.query(
      `SELECT * FROM appointments
       WHERE user_id = ?
         AND deleted_at IS NULL
         AND status NOT IN ('cancelled', 'no_show')
         AND id != ?
         AND start_at < ?
         AND end_at > ?`,
      [this.userId, excludeId ?? '', endAt, startAt]
    )
    const candidates = (result.values as Appointment[]) ?? []

    for (const candidate of candidates) {
      if (appointmentsOverlap({ start_at: startAt, end_at: endAt }, candidate)) {
        return { hasConflict: true, conflictingAppointment: candidate }
      }
    }
    return { hasConflict: false }
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  async create(input: CreateAppointmentInput): Promise<Appointment> {
    const now = nowISO()
    const endAt = calcEndAt(input.start_at, input.duration_minutes)
    const clientOpId = generateUUID()

    const appointment: Appointment = {
      id: generateUUID(),
      user_id: this.userId,
      customer_id: input.customer_id ?? null,
      title: input.title.trim(),
      start_at: input.start_at,
      duration_minutes: input.duration_minutes,
      end_at: endAt,
      status: 'reserved',
      notes: input.notes?.trim() ?? null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }

    const services: AppointmentService[] = input.services.map(svc => ({
      id: generateUUID(),
      user_id: this.userId,
      appointment_id: appointment.id,
      service_id: svc.service_id ?? null,
      service_name_snapshot: svc.service_name_snapshot,
      price: tomanToStorage(svc.price),
      duration_minutes: svc.duration_minutes ?? null,
      created_at: now,
      updated_at: now,
    }))

    await withTransaction(this.db, async () => {
      // Check and insert inside the same transaction so two concurrent
      // bookings cannot both pass the check.
      const conflict = await this.checkConflict(appointment.start_at, appointment.end_at)
      if (conflict.hasConflict) {
        throw new AppointmentConflictError(conflict.conflictingAppointment?.title ?? '')
      }

      await this.db.run(
        `INSERT INTO appointments
          (id, user_id, customer_id, title, start_at, duration_minutes, end_at, status, notes, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          appointment.id,
          appointment.user_id,
          appointment.customer_id,
          appointment.title,
          appointment.start_at,
          appointment.duration_minutes,
          appointment.end_at,
          appointment.status,
          appointment.notes,
          appointment.created_at,
          appointment.updated_at,
        ]
      )

      for (const svc of services) {
        await this.db.run(
          `INSERT INTO appointment_services
            (id, user_id, appointment_id, service_id, service_name_snapshot, price, duration_minutes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            svc.id,
            svc.user_id,
            svc.appointment_id,
            svc.service_id,
            svc.service_name_snapshot,
            svc.price,
            svc.duration_minutes,
            svc.created_at,
            svc.updated_at,
          ]
        )
      }

      await addToOutbox(this.db, {
        entity_type: 'appointments',
        entity_id: appointment.id,
        operation: 'insert',
        payload: JSON.stringify(appointment),
        client_op_id: clientOpId,
      })

      // One outbox row per child row, so each service is synced independently.
      for (const svc of services) {
        await addToOutbox(this.db, {
          entity_type: 'appointment_services',
          entity_id: svc.id,
          operation: 'insert',
          payload: JSON.stringify(svc),
          client_op_id: `${clientOpId}:${svc.id}`,
        })
      }
    })

    return appointment
  }

  async updateStatus(id: UUID, status: AppointmentStatus): Promise<void> {
    const now = nowISO()
    await withTransaction(this.db, async () => {
      await this.db.run(
        `UPDATE appointments SET status = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
        [status, now, id, this.userId]
      )
      await addToOutbox(this.db, {
        entity_type: 'appointments',
        entity_id: id,
        operation: 'update',
        payload: JSON.stringify({ id, status, updated_at: now }),
      })
    })
  }

  async update(id: UUID, input: UpdateAppointmentInput): Promise<Appointment | null> {
    const existing = await this.findById(id)
    if (!existing) return null

    const now = nowISO()
    const newStartAt = input.start_at ?? existing.start_at
    const newDuration = input.duration_minutes ?? existing.duration_minutes
    const newEndAt = calcEndAt(newStartAt, newDuration)
    const clientOpId = generateUUID()

    const updated: Appointment = {
      ...existing,
      customer_id: input.customer_id !== undefined ? input.customer_id : existing.customer_id,
      title: input.title?.trim() ?? existing.title,
      start_at: newStartAt,
      duration_minutes: newDuration,
      end_at: newEndAt,
      status: input.status ?? existing.status,
      notes: input.notes !== undefined ? (input.notes?.trim() ?? null) : existing.notes,
      updated_at: now,
    }

    const newServices: AppointmentService[] | null =
      input.services?.map(svc => ({
        id: generateUUID(),
        user_id: this.userId,
        appointment_id: id,
        service_id: svc.service_id ?? null,
        service_name_snapshot: svc.service_name_snapshot,
        price: tomanToStorage(svc.price),
        duration_minutes: svc.duration_minutes ?? null,
        created_at: now,
        updated_at: now,
      })) ?? null

    await withTransaction(this.db, async () => {
      // Re-check inside the transaction; the row is excluded from the query.
      const conflict = await this.checkConflict(updated.start_at, updated.end_at, id)
      if (conflict.hasConflict) {
        throw new AppointmentConflictError(conflict.conflictingAppointment?.title ?? '')
      }

      await this.db.run(
        `UPDATE appointments
         SET customer_id = ?, title = ?, start_at = ?, duration_minutes = ?, end_at = ?,
             status = ?, notes = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [
          updated.customer_id,
          updated.title,
          updated.start_at,
          updated.duration_minutes,
          updated.end_at,
          updated.status,
          updated.notes,
          updated.updated_at,
          id,
          this.userId,
        ]
      )

      await addToOutbox(this.db, {
        entity_type: 'appointments',
        entity_id: id,
        operation: 'update',
        payload: JSON.stringify(updated),
        client_op_id: clientOpId,
      })

      if (newServices) {
        const previous = await this.findServicesForAppointment(id)

        for (const old of previous) {
          await this.db.run(`DELETE FROM appointment_services WHERE id = ? AND user_id = ?`, [
            old.id,
            this.userId,
          ])
          await addToOutbox(this.db, {
            entity_type: 'appointment_services',
            entity_id: old.id,
            operation: 'delete',
            payload: JSON.stringify(old),
            client_op_id: `${clientOpId}:del:${old.id}`,
          })
        }

        for (const svc of newServices) {
          await this.db.run(
            `INSERT INTO appointment_services
              (id, user_id, appointment_id, service_id, service_name_snapshot, price, duration_minutes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              svc.id,
              svc.user_id,
              svc.appointment_id,
              svc.service_id,
              svc.service_name_snapshot,
              svc.price,
              svc.duration_minutes,
              svc.created_at,
              svc.updated_at,
            ]
          )
          await addToOutbox(this.db, {
            entity_type: 'appointment_services',
            entity_id: svc.id,
            operation: 'insert',
            payload: JSON.stringify(svc),
            client_op_id: `${clientOpId}:${svc.id}`,
          })
        }
      }
    })

    return updated
  }

  async softDelete(id: UUID): Promise<void> {
    const now = nowISO()
    await withTransaction(this.db, async () => {
      await this.db.run(
        `UPDATE appointments SET deleted_at = ?, updated_at = ?, status = 'cancelled'
         WHERE id = ? AND user_id = ?`,
        [now, now, id, this.userId]
      )
      await addToOutbox(this.db, {
        entity_type: 'appointments',
        entity_id: id,
        operation: 'delete',
        payload: JSON.stringify({ id, deleted_at: now }),
      })
    })
  }

  /** Count appointments in the given local day */
  async countToday(todayISO: string): Promise<number> {
    const { start, end } = localDayRange(todayISO)
    const result = await this.db.query(
      `SELECT COUNT(*) as cnt FROM appointments
       WHERE user_id = ? AND deleted_at IS NULL
         AND status NOT IN ('cancelled','no_show')
         AND start_at >= ? AND start_at < ?`,
      [this.userId, start, end]
    )
    return (result.values?.[0] as { cnt: number })?.cnt ?? 0
  }

  /** Next upcoming appointment from now */
  async findNext(): Promise<Appointment | null> {
    const now = nowISO()
    const result = await this.db.query(
      `SELECT * FROM appointments
       WHERE user_id = ? AND deleted_at IS NULL
         AND status IN ('reserved','confirmed')
         AND start_at >= ?
       ORDER BY start_at ASC
       LIMIT 1`,
      [this.userId, now]
    )
    return (result.values?.[0] as Appointment) ?? null
  }
}
