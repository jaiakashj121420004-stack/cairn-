# ADR-0001: Local-first desktop with optional end-to-end-encrypted cloud sync

- **Status:** Accepted
- **Date:** 2026-06-07
- **Deciders:** Jai Akash
- **Related:** CLAUDE.md §2.4, §2.6, §2.13, §14 #18–#20, §18.0; `docs/roadmap-v2.0.md`; `docs/security.md`, `docs/sync-protocol.md`, `docs/threat-model.md`

> Architecture Decision Records capture a single architecturally-significant decision: the context that forced it, the decision itself, and the consequences we accept. Future ADRs follow this Status / Context / Decision / Consequences format and are numbered sequentially.

## Status

Accepted. This is the foundational architecture decision for v2.0 and supersedes the v1.1 "local-only" framing (which it preserves as the default, not the only, mode).

## Context

Cairn is a discipline-first trading journal. v1.x is a local-only Electron app: the canonical store is a local SQLite database, the app is fully usable offline, and no user data ever leaves the machine. This is core to the product's privacy promise (§2.4) and to trust — the app holds a person's trading psychology and, with subscriptions, payment-adjacent metadata.

v2.0 needs to add value that a purely local app cannot:

- Multi-device access (desktop + web) for the same user.
- A paid tier with a recurring-revenue business model (§2.14, §20).
- Backup/recovery that does not depend on the user manually managing a synced folder.

The tension is non-negotiable: adding a cloud and a server must not weaken the privacy promise. We cannot become "yet another SaaS that can read everything." Several forces shape the decision:

1. **Privacy is the moat, not a feature.** A server that *can* read trades is a liability (subpoena, breach, insider access) even if it never does. The only defensible posture is one where the server is *architecturally incapable* of reading user content.
2. **Offline-forever must survive.** A user with no account, or a cancelled subscription, must keep a fully functional app and all their data locally (§14 #18, #28).
3. **Extensibility without rework (§2.6).** The transport, data model, and type layer must accommodate sync and a web client without ripping up the desktop app.
4. **Correctness is sacred (§2.5).** Sync introduces concurrent edits across devices; conflicts must resolve deterministically, never silently lose data.

## Decision

Adopt a **local-first architecture with optional end-to-end-encrypted (E2E) cloud sync**.

1. **Local SQLite remains canonical on every desktop install.** The cloud is a sync target, not the source of truth. The app works fully offline, with or without an account, forever.

2. **The vault model.** Each user has a *vault* containing all trades, accounts, and settings. The vault is encrypted on the client with a random **data key**. The data key is wrapped by a **key-encryption key (KEK)** derived from the user's password via **Argon2id**. The KEK never leaves the client. The server stores only the wrapped data key and opaque ciphertext blobs — it can authenticate a user but cannot decrypt their content. There is no admin override and no backdoor (§14 #19).

3. **Free vs paid.** Free users have no vault on the server at all — only an (optional) account record. Sync is a paid feature: the desktop pushes ciphertext deltas; the web app pulls and decrypts **in-browser**. Plaintext never traverses the network.

4. **Transport abstraction (§3.6).** Renderer code depends only on a `Transport` interface. `ElectronTransport` forwards over typed IPC; `HttpTransport` forwards over `fetch`. Adding a surface later is a new implementation, not a rewrite.

5. **Shared types and validation (§3.5, §19.2).** One Zod schema per boundary lives in `packages/shared-zod/`; client and server validate against the same definition. The universal `Result<T>` contract (§3.7) spans IPC and HTTP.

6. **Sync correctness.** Conflict resolution is deterministic and documented in `docs/sync-protocol.md` (vector clocks / op-log; statement-vs-live and cross-device rules are spelled out there). No silent data loss.

7. **Cancellation is non-destructive.** Cancelling a subscription stops sync but never deletes local data (§14 #28).

The full crypto parameters live in `docs/security.md`; the per-component threat model lives in `docs/threat-model.md`.

## Consequences

**Positive**

- The privacy promise is structural, not procedural: a server breach exposes ciphertext, not trades.
- The desktop app keeps working offline and after cancellation — no lock-in, no hostage data.
- The `Transport` + shared-types design lets the same React UI serve desktop and web, and leaves room for future surfaces (CLI, mobile) without core rework.
- A clean basis for the subscription business: sync is the headline paid capability.

**Negative / costs we accept**

- **No server-side features on plaintext.** No server-side search, analytics, or "email me a report of my trades" — the server cannot read content. Any such feature must run client-side.
- **Key management burden.** Losing the password (and the recovery phrase) means losing access to synced ciphertext. This forces a recovery-phrase flow and careful UX (`docs/sync-protocol.md`, `docs/security.md`).
- **Sync is genuinely hard.** Vector clocks, op-logs, conflict resolution, and device enrollment are real engineering with real test burden (§19.10 requires property-based tests on the sync engine).
- **Crypto in two runtimes.** Client crypto must work in both Electron (Node) and the browser; KEK derivation (Argon2id) is intentionally expensive and must be tuned per surface.
- **cTrader is the one disclosed exception** to "data never transits a third party" (live broker events transit Spotware); it is disclosed in Settings and carries no vault content (§14 #38).

**Neutral**

- The repo becomes a pnpm workspace monorepo (`apps/desktop`, `apps/web`, `apps/server`, `packages/*`) to share types and schemas (§3.3).
- Postgres (managed) becomes the server store for ciphertext + account/subscription state; Drizzle is the shared ORM with the client.
