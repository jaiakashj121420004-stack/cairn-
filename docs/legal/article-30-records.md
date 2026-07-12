# Cairn — Records of Processing Activities (GDPR Article 30)

> **DRAFT — internal record.** Not published to users; kept to satisfy GDPR Art. 30
> (launch-checklist #6). Review with counsel. References `docs/runbook.md` §4–§5 for the
> export/deletion procedures.

**Controller:** [LEGAL ENTITY / Jai Akash], [ADDRESS], support@cairn.app · **Last updated:** [DATE]
**DPO / contact for data matters:** [name/email or "not required — see assessment"]

## 1. Processing activities

| # | Activity | Categories of data subjects | Categories of personal data | Purpose | Legal basis |
|---|---|---|---|---|---|
| 1 | Account management | Registered users | Email, hashed password | Provide account, authenticate | Contract |
| 2 | Cloud sync | Paid users | Encrypted vault (ciphertext), wrapped key, device metadata | Multi-device sync | Contract |
| 3 | Billing | Paid users | Name, email, billing/subscription state | Provide + bill the paid plan | Contract |
| 4 | Transactional email | Registered users | Email address | Verify, reset, security notices | Contract |
| 5 | Security & operations logging | All API users | IP, request id, error traces (PII-scrubbed) | Security, abuse prevention, reliability | Legitimate interest |
| 6 | Opt-in telemetry | Users who opt in | Aggregated crash/usage events | Product improvement | Consent |

## 2. Recipients / sub-processors

See `subprocessors.md`. All bound by DPAs.

## 3. International transfers

[List any transfers outside the EEA/UK and the safeguard used — SCCs / adequacy decision.
Determined by chosen hosting/DB/email/payment regions.]

## 4. Retention

- Encrypted vault: while subscription active, then 90 days, then crypto-shredded.
- Account + billing: as required for legal/tax obligations, then deleted.
- Operational logs: [retention period, e.g. 30–90 days].
- Local data: on the user's device only; not controlled by us.

## 5. Technical & organisational security measures

End-to-end encryption of vault content (server cannot decrypt); Argon2id password hashing with
server pepper; TLS-only transport; short-lived JWT access + rotating refresh tokens with reuse
detection; rate limiting; strict CSP/helmet headers; least-privilege access; dependency and
secret scanning in CI. Full detail: `docs/security.md`, `docs/threat-model.md`,
`docs/asvs-checklist.md`.

## 6. Data-subject request handling

Access, export, correction, and deletion requests are handled per `docs/runbook.md` §4–§5.
Because vault content is encrypted with the user's key, an export returns ciphertext unless the
user decrypts it in the app.
