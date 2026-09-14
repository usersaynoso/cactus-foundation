import type { Client } from 'pg'
export type PlanFlushState = { before: string | null; previous: string | null }
export function migrationFingerprint(client: Client): Promise<string>
export function beginPlanFlush(client: Client): Promise<PlanFlushState>
export function sweepPlans(client: Client, sleep?: (ms: number) => Promise<void>): Promise<number>
export function finishPlanFlush(client: Client, state: PlanFlushState, options?: {
  sweep?: (client: Client) => Promise<number>; log?: (line: string) => void
}): Promise<{ skipped: boolean }>
