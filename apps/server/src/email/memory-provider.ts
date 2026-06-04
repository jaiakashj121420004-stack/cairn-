import type { EmailMessage, EmailProvider } from './provider'

/**
 * In-memory email provider for integration tests (CLAUDE.md §19.10).
 *
 * Captures every message so a test can assert what was sent and extract the raw
 * verify/magic token from the link. Never used outside tests.
 */
export class MemoryEmailProvider implements EmailProvider {
  readonly messages: EmailMessage[] = []

  send(message: EmailMessage): Promise<void> {
    this.messages.push(message)
    return Promise.resolve()
  }

  /** The most recently sent message addressed to `to` (case-insensitive). */
  lastTo(to: string): EmailMessage | undefined {
    const target = to.toLowerCase()
    for (let i = this.messages.length - 1; i >= 0; i -= 1) {
      const msg = this.messages[i]
      if (msg && msg.to.toLowerCase() === target) return msg
    }
    return undefined
  }

  clear(): void {
    this.messages.length = 0
  }
}
