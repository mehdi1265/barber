/**
 * Root providers — wraps the entire application tree.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Offline-first: data is primarily from SQLite, so network is secondary
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: (failureCount, error) => {
        // Don't retry auth errors
        if (error instanceof Error && error.message.includes('401')) return false
        return failureCount < 2
      },
    },
    mutations: {
      // Mutations always write to SQLite first; network errors don't block UI
      onError: (error) => {
        console.error('[mutation error]', error)
      },
    },
  },
})

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
