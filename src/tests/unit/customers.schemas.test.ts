import { describe, it, expect } from 'vitest'
import { customerSchema } from '@features/customers/customers.schemas'

describe('customerSchema', () => {
  it('نام معتبر قبول می‌شود', () => {
    const r = customerSchema.safeParse({ name: 'سارا محمدی' })
    expect(r.success).toBe(true)
  })

  it('نام خالی رد می‌شود', () => {
    const r = customerSchema.safeParse({ name: '' })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0].path[0]).toBe('name')
  })

  it('فضاهای اضافه trim می‌شوند', () => {
    const r = customerSchema.safeParse({ name: '  علی  ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.name).toBe('علی')
  })

  it('phone خالی به null تبدیل می‌شود', () => {
    const r = customerSchema.safeParse({ name: 'تست', phone: '' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.phone).toBeNull()
  })

  it('notes خالی به null تبدیل می‌شود', () => {
    const r = customerSchema.safeParse({ name: 'تست', notes: '   ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.notes).toBeNull()
  })

  it('نام بیش از ۸۰ کاراکتر رد می‌شود', () => {
    const r = customerSchema.safeParse({ name: 'آ'.repeat(81) })
    expect(r.success).toBe(false)
  })
})
