/**
 * Finance Repository — assembles data from visits, payments and expenses
 * to build financial reports.
 */

import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { VisitService, Payment, Expense, UUID } from '@shared/types'
import {
  buildDailyReport,
  buildFinancialSummary,
  type VisitWithServices,
} from './finance.calculator'
import type { DailyReport, FinancialSummary } from '@shared/types'
import { localDayRange } from '@shared/utils/datetime'

export class FinanceRepository {
  constructor(
    private readonly db: SQLiteDBConnection,
    private readonly userId: UUID
  ) {}

  // ── Low-level queries ─────────────────────────────────────────────────────

  private async getVisitServicesInRange(start: string, end: string): Promise<VisitService[]> {
    const result = await this.db.query(
      `SELECT vs.* FROM visit_services vs
       JOIN visits v ON vs.visit_id = v.id
       WHERE vs.user_id = ? AND v.visited_at >= ? AND v.visited_at < ?`,
      [this.userId, start, end]
    )
    return (result.values as VisitService[]) ?? []
  }

  private async getPaymentsInRange(start: string, end: string): Promise<Payment[]> {
    const result = await this.db.query(
      `SELECT * FROM payments WHERE user_id = ? AND paid_at >= ? AND paid_at < ?`,
      [this.userId, start, end]
    )
    return (result.values as Payment[]) ?? []
  }

  private async getExpensesInRange(start: string, end: string): Promise<Expense[]> {
    const result = await this.db.query(
      `SELECT * FROM expenses WHERE user_id = ? AND spent_at >= ? AND spent_at < ?`,
      [this.userId, start, end]
    )
    return (result.values as Expense[]) ?? []
  }

  private async getVisitsWithServicesInRange(
    start: string,
    end: string
  ): Promise<VisitWithServices[]> {
    // Get visits in range
    const visitsResult = await this.db.query(
      `SELECT id, visited_at FROM visits WHERE user_id = ? AND visited_at >= ? AND visited_at < ?`,
      [this.userId, start, end]
    )
    const visits = (visitsResult.values as { id: string; visited_at: string }[]) ?? []

    const result: VisitWithServices[] = []

    for (const visit of visits) {
      const svcsResult = await this.db.query(
        `SELECT * FROM visit_services WHERE visit_id = ? AND user_id = ?`,
        [visit.id, this.userId]
      )
      const paymentsResult = await this.db.query(
        `SELECT * FROM payments WHERE visit_id = ? AND user_id = ?`,
        [visit.id, this.userId]
      )
      result.push({
        visitId: visit.id,
        visitedAt: visit.visited_at,
        services: (svcsResult.values as VisitService[]) ?? [],
        payments: (paymentsResult.values as Payment[]) ?? [],
      })
    }

    return result
  }

  // ── Report builders ───────────────────────────────────────────────────────

  async getDailyReport(dateISO: string): Promise<DailyReport> {
    const { start, end } = localDayRange(dateISO)

    const [visitServices, paymentsInPeriod, visitsWithServices, expenses] = await Promise.all([
      this.getVisitServicesInRange(start, end),
      this.getPaymentsInRange(start, end),
      this.getVisitsWithServicesInRange(start, end),
      this.getExpensesInRange(start, end),
    ])

    return buildDailyReport(dateISO, visitServices, paymentsInPeriod, visitsWithServices, expenses)
  }

  async getSummary(start: string, end: string): Promise<FinancialSummary> {
    const [visitServices, paymentsInPeriod, visitsWithServices, expenses] = await Promise.all([
      this.getVisitServicesInRange(start, end),
      this.getPaymentsInRange(start, end),
      this.getVisitsWithServicesInRange(start, end),
      this.getExpensesInRange(start, end),
    ])

    return buildFinancialSummary(
      start,
      end,
      visitServices,
      paymentsInPeriod,
      visitsWithServices,
      expenses
    )
  }

  /** All open debts (visits not fully paid) across all time */
  async getTotalOpenDebt(): Promise<number> {
    const result = await this.db.query(
      `SELECT
         v.id,
         COALESCE(SUM(vs.line_total), 0) AS service_total,
         COALESCE((
           SELECT SUM(p.amount) FROM payments p WHERE p.visit_id = v.id AND p.user_id = v.user_id
         ), 0) AS paid_total
       FROM visits v
       LEFT JOIN visit_services vs ON vs.visit_id = v.id AND vs.user_id = v.user_id
       WHERE v.user_id = ?
       GROUP BY v.id
       HAVING service_total > paid_total`,
      [this.userId]
    )

    const rows = (result.values as { service_total: number; paid_total: number }[]) ?? []
    return rows.reduce((sum, r) => sum + (r.service_total - r.paid_total), 0)
  }
}
