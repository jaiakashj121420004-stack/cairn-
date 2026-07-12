# Cairn — Privacy Policy

> **DRAFT for review.** This reflects Cairn's actual architecture (CLAUDE.md §2.4, §2.13) but
> is not legal advice. Have a qualified lawyer review it against your jurisdiction before
> publishing. Placeholders in `[brackets]` must be filled at go-live.

**Effective date:** [DATE] · **Operator:** [LEGAL ENTITY / Jai Akash], [ADDRESS] · **Contact:** support@cairn.app

Cairn is a discipline-first trading journal. This policy explains what we do and — more
importantly — what we *cannot* do with your data, because the product is built so that we
never hold the keys to it.

## 1. The short version

- **Local-first.** The desktop app stores all your trades, accounts, and settings in a local
  database on your own computer. You can use Cairn fully offline, with no account, forever.
- **We cannot read your trading data.** If you choose to enable cloud sync (a paid feature),
  your data is **end-to-end encrypted on your device before it leaves it**. Our servers store
  only ciphertext and a wrapped key we cannot unwrap. We are architecturally incapable of
  reading your trades, notes, or account details.
- **No ads, no data sales.** We do not sell, rent, or share your personal data for
  advertising, and there are no ads in the product.
- **Telemetry is off by default.** Crash reporting and analytics are opt-in and default to
  off. If you never opt in, no usage or crash data is sent.

## 2. What we collect, and why

**If you only use the free desktop app (no account):** nothing is sent to us. Your data never
leaves your machine unless *you* copy it (e.g. to a synced folder you control).

**If you create an account (required only for paid cloud sync / the web app), we process:**

| Data | Purpose | Legal basis (GDPR) |
|---|---|---|
| Email address | Account identity, verification, security notices | Contract |
| Password (as an Argon2id hash + server pepper — never the plaintext) | Authentication | Contract |
| Encrypted vault blobs + wrapped data key | To sync your (unreadable-to-us) data between devices | Contract |
| Device metadata (name, platform, last-seen) | Multi-device sync and revocation | Contract |
| Subscription + billing state | To provide and bill the paid plan | Contract |
| Server operational logs (request ids, IPs, error traces — PII-scrubbed) | Security, abuse prevention, reliability | Legitimate interest |

**Payment data** (card numbers etc.) is handled entirely by our payment processor. We never
see or store your full card details.

**Opt-in telemetry (default off):** if you enable it, aggregated crash reports and basic usage
events are sent to help us fix bugs. You can turn it off at any time in Settings.

## 3. What we can never access

Your **vault content** (trades, journal entries, account details) is encrypted client-side.
The key is derived from your password via Argon2id and never leaves your device unencrypted.
On our servers we hold only ciphertext and a key wrapped under a key we do not have. There is
no admin override and no backdoor. If you lose your password and your recovery phrase, we
cannot recover your synced data — by design.

## 4. Who we share data with

Only the sub-processors strictly needed to run the service (hosting, database, email, payment,
error tracking). The current list is in `subprocessors.md` and is kept up to date. Each is
bound by a data-processing agreement. We do not share your data with anyone else.

## 5. Retention

- Local data: stays on your device until you delete it. Cancelling a subscription never
  deletes your local data.
- Synced (encrypted) vault: retained while your subscription is active; after cancellation it
  is kept for **90 days** then crypto-shredded (we delete the wrapped key, making the
  ciphertext permanently undecryptable).
- Account + billing records: retained as required for legal/tax obligations, then deleted.

## 6. Your rights

Depending on your jurisdiction (GDPR / UK GDPR / India DPDP / CCPA and others) you may request
access to, correction of, export of, or deletion of your personal data. Email
support@cairn.app. Our export and deletion procedures are documented in `docs/runbook.md`
(§4–§5). Because your vault is encrypted with your key, a data export of the vault returns
ciphertext unless you decrypt it in the app.

## 7. Security

Passwords are hashed with Argon2id plus a server-side pepper. Transport is HTTPS/TLS only.
Sessions use short-lived access tokens and rotating refresh tokens with reuse detection. See
our security posture in `docs/security.md` and threat model in `docs/threat-model.md`.

## 8. Children

Cairn is not directed to anyone under 18 and we do not knowingly collect their data.

## 9. Changes

We'll post changes here and update the effective date. Material changes affecting account
holders will be emailed.

## 10. Contact

Questions or requests: **support@cairn.app**.
