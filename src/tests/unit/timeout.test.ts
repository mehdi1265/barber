import { describe, expect, it, vi } from 'vitest'
import { withTimeout } from '@shared/utils/timeout'

describe('withTimeout', () => {
  it('resolves with the value when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000, 'timed out')).resolves.toBe(7)
  })

  it('rejects when the promise never settles', async () => {
    vi.useFakeTimers()
    try {
      const pending = withTimeout(new Promise<never>(() => {}), 1000, 'timed out')
      const assertion = expect(pending).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(1000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the original rejection reason', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('real failure')), 1000, 'timed out')
    ).rejects.toThrow('real failure')
  })
})
