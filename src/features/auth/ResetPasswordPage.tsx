import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { resetPasswordSchema, type ResetPasswordFormData } from './auth.schemas'
import { applyRecoverySession, hasActiveSession, updatePasswordUseCase } from './auth.usecases'
import { RECOVERY_LINK_EVENT } from './recovery-link'
import { FormField } from '@shared/components/forms/FormField'
import { Button } from '@shared/components/ui/Button'
import { LoadingScreen } from '@shared/components/ui/LoadingScreen'
import styles from './AuthPage.module.css'

type Phase = 'verifying' | 'ready' | 'invalid' | 'done'

export default function ResetPasswordPage() {
  const [phase, setPhase] = useState<Phase>('verifying')
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  })

  useEffect(() => {
    let cancelled = false

    const verify = async () => {
      if (await hasActiveSession()) {
        if (!cancelled) setPhase('ready')
        return
      }

      const { error } = await applyRecoverySession(window.location.hash)
      if (cancelled) return

      if (error) {
        setServerError(error.message)
        setPhase('invalid')
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

  const onSubmit = async (data: ResetPasswordFormData) => {
    setServerError(null)
    const { error } = await updatePasswordUseCase(data.password)
    if (error) setServerError(error.message)
    else setPhase('done')
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
          <p className={styles.subtitle}>یک رمز عبور قوی انتخاب کنید</p>
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
        ) : phase === 'invalid' ? (
          <>
            <div className={styles.serverError} role="alert">
              {serverError ?? 'لینک بازیابی نامعتبر یا منقضی شده است'}
            </div>
            <div className={styles.footer}>
              <Link to="/forgot-password" className={styles.link}>
                درخواست لینک جدید
              </Link>
            </div>
          </>
        ) : (
          <form
            onSubmit={e => {
              void handleSubmit(onSubmit)(e)
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
              {...register('password')}
              error={errors.password}
            />

            <FormField
              label="تکرار رمز عبور"
              type="password"
              autoComplete="new-password"
              required
              {...register('confirmPassword')}
              error={errors.confirmPassword}
            />

            {serverError && (
              <div className={styles.serverError} role="alert">
                {serverError}
              </div>
            )}

            <Button type="submit" fullWidth loading={isSubmitting} size="lg">
              ذخیره رمز جدید
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
