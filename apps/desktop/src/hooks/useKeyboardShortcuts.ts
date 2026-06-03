import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUiStore } from '../stores/ui-store'

function isInputActive() {
  const tag = document.activeElement?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const { setNewTradeRequested, setBiasRequested, setCommandPaletteOpen } = useUiStore()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey

      // ⌘K / Ctrl+K opens the command palette from anywhere — including inside inputs
      if (mod && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(true)
        return
      }

      if (mod && e.key === 'e') {
        e.preventDefault()
        void navigate('/trades')
        return
      }
      if (mod && e.key === ',') {
        e.preventDefault()
        void navigate('/settings')
        return
      }

      if (isInputActive()) return

      if (e.key === 'n' || e.key === 'N') {
        setNewTradeRequested(true)
        return
      }
      if (e.key === 'b' || e.key === 'B') {
        setBiasRequested(true)
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate, setNewTradeRequested, setBiasRequested, setCommandPaletteOpen])
}
