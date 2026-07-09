import { expect, test, type Page } from '@playwright/test'

/**
 * The web client's end-to-end happy path (task §8):
 *   signup → verify → recovery-phrase save → sync → multi-device (two browser contexts).
 *
 * It exercises the REAL client crypto against the in-memory mock API (which stays blind
 * to plaintext). The second context recovers the SAME vault from the 24-word phrase and
 * decrypts the same op the first device seeded — proving cross-device E2E. Web sync is
 * read-only by design (task §5), so the "multi-device" assertion is decryption
 * consistency across devices, not a write-conflict (write-conflict resolution is the
 * desktop ConflictResolver's job).
 */

const password = 'correct horse battery staple'

function uniqueEmail(): string {
  return `trader_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`
}

/** The mock issues a deterministic verify token `verify<userId>`; first signup is `u1`… */
async function signupAndVerify(page: Page, email: string): Promise<void> {
  await page.goto('/signup')
  await page.getByTestId('email').fill(email)
  await page.getByTestId('password').fill(password)
  await page.getByTestId('submit').click()
  // Lands on the verify-pending screen.
  await expect(page.getByTestId('verify-pending')).toBeVisible()
}

test('signup → verify → enroll → sync → second device recovers and sees the same data', async ({
  browser,
}) => {
  const email = uniqueEmail()

  // ── Device A ──────────────────────────────────────────────────────────────
  const ctxA = await browser.newContext()
  const a = await ctxA.newPage()
  await signupAndVerify(a, email)

  // Verify via the emailed token. The mock derives it from the userId; we read it back
  // by visiting the verify route with the token the server would have sent.
  // The first account created in a fresh mock is u1 ⇒ token `verifyu1`. To stay robust
  // across ordering we instead verify by signing in (the mock lets login proceed) and
  // confirm the verify route works with the known token shape.
  const verifyToken = await deriveVerifyToken(a, email)
  await a.goto(`/verify?token=${verifyToken}`)
  await expect(a.getByTestId('verify-done')).toBeVisible()

  // Sign in.
  await a.goto('/login')
  await a.getByTestId('email').fill(email)
  await a.getByTestId('password').fill(password)
  await a.getByTestId('submit').click()

  // First device: no vault on the server yet ⇒ enrollment + recovery phrase.
  await a.waitForURL('**/enroll')
  await a.getByTestId('vault-password').fill(password)
  await a.getByTestId('submit').click()
  const phraseEl = a.getByTestId('recovery-phrase')
  await expect(phraseEl).toBeVisible()
  const phrase = ((await phraseEl.innerText()) || '')
    .split('\n')
    .map((line) => line.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean)
    .join(' ')
  expect(phrase.split(' ').length).toBe(24)

  await a.getByTestId('recovery-confirm').check()
  await a.getByTestId('recovery-continue').click()
  await a.waitForURL('**/app')

  // Seed an encrypted op from the unlocked device (simulates a desktop push).
  const seeded = await a.evaluate(async () => {
    return (
      window.__cairnTest?.seedOp('trade', 't-001', { symbol: 'EURUSD', rMultiple: 2.3 }) ?? false
    )
  })
  expect(seeded).toBe(true)

  // Sync: pull + decrypt that op in-browser.
  await a.getByTestId('sync-now').click()
  await expect(a.getByTestId('sync-result')).toContainText('Applied 1 change')

  // ── Device B (second context, same account, recovers via phrase) ───────────
  const ctxB = await browser.newContext()
  const b = await ctxB.newPage()
  await b.goto('/login')
  await b.getByTestId('email').fill(email)
  await b.getByTestId('password').fill(password)
  await b.getByTestId('submit').click()

  // Vault already enrolled ⇒ unlock screen. Use the recovery phrase (new device).
  await b.waitForURL('**/unlock')
  await b.getByTestId('toggle-mode').click()
  await b.getByTestId('recovery-phrase-input').fill(phrase)
  await b.getByTestId('submit').click()
  await b.waitForURL('**/app')

  // Device B pulls and decrypts the SAME op device A seeded.
  await b.getByTestId('sync-now').click()
  await expect(b.getByTestId('sync-result')).toContainText('Applied 1 change')

  // Confirm B actually decrypted the plaintext from its IndexedDB cache.
  const decrypted = await b.evaluate(async () => {
    const dbReq = indexedDB.open('cairn-vault')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      dbReq.onsuccess = () => resolve(dbReq.result)
      dbReq.onerror = () => reject(dbReq.error)
    })
    return await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction('records', 'readonly')
      const all = tx.objectStore('records').getAll()
      all.onsuccess = () => resolve(all.result)
      all.onerror = () => reject(all.error)
    })
  })
  expect(JSON.stringify(decrypted)).toContain('EURUSD')

  await ctxA.close()
  await ctxB.close()
})

/**
 * Recover the mock's deterministic verify token for an email by asking the page to read
 * it from the mock (the mock exposes it only implicitly via the token shape). We derive
 * it the same way the mock does: `verify` + the userId. Since we can't see the userId
 * directly, we probe `/auth/verify` is not needed — instead we resolve it by signing the
 * user in once is overkill; the mock assigns ids sequentially, so we expose a tiny lookup
 * through the seed of the flow. For determinism the mock token is `verify<userId>` and the
 * userId is surfaced on the signup response, which the app stored — but the app doesn't
 * keep it. So we fetch it directly from the mock's login, which returns the userId claim.
 */
const API_ORIGIN = 'http://localhost:8788'

async function deriveVerifyToken(page: Page, email: string): Promise<string> {
  const userId = await page.evaluate(
    async ({ em, origin, pw }) => {
      const res = await fetch(`${origin}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: em, password: pw }),
      })
      const json = (await res.json()) as { ok: boolean; data?: { user?: { userId?: string } } }
      return json.data?.user?.userId ?? ''
    },
    { em: email, origin: API_ORIGIN, pw: password },
  )
  return `verify${userId}`
}
