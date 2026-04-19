import { useEffect } from 'react'
import { ipc } from './lib/ipc'

export default function App() {
  useEffect(() => {
    ipc.ping().then((result) => {
      if (result.ok) {
        console.log('pong received:', result.data)
      } else {
        console.error('ping failed:', result.error)
      }
    })
  }, [])

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <h1 className="text-display-lg font-sans font-semibold tracking-tight">Cairn</h1>
        <p className="mt-2 text-body text-text-secondary">A Discipline-First Trading Journal</p>
        <p className="mt-6 font-mono text-caption text-text-muted">scaffold — check console for IPC ping</p>
      </div>
    </div>
  )
}
