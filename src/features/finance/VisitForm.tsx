/**
 * VisitForm — record a walk-in visit with services and an optional payment.
 */
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, type ChangeEvent } from 'react'
import { visitSchema, type VisitFormData, PAYMENT_METHOD_LABELS } from './finance.schemas'
import { FormField } from '@shared/components/forms/FormField'
import { JalaliDateInput } from '@shared/components/forms/JalaliDateInput'
import { Button } from '@shared/components/ui/Button'
import { useCustomers } from '@features/customers/customers.hooks'
import { useServices } from '@features/services/services.hooks'
import { todayISO } from '@shared/utils/jalali'
import { formatToman, storageToToman } from '@shared/utils/helpers'
import styles from './FinanceForm.module.css'

interface RawVisitFormValues {
  customer_id: string
  date: string
  time: string
  notes: string
  payment_method: 'cash' | 'card' | 'other'
  paid_amount: string
  services: Array<{
    service_id: string
    service_name_snapshot: string
    quantity: string
    unit_price: string
    discount_amount: string
    duration_minutes: string
  }>
}

interface VisitFormProps {
  defaultDate?: string
  onSubmit: (data: VisitFormData) => Promise<void>
  onCancel: () => void
  error?: string | null
}

export function VisitForm({ defaultDate, onSubmit, onCancel, error }: VisitFormProps) {
  const { data: customers = [] } = useCustomers()
  const { data: services = [] } = useServices(true)
  const submitLock = useRef(false)

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RawVisitFormValues>({
    resolver: zodResolver(visitSchema) as never,
    defaultValues: {
      customer_id: '',
      date: defaultDate ?? todayISO(),
      time: '10:00',
      notes: '',
      payment_method: 'cash',
      paid_amount: '',
      services: [
        {
          service_id: '',
          service_name_snapshot: '',
          quantity: '1',
          unit_price: '',
          discount_amount: '',
          duration_minutes: '',
        },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'services' })

  const watchDate = watch('date')
  const watchServices = watch('services')

  const serviceTotal = (watchServices ?? []).reduce((sum, line) => {
    const qty = parseInt(line.quantity, 10) || 1
    const price = Number((line.unit_price ?? '').replace(/,/g, '')) || 0
    const discount = Number((line.discount_amount ?? '').replace(/,/g, '')) || 0
    return sum + Math.max(qty * price - discount, 0)
  }, 0)

  const handleServiceSelect = (index: number, serviceId: string) => {
    const svc = services.find(s => s.id === serviceId)
    if (!svc) return
    setValue(`services.${index}.service_name_snapshot`, svc.name)
    if (svc.default_price != null) {
      setValue(`services.${index}.unit_price`, String(storageToToman(svc.default_price)))
    }
    if (svc.suggested_duration_minutes != null) {
      setValue(`services.${index}.duration_minutes`, String(svc.suggested_duration_minutes))
    }
  }

  return (
    <form
      onSubmit={e => {
        void handleSubmit(async data => {
          if (submitLock.current) return
          submitLock.current = true
          try {
            await onSubmit(data as unknown as VisitFormData)
          } finally {
            submitLock.current = false
          }
        })(e)
      }}
      noValidate
      className={styles.form}
    >
      <div className={styles.field}>
        <label className={styles.label}>مشتری (اختیاری)</label>
        <select className={styles.select} {...register('customer_id')}>
          <option value="">— بدون مشتری —</option>
          {customers.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.row}>
        <JalaliDateInput
          label="تاریخ"
          required
          value={watchDate}
          onChange={next => setValue('date', next, { shouldValidate: true })}
          error={errors.date?.message}
        />
        <FormField label="ساعت" type="time" required {...register('time')} error={errors.time} />
      </div>

      <div className={styles.servicesSection}>
        <div className={styles.servicesSectionHeader}>
          <span className={styles.label}>خدمات</span>
          <button
            type="button"
            className={styles.addServiceBtn}
            onClick={() =>
              append({
                service_id: '',
                service_name_snapshot: '',
                quantity: '1',
                unit_price: '',
                discount_amount: '',
                duration_minutes: '',
              })
            }
          >
            + افزودن خدمت
          </button>
        </div>

        {fields.map((field, index) => (
          <div key={field.id} className={styles.serviceLine}>
            <div className={styles.serviceLineFull}>
              <select
                className={styles.select}
                {...register(`services.${index}.service_id`, {
                  onChange: (e: ChangeEvent<HTMLSelectElement>) =>
                    handleServiceSelect(index, e.target.value),
                })}
              >
                <option value="">— انتخاب خدمت —</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <input
              className={styles.serviceInput}
              placeholder="نام خدمت *"
              dir="auto"
              {...register(`services.${index}.service_name_snapshot`)}
            />
            {errors.services?.[index]?.service_name_snapshot && (
              <p className={styles.fieldError}>
                {errors.services[index].service_name_snapshot.message}
              </p>
            )}

            <input
              className={styles.serviceInput}
              placeholder="تعداد"
              inputMode="numeric"
              dir="ltr"
              {...register(`services.${index}.quantity`)}
            />

            <input
              className={styles.serviceInput}
              placeholder="قیمت واحد (تومان)"
              inputMode="numeric"
              dir="ltr"
              {...register(`services.${index}.unit_price`)}
            />

            <input
              className={styles.serviceInput}
              placeholder="تخفیف (تومان)"
              inputMode="numeric"
              dir="ltr"
              {...register(`services.${index}.discount_amount`)}
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

      <div className={styles.summary}>
        <span>مبلغ خدمات</span>
        <span className={styles.summaryValue}>{formatToman(serviceTotal * 100)}</span>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>روش پرداخت</label>
        <div className={styles.methodGroup}>
          {(['cash', 'card', 'other'] as const).map(m => (
            <label key={m} className={styles.methodLabel}>
              <input type="radio" value={m} {...register('payment_method')} />
              {PAYMENT_METHOD_LABELS[m]}
            </label>
          ))}
        </div>
      </div>

      <FormField
        label="مبلغ دریافت‌شده (تومان)"
        type="text"
        inputMode="numeric"
        placeholder="اختیاری — خالی یعنی فعلاً پرداختی ثبت نشود"
        {...register('paid_amount')}
        error={errors.paid_amount}
      />

      <div className={styles.field}>
        <label className={styles.label}>یادداشت</label>
        <textarea
          className={styles.textarea}
          rows={2}
          placeholder="اختیاری"
          dir="auto"
          {...register('notes')}
        />
      </div>

      {error && (
        <div className={styles.serverError} role="alert">
          {error}
        </div>
      )}

      <div className={styles.actions}>
        <Button type="button" variant="ghost" onClick={onCancel} fullWidth>
          انصراف
        </Button>
        <Button type="submit" fullWidth loading={isSubmitting}>
          ثبت ویزیت
        </Button>
      </div>
    </form>
  )
}
