import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  isNative: vi.fn(),
  addListener: vi.fn(),
  getLaunchUrl: vi.fn(),
  applyRecoveryLink: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: state.isNative },
}))

vi.mock('@capacitor/app', () => ({
  App: { addListener: state.addListener, getLaunchUrl: state.getLaunchUrl },
}))

vi.mock('@features/auth/auth.usecases', () => ({
  applyRecoveryLink: state.applyRecoveryLink,
}))

import { handleAppUrl, registerAppUrlHandling } from '@/app/deep-links'
import { RECOVERY_LINK_EVENT } from '@features/auth/recovery-link'

const RECOVERY_URL = 'barberapp://reset-password#access_token=at&refresh_token=rt&type=recovery'

describe('native deep links', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.addListener.mockResolvedValue({ remove: state.remove })
    state.getLaunchUrl.mockResolvedValue(null)
    state.applyRecoveryLink.mockResolvedValue({ error: null })
  })

  it('ignores URLs that are not recovery links', async () => {
    const navigate = vi.fn()
    const onLink = vi.fn()
    window.addEventListener(RECOVERY_LINK_EVENT, onLink)

    await expect(handleAppUrl('barberapp://customers/42', navigate)).resolves.toBe(false)

    expect(state.applyRecoveryLink).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    expect(onLink).not.toHaveBeenCalled()
    window.removeEventListener(RECOVERY_LINK_EVENT, onLink)
  })

  it('creates the session, routes to the reset page, and notifies it', async () => {
    const navigate = vi.fn()
    const onLink = vi.fn()
    window.addEventListener(RECOVERY_LINK_EVENT, onLink)

    await expect(handleAppUrl(RECOVERY_URL, navigate)).resolves.toBe(true)

    expect(state.applyRecoveryLink).toHaveBeenCalledWith(RECOVERY_URL)
    expect(navigate).toHaveBeenCalledWith('/reset-password')
    expect(onLink).toHaveBeenCalledTimes(1)
    window.removeEventListener(RECOVERY_LINK_EVENT, onLink)
  })

  it('handles the cold-start launch URL on native', async () => {
    state.isNative.mockReturnValue(true)
    state.getLaunchUrl.mockResolvedValue({ url: RECOVERY_URL })
    const navigate = vi.fn()

    const cleanup = await registerAppUrlHandling(navigate)

    expect(state.addListener).toHaveBeenCalledWith('appUrlOpen', expect.any(Function))
    expect(state.applyRecoveryLink).toHaveBeenCalledWith(RECOVERY_URL)
    expect(navigate).toHaveBeenCalledWith('/reset-password')

    cleanup()
    expect(state.remove).toHaveBeenCalled()
  })

  it('does nothing on web', async () => {
    state.isNative.mockReturnValue(false)

    const cleanup = await registerAppUrlHandling(vi.fn())

    expect(state.addListener).not.toHaveBeenCalled()
    expect(state.getLaunchUrl).not.toHaveBeenCalled()
    cleanup()
  })
})
