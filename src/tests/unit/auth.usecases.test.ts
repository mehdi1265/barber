import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const getProfile = vi.fn()
  const createProfile = vi.fn()

  class ProfileRepository {
    getProfile(userId: string): Promise<unknown> {
      return getProfile(userId) as Promise<unknown>
    }
    createProfile(input: unknown): Promise<unknown> {
      return createProfile(input) as Promise<unknown>
    }
  }

  return {
    getProfile,
    createProfile,
    ProfileRepository,
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    getSession: vi.fn(),
    setSession: vi.fn(),
    getDatabase: vi.fn(),
    countPendingOutbox: vi.fn(),
  }
})

vi.mock('@services/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithPassword: state.signInWithPassword,
      signUp: state.signUp,
      signOut: state.signOut,
      resetPasswordForEmail: state.resetPasswordForEmail,
      updateUser: state.updateUser,
      getSession: state.getSession,
      setSession: state.setSession,
    },
  },
}))

vi.mock('@database/sqlite/database', () => ({
  getDatabase: state.getDatabase,
}))

vi.mock('@database/repositories/profile.repository', () => ({
  ProfileRepository: state.ProfileRepository,
}))

vi.mock('@sync/outbox/outbox.repository', () => ({
  countPendingOutbox: state.countPendingOutbox,
}))

import {
  applyRecoverySession,
  ensureProfile,
  getPendingOutboxCount,
  loginUseCase,
  logoutUseCase,
  parseRecoveryTokens,
  registerUseCase,
  requestPasswordResetUseCase,
  updatePasswordUseCase,
} from '@features/auth/auth.usecases'

const USER = {
  id: 'user-1',
  email: 'ali@example.com',
  user_metadata: { display_name: 'علی' },
  identities: [{ id: 'identity-1' }],
}

const PROFILE = {
  id: 'user-1',
  user_id: 'user-1',
  display_name: 'علی',
  phone: null,
  currency_code: 'IRR',
  created_at: '2026-11-13T10:00:00.000Z',
  updated_at: '2026-11-13T10:00:00.000Z',
}

describe('auth use cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    state.getDatabase.mockResolvedValue({})
    state.getProfile.mockResolvedValue(null)
    state.createProfile.mockResolvedValue(PROFILE)
    state.getSession.mockResolvedValue({ data: { session: null } })
    state.signOut.mockResolvedValue({ error: null })
  })

  it('logs in and creates the missing profile once', async () => {
    state.signInWithPassword.mockResolvedValue({ data: { user: USER }, error: null })

    const result = await loginUseCase({ email: USER.email, password: 'secret123' })

    expect(result.error).toBeNull()
    expect(state.createProfile).toHaveBeenCalledTimes(1)
    expect(state.createProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: USER.id, display_name: 'علی' })
    )
  })

  it('keeps the existing profile instead of creating a duplicate', async () => {
    state.signInWithPassword.mockResolvedValue({ data: { user: USER }, error: null })
    state.getProfile.mockResolvedValue(PROFILE)

    await loginUseCase({ email: USER.email, password: 'secret123' })

    expect(state.createProfile).not.toHaveBeenCalled()
  })

  it('maps invalid credentials to Persian without leaking the provider text', async () => {
    state.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid login credentials' },
    })

    const result = await loginUseCase({ email: USER.email, password: 'wrong-pass' })

    expect(result.error?.message).toBe('ایمیل یا رمز عبور اشتباه است')
    expect(result.error?.message).not.toContain('Invalid')
    expect(state.createProfile).not.toHaveBeenCalled()
  })

  it('never throws when the database is unavailable', async () => {
    state.getDatabase.mockRejectedValue(new Error('database unavailable'))

    await expect(ensureProfile(USER)).resolves.toEqual({ created: false, profile: null })
  })

  it('marks registration as pending when email confirmation is required', async () => {
    state.signUp.mockResolvedValue({ data: { user: USER, session: null }, error: null })

    const result = await registerUseCase({
      display_name: 'علی',
      email: USER.email,
      password: 'secret123',
      confirmPassword: 'secret123',
    })

    expect(result.error).toBeNull()
    expect(result.requiresEmailConfirmation).toBe(true)
    expect(state.signUp).toHaveBeenCalledWith({
      email: USER.email,
      password: 'secret123',
      options: { data: { display_name: 'علی' } },
    })
  })

  it('detects an already registered email from the empty identities list', async () => {
    state.signUp.mockResolvedValue({
      data: { user: { ...USER, identities: [] }, session: null },
      error: null,
    })

    const result = await registerUseCase({
      display_name: 'علی',
      email: USER.email,
      password: 'secret123',
      confirmPassword: 'secret123',
    })

    expect(result.error?.message).toBe('این ایمیل قبلاً ثبت شده است')
    expect(result.requiresEmailConfirmation).toBe(false)
  })

  it('falls back to a local sign-out when the global one fails', async () => {
    state.signOut
      .mockResolvedValueOnce({ error: { message: 'network down' } })
      .mockResolvedValueOnce({ error: null })

    const result = await logoutUseCase()

    expect(result.error).toBeNull()
    expect(state.signOut).toHaveBeenNthCalledWith(1)
    expect(state.signOut).toHaveBeenNthCalledWith(2, { scope: 'local' })
  })

  it('returns a Persian error when the local sign-out also fails', async () => {
    state.signOut
      .mockResolvedValueOnce({ error: { message: 'network down' } })
      .mockResolvedValueOnce({ error: { message: 'unexpected failure' } })

    const result = await logoutUseCase()

    expect(result.error?.message).toBe('خطایی رخ داد. دوباره تلاش کنید')
  })

  it('sends the reset link back to the web reset page', async () => {
    state.resetPasswordForEmail.mockResolvedValue({ error: null })

    await requestPasswordResetUseCase('ali@example.com')

    expect(state.resetPasswordForEmail).toHaveBeenCalledWith('ali@example.com', {
      redirectTo: `${window.location.origin}/reset-password`,
    })
  })

  it('maps a weak-password rejection', async () => {
    state.updateUser.mockResolvedValue({
      error: { message: 'Password should be at least 6 characters' },
    })

    const result = await updatePasswordUseCase('123')

    expect(result.error?.message).toContain('رمز عبور ضعیف')
  })

  it('parses only complete recovery fragments', () => {
    expect(parseRecoveryTokens('#access_token=at&refresh_token=rt&type=recovery')).toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
    })
    expect(parseRecoveryTokens('#access_token=at&refresh_token=rt&type=signup')).toBeNull()
    expect(parseRecoveryTokens('#access_token=at&type=recovery')).toBeNull()
  })

  it('creates a session from the recovery link', async () => {
    state.setSession.mockResolvedValue({ error: null })

    const result = await applyRecoverySession('#access_token=at&refresh_token=rt&type=recovery')

    expect(result.error).toBeNull()
    expect(state.setSession).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' })
  })

  it('rejects a recovery link without tokens before calling Supabase', async () => {
    const result = await applyRecoverySession('')

    expect(result.error).not.toBeNull()
    expect(state.setSession).not.toHaveBeenCalled()
  })

  it('returns the queued outbox count and tolerates a database failure', async () => {
    state.countPendingOutbox.mockResolvedValue(4)
    await expect(getPendingOutboxCount()).resolves.toBe(4)

    state.getDatabase.mockRejectedValue(new Error('database unavailable'))
    await expect(getPendingOutboxCount()).resolves.toBe(0)
  })
})
