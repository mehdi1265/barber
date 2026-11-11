import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AppointmentRepository } from '@database/repositories/appointment.repository'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'

type Row = Record<string, unknown>

function createMockDb() {
  const tables: Record<string, Row[]> = {
    appointments: [],
    appointment_services: [],
    sync_outbox: [],
  }

  const db = {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      const s = sql.toLowerCase()

      if (s.includes('from appointments')) {
        const uid = params[0] as string

        // findById
        if (s.includes('where id = ?')) {
          const [id, userId] = params as string[]
          const row = tables.appointments.find(
            r => r.id === id && r.user_id === userId && !r.deleted_at
          )
          return { values: row ? [row] : [] }
        }

        // countToday
        if (s.includes('count(*)')) {
          const cnt = tables.appointments.filter(
            r => r.user_id === uid && !r.deleted_at && r.status !== 'cancelled'
          ).length
          return { values: [{ cnt }] }
        }

        // findNext
        if (s.includes("status in ('reserved','confirmed')")) {
          const rows = tables.appointments
            .filter(r => r.user_id === uid && !r.deleted_at &&
              (r.status === 'reserved' || r.status === 'confirmed'))
            .sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)))
          return { values: rows.slice(0, 1) }
        }

        // conflict check: start_at < endAt AND end_at > startAt
        if (s.includes('start_at <') && s.includes('end_at >')) {
          const [userId2, _excludeId, _endAt, _startAt] = params as string[]
          const rows = tables.appointments.filter(
            r => r.user_id === userId2 && !r.deleted_at &&
              r.status !== 'cancelled' && r.status !== 'no_show' &&
              r.id !== _excludeId
          )
          return { values: rows }
        }

        // dateRange / day
        const rows = tables.appointments.filter(
          r => r.user_id === uid && !r.deleted_at && r.status !== 'cancelled'
        )
        return { values: rows }
      }

      if (s.includes('from appointment_services')) {
        const [apptId, uid] = params as string[]
        const rows = tables.appointment_services.filter(
          r => r.appointment_id === apptId && r.user_id === uid
        )
        return { values: rows }
      }

      return { values: [] }
    }),

    run: vi.fn(async (sql: string, params: unknown[]) => {
      const s = sql.toLowerCase()

      if (s.startsWith('insert into appointments')) {
        const [id, user_id, customer_id, title, start_at, duration_minutes, end_at, status, notes, created_at, updated_at] = params
        tables.appointments.push({ id, user_id, customer_id, title, start_at, duration_minutes, end_at, status, notes, created_at, updated_at, deleted_at: null })
      }

      if (s.startsWith('insert into appointment_services')) {
        const [id, user_id, appointment_id, service_id, service_name_snapshot, price, duration_minutes, created_at, updated_at] = params
        tables.appointment_services.push({ id, user_id, appointment_id, service_id, service_name_snapshot, price, duration_minutes, created_at, updated_at })
      }

      if (s.startsWith('update appointments')) {
        if (s.includes('deleted_at')) {
          const id = params[2] as string
          const row = tables.appointments.find(r => r.id === id)
          if (row) { row.deleted_at = params[0]; row.status = 'cancelled' }
        } else if (s.includes('status =')) {
          const [status, _updated, id] = params as string[]
          const row = tables.appointments.find(r => r.id === id)
          if (row) row.status = status
        }
      }

      if (s.startsWith('insert into sync_outbox')) {
        tables.sync_outbox.push({ id: params[0] })
      }
    }),

    _tables: tables,
  }

  return db as unknown as SQLiteDBConnection & { _tables: typeof tables }
}

const USER_ID = 'user-appt-001'
const makeInput = (overrides: Partial<Parameters<AppointmentRepository['create']>[0]> = {}) => ({
  title: 'کوتاهی',
  start_at: '2026-01-15T09:00:00.000Z',
  duration_minutes: 60,
  services: [{ service_name_snapshot: 'کوتاهی', price: 150000 }],
  ...overrides,
})

describe('AppointmentRepository', () => {
  let db: ReturnType<typeof createMockDb>
  let repo: AppointmentRepository

  beforeEach(() => {
    db = createMockDb()
    repo = new AppointmentRepository(db as unknown as SQLiteDBConnection, USER_ID)
  })

  describe('create', () => {
    it('نوبت جدید ایجاد می‌کند', async () => {
      const appt = await repo.create(makeInput())
      expect(appt.title).toBe('کوتاهی')
      expect(appt.status).toBe('reserved')
      expect(appt.duration_minutes).toBe(60)
      expect(appt.user_id).toBe(USER_ID)
    })

    it('end_at از start_at + duration محاسبه می‌شود', async () => {
      const appt = await repo.create(makeInput({
        start_at: '2026-01-15T09:00:00.000Z',
        duration_minutes: 90,
      }))
      const diff = new Date(appt.end_at).getTime() - new Date(appt.start_at).getTime()
      expect(diff).toBe(90 * 60 * 1000)
    })

    it('خدمات نوبت در جدول appointment_services ذخیره می‌شوند', async () => {
      const appt = await repo.create(makeInput({
        services: [
          { service_name_snapshot: 'کوتاهی', price: 150000 },
          { service_name_snapshot: 'ریش', price: 80000 },
        ],
      }))
      const svcs = db._tables.appointment_services.filter(r => r.appointment_id === appt.id)
      expect(svcs).toHaveLength(2)
    })

    it('outbox رکورد ثبت می‌کند', async () => {
      await repo.create(makeInput())
      expect(db._tables.sync_outbox.length).toBeGreaterThan(0)
    })
  })

  describe('checkConflict', () => {
    it('تداخل واقعی تشخیص داده می‌شود', async () => {
      // Create appointment 09:00–10:00
      await repo.create(makeInput({
        start_at: '2026-01-15T09:00:00.000Z',
        duration_minutes: 60,
      }))

      // Check 09:30–10:30 → should conflict
      const { hasConflict } = await repo.checkConflict(
        '2026-01-15T09:30:00.000Z',
        '2026-01-15T10:30:00.000Z'
      )
      expect(hasConflict).toBe(true)
    })

    it('نوبت‌های متوالی تداخل ندارند', async () => {
      await repo.create(makeInput({
        start_at: '2026-01-15T09:00:00.000Z',
        duration_minutes: 60,
      }))

      // 10:00–11:00 — no overlap
      const { hasConflict } = await repo.checkConflict(
        '2026-01-15T10:00:00.000Z',
        '2026-01-15T11:00:00.000Z'
      )
      expect(hasConflict).toBe(false)
    })

    it('نوبت لغو‌شده در بررسی تداخل لحاظ نمی‌شود', async () => {
      const appt = await repo.create(makeInput({
        start_at: '2026-01-15T09:00:00.000Z',
        duration_minutes: 60,
      }))
      await repo.updateStatus(appt.id, 'cancelled')

      const { hasConflict } = await repo.checkConflict(
        '2026-01-15T09:30:00.000Z',
        '2026-01-15T10:30:00.000Z'
      )
      expect(hasConflict).toBe(false)
    })
  })

  describe('updateStatus', () => {
    it('وضعیت نوبت را تغییر می‌دهد', async () => {
      const appt = await repo.create(makeInput())
      await repo.updateStatus(appt.id, 'confirmed')
      const row = db._tables.appointments.find(r => r.id === appt.id)
      expect(row?.status).toBe('confirmed')
    })
  })

  describe('softDelete', () => {
    it('نوبت را soft delete می‌کند', async () => {
      const appt = await repo.create(makeInput())
      await repo.softDelete(appt.id)
      const row = db._tables.appointments.find(r => r.id === appt.id)
      expect(row?.deleted_at).not.toBeNull()
      expect(row?.status).toBe('cancelled')
    })
  })
})
