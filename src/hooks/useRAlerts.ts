import { useCallback, useEffect, useRef } from 'react'
import { ipc } from '../lib/ipc'
import { useToast } from '../components/ui'

interface RAlert {
  r: number
  enabled: boolean
}

export function useRAlerts() {
  const alertsRef = useRef<RAlert[]>([])
  const toast = useToast()

  useEffect(() => {
    void (async () => {
      const res = await ipc.settings.get<RAlert[]>('r_alerts')
      if (res.ok && res.data) alertsRef.current = res.data
    })()
  }, [])

  const checkAndAlert = useCallback(
    (pnlR: number | null) => {
      if (pnlR === null) return
      const rMultiple = pnlR / 100
      for (const a of alertsRef.current) {
        if (a.enabled && rMultiple >= a.r) {
          toast(`+${rMultiple.toFixed(2)}R — ${a.r}R target reached`, 'success')
          break
        }
      }
    },
    [toast],
  )

  return { checkAndAlert }
}
