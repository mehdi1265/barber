/**
 * Route elements and guards.
 *
 * Kept separate from `router.tsx` so the router module exports only the router
 * object, while this module exports only components (react-refresh requirement).
 */

import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@state/auth.store'
import { LoadingScreen } from '@shared/components/ui/LoadingScreen'

// ── Lazy-loaded feature pages ─────────────────────────────────────────────────

export const LoginPage = lazy(() => import('@features/auth/LoginPage'))
export const RegisterPage = lazy(() => import('@features/auth/RegisterPage'))
export const DashboardPage = lazy(() => import('@features/dashboard/DashboardPage'))
export const AppointmentsPage = lazy(() => import('@features/appointments/AppointmentsPage'))
export const AppointmentDetailPage = lazy(
  () => import('@features/appointments/AppointmentDetailPage')
)
export const CustomersPage = lazy(() => import('@features/customers/CustomersPage'))
export const CustomerDetailPage = lazy(() => import('@features/customers/CustomerDetailPage'))
export const ColorFormulasPage = lazy(() => import('@features/color-formulas/ColorFormulasPage'))
export const ColorFormulaDetailPage = lazy(
  () => import('@features/color-formulas/ColorFormulaDetailPage')
)
export const FinancePage = lazy(() => import('@features/finance/FinancePage'))
export const SettingsPage = lazy(() => import('@features/settings/SettingsPage'))
export const ServicesPage = lazy(() => import('@features/services/ServicesPage'))
export const NotFoundPage = lazy(() => import('@shared/components/ui/NotFoundPage'))

// ── Guards ────────────────────────────────────────────────────────────────────

export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuthStore()
  if (isLoading) return <LoadingScreen />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Outlet />
}

export function RedirectIfAuth() {
  const { isAuthenticated, isLoading } = useAuthStore()
  if (isLoading) return <LoadingScreen />
  if (isAuthenticated) return <Navigate to="/" replace />
  return <Outlet />
}

export function SuspenseWrapper({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingScreen />}>{children}</Suspense>
}
