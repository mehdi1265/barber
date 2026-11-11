import styles from './LoadingScreen.module.css'

interface LoadingScreenProps {
  message?: string
}

export function LoadingScreen({ message = 'در حال بارگذاری…' }: LoadingScreenProps) {
  return (
    <div className={styles.container} role="status" aria-label={message}>
      <div className={styles.spinner} aria-hidden="true" />
      <p className={styles.message}>{message}</p>
    </div>
  )
}
