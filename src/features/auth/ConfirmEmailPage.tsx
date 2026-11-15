import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { forgotPasswordSchema, type ForgotPasswordFormData } from './auth.schemas'
import { applyPastedConfirmation, resendConfirmationUseCase } from './auth.usecases'
import { CONFIRM_MESSAGES, parseConfirmOutcome, type ConfirmOutcome } from './email-confirmation'
import { FormField } from '@shared/components/forms/FormField'
import { Button } from '@shared/components/ui/Button'
import styles from './AuthPage.module.css'

/**
 * Result screen for `barberapp://confirm-email`.
 *
 * The deep-link handler performs the verification and passes only an outcome
 * code, so nothing token-like ever reaches this page or the address bar.
 * A confirmed account continues to the login form with a success banner.
 */
export default function ConfirmEmailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const outcome = parseConfirmOutcome(searchParams.get('result'))
  const [resendError, setResendError] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteResult, setPasteResult] = useState<ConfirmOutcome | null>(null)
  const [applying, setApplying] = useState(false)

  const form = useForm<ForgotPasswordFormData>({ resolver: zodResolver(forgotPasswordSchema) })

  if (outcome === 'confirmed') return <Navigate to="/login?confirmed=1" replace />

  const tone = outcome === 'already' ? styles.success : styles.serverError
  const message = outcome
    ? CONFIRM_MESSAGES[outcome]
    : 'برای تأیید ایمیل، لینک موجود در ایمیل تأیید را باز کنید.'

  const onResend = async (data: ForgotPasswordFormData) => {
    setResendError(null)
    const { error } = await resendConfirmationUseCase(data.email)
    if (error) setResendError(error.message)
    else setResent(true)
  }

  const onApplyPasted = async () => {
    setPasteResult(null)
    setApplying(true)
    try {
      const { outcome: result } = await applyPastedConfirmation(pasteText)
      if (result === 'confirmed') {
        void navigate('/login?confirmed=1', { replace: true })
        return
      }
      setPasteResult(result)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logo} aria-hidden="true">
            ✉️
          </div>
          <h1 className={styles.title}>تأیید ایمیل</h1>
          <p className={styles.subtitle}>وضعیت تأیید حساب شما</p>
        </div>

        <div className={tone} role={outcome === 'already' ? 'status' : 'alert'}>
          {message}
        </div>

        {resent ? (
          <div className={styles.success} role="status">
            لینک تأیید جدید به ایمیل شما ارسال شد.
          </div>
        ) : (
          <form
            onSubmit={e => {
              void form.handleSubmit(onResend)(e)
            }}
            noValidate
            className={styles.form}
          >
            <FormField
              label="ارسال دوباره لینک تأیید"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              hint="ایمیل حسابی که ساخته‌اید"
              {...form.register('email')}
              error={form.formState.errors.email}
            />

            {resendError && (
              <div className={styles.serverError} role="alert">
                {resendError}
              </div>
            )}

            <Button type="submit" fullWidth loading={form.formState.isSubmitting}>
              ارسال لینک جدید
            </Button>
          </form>
        )}

        <div className={styles.pasteBlock}>
          <h2 className={styles.pasteTitle}>لینک باز نشد؟</h2>
          <p className={styles.pasteHint}>
            لینک تأیید را از ایمیل کپی کنید و در کادر زیر بچسبانید تا همین‌جا بررسی شود.
          </p>
          <textarea
            className={styles.textarea}
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            rows={3}
            dir="ltr"
            spellCheck={false}
            placeholder="barberapp://confirm-email#..."
            aria-label="لینک تأیید ایمیل"
          />
          {pasteResult && (
            <div className={styles.serverError} role="alert">
              {CONFIRM_MESSAGES[pasteResult]}
            </div>
          )}
          <Button
            fullWidth
            loading={applying}
            disabled={!pasteText.trim()}
            onClick={() => {
              void onApplyPasted()
            }}
          >
            بررسی لینک
          </Button>
        </div>

        <div className={styles.footer}>
          <Link to="/login" className={styles.link}>
            ورود به حساب
          </Link>
        </div>
      </div>
    </div>
  )
}
