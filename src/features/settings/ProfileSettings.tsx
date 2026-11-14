import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { FormField } from '@shared/components/forms/FormField'
import { Button } from '@shared/components/ui/Button'
import { CURRENCY_OPTIONS } from '@shared/utils/currency'
import type { Profile } from '@shared/types'
import { profileSchema, type ProfileFormData } from './settings.schemas'
import styles from './ProfileSettings.module.css'

interface ProfileSettingsProps {
  profile: Profile | null
  saved: boolean
  error: string | null
  onSave: (data: ProfileFormData) => Promise<void>
}

export function ProfileSettings({ profile, saved, error, onSave }: ProfileSettingsProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof profileSchema>, unknown, ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      display_name: profile?.display_name ?? '',
      phone: profile?.phone ?? '',
      currency_code: profile?.currency_code ?? 'IRR',
    },
  })

  useEffect(() => {
    if (!profile) return
    reset({
      display_name: profile.display_name,
      phone: profile.phone ?? '',
      currency_code: profile.currency_code,
    })
  }, [profile, reset])

  return (
    <form
      className={styles.form}
      onSubmit={e => {
        void handleSubmit(onSave)(e)
      }}
      noValidate
    >
      <FormField
        label="نام نمایشی"
        type="text"
        autoComplete="name"
        required
        placeholder="مثلاً آرایشگاه رضا"
        {...register('display_name')}
        error={errors.display_name}
      />

      <FormField
        label="شماره تماس"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        placeholder="اختیاری"
        {...register('phone')}
        error={errors.phone}
      />

      <div className={styles.field}>
        <label htmlFor="currency-field" className={styles.label}>
          واحد پول
        </label>
        <select id="currency-field" className={styles.select} {...register('currency_code')}>
          {CURRENCY_OPTIONS.map(option => (
            <option key={option.code} value={option.code}>
              {option.label} ({option.code})
            </option>
          ))}
        </select>
        <p className={styles.hint}>
          تغییر واحد پول فقط برچسب نمایش را عوض می‌کند و مبالغ ذخیره‌شده هیچ تبدیلی نمی‌شوند.
        </p>
        {errors.currency_code && (
          <p className={styles.error} role="alert">
            {errors.currency_code.message}
          </p>
        )}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className={styles.saved} role="status">
          پروفایل ذخیره شد و برای همگام‌سازی در صف قرار گرفت.
        </p>
      )}

      <div className={styles.actions}>
        <Button type="submit" loading={isSubmitting}>
          ذخیره پروفایل
        </Button>
      </div>
    </form>
  )
}
