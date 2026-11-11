import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
} from './customers.hooks'
import { CustomerForm } from './CustomerForm'
import { PageHeader } from '@shared/components/ui/PageHeader'
import { Button } from '@shared/components/ui/Button'
import { Modal } from '@shared/components/ui/Modal'
import { ConfirmDialog } from '@shared/components/ui/ConfirmDialog'
import { LoadingScreen } from '@shared/components/ui/LoadingScreen'
import type { CustomerFormData } from './customers.schemas'
import styles from './CustomerDetailPage.module.css'

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const { data: customer, isLoading } = useCustomer(id!)
  const updateMutation = useUpdateCustomer()
  const deleteMutation = useDeleteCustomer()

  const handleUpdate = async (data: CustomerFormData) => {
    await updateMutation.mutateAsync({ id: id!, input: data })
    setShowEditModal(false)
  }

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(id!)
    navigate('/customers', { replace: true })
  }

  if (isLoading) return <LoadingScreen message="در حال بارگذاری پرونده…" />

  if (!customer) {
    return (
      <div className={styles.notFound}>
        <p>مشتری پیدا نشد</p>
        <Button variant="ghost" onClick={() => navigate('/customers')}>
          بازگشت
        </Button>
      </div>
    )
  }

  return (
    <div className={styles.page} dir="rtl">
      <PageHeader
        title={customer.name}
        backTo="/customers"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowEditModal(true)}
            aria-label="ویرایش مشتری"
          >
            ✏️ ویرایش
          </Button>
        }
      />

      <div className={styles.content}>
        {/* Profile card */}
        <div className={styles.card}>
          <div className={styles.avatarLarge} aria-hidden="true">
            {customer.name.charAt(0)}
          </div>
          <h2 className={styles.customerName}>{customer.name}</h2>

          {customer.phone && (
            <a
              href={`tel:${customer.phone}`}
              className={styles.phoneLinkLarge}
              dir="ltr"
            >
              📞 {customer.phone}
            </a>
          )}
        </div>

        {/* Notes */}
        {customer.notes && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>یادداشت</h3>
            <p className={styles.notes}>{customer.notes}</p>
          </section>
        )}

        {/* Visit history placeholder — will be populated in Phase 3/4 */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>تاریخچه مراجعات</h3>
          <p className={styles.placeholder}>
            پس از ثبت اولین مراجعه، تاریخچه اینجا نمایش داده می‌شود.
          </p>
        </section>

        {/* Financial summary placeholder */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>خلاصه مالی</h3>
          <p className={styles.placeholder}>
            بعد از ثبت پرداخت، اطلاعات مالی اینجا می‌آید.
          </p>
        </section>

        {/* Danger zone */}
        <div className={styles.dangerZone}>
          <Button
            variant="danger"
            fullWidth
            onClick={() => setShowDeleteConfirm(true)}
          >
            🗑️ حذف پرونده مشتری
          </Button>
        </div>
      </div>

      {/* Edit modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="ویرایش مشتری"
      >
        <CustomerForm
          defaultValues={customer}
          onSubmit={handleUpdate}
          onCancel={() => setShowEditModal(false)}
          submitLabel="ذخیره تغییرات"
        />
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="حذف مشتری"
        message={`آیا مطمئن هستید که می‌خواهید پرونده «${customer.name}» را حذف کنید؟ این عمل قابل بازگشت نیست.`}
        confirmLabel="بله، حذف شود"
        cancelLabel="انصراف"
        danger
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  )
}
