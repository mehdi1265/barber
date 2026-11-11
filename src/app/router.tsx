/**
 * Application router.
 * Uses React Router v7 with lazy-loaded feature routes.
 */

import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { useAuthStore } from '@state/auth.store'
import { AppShell } from '@shared/components/layout/AppShell'
import { LoadingScreen } from '@shared/components/ui/LoadingScreen'

// ── Lazy-loaded feature pages ─────────────────────────────────────────────────
const LoginPage = lazy(() => import('@features/auth/LoginPage'))
const RegisterPage = lazy(() => import('@features/auth/RegisterPage'))
const DashboardPage = lazy(() => import('@features/dashboard/DashboardPage'))
const AppointmentsPage = lazy(() => import('@features/appointments/AppointmentsPage'))
const AppointmentDetailPage = lazy(
  () => import('@features/appointments/AppointmentDetailPage')
)
const CustomersPage = lazy(() => import('@features/customers/CustomersPage'))
const CustomerDetailPage = lazy(() => import('@features/customers/CustomerDetailPage'))
const ColorFormulasPage = lazy(() => import('@features/color-formulas/ColorFormulasPage'))
const ColorFormulaDetailPage = lazy(
  () => import('@features/color-formulas/ColorFormulaDetailPage')
)
const FinancePage = lazy(() => import('@features/finance/FinancePage'))
const SettingsPage = lazy(() => import('@features/settings/SettingsPage'))
const ServicesPage = lazy(() => import('@features/services/ServicesPage'))
const NotFoundPage = lazy(() => import('@shared/components/ui/NotFoundPage'))

// ── Guards ────────────────────────────────────────────────────────────────────

function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuthStore()
  if (isLoading) return <LoadingScreen />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Outlet />
}

function RedirectIfAuth() {
  const { isAuthenticated, isLoading } = useAuthStore()
  if (isLoading) return <LoadingScreen />
  if (isAuthenticated) return <Navigate to="/" replace />
  return <Outlet />
}

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingScreen />}>{children}</Suspense>
}

// ── Router definition ─────────────────────────────────────────────────────────

export const router = createBrowserRouter([
  // Public routes
  {
    element: <RedirectIfAuth />,
    children: [
      {
        path: '/login',
        element: (
          <SuspenseWrapper>
            <LoginPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: '/register',
        element: (
          <SuspenseWrapper>
            <RegisterPage />
          </SuspenseWrapper>
        ),
      },
    ],
  },

  // Protected routes
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          {
            path: '/dashboard',
            element: (
              <SuspenseWrapper>
                <DashboardPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: '/appointments',
            element: (
              <SuspenseWrapper>
                <AppointmentsPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: '/appointments/:id',
            element: (
              <SuspenseWrapper>
                <AppointmentDetailPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: '/customers',
            element: (
              <SuspenseWrapper>
                <CustomersPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: '/customers/:id',
            element: (
              <SuspenseWrapper>
                <CustomerDetailPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: '/color-formulas',
            element: (
              <SuspenseWrapper>
                <ColorFormulasPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: '/color-formulas/:id',
            element: (
              <SuspenseWrapper>
                <ColorFormulaDetailPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: '/finance',
            element: (
              <SuspenseWrapper>
                <FinancePage />
              </SuspenseWrapper>
            ),
          },
          {
            path: '/settings',
            element: (
              <SuspenseWrapper>
                <SettingsPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: '/settings/services',
            element: (
              <SuspenseWrapper>
                <ServicesPage />
              </SuspenseWrapper>
            ),
          },
        ],
      },
    ],
  },

  // 404
  {
    path: '*',
    element: (
      <SuspenseWrapper>
        <NotFoundPage />
      </SuspenseWrapper>
    ),
  },
])
