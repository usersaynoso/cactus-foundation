import { Prisma, PrismaClient } from '@prisma/client'

import { retryOnStalePlan } from './stale-plan'

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined
}

// Every query in core and in every module goes through a client carrying this
// extension, which is the only reason a single change can cover the whole
// platform. See ./stale-plan.ts for why the retry exists: a migration that adds
// a column leaves already-open pooled connections holding plans that no longer
// match the table, and each one throws until the statement is replayed.
//
// Exported so that any client built outside this module - the backup round-trip
// test builds its own against a throwaway database - behaves the same as the one
// the app runs on. A client without it is a client the guard does not cover.
export const stalePlanRetryExtension = Prisma.defineExtension({
  name: 'retry-stale-plan',
  query: {
    // $allOperations covers raw queries as well as model calls, which matters:
    // the modules do most of their reading through $queryRaw.
    $allOperations({ args, query }) {
      return retryOnStalePlan(() => query(args))
    },
  },
})

// On Vercel every concurrent request can land on its own short-lived instance,
// and each instance builds its own PrismaClient with its own connection pool.
// Prisma's default pool size is (physical CPUs × 2 + 1), so a burst of parallel
// requests multiplies into far more open Postgres connections than the database
// will grant. A bulk media upload is the usual trigger: the browser fires many
// /record calls at once, Vercel fans them across instances, and the overflow
// fails with "remaining connection slots are reserved for roles with the
// SUPERUSER attribute". That FATAL then lands on unrelated queries too - a
// session lookup that fails reads as logged-out - so one big upload can knock
// other admin pages over at the same time.
//
// Capping each instance at a single connection keeps the total bounded by the
// number of live instances instead of multiplying by the per-instance pool.
// This is Prisma's own guidance for serverless. An operator who has already set
// connection_limit on their URL (e.g. pointing at their own PgBouncer) keeps
// their choice - we only fill in the gap. Left untouched off Vercel, where a
// single long-lived process on the default pool is exactly what you want.
function runtimeDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL
  if (!raw || !process.env.VERCEL) return raw
  try {
    const url = new URL(raw)
    if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '1')
    if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '20')
    return url.toString()
  } catch {
    // A URL we can't parse is one we shouldn't rewrite - hand it back verbatim
    // and let Prisma report on it rather than swallowing the real address.
    return raw
  }
}

function createPrismaClient() {
  const datasourceUrl = runtimeDatabaseUrl()
  return new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  }).$extends(stalePlanRetryExtension)
}

// The client an extension returns is not a `PrismaClient` - it is a structurally
// different type that drops `$on`. Anything taking the shared client as a
// parameter should be typed with this rather than `PrismaClient`, or it stops
// accepting the very client the app actually uses.
export type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
