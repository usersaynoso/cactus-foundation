/**
 * A soft deadline for update work that runs inside a serverless request.
 *
 * The install/update routes cap at maxDuration = 60. Push past that and Vercel hard-kills
 * the function: no catch block runs, so the deploy lock is never released and the browser
 * gets an HTML timeout page instead of JSON (which the admin then fails to parse, producing
 * an error message that says nothing at all). Every failure mode of that kill is worse than
 * failing on purpose.
 *
 * So the work carries a deadline a little short of the ceiling. When GitHub is slow enough
 * that the remaining budget can't cover the next step, the work throws a DeadlineExceededError
 * of its own accord - leaving time for the handler to roll back, release the lock, and answer
 * with a sentence explaining what happened.
 *
 * Placed only at safe points: before the push transaction starts, never inside it. Once the
 * commit is going up, letting it finish is what keeps the repo consistent.
 */

/** How much of the 60s ceiling to leave for rollback + the JSON response. */
export const DEADLINE_HEADROOM_MS = 10_000

/** Budget for update work started in a 60s route. */
export const ROUTE_WORK_BUDGET_MS = 60_000 - DEADLINE_HEADROOM_MS

export class DeadlineExceededError extends Error {
  constructor(phase: string) {
    super(
      `Timed out ${phase}. Nothing was changed - this usually means GitHub is responding slowly.`,
    )
    this.name = 'DeadlineExceededError'
  }
}

/** Absolute timestamp a piece of work must be finished by. */
export function deadlineFromNow(budgetMs: number = ROUTE_WORK_BUDGET_MS): number {
  return Date.now() + budgetMs
}

export function msRemaining(deadlineAt: number | undefined): number {
  if (deadlineAt === undefined) return Number.POSITIVE_INFINITY
  return deadlineAt - Date.now()
}

/** Throws if the deadline has passed. `phase` completes "Timed out ...". */
export function assertWithinDeadline(deadlineAt: number | undefined, phase: string): void {
  if (deadlineAt !== undefined && Date.now() > deadlineAt) {
    throw new DeadlineExceededError(phase)
  }
}

export function isDeadlineError(err: unknown): boolean {
  return err instanceof DeadlineExceededError
}
