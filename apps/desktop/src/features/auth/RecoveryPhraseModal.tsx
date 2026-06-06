import { useState } from 'react'
import { Button, Input, Modal } from '../../components/ui'

/**
 * Recovery-phrase reveal, shown exactly once on first enrollment (CLAUDE.md §2.2/§2.13,
 * docs/security.md §5). The 24-word phrase is the ONLY way to recover the vault if the
 * password is lost — Cairn cannot reset it. So the reveal is gated like an override: the
 * user must type the exact acknowledgement before the modal can be dismissed.
 *
 * Security choices:
 *  - The phrase is rendered as static, non-interactive text — there is no "copy" button and
 *    no programmatic clipboard write, so it never lands in Windows clipboard history. (A
 *    per-field clipboard-history opt-out is not exposed to web content on Windows; avoiding
 *    the clipboard entirely is the reliable mitigation. The user writes the words down.)
 *  - The acknowledgement input disables autocomplete/spellcheck so the words/answer are not
 *    captured by the platform text services.
 *  - The phrase lives only in this component's props/local render; it is never written to the
 *    auth store, settings, logs, or the keychain.
 */

const ACK_PHRASE = 'I have written this down'

export function RecoveryPhraseModal(props: {
  open: boolean
  phrase: readonly string[]
  onAcknowledge: () => void
}) {
  const [ack, setAck] = useState('')
  const confirmed = ack.trim() === ACK_PHRASE

  function acknowledge() {
    if (!confirmed) return
    setAck('')
    props.onAcknowledge()
  }

  return (
    <Modal
      open={props.open}
      onClose={() => undefined}
      title="Save your recovery phrase"
      maxWidth="560px"
      closeOnBackdrop={false}
    >
      <div className="space-y-4">
        <p className="text-caption text-text-secondary">
          These 24 words are the only way to recover your encrypted journal if you forget your
          password. Cairn cannot reset them for you. Write them down in order and keep them
          somewhere safe and offline. They are shown only once.
        </p>

        <ol className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-[12px] border border-border bg-surface/60 p-4 sm:grid-cols-3">
          {props.phrase.map((word, i) => (
            <li key={`${i}-${word}`} className="flex items-baseline gap-2 font-mono text-body">
              <span className="w-6 shrink-0 text-right text-caption text-text-muted">{i + 1}</span>
              <span className="text-text-primary">{word}</span>
            </li>
          ))}
        </ol>

        <div className="space-y-2">
          <Input
            label={`Type "${ACK_PHRASE}" to confirm you have saved it`}
            value={ack}
            onChange={(e) => setAck(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
          <Button onClick={acknowledge} disabled={!confirmed} className="w-full">
            I’ve saved my recovery phrase
          </Button>
        </div>
      </div>
    </Modal>
  )
}
