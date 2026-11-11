import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { serviceSchema, type ServiceFormData } from './services.schemas'
import { FormField } from '@shared/components/forms/FormField'
import { Button } from '@shared/components/ui/Button'
import type { Service } from '@shared/types'
import { storageToToman } from '@shared/utils/helpers'
import styles from './ServiceForm.module.css'

// Raw string values used in the HTML form inputs before Zod transformation
interface ServiceRawInput {
  name: string
  default_price: string
  suggested_duration_minutes: string
}

interface ServiceFormProps {
  defaultValues?: Partial<Service>
  onSubmit: (data: ServiceFormData) => Promise<void>
  onCancel: () => void
  submitLabel?: string
}

export function ServiceForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = 'ذخیره',
}: ServiceFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ServiceRawInput>({
    resolver: zodResolver(serviceSchema) as never,
    defaultValues: {
      name: defaultValues?.name ?? '',
      default_price:
        defaultValues?.default_price != null
          ? String(storageToToman(defaultValues.default_price))
          : '',
      suggested_duration_minutes:
        defaultValues?.suggested_duration_minutes != null
          ? String(defaultValues.suggested_duration_minutes)
          : '',
    },
  })

  return (
    <form
      onSubmit={handleSubmit(data => onSubmit(data as unknown as ServiceFormData))}
      noValidate
      className={styles.form}
    >
      <FormField
        label="نام خدمت"
        type="text"
        required
        placeholder="مثلاً: کوتاهی، رنگ کامل"
        {...register('name')}
        error={errors.name}
      />

      <FormField
        label="قیمت پیش‌فرض (تومان)"
        type="text"
        inputMode="numeric"
        placeholder="اختیاری"
        hint="مثلاً: 150000"
        {...register('default_price')}
        error={errors.default_price}
      />

      <FormField
        label="مدت پیشنهادی (دقیقه)"
        type="number"
        inputMode="numeric"
        min={1}
        placeholder="اختیاری — مثلاً: 60"
        hint="این فقط پیشنهاد است؛ هر نوبت مدت مستقل دارد"
        {...register('suggested_duration_minutes')}
        error={errors.suggested_duration_minutes}
      />

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
