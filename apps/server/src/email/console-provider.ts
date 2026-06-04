import type { EmailMessage, EmailProvider } from './provider'
import type { AppLogger } from '../logger'

/**
 * Development email provider: logs the message (including the link) so a developer
 * can click through without an SMTP server.
 *
 * Dev-only escape hatch. Production uses Resend (EMAIL_PROVIDER=resend); this
 * provider is never selected there. It deliberately logs the verification link —
 * acceptable only because it is the developer's own local link on their own machine.
 */
export class ConsoleEmailProvider implements EmailProvider {
  constructor(private readonly logger: AppLogger) {}

  send(message: EmailMessage): Promise<void> {
    this.logger.info(
      { to: message.to, subject: message.subject, body: message.text },
      'email (console provider)',
    )
    return Promise.resolve()
  }
}
