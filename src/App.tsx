import { ToastProvider } from './components/ui/toast'
import { Router } from './router'

export default function App() {
  return (
    <ToastProvider>
      <Router />
    </ToastProvider>
  )
}
