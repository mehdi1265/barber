import styles from './SummaryCard.module.css'

interface SummaryCardProps {
  label: string
  value: string
  icon?: string
  color?: 'default' | 'green' | 'red' | 'orange' | 'blue'
  onClick?: () => void
}

export function SummaryCard({ label, value, icon, color = 'default', onClick }: SummaryCardProps) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      className={[styles.card, styles[color], onClick ? styles.clickable : ''].join(' ')}
      onClick={onClick}
    >
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className={styles.label}>{label}</span>
      <span className={styles.value} dir="rtl">
        {value}
      </span>
    </Tag>
  )
}
