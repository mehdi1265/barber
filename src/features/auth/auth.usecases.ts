/**
 * Auth use cases — all Supabase Auth interactions live here.
 * UI components call these functions, never Supabase directly.
 */

import { supabase } from '@services/supabase/client'
import { getDatabase } from '@database/sqlite/database'
import { ProfileRepository } from '@database/repositories/profile.repository'
import type { LoginFormData, RegisterFormData } from './auth.schemas'

export interface AuthError {
  message: string
}

// ── Login ──────────────────────────────────────────────────────────────────────

export async function loginUseCase(
  data: LoginFormData
): Promise<{ error: AuthError | null }> {
  const { error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  })

  if (error) {
    return { error: { message: mapAuthError(error.message) } }
  }

  return { error: null }
}

// ── Register ──────────────────────────────────────────────────────────────────

export async function registerUseCase(
  data: RegisterFormData
): Promise<{ error: AuthError | null }> {
  // 1. Create Supabase auth account
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
  })

  if (signUpError) {
    return { error: { message: mapAuthError(signUpError.message) } }
  }

  if (!authData.user) {
    return { error: { message: 'خطا در ایجاد حساب. دوباره تلاش کنید.' } }
  }

  // 2. Create local profile record
  try {
    const db = await getDatabase()
    const profileRepo = new ProfileRepository(db)
    await profileRepo.createProfile({
      id: authData.user.id,
      user_id: authData.user.id,
      display_name: data.display_name,
      phone: null,
      currency_code: 'IRR',
    })
  } catch (err) {
    console.error('[register] Failed to create local profile:', err)
    // Don't block registration — profile can be created on next sync
  }

  return { error: null }
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function logoutUseCase(): Promise<void> {
  // Check for unsynced changes before logout
  try {
    const db = await getDatabase()
    const result = await db.query(
      `SELECT COUNT(*) as cnt FROM sync_outbox WHERE status IN ('pending','failed')`,
      []
    )
    const pendingCount = (result.values?.[0] as { cnt: number })?.cnt ?? 0
    if (pendingCount > 0) {
      console.warn(`[logout] ${pendingCount} unsynced changes will remain local`)
      // We do NOT silently delete unsynced data — per D-02 requirement
    }
  } catch (err) {
    console.error('[logout] Could not check outbox:', err)
  }

  await supabase.auth.signOut()
}

// ── Password reset ────────────────────────────────────────────────────────────

export async function requestPasswordResetUseCase(
  email: string
): Promise<{ error: AuthError | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })

  if (error) {
    return { error: { message: mapAuthError(error.message) } }
  }

  return { error: null }
}

// ── Error mapping ─────────────────────────────────────────────────────────────

function mapAuthError(message: string): string {
  const lower = message.toLowerCase()

  if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
    return 'ایمیل یا رمز عبور اشتباه است'
  }
  if (lower.includes('email already registered') || lower.includes('already registered')) {
    return 'این ایمیل قبلاً ثبت شده است'
  }
  if (lower.includes('email not confirmed')) {
    return 'ایمیل خود را تأیید کنید'
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'تعداد درخواست‌ها زیاد است. کمی صبر کنید'
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'خطا در اتصال به سرور. اینترنت را بررسی کنید'
  }
  if (lower.includes('password')) {
    return 'رمز عبور معتبر نیست'
  }

  console.error('[auth] Unmapped error:', message)
  return 'خطایی رخ داد. دوباره تلاش کنید'
}
