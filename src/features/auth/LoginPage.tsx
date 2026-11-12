import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { loginSchema, type LoginFormData } from './auth.schemas'
import { loginUseCase } from './auth.usecases'
import { FormField } from '@shared/components/forms/FormField'
import { Button } from '@shared/components/ui/Button'
import styles from './AuthPage.module.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null)
    const { error } = await loginUseCase(data)
    if (error) {
      setServerError(error.message)
    } else {
      void navigate('/dashboard', { replace: true })
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {/* Logo / Header */}
        <div className={styles.header}>
          <div className={styles.logo} aria-hidden="true">
            ✂️
          </div>
          <h1 className={styles.title}>ورود به حساب</h1>
          <p className={styles.subtitle}>خوش برگشتی! اطلاعاتت رو وارد کن</p>
        </div>

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

          <FormField
            label="رمز عبور"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
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

          {serverError && (
            <div className={styles.serverError} role="alert">
              {serverError}
            </div>
          )}

          <Button type="submit" fullWidth loading={isSubmitting} size="lg">
            ورود
          </Button>
        </form>

        <div className={styles.footer}>
          <Link to="/register" className={styles.link}>
            حساب ندارم — ثبت‌نام
          </Link>
        </div>
      </div>
    </div>
  )
}
