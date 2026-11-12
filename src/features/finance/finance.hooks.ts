import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FinanceRepository } from './finance.repository'
import { VisitRepository, type CreateVisitInput, type AddPaymentInput } from '@database/repositories/visit.repository'
import { ExpenseRepository, type CreateExpenseInput } from '@database/repositories/expense.repository'
import { useAuthStore } from '@state/auth.store'
import { getDatabase } from '@database/sqlite/database'

// ── Query keys ────────────────────────────────────────────────────────────────

export const financeKeys = {
  daily:    (uid: string, date: string)  => ['finance', uid, 'daily', date]  as const,
  summary:  (uid: string, start: string, end: string) => ['finance', uid, 'summary', start, end] as const,
  debt:     (uid: string)                => ['finance', uid, 'debt']          as const,
  expenses: (uid: string, date: string)  => ['finance', uid, 'expenses', date] as const,
  visits:   (uid: string, date: string)  => ['visits',  uid, 'day', date]     as const,
  visitDetail: (uid: string, id: string) => ['visits',  uid, id]              as const,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getFinanceRepo(userId: string) {
  const db = await getDatabase()
  return new FinanceRepository(db, userId)
}
async function getVisitRepo(userId: string) {
  const db = await getDatabase()
  return new VisitRepository(db, userId)
}
async function getExpenseRepo(userId: string) {
  const db = await getDatabase()
  return new ExpenseRepository(db, userId)
}

// ── Finance queries ───────────────────────────────────────────────────────────

export function useDailyReport(dateISO: string) {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: financeKeys.daily(userId, dateISO),
    queryFn:  async () => {
      const repo = await getFinanceRepo(userId)
      return repo.getDailyReport(dateISO)
    },
    enabled: !!userId,
    staleTime: 1000 * 20,
  })
}

export function useFinanceSummary(start: string, end: string) {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: financeKeys.summary(userId, start, end),
    queryFn:  async () => {
      const repo = await getFinanceRepo(userId)
      return repo.getSummary(start, end)
    },
    enabled: !!userId && !!start && !!end,
    staleTime: 1000 * 30,
  })
}

export function useTotalOpenDebt() {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: financeKeys.debt(userId),
    queryFn:  async () => {
      const repo = await getFinanceRepo(userId)
      return repo.getTotalOpenDebt()
    },
    enabled: !!userId,
    staleTime: 1000 * 60,
  })
}

// ── Visit queries ─────────────────────────────────────────────────────────────

export function useVisitsByDay(dateISO: string) {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: financeKeys.visits(userId, dateISO),
    queryFn:  async () => {
      const repo = await getVisitRepo(userId)
      return repo.findByDay(dateISO)
    },
    enabled: !!userId,
    staleTime: 1000 * 20,
  })
}

export function useVisitDetail(visitId: string) {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: financeKeys.visitDetail(userId, visitId),
    queryFn:  async () => {
      const repo = await getVisitRepo(userId)
      const [visit, services, payments] = await Promise.all([
        repo.findById(visitId),
        repo.getServicesForVisit(visitId),
        repo.getPaymentsForVisit(visitId),
      ])
      return { visit, services, payments }
    },
    enabled: !!userId && !!visitId,
  })
}

// ── Expense queries ───────────────────────────────────────────────────────────

export function useExpensesByDay(dateISO: string) {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: financeKeys.expenses(userId, dateISO),
    queryFn:  async () => {
      const repo = await getExpenseRepo(userId)
      return repo.findByDay(dateISO)
    },
    enabled: !!userId,
    staleTime: 1000 * 20,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateVisit() {
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.userId)!

  return useMutation({
    mutationFn: async (input: CreateVisitInput) => {
      const repo = await getVisitRepo(userId)
      return repo.create(input)
    },
    onSuccess: (visit) => {
      const dateISO = visit.visited_at.slice(0, 10)
      void qc.invalidateQueries({ queryKey: financeKeys.visits(userId, dateISO) })
      void qc.invalidateQueries({ queryKey: financeKeys.daily(userId, dateISO) })
      void qc.invalidateQueries({ queryKey: financeKeys.debt(userId) })
    },
  })
}

export function useAddPayment() {
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.userId)!

  return useMutation({
    mutationFn: async (input: AddPaymentInput) => {
      const repo = await getVisitRepo(userId)
      return repo.addPayment(input)
    },
    onSuccess: (payment) => {
      const dateISO = payment.paid_at.slice(0, 10)
      void qc.invalidateQueries({ queryKey: financeKeys.visitDetail(userId, payment.visit_id) })
      void qc.invalidateQueries({ queryKey: financeKeys.daily(userId, dateISO) })
      void qc.invalidateQueries({ queryKey: financeKeys.debt(userId) })
    },
  })
}

export function useCreateExpense() {
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.userId)!

  return useMutation({
    mutationFn: async (input: CreateExpenseInput) => {
      const repo = await getExpenseRepo(userId)
      return repo.create(input)
    },
    onSuccess: (expense) => {
      const dateISO = expense.spent_at.slice(0, 10)
      void qc.invalidateQueries({ queryKey: financeKeys.expenses(userId, dateISO) })
      void qc.invalidateQueries({ queryKey: financeKeys.daily(userId, dateISO) })
    },
  })
}

export function useDeleteExpense() {
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.userId)!

  return useMutation({
    mutationFn: async ({ id, dateISO }: { id: string; dateISO: string }) => {
      const repo = await getExpenseRepo(userId)
      await repo.delete(id)
      return { id, dateISO }
    },
    onSuccess: ({ dateISO }) => {
      void qc.invalidateQueries({ queryKey: financeKeys.expenses(userId, dateISO) })
      void qc.invalidateQueries({ queryKey: financeKeys.daily(userId, dateISO) })
    },
  })
}
