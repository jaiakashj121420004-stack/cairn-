import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'
import { scaleIn, duration } from '../../lib/motion'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  maxWidth?: string
  closeOnBackdrop?: boolean
  className?: string
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = '560px',
  closeOnBackdrop = true,
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<Element | null>(null)
  // Stable ref so the focus-trap effect never needs to re-run when onClose changes.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  // Focus trap + restore — depends only on `open` so inline onClose callbacks
  // in parent components don't cause the overflow/focus cycle on every render.
  const stableClose = useCallback(() => onCloseRef.current(), [])
  useEffect(() => {
    if (!open) return undefined

    previousFocusRef.current = document.activeElement

    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      const first = panel.querySelectorAll<HTMLElement>(FOCUSABLE)[0]
      first?.focus()
    })

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        stableClose()
        return
      }
      if (e.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (nodes.length === 0) return

      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (!first || !last) return

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
      const prev = previousFocusRef.current
      if (prev instanceof HTMLElement) prev.focus()
    }
  }, [open, stableClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'modal-title' : undefined}
        >
          <motion.div
            className="absolute inset-0 bg-background/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: duration.short }}
            onClick={closeOnBackdrop ? onClose : undefined}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            className={cn(
              'relative flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-[4px] glass-strong',
              className,
            )}
            style={{
              maxWidth,
              borderColor: 'hsl(var(--border-strong))',
              boxShadow: '0 16px 40px hsl(0 0% 0% / 0.24)',
            }}
            variants={scaleIn}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {title && (
              <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
                <h2 id="modal-title" className="text-h3 font-semibold text-text-primary">
                  {title}
                </h2>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={onClose}
                  className="rounded-[8px] p-1 text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
