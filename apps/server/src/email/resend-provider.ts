import type { EmailMessage, EmailProvider } from './provider'

/**
 * Production email provider backed by Resend (CLAUDE.md §3.1b).
 *
 * The Resend SDK is imported lazily so dev/test environments that never select it
 * don't pay for the dependency at boot and don't require an API key.
 */
export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const { Resend } = await import('resend')
    const client = new Resend(this.apiKey)
    const result = await client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html !== undefined ? { html: message.html } : {}),
    })
    if (result.error) {
      throw new Error(`Resend delivery failed: ${result.error.name}`)
    }
  }
}
