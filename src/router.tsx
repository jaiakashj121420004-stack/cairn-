import { createHashRouter, RouterProvider, Outlet } from 'react-router-dom'

function PlaceholderHome() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <h1 className="text-display-lg font-sans font-semibold tracking-tight text-text-primary">
          Cairn
        </h1>
        <p className="mt-2 text-body text-text-secondary">A Discipline-First Trading Journal</p>
        <p className="mt-6 font-mono text-caption text-text-muted">
          scaffold — shell UI in progress
        </p>
      </div>
    </div>
  )
}

const devRoutes = import.meta.env.DEV
  ? [
      {
        path: '/dev/components',
        lazy: () =>
          import('./features/dev/ComponentsPage').then((m) => ({ Component: m.ComponentsPage })),
      },
    ]
  : []

const router = createHashRouter([
  {
    path: '/',
    element: <Outlet />,
    children: [
      { index: true, element: <PlaceholderHome /> },
      ...devRoutes,
    ],
  },
])

export function Router() {
  return <RouterProvider router={router} />
}
