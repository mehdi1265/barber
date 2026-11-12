import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { registerSchema, type RegisterFormData } from './auth.schemas'
import { registerUseCase } from './auth.usecases'
import { FormField } from '@shared/components/forms/FormField'
import { Button } from '@shared/components/ui/Button'
import styles from './AuthPage.module.css'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  })

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null)
    const { error } = await registerUseCase(data)
    if (error) {
      setServerError(error.message)
    } else {
      void navigate('/dashboard', { replace: true })
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logo} aria-hidden="true">✂️</div>
          <h1 className={styles.title}>ساخت حساب جدید</h1>
          <p className={styles.subtitle}>اطلاعاتت رو وارد کن تا شروع کنیم</p>
        </div>

        <form
          onSubmit={e => {
            void handleSubmit(onSubmit)(e)
          }}
          noValidate
          className={styles.form}
        >
          <FormField
            label="نام نمایشی"
            type="text"
            autoComplete="name"
            placeholder="مثلاً: علی احمدی"
            required
            {...register('display_name')}
            error={errors.display_name}
          />

          <FormField
            label="ایمیل"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            {...register('email')}
            error={errors.email}
          />

          <FormField
            label="رمز عبور"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            hint="حداقل ۸ کاراکتر، شامل حرف و عدد"
            {...register('password')}
            error={errors.password}
            endAdornment={
              <button
                type="button"
                className={styles.showHideBtn}
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'مخفی کردن رمز' : 'نمایش رمز'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            }
          />

          <FormField
            label="تکرار رمز عبور"
            type={showPassword ? 'text' : 'password'}
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
            ثبت‌نام
          </Button>
        </form>

        <div className={styles.footer}>
          <Link to="/login" className={styles.link}>
            حساب دارم — ورود
          </Link>
        </div>
      </div>
    </div>
  )
}
