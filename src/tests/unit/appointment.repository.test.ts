import { describe, it, expect, beforeEach } from 'vitest'
import { AppointmentRepository } from '@database/repositories/appointment.repository'
import { withTransaction } from '@database/sqlite/transaction'
import { createTestDb, type TestDb } from '../helpers/sqlite-harness'

const USER_ID = 'user-appt-001'

const makeInput = (overrides: Partial<Parameters<AppointmentRepository['create']>[0]> = {}) => ({
  title: 'کوتاهی',
  start_at: '2026-01-15T09:00:00.000Z',
  duration_minutes: 60,
  services: [{ service_name_snapshot: 'کوتاهی', price: 150000 }],
  ...overrides,
})

describe('AppointmentRepository', () => {
  let harness: TestDb
  let repo: AppointmentRepository

  beforeEach(() => {
    harness = createTestDb()
    repo = new AppointmentRepository(harness.db, USER_ID)
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
      const appt = await repo.create(
        makeInput({
          start_at: '2026-01-15T09:00:00.000Z',
          duration_minutes: 90,
        })
      )
      const diff = new Date(appt.end_at).getTime() - new Date(appt.start_at).getTime()
      expect(diff).toBe(90 * 60 * 1000)
    })

    it('خدمات نوبت در جدول appointment_services ذخیره می‌شوند', async () => {
      const appt = await repo.create(
        makeInput({
          services: [
            { service_name_snapshot: 'کوتاهی', price: 150000 },
            { service_name_snapshot: 'ریش', price: 80000 },
          ],
        })
      )
      const svcs = harness.rows<{ appointment_id: string }>('appointment_services')
      expect(svcs.filter(r => r.appointment_id === appt.id)).toHaveLength(2)
    })

    it('برای هر ردیف فرزند یک رکورد outbox جدا ثبت می‌شود', async () => {
      await repo.create(
        makeInput({
          services: [
            { service_name_snapshot: 'کوتاهی', price: 150000 },
            { service_name_snapshot: 'ریش', price: 80000 },
            { service_name_snapshot: 'اصلاح', price: 50000 },
          ],
        })
      )

      expect(harness.countRows('appointments')).toBe(1)
      expect(harness.countRows('appointment_services')).toBe(3)
      expect(harness.countRows('sync_outbox')).toBe(4)

      const outbox = harness.outboxRows()
      expect(outbox.filter(r => r.entity_type === 'appointments')).toHaveLength(1)
      expect(outbox.filter(r => r.entity_type === 'appointment_services')).toHaveLength(3)
      // Every row carries its own idempotency key
      expect(new Set(outbox.map(r => r.client_op_id)).size).toBe(4)
    })

    it('اگر هر نوشتن با خطا مواجه شود، هیچ ردیفی باقی نمی‌ماند', async () => {
      // 1 appointment + 3 services + 4 outbox rows
      for (let failOn = 1; failOn <= 8; failOn += 1) {
        const failing = createTestDb({ failOnRun: failOn })
        const failingRepo = new AppointmentRepository(failing.db, USER_ID)

        await expect(
          failingRepo.create(
            makeInput({
              services: [
                { service_name_snapshot: 'کوتاهی', price: 150000 },
                { service_name_snapshot: 'ریش', price: 80000 },
                { service_name_snapshot: 'اصلاح', price: 50000 },
              ],
            })
          )
        ).rejects.toThrow('injected failure')

        expect(failing.countRows('appointments')).toBe(0)
        expect(failing.countRows('appointment_services')).toBe(0)
        expect(failing.countRows('sync_outbox')).toBe(0)
      }
    })
  })

  describe('checkConflict', () => {
    it('تداخل واقعی تشخیص داده می‌شود', async () => {
      await repo.create(
        makeInput({
          start_at: '2026-01-15T09:00:00.000Z',
          duration_minutes: 60,
        })
      )

      const { hasConflict } = await repo.checkConflict(
        '2026-01-15T09:30:00.000Z',
        '2026-01-15T10:30:00.000Z'
      )
      expect(hasConflict).toBe(true)
    })

    it('نوبت‌های متوالی تداخل ندارند', async () => {
      await repo.create(
        makeInput({
          start_at: '2026-01-15T09:00:00.000Z',
          duration_minutes: 60,
        })
      )

      const { hasConflict } = await repo.checkConflict(
        '2026-01-15T10:00:00.000Z',
        '2026-01-15T11:00:00.000Z'
      )
      expect(hasConflict).toBe(false)
    })

    it('نوبت لغو‌شده در بررسی تداخل لحاظ نمی‌شود', async () => {
      const appt = await repo.create(
        makeInput({
          start_at: '2026-01-15T09:00:00.000Z',
          duration_minutes: 60,
        })
      )
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
      const row = harness
        .rows<{ id: string; status: string }>('appointments')
        .find(r => r.id === appt.id)
      expect(row?.status).toBe('confirmed')
    })
  })

  describe('softDelete', () => {
    it('نوبت را soft delete می‌کند', async () => {
      const appt = await repo.create(makeInput())
      await repo.softDelete(appt.id)
      const row = harness
        .rows<{ id: string; deleted_at: string | null; status: string }>('appointments')
        .find(r => r.id === appt.id)
      expect(row?.deleted_at).not.toBeNull()
      expect(row?.status).toBe('cancelled')
    })
  })

  describe('withTransaction', () => {
    it('تراکنش تودرتو را رد می‌کند', async () => {
      await expect(
        withTransaction(harness.db, () => {
          return withTransaction(harness.db, () => Promise.resolve(undefined))
        })
      ).rejects.toThrow('Nested transactions are not supported')

      // Connection is still usable after a rejected nested attempt
      await expect(withTransaction(harness.db, () => Promise.resolve(42))).resolves.toBe(42)
    })
  })
})
