# Cairn Web — Security Model

Scope: the browser client (`apps/web`). The vault-encryption primitives are in
`packages/shared-crypto` and documented in `docs/security.md`; this file covers only the
**web-transport** concerns — cookies, CSP, and the refresh flow — and is the checklist for
the **second-model review** required by CLAUDE.md §2.12 / task §8.

## 1. Token handling

| Token | Where it lives | Why |
|---|---|---|
| Access JWT (≤ 15 min) | **Memory only** (`HttpCore.accessToken`) | Not in any cookie / `localStorage` / `sessionStorage`. Dies with the tab. XSS can still read memory, but there is no persistence to steal and no cookie to ride. |
| Refresh token (opaque, rotating) | `__Host-refresh` cookie: `HttpOnly` + `Secure` + `SameSite=Strict` + `Path=/` | JS never reads it. `__Host-` forbids a `Domain` attribute and forces `Path=/` + `Secure`, so a subdomain cannot set/overwrite it. Sent automatically via `credentials: 'include'` only to the API origin. |
| CSRF token | Readable `csrf` cookie, `SameSite=Strict` + `Secure` | Non-secret; echoed in `x-csrf-token` on `/auth/refresh` (double-submit). |

The unwrapped vault **data key** is a `Uint8Array` held by `WebVault` for the unlocked
session and zeroed with `memzero` on `lock()`/`logout()`.

## 2. Refresh flow (the part to review hardest)

`HttpCore.call` → on `401` (and not already `/auth/refresh`, and `retryOnUnauthorized`):

1. Calls `refresh()`, which **coalesces**: a single in-flight `/auth/refresh` promise is
   shared by all concurrent callers (`refreshInFlight`). This is load-bearing — refresh
   tokens rotate with **reuse-detection** server-side, so N parallel refreshes would look
   like token theft and revoke the whole family. Tested in `http-core.test.ts`.
2. On success, installs the new access token and **retries the original request once**
   with `retryOnUnauthorized: false` — no infinite 401→refresh→401 loop (tested).
3. On terminal failure, clears the token, fires `onAuthLost` (routes to `/login`), and
   returns `UNAUTHENTICATED`.
4. `refreshInFlight` is reset in a `finally`, so the *next* 401 starts a fresh refresh.

**Review questions to confirm:** (a) can two tabs each hold their own `HttpCore` and race
refreshes? Yes — coalescing is per-instance/per-tab; cross-tab races are bounded by the
server's reuse-detection grace and are acceptable. (b) Is the refresh request itself ever
retried on 401? No — `path !== '/auth/refresh'` guard. (c) Does a network error during
refresh nuke the session? No — it returns `false` without clearing the token, so a
transient blip doesn't force re-login.

## 3. CSRF

The standard CSRF surface is already closed: the access token is **not** a cookie (so a
forged cross-site request carries no auth), and CORS is a strict origin allowlist on the
server. The `csrf` double-submit on `/auth/refresh` is **belt-and-braces** for the one
endpoint that *is* cookie-authenticated (the refresh cookie). The token is generated
client-side if absent (`ensureCsrfToken`) and must match the server's copy if the server
sets one.

## 4. CSP

- **Production**: strict, per-response nonce. `functions/_middleware.ts` mints a fresh
  nonce per request, sets it in the `Content-Security-Policy` header **and** rewrites the
  `%CSP_NONCE%` placeholders in the HTML. No `unsafe-inline`, no `unsafe-eval`,
  `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`. `connect-src` is
  `'self'` + the API origin only.
- **Everything is bundled** (no external `<script>`), so `script-src` needs no third-party
  host and the **SRI surface is empty** (nothing external to pin).
- **Dev**: the strict meta is stripped and a relaxed dev CSP is used (Vite HMR needs
  inline scripts + a WS). This string is dev-only and never ships — see `vite.config.ts`.

**Review questions:** (a) any path that emits inline JS without the nonce? The single
entry `<script>` carries `nonce="%CSP_NONCE%"`; React injects no inline scripts at
runtime. (b) Is the nonce per-response (not per-build)? Yes — minted in the edge function.
(c) Does the meta fallback match the header? Both use the same `%CSP_NONCE%`, replaced
together.

## 5. Offline

Service worker (`public/sw.js`) is **read-only**: it caches only the public app shell and
passes every non-GET and every API/cross-origin request straight to the network — no write
queue, no background sync. Offline mutations are impossible by design (they'd break the E2E
sync model). User plaintext/keys never enter the Cache API; decrypted data lives only in
IndexedDB, which the page reads directly.

## 6. Residual risks / out of scope here

- The full desktop feature tree compiling under the web build is verified on the host
  (`pnpm --filter @cairn/web typecheck` / `build`) — the sandbox can't resolve the
  workspace junctions.
- The local trading-data layer reading from the decrypted IndexedDB cache is the next
  stage; until then those procedures return `NOT_IMPLEMENTED` rather than wrong numbers.
