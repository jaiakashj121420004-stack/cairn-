import type { Result } from './result'

/**
 * The shape every cross-boundary procedure catalog must satisfy: a flat map of
 * procedure name -> { input, output }. Concrete catalogs (e.g. the desktop's
 * `Procedures` in `apps/desktop/shared/types/procedures.ts`) specialize this with
 * real input/output types so `Transport.call` is fully typed end to end.
 *
 * `Transport` is generic over the catalog (rather than importing a concrete one)
 * because the catalog references app-local domain types that this package cannot
 * depend on without an inverted dependency.
 */
export type ProceduresShape = Record<string, { input: unknown; output: unknown }>

/**
 * The universal cross-boundary transport contract (CLAUDE.md §3.6).
 *
 * `ElectronTransport` forwards calls over IPC; `HttpTransport` forwards them over
 * `fetch`. Renderer code depends only on `Transport`, so adding new surfaces later
 * (a CLI, a future mobile app) is just a new implementation.
 *
 * `P` is constrained F-bounded — `P extends { [K in keyof P]: ProcedureEntry }` —
 * rather than `P extends ProceduresShape` (`Record<string, ProcedureEntry>`): a
 * concrete catalog like `Procedures` is a flat interface of literal-string keys,
 * which does NOT structurally satisfy `Record<string, ...>` (TS requires an explicit
 * index signature for that), and adding one would widen `keyof Procedures` from the
 * literal-key union to `string` — breaking exhaustive mapped types like the dispatch
 * table in `ElectronTransport`. The homomorphic mapped-type constraint below checks
 * the same thing (every entry has `input`/`output`) over `P`'s *own* keys, so it
 * preserves the literal-key structure while still letting `P[K]['input']`/`['output']`
 * resolve. `ProceduresShape` remains available as a plain documentation-level shape.
 */
export interface Transport<P extends { [K in keyof P]: { input: unknown; output: unknown } }> {
  call<K extends keyof P & string>(name: K, input: P[K]['input']): Promise<Result<P[K]['output']>>
}
