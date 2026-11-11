import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  useAppointment,
  useAppointmentServices,
  useUpdateAppointmentStatus,
  useDeleteAppointment,
} from './appointments.hooks'
import { PageHeader } from '@shared/components/ui/PageHeader'
import { Button } from '@shared/components/ui/Button'
import { ConfirmDialog } from '@shared/components/ui/ConfirmDialog'
import { LoadingScreen } from '@shared/components/ui/LoadingScreen'
import { formatJalaliDateFull, formatTimeRange } from '@shared/utils/jalali'
import { formatToman } from '@shared/utils/helpers'
import { STATUS_LABELS, STATUS_COLORS } from './appointments.schemas'
import type { AppointmentStatus } from '@shared/types'
import styles from './AppointmentDetailPage.module.css'

const NEXT_STATUS: Record<AppointmentStatus, AppointmentStatus | null> = {
  reserved:  'confirmed',
  confirmed: 'completed',
  completed: null,
  cancelled: null,
  no_show:   null,
}

const NEXT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  reserved:  '✓ تأیید نوبت',
  confirmed: '✓ انجام شد',
  completed: '',
  cancelled: '',
  no_show:   '',
}

export default function AppointmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showNoShowConfirm, setShowNoShowConfirm] = useState(false)

  const { data: appointment, isLoading } = useAppointment(id!)
  const { data: services = [] } = useAppointmentServices(id!)
  const updateStatusMutation = useUpdateAppointmentStatus()
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
    navigate('/appointments', { replace: true })
  }
  void handleDelete // referenced via delete button added in Phase 4

  if (isLoading) return <LoadingScreen message="در حال بارگذاری نوبت…" />

  if (!appointment) {
    return (
      <div className={styles.notFound}>
        <p>نوبت پیدا نشد</p>
        <Button variant="ghost" onClick={() => navigate('/appointments')}>بازگشت</Button>
      </div>
    )
  }

  const nextStatus = NEXT_STATUS[appointment.status]
  const totalAmount = services.reduce((sum, s) => sum + s.price, 0)

  return (
    <div className={styles.page} dir="rtl">
      <PageHeader title={appointment.title} backTo="/appointments" />

      <div className={styles.content}>
        {/* Status banner */}
        <div
          className={styles.statusBanner}
          style={{ background: STATUS_COLORS[appointment.status] + '18', borderColor: STATUS_COLORS[appointment.status] + '44' }}
        >
          <span
            className={styles.statusText}
            style={{ color: STATUS_COLORS[appointment.status] }}
          >
            {STATUS_LABELS[appointment.status]}
          </span>

          {nextStatus && (
            <Button
              size="sm"
              onClick={() => handleStatusChange(nextStatus)}
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
            <Button
              variant="ghost"
              fullWidth
              onClick={() => setShowNoShowConfirm(true)}
            >
              عدم مراجعه
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={() => setShowCancelConfirm(true)}
            >
              لغو نوبت
            </Button>
          </div>
        )}
      </div>

      {/* Cancel confirm */}
      <ConfirmDialog
        isOpen={showCancelConfirm}
        title="لغو نوبت"
        message={`آیا نوبت «${appointment.title}» را لغو می‌کنید؟`}
        confirmLabel="بله، لغو شود"
        cancelLabel="نه"
        danger
        onConfirm={handleCancel}
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
        onConfirm={handleNoShow}
        onCancel={() => setShowNoShowConfirm(false)}
      />
    </div>
  )
}
