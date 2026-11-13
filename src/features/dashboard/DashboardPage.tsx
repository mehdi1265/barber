import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  useAppointmentsByDay,
  useCreateAppointment,
  useNextAppointment,
} from '@features/appointments/appointments.hooks'
import { AppointmentForm } from '@features/appointments/AppointmentForm'
import type { AppointmentFormData } from '@features/appointments/appointments.schemas'
import { useDailyReport } from '@features/finance/finance.hooks'
import { useCustomer } from '@features/customers/customers.hooks'
import { SummaryCard } from '@shared/components/ui/SummaryCard'
import { Button } from '@shared/components/ui/Button'
import { Modal } from '@shared/components/ui/Modal'
import { LoadingScreen } from '@shared/components/ui/LoadingScreen'
import { formatToman } from '@shared/utils/helpers'
import { todayISO, formatJalaliDateFull, formatTime, applyTimeToDate } from '@shared/utils/jalali'
import styles from './DashboardPage.module.css'

export default function DashboardPage() {
  const navigate = useNavigate()
  const today = todayISO()

  const { data: todayAppointments = [], isLoading: appointmentsLoading } =
    useAppointmentsByDay(today)
  const { data: nextAppointment, isLoading: nextLoading } = useNextAppointment()
  const { data: report, isLoading: reportLoading } = useDailyReport(today)
  const { data: nextCustomer } = useCustomer(nextAppointment?.customer_id ?? '')

  const createMutation = useCreateAppointment()
  const [showAddModal, setShowAddModal] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const handleCreate = async (data: AppointmentFormData) => {
    setFormError(null)
    try {
      await createMutation.mutateAsync({
        customer_id: data.customer_id ?? null,
        title: data.title,
        start_at: applyTimeToDate(data.date, data.time),
        duration_minutes: data.duration_minutes,
        notes: data.notes ?? null,
        services: data.services.map(s => ({
          service_id: s.service_id ?? null,
          service_name_snapshot: s.service_name_snapshot,
          price: Number(s.price) || 0,
          duration_minutes: s.duration_minutes ?? null,
        })),
      })
      setShowAddModal(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'خطایی رخ داد')
    }
  }

  const loading = appointmentsLoading || nextLoading || reportLoading

  return (
    <div className={styles.page} dir="rtl">
      <header className={styles.header}>
        <span className={styles.date}>{formatJalaliDateFull(today)}</span>
        <h1 className={styles.title}>خانه</h1>
      </header>

      {loading ? (
        <LoadingScreen message="در حال آماده‌سازی امروز…" />
      ) : (
        <>
          {/* Next appointment */}
          <section aria-label="نوبت بعدی">
            {nextAppointment ? (
              <button
                className={styles.nextCard}
                onClick={() => {
                  void navigate(`/appointments/${nextAppointment.id}`)
                }}
                aria-label={`نوبت بعدی: ${nextAppointment.title}`}
              >
                <span className={styles.nextLabel}>نوبت بعدی</span>
                <span className={styles.nextTitle}>{nextAppointment.title}</span>
                <span className={styles.nextMeta}>
                  {nextCustomer?.name ? `${nextCustomer.name} · ` : ''}
                  {formatJalaliDateFull(nextAppointment.start_at)} ·{' '}
                  {formatTime(nextAppointment.start_at)}
                </span>
              </button>
            ) : (
              <div className={styles.emptyNext}>
                <span className={styles.nextLabel}>نوبت بعدی</span>
                <span className={styles.emptyText}>نوبت آینده‌ای ثبت نشده است.</span>
              </div>
            )}
          </section>

          {/* Today's numbers */}
          <section aria-label="خلاصه امروز">
            <h2 className={styles.sectionTitle}>امروز</h2>
            <div className={styles.cards}>
              <SummaryCard
                label="نوبت‌ها"
                value={todayAppointments.length.toLocaleString('fa-IR')}
                icon="📅"
                color="blue"
              />
              <SummaryCard
                label="ویزیت‌ها"
                value={(report?.visit_count ?? 0).toLocaleString('fa-IR')}
                icon="✂️"
              />
              <SummaryCard
                label="خدمات"
                value={formatToman(report?.total_service_amount ?? 0)}
                icon="💈"
                color="blue"
              />
              <SummaryCard
                label="دریافتی"
                value={formatToman(report?.total_received ?? 0)}
                icon="💵"
                color="green"
              />
              <SummaryCard
                label="هزینه"
                value={formatToman(report?.total_expenses ?? 0)}
                icon="🧾"
                color="orange"
              />
              <SummaryCard
                label="بدهی"
                value={formatToman(report?.total_debt ?? 0)}
                icon="📌"
                color="red"
              />
            </div>

            <div className={styles.netRow}>
              <span>مانده امروز پس از هزینه</span>
              <span
                className={
                  (report?.net_after_expenses ?? 0) < 0 ? styles.netNegative : styles.netValue
                }
              >
                {formatToman(report?.net_after_expenses ?? 0)}
              </span>
            </div>
          </section>

          {/* Quick actions */}
          <section aria-label="اقدام‌های سریع" className={styles.quickActions}>
            <Button
              onClick={() => {
                setFormError(null)
                setShowAddModal(true)
              }}
            >
              + نوبت جدید
            </Button>
            <Link to="/finance/quick-sale" className={styles.actionLink}>
              ⚡ فروش سریع
            </Link>
            <Link to="/customers" className={styles.actionLink}>
              👥 مشتری جدید
            </Link>
          </section>
        </>
      )}

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="نوبت جدید">
        <AppointmentForm
          defaultDate={today}
          onSubmit={handleCreate}
          onCancel={() => setShowAddModal(false)}
          submitLabel="ثبت نوبت"
          error={formError}
        />
      </Modal>
    </div>
  )
}
