/**
 * OpenAPI 3.1 description of the Cairn backend HTTP contract (CLAUDE.md §18.5).
 *
 * Why hand-authored rather than auto-generated: the route handlers validate with
 * Zod at the boundary (see `lib/http.ts`) instead of attaching Fastify JSON
 * schemas, so there is nothing for a schema-introspecting generator to read. This
 * document is the single, reviewed source of the public contract; it is served at
 * `GET /openapi.json` and rendered by the Scalar UI at `GET /docs`.
 *
 * The shape is typed as a readonly object literal (no `any`, §2.12) and validated
 * structurally by `tests/integration/docs.test.ts`. Keep it in step with the routes
 * registered in `routes/index.ts`; the docs test asserts every registered path is
 * present here, so drift fails CI rather than shipping a stale contract.
 */

/** A response that returns the success arm of the universal `Result<T>` envelope. */
const okResponse = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ResultOk' },
    },
  },
})

/** A response that returns the failure arm of the universal `Result<T>` envelope. */
const errorResponse = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ResultError' },
    },
  },
})

/** Bearer-access-token security requirement for authenticated endpoints. */
const bearerAuth = [{ bearerAuth: [] }]

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Cairn API',
    version: '0.1.0',
    description:
      'Backend for Cairn — a discipline-first trading journal. The server authenticates ' +
      'users and stores **end-to-end-encrypted ciphertext only**: it never decrypts or ' +
      'inspects trades, accounts, journals, or any user content (CLAUDE.md §2.4, §2.13). ' +
      'Every response is the universal `Result<T>` envelope.',
    contact: { name: 'Cairn', url: 'https://github.com/' },
    license: { name: 'Proprietary' },
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Local development' },
    { url: '/', description: 'Same origin' },
  ],
  tags: [
    { name: 'Health', description: 'Liveness.' },
    { name: 'Auth', description: 'Signup, login, email verification, token rotation, magic link, OAuth stubs.' },
    { name: 'Devices', description: 'Per-user device registry for sync enrollment.' },
    { name: 'Vault', description: 'Opaque ciphertext push/pull and wrapped key material. Server never decrypts.' },
    { name: 'Billing', description: 'Subscription checkout, status, portal, cancellation.' },
    { name: 'Webhooks', description: 'Signature-verified, idempotent provider callbacks.' },
    { name: 'Admin', description: 'Operator-only, bearer-protected audit access.' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Short-lived access token (≤ 15 min). Obtain via /auth/login or /auth/refresh.',
      },
      adminToken: {
        type: 'http',
        scheme: 'bearer',
        description: 'Operator token from the ADMIN_TOKEN env var. Absent token → 404 (endpoint hidden).',
      },
    },
    schemas: {
      ResultOk: {
        type: 'object',
        required: ['ok', 'data'],
        properties: {
          ok: { const: true },
          data: { description: 'Endpoint-specific payload.' },
        },
      },
      ResultError: {
        type: 'object',
        required: ['ok', 'error'],
        properties: {
          ok: { const: false },
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: {
                type: 'string',
                description: 'Stable error code from packages/shared-types/error-codes.ts.',
              },
              message: { type: 'string' },
              details: { description: 'Optional, non-sensitive field-level detail.' },
            },
          },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness probe',
        description: 'No auth, no rate limit. Returns `{ status: "ok" }`.',
        responses: { '200': okResponse('Service is up.') },
      },
    },

    '/auth/signup': {
      post: {
        tags: ['Auth'],
        summary: 'Create an account',
        description:
          'Sends a verification email. Returns an identical shape whether or not the ' +
          'email already exists (no account-enumeration leak).',
        responses: { '200': okResponse('Signup accepted.'), '400': errorResponse('Validation failed.') },
      },
    },
    '/auth/verify': {
      post: {
        tags: ['Auth'],
        summary: 'Verify email with a single-use token',
        responses: { '200': okResponse('Email verified.'), '400': errorResponse('Invalid/expired/used token.') },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in with email + password',
        description: 'Sets the `__Host-refresh` cookie and returns an access token. Rate-limited (5 / 15 min).',
        responses: {
          '200': okResponse('Authenticated.'),
          '401': errorResponse('Bad credentials.'),
          '429': errorResponse('Rate limited.'),
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate the refresh token',
        description:
          'Consumes the refresh cookie and issues a fresh one plus a new access token. ' +
          'Replaying a consumed token triggers refresh-reuse detection and revokes the whole family.',
        responses: { '200': okResponse('Rotated.'), '401': errorResponse('Invalid or reused refresh token.') },
      },
    },
    '/auth/logout': {
      post: { tags: ['Auth'], summary: 'Revoke the current session', responses: { '200': okResponse('Logged out.') } },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Request a password-reset email',
        description: 'Always returns the same response (no enumeration).',
        responses: { '200': okResponse('Reset email sent if the account exists.') },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Reset password with a token',
        responses: { '200': okResponse('Password reset.'), '400': errorResponse('Invalid/expired token.') },
      },
    },
    '/auth/magic-request': {
      post: { tags: ['Auth'], summary: 'Request a magic-link email', responses: { '200': okResponse('Sent if the account exists.') } },
    },
    '/auth/magic-consume': {
      post: {
        tags: ['Auth'],
        summary: 'Consume a magic link',
        responses: { '200': okResponse('Authenticated.'), '400': errorResponse('Invalid/expired link.') },
      },
    },
    '/auth/oauth/google': {
      post: { tags: ['Auth'], summary: 'Google OAuth (stub)', responses: { '501': errorResponse('Not implemented.') } },
    },
    '/auth/oauth/apple': {
      post: { tags: ['Auth'], summary: 'Apple OAuth (stub)', responses: { '501': errorResponse('Not implemented.') } },
    },

    '/devices': {
      get: {
        tags: ['Devices'],
        summary: 'List the caller’s devices',
        security: bearerAuth,
        responses: { '200': okResponse('Device list.'), '401': errorResponse('Unauthenticated.') },
      },
      post: {
        tags: ['Devices'],
        summary: 'Register a device',
        security: bearerAuth,
        responses: { '200': okResponse('Device registered.'), '401': errorResponse('Unauthenticated.') },
      },
    },
    '/devices/{id}': {
      delete: {
        tags: ['Devices'],
        summary: 'Revoke a device',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': okResponse('Device revoked.'), '401': errorResponse('Unauthenticated.') },
      },
    },

    '/vault/manifest': {
      get: {
        tags: ['Vault'],
        summary: 'Fetch the vault manifest (key version, cursor head)',
        description: 'Requires a verified email. Returns metadata only — never plaintext.',
        security: bearerAuth,
        responses: { '200': okResponse('Manifest.'), '401': errorResponse('Unauthenticated or unverified.') },
      },
    },
    '/vault/push': {
      post: {
        tags: ['Vault'],
        summary: 'Push encrypted op deltas',
        description: 'Body carries opaque ciphertext blobs. The server stores them verbatim and never decrypts.',
        security: bearerAuth,
        responses: {
          '200': okResponse('Ops accepted.'),
          '401': errorResponse('Unauthenticated or unverified.'),
          '402': errorResponse('Cairn Pro required (free tier).'),
          '413': errorResponse('Body too large.'),
        },
      },
    },
    '/vault/pull': {
      post: {
        tags: ['Vault'],
        summary: 'Pull encrypted op deltas since a cursor',
        security: bearerAuth,
        responses: {
          '200': okResponse('Ciphertext page + next cursor.'),
          '401': errorResponse('Unauthenticated or unverified.'),
          '402': errorResponse('Cairn Pro required (free tier).'),
        },
      },
    },
    '/vault/key': {
      get: {
        tags: ['Vault'],
        summary: 'Fetch the wrapped data key + KDF params',
        security: bearerAuth,
        responses: { '200': okResponse('Wrapped key material.'), '401': errorResponse('Unauthenticated or unverified.') },
      },
      put: {
        tags: ['Vault'],
        summary: 'Upload/rotate the wrapped data key',
        description: 'The server stores the wrapped key opaquely; the KEK never leaves the client.',
        security: bearerAuth,
        responses: { '200': okResponse('Key material stored.'), '401': errorResponse('Unauthenticated or unverified.') },
      },
    },

    '/billing/status': {
      get: {
        tags: ['Billing'],
        summary: 'Current subscription status + entitlements',
        security: bearerAuth,
        responses: { '200': okResponse('Status.'), '401': errorResponse('Unauthenticated.') },
      },
    },
    '/billing/checkout': {
      post: {
        tags: ['Billing'],
        summary: 'Start a checkout session',
        security: bearerAuth,
        responses: { '200': okResponse('Provider checkout URL.'), '401': errorResponse('Unauthenticated.') },
      },
    },
    '/billing/portal': {
      post: {
        tags: ['Billing'],
        summary: 'Open the customer billing portal',
        security: bearerAuth,
        responses: { '200': okResponse('Portal URL.'), '401': errorResponse('Unauthenticated.') },
      },
    },
    '/billing/cancel': {
      post: {
        tags: ['Billing'],
        summary: 'Cancel the subscription (sync stops; local data is untouched)',
        security: bearerAuth,
        responses: { '200': okResponse('Cancellation scheduled.'), '401': errorResponse('Unauthenticated.') },
      },
    },

    '/webhooks/stripe': {
      post: {
        tags: ['Webhooks'],
        summary: 'Stripe webhook receiver',
        description: 'Verifies the `stripe-signature` header and dedupes via the webhook_event table. Not rate-limited.',
        responses: { '200': okResponse('Acknowledged.'), '400': errorResponse('Bad signature / payload.') },
      },
    },
    '/webhooks/razorpay': {
      post: {
        tags: ['Webhooks'],
        summary: 'Razorpay webhook receiver',
        description: 'Verifies the `x-razorpay-signature` HMAC and dedupes. Not rate-limited.',
        responses: { '200': okResponse('Acknowledged.'), '400': errorResponse('Bad signature / payload.') },
      },
    },

    '/admin/audit-log': {
      get: {
        tags: ['Admin'],
        summary: 'Read the audit log (operator only)',
        description: 'Protected by the ADMIN_TOKEN bearer. If the token is unset the route 404s.',
        security: [{ adminToken: [] }],
        responses: { '200': okResponse('Audit entries.'), '404': errorResponse('Hidden (token unset) or not found.') },
      },
    },
  },
} as const

/** The set of HTTP paths documented above — used by the docs test to detect drift. */
export type DocumentedPath = keyof (typeof openApiDocument)['paths']
