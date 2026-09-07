// Hand-written types for the prebuild checker, so lib/modules/import-cycles.test.ts
// can share its one implementation rather than keeping a second copy in step.
export function findRegistryImportCycles(rootDir: string): {
  /** Every cycle found, formatted as a trail, known ones included. */
  cycles: string[]
  /** The subset not on the KNOWN allowance - what a caller should fail on. */
  unexpected: string[]
  /** KNOWN entries that no longer cycle, and should be deleted from the list. */
  stale: string[]
  /** The generated registries that actually existed and were walked. */
  checked: string[]
}
