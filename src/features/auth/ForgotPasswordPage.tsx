import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { forgotPasswordSchema, type ForgotPasswordFormData } from './auth.schemas'
import { requestPasswordResetUseCase } from './auth.usecases'
import { FormField } from '@shared/components/forms/FormField'
import { Button } from '@shared/components/ui/Button'
import styles from './AuthPage.module.css'

export default function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [sentEmail, setSentEmail] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setServerError(null)
    const { error } = await requestPasswordResetUseCase(data.email)
    if (error) setServerError(error.message)
    else setSentEmail(data.email)
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logo} aria-hidden="true">
            🔑
          </div>
          <h1 className={styles.title}>بازیابی رمز عبور</h1>
          <p className={styles.subtitle}>ایمیل حساب خود را وارد کنید</p>
        </div>

        {sentEmail ? (
          <>
            <div className={styles.success} role="status">
              اگر این ایمیل در سیستم ثبت شده باشد، کد بازیابی و لینک آن برای شما ارسال شد. صندوق
              ورودی و پوشه هرزنامه را بررسی کنید.
            </div>
            <div className={styles.footer}>
              <Link
                to={`/reset-password?email=${encodeURIComponent(sentEmail)}`}
                className={styles.link}
              >
                وارد کردن کد بازیابی
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
              label="ایمیل"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              {...register('email')}
              error={errors.email}
            />

            {serverError && (
              <div className={styles.serverError} role="alert">
                {serverError}
              </div>
            )}

            <Button type="submit" fullWidth loading={isSubmitting} size="lg">
              ارسال لینک بازیابی
            </Button>
          </form>
        )}

        <div className={styles.footer}>
          <Link to="/login" className={styles.link}>
            بازگشت به ورود
          </Link>
        </div>
      </div>
    </div>
  )
}
