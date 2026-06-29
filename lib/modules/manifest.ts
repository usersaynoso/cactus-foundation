import { z } from 'zod'
import { getGithubToken } from '@/lib/github/client'

// ---------------------------------------------------------------------------
// Module manifest (cactus.module.json)
// ---------------------------------------------------------------------------

const EnvVarSchema = z.object({
  name: z.string().min(1),
  required: z.boolean(),
})

const NavEntrySchema = z.object({
  label: z.string(),
  path: z.string(), // relative to admin root, e.g. "/forum"
  icon: z.string().optional(),
  permission: z.string().optional(), // permission key required to see this nav entry
})

export const ModuleManifestSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Module name must be lowercase kebab-case'),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'Version must be semver'),
  // Short unique namespace for this module's tables (e.g. "forum_")
  tablePrefix: z.string().regex(/^[a-z][a-z0-9_]*_$/, 'tablePrefix must end with underscore and be lowercase'),
  description: z.string().optional(),
  requiredEnvVars: z.array(EnvVarSchema).default([]),
  navEntries: z.array(NavEntrySchema).default([]),
  // Permission keys this module declares. Convention: use _own/_any suffix where meaningful.
  permissions: z.array(z.string()).default([]),
  cookieCategories: z.array(z.string()).default([]),
})

export type ModuleManifest = z.infer<typeof ModuleManifestSchema>

// ---------------------------------------------------------------------------
// Theme manifest (cactus.theme.json)
// ---------------------------------------------------------------------------

export const ThemeManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'Version must be semver'),
  description: z.string().optional(),
  author: z.string().optional(),
  cookieCategories: z.array(z.string()).default([]),
})

export type ThemeManifest = z.infer<typeof ThemeManifestSchema>

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export function parseModuleManifest(raw: unknown): ModuleManifest {
  return ModuleManifestSchema.parse(raw)
}

export function parseThemeManifest(raw: unknown): ThemeManifest {
  return ThemeManifestSchema.parse(raw)
}

// Validates that a tablePrefix is unique among already-installed modules.
export function validateTablePrefixUnique(
  prefix: string,
  existingPrefixes: string[]
): void {
  if (existingPrefixes.includes(prefix)) {
    throw new Error(
      `Table prefix "${prefix}" is already used by an installed module. Choose a unique prefix.`
    )
  }
}

// Fetch and parse a manifest from a public GitHub repo's raw URL.
export async function fetchManifestFromRepo(
  repoUrl: string,
  filename: 'cactus.module.json' | 'cactus.theme.json'
): Promise<unknown> {
  // Convert github.com URL to raw.githubusercontent.com
  const raw = repoUrl
    .replace('https://github.com/', 'https://raw.githubusercontent.com/')
    .replace(/\.git$/, '')
    + `/HEAD/${filename}`

  const token = await getGithubToken()
  const res = await fetch(raw, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch ${filename} from ${repoUrl}: ${res.status}`)
  }
  return res.json()
}

// Parse owner/repo from a github.com URL
export function parseGitHubRepo(repoUrl: string): { owner: string; repo: string } {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/)
  if (!match?.[1] || !match?.[2]) {
    throw new Error(`Cannot parse GitHub repo from URL: ${repoUrl}`)
  }
  return { owner: match[1], repo: match[2] }
}
