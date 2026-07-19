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

function createPrismaClient() {
  return new PrismaClient({
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
