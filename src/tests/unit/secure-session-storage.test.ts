import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  isNative: vi.fn(),
  secure: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNative },
}))

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: mocks.secure,
}))

import { secureSessionStorage } from '@services/supabase/secure-session-storage'

describe('secureSessionStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('روی دستگاه بومی از SecureStorage استفاده می‌کند', async () => {
    mocks.isNative.mockReturnValue(true)
    mocks.secure.getItem.mockResolvedValue('{"token":"abc"}')

    expect(await secureSessionStorage.getItem('sb-auth')).toBe('{"token":"abc"}')
    await secureSessionStorage.setItem('sb-auth', '{"token":"abc"}')
    await secureSessionStorage.removeItem('sb-auth')

    expect(mocks.secure.getItem).toHaveBeenCalledWith('sb-auth')
    expect(mocks.secure.setItem).toHaveBeenCalledWith('sb-auth', '{"token":"abc"}')
    expect(mocks.secure.removeItem).toHaveBeenCalledWith('sb-auth')
    expect(window.localStorage.getItem('sb-auth')).toBeNull()
  })

  it('در مرورگر از localStorage استفاده می‌کند و به ذخیره‌گاه امن دست نمی‌زند', async () => {
    mocks.isNative.mockReturnValue(false)

    await secureSessionStorage.setItem('sb-auth', '{"token":"web"}')
    expect(await secureSessionStorage.getItem('sb-auth')).toBe('{"token":"web"}')
    await secureSessionStorage.removeItem('sb-auth')
    expect(await secureSessionStorage.getItem('sb-auth')).toBeNull()

    expect(mocks.secure.getItem).not.toHaveBeenCalled()
    expect(mocks.secure.setItem).not.toHaveBeenCalled()
    expect(mocks.secure.removeItem).not.toHaveBeenCalled()
  })
})
