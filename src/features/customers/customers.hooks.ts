/**
 * React Query hooks for customers.
 * All reads/writes go through CustomerRepository (SQLite first).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CustomerRepository } from '@database/repositories/customer.repository'
import { useAuthStore } from '@state/auth.store'
import { getDatabase } from '@database/sqlite/database'
import type { Customer } from '@shared/types'

// ── Query keys ────────────────────────────────────────────────────────────────

export const customerKeys = {
  all: (userId: string) => ['customers', userId] as const,
  search: (userId: string, q: string) => ['customers', userId, 'search', q] as const,
  detail: (userId: string, id: string) => ['customers', userId, id] as const,
}

// ── Helper: get repository ────────────────────────────────────────────────────

async function getRepo(userId: string) {
  const db = await getDatabase()
  return new CustomerRepository(db, userId)
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useCustomers() {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: customerKeys.all(userId),
    queryFn: async () => {
      const repo = await getRepo(userId)
      return repo.findAll()
    },
    enabled: !!userId,
    staleTime: 1000 * 30,
  })
}

export function useCustomerSearch(query: string) {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: customerKeys.search(userId, query),
    queryFn: async () => {
      const repo = await getRepo(userId)
      if (!query.trim()) return repo.findAll()
      return repo.search(query.trim())
    },
    enabled: !!userId,
    staleTime: 1000 * 10,
  })
}

export function useCustomer(id: string) {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: customerKeys.detail(userId, id),
    queryFn: async () => {
      const repo = await getRepo(userId)
      return repo.findById(id)
    },
    enabled: !!userId && !!id,
  })
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.userId)!

  return useMutation({
    mutationFn: async (input: { name: string; phone?: string | null; notes?: string | null }) => {
      const repo = await getRepo(userId)
      return repo.create(input)
    },
    onSuccess: newCustomer => {
      // Optimistically update the list cache
      qc.setQueryData<Customer[]>(customerKeys.all(userId), old =>
        old ? [newCustomer, ...old] : [newCustomer]
      )
      void qc.invalidateQueries({ queryKey: customerKeys.all(userId) })
    },
  })
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.userId)!

  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: { name?: string; phone?: string | null; notes?: string | null }
    }) => {
      const repo = await getRepo(userId)
      return repo.update(id, input)
    },
    onSuccess: (updated, { id }) => {
      if (updated) {
        qc.setQueryData<Customer>(customerKeys.detail(userId, id), updated)
      }
      void qc.invalidateQueries({ queryKey: customerKeys.all(userId) })
    },
  })
}

export function useDeleteCustomer() {
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.userId)!

  return useMutation({
    mutationFn: async (id: string) => {
      const repo = await getRepo(userId)
      await repo.delete(id)
      return id
    },
    onSuccess: id => {
      qc.setQueryData<Customer[]>(customerKeys.all(userId), old =>
        old ? old.filter(c => c.id !== id) : []
      )
      void qc.invalidateQueries({ queryKey: customerKeys.all(userId) })
    },
  })
}
