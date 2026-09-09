// Types for check-frozen-migrations.mjs.
//
// The checker is plain ESM JavaScript so the survey script and any shell can run
// it with bare `node`, no loader and no build step - but its test is TypeScript
// and imports it directly, and an untyped import there would be an implicit
// `any` on every result. So the shapes live here rather than the check living
// twice.
export type FrozenMigrationViolation = {
  /** Module directory name under modules/, e.g. "shop". */
  module: string
  /** Path within that module, e.g. "migrations/043_returnable.sql". */
  file: string
  /** The newest release tag the file appears in. */
  tag: string
  /** Blob sha the file had when that tag was cut. */
  releasedSha: string
  /** Blob sha the file has on disk now. Differing from releasedSha is the bug. */
  currentSha: string
}

export type FrozenMigrationSkip = {
  module: string
  /** Why no judgement could be made - never counted as clean. */
  reason: string
}

export type FrozenMigrationCheck = {
  module: string
  tag: string
  /** How many released migrations were actually compared. */
  inspected: number
}

export type FrozenMigrationResult = {
  violations: FrozenMigrationViolation[]
  skipped: FrozenMigrationSkip[]
  checked: FrozenMigrationCheck[]
}

export function findFrozenMigrationViolations(options?: { root?: string }): FrozenMigrationResult
