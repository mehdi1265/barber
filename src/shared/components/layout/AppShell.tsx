/**
 * AppShell — the main application shell with bottom navigation.
 * All authenticated pages render inside this layout.
 */

import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useSyncStore } from '@state/sync.store'
import { useAuthStore } from '@state/auth.store'
import { AccountMenu } from '@features/auth/AccountMenu'
import { getPendingOutboxCount, logoutUseCase } from '@features/auth/auth.usecases'
import { SyncManager } from '@sync/components/SyncManager'
import { runSync } from '@sync/engine/sync.manager'
import styles from './AppShell.module.css'

const navItems = [
  { to: '/dashboard', label: 'خانه', icon: '🏠' },
  { to: '/appointments', label: 'تقویم', icon: '📅' },
  { to: '/customers', label: 'مشتریان', icon: '👥' },
  { to: '/color-formulas', label: 'رنگ', icon: '🎨' },
  { to: '/finance', label: 'مالی', icon: '💰' },
]

export function AppShell() {
  const { status, pendingCount, errorMessage } = useSyncStore()
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore(state => state.user)
  const clearAuth = useAuthStore(state => state.clearAuth)

  const handleLogout = async () => {
    await logoutUseCase()
    clearAuth()
    void navigate('/login', { replace: true })
  }

  return (
    <div className={styles.shell} dir="rtl">
      <SyncManager />

      {user?.email && (
        <AccountMenu
          email={user.email}
          onLogout={handleLogout}
          getPendingCount={getPendingOutboxCount}
        />
      )}

      {/* Top sync indicator */}
      {status === 'syncing' && (
        <div className={styles.syncBanner} role="status" aria-live="polite">
          در حال همگام‌سازی…
        </div>
      )}
      {status === 'offline' && pendingCount > 0 && (
        <div className={styles.offlineBanner} role="status">
          آفلاین — {pendingCount} تغییر در انتظار
        </div>
      )}
      {status === 'error' && (
        <div className={styles.errorBanner} role="status">
          <span>{errorMessage ?? 'همگام‌سازی ناموفق بود'}</span>
          <button
            type="button"
            className={styles.retryBtn}
            onClick={() => {
              void runSync('manual')
            }}
          >
            تلاش دوباره
          </button>
        </div>
      )}

      {/* Page content */}
      <main className={styles.main}>
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className={styles.bottomNav} aria-label="پیمایش اصلی">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [styles.navItem, isActive ? styles.navItemActive : ''].join(' ')
            }
            aria-current={location.pathname.startsWith(item.to) ? 'page' : undefined}
          >
            <span className={styles.navIcon} aria-hidden="true">
              {item.icon}
            </span>
            <span className={styles.navLabel}>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
