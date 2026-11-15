import { describe, expect, it } from 'vitest'
import {
  DB_UNAVAILABLE_MESSAGE,
  isDatabaseUnavailable,
  userMessageFor,
} from '@shared/utils/user-message'

describe('user-facing write errors', () => {
  it('maps known failures to Persian explanations', () => {
    expect(userMessageFor(new Error('Nested transactions are not supported'), 'پیش‌فرض')).toContain(
      'چند لحظه'
    )
    expect(userMessageFor(new Error('addToOutbox requires user_id'), 'پیش‌فرض')).toContain('نشست')
    expect(
      userMessageFor(new Error('UNIQUE constraint failed: services.name'), 'پیش‌فرض')
    ).toContain('قبلاً ثبت')
    expect(userMessageFor(new Error('FOREIGN KEY constraint failed'), 'پیش‌فرض')).toContain(
      'وابسته'
    )
    expect(userMessageFor(new Error('Database initialisation timed out'), 'پیش‌فرض')).toBe(
      DB_UNAVAILABLE_MESSAGE
    )
    expect(userMessageFor(new Error('Failed to fetch'), 'پیش‌فرض')).toContain('اینترنت')
  })

  it('falls back for unknown errors and never echoes raw text', () => {
    expect(userMessageFor(new Error('sqlite: disk I/O error'), 'ذخیره نشد.')).toBe('ذخیره نشد.')
    expect(userMessageFor({ obscure: true }, 'ذخیره نشد.')).toBe('ذخیره نشد.')
    expect(userMessageFor(undefined, 'ذخیره نشد.')).toBe('ذخیره نشد.')
  })

  it('flags database failures as not worth an automatic retry', () => {
    expect(isDatabaseUnavailable(new Error('Database initialisation timed out'))).toBe(true)
    expect(isDatabaseUnavailable(new Error('local database not available'))).toBe(true)
    expect(isDatabaseUnavailable(new Error('Failed to fetch'))).toBe(false)
  })
})
