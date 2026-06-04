/**
 * Transactional email transport (CLAUDE.md §3.1b, §18.5).
 *
 * The provider is a dumb transport — the AuthService composes the message; the
 * provider only delivers it. This keeps Resend/Postmark swappable behind one
 * interface and lets tests substitute an in-memory capture.
 */
export interface EmailMessage {
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly html?: string
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>
}
