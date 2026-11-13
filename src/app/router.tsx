/**
 * Application router.
 * Uses React Router v7 with lazy-loaded feature routes.
 */

import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '@shared/components/layout/AppShell'
import {
  AppointmentDetailPage,
  AppointmentsPage,
  ColorFormulaDetailPage,
  ColorFormulasPage,
  CustomerDetailPage,
  CustomersPage,
  DashboardPage,
  FinancePage,
  ForgotPasswordPage,
  LoginPage,
  NotFoundPage,
  QuickSalePage,
  RedirectIfAuth,
  RegisterPage,
  RequireAuth,
  ResetPasswordPage,
  ServicesPage,
  SettingsPage,
  SuspenseWrapper,
} from './route-elements'

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
      {
        path: '/forgot-password',
        element: (
          <SuspenseWrapper>
            <ForgotPasswordPage />
          </SuspenseWrapper>
        ),
      },
    ],
  },

  // Recovery link target. Must stay outside the auth guards: the page creates
  // the session itself from the URL fragment before showing the form.
  {
    path: '/reset-password',
    element: (
      <SuspenseWrapper>
        <ResetPasswordPage />
      </SuspenseWrapper>
    ),
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
            path: '/finance/quick-sale',
            element: (
              <SuspenseWrapper>
                <QuickSalePage />
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
