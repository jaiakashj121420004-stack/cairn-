<!-- Extracted from CLAUDE.md (v2.0). Loaded on demand per CLAUDE.md §0/§4 — not part of the always-in-context root. -->

## 15. GLOSSARY

- **ICT** — Inner Circle Trader methodology.
- **SMC** — Smart Money Concepts.
- **BOS** — Break of Structure.
- **CHoCH** — Change of Character.
- **MSS** — Market Structure Shift (synonym of CHoCH in common usage).
- **FVG** — Fair Value Gap.
- **OB** — Order Block.
- **OTE** — Optimal Trade Entry.
- **PD Array** — Premium/Discount Array.
- **SMT** — Smart Money Technique (divergence between correlated pairs).
- **Killzone** — Time window with historically high volume/volatility.
- **Judas Swing** — Initial manipulation move against the eventual true direction.
- **Silver Bullet** — Specific 1-hour killzone within NY or London.
- **DD** — Drawdown.
- **RR** — Risk-to-Reward ratio.
- **R / R-multiple** — Profit or loss expressed as multiple of initial risk.
- **MAE** — Maximum Adverse Excursion.
- **MFE** — Maximum Favorable Excursion.
- **Clean trade** — Trade with zero rules broken and plan followed exactly.
- **Dirty trade** — Trade with any rule broken or plan deviation.
- **DXY** — US Dollar Index.
- **Partial close** — Closing a portion of an open position while leaving the remainder running.
- **Circuit breaker** — Automatic session lock triggered when max daily loss % is hit.
- **Leverage** — Account leverage ratio (e.g. 100:1). Used in lot size calculations.

### v2.0 glossary additions

- **Vault** — A user's full set of synced data (trades, accounts, settings, journals). Stored as ciphertext on the server, decrypted only on the client.
- **Data key** — The symmetric key (XChaCha20-Poly1305) used to encrypt vault records. One per user. Wrapped by the KEK.
- **KEK** — Key-Encryption Key. Derived from the user's password via Argon2id. Wraps the data key. Never leaves the client.
- **Wrapped data key** — The data key encrypted with the KEK. Safe to store on the server because the KEK cannot be derived without the password.
- **Recovery phrase** — A 24-word BIP-39 phrase that can re-derive the KEK if the password is lost. Generated at signup, shown once.
- **Op log** — Append-only list of encrypted record mutations. The unit of sync.
- **Vector clock** — Per-record version vector used to detect concurrent edits and resolve conflicts.
- **Entitlement** — The right to use a paid feature. Granted by an active subscription, revoked on cancellation after grace period.
- **BillingProvider** — Abstraction over Stripe / Razorpay / future providers. The app calls the abstraction; never the SDK directly.
- **Argon2id** — Memory-hard password-hashing function. Used for both server-side password hashes and client-side KEK derivation, with different parameters.
- **Refresh-reuse detection** — Security mechanism: if a refresh token is used twice, every token in that session family is immediately revoked (assume token theft).
- **PITR** — Point-In-Time Recovery. Postgres backup feature; restore to any second in the retention window.
- **ASVS** — OWASP Application Security Verification Standard. Cairn targets Level 2.
- **STRIDE** — Threat-modeling taxonomy: Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege.
- **DPDP** — Digital Personal Data Protection Act (India). GDPR-equivalent for Indian users.

