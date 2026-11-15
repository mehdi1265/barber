import { useQuery } from '@tanstack/react-query'
import { SearchRepository, DEFAULT_GROUP_LIMIT } from './search.repository'
import { useAuthStore } from '@state/auth.store'
import { getDatabase } from '@database/sqlite/database'

export const searchKeys = {
  all: (userId: string, query: string, limit: number) => ['search', userId, query, limit] as const,
}

export function useGlobalSearch(query: string, limit = DEFAULT_GROUP_LIMIT) {
  const userId = useAuthStore(state => state.userId)!
  const term = query.trim()

  return useQuery({
    queryKey: searchKeys.all(userId, term, limit),
    queryFn: async () => {
      const db = await getDatabase()
      return new SearchRepository(db, userId).searchAll(term, limit)
    },
    enabled: !!userId && term.length > 0,
    staleTime: 1000 * 10,
  })
}
