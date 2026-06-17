# @cairn/web

The Cairn web client (CLAUDE.md §3.1c, §18.7). The **same** React UI as the desktop
renderer (`apps/desktop/src/features/**`), compiled against an `HttpTransport` instead of
`ElectronTransport`. Web and desktop are meant to show the same numbers — only the
transport underneath differs.

## How the transport swap works

Every feature calls `@/lib/ipc`, which reads its transport from `@/lib/transport`. On
desktop that re-exports `electronTransport` (IPC). The web build **aliases**
`@/lib/transport` → `src/lib/transport-http.ts` (see `vite.config.ts` + `tsconfig.json`),
so the identical feature code runs over HTTP with zero feature edits.

## Layout

```
src/lib/
  http-core.ts       Authed fetch: in-memory access token, single-flight refresh, Result mapping
  transport-http.ts  Transport<Procedures> over HTTP; wires HttpCore + WebVault (the @/lib/transport alias target)
  session.ts         Zustand auth/session controller used by the screens
  web-vault.ts       Unlock/recover/enroll + pull→decrypt→cache; holds the data key in memory
  vault-crypto.ts    Derive KEK, unwrap data key, decrypt ops (uses @cairn/shared-crypto)
  vault-codec.ts     Browser-safe wire (de)serialization (mirror of desktop serialize.ts)
  vault-cache.ts     Dexie/IndexedDB cache of the DECRYPTED vault (read-only offline source)
  register-sw.ts     Registers the read-only offline service worker
src/screens/         Auth + vault + Pro-gate screens
functions/_middleware.ts  Production CSP per-response nonce (Cloudflare Pages)
public/sw.js         Read-only offline service worker
tests/e2e/           Playwright: signup → verify → recovery-phrase → sync → multi-device
```

## Scripts

```
pnpm --filter @cairn/web dev          # Vite dev server (relaxed dev CSP)
pnpm --filter @cairn/web typecheck    # tsc strict
pnpm --filter @cairn/web test:unit    # vitest (http-core refresh/mapping)
pnpm --filter @cairn/web test:e2e     # Playwright (boots the mock API + dev server)
pnpm --filter @cairn/web build        # production bundle (strict CSP meta + edge nonce)
```

Set `VITE_API_ORIGIN` to the API base URL (defaults to `http://localhost:8787`).

## Status / next stage

Built and self-verified: the crypto package extraction, `HttpCore` (with unit tests),
client-side decryption + IndexedDB cache, the auth/vault/Pro screens, the service worker,
the CSP/cookie/CSRF security model (`SECURITY.md`), and the e2e suite.

Not yet wired: the local **trading-data layer** (trades, accounts, analytics) reading from
the decrypted IndexedDB cache. Those procedures currently return `NOT_IMPLEMENTED` rather
than silently-wrong numbers. Enabling the full reused feature tree on web depends on
extracting the desktop's query/analytics services into a storage-agnostic shared package —
the next stage.
