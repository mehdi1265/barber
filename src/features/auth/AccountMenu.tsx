/**
 * Account menu shown in the app shell.
 * Logout is always confirmed; when queued sync operations exist the dialog
 * warns that they stay on this device until the next login.
 */

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '@shared/components/ui/ConfirmDialog'
import styles from './AccountMenu.module.css'

interface AccountMenuProps {
  email: string
  onLogout: () => void | Promise<void>
  getPendingCount: () => Promise<number>
}

export function AccountMenu({ email, onLogout, getPendingCount }: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  const openLogoutConfirm = async () => {
    setIsOpen(false)
    const count = await getPendingCount().catch(() => 0)
    setPendingCount(count)
    setIsConfirmOpen(true)
  }

  const confirmLogout = async () => {
    try {
      await onLogout()
    } finally {
      setIsConfirmOpen(false)
    }
  }

  const dialogMessage =
    pendingCount > 0
      ? `${pendingCount.toLocaleString('fa-IR')} تغییر در انتظار همگام‌سازی است. با خروج، این تغییرات تا ورود بعدی ارسال نمی‌شوند. خارج می‌شوید؟`
      : 'از حساب خود خارج می‌شوید؟ اطلاعات محلی این دستگاه حفظ می‌شود.'

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.avatar}
        aria-label="منوی حساب"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(value => !value)}
      >
        <span aria-hidden="true">{email.charAt(0).toUpperCase()}</span>
      </button>

      {isOpen && (
        <div className={styles.menu} role="menu" aria-label="منوی حساب">
          <p className={styles.email} dir="ltr" title={email}>
            {email}
          </p>
          <Link
            to="/settings"
            role="menuitem"
            className={styles.item}
            onClick={() => setIsOpen(false)}
          >
            تنظیمات
          </Link>
          <button
            type="button"
            role="menuitem"
            className={styles.logoutItem}
            onClick={() => {
              void openLogoutConfirm()
            }}
          >
            خروج از حساب
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="خروج از حساب"
        message={dialogMessage}
        confirmLabel="خروج"
        cancelLabel="انصراف"
        danger
        onConfirm={() => {
          void confirmLogout()
        }}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </div>
  )
}
