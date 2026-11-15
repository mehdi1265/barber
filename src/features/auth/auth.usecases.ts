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
import { useAuthStore } from '@state/auth.store'
import type { Profile } from '@shared/types'
import type { LoginFormData, RegisterFormData } from './auth.schemas'
import { mapAuthError } from './auth.errors'
import { INVALID_RECOVERY_MESSAGE, NATIVE_RECOVERY_URL, parseRecoveryLink } from './recovery-link'
import {
  CONFIRM_MESSAGES,
  CONFIRM_PATH,
  NATIVE_CONFIRM_URL,
  outcomeFromAuthError,
  parseConfirmLink,
  type ConfirmOutcome,
} from './email-confirmation'

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
 * Idempotent: returns the existing profile or creates exactly one local row.
 *
 * The local row is a placeholder and is not queued for push: the account's
 * cloud profile already exists, and upserting device defaults would overwrite
 * its phone/currency. Pulling the cloud row fills it in.
 *
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

    const profile = await repo.ensureLocalProfile({
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
      options: {
        data: { display_name: data.display_name.trim() },
        emailRedirectTo: confirmEmailRedirectUrl(),
      },
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
  const userId = useAuthStore.getState().userId
  if (!userId) return 0
  try {
    const db = await getDatabase()
    return await countPendingOutbox(db, userId)
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

/**
 * Optional verified HTTPS redirect configured at build time. When present it
 * replaces the custom scheme, so another installed app cannot intercept the
 * link. The value must be an https URL on the given path (the bare origin is
 * accepted and normalised).
 */
function configuredRedirect(raw: string | undefined, path: string): string | null {
  const value = raw?.trim()
  if (!value) return null

  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') {
      console.error(`[auth] redirect override for ${path} must use https; ignoring it`)
      return null
    }
    if (url.pathname === '/' || url.pathname === '') url.pathname = path
    if (url.pathname !== path && url.pathname !== `${path}/`) {
      console.error(`[auth] redirect override must point at ${path}; ignoring it`)
      return null
    }
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    console.error(`[auth] redirect override for ${path} is not a valid URL; ignoring it`)
    return null
  }
}

function configuredRecoveryRedirect(): string | null {
  return configuredRedirect(
    import.meta.env.VITE_RECOVERY_REDIRECT_URL as string | undefined,
    '/reset-password'
  )
}

/** Recovery emails go to the verified HTTPS domain when configured. */
export function recoveryRedirectUrl(): string {
  const configured = configuredRecoveryRedirect()
  if (configured) return configured
  return Capacitor.isNativePlatform()
    ? NATIVE_RECOVERY_URL
    : `${window.location.origin}/reset-password`
}

/**
 * Where the "Confirm your email" button lands.
 *
 * Must be listed in Supabase → Authentication → URL Configuration → Redirect
 * URLs, otherwise Supabase silently falls back to the Site URL.
 */
export function confirmEmailRedirectUrl(): string {
  const configured = configuredRedirect(
    import.meta.env.VITE_CONFIRM_EMAIL_REDIRECT_URL as string | undefined,
    CONFIRM_PATH
  )
  if (configured) return configured
  return Capacitor.isNativePlatform()
    ? NATIVE_CONFIRM_URL
    : `${window.location.origin}${CONFIRM_PATH}`
}

export async function requestPasswordResetUseCase(email: string): Promise<SimpleResult> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: recoveryRedirectUrl(),
    })
    if (error) return { error: { message: mapAuthError(error.message) } }
    return { error: null }
  } catch (err) {
    console.error('[auth] password reset request failed:', err)
    return { error: { message: mapAuthError(err instanceof Error ? err.message : 'network') } }
  }
}

/**
 * Completes recovery with the code from the reset email. The code is bound to
 * the email address and is consumed by Supabase, so an intercepted code cannot
 * be replayed and cannot target another account.
 */
export async function verifyRecoveryOtpUseCase(
  email: string,
  token: string
): Promise<SimpleResult> {
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'recovery',
    })
    if (error) return { error: { message: mapAuthError(error.message) } }
    if (!data.session) return { error: { message: INVALID_RECOVERY_MESSAGE } }
    return { error: null }
  } catch (err) {
    console.error('[auth] recovery code verification failed:', err)
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

// ── Email confirmation ────────────────────────────────────────────────────────

export interface ConfirmResult {
  outcome: ConfirmOutcome
  message: string
}

/**
 * Turns a confirmation link into a verified account.
 *
 * The implicit flow (the project's actual flow) delivers
 * `#access_token`/`#refresh_token`; a PKCE `?code=` is exchanged instead when
 * the project is switched to that flow. The session is then cleared locally
 * unless the device was already signed in, so the user lands on the login
 * screen instead of being silently authenticated by an email link.
 */
export async function applyConfirmEmailLink(url: string): Promise<ConfirmResult> {
  const link = parseConfirmLink(url)

  if (link.kind === 'none') return { outcome: 'invalid', message: CONFIRM_MESSAGES.invalid }
  if (link.kind === 'error') {
    console.warn('[auth] confirmation link rejected by provider:', link.outcome)
    return { outcome: link.outcome, message: CONFIRM_MESSAGES[link.outcome] }
  }

  const hadSession = await hasActiveSession()

  try {
    const { data, error } =
      link.kind === 'tokens'
        ? await supabase.auth.setSession({
            access_token: link.tokens.accessToken,
            refresh_token: link.tokens.refreshToken,
          })
        : await supabase.auth.exchangeCodeForSession(link.code)

    if (error) {
      const outcome = outcomeFromAuthError(error.message)
      return { outcome, message: CONFIRM_MESSAGES[outcome] }
    }

    if (data.user) await ensureProfile(data.user)

    if (!hadSession) {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
      if (signOutError) {
        console.warn('[auth] could not clear the confirmation session:', signOutError.message)
      }
    }

    return { outcome: 'confirmed', message: CONFIRM_MESSAGES.confirmed }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'network'
    console.error('[auth] email confirmation failed:', message)
    const outcome = outcomeFromAuthError(message)
    return { outcome, message: CONFIRM_MESSAGES[outcome] }
  }
}

/** Re-sends the confirmation email when the original link expired. */
export async function resendConfirmationUseCase(email: string): Promise<SimpleResult> {
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: confirmEmailRedirectUrl() },
    })
    if (error) return { error: { message: mapAuthError(error.message) } }
    return { error: null }
  } catch (err) {
    console.error('[auth] resending the confirmation email failed:', err)
    return { error: { message: mapAuthError(err instanceof Error ? err.message : 'network') } }
  }
}
