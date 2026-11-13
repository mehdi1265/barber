/**
 * QuickSalePage — one screen: description, amount, payment, optional customer.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateVisit } from './finance.hooks'
import { QuickSaleForm } from './QuickSaleForm'
import type { QuickSaleFormData } from './finance.schemas'
import { PageHeader } from '@shared/components/ui/PageHeader'
import styles from './QuickSalePage.module.css'

export default function QuickSalePage() {
  const navigate = useNavigate()
  const createVisit = useCreateVisit()
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (data: QuickSaleFormData) => {
    setError(null)
    try {
      const paid = data.paid_amount ?? data.amount
      await createVisit.mutateAsync({
        customer_id: data.customer_id || null,
        is_quick_sale: true,
        notes: data.notes,
        services: [
          {
            service_name_snapshot: data.title,
            quantity: 1,
            unit_price: data.amount,
            discount_amount: 0,
          },
        ],
        payment: paid > 0 ? { amount: paid, method: data.payment_method } : null,
      })
      void navigate('/finance')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطایی در ثبت فروش رخ داد')
    }
  }

  return (
    <div className={styles.page} dir="rtl">
      <PageHeader title="فروش سریع" backTo="/finance" />
      <div className={styles.content}>
        <QuickSaleForm
          onSubmit={handleSubmit}
          onCancel={() => {
            void navigate('/finance')
          }}
          error={error}
        />
      </div>
    </div>
  )
}
