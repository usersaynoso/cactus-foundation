import { describe, expect, it } from 'vitest'

import { isStalePlanError, retryOnStalePlan } from './stale-plan'

// The shape Prisma actually throws for a failed $queryRaw, taken from the live
// deployment log of 2026-07-19 rather than invented, so a future change to the
// detection is measured against the real thing.
const prismaRawError = Object.assign(
  new Error(
    'Invalid `prisma.$queryRaw()` invocation:\n\n\nRaw query failed. Code: `0A000`. Message: `ERROR: cached plan must not change result type`',
  ),
  {
    code: 'P2010',
    meta: { code: '0A000', message: 'ERROR: cached plan must not change result type' },
  },
)

describe('isStalePlanError', () => {
  it('recognises the error Prisma throws for a stale cached plan', () => {
    expect(isStalePlanError(prismaRawError)).toBe(true)
  })

  it('recognises it when only meta carries the message', () => {
    expect(
      isStalePlanError({ code: 'P2010', meta: { message: 'ERROR: cached plan must not change result type' } }),
    ).toBe(true)
  })

  // 0A000 is Postgres's catch-all "feature not supported", so matching on the
  // SQLSTATE would retry genuine programming errors. This is the test that fails
  // if anyone loosens the check to the code.
  it('ignores other 0A000 errors', () => {
    expect(
      isStalePlanError(
        Object.assign(new Error('Raw query failed. Code: `0A000`.'), {
          code: 'P2010',
          meta: { code: '0A000', message: 'ERROR: cannot insert into a generated column' },
        }),
      ),
    ).toBe(false)
  })

  it('ignores ordinary failures and non-objects', () => {
    expect(isStalePlanError(new Error('connection refused'))).toBe(false)
    expect(isStalePlanError('cached plan must not change result type')).toBe(false)
    expect(isStalePlanError(null)).toBe(false)
    expect(isStalePlanError(undefined)).toBe(false)
  })
})

describe('retryOnStalePlan', () => {
  it('replays a stale-plan failure and returns the second result', async () => {
    let calls = 0
    const result = await retryOnStalePlan(async () => {
      calls += 1
      if (calls === 1) throw prismaRawError
      return 'product'
    })

    expect(result).toBe('product')
    expect(calls).toBe(2)
  })

  it('does not replay anything else', async () => {
    let calls = 0
    await expect(
      retryOnStalePlan(async () => {
        calls += 1
        throw new Error('connection refused')
      }),
    ).rejects.toThrow('connection refused')

    expect(calls).toBe(1)
  })

  it('replays once only, and surfaces the second failure', async () => {
    let calls = 0
    await expect(
      retryOnStalePlan(async () => {
        calls += 1
        throw prismaRawError
      }),
    ).rejects.toThrow('cached plan must not change result type')

    expect(calls).toBe(2)
  })

  it('leaves a successful call alone', async () => {
    let calls = 0
    const result = await retryOnStalePlan(async () => {
      calls += 1
      return 42
    })

    expect(result).toBe(42)
    expect(calls).toBe(1)
  })
})
