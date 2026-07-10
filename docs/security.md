<!-- v2.0 NEW — created in Stage 18.4 (sync-ready local data model / crypto capability).
     Source of truth for crypto primitives, KDF parameters, key-wrapping, recovery
     phrase, OS-keychain usage, and KEK rotation. Referenced by CLAUDE.md §2.4, §2.13,
     §3.1a (Crypto/OS-keychain rows), and §18.4. The full STRIDE threat model lives in
     docs/threat-model.md (Stage 18.9); this file holds the cryptographic design. -->

# Cairn Security — Cryptographic Design

## Status

| Area | State as of Stage 18.4 |
|---|---|
| Crypto primitives library (`apps/desktop/electron/services/crypto/`) | **Implemented + tested** (this stage) |
| Crypto types (`packages/shared-types/src/crypto.ts`) | **Implemented** (this stage) |
| OS keychain wrapper (`apps/desktop/electron/services/keychain.ts`) | **Implemented** (this stage) |
| Record encryption of real rows | **NOT performed yet.** Stage 18.4 ships only the *capability*. Existing local SQLite data stays plaintext on the user's machine until the sync engine (Stage 18.6) opts rows in. |
| Server-side ciphertext storage | Stage 18.5 (backend) |
| Device enrollment / data-key unwrap on login | Stage 18.6 (sync engine) |
| Full STRIDE threat model (`docs/threat-model.md`) | Stage 18.9 |

This document describes the design as built in Stage 18.4 and the forward plan for
rotation and recovery. All parameters below are the **actual constants compiled into
the code**, not placeholders.

---

## 1. Threat model summary

The full STRIDE-per-component model is `docs/threat-model.md` (Stage 18.9). The
cryptographic design defends against this short list, which is the part Stage 18.4
locks in:

| Attacker | Capability | Defended by |
|---|---|---|
| **Curious / compromised server admin** | Reads the entire Postgres database and all backups. | Server stores only ciphertext + the *wrapped* data key. The key-encryption key (KEK) is derived client-side from the user's password and **never leaves the device**. The server is architecturally incapable of decrypting (CLAUDE.md §2.4, §2.13). |
| **Network attacker (TLS-stripping / MITM)** | Observes or tampers with traffic. | All payloads are AEAD ciphertext before they hit the wire; TLS is defence-in-depth, not the only layer. Tampering is caught by the Poly1305 tag on decrypt. |
| **Thief with the user's laptop, app locked** | Has the SQLite file and (until lock) possibly the OS keychain. | The cached data key is cleared from the keychain on lock (§6). The vault ciphertext alone is useless without the KEK, which requires the password. |
| **User who forgets their password** | Locked out of their own vault. | 24-word BIP-39 recovery phrase wraps an independent copy of the data key (§5). Losing **both** password and phrase is unrecoverable by design — there is no server-side escrow and no backdoor (locked decision §14 #19). |
| **Replay / row-substitution attacker** | Swaps one encrypted row's ciphertext for another's. | Each record is encrypted with its `table:id` as AEAD associated data (§4.4); a ciphertext decrypted against the wrong row's AD fails the tag check. |

Non-goals for the crypto layer: it does not defend against malware running with the
user's privileges while the app is unlocked, nor against a coerced password. Those are
out of scope per the threat model's attacker classes.

---

## 2. Crypto primitives

All primitives come from **libsodium** via `libsodium-wrappers` (ISC-licensed,
constant-time, audited, ships its own test vectors). We deliberately chose libsodium
over `@stablelib` because libsodium is far more widely reviewed and battle-tested.

| Purpose | Primitive | libsodium function |
|---|---|---|
| Password / phrase → key (KDF) | **Argon2id** v1.3 (`0x13`) | `crypto_pwhash` with `crypto_pwhash_ALG_ARGON2ID13` |
| Data-key wrapping (AEAD) | **XChaCha20-Poly1305-IETF** | `crypto_aead_xchacha20poly1305_ietf_encrypt` / `_decrypt` |
| Record encryption (AEAD) | **XChaCha20-Poly1305-IETF** | same as above |
| CSPRNG (salts, nonces, data key) | libsodium CSPRNG | `randombytes_buf` |
| Recovery phrase encoding | **BIP-39** English wordlist | `@scure/bip39` (MIT) |

Fixed sizes (all asserted at runtime, taken from libsodium constants, not hardcoded
magic numbers):

| Quantity | Bytes | libsodium constant |
|---|---|---|
| Data key | 32 | `crypto_aead_xchacha20poly1305_ietf_KEYBYTES` |
| KEK | 32 | (Argon2id output length) |
| AEAD nonce | 24 | `crypto_aead_xchacha20poly1305_ietf_NPUBBYTES` |
| AEAD auth tag | 16 | `crypto_aead_xchacha20poly1305_ietf_ABYTES` |
| Argon2id salt | 16 | `crypto_pwhash_SALTBYTES` |

**Why XChaCha20 and not ChaCha20-IETF:** the 24-byte (192-bit) nonce makes random
nonce generation collision-safe without a counter or per-key nonce bookkeeping. With a
12-byte IETF nonce, randomly generating nonces risks a birthday collision after ~2³² messages
under one key; with 24 bytes the margin is ~2⁹⁶. Every encrypt call generates a fresh
random nonce — there is no nonce counter to get wrong.

**Combined mode:** ciphertext and tag are stored together (`ciphertext || tag`, the tag
is the trailing 16 bytes) exactly as libsodium's combined-mode API returns them.

---

## 3. KDF parameters (Argon2id) and rationale

Two **distinct** Argon2id configurations exist so that the password path and the
recovery-phrase path are cryptographically domain-separated — the same input under one
config can never produce the other config's key.

### 3.1 Password → KEK (interactive)

| Parameter | Value | Source |
|---|---|---|
| Algorithm | Argon2id v1.3 | `crypto_pwhash_ALG_ARGON2ID13` |
| opslimit (time cost) | **3** | per §18.4 prompt |
| memlimit | **67 108 864 bytes (64 MiB)** | `crypto_pwhash_MEMLIMIT_INTERACTIVE` |
| parallelism | 1 (fixed by libsodium's `crypto_pwhash`) | — |
| salt | 16 random bytes, **unique per vault**, stored in `vault_meta` | `randombytes_buf(16)` |
| output | 32 bytes | KEK length |

**Rationale.** `INTERACTIVE` (64 MiB, ops 3) is tuned for a login-time derivation on
commodity hardware: it completes in well under a second on a modern laptop while forcing
an attacker to spend 64 MiB × 3 passes *per guess*, which crushes GPU/ASIC throughput.
We did not pick `MODERATE`/`SENSITIVE` (256 MiB / 1 GiB) because the KEK is derived
interactively on every unlock and on low-end machines the higher memlimits add seconds of
latency for marginal benefit given a strong password policy. The salt is unique per
vault, so two users with the same password get different KEKs and precomputation is
useless.

> **Why we don't pin an Argon2id RFC 9106 known-answer vector in tests:** RFC 9106's
> reference test vector uses parallelism `p = 4` and explicit secret-key + associated-data
> inputs. libsodium's `crypto_pwhash` fixes `p = 1` and exposes neither the secret nor the
> AD parameter, so the RFC vector *cannot* reproduce against this API by construction.
> libsodium's Argon2id is validated against the reference implementation upstream; we pin
> our wrapper's behaviour with determinism + sensitivity property tests (same input ⇒ same
> key; any changed input ⇒ different key) instead of a non-reproducible KAT. The AEAD layer
> *does* carry a real known-answer vector (§7).

### 3.2 Recovery phrase → KEK (separate config)

| Parameter | Value |
|---|---|
| Algorithm | Argon2id v1.3 |
| opslimit (time cost) | **4** (deliberately ≠ the password config) |
| memlimit | 67 108 864 bytes (64 MiB) |
| salt | **fixed 16-byte domain-separation constant** (`RECOVERY_KDF_SALT`), not per-vault |
| output | 32 bytes |

**Rationale.** The recovery phrase already carries 256 bits of CSPRNG entropy (§5), so
brute-forcing it is infeasible regardless of stretching — a per-vault random salt buys
nothing and would itself have to be stored and recovered. The KDF here exists to (a) map
the phrase into a uniformly-distributed 32-byte KEK and (b) be a *different* derivation
than the password path. Domain separation is guaranteed by the distinct fixed salt **and**
the distinct opslimit, so `deriveKEK(x)` and `keyFromRecoveryPhrase(x)` are independent
even if some input were fed to both. The fixed salt is a compile-time constant in the
source, not a secret.

---

## 4. Data-key wrap / unwrap and record encryption

### 4.1 Why a wrapped data key (envelope encryption)

The vault is encrypted under a random 32-byte **data key (DK)**, never directly under a
password-derived key. The DK is then *wrapped* (encrypted) under the KEK. This buys:

- **Password change without re-encrypting the vault.** Rotating the password re-derives a
  new KEK and re-wraps the same DK — the vault ciphertext is untouched (§8).
- **Multiple independent unlock paths.** The same DK is wrapped once under the
  password-KEK and once under the recovery-phrase-KEK. Either unwraps it.

### 4.2 `wrapDataKey(dataKey, kek) → WrappedKey`

XChaCha20-Poly1305-IETF encrypt of the 32-byte DK under the KEK with a fresh random
24-byte nonce. Returns `{ ciphertext, nonce, algorithm }`. The wrapped key (ciphertext +
nonce) is what the server stores; it reveals nothing without the KEK.

### 4.3 `unwrapDataKey(wrapped, kek) → Uint8Array`

AEAD decrypt. A Poly1305 tag mismatch — the case when the KEK is wrong (wrong password) —
throws a typed `CryptoError` with code **`WRONG_KEY`**. There is no "maybe it worked"
path: either the tag verifies and you get the exact 32 bytes, or it refuses.

### 4.4 `encryptRecord` / `decryptRecord` and associated data

Records are encrypted under the **DK** (not the KEK) with a fresh nonce each call.
`encryptRecord(plaintext, dataKey, ad?)` accepts optional **associated data (AD)**. The
sync layer passes `table:id` (e.g. `"trade:0192f...":` UTF-8 bytes) as AD so a ciphertext
is cryptographically bound to its row: a row-substitution attacker who copies trade A's
ciphertext into trade B's row gets a tag failure on decrypt, because B's AD differs. AD is
authenticated, not encrypted — it is not stored in the ciphertext and must be supplied
again (identically) at decrypt time. A wrong/missing AD ⇒ refusal (tested, §7).

---

## 5. Recovery phrase

- `generateRecoveryPhrase()` draws **32 bytes (256 bits)** from libsodium's CSPRNG and
  encodes them as a **24-word BIP-39 English mnemonic** (256 bits entropy + 8-bit
  checksum = 264 bits = 24 × 11). Returns `{ phrase: string[24], entropy }`.
- The phrase is shown to the user **exactly once**, at signup (Stage 18.6 UI). Cairn never
  stores the phrase, only the DK *wrapped* under the phrase-derived KEK.
- `keyFromRecoveryPhrase(phrase)` validates the BIP-39 checksum first — an invalid or
  mistyped phrase throws `CryptoError('INVALID_RECOVERY_PHRASE')` *before* any key
  derivation — then runs the §3.2 Argon2id config to reproduce the recovery KEK.
- Losing both password and phrase is **unrecoverable**. This is the privacy contract, not a
  bug: there is no escrow, no admin override, no backdoor (CLAUDE.md §14 #19).

---

## 6. OS keychain usage

`apps/desktop/electron/services/keychain.ts` caches the **unwrapped** DK at rest so the
user does not re-enter their password every operation within a session.

- Backed by **`keytar`** → Windows Credential Manager / macOS Keychain / libsecret
  (Linux). keytar is loaded lazily so a missing native module degrades to a typed
  `KEYCHAIN_UNAVAILABLE` error instead of crashing the app.
- Storage shape: service **`cairn`**, account **`dataKey:<userId>`**, value = base64 of
  the 32 raw DK bytes. (Spec shorthand `cairn:dataKey:<userId>` maps to this
  service/account pair.)
- **Read on app start** to resume an unlocked session; **cleared on lock** (and on logout)
  via `clearDataKey(userId)`.
- The DK in the keychain is plaintext key material protected by the OS credential store's
  own at-rest encryption. It is never written to the app's own SQLite, logs, or temp files.
- **Other `cairn`-service accounts**, stored the same way (OS-encrypted, never in SQLite/
  logs): `refresh:<userId>` (opaque rotating auth refresh token, §18.5), `ctrader:tokens`
  (the cTrader OAuth access/refresh pair), and — added 2026-07-10 — `ctrader:app` (the
  cTrader OAuth *application* client id/secret, set by the user in Settings → Integrations →
  cTrader). `ctrader:app` is the keychain-first source that lets a stock install connect
  cTrader with no env vars (`services/broker/ctrader/app-credentials.ts`); the
  `CTRADER_CLIENT_ID`/`CTRADER_CLIENT_SECRET` env vars remain a dev/CI fallback.

---

## 7. Test strategy (what proves the above)

- **AEAD known-answer test:** the canonical XChaCha20-Poly1305-IETF vector from
  draft-irtf-cfrg-xchacha §A.3.1 (RFC-track) — fixed key/nonce/AAD/plaintext ⇒ exact
  expected ciphertext+tag. Pins our wrapper to the standard, not just to itself.
- **Round-trip property tests (`fast-check`):** for arbitrary plaintext/key/AD, `decrypt(encrypt(x)) == x`.
- **Negative / refusal tests (mandatory):** wrong key, tampered ciphertext (flip any
  byte), wrong/missing AD, wrong nonce — each must **throw**, never silently return
  garbage. The tests assert the function *refuses*, not merely that it accepts good input.
- **KDF tests:** determinism (same input ⇒ same key), sensitivity (any changed
  byte of password/salt/params ⇒ different key), output-length honoured, salt-length
  enforced.
- **Recovery-phrase tests:** 24 words, valid BIP-39 checksum, entropy round-trips, invalid
  phrase refuses, phrase-KEK ≠ password-KEK for the same string input (domain separation).

No test ever logs key material, nonces, or plaintext.

---

## 8. KEK rotation plan

Because the vault is encrypted under the DK (not the KEK), rotation is cheap and never
re-encrypts user records.

**Password change (KEK rotation):**
1. Unwrap the DK with the *old* KEK (derived from the old password + stored salt).
2. Generate a **new 16-byte salt**, derive the *new* KEK (§3.1) from the new password.
3. `wrapDataKey(DK, newKEK)` → store the new wrapped key + new salt in `vault_meta` and push to the server.
4. The DK and therefore every record ciphertext is unchanged. Other devices pick up the new
   wrapped key on next sync and unwrap with the new password.

**Recovery-phrase rotation:** generate a new phrase, re-wrap the *same* DK under the new
phrase-KEK, show the new phrase once, replace the stored phrase-wrapped key.

**Data-key rotation (compromise of the DK itself):** this is the expensive path — generate
a new DK, re-encrypt every record under it, re-wrap the new DK under both KEKs, and bump a
`vault_meta` key-generation counter so stale-DK ciphertext is detectable. This is a
deliberate, instrumented migration job (per §19.6 backfill rule), reserved for an actual
key-compromise incident and documented in `docs/runbook.md` (Stage 18.9). It is **not**
triggered by routine password changes.

---

## 9. Logging & redaction

Per CLAUDE.md §19.9, the crypto and keychain layers never log plaintext, key material,
nonces, salts, or wrapped keys. When server-side logging lands (Stage 18.5), the pino
redactor list includes `password`, `token`, `secret`, `ciphertext`, and `Authorization`.
On the client, `electron-log` is never passed key material; the crypto functions return
bytes to the caller and log nothing themselves.
