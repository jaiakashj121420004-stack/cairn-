import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom'
import { Shell } from './components/layout/Shell'

const devRoutes = import.meta.env.DEV
  ? [
      {
        path: 'dev/components',
        lazy: () =>
          import('./features/dev/ComponentsPage').then((m) => ({ Component: m.ComponentsPage })),
      },
    ]
  : []

const router = createHashRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      {
        path: 'dashboard',
        lazy: () =>
          import('./features/dashboard/DashboardPage').then((m) => ({
            Component: m.DashboardPage,
          })),
      },
      {
        path: 'trades',
        lazy: () =>
          import('./features/trade-log/TradeLogPage').then((m) => ({
            Component: m.TradeLogPage,
          })),
      },
      {
        path: 'analytics',
        lazy: () =>
          import('./features/analytics/AnalyticsPage').then((m) => ({
            Component: m.AnalyticsPage,
          })),
      },
      {
        path: 'accounts',
        lazy: () =>
          import('./features/accounts/AccountsPage').then((m) => ({
            Component: m.AccountsPage,
          })),
      },
      {
        path: 'review',
        lazy: () =>
          import('./features/review/ReviewPage').then((m) => ({ Component: m.ReviewPage })),
      },
      {
        path: 'settings',
        lazy: () =>
          import('./features/settings/SettingsPage').then((m) => ({
            Component: m.SettingsPage,
          })),
      },
      ...devRoutes,
    ],
  },
])

export function Router() {
  return <RouterProvider router={router} />
}
