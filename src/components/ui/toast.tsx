import { createContext, useContext, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react'
import { cn } from '../../lib/cn'
import { slideUp, springDefault } from '../../lib/motion'

type ToastVariant = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: string
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, durationMs?: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const variantIcon: Record<ToastVariant, React.FC<{ className?: string }>> = {
  success: ({ className }) => <CheckCircle className={cn('h-4 w-4 shrink-0 text-accent-a', className)} strokeWidth={1.5} />,
  error: ({ className }) => <XCircle className={cn('h-4 w-4 shrink-0 text-danger', className)} strokeWidth={1.5} />,
  warning: ({ className }) => <AlertTriangle className={cn('h-4 w-4 shrink-0 text-warning', className)} strokeWidth={1.5} />,
  info: ({ className }) => <Info className={cn('h-4 w-4 shrink-0 text-info', className)} strokeWidth={1.5} />,
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, variant: ToastVariant = 'info', durationMs = 2400) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((prev) => [...prev.slice(-2), { id, message, variant }])
      if (durationMs > 0) setTimeout(() => dismiss(id), durationMs)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = variantIcon[t.variant]
            return (
              <motion.div
                key={t.id}
                variants={slideUp}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={springDefault}
                className="flex min-w-[280px] max-w-sm items-start gap-3 rounded-[10px] border border-border bg-surface-elevated px-4 py-3 shadow-lg"
              >
                <Icon />
                <p className="flex-1 text-body-sm text-text-primary">{t.message}</p>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue['toast'] {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx.toast
}
