import { describe, it, expect, beforeEach } from 'vitest'
import { AppointmentRepository } from '@database/repositories/appointment.repository'
import { VisitRepository } from '@database/repositories/visit.repository'
import { CustomerRepository } from '@database/repositories/customer.repository'
import { FinanceRepository } from '@features/finance/finance.repository'
import { completeAppointment } from '@features/appointments/complete-appointment'
import { localDateISO } from '@shared/utils/datetime'
import { createTestDb, type TestDb } from '../helpers/sqlite-harness'

const USER_ID = 'user-complete-001'

describe('completeAppointment', () => {
  let harness: TestDb
  let appointments: AppointmentRepository
  let visits: VisitRepository
  let finance: FinanceRepository
  let customerId: string

  beforeEach(async () => {
    harness = createTestDb()
    appointments = new AppointmentRepository(harness.db, USER_ID)
    visits = new VisitRepository(harness.db, USER_ID)
    finance = new FinanceRepository(harness.db, USER_ID)
    const customers = new CustomerRepository(harness.db, USER_ID)
    customerId = (await customers.create({ name: 'علی' })).id
  })

  const createAppointment = () =>
    appointments.create({
      customer_id: customerId,
      title: 'کوتاهی',
      start_at: '2026-01-15T09:00:00.000Z',
      duration_minutes: 60,
      services: [
        { service_name_snapshot: 'کوتاهی', price: 150_000 },
        { service_name_snapshot: 'ریش', price: 80_000 },
      ],
    })

  it('ویزیت، خدمات و پرداخت کامل را می‌نویسد و وضعیت را completed می‌کند', async () => {
    const appt = await createAppointment()

    await completeAppointment({ appointments, visits }, appt.id)

    expect(harness.countRows('visits')).toBe(1)
    expect(harness.countRows('visit_services')).toBe(2)
    expect(harness.countRows('payments')).toBe(1)

    const visit = harness.rows<{ id: string; appointment_id: string; customer_id: string }>(
      'visits'
    )[0]
    expect(visit.appointment_id).toBe(appt.id)
    expect(visit.customer_id).toBe(customerId)

    const payment = harness.rows<{ visit_id: string; amount: number; method: string }>(
      'payments'
    )[0]
    expect(payment.visit_id).toBe(visit.id)
    expect(payment.amount).toBe(23_000_000) // 230,000 Toman × 100
    expect(payment.method).toBe('cash')

    const row = harness.rows<{ id: string; status: string }>('appointments')[0]
    expect(row.status).toBe('completed')
  })

  it('دفعه دوم ویزیت یا پرداخت تکراری نمی‌سازد', async () => {
    const appt = await createAppointment()
    await completeAppointment({ appointments, visits }, appt.id)

    // وضعیت را برمی‌گردانیم تا همان مسیر دوباره اجرا شود (شبیه تلاش مجدد پس از خطا)
    await appointments.updateStatus(appt.id, 'confirmed')
    await completeAppointment({ appointments, visits }, appt.id)

    expect(harness.countRows('visits')).toBe(1)
    expect(harness.countRows('visit_services')).toBe(2)
    expect(harness.countRows('payments')).toBe(1)

    const row = harness.rows<{ status: string }>('appointments')[0]
    expect(row.status).toBe('completed')
  })

  it('نوبت بدون خدمت ویزیت نمی‌سازد ولی وضعیت را تکمیل می‌کند', async () => {
    const appt = await appointments.create({
      title: 'نوبت خالی',
      start_at: '2026-01-15T09:00:00.000Z',
      duration_minutes: 30,
      services: [],
    })

    await completeAppointment({ appointments, visits }, appt.id)

    expect(harness.countRows('visits')).toBe(0)
    expect(harness.countRows('payments')).toBe(0)
    expect(harness.rows<{ status: string }>('appointments')[0].status).toBe('completed')
  })

  it('خدمات رایگان ویزیت می‌سازد ولی پرداخت ثبت نمی‌کند', async () => {
    const appt = await appointments.create({
      title: 'مشاوره',
      start_at: '2026-01-15T09:00:00.000Z',
      duration_minutes: 15,
      services: [{ service_name_snapshot: 'مشاوره', price: 0 }],
    })

    await completeAppointment({ appointments, visits }, appt.id)

    expect(harness.countRows('visits')).toBe(1)
    expect(harness.countRows('visit_services')).toBe(1)
    expect(harness.countRows('payments')).toBe(0)
  })

  it('درآمد در گزارش روزانه دارایی دیده می‌شود', async () => {
    const appt = await createAppointment()
    await completeAppointment({ appointments, visits }, appt.id)

    const report = await finance.getDailyReport(localDateISO())

    expect(report.visit_count).toBe(1)
    expect(report.service_count).toBe(2)
    expect(report.total_service_amount).toBe(23_000_000)
    expect(report.total_received).toBe(23_000_000)
    expect(report.total_debt).toBe(0)
    expect(report.net_after_expenses).toBe(23_000_000)
  })

  it('نوبت ناموجود خطا می‌دهد و چیزی نمی‌نویسد', async () => {
    await expect(
      completeAppointment({ appointments, visits }, 'missing-appointment')
    ).rejects.toThrow('Appointment not found')

    expect(harness.countRows('visits')).toBe(0)
  })
})
