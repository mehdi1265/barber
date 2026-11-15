import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useAppointment,
  useAppointmentServices,
  useUpdateAppointment,
  useUpdateAppointmentStatus,
  useDeleteAppointment,
} from './appointments.hooks'
import { AppointmentForm } from './AppointmentForm'
import { PageHeader } from '@shared/components/ui/PageHeader'
import { Button } from '@shared/components/ui/Button'
import { ConfirmDialog } from '@shared/components/ui/ConfirmDialog'
import { LoadingScreen } from '@shared/components/ui/LoadingScreen'
import { formatJalaliDateFull, formatTimeRange, applyTimeToDate } from '@shared/utils/jalali'
import { formatToman } from '@shared/utils/helpers'
import { STATUS_LABELS, STATUS_COLORS, type AppointmentFormData } from './appointments.schemas'
import type { AppointmentStatus } from '@shared/types'
import styles from './AppointmentDetailPage.module.css'

const NEXT_STATUS: Record<AppointmentStatus, AppointmentStatus | null> = {
  reserved: 'confirmed',
  confirmed: 'completed',
  completed: null,
  cancelled: null,
  no_show: null,
}

const NEXT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  reserved: '✓ تأیید نوبت',
  confirmed: '✓ انجام شد',
  completed: '',
  cancelled: '',
  no_show: '',
}

export default function AppointmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showNoShowConfirm, setShowNoShowConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const { data: appointment, isLoading } = useAppointment(id!)
  const { data: services = [], isLoading: servicesLoading } = useAppointmentServices(id!)
  const updateStatusMutation = useUpdateAppointmentStatus()
  const updateMutation = useUpdateAppointment()
  const deleteMutation = useDeleteAppointment()

  const handleStatusChange = async (status: AppointmentStatus) => {
    await updateStatusMutation.mutateAsync({ id: id!, status })
  }

  const handleCancel = async () => {
    await handleStatusChange('cancelled')
    setShowCancelConfirm(false)
  }

  const handleNoShow = async () => {
    await handleStatusChange('no_show')
    setShowNoShowConfirm(false)
  }

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(id!)
    void navigate('/appointments', { replace: true })
  }

  const handleUpdate = async (data: AppointmentFormData) => {
    setEditError(null)
    try {
      await updateMutation.mutateAsync({
        id: id!,
        input: {
          customer_id: data.customer_id ?? null,
          title: data.title,
          start_at: applyTimeToDate(data.date, data.time),
          duration_minutes: data.duration_minutes,
          notes: data.notes ?? null,
          services: data.services.map(svc => ({
            service_id: svc.service_id ?? null,
            service_name_snapshot: svc.service_name_snapshot,
            price: Number(svc.price) || 0,
            duration_minutes: svc.duration_minutes ?? null,
          })),
        },
      })
      setIsEditing(false)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'خطایی رخ داد')
    }
  }

  if (isLoading) return <LoadingScreen message="در حال بارگذاری نوبت…" />

  if (!appointment) {
    return (
      <div className={styles.notFound}>
        <p>نوبت پیدا نشد</p>
        <Button
          variant="ghost"
          onClick={() => {
            void navigate('/appointments')
          }}
        >
          بازگشت
        </Button>
      </div>
    )
  }

  if (isEditing) {
    return (
      <div className={styles.page} dir="rtl">
        <PageHeader title="ویرایش نوبت" />
        <div className={styles.content}>
          <div className={styles.card}>
            <AppointmentForm
              initial={{
                customer_id: appointment.customer_id,
                title: appointment.title,
                start_at: appointment.start_at,
                duration_minutes: appointment.duration_minutes,
                notes: appointment.notes,
                services: services.map(svc => ({
                  service_id: svc.service_id,
                  service_name_snapshot: svc.service_name_snapshot,
                  price: svc.price,
                  duration_minutes: svc.duration_minutes,
                })),
              }}
              onSubmit={handleUpdate}
              onCancel={() => setIsEditing(false)}
              submitLabel="ذخیره تغییرات"
              error={editError}
            />
          </div>
        </div>
      </div>
    )
  }

  const nextStatus = NEXT_STATUS[appointment.status]
  const totalAmount = services.reduce((sum, s) => sum + s.price, 0)

  return (
    <div className={styles.page} dir="rtl">
      <PageHeader
        title={appointment.title}
        backTo="/appointments"
        actions={
          <Button
            size="sm"
            variant="ghost"
            disabled={servicesLoading}
            onClick={() => {
              setEditError(null)
              setIsEditing(true)
            }}
          >
            ویرایش
          </Button>
        }
      />

      <div className={styles.content}>
        {/* Status banner */}
        <div
          className={styles.statusBanner}
          style={{
            background: STATUS_COLORS[appointment.status] + '18',
            borderColor: STATUS_COLORS[appointment.status] + '44',
          }}
        >
          <span className={styles.statusText} style={{ color: STATUS_COLORS[appointment.status] }}>
            {STATUS_LABELS[appointment.status]}
          </span>

          {nextStatus && (
            <Button
              size="sm"
              onClick={() => {
                void handleStatusChange(nextStatus)
              }}
              loading={updateStatusMutation.isPending}
            >
              {NEXT_STATUS_LABEL[appointment.status]}
            </Button>
          )}
        </div>

        {/* Time info */}
        <div className={styles.card}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>تاریخ</span>
            <span className={styles.infoValue}>{formatJalaliDateFull(appointment.start_at)}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>ساعت</span>
            <span className={styles.infoValue} dir="ltr">
              {formatTimeRange(appointment.start_at, appointment.end_at)}
            </span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>مدت</span>
            <span className={styles.infoValue}>{appointment.duration_minutes} دقیقه</span>
          </div>
        </div>

        {/* Services */}
        {services.length > 0 && (
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>خدمات</h3>
            {services.map(svc => (
              <div key={svc.id} className={styles.serviceRow}>
                <span className={styles.serviceName}>{svc.service_name_snapshot}</span>
                <span className={styles.servicePrice} dir="rtl">
                  {formatToman(svc.price)}
                </span>
              </div>
            ))}
            {services.length > 1 && (
              <div className={[styles.serviceRow, styles.totalRow].join(' ')}>
                <span className={styles.totalLabel}>جمع کل</span>
                <span className={styles.totalAmount} dir="rtl">
                  {formatToman(totalAmount)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {appointment.notes && (
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>یادداشت</h3>
            <p className={styles.notes}>{appointment.notes}</p>
          </div>
        )}

        {/* Actions */}
        {appointment.status !== 'cancelled' && appointment.status !== 'no_show' && (
          <div className={styles.dangerActions}>
            <Button variant="ghost" fullWidth onClick={() => setShowNoShowConfirm(true)}>
              عدم مراجعه
            </Button>
            <Button variant="danger" fullWidth onClick={() => setShowCancelConfirm(true)}>
              لغو نوبت
            </Button>
          </div>
        )}

        <div className={styles.dangerActions}>
          <Button variant="ghost" fullWidth onClick={() => setShowDeleteConfirm(true)}>
            حذف نوبت
          </Button>
        </div>
      </div>

      {/* Cancel confirm */}
      <ConfirmDialog
        isOpen={showCancelConfirm}
        title="لغو نوبت"
        message={`آیا نوبت «${appointment.title}» را لغو می‌کنید؟`}
        confirmLabel="بله، لغو شود"
        cancelLabel="نه"
        danger
        onConfirm={() => {
          void handleCancel()
        }}
        onCancel={() => setShowCancelConfirm(false)}
      />

      {/* No-show confirm */}
      <ConfirmDialog
        isOpen={showNoShowConfirm}
        title="عدم مراجعه"
        message="مشتری مراجعه نکرد؟"
        confirmLabel="بله"
        cancelLabel="انصراف"
        danger
        onConfirm={() => {
          void handleNoShow()
        }}
        onCancel={() => setShowNoShowConfirm(false)}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="حذف نوبت"
        message={`نوبت «${appointment.title}» از همه فهرست‌ها حذف می‌شود. ادامه می‌دهید؟`}
        confirmLabel="بله، حذف شود"
        cancelLabel="انصراف"
        danger
        onConfirm={() => {
          setShowDeleteConfirm(false)
          void handleDelete()
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  )
}
