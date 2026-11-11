/**
 * AppointmentForm — create/edit an appointment with multiple services.
 */
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { appointmentSchema, type AppointmentFormData } from './appointments.schemas'
import { FormField } from '@shared/components/forms/FormField'
import { Button } from '@shared/components/ui/Button'
import { useCustomers } from '@features/customers/customers.hooks'
import { useServices } from '@features/services/services.hooks'
import {
  todayISO,
  formatTime,
  applyTimeToDate,
} from '@shared/utils/jalali'
import { calcEndAt, storageToToman } from '@shared/utils/helpers'
import styles from './AppointmentForm.module.css'

// raw form field types (strings from inputs)
interface RawFormValues {
  customer_id: string
  title: string
  date: string
  time: string
  duration_minutes: string
  notes: string
  services: Array<{
    service_id: string
    service_name_snapshot: string
    price: string
    duration_minutes: string
  }>
}

interface AppointmentFormProps {
  defaultDate?: string   // YYYY-MM-DD
  onSubmit: (data: AppointmentFormData) => Promise<void>
  onCancel: () => void
  submitLabel?: string
  error?: string | null
}

export function AppointmentForm({
  defaultDate,
  onSubmit,
  onCancel,
  submitLabel = 'ذخیره نوبت',
  error,
}: AppointmentFormProps) {
  const { data: customers = [] } = useCustomers()
  const { data: services = [] } = useServices(true)
  const [previewEnd, setPreviewEnd] = useState<string | null>(null)

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RawFormValues>({
    resolver: zodResolver(appointmentSchema) as never,
    defaultValues: {
      customer_id: '',
      title: '',
      date: defaultDate ?? todayISO(),
      time: '09:00',
      duration_minutes: '60',
      notes: '',
      services: [{ service_id: '', service_name_snapshot: '', price: '', duration_minutes: '' }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'services' })

  // Live preview of end time
  const watchDate = watch('date')
  const watchTime = watch('time')
  const watchDuration = watch('duration_minutes')
  const updatePreview = () => {
    try {
      const startISO = applyTimeToDate(`${watchDate}T12:00:00Z`, watchTime)
      const dur = parseInt(watchDuration, 10)
      if (!isNaN(dur) && dur > 0) {
        setPreviewEnd(formatTime(calcEndAt(startISO, dur)))
      }
    } catch { /* ignore */ }
  }

  // When service is selected from dropdown, fill name + price
  const handleServiceSelect = (index: number, serviceId: string) => {
    const svc = services.find(s => s.id === serviceId)
    if (svc) {
      setValue(`services.${index}.service_name_snapshot`, svc.name)
      if (svc.default_price != null) {
        setValue(`services.${index}.price`, String(storageToToman(svc.default_price)))
      }
      if (svc.suggested_duration_minutes != null) {
        setValue(`services.${index}.duration_minutes`, String(svc.suggested_duration_minutes))
      }
    }
  }

  return (
    <form
      onSubmit={handleSubmit(data => onSubmit(data as unknown as AppointmentFormData))}
      noValidate
      className={styles.form}
    >
      {/* Customer (optional) */}
      <div className={styles.field}>
        <label className={styles.label}>مشتری (اختیاری)</label>
        <select className={styles.select} {...register('customer_id')}>
          <option value="">— بدون مشتری —</option>
          {customers.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Title */}
      <FormField
        label="عنوان نوبت"
        type="text"
        required
        placeholder="مثلاً: کوتاهی + ریش"
        {...register('title')}
        error={errors.title}
      />

      {/* Date + Time row */}
      <div className={styles.row}>
        <FormField
          label="تاریخ"
          type="date"
          required
          {...register('date', { onChange: updatePreview })}
          error={errors.date}
        />
        <FormField
          label="ساعت شروع"
          type="time"
          required
          {...register('time', { onChange: updatePreview })}
          error={errors.time}
        />
      </div>

      {/* Duration + end preview */}
      <div className={styles.durationRow}>
        <div className={styles.durationField}>
          <FormField
            label="مدت (دقیقه)"
            type="number"
            inputMode="numeric"
            min={1}
            required
            {...register('duration_minutes', { onChange: updatePreview })}
            error={errors.duration_minutes as never}
          />
        </div>
        {previewEnd && (
          <div className={styles.endPreview}>
            <span className={styles.endLabel}>پایان</span>
            <span className={styles.endTime}>{previewEnd}</span>
          </div>
        )}
      </div>

      {/* Services */}
      <div className={styles.servicesSection}>
        <div className={styles.servicesSectionHeader}>
          <span className={styles.label}>خدمات</span>
          <button
            type="button"
            className={styles.addServiceBtn}
            onClick={() =>
              append({ service_id: '', service_name_snapshot: '', price: '', duration_minutes: '' })
            }
          >
            + افزودن خدمت
          </button>
        </div>

        {fields.map((field, index) => (
          <div key={field.id} className={styles.serviceLine}>
            {/* Service dropdown */}
            <div className={styles.serviceSelectWrapper}>
              <select
                className={styles.select}
                {...register(`services.${index}.service_id`, {
                  onChange: e => handleServiceSelect(index, e.target.value),
                })}
              >
                <option value="">— انتخاب خدمت —</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Custom name */}
            <input
              className={styles.serviceInput}
              placeholder="نام خدمت *"
              dir="auto"
              {...register(`services.${index}.service_name_snapshot`)}
            />
            {errors.services?.[index]?.service_name_snapshot && (
              <p className={styles.fieldError}>
                {errors.services[index]!.service_name_snapshot!.message}
              </p>
            )}

            {/* Price */}
            <input
              className={styles.serviceInput}
              placeholder="قیمت (تومان)"
              inputMode="numeric"
              dir="ltr"
              {...register(`services.${index}.price`)}
            />

            {fields.length > 1 && (
              <button
                type="button"
                className={styles.removeServiceBtn}
                onClick={() => remove(index)}
                aria-label="حذف این خدمت"
              >
                🗑️
              </button>
            )}
          </div>
        ))}

        {errors.services?.root && (
          <p className={styles.fieldError}>{errors.services.root.message}</p>
        )}
      </div>

      {/* Notes */}
      <div className={styles.field}>
        <label htmlFor="appt-notes" className={styles.label}>یادداشت</label>
        <textarea
          id="appt-notes"
          className={styles.textarea}
          rows={2}
          placeholder="اختیاری"
          dir="auto"
          {...register('notes')}
        />
      </div>

      {/* Server error */}
      {error && (
        <div className={styles.serverError} role="alert">{error}</div>
      )}

      {/* Actions */}
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
