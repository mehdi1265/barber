import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ColorFormulaRepository,
  type ColorFormulaInput,
} from '@database/repositories/color-formula.repository'
import { VisitRepository } from '@database/repositories/visit.repository'
import { useAuthStore } from '@state/auth.store'
import { getDatabase } from '@database/sqlite/database'

export const colorFormulaKeys = {
  all: (userId: string) => ['color-formulas', userId] as const,
  search: (userId: string, q: string) => ['color-formulas', userId, 'search', q] as const,
  detail: (userId: string, id: string) => ['color-formulas', userId, 'detail', id] as const,
  byCustomer: (userId: string, customerId: string) =>
    ['color-formulas', userId, 'customer', customerId] as const,
  visits: (userId: string, customerId: string) =>
    ['visits', userId, 'customer', customerId] as const,
}

async function getRepo(userId: string) {
  const db = await getDatabase()
  return new ColorFormulaRepository(db, userId)
}

export function useFormulas(query: string) {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: query.trim()
      ? colorFormulaKeys.search(userId, query.trim())
      : colorFormulaKeys.all(userId),
    queryFn: async () => {
      const repo = await getRepo(userId)
      return query.trim() ? repo.search(query.trim()) : repo.findAll()
    },
    enabled: !!userId,
    staleTime: 1000 * 20,
  })
}

export function useFormulaDetail(id: string) {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: colorFormulaKeys.detail(userId, id),
    queryFn: async () => {
      const repo = await getRepo(userId)
      return repo.findDetail(id)
    },
    enabled: !!userId && !!id,
  })
}

export function useFormulasByCustomer(customerId: string) {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: colorFormulaKeys.byCustomer(userId, customerId),
    queryFn: async () => {
      const repo = await getRepo(userId)
      return repo.findByCustomer(customerId)
    },
    enabled: !!userId && !!customerId,
  })
}

export function useCustomerVisits(customerId: string) {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: colorFormulaKeys.visits(userId, customerId),
    queryFn: async () => {
      const db = await getDatabase()
      return new VisitRepository(db, userId).findByCustomer(customerId)
    },
    enabled: !!userId && !!customerId,
  })
}

function useInvalidateFormulas() {
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.userId)!
  return () => {
    void qc.invalidateQueries({ queryKey: colorFormulaKeys.all(userId) })
  }
}

export function useCreateFormula() {
  const userId = useAuthStore(s => s.userId)!
  const invalidate = useInvalidateFormulas()
  return useMutation({
    mutationFn: async (input: ColorFormulaInput) => {
      const repo = await getRepo(userId)
      return repo.create(input)
    },
    onSuccess: invalidate,
  })
}

export function useUpdateFormula() {
  const userId = useAuthStore(s => s.userId)!
  const invalidate = useInvalidateFormulas()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<ColorFormulaInput> }) => {
      const repo = await getRepo(userId)
      return repo.update(id, input)
    },
    onSuccess: invalidate,
  })
}

export function useDuplicateFormula() {
  const userId = useAuthStore(s => s.userId)!
  const invalidate = useInvalidateFormulas()
  return useMutation({
    mutationFn: async (id: string) => {
      const repo = await getRepo(userId)
      return repo.duplicate(id)
    },
    onSuccess: invalidate,
  })
}

export function useDeleteFormula() {
  const userId = useAuthStore(s => s.userId)!
  const invalidate = useInvalidateFormulas()
  return useMutation({
    mutationFn: async (id: string) => {
      const repo = await getRepo(userId)
      await repo.delete(id)
      return id
    },
    onSuccess: invalidate,
  })
}
