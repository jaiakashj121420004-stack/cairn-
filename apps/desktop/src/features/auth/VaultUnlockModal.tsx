import { useState } from 'react'
import { Button, Input, Modal } from '../../components/ui'

/**
 * Vault unlock / enrollment prompt (CLAUDE.md §18.5/§18.6, Stage 3).
 *
 * Shown to a signed-in user whose vault is locked. The same password both enrolls a new
 * vault (first device) and unlocks an existing one — the main process decides which. The
 * password is sent over IPC and never held in the renderer beyond this form's local state.
 */

const ERROR_COPY: Record<string, string> = {
  WRONG_KEY: 'Incorrect password. Try again.',
  EMAIL_NOT_VERIFIED: 'Verify your email before enabling sync. Check your inbox.',
  FORBIDDEN: 'Verify your email before enabling sync. Check your inbox.',
  RATE_LIMITED: 'Too many attempts. Wait a few minutes, then try again.',
  VALIDATION_ERROR: 'Enter your account password (at least 8 characters).',
  NETWORK_ERROR: "Can't reach the Cairn server. Check your connection.",
  INTERNAL: 'Something went wrong. Try again shortly.',
}

function copyFor(code: string | null): string | null {
  if (code === null) return null
  return ERROR_COPY[code] ?? 'That action could not be completed. Try again.'
}

export function VaultUnlockModal(props: {
  open: boolean
  busy: boolean
  errorCode: string | null
  onClose: () => void
  onSubmit: (password: string) => void
}) {
  const [password, setPassword] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    props.onSubmit(password)
  }

  return (
    <Modal open={props.open} onClose={props.onClose} title="Unlock your vault" maxWidth="440px">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-caption text-text-secondary">
          Enter your account password to enable end-to-end-encrypted sync on this device. Your
          password derives the key locally — Cairn’s server never sees it.
        </p>
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {copyFor(props.errorCode) && (
          <p className="text-caption text-danger">{copyFor(props.errorCode)}</p>
        )}
        <Button type="submit" loading={props.busy} className="w-full">
          Unlock
        </Button>
      </form>
    </Modal>
  )
}
