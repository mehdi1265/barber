import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useSearchParams } from 'react-router-dom'
import {
  recoveryOtpSchema,
  resetPasswordSchema,
  type RecoveryOtpFormData,
  type ResetPasswordFormData,
} from './auth.schemas'
import {
  applyRecoverySession,
  hasActiveSession,
  updatePasswordUseCase,
  verifyRecoveryOtpUseCase,
} from './auth.usecases'
import { RECOVERY_LINK_EVENT } from './recovery-link'
import { FormField } from '@shared/components/forms/FormField'
import { Button } from '@shared/components/ui/Button'
import { LoadingScreen } from '@shared/components/ui/LoadingScreen'
import styles from './AuthPage.module.css'

type Phase = 'verifying' | 'ready' | 'otp' | 'done'

/** Removes tokens/codes from the address bar and browser history. */
function stripRecoveryParams() {
  if (!window.location.hash && !window.location.search) return
  window.history.replaceState(window.history.state, '', window.location.pathname)
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const emailFromQuery = useMemo(() => searchParams.get('email')?.trim() ?? '', [searchParams])
  const [phase, setPhase] = useState<Phase>('verifying')
  const [serverError, setServerError] = useState<string | null>(null)

  const passwordForm = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  })

  const otpForm = useForm<RecoveryOtpFormData>({
    resolver: zodResolver(recoveryOtpSchema),
    defaultValues: { email: emailFromQuery, token: '' },
  })

  useEffect(() => {
    let cancelled = false

    const verify = async () => {
      if (await hasActiveSession()) {
        if (!cancelled) setPhase('ready')
        return
      }

      // The link may be an implicit fragment, a PKCE code, or absent entirely
      // (the user came here to type the emailed code).
      const hasFragmentTokens = window.location.hash.length > 1
      const hasCode = new URLSearchParams(window.location.search).has('code')

      if (!hasFragmentTokens && !hasCode) {
        if (!cancelled) setPhase('otp')
        return
      }

      const link = hasCode ? window.location.href : window.location.hash
      const { error } = await applyRecoverySession(link)
      stripRecoveryParams()
      if (cancelled) return

      if (error) {
        setServerError(error.message)
        setPhase('otp')
      } else {
        setPhase('ready')
      }
    }

    // Native links may arrive after this page mounted (warm start); re-verify
    // once the deep-link handler has created the session.
    const onRecoveryLink = () => {
      if (cancelled) return
      setServerError(null)
      setPhase('verifying')
      void verify()
    }

    window.addEventListener(RECOVERY_LINK_EVENT, onRecoveryLink)
    void verify()

    return () => {
      cancelled = true
      window.removeEventListener(RECOVERY_LINK_EVENT, onRecoveryLink)
    }
  }, [])

  const onSubmitPassword = async (data: ResetPasswordFormData) => {
    setServerError(null)
    const { error } = await updatePasswordUseCase(data.password)
    if (error) setServerError(error.message)
    else setPhase('done')
  }

  const onSubmitCode = async (data: RecoveryOtpFormData) => {
    setServerError(null)
    const { error } = await verifyRecoveryOtpUseCase(data.email, data.token)
    if (error) setServerError(error.message)
    else setPhase('ready')
  }

  if (phase === 'verifying') return <LoadingScreen message="در حال بررسی لینک بازیابی…" />

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logo} aria-hidden="true">
            🔒
          </div>
          <h1 className={styles.title}>رمز عبور جدید</h1>
          <p className={styles.subtitle}>
            {phase === 'ready'
              ? 'یک رمز عبور قوی انتخاب کنید'
              : 'کد بازیابی ارسال‌شده به ایمیل را وارد کنید'}
          </p>
        </div>

        {phase === 'done' ? (
          <>
            <div className={styles.success} role="status">
              رمز عبور شما تغییر کرد. اکنون می‌توانید با رمز جدید وارد شوید.
            </div>
            <div className={styles.footer}>
              <Link to="/login" className={styles.link}>
                ورود به حساب
              </Link>
            </div>
          </>
        ) : phase === 'otp' ? (
          <>
            {serverError && (
              <div className={styles.serverError} role="alert">
                {serverError}
              </div>
            )}

            <form
              onSubmit={e => {
                void otpForm.handleSubmit(onSubmitCode)(e)
              }}
              noValidate
              className={styles.form}
            >
              <FormField
                label="ایمیل"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                {...otpForm.register('email')}
                error={otpForm.formState.errors.email}
              />

              <FormField
                label="کد بازیابی"
                type="text"
                autoComplete="one-time-code"
                inputMode="numeric"
                required
                hint="کد ۶ تا ۱۰ رقمی موجود در ایمیل بازیابی"
                {...otpForm.register('token')}
                error={otpForm.formState.errors.token}
              />

              <Button type="submit" fullWidth loading={otpForm.formState.isSubmitting} size="lg">
                تأیید کد
              </Button>
            </form>

            <div className={styles.footer}>
              <Link to="/forgot-password" className={styles.link}>
                درخواست لینک جدید
              </Link>
            </div>
          </>
        ) : (
          <form
            onSubmit={e => {
              void passwordForm.handleSubmit(onSubmitPassword)(e)
            }}
            noValidate
            className={styles.form}
          >
            <FormField
              label="رمز عبور جدید"
              type="password"
              autoComplete="new-password"
              required
              hint="حداقل ۸ کاراکتر، شامل حرف و عدد"
              {...passwordForm.register('password')}
              error={passwordForm.formState.errors.password}
            />

            <FormField
              label="تکرار رمز عبور"
              type="password"
              autoComplete="new-password"
              required
              {...passwordForm.register('confirmPassword')}
              error={passwordForm.formState.errors.confirmPassword}
            />

            {serverError && (
              <div className={styles.serverError} role="alert">
                {serverError}
              </div>
            )}

            <Button type="submit" fullWidth loading={passwordForm.formState.isSubmitting} size="lg">
              ذخیره رمز جدید
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
