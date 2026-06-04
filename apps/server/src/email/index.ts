import { ConsoleEmailProvider } from './console-provider'
import { MemoryEmailProvider } from './memory-provider'
import { ResendEmailProvider } from './resend-provider'
import type { EmailProvider } from './provider'
import type { Env } from '../env'
import type { AppLogger } from '../logger'

export type { EmailMessage, EmailProvider } from './provider'
export { MemoryEmailProvider } from './memory-provider'

/**
 * Choose the email transport from configuration (CLAUDE.md §18.5). `resend` for
 * production, `console` for local dev, `memory` for tests. The factory throws if a
 * required setting (Resend API key) is missing — the env validator already enforces
 * this, so this is a defensive second gate.
 */
export function createEmailProvider(env: Env, logger: AppLogger): EmailProvider {
  switch (env.EMAIL_PROVIDER) {
    case 'resend': {
      if (!env.RESEND_API_KEY)
        throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend')
      return new ResendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM)
    }
    case 'memory':
      return new MemoryEmailProvider()
    case 'console':
      return new ConsoleEmailProvider(logger)
    default: {
      // Exhaustiveness guard — a new enum value must be handled here.
      const exhaustive: never = env.EMAIL_PROVIDER
      throw new Error(`unsupported EMAIL_PROVIDER: ${String(exhaustive)}`)
    }
  }
}
