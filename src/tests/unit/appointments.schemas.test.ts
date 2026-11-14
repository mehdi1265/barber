import { describe, expect, it } from 'vitest'
import { appointmentSchema } from '@features/appointments/appointments.schemas'

const base = {
  customer_id: '',
  title: 'نوبت تست',
  date: '2026-01-15',
  time: '10:00',
  duration_minutes: '30',
  notes: '',
}

const line = {
  service_id: '',
  service_name_snapshot: 'کوتاهی',
  price: '100000',
  duration_minutes: '30',
}

describe('appointmentSchema', () => {
  it('نوبت معتبر را می‌پذیرد', () => {
    const result = appointmentSchema.safeParse({ ...base, services: [line] })
    expect(result.success).toBe(true)
  })

  it('بیش از ۵۰ خدمت را رد می‌کند', () => {
    const result = appointmentSchema.safeParse({
      ...base,
      services: Array.from({ length: 51 }, () => line),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('حداکثر ۵۰ خدمت مجاز است')
    }
  })

  it('برای آرایه بسیار بزرگ، تعداد خطاها را محدود نگه می‌دارد', () => {
    const result = appointmentSchema.safeParse({
      ...base,
      services: Array.from({ length: 5_000 }, () => line),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      // GHSA-mrhx-c7xc-m3w5: unbounded per-element issues can exhaust memory.
      expect(result.error.issues.length).toBeLessThanOrEqual(2)
      expect(result.error.issues[0].message).toBe('حداکثر ۵۰ خدمت مجاز است')
    }
  })
})
