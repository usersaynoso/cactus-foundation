// Hand-written types for the prebuild checker, so lib/modules/server-client-imports.test.ts
// can share its one implementation rather than keeping a second copy in step.
export type ServerClientFinding = {
  file: string
  line: number
  name: string
  reason: string
  client: string
  trail: string[]
  /** Also reachable from a client component, so the use may only run in the browser. */
  shared: boolean
  /** 'error' fails a build; 'warn' is reported but not certain enough to. */
  severity: 'error' | 'warn'
}

export function findServerClientValueReads(rootDir: string): ServerClientFinding[]
export function formatFinding(
  finding: ServerClientFinding,
  rootDir: string,
  moduleVersions?: Map<string, string>,
): string
