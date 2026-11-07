// A count of queries that failed because the database could not be reached or could
// not keep up - never because of the query itself.
//
// Public pages swallow a failed read and carry on, so a page rendered during a blip
// comes out looking fine with the header or the prices missing. The page store
// (lib/cache/page-store) compares this before and after a render and refuses to keep
// the result if it moved. Process-wide rather than per-render on purpose: the cost of
// another request's failure is one page not held, and the alternative is threading
// a context through every query in every module.
//
// On globalThis because proxy.ts and the page render are separate bundles.

const KEY = '__cactusDbInfraErrors'
type WithCount = typeof globalThis & { [KEY]?: number }

// P1xxx: could not reach, authenticate or stay connected. P2024: timed out waiting
// for a pooled connection. P2028: a transaction could not be kept open. 53xxx and
// 57xxx are Postgres itself saying no: too many connections, out of memory, shutting
// down, statement cancelled.
const INFRA_CODE = /^(P1\d{3}|P2024|P2028|53\d{3}|57[A-Z0-9]{3})$/
const INFRA_CLASS = /^PrismaClient(Initialization|RustPanic)Error$/
const INFRA_MESSAGE = /too many (clients|connections)|remaining connection slots|Can't reach database|connection (terminated|closed)|canceling statement due to/i

export function isDbInfraError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const code = (err as { code?: unknown }).code
  if (typeof code === 'string' && INFRA_CODE.test(code)) return true
  return INFRA_CLASS.test(err.constructor.name) || INFRA_MESSAGE.test(err.message)
}

export function noteDbError(err: unknown): void {
  if (!isDbInfraError(err)) return
  const scope = globalThis as WithCount
  scope[KEY] = (scope[KEY] ?? 0) + 1
}

export function dbInfraErrorCount(): number {
  return (globalThis as WithCount)[KEY] ?? 0
}
