import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useDailyReport,
  useFinanceSummary,
  useVisitSummariesByDay,
  useVisitDetail,
  useCreateVisit,
  useAddPayment,
  useExpensesByDay,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  useOpenDebts,
} from './finance.hooks'
import type { VisitSummary } from '@database/repositories/visit.repository'
import type { Expense } from '@shared/types'
import { VisitForm } from './VisitForm'
import { PaymentForm } from './PaymentForm'
import { ExpenseForm, type ExpenseFormInitial } from './ExpenseForm'
import { Button } from '@shared/components/ui/Button'
import { Modal } from '@shared/components/ui/Modal'
import { ConfirmDialog } from '@shared/components/ui/ConfirmDialog'
import { EmptyState } from '@shared/components/ui/EmptyState'
import { LoadingScreen } from '@shared/components/ui/LoadingScreen'
import { SummaryCard } from '@shared/components/ui/SummaryCard'
import { formatToman } from '@shared/utils/helpers'
import {
  todayISO,
  formatJalaliDateFull,
  formatJalaliMonthYear,
  formatTime,
  applyTimeToDate,
  getWeekStart,
} from '@shared/utils/jalali'
import {
  addLocalDays,
  localDateISO,
  localJalaliMonthRange,
  localWeekRange,
  parseLocalDate,
} from '@shared/utils/datetime'
import { getYear, getMonth, addMonths, newDate } from 'date-fns-jalali'
import { PAYMENT_METHOD_LABELS, type VisitFormData, type PaymentFormData } from './finance.schemas'
import type { ExpenseFormData } from './finance.schemas'
import styles from './FinancePage.module.css'

type Tab = 'day' | 'summary' | 'expenses' | 'debts'
type SummaryMode = 'week' | 'month'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'day', label: 'روز' },
  { id: 'summary', label: 'خلاصه' },
  { id: 'expenses', label: 'هزینه‌ها' },
  { id: 'debts', label: 'بدهی‌ها' },
]

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function visitLabel(visit: VisitSummary): string {
  return visit.customer_name ?? (visit.is_quick_sale ? 'فروش سریع' : 'مشتری متفرقه')
}

// ── Visit detail + payment ────────────────────────────────────────────────────

function VisitDetail({ visitId, onClose }: { visitId: string; onClose: () => void }) {
  const { data, isLoading } = useVisitDetail(visitId)
  const addPayment = useAddPayment()
  const [showPayment, setShowPayment] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const serviceTotal = (data?.services ?? []).reduce((sum, s) => sum + s.line_total, 0)
  const paidTotal = (data?.payments ?? []).reduce((sum, p) => sum + p.amount, 0)
  const remaining = serviceTotal - paidTotal

  const handlePayment = async (form: PaymentFormData) => {
    setError(null)
    try {
      await addPayment.mutateAsync({
        visit_id: visitId,
        amount: form.amount,
        method: form.method,
        note: form.note,
      })
      setShowPayment(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطایی در ثبت پرداخت رخ داد')
    }
  }

  if (isLoading) return <LoadingScreen message="در حال بارگذاری ویزیت…" />
  if (!data?.visit) return <p className={styles.muted}>ویزیت پیدا نشد.</p>

  return (
    <div className={styles.detail}>
      <div className={styles.detailMeta}>
        <span>{formatJalaliDateFull(data.visit.visited_at)}</span>
        <span>{formatTime(data.visit.visited_at)}</span>
      </div>

      <ul className={styles.detailList} role="list">
        {data.services.map(s => (
          <li key={s.id} className={styles.detailRow}>
            <span>
              {s.service_name_snapshot}
              {s.quantity > 1 ? ` × ${s.quantity.toLocaleString('fa-IR')}` : ''}
            </span>
            <span>{formatToman(s.line_total)}</span>
          </li>
        ))}
      </ul>

      <div className={styles.totals}>
        <div className={styles.totalRow}>
          <span>مبلغ خدمات</span>
          <span>{formatToman(serviceTotal)}</span>
        </div>
        <div className={styles.totalRow}>
          <span>پرداخت‌شده</span>
          <span>{formatToman(paidTotal)}</span>
        </div>
        <div className={[styles.totalRow, styles.totalRemaining].join(' ')}>
          <span>باقی‌مانده</span>
          <span>{formatToman(remaining)}</span>
        </div>
      </div>

      {data.payments.length > 0 && (
        <div className={styles.paymentsBlock}>
          <h4 className={styles.subTitle}>پرداخت‌ها</h4>
          <ul className={styles.detailList} role="list">
            {data.payments.map(p => (
              <li key={p.id} className={styles.detailRow}>
                <span>
                  {PAYMENT_METHOD_LABELS[p.method]} · {formatTime(p.paid_at)}
                </span>
                <span>{formatToman(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {remaining > 0 && !showPayment && (
        <Button className={styles.fullBtn} onClick={() => setShowPayment(true)}>
          + ثبت پرداخت
        </Button>
      )}

      {showPayment && (
        <div className={styles.paymentBox}>
          <PaymentForm
            remaining={remaining}
            onSubmit={handlePayment}
            onCancel={() => setShowPayment(false)}
            error={error ?? (addPayment.isError ? addPayment.error.message : null)}
          />
        </div>
      )}

      <Button className={styles.fullBtn} variant="ghost" onClick={onClose}>
        بستن
      </Button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>('day')
  const [selectedDate, setSelectedDate] = useState(todayISO())

  // Day data
  const { data: report, isLoading: reportLoading } = useDailyReport(selectedDate)
  const { data: visitSummaries = [], isLoading: visitsLoading } =
    useVisitSummariesByDay(selectedDate)
  const { data: expenses = [], isLoading: expensesLoading } = useExpensesByDay(selectedDate)

  // Summary data
  const [summaryMode, setSummaryMode] = useState<SummaryMode>('week')
  const [summaryAnchor, setSummaryAnchor] = useState(todayISO())
  const summaryRange = useMemo(() => {
    if (summaryMode === 'week') {
      return localWeekRange(localDateISO(getWeekStart(summaryAnchor)))
    }
    const anchorDate = parseLocalDate(summaryAnchor)
    const key = `${getYear(anchorDate)}-${pad2(getMonth(anchorDate) + 1)}`
    return localJalaliMonthRange(key)
  }, [summaryMode, summaryAnchor])
  const { data: summary, isLoading: summaryLoading } = useFinanceSummary(
    summaryRange.start,
    summaryRange.end
  )

  const { data: openDebts = [], isLoading: debtsLoading } = useOpenDebts()

  const createVisit = useCreateVisit()
  const createExpense = useCreateExpense()
  const updateExpense = useUpdateExpense()
  const deleteExpense = useDeleteExpense()

  const [showVisitModal, setShowVisitModal] = useState(false)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null)
  const [detailVisitId, setDetailVisitId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const handleCreateVisit = async (data: VisitFormData) => {
    setFormError(null)
    try {
      await createVisit.mutateAsync({
        customer_id: data.customer_id || null,
        visited_at: applyTimeToDate(data.date, data.time),
        notes: data.notes,
        services: data.services.map(s => ({
          service_id: s.service_id || null,
          service_name_snapshot: s.service_name_snapshot,
          quantity: s.quantity,
          unit_price: s.unit_price,
          discount_amount: s.discount_amount,
          duration_minutes: s.duration_minutes,
        })),
        payment:
          data.paid_amount != null && data.paid_amount > 0
            ? { amount: data.paid_amount, method: data.payment_method }
            : null,
      })
      setShowVisitModal(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'خطایی در ثبت ویزیت رخ داد')
    }
  }

  const handleCreateExpense = async (data: ExpenseFormData) => {
    setFormError(null)
    try {
      await createExpense.mutateAsync({
        title: data.title,
        amount: data.amount,
        category: data.category,
        note: data.note,
        spent_at: applyTimeToDate(data.date, formatTime(new Date().toISOString())),
      })
      setShowExpenseModal(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'خطایی در ثبت هزینه رخ داد')
    }
  }

  const handleUpdateExpense = async (data: ExpenseFormData) => {
    if (!editingExpense) return
    setFormError(null)
    try {
      await updateExpense.mutateAsync({
        id: editingExpense.id,
        input: {
          title: data.title,
          amount: data.amount,
          category: data.category,
          note: data.note,
          spent_at: applyTimeToDate(data.date, formatTime(editingExpense.spent_at)),
        },
      })
      setEditingExpense(null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'خطایی در ویرایش هزینه رخ داد')
    }
  }

  const handleDeleteExpense = async () => {
    if (!deletingExpenseId) return
    try {
      await deleteExpense.mutateAsync(deletingExpenseId)
    } finally {
      setDeletingExpenseId(null)
    }
  }

  const expenseInitial: ExpenseFormInitial | undefined = editingExpense
    ? {
        title: editingExpense.title,
        amount: editingExpense.amount,
        spent_at: editingExpense.spent_at,
        category: editingExpense.category,
        note: editingExpense.note,
      }
    : undefined

  const goDay = (delta: number) => setSelectedDate(addLocalDays(selectedDate, delta))
  const goSummary = (delta: number) => {
    if (summaryMode === 'week') {
      setSummaryAnchor(addLocalDays(summaryAnchor, delta * 7))
      return
    }
    const next = addMonths(parseLocalDate(summaryAnchor), delta)
    setSummaryAnchor(localDateISO(newDate(getYear(next), getMonth(next), 1)))
  }

  const isLoadingDay = reportLoading || visitsLoading || expensesLoading

  return (
    <div className={styles.page} dir="rtl">
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>مالی</h1>
          <Link to="/finance/quick-sale" className={styles.quickSaleLink}>
            ⚡ فروش سریع
          </Link>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="بخش‌های مالی">
          {TABS.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={[styles.tab, tab === t.id ? styles.tabActive : ''].join(' ')}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {tab === 'day' && (
        <section aria-label="گزارش روز">
          <PeriodNav
            label={formatJalaliDateFull(selectedDate)}
            onPrev={() => goDay(-1)}
            onNext={() => goDay(1)}
            onToday={() => setSelectedDate(todayISO())}
            isToday={selectedDate === todayISO()}
          />

          <div className={styles.actions}>
            <Button
              size="sm"
              onClick={() => {
                setFormError(null)
                setShowVisitModal(true)
              }}
            >
              + ویزیت
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setFormError(null)
                setShowExpenseModal(true)
              }}
            >
              + هزینه
            </Button>
          </div>

          {reportLoading ? (
            <LoadingScreen message="در حال محاسبه گزارش…" />
          ) : (
            report && (
              <div className={styles.cards}>
                <SummaryCard
                  label="خدمات"
                  value={formatToman(report.total_service_amount)}
                  icon="✂️"
                  color="blue"
                />
                <SummaryCard
                  label="دریافتی"
                  value={formatToman(report.total_received)}
                  icon="💵"
                  color="green"
                />
                <SummaryCard
                  label="بدهی"
                  value={formatToman(report.total_debt)}
                  icon="📌"
                  color="red"
                />
                <SummaryCard
                  label="هزینه"
                  value={formatToman(report.total_expenses)}
                  icon="🧾"
                  color="orange"
                />
                <SummaryCard
                  label="مانده"
                  value={formatToman(report.net_after_expenses)}
                  icon="📊"
                />
              </div>
            )
          )}

          {isLoadingDay ? (
            <LoadingScreen message="در حال بارگذاری ویزیت‌ها…" />
          ) : visitSummaries.length === 0 ? (
            <EmptyState
              icon="💈"
              title="امروز ویزیتی ثبت نشده"
              description="هر مشتری که مراجعه کرد را اینجا ثبت کنید."
            />
          ) : (
            <ul className={styles.visitList} role="list">
              {visitSummaries.map(v => {
                const remaining = v.service_total - v.paid_total
                return (
                  <li key={v.id}>
                    <button className={styles.visitRow} onClick={() => setDetailVisitId(v.id)}>
                      <span className={styles.visitMain}>
                        <span className={styles.visitName}>{visitLabel(v)}</span>
                        <span className={styles.visitTime}>
                          {formatTime(v.visited_at)}
                          {v.is_quick_sale ? ' · فروش سریع' : ''}
                        </span>
                      </span>
                      <span className={styles.visitAmounts}>
                        <span>{formatToman(v.service_total)}</span>
                        <span className={remaining > 0 ? styles.debtText : styles.paidText}>
                          {remaining > 0 ? `بدهی ${formatToman(remaining)}` : 'تسویه‌شده'}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {tab === 'summary' && (
        <section aria-label="خلاصه دوره">
          <div className={styles.summaryToggle} role="tablist" aria-label="بازه گزارش">
            <button
              role="tab"
              aria-selected={summaryMode === 'week'}
              className={[styles.toggleBtn, summaryMode === 'week' ? styles.toggleActive : ''].join(
                ' '
              )}
              onClick={() => setSummaryMode('week')}
            >
              هفته
            </button>
            <button
              role="tab"
              aria-selected={summaryMode === 'month'}
              className={[
                styles.toggleBtn,
                summaryMode === 'month' ? styles.toggleActive : '',
              ].join(' ')}
              onClick={() => setSummaryMode('month')}
            >
              ماه
            </button>
          </div>

          <PeriodNav
            label={formatJalaliMonthYear(summaryAnchor)}
            onPrev={() => goSummary(-1)}
            onNext={() => goSummary(1)}
            onToday={() => setSummaryAnchor(todayISO())}
            isToday={false}
          />

          {summaryLoading ? (
            <LoadingScreen message="در حال محاسبه خلاصه…" />
          ) : (
            summary && (
              <div className={styles.cards}>
                <SummaryCard
                  label="مبلغ خدمات"
                  value={formatToman(summary.total_service_amount)}
                  icon="✂️"
                  color="blue"
                />
                <SummaryCard
                  label="دریافتی"
                  value={formatToman(summary.total_received)}
                  icon="💵"
                  color="green"
                />
                <SummaryCard
                  label="بدهی"
                  value={formatToman(summary.total_debt)}
                  icon="📌"
                  color="red"
                />
                <SummaryCard
                  label="هزینه"
                  value={formatToman(summary.total_expenses)}
                  icon="🧾"
                  color="orange"
                />
                <SummaryCard
                  label="مانده"
                  value={formatToman(summary.net_after_expenses)}
                  icon="📊"
                />
              </div>
            )
          )}
        </section>
      )}

      {tab === 'expenses' && (
        <section aria-label="هزینه‌ها">
          <PeriodNav
            label={formatJalaliDateFull(selectedDate)}
            onPrev={() => goDay(-1)}
            onNext={() => goDay(1)}
            onToday={() => setSelectedDate(todayISO())}
            isToday={selectedDate === todayISO()}
          />

          <div className={styles.actions}>
            <Button
              size="sm"
              onClick={() => {
                setFormError(null)
                setShowExpenseModal(true)
              }}
            >
              + هزینه جدید
            </Button>
          </div>

          {expensesLoading ? (
            <LoadingScreen message="در حال بارگذاری هزینه‌ها…" />
          ) : expenses.length === 0 ? (
            <EmptyState icon="🧾" title="هزینه‌ای برای این روز ثبت نشده" />
          ) : (
            <ul className={styles.expenseList} role="list">
              {expenses.map(expense => (
                <li key={expense.id} className={styles.expenseRow}>
                  <div className={styles.expenseMain}>
                    <span className={styles.expenseTitle}>{expense.title}</span>
                    {expense.category && (
                      <span className={styles.expenseCategory}>{expense.category}</span>
                    )}
                  </div>
                  <span className={styles.expenseAmount}>{formatToman(expense.amount)}</span>
                  <div className={styles.expenseActions}>
                    <button
                      className={styles.iconBtn}
                      aria-label={`ویرایش ${expense.title}`}
                      onClick={() => {
                        setFormError(null)
                        setEditingExpense(expense)
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      className={styles.iconBtn}
                      aria-label={`حذف ${expense.title}`}
                      onClick={() => setDeletingExpenseId(expense.id)}
                    >
                      🗑️
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'debts' && (
        <section aria-label="بدهی‌های باز">
          {debtsLoading ? (
            <LoadingScreen message="در حال محاسبه بدهی‌ها…" />
          ) : openDebts.length === 0 ? (
            <EmptyState icon="✅" title="بدهی بازی ندارید" />
          ) : (
            <ul className={styles.debtList} role="list">
              {openDebts.map(debt => (
                <li key={debt.customer_id ?? 'walk-in'} className={styles.debtRow}>
                  <div className={styles.expenseMain}>
                    <span className={styles.expenseTitle}>
                      {debt.customer_name ?? 'مشتری متفرقه'}
                    </span>
                    <span className={styles.expenseCategory}>
                      {debt.visit_count.toLocaleString('fa-IR')} ویزیت
                    </span>
                  </div>
                  <span className={styles.debtAmount}>{formatToman(debt.total_debt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Visit modal */}
      <Modal
        isOpen={showVisitModal}
        onClose={() => setShowVisitModal(false)}
        title="ثبت ویزیت جدید"
      >
        <VisitForm
          defaultDate={selectedDate}
          onSubmit={handleCreateVisit}
          onCancel={() => setShowVisitModal(false)}
          error={formError}
        />
      </Modal>

      {/* Expense modals */}
      <Modal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        title="هزینه جدید"
      >
        <ExpenseForm
          defaultDate={selectedDate}
          onSubmit={handleCreateExpense}
          onCancel={() => setShowExpenseModal(false)}
          error={formError}
        />
      </Modal>

      <Modal
        isOpen={editingExpense !== null}
        onClose={() => setEditingExpense(null)}
        title="ویرایش هزینه"
      >
        {editingExpense && (
          <ExpenseForm
            initial={expenseInitial}
            onSubmit={handleUpdateExpense}
            onCancel={() => setEditingExpense(null)}
            submitLabel="ذخیره تغییرات"
            error={formError}
          />
        )}
      </Modal>

      {/* Visit detail */}
      <Modal
        isOpen={detailVisitId !== null}
        onClose={() => setDetailVisitId(null)}
        title="جزئیات ویزیت"
      >
        {detailVisitId && (
          <VisitDetail visitId={detailVisitId} onClose={() => setDetailVisitId(null)} />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={deletingExpenseId !== null}
        title="حذف هزینه"
        message="این هزینه حذف می‌شود. ادامه می‌دهید؟"
        confirmLabel="حذف"
        danger
        onConfirm={() => void handleDeleteExpense()}
        onCancel={() => setDeletingExpenseId(null)}
      />
    </div>
  )
}

function PeriodNav({
  label,
  onPrev,
  onNext,
  onToday,
  isToday,
}: {
  label: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  isToday: boolean
}) {
  return (
    <div className={styles.nav}>
      <button className={styles.navBtn} onClick={onPrev} aria-label="قبلی">
        ‹
      </button>
      <div className={styles.dateDisplay}>{label}</div>
      <button className={styles.navBtn} onClick={onNext} aria-label="بعدی">
        ›
      </button>
      {!isToday && (
        <button className={styles.todayBtn} onClick={onToday}>
          امروز
        </button>
      )}
    </div>
  )
}
