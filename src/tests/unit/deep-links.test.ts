import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  isNative: vi.fn(),
  addListener: vi.fn(),
  getLaunchUrl: vi.fn(),
  applyRecoveryLink: vi.fn(),
  applyConfirmEmailLink: vi.fn(),
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
  applyConfirmEmailLink: state.applyConfirmEmailLink,
}))

import { handleAppUrl, registerAppUrlHandling } from '@/app/deep-links'
import { RECOVERY_LINK_EVENT } from '@features/auth/recovery-link'

const RECOVERY_URL = 'barberapp://reset-password#access_token=at&refresh_token=rt&type=recovery'
const CONFIRM_URL = 'barberapp://confirm-email#access_token=at&refresh_token=rt&type=signup'

describe('native deep links', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.addListener.mockResolvedValue({ remove: state.remove })
    state.getLaunchUrl.mockResolvedValue(null)
    state.applyRecoveryLink.mockResolvedValue({ error: null })
    state.applyConfirmEmailLink.mockResolvedValue({
      outcome: 'confirmed',
      message: 'ok',
    })
  })

  it('ignores URLs that are not auth links', async () => {
    const navigate = vi.fn()
    const onLink = vi.fn()
    window.addEventListener(RECOVERY_LINK_EVENT, onLink)

    await expect(handleAppUrl('barberapp://customers/42', navigate)).resolves.toBe(false)

    expect(state.applyRecoveryLink).not.toHaveBeenCalled()
    expect(state.applyConfirmEmailLink).not.toHaveBeenCalled()
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
    expect(state.applyConfirmEmailLink).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/reset-password')
    expect(onLink).toHaveBeenCalledTimes(1)
    window.removeEventListener(RECOVERY_LINK_EVENT, onLink)
  })

  it('routes a confirmation link to the confirm page with its outcome', async () => {
    const navigate = vi.fn()
    const onLink = vi.fn()
    window.addEventListener(RECOVERY_LINK_EVENT, onLink)

    await expect(handleAppUrl(CONFIRM_URL, navigate)).resolves.toBe(true)

    expect(state.applyConfirmEmailLink).toHaveBeenCalledWith(CONFIRM_URL)
    expect(state.applyRecoveryLink).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/confirm-email?result=confirmed')
    expect(onLink).not.toHaveBeenCalled()
    window.removeEventListener(RECOVERY_LINK_EVENT, onLink)
  })

  it('reports an expired confirmation without treating it as recovery', async () => {
    state.applyConfirmEmailLink.mockResolvedValue({ outcome: 'expired', message: 'expired' })
    const navigate = vi.fn()

    await handleAppUrl(CONFIRM_URL, navigate)

    expect(navigate).toHaveBeenCalledWith('/confirm-email?result=expired')
    expect(state.applyRecoveryLink).not.toHaveBeenCalled()
  })

  it('handles the cold-start recovery launch URL on native', async () => {
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

  it('handles the cold-start confirmation launch URL on native', async () => {
    state.isNative.mockReturnValue(true)
    state.getLaunchUrl.mockResolvedValue({ url: CONFIRM_URL })
    const navigate = vi.fn()

    const cleanup = await registerAppUrlHandling(navigate)

    expect(state.applyConfirmEmailLink).toHaveBeenCalledWith(CONFIRM_URL)
    expect(navigate).toHaveBeenCalledWith('/confirm-email?result=confirmed')

    cleanup()
    expect(state.remove).toHaveBeenCalled()
  })

  it('handles a warm confirmation link delivered through appUrlOpen', async () => {
    state.isNative.mockReturnValue(true)
    const navigate = vi.fn()

    const cleanup = await registerAppUrlHandling(navigate)
    const listener = state.addListener.mock.calls[0][1] as (event: { url: string }) => void
    listener({ url: CONFIRM_URL })

    await vi.waitFor(() => expect(state.applyConfirmEmailLink).toHaveBeenCalledWith(CONFIRM_URL))
    expect(navigate).toHaveBeenCalledWith('/confirm-email?result=confirmed')

    cleanup()
  })

  it('does nothing on web', async () => {
    state.isNative.mockReturnValue(false)

    const cleanup = await registerAppUrlHandling(vi.fn())

    expect(state.addListener).not.toHaveBeenCalled()
    expect(state.getLaunchUrl).not.toHaveBeenCalled()
    cleanup()
  })
})
