/**
 * Auth use cases — all Supabase Auth interactions live here.
 * UI components call these functions, never Supabase directly.
 */

import type { User } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { supabase } from '@services/supabase/client'
import { getDatabase } from '@database/sqlite/database'
import { ProfileRepository } from '@database/repositories/profile.repository'
import { countPendingOutbox } from '@sync/outbox/outbox.repository'
import type { Profile } from '@shared/types'
import type { LoginFormData, RegisterFormData } from './auth.schemas'
import { mapAuthError } from './auth.errors'
import { INVALID_RECOVERY_MESSAGE, NATIVE_RECOVERY_URL, parseRecoveryLink } from './recovery-link'

export type { RecoveryTokens } from './recovery-link'
export { parseRecoveryTokens } from './recovery-link'

export interface AuthError {
  message: string
}

export interface LoginResult {
  error: AuthError | null
}

export interface RegisterResult {
  error: AuthError | null
  /** True when the project requires email confirmation before the first login. */
  requiresEmailConfirmation: boolean
}

export interface SimpleResult {
  error: AuthError | null
}

// ── Profile ───────────────────────────────────────────────────────────────────

type ProfileUser = Pick<User, 'id' | 'email'> & {
  user_metadata?: Record<string, unknown>
}

function displayNameFor(user: ProfileUser): string {
  const metaName = user.user_metadata?.display_name
  if (typeof metaName === 'string' && metaName.trim()) return metaName.trim().slice(0, 60)
  return user.email?.split('@')[0] || 'کاربر'
}

/**
 * Idempotent: returns the existing profile or creates exactly one row.
 * Never throws — a missing database is retried on the next launch/login.
 */
export async function ensureProfile(
  user: ProfileUser
): Promise<{ created: boolean; profile: Profile | null }> {
  try {
    const db = await getDatabase()
    const repo = new ProfileRepository(db)
    const existing = await repo.getProfile(user.id)
    if (existing) return { created: false, profile: existing }

    const profile = await repo.createProfile({
      id: user.id,
      user_id: user.id,
      display_name: displayNameFor(user),
      phone: null,
      currency_code: 'IRR',
    })
    return { created: true, profile }
  } catch (err) {
    console.error('[auth] ensureProfile deferred to next launch:', err)
    return { created: false, profile: null }
  }
}

// ── Login ──────────────────────────────────────────────────────────────────────

export async function loginUseCase(data: LoginFormData): Promise<LoginResult> {
  try {
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })

    if (error) return { error: { message: mapAuthError(error.message) } }
    if (!authData.user) return { error: { message: 'خطا در ورود. دوباره تلاش کنید.' } }

    await ensureProfile(authData.user)
    return { error: null }
  } catch (err) {
    console.error('[auth] login failed:', err)
    return { error: { message: mapAuthError(err instanceof Error ? err.message : 'network') } }
  }
}

// ── Register ──────────────────────────────────────────────────────────────────

export async function registerUseCase(data: RegisterFormData): Promise<RegisterResult> {
  try {
    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: { data: { display_name: data.display_name.trim() } },
    })

    if (error) {
      return { error: { message: mapAuthError(error.message) }, requiresEmailConfirmation: false }
    }
    if (!authData.user) {
      return {
        error: { message: 'خطا در ایجاد حساب. دوباره تلاش کنید.' },
        requiresEmailConfirmation: false,
      }
    }

    // Supabase returns a user with zero identities when the email is already
    // registered while confirmations are enabled (anti-enumeration).
    if (authData.user.identities && authData.user.identities.length === 0) {
      return { error: { message: 'این ایمیل قبلاً ثبت شده است' }, requiresEmailConfirmation: false }
    }

    await ensureProfile(authData.user)

    return {
      error: null,
      requiresEmailConfirmation: authData.session === null,
    }
  } catch (err) {
    console.error('[auth] register failed:', err)
    return {
      error: { message: mapAuthError(err instanceof Error ? err.message : 'network') },
      requiresEmailConfirmation: false,
    }
  }
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function getPendingOutboxCount(): Promise<number> {
  try {
    const db = await getDatabase()
    return await countPendingOutbox(db)
  } catch (err) {
    console.error('[auth] could not count outbox rows:', err)
    return 0
  }
}

/**
 * Clears the session. Local rows (including queued operations) are never
 * deleted, so they remain for this user on the next login.
 */
export async function logoutUseCase(): Promise<SimpleResult> {
  try {
    const { error } = await supabase.auth.signOut()
    if (!error) return { error: null }

    console.warn('[auth] global sign-out failed, clearing locally:', error.message)
  } catch (err) {
    console.warn('[auth] sign-out request failed, clearing locally:', err)
  }

  try {
    const { error: localError } = await supabase.auth.signOut({ scope: 'local' })
    if (localError) return { error: { message: mapAuthError(localError.message) } }
    return { error: null }
  } catch (err) {
    console.error('[auth] local sign-out failed:', err)
    return { error: { message: 'خروج انجام نشد. دوباره تلاش کنید.' } }
  }
}

// ── Password reset ────────────────────────────────────────────────────────────

export async function requestPasswordResetUseCase(email: string): Promise<SimpleResult> {
  const redirectTo = Capacitor.isNativePlatform()
    ? NATIVE_RECOVERY_URL
    : `${window.location.origin}/reset-password`

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) return { error: { message: mapAuthError(error.message) } }
    return { error: null }
  } catch (err) {
    console.error('[auth] password reset request failed:', err)
    return { error: { message: mapAuthError(err instanceof Error ? err.message : 'network') } }
  }
}

export async function updatePasswordUseCase(password: string): Promise<SimpleResult> {
  try {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return { error: { message: mapAuthError(error.message) } }
    return { error: null }
  } catch (err) {
    console.error('[auth] password update failed:', err)
    return { error: { message: mapAuthError(err instanceof Error ? err.message : 'network') } }
  }
}

/** True when a persisted session exists (works offline; reads local storage). */
export async function hasActiveSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession()
    return !!data.session
  } catch (err) {
    console.error('[auth] session lookup failed:', err)
    return false
  }
}

/**
 * Turns a recovery link (web hash, custom-scheme deep link, or PKCE code) into
 * a session. Implicit tokens are used only for recovery URLs or `type=recovery`.
 */
export async function applyRecoveryLink(url: string): Promise<SimpleResult> {
  const link = parseRecoveryLink(url)

  if (link.kind === 'error') {
    console.warn('[auth] recovery link rejected by provider:', link.message.slice(0, 120))
    return { error: { message: INVALID_RECOVERY_MESSAGE } }
  }
  if (link.kind === 'none') {
    return { error: { message: INVALID_RECOVERY_MESSAGE } }
  }

  try {
    if (link.kind === 'tokens') {
      const { error } = await supabase.auth.setSession({
        access_token: link.tokens.accessToken,
        refresh_token: link.tokens.refreshToken,
      })
      if (error) return { error: { message: mapAuthError(error.message) } }
      return { error: null }
    }

    const { error } = await supabase.auth.exchangeCodeForSession(link.code)
    if (error) return { error: { message: mapAuthError(error.message) } }
    return { error: null }
  } catch (err) {
    console.error('[auth] recovery session failed:', err)
    return { error: { message: mapAuthError(err instanceof Error ? err.message : 'network') } }
  }
}

/** Backwards-compatible hash-based entry point used by the web reset page. */
export async function applyRecoverySession(hash: string): Promise<SimpleResult> {
  return applyRecoveryLink(hash)
}
