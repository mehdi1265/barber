/**
 * Root providers — wraps the entire application tree.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { errorDetails, logger } from '@shared/utils/logger'
import { isDatabaseUnavailable, userMessageFor } from '@shared/utils/user-message'
import { useActionErrorStore } from '@state/action-error.store'

const WRITE_FAILED_MESSAGE = 'ذخیره اطلاعات انجام نشد. دوباره تلاش کنید.'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Offline-first: data is primarily from SQLite, so network is secondary
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: (failureCount, error) => {
        // Don't retry auth errors
        if (error instanceof Error && error.message.includes('401')) return false
        // A missing local database cannot be fixed by retrying the query.
        if (isDatabaseUnavailable(error)) return false
        return failureCount < 2
      },
    },
    mutations: {
      // Mutations always write to SQLite first; network errors don't block UI.
      // Every failure is also shown to the user: a rejected write must never
      // look like a button that silently does nothing.
      onError: error => {
        logger.error('Mutation failed', { error: errorDetails(error) })
        useActionErrorStore.getState().show(userMessageFor(error, WRITE_FAILED_MESSAGE))
      },
    },
  },
})

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
