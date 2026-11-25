// Types for check-secrets.mjs.
//
// The scanner is plain ESM JavaScript so the pre-commit hook and the
// commit-and-push skill can run it with bare `node` in any repository, no loader
// and no build step. Its test is TypeScript and imports it directly, so the
// shapes live here rather than the scanner living twice.
export type SecretFinding = {
  /** Set when the finding came from a history scan. */
  commit?: string
  file: string
  /** 1-based line in the file; 0 for a whole-file finding. */
  line: number
  /** Stable rule id, e.g. "vercel-token", "forbidden-file". */
  rule: string
  label: string
  /** Redacted preview. Never the value itself. */
  preview: string
}

export type ScanLine = { line: number; text: string }

export declare const ALLOW_MARKER: string
export declare const LINE_RULES: { id: string; label: string; re: RegExp; group?: number; reject?: (value: string) => boolean }[]
export function forbiddenPathReason(file: string): string | null
export function looksRandom(value: string): boolean
export function scanLines(file: string, lines: ScanLine[]): SecretFinding[]
export function parseDiff(output: string): { commit?: string; file: string; lines: ScanLine[] }[]
export function scanStaged(options?: { root?: string; paths?: string[] }): SecretFinding[]
export function scanHistory(options?: { root?: string; range?: string }): SecretFinding[]
export function scanTracked(options?: { root?: string }): SecretFinding[]
