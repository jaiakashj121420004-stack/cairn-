// The single transport seam the renderer's `ipc` facade depends on (CLAUDE.md §3.6,
// Stage 18.7). On desktop this re-exports `electronTransport` (IPC) verbatim — zero
// behavioural change. It exists so the *web* app can alias `@/lib/transport` to its
// `HttpTransport` bridge (see apps/web/vite.config.ts + tsconfig) without editing any
// feature code or `ipc.ts`: the renderer reuses `apps/desktop/src/features/**`
// unchanged and only the transport underneath differs.
import type { Procedures } from '@shared/types/index'
import { electronTransport } from './transport-electron'
import type { Transport } from '@cairn/shared-types'

export const transport: Transport<Procedures> = electronTransport
