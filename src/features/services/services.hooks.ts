import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ServiceRepository } from '@database/repositories/service.repository'
import { useAuthStore } from '@state/auth.store'
import { getDatabase } from '@database/sqlite/database'
import type { Service } from '@shared/types'

export const serviceKeys = {
  all: (userId: string) => ['services', userId] as const,
  active: (userId: string) => ['services', userId, 'active'] as const,
  search: (userId: string, q: string) => ['services', userId, 'search', q] as const,
  detail: (userId: string, id: string) => ['services', userId, id] as const,
}

async function getRepo(userId: string) {
  const db = await getDatabase()
  return new ServiceRepository(db, userId)
}

export function useServices(activeOnly = true) {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: activeOnly ? serviceKeys.active(userId) : serviceKeys.all(userId),
    queryFn: async () => {
      const repo = await getRepo(userId)
      return repo.findAll(activeOnly)
    },
    enabled: !!userId,
    staleTime: 1000 * 60,
  })
}

export function useServiceSearch(query: string) {
  const userId = useAuthStore(s => s.userId)!
  return useQuery({
    queryKey: serviceKeys.search(userId, query),
    queryFn: async () => {
      const repo = await getRepo(userId)
      if (!query.trim()) return repo.findAll(true)
      return repo.search(query.trim())
    },
    enabled: !!userId,
    staleTime: 1000 * 10,
  })
}

export function useCreateService() {
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.userId)!

  return useMutation({
    mutationFn: async (input: {
      name: string
      default_price?: number | null
      suggested_duration_minutes?: number | null
    }) => {
      const repo = await getRepo(userId)
      return repo.create(input)
    },
    onSuccess: (newService) => {
      qc.setQueryData<Service[]>(serviceKeys.active(userId), old =>
        old ? [newService, ...old] : [newService]
      )
      void qc.invalidateQueries({ queryKey: serviceKeys.active(userId) })
    },
  })
}

export function useUpdateService() {
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.userId)!

  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: { name?: string; default_price?: number | null; suggested_duration_minutes?: number | null }
    }) => {
      const repo = await getRepo(userId)
      return repo.update(id, input)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: serviceKeys.active(userId) })
    },
  })
}

export function useDeactivateService() {
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.userId)!

  return useMutation({
    mutationFn: async (id: string) => {
      const repo = await getRepo(userId)
      await repo.deactivate(id)
      return id
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: serviceKeys.active(userId) })
    },
  })
}
