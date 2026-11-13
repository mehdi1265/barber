import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clearLogEntries, errorDetails, getLogEntries, logger } from '@shared/utils/logger'

describe('logger ring buffer', () => {
  beforeEach(() => {
    clearLogEntries()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('حداکثر ۲۰۰ ورودی نگه می‌دارد و جدیدترین‌ها را حفظ می‌کند', () => {
    for (let index = 0; index < 205; index += 1) {
      logger.info(`message ${index}`)
    }

    const entries = getLogEntries()
    expect(entries).toHaveLength(200)
    expect(entries[0].message).toBe('message 5')
    expect(entries[199].message).toBe('message 204')
  })

  it('کلیدهای حساس را در context پاک می‌کند', () => {
    const entry = logger.error('failed', {
      token: 'abc',
      password: 'x',
      authorization: 'Bearer y',
      customerId: 'c1',
    })

    expect(entry.context).toEqual({
      token: '[redacted]',
      password: '[redacted]',
      authorization: '[redacted]',
      customerId: 'c1',
    })
  })

  it('خطا را به جزئیات قابل ثبت تبدیل می‌کند', () => {
    const details = errorDetails(new TypeError('boom'))
    expect(details).toMatchObject({ name: 'TypeError', message: 'boom' })
    expect(errorDetails('plain')).toEqual({ message: 'plain' })
  })
})
