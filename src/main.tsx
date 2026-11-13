import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Providers } from './app/providers'
import { router } from './app/router'
import { bootstrapApp } from './app/bootstrap'
import { DatabaseStatusBanner } from './app/DatabaseStatusBanner'
import { ErrorBoundary } from './app/ErrorBoundary'
import { errorDetails, logger } from '@shared/utils/logger'
import './index.css'

/**
 * Last-resort startup failure screen.
 *
 * Bootstrap itself handles database failures without throwing. This path is
 * only for unexpected errors (for example a missing root element or a failed
 * dynamic import), and deliberately does not render the raw error.
 */
function showFatalError(err: unknown): void {
  logger.error('Fatal: app startup failed', { error: errorDetails(err) })

  const root = document.getElementById('root')
  if (!root) return

  root.innerHTML = `
    <main dir="rtl" role="alert" style="min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:2rem;text-align:center;font-family:sans-serif">
      <h1 style="font-size:1.25rem">راه‌اندازی برنامه ممکن نشد</h1>
      <p style="color:#64748b">لطفاً صفحه را دوباره بارگذاری کنید.</p>
      <button type="button" style="padding:0.7rem 1.5rem;border:0;border-radius:10px;background:#2563eb;color:#fff;font:inherit;cursor:pointer">
        تلاش دوباره
      </button>
    </main>
  `
  root.querySelector('button')?.addEventListener('click', () => window.location.reload())
}

function start(): void {
  const root = document.getElementById('root')
  if (!root) throw new Error('Root element not found')

  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <Providers>
          <DatabaseStatusBanner />
          <RouterProvider router={router} />
        </Providers>
      </ErrorBoundary>
    </StrictMode>
  )

  // Render first: a database plugin that hangs must not leave the user on a
  // blank page. Auth guards show their loading state until this settles.
  void bootstrapApp().catch(err => {
    logger.error('Unexpected startup failure', { error: errorDetails(err) })
  })
}

try {
  start()
} catch (err) {
  showFatalError(err)
}
