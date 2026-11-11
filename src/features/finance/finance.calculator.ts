/**
 * Finance Calculator — pure functions that compute financial reports.
 *
 * All monetary values stored as integers (Toman × 100).
 * Functions are pure and testable with no DB dependency.
 *
 * Key definitions (from PRD §7):
 *  - service_amount : مبلغ خدمات — total line_total of visit_services in period
 *  - received       : دریافتی    — total payment.amount where paid_at is in period
 *  - debt           : بدهی       — service_amount of completed visits minus payments linked to those visits
 *  - expenses       : هزینه      — total expenses in period
 *  - net            : مانده       — received - expenses
 */

import type { VisitService, Payment, Expense, DailyReport, FinancialSummary } from '@shared/types'

export interface VisitWithServices {
  visitId: string
  visitedAt: string
  services: VisitService[]
  payments: Payment[]
}

// ── Period helpers ────────────────────────────────────────────────────────────

export function dayRange(dateISO: string): { start: string; end: string } {
  return {
    start: `${dateISO}T00:00:00.000Z`,
    end:   `${dateISO}T23:59:59.999Z`,
  }
}

export function weekRange(mondayISO: string): { start: string; end: string } {
  const end = new Date(mondayISO)
  end.setDate(end.getDate() + 7)
  return {
    start: `${mondayISO}T00:00:00.000Z`,
    end:   end.toISOString(),
  }
}

export function monthRange(yearMonth: string): { start: string; end: string } {
  // yearMonth = "YYYY-MM"
  const [y, m] = yearMonth.split('-').map(Number)
  const start = new Date(y, m - 1, 1)
  const end = new Date(y, m, 1) // first day of next month
  return {
    start: start.toISOString(),
    end:   end.toISOString(),
  }
}

// ── Core calculations ─────────────────────────────────────────────────────────

/**
 * Total service amount: sum of line_total for all visit_services
 * whose visit falls in the period.
 */
export function calcServiceAmount(visitServices: VisitService[]): number {
  return visitServices.reduce((sum, s) => sum + s.line_total, 0)
}

/**
 * Total received: sum of payments where paid_at is in the period.
 * Note: a payment might arrive in a different period than the service.
 */
export function calcReceived(payments: Payment[]): number {
  return payments.reduce((sum, p) => sum + p.amount, 0)
}

/**
 * Total debt: service amounts of visits that have not been fully paid.
 * debt = sum over each visit of (visit_service_total - paid_for_visit)
 * Only counts positive balances (we don't net overpayments against debt).
 */
export function calcDebt(visitsWithServices: VisitWithServices[]): number {
  let totalDebt = 0
  for (const visit of visitsWithServices) {
    const serviceTotal = visit.services.reduce((s, vs) => s + vs.line_total, 0)
    const paidTotal    = visit.payments.reduce((s, p) => s + p.amount, 0)
    const balance      = serviceTotal - paidTotal
    if (balance > 0) totalDebt += balance
  }
  return totalDebt
}

/**
 * Total expenses in the period.
 */
export function calcExpenses(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + e.amount, 0)
}

/**
 * Net = received - expenses.
 * This is NOT accounting profit; it's cash-based net.
 */
export function calcNet(received: number, expenses: number): number {
  return received - expenses
}

// ── Report builders ───────────────────────────────────────────────────────────

export function buildDailyReport(
  dateISO: string,
  visitServices: VisitService[],
  paymentsInPeriod: Payment[],
  visitsWithServices: VisitWithServices[],
  expenses: Expense[]
): DailyReport {
  const totalServiceAmount = calcServiceAmount(visitServices)
  const totalReceived      = calcReceived(paymentsInPeriod)
  const totalDebt          = calcDebt(visitsWithServices)
  const totalExpenses      = calcExpenses(expenses)
  const net                = calcNet(totalReceived, totalExpenses)

  return {
    date: dateISO,
    visit_count:           visitsWithServices.length,
    service_count:         visitServices.length,
    total_service_amount:  totalServiceAmount,
    total_received:        totalReceived,
    total_debt:            totalDebt,
    total_expenses:        totalExpenses,
    net_after_expenses:    net,
  }
}

export function buildFinancialSummary(
  periodStart: string,
  periodEnd: string,
  visitServices: VisitService[],
  paymentsInPeriod: Payment[],
  visitsWithServices: VisitWithServices[],
  expenses: Expense[]
): FinancialSummary {
  return {
    period_start:         periodStart,
    period_end:           periodEnd,
    total_service_amount: calcServiceAmount(visitServices),
    total_received:       calcReceived(paymentsInPeriod),
    total_debt:           calcDebt(visitsWithServices),
    total_expenses:       calcExpenses(expenses),
    net_after_expenses:   calcNet(calcReceived(paymentsInPeriod), calcExpenses(expenses)),
  }
}
