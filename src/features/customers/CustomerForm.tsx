import { useForm } from 'react-hook-form'
import type { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { customerSchema, type CustomerFormData } from './customers.schemas'
import { FormField } from '@shared/components/forms/FormField'
import { Button } from '@shared/components/ui/Button'
import type { Customer } from '@shared/types'
import styles from './CustomerForm.module.css'

interface CustomerFormProps {
  defaultValues?: Partial<Customer>
  onSubmit: (data: CustomerFormData) => Promise<void>
  onCancel: () => void
  submitLabel?: string
}

export function CustomerForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = 'ذخیره',
}: CustomerFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof customerSchema>, unknown, CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      phone: defaultValues?.phone ?? '',
      notes: defaultValues?.notes ?? '',
    },
  })

  return (
    <form
      onSubmit={e => {
        void handleSubmit(onSubmit)(e)
      }}
      noValidate
      className={styles.form}
    >
      <FormField
        label="نام"
        type="text"
        autoComplete="name"
        required
        placeholder="نام مشتری"
        {...register('name')}
        error={errors.name}
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

      <div className={styles.notesWrapper}>
        <label htmlFor="notes-field" className={styles.label}>
          یادداشت
        </label>
        <textarea
          id="notes-field"
          className={styles.textarea}
          rows={3}
          placeholder="اختیاری — مثلاً حساسیت یا نکات خاص"
          {...register('notes')}
          dir="auto"
        />
        {errors.notes && (
          <p className={styles.errorMsg} role="alert">
            {errors.notes.message}
          </p>
        )}
      </div>

      <div className={styles.actions}>
        <Button type="button" variant="ghost" onClick={onCancel} fullWidth>
          انصراف
        </Button>
        <Button type="submit" fullWidth loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
