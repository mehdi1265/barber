import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { errorDetails, logger } from '@shared/utils/logger'
import styles from './ErrorBoundary.module.css'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

/**
 * Catches render errors and shows a Persian fallback. The raw error and stack
 * go to the local log buffer only; they are never rendered to the user.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('Unhandled UI error', {
      error: errorDetails(error),
      componentStack: info.componentStack ?? null,
    })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className={styles.screen} dir="rtl" role="alert">
        <span className={styles.icon} aria-hidden="true">
          ⚠️
        </span>
        <h1 className={styles.title}>مشکلی پیش آمد</h1>
        <p className={styles.text}>
          یک خطای غیرمنتظره رخ داد. اطلاعات ذخیره‌شده در دستگاه شما محفوظ است.
        </p>
        <button type="button" className={styles.button} onClick={() => window.location.reload()}>
          بارگذاری دوباره
        </button>
      </main>
    )
  }
}
