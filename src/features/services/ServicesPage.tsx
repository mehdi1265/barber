/**
 * ServicesPage — manage the barber's service catalog.
 * Accessible from Settings page.
 */
import { useState } from 'react'
import { useServices, useCreateService, useUpdateService, useDeactivateService } from './services.hooks'
import { ServiceForm } from './ServiceForm'
import { PageHeader } from '@shared/components/ui/PageHeader'
import { Button } from '@shared/components/ui/Button'
import { Modal } from '@shared/components/ui/Modal'
import { ConfirmDialog } from '@shared/components/ui/ConfirmDialog'
import { EmptyState } from '@shared/components/ui/EmptyState'
import { LoadingScreen } from '@shared/components/ui/LoadingScreen'
import { formatToman } from '@shared/utils/helpers'
import type { Service } from '@shared/types'
import type { ServiceFormData } from './services.schemas'
import styles from './ServicesPage.module.css'

export default function ServicesPage() {
  const [showAdd, setShowAdd] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null)

  const { data: services, isLoading } = useServices(true)
  const createMutation = useCreateService()
  const updateMutation = useUpdateService()
  const deactivateMutation = useDeactivateService()

  const handleCreate = async (data: ServiceFormData) => {
    await createMutation.mutateAsync(data)
    setShowAdd(false)
  }

  const handleUpdate = async (data: ServiceFormData) => {
    if (!editingService) return
    await updateMutation.mutateAsync({ id: editingService.id, input: data })
    setEditingService(null)
  }

  const handleDeactivate = async () => {
    if (!deactivatingId) return
    await deactivateMutation.mutateAsync(deactivatingId)
    setDeactivatingId(null)
  }

  if (isLoading) return <LoadingScreen message="در حال بارگذاری خدمات…" />

  return (
    <div className={styles.page} dir="rtl">
      <PageHeader
        title="خدمات"
        backTo="/settings"
        actions={
          <Button size="sm" onClick={() => setShowAdd(true)}>
            + خدمت
          </Button>
        }
      />

      {!services || services.length === 0 ? (
        <EmptyState
          icon="💇"
          title="هنوز خدمتی ندارید"
          description="خدمات خود را اضافه کنید تا در ثبت نوبت پیشنهاد داده شوند"
          action={<Button onClick={() => setShowAdd(true)}>+ خدمت جدید</Button>}
        />
      ) : (
        <ul className={styles.list} role="list">
          {services.map(service => (
            <li key={service.id} className={styles.item}>
              <div className={styles.info}>
                <span className={styles.name}>{service.name}</span>
                <div className={styles.meta}>
                  {service.default_price != null && (
                    <span className={styles.price}>
                      {formatToman(service.default_price)}
                    </span>
                  )}
                  {service.suggested_duration_minutes != null && (
                    <span className={styles.duration}>
                      ⏱ {service.suggested_duration_minutes} دقیقه
                    </span>
                  )}
                </div>
              </div>
              <div className={styles.itemActions}>
                <button
                  className={styles.editBtn}
                  onClick={() => setEditingService(service)}
                  aria-label={`ویرایش ${service.name}`}
                >
                  ✏️
                </button>
                <button
                  className={styles.deleteBtn}
                  onClick={() => setDeactivatingId(service.id)}
                  aria-label={`غیرفعال کردن ${service.name}`}
                >
                  🗑️
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Add modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="خدمت جدید">
        <ServiceForm
          onSubmit={handleCreate}
          onCancel={() => setShowAdd(false)}
          submitLabel="افزودن خدمت"
        />
      </Modal>

      {/* Edit modal */}
      <Modal
        isOpen={!!editingService}
        onClose={() => setEditingService(null)}
        title="ویرایش خدمت"
      >
        {editingService && (
          <ServiceForm
            defaultValues={editingService}
            onSubmit={handleUpdate}
            onCancel={() => setEditingService(null)}
            submitLabel="ذخیره تغییرات"
          />
        )}
      </Modal>

      {/* Deactivate confirm */}
      <ConfirmDialog
        isOpen={!!deactivatingId}
        title="غیرفعال کردن خدمت"
        message="این خدمت از لیست حذف می‌شود اما سوابق قدیمی حفظ می‌شوند."
        confirmLabel="غیرفعال شود"
        cancelLabel="انصراف"
        danger
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivatingId(null)}
      />
    </div>
  )
}
