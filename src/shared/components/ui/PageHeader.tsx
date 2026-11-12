import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import styles from './PageHeader.module.css'

interface PageHeaderProps {
  title: string
  backTo?: string
  actions?: ReactNode
}

export function PageHeader({ title, backTo, actions }: PageHeaderProps) {
  const navigate = useNavigate()

  return (
    <header className={styles.header}>
      {backTo && (
        <button
          className={styles.back}
          onClick={() => { void navigate(backTo) }}
          aria-label="بازگشت"
        >
          ←
        </button>
      )}
      <h1 className={styles.title}>{title}</h1>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  )
}
