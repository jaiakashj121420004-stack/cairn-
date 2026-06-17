<!-- v2.0 NEW — created in Stage 7 (Production Hardening & Launch).
     Source of truth for incident response (paging policy, severity scale, P1/P2/P3
     examples), the rollback procedure, KEK rotation, and the GDPR/DPDP data-export and
     data-deletion procedures. Referenced by CLAUDE.md §4 docs map and §16.b #47.
     The backup-restore drill this doc describes is automated by
     .github/workflows/backup-verify.yml. The crypto design behind KEK rotation and
     vault encryption lives in docs/security.md; the threat model lives in
     docs/threat-model.md. -->

# Cairn Runbook — Incidents, Rollback, Key Rotation, Data Rights

## 0. Who this is for

Cairn is operated by a single person — Jai Akash — through the soft-launch period
(CLAUDE.md §18.9). This runbook is written for that reality: there is no on-call
rotation, no NOC, no second responder. Its job is to make sure that when something
breaks, or a user exercises a data-rights request, the steps are written down well
enough that 2am-Akash (or, eventually, a second engineer) doesn't have to reconstruct
them from memory.

---

## 1. Paging policy

**There is no paging service (PagerDuty, Opsgenie, etc.) while Cairn is solo-operated.**
Adding one before there's a second responder would just be noise. Instead:

- **Sentry** (server: always-on; desktop: opt-in, CLAUDE.md §2.13) is configured to
  email Akash directly on new issues and regression alerts.
- **GitHub Actions** failures (CI, `security.yml`, `backup-verify.yml`) email the
  repository owner by default — no extra config needed.
- The Grafana dashboards in `ops/dashboards/` (`api-health.json`, `auth-funnel.json`,
  `sync-throughput.json`, `webhook-lag.json`, `billing-state.json`) are checked
  manually, not alerted on, until Grafana alerting is wired up post-launch.

This is intentionally lightweight. **When a second responder joins, the first task is
to replace "email Akash" with a real paging rotation** — the severity scale below is
written so that swap is just a routing change, not a rewrite.

### Severity scale

| Severity | Definition | Response target | Examples |
|---|---|---|---|
| **P1 — Critical** | User data at risk, or the service is down for all users. | Drop everything; respond immediately, any time of day. | API is down (health check failing); a vault-push/pull endpoint is silently corrupting or losing ciphertext; a security incident (credential leak, unauthorized data access); billing webhook signature verification is failing open. |
| **P2 — High** | A core feature is broken or degraded for a meaningful subset of users, but the service is otherwise up and no data is at risk. | Respond same business day. | Email delivery (verification / password reset) is failing; sync push/pull is returning errors for some users but not corrupting data; a billing webhook is failing closed (so legitimate upgrades/cancellations aren't applied) — annoying but reversible once fixed; `backup-verify.yml` fails (backup may not be restorable — investigate before it's needed for real). |
| **P3 — Low** | Cosmetic, low-impact, or affects a small number of users with a workaround. | Respond within a few days, batched with normal work. | A Grafana dashboard panel shows wrong units; a non-blocking rule-engine warning has the wrong copy; `dep-audit`/`trivy` flags a low/medium advisory with no exploit path; an analytics chart is slow to load. |

A P1 that turns out to be smaller in scope than first thought can be downgraded once
the blast radius is understood — don't hold a P2 fix to P1 process once the bleeding
has stopped.

---

## 2. Rollback procedure

Cairn ships two independently-deployable units: the **API** (`apps/server`, containerized,
deployed to Fly.io/Railway/Render per CLAUDE.md §3.1b) and the **desktop app**
(electron-builder installers, distributed via GitHub Releases / auto-update). This
procedure covers the API; desktop rollback is "stop shipping the new version" — see
§2.3.

### 2.1 Code rollback (no schema change involved)

1. Identify the last known-good deploy (commit SHA / image tag) from the deploy
   history.
2. Re-deploy that image/commit through the normal deploy path (revert the merge or
   redeploy the previous image tag — whichever the hosting provider supports without a
   force-push to `main`).
3. Confirm `api-health.json` shows the error rate returning to baseline and
   `GET /health` (or equivalent) is green.
4. Open a follow-up issue for the root cause; do not re-deploy the bad commit until
   it's fixed and has a regression test.

### 2.2 Migration rollback

Cairn's migrations (`apps/server/drizzle/*.sql`, applied by
`apps/server/src/db/migrate.ts`) are **forward-only and idempotent** (CLAUDE.md §19.6) —
there are no generated "down" migrations. If a migration shipped with a bad deploy:

1. **Roll back the application code first** (§2.1). Most "bad migration" incidents are
   actually "new code assumes a column/table the rollback target doesn't have" — rolling
   back code alone can re-break things if the migration already ran.
2. If the migration itself is destructive (dropped/renamed a column the old code
   needs), write a new **forward** migration that restores the needed shape (e.g.
   re-add the column, backfill from any retained data). Never edit or delete a
   committed migration file that has run anywhere — `schema_migration` has already
   recorded it (§19.6), and editing it desyncs environments.
3. Apply the new forward migration the normal way: `pnpm --filter @cairn/server run
   migrate` against the target database (this is also what CI's
   `backup-verify.yml` exercises against a restored snapshot, so a broken forward
   migration is caught there too).
4. If data was lost before the fix could land, restore the affected rows from the most
   recent PITR snapshot (the same snapshot `backup-verify.yml` validates daily) using
   the provider's point-in-time restore into a scratch database, then selectively copy
   the affected rows back — never restore-in-place over the live database without a
   second, fresher backup of the *current* (post-incident) state first.

### 2.3 Desktop rollback

The desktop app auto-updates via electron-builder. To "roll back" a bad release:

1. Stop the bad version's auto-update feed from being served (remove/replace the
   latest release artifact the updater points at, or publish a new release with a
   higher version number containing the previous good build — auto-updaters generally
   only move forward).
2. Because the desktop app is local-first (CLAUDE.md §2.4), a bad release does not put
   server-side data at risk by itself — the priority is stopping further installs/
   updates, not data recovery, unless the bad release also shipped a destructive local
   migration (in which case treat it like §2.2: ship a forward migration that repairs
   the local schema, since `apps/desktop/electron/db/migrations` follows the same
   forward-only idempotent rule).

---

## 3. KEK rotation procedure

Full cryptographic design: `docs/security.md` §8. This section is the operational
checklist.

**Important:** the server **never** has the KEK or the unwrapped data key (CLAUDE.md
§2.4, §2.13) — KEK rotation is a **client-driven** operation. Ops/Akash cannot rotate a
user's KEK on their behalf; the runbook role here is supporting the user and verifying
the result.

### 3.1 Routine rotation: user changes their password

This is the normal path and requires no ops involvement:

1. Client unwraps the data key (DK) with the old password-derived KEK.
2. Client derives a new KEK from the new password + a fresh 16-byte salt (Argon2id,
   `docs/security.md` §3.1).
3. Client re-wraps the same DK under the new KEK and pushes the new wrapped key + salt
   to `PUT /vault/key` (`vault_meta.wrapped_data_key`, `vault_meta.kdf_salt`).
4. Other devices pick up the new wrapped key on next sync and unwrap with the new
   password. The DK — and therefore every record's ciphertext — is unchanged.

**Ops check (only if the user reports a problem):** confirm `vault_meta.kdf_salt` and
`vault_meta.wrapped_data_key` were updated (`updated_at` advanced) for that
`user_id`. If a second device still prompts for the *old* password after a sync, it
hasn't pulled the new `vault_meta` yet — have the user trigger a manual sync.

### 3.2 Recovery-phrase rotation

Same shape as §3.1 but for `vault_meta.recovery_wrapped_data_key`: the client
generates a new 24-word phrase, re-wraps the same DK under the new phrase-derived KEK,
shows the new phrase to the user **once**, and pushes the new wrapped key. The old
phrase stops working the moment the new wrapped key is stored.

### 3.3 Suspected KEK/device compromise (lost or stolen device)

If a user reports a lost/stolen device that had the vault unlocked:

1. **Revoke the device**: set `device.revoked_at = now()` for that `device_id`
   (`PATCH /devices/:id` or direct admin action). A revoked device can no longer
   push/pull vault ops (CLAUDE.md §18.5/§18.6) — this stops further sync from that
   device immediately, even though the server still can't read what it already
   downloaded.
2. **Recommend a password change** (§3.1) — this rotates the KEK and the wrapped key
   on the server, so a copy of `vault_meta` taken from the stolen device's local cache
   becomes useless once it can't unwrap the *current* wrapped key... but note the data
   key (DK) itself is unchanged by a password rotation (that's the point of envelope
   encryption — §3.1 step 4). **A password change alone does not protect data already
   decrypted on the stolen device**, only future server-stored wrapped-key material.
3. If the threat model requires invalidating the DK itself (e.g. the device's
   *unwrapped* DK was exfiltrated, not just the device), the only remediation is a
   **full re-encryption**: client generates a brand-new DK, re-encrypts every local
   record under it, re-wraps the new DK under a (new) password and recovery-phrase
   KEK, and pushes a full resync. This is the "nuclear option" — there is no
   server-side shortcut, by design (the server never had the DK to begin with).
4. Log the incident in the audit trail (`audit_log`, `severity = 'critical'`) with the
   `user_id` and a description — not the key material.

---

## 4. GDPR / DPDP data-export procedure (Article 15 / right to access)

Cairn does not yet have a self-service "Export my data" button. Until it does, exports
are handled manually by Akash via a script, on request:

1. **Verify the request.** Confirm the request comes from the email on file for the
   account (reply-to the verified email address, or require the user to be logged in
   if the request comes through an in-app channel). Log the request (who, when, via
   what channel) — this is itself part of the Article 30 record.
2. **Run the export script** (`apps/server/scripts/export-user-data.ts` —
   create this script when the first real request arrives; it does not need to exist
   speculatively before then). It must collect, for the requesting `user_id`:
   - `users` row (email, emailVerified, createdAt — no password hash, see step 3).
   - `subscriptions` row (plan/entitlement/billing history fields — no raw provider
     tokens).
   - `devices` rows (name, platform, registered/last-seen/revoked timestamps).
   - `audit_log` rows for that user.
   - **Vault content**: the raw `vault_op` ciphertexts for that `user_id`. The server
     cannot decrypt these (CLAUDE.md §2.4) — include them as opaque ciphertext blobs
     plus the `vault_meta` wrapped-key material, with a clear note that **the user's
     own password or recovery phrase is required to read this data**; Cairn cannot
     decrypt it for them. (If the user wants their trade journal in a *readable*
     format, the better path is: they export it themselves from the desktop app, which
     already has the unwrapped vault — point them there first.)
3. **Never export:** `userCredentials` (password hashes), `userSessions` (refresh
   token material), `emailTokens`, provider API tokens/secrets. These are operational
   security material, not "data about the user" in the Article 15 sense, and exporting
   them would itself be a security incident.
4. **Package and deliver.** The script writes one JSON file per table (or a single
   manifest JSON) into a temporary directory, which Akash zips and sends to the
   user's verified email as a password-protected ZIP (share the password via a
   different channel — e.g. read it to them, or a follow-up email — not in the same
   message as the attachment).
5. **Clean up.** Delete the temporary export directory and the ZIP from local storage
   once delivered. Record completion (date, what was included) in the request log from
   step 1. GDPR/DPDP timelines: respond within 30 days (DPDPA: "as soon as
   reasonably practicable"; GDPR: one month, extendable to three for complex
   requests) — for a single-user manual export this should take under an hour, so
   there's no realistic scenario where the timeline is the bottleneck.

---

## 5. Data-deletion procedure (Article 17 / right to erasure)

Cairn has **two** deletion paths: the automatic one that already runs on cancellation
(`docs/billing.md` §7), and a manual one for an explicit "delete my account" request.

### 5.1 Automatic: subscription cancellation (already implemented)

Per `docs/billing.md` §7: cancelling a subscription **never deletes local data**
(CLAUDE.md §14 #28) — the desktop SQLite database is untouched. On the server side:

- The (still-encrypted, unreadable) vault is retained for **90 days** after
  cancellation, covering accidental cancel/resubscribe.
- After 90 days, the vault is **crypto-shredded**: the wrapped data key
  (`vault_meta.wrapped_data_key` and `vault_meta.recovery_wrapped_data_key`) is
  deleted. The `vault_op` ciphertext rows may be deleted in the same pass or left as
  permanently-undecryptable garbage and reaped later — either is acceptable since
  crypto-shredding already makes them unrecoverable, but deleting them is preferred to
  avoid carrying dead weight in the database.
- This is intended to run as a scheduled job (e.g. daily) querying
  `subscriptions` for rows with `status = 'canceled'` and `updated_at` (cancellation
  time) older than 90 days, that still have non-null `vault_meta.wrapped_data_key`.
  **This job does not exist yet as of Stage 7** — implementing it is tracked
  separately; this runbook documents the *intended* behavior so the manual procedure
  in §5.2 can fall back to it correctly once it exists.

### 5.2 Manual: "delete my account" request

For a user who explicitly requests full account deletion (independent of, or in
addition to, cancelling a subscription):

1. **Verify the request** the same way as §4 step 1, and log it.
2. **Crypto-shred the vault immediately** (don't wait 90 days): set
   `vault_meta.wrapped_data_key = NULL` and
   `vault_meta.recovery_wrapped_data_key = NULL` for the user's `user_id`. From this
   moment, the `vault_op` ciphertext is permanently unrecoverable even with the
   correct password/phrase.
3. **Revoke all devices**: set `revoked_at = now()` for every `device` row belonging
   to the user, so no device can push/pull further vault ops.
4. **Delete the account record and dependents.** `users.id` is referenced by
   `userCredentials`, `userSessions`, `emailTokens`, `auditLog`, `subscriptions`,
   `devices`, and `vaultOps` — all `ON DELETE CASCADE` (see `apps/server/src/db/schema.ts`).
   Deleting the `users` row cascades to all of these, including the now-undecryptable
   `vault_op` rows. A single `DELETE FROM users WHERE id = $1` is therefore sufficient
   for the server side once step 2 has crypto-shredded the vault (do step 2 first and
   separately anyway, so an aborted/partial deletion still leaves the vault
   unrecoverable).
5. **Local data is the user's own** (CLAUDE.md §2.4) — the server has no way to (and
   must not attempt to) delete data on the user's device. The desktop app remains
   fully usable offline with their existing local SQLite database; if they want that
   gone too, they delete it themselves (the app's data directory, shown in Settings).
6. **Confirm to the user** that the server-side account and vault have been deleted,
   and that their local data is unaffected unless they remove it themselves. Record
   completion in the request log. Same 30-day timeline as §4 applies; same
   "should take minutes, not days" reality for a manual single-user deletion.

---

## 6. Backup-restore drill

Automated by `.github/workflows/backup-verify.yml` (daily, 06:00 UTC):

1. Dumps the configured PITR snapshot (`secrets.BACKUP_VERIFY_DATABASE_URL` — a
   point-in-time restore of production, refreshed daily by the Neon/Supabase provider
   process) into a fresh `postgres:16` scratch container.
2. Runs `pnpm --filter @cairn/server run migrate` against the scratch database — proves
   the snapshot's schema is forward-compatible with the migrations the app currently
   ships.
3. Asserts `SELECT count(*) FROM users` (configurable via the `BACKUP_VERIFY_TABLE`
   repo variable) is non-zero — proves the restore contains real data, not an empty
   shell.

**Until `secrets.BACKUP_VERIFY_DATABASE_URL` is configured**, the workflow skips with a
loud `::warning::` rather than passing silently. **CLAUDE.md §16.b #47 ("backup
restored + migrations replayed, three consecutive days") is met once this workflow has
run green for three consecutive scheduled runs** after the secret is configured against
a real production database with PITR enabled.

If the drill fails (P2 — see §1): do not panic-restore production. The drill failing
means *the verification path* is broken (snapshot stale, migration incompatible,
restore target empty) — investigate which of the three steps failed, fix it, and
re-run via `workflow_dispatch` before the next scheduled run.

---

## 7. Code signing, notarization & release pipeline

`.github/workflows/release.yml` builds, signs, and notarizes the desktop app for
Windows, macOS and Linux on every `v*.*.*` tag, and uploads the artifacts to a draft
GitHub Release. The wiring is in place and **inert** until the secrets below are
configured — until then the workflow produces unsigned artifacts (a warning, not a
failure), which is fine for internal testing but must not be the public release build.

### 7.1 Windows EV certificate procurement (Akash's offline task)

Since June 2023 the CA/Browser Forum requires EV code-signing private keys to live on
FIPS-140-2 hardware — a `.pfx` file is no longer issued for EV certs, so
`CSC_LINK`/`CSC_KEY_PASSWORD` (file-based signing) does not apply to Cairn's EV cert.
Procurement steps:

1. **Buy an EV code-signing certificate** from a CA that offers a cloud-HSM signing
   path compatible with `signtool` — recommended: **SSL.com eSigner** (cheapest,
   has an official GitHub Action) or **Azure Trusted Signing** (Microsoft's newer,
   cheaper-still option; requires an Azure subscription and a verified business).
   DigiCert KeyLocker is a third option if Cairn already has a DigiCert relationship.
2. **Complete EV identity validation.** This is the slow part (1–5 business days): the
   CA verifies the legal business entity behind "Jai Akash" / Cairn (business
   registration documents, a callback to a verified phone number, etc.). Start this
   well before a planned launch date.
3. **Provision CI credentials** for the chosen provider and add them as GitHub Actions
   secrets (see §7.4). For SSL.com eSigner: `ES_USERNAME`, `ES_PASSWORD`,
   `ES_CREDENTIAL_ID`, `ES_TOTP_SECRET`. For Azure Trusted Signing:
   `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`,
   `AZURE_TRUSTED_SIGNING_ACCOUNT`, `AZURE_CERT_PROFILE_NAME`.
4. **Wire the chosen provider into `release.yml`**: the Windows job has a placeholder
   step (commented, named per-provider) that installs the cert into the Windows
   certificate store (eSignerCKA) or invokes the signing CLI (Azure Trusted Signing
   CLI / `AzureSignTool`) before `electron-builder` runs. Once installed, pass
   `--config.win.signtoolOptions.certificateSubjectName="<cert subject>"` (or
   `certificateSha1`) to `pnpm dist` so electron-builder's built-in `signtool` wrapper
   picks it up — `apps/desktop/electron-builder.yml` already sets `publisherName` and
   the RFC 3161 timestamp server (§ electron-builder.yml `win.signtoolOptions`).
5. Uncomment the relevant step once credentials exist; leave the other provider's step
   commented as a documented alternative.

### 7.2 macOS notarization

Requires an active Apple Developer Program membership ($99/yr):

1. Generate an **app-specific password** for notarization at
   <https://appleid.apple.com> (Sign-In and Security → App-Specific Passwords) — do
   not use the main Apple ID password.
2. Find the **Team ID** in the Apple Developer portal (Membership page).
3. Add `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` as GitHub secrets
   (§7.4), plus `CSC_LINK`/`CSC_KEY_PASSWORD` for the **Developer ID Application**
   signing certificate (a regular `.p12`/`.pfx` export — not subject to the EV
   hardware requirement above, since this is code-signing-for-Gatekeeper, not EV).
4. With those four/five secrets present, `electron-builder` (v24+) signs with the
   Developer ID identity and notarizes via `@electron/notarize` automatically — no
   extra workflow step. `apps/desktop/electron-builder.yml` already sets
   `mac.hardenedRuntime: true`, `mac.gatekeeperAssess: false`, and points
   `entitlements`/`entitlementsInherit` at `build/entitlements.mac.plist` (required for
   the hardened runtime to allow Electron's JIT and the prebuilt native modules —
   `better-sqlite3`, `keytar`).

### 7.3 Linux

No signing required — AppImage has no code-signing convention. The Electron sandbox
warning inside AppImage's read-only mount is handled in `electron/main.ts` (sandbox
disabled only when `process.env.APPIMAGE` is set, i.e. only for the AppImage build),
not in the release pipeline.

### 7.4 Required GitHub secrets (repo Settings → Secrets and variables → Actions)

| Secret | Used for | Required for |
|---|---|---|
| `CSC_LINK`, `CSC_KEY_PASSWORD` | macOS Developer ID `.p12` (base64) + password | macOS signing/notarization |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | Apple notarization | macOS notarization |
| `ES_USERNAME`, `ES_PASSWORD`, `ES_CREDENTIAL_ID`, `ES_TOTP_SECRET` | SSL.com eSigner (Windows EV) | Windows signing (option A) |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TRUSTED_SIGNING_ACCOUNT`, `AZURE_CERT_PROFILE_NAME` | Azure Trusted Signing (Windows EV) | Windows signing (option B) |
| `GITHUB_TOKEN` | Draft-release publish | always (provided automatically by Actions) |

Each signing job degrades gracefully if its secrets are absent (electron-builder
builds an unsigned artifact and logs a warning) — adding a secret later requires no
code change, only setting the secret and re-running the workflow on a tag.

### 7.5 Cutting a release

1. Bump `version` in `apps/desktop/package.json` (and the workspace root if released
   in lockstep) and commit.
2. `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. `release.yml` runs the full build/sign/notarize matrix and creates a **draft**
   GitHub Release with all platform artifacts plus a `checksums.txt` (SHA-256).
4. Review the draft release (download + smoke-test at least the Windows installer),
   write release notes, then publish it manually from the GitHub UI. Publishing is
   intentionally manual — the workflow never auto-publishes.
