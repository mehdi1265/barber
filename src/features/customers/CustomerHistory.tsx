import { STATUS_LABELS } from '@features/appointments/appointments.schemas'
import { formatJalaliDateFull, formatTime } from '@shared/utils/jalali'
import { formatMoney } from '@shared/utils/currency'
import type { Appointment } from '@shared/types'
import type { VisitSummary } from '@database/repositories/visit.repository'
import styles from './CustomerHistory.module.css'

interface CustomerHistoryProps {
  appointments: Appointment[]
  visits: VisitSummary[]
  currencyCode: string
  onOpenAppointment: (appointmentId: string) => void
}

export function CustomerHistory({
  appointments,
  visits,
  currencyCode,
  onOpenAppointment,
}: CustomerHistoryProps) {
  const now = Date.now()
  const upcoming = appointments
    .filter(
      appt =>
        (appt.status === 'reserved' || appt.status === 'confirmed') &&
        new Date(appt.start_at).getTime() >= now
    )
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
  const upcomingIds = new Set(upcoming.map(appt => appt.id))
  const past = appointments.filter(appt => !upcomingIds.has(appt.id))

  const totalService = visits.reduce((sum, visit) => sum + visit.service_total, 0)
  const totalPaid = visits.reduce((sum, visit) => sum + visit.paid_total, 0)
  const totalRemaining = totalService - totalPaid

  return (
    <>
      <section className={styles.section} aria-labelledby="appointments-heading">
        <h3 id="appointments-heading" className={styles.sectionTitle}>
          نوبت‌ها
        </h3>
        {appointments.length === 0 ? (
          <p className={styles.placeholder}>نوبتی برای این مشتری ثبت نشده است.</p>
        ) : (
          <>
            <h4 className={styles.subTitle}>نوبت‌های آینده</h4>
            {upcoming.length === 0 ? (
              <p className={styles.placeholder}>نوبت آینده‌ای ندارد.</p>
            ) : (
              <ul className={styles.list} role="list">
                {upcoming.map(appt => (
                  <li key={appt.id}>
                    <AppointmentRow appt={appt} onOpen={onOpenAppointment} />
                  </li>
                ))}
              </ul>
            )}

            <h4 className={styles.subTitle}>سابقه نوبت‌ها</h4>
            {past.length === 0 ? (
              <p className={styles.placeholder}>سابقه نوبتی وجود ندارد.</p>
            ) : (
              <ul className={styles.list} role="list">
                {past.map(appt => (
                  <li key={appt.id}>
                    <AppointmentRow appt={appt} onOpen={onOpenAppointment} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className={styles.section} aria-labelledby="visits-heading">
        <h3 id="visits-heading" className={styles.sectionTitle}>
          تاریخچه مراجعات
        </h3>
        {visits.length === 0 ? (
          <p className={styles.placeholder}>
            پس از ثبت اولین مراجعه، تاریخچه اینجا نمایش داده می‌شود.
          </p>
        ) : (
          <ul className={styles.list} role="list">
            {visits.map(visit => {
              const remaining = visit.service_total - visit.paid_total
              return (
                <li key={visit.id} className={styles.visitRow}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>
                      {formatJalaliDateFull(visit.visited_at)}
                    </span>
                    <span className={styles.rowMeta}>
                      {formatTime(visit.visited_at)}
                      {visit.is_quick_sale ? ' · فروش سریع' : ''}
                    </span>
                  </span>
                  <span className={styles.amounts}>
                    <span>{formatMoney(visit.service_total, currencyCode)}</span>
                    <span className={remaining > 0 ? styles.debtText : styles.paidText}>
                      {remaining > 0 ? `بدهی ${formatMoney(remaining, currencyCode)}` : 'تسویه‌شده'}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="finance-heading">
        <h3 id="finance-heading" className={styles.sectionTitle}>
          خلاصه مالی
        </h3>
        {visits.length === 0 ? (
          <p className={styles.placeholder}>بعد از ثبت اولین مراجعه، اطلاعات مالی اینجا می‌آید.</p>
        ) : (
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>مبلغ خدمات</dt>
              <dd>{formatMoney(totalService, currencyCode)}</dd>
            </div>
            <div className={styles.fact}>
              <dt>پرداخت‌شده</dt>
              <dd>{formatMoney(totalPaid, currencyCode)}</dd>
            </div>
            <div className={styles.fact}>
              <dt>باقی‌مانده</dt>
              <dd className={totalRemaining > 0 ? styles.debtText : styles.paidText}>
                {formatMoney(totalRemaining, currencyCode)}
              </dd>
            </div>
          </dl>
        )}
      </section>
    </>
  )
}

function AppointmentRow({
  appt,
  onOpen,
}: {
  appt: Appointment
  onOpen: (appointmentId: string) => void
}) {
  return (
    <button
      type="button"
      className={styles.appointmentRow}
      onClick={() => onOpen(appt.id)}
      aria-label={`مشاهده نوبت ${appt.title}`}
    >
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{appt.title}</span>
        <span className={styles.rowMeta}>
          {formatJalaliDateFull(appt.start_at)} · {formatTime(appt.start_at)}
        </span>
      </span>
      <span className={styles.statusBadge}>{STATUS_LABELS[appt.status] ?? appt.status}</span>
    </button>
  )
}
