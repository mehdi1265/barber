import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useAppointmentsByDay,
  useAppointmentsByWeek,
  useCreateAppointment,
} from './appointments.hooks'
import { AppointmentForm } from './AppointmentForm'
import { Button } from '@shared/components/ui/Button'
import { Modal } from '@shared/components/ui/Modal'
import { EmptyState } from '@shared/components/ui/EmptyState'
import { LoadingScreen } from '@shared/components/ui/LoadingScreen'
import {
  todayISO,
  formatJalaliDateFull,
  formatJalaliMonthYear,
  formatTime,
  getWeekStart,
  getWeekDays,
  formatWeekDayHeader,
  isSameDayUtil,
  applyTimeToDate,
} from '@shared/utils/jalali'
import { STATUS_LABELS, STATUS_COLORS, type AppointmentFormData } from './appointments.schemas'
import { addLocalDays, localDateISO, parseLocalDate } from '@shared/utils/datetime'
import styles from './AppointmentsPage.module.css'

type ViewMode = 'day' | 'week'

export default function AppointmentsPage() {
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [showAddModal, setShowAddModal] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const weekStart = useMemo(() => localDateISO(getWeekStart(selectedDate)), [selectedDate])

  const { data: dayAppointments = [], isLoading: dayLoading } = useAppointmentsByDay(selectedDate)
  const { data: weekAppointments = [], isLoading: weekLoading } = useAppointmentsByWeek(weekStart)

  const createMutation = useCreateAppointment()

  const weekDays = useMemo(() => getWeekDays(parseLocalDate(weekStart)), [weekStart])

  const handleCreate = async (data: AppointmentFormData) => {
    setFormError(null)
    try {
      const startISO = applyTimeToDate(data.date, data.time)
      await createMutation.mutateAsync({
        customer_id: data.customer_id ?? null,
        title: data.title,
        start_at: startISO,
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

  const goToday = () => setSelectedDate(todayISO())
  const goPrev = () => {
    setSelectedDate(addLocalDays(selectedDate, viewMode === 'week' ? -7 : -1))
  }
  const goNext = () => {
    setSelectedDate(addLocalDays(selectedDate, viewMode === 'week' ? 7 : 1))
  }

  const isLoading = viewMode === 'day' ? dayLoading : weekLoading

  return (
    <div className={styles.page} dir="rtl">
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>تقویم</h1>
          <Button
            size="sm"
            onClick={() => {
              setFormError(null)
              setShowAddModal(true)
            }}
          >
            + نوبت
          </Button>
        </div>

        {/* View toggle */}
        <div className={styles.viewToggle}>
          <button
            className={[styles.toggleBtn, viewMode === 'day' ? styles.toggleActive : ''].join(' ')}
            onClick={() => setViewMode('day')}
          >
            روز
          </button>
          <button
            className={[styles.toggleBtn, viewMode === 'week' ? styles.toggleActive : ''].join(' ')}
            onClick={() => setViewMode('week')}
          >
            هفته
          </button>
        </div>

        {/* Navigation */}
        <div className={styles.nav}>
          <button className={styles.navBtn} onClick={goPrev} aria-label="قبلی">
            ‹
          </button>
          <div className={styles.dateDisplay}>
            {viewMode === 'day'
              ? formatJalaliDateFull(selectedDate)
              : formatJalaliMonthYear(selectedDate)}
          </div>
          <button className={styles.navBtn} onClick={goNext} aria-label="بعدی">
            ›
          </button>
        </div>

        {/* Today button */}
        {selectedDate !== todayISO() && (
          <button className={styles.todayBtn} onClick={goToday}>
            امروز
          </button>
        )}
      </header>

      {/* Week day strip */}
      {viewMode === 'week' && (
        <div className={styles.weekStrip}>
          {weekDays.map(day => {
            const iso = localDateISO(day)
            const isSelected = iso === selectedDate
            const isToday = iso === todayISO()
            const hasAppts = weekAppointments.some(a => isSameDayUtil(a.start_at, day))
            return (
              <button
                key={iso}
                className={[
                  styles.weekDay,
                  isSelected ? styles.weekDaySelected : '',
                  isToday ? styles.weekDayToday : '',
                ].join(' ')}
                onClick={() => setSelectedDate(iso)}
              >
                <span className={styles.weekDayName}>{formatWeekDayHeader(day)}</span>
                {hasAppts && <span className={styles.dot} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <LoadingScreen message="در حال بارگذاری نوبت‌ها…" />
      ) : (
        <div className={styles.content}>
          {dayAppointments.length === 0 ? (
            <EmptyState
              icon="📅"
              title="نوبتی برای این روز ندارید"
              action={
                <Button
                  onClick={() => {
                    setFormError(null)
                    setShowAddModal(true)
                  }}
                >
                  + ثبت نوبت
                </Button>
              }
            />
          ) : (
            <ul className={styles.apptList} role="list">
              {dayAppointments.map(appt => (
                <li key={appt.id} className={styles.apptItem}>
                  <button
                    className={styles.apptCard}
                    onClick={() => {
                      void navigate(`/appointments/${appt.id}`)
                    }}
                    aria-label={`نوبت ${appt.title}`}
                  >
                    {/* Time column */}
                    <div className={styles.timeCol}>
                      <span className={styles.startTime}>{formatTime(appt.start_at)}</span>
                      <div
                        className={styles.durationBar}
                        style={{ height: `${Math.max(appt.duration_minutes * 1.2, 24)}px` }}
                        aria-hidden="true"
                      />
                      <span className={styles.endTime}>{formatTime(appt.end_at)}</span>
                    </div>

                    {/* Info */}
                    <div className={styles.apptInfo}>
                      <div className={styles.apptHeader}>
                        <span className={styles.apptTitle}>{appt.title}</span>
                        <span
                          className={styles.statusBadge}
                          style={{
                            background: STATUS_COLORS[appt.status] + '22',
                            color: STATUS_COLORS[appt.status],
                          }}
                        >
                          {STATUS_LABELS[appt.status]}
                        </span>
                      </div>
                      <span className={styles.apptDuration}>⏱ {appt.duration_minutes} دقیقه</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Add appointment modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="نوبت جدید">
        <AppointmentForm
          defaultDate={selectedDate}
          onSubmit={handleCreate}
          onCancel={() => setShowAddModal(false)}
          submitLabel="ثبت نوبت"
          error={formError}
        />
      </Modal>
    </div>
  )
}
