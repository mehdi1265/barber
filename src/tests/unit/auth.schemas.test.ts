import { describe, it, expect } from 'vitest'
import { loginSchema, registerSchema } from '@features/auth/auth.schemas'

describe('loginSchema', () => {
  it('ایمیل و رمز معتبر قبول می‌شود', () => {
    const result = loginSchema.safeParse({ email: 'test@example.com', password: 'pass123' })
    expect(result.success).toBe(true)
  })

  it('ایمیل نامعتبر رد می‌شود', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'pass123' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path[0]).toBe('email')
  })

  it('رمز کمتر از ۶ کاراکتر رد می‌شود', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: '12' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path[0]).toBe('password')
  })

  it('فیلد خالی رد می‌شود', () => {
    const result = loginSchema.safeParse({ email: '', password: '' })
    expect(result.success).toBe(false)
  })
})

describe('registerSchema', () => {
  const valid = {
    display_name: 'علی احمدی',
    email: 'ali@example.com',
    password: 'SecurePass1',
    confirmPassword: 'SecurePass1',
  }

  it('داده معتبر قبول می‌شود', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true)
  })

  it('نام کمتر از ۲ کاراکتر رد می‌شود', () => {
    const r = registerSchema.safeParse({ ...valid, display_name: 'آ' })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0].path[0]).toBe('display_name')
  })

  it('رمز بدون عدد رد می‌شود', () => {
    const r = registerSchema.safeParse({ ...valid, password: 'OnlyLetters', confirmPassword: 'OnlyLetters' })
    expect(r.success).toBe(false)
  })

  it('رمز بدون حرف رد می‌شود', () => {
    const r = registerSchema.safeParse({ ...valid, password: '12345678', confirmPassword: '12345678' })
    expect(r.success).toBe(false)
  })

  it('تکرار رمز متفاوت رد می‌شود', () => {
    const r = registerSchema.safeParse({ ...valid, confirmPassword: 'DifferentPass1' })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0].path[0]).toBe('confirmPassword')
  })
})
