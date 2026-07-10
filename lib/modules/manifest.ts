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

const ModuleDependencySchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Dependency name must be lowercase kebab-case'),
  minVersion: z.string().regex(/^\d+\.\d+\.\d+/, 'minVersion must be semver'),
})

const CronJobSchema = z.object({
  // Must resolve through the generic module router (app/api/m/[module]/[...path]),
  // so no module ever needs a hand-written entry in a committed core file.
  path: z.string().regex(/^\/api\/m\/[a-z][a-z0-9-]*\//, 'cron path must be under /api/m/<module-name>/'),
  schedule: z.string().min(1), // standard cron expression, e.g. "0 6 * * *"
})

export const ModuleManifestSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Module name must be lowercase kebab-case'),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'Version must be semver'),
  // Short unique namespace for this module's tables (e.g. "forum_")
  tablePrefix: z.string().regex(/^[a-z][a-z0-9_]*_$/, 'tablePrefix must end with underscore and be lowercase'),
  description: z.string().optional(),
  // Minimum Cactus core version this module needs (semver, no leading v).
  // Install and update are rejected with an "update Cactus first" message when
  // the running core is older - a module importing a core helper that doesn't
  // exist yet would otherwise fail the site's next build.
  requiresCoreVersion: z.string().regex(/^\d+\.\d+\.\d+/, 'requiresCoreVersion must be semver').optional(),
  requiredEnvVars: z.array(EnvVarSchema).default([]),
  navEntries: z.array(NavEntrySchema).default([]),
  // When set, this module's navEntries render under their own sidebar section
  // label (e.g. "Gazette") instead of being bucketed into the generic "Modules"
  // section shared by all other modules.
  navGroupLabel: z.string().optional(),
  // Permission keys this module declares. Convention: use _own/_any suffix where meaningful.
  permissions: z.array(z.string()).default([]),
  cookieCategories: z.array(z.string()).default([]),
  // PascalCase table names owned by this module, used during uninstall with code_and_data mode.
  teardown: z.array(z.string()).optional(),
  // Puck block registrations provided by this module.
  puckBlocks: z.array(z.object({
    type: z.string().min(1),
    import: z.string().min(1),
    component: z.string().min(1),
    rscComponent: z.string().optional(),
    // Layout types (from this or another module's layoutTypes.types[].key) this
    // block should also be offered on, in addition to the flat moduleComponents map.
    layoutTypes: z.array(z.string()).optional(),
  })).optional(),
  // Declares this module's own core-Layout types (e.g. a "Directory" group with
  // "Category"/"Entry" sub-types), extending the built-in
  // header/footer/infoPage/notFound/statusPage set with no core changes.
  // Collected by scripts/generate-module-layout-types.mjs into
  // lib/layout/module-layout-types.ts and lib/setup/module-starter-layouts.ts.
  layoutTypes: z.object({
    groupLabel: z.string().min(1),
    types: z.array(z.object({
      key: z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'layout type key must be camelCase'),
      label: z.string().min(1),
      starterImport: z.string().min(1).optional(),
      starterExport: z.string().min(1).optional(),
    })).min(1),
  }).optional(),
  // Settings tabs this module contributes to the core admin's /config page.
  // Rendered generically, permission-filtered the same way as navEntries.
  settingsTabs: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    permission: z.string().optional(),
    import: z.string().min(1),
    component: z.string().min(1),
  })).default([]),
  // Other modules (by name + minimum version) that must be installed and active
  // before this module can be installed. Enforced by the install/uninstall routes.
  requiresModules: z.array(ModuleDependencySchema).default([]),
  // Vercel Cron entries this module needs. Collected across all installed modules
  // into a single generated vercel.json by scripts/generate-module-cron.mjs.
  cronJobs: z.array(CronJobSchema).default([]),
  // Single top-level public URL segment this module owns (e.g. "gazette" for
  // /gazette/*). Optional — most modules have no public-facing routes.
  publicBasePath: z.string().regex(/^[a-z][a-z0-9-]*$/, 'publicBasePath must be a single lowercase URL segment').optional(),
  // Components this module contributes to extension points published by other
  // modules' own pages (e.g. a hard dependency's admin UI). `point` is an
  // arbitrary string namespace the publishing module documents and reads live
  // from Module.manifest; core has no knowledge of any specific point name.
  extensionPoints: z.array(z.object({
    point: z.string().min(1),
    id: z.string().min(1),
    permission: z.string().optional(),
    import: z.string().min(1),
    component: z.string().min(1),
  })).default([]),
  // SMS providers this module contributes. Core auth uses the first configured
  // provider from an active module to deliver login codes by text message
  // (admin password login and member SMS 2FA). `import`/`export` name a module
  // file exporting an object satisfying core's SmsProvider type (lib/auth/sms.ts):
  // { isConfigured(): boolean | Promise<boolean>, sendSms(to, body): Promise<void> }.
  // Collected by scripts/generate-module-sms-providers.mjs into
  // lib/modules/sms-providers.ts.
  smsProviders: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    import: z.string().min(1),
    export: z.string().min(1),
  })).default([]),
  // Declarative contributions to the core Members system (see MEMBERS_SPEC.md
  // amendment 5). Pure data, read live from this manifest at request time by
  // core Members code (lib/modules/member-extensions.ts) - no codegen step,
  // since (unlike extensionPoints/settingsTabs) nothing here needs a static
  // component import.
  memberExtensions: z.object({
    activityTypes: z.array(z.object({ type: z.string().min(1), label: z.string().min(1) })).default([]),
    notificationCategories: z.array(z.object({ category: z.string().min(1), label: z.string().min(1) })).default([]),
    // Path under this module's own API namespace that core calls internally
    // (self-origin fetch, internal bearer) to collect this module's
    // contribution to a member's data export.
    dataExportPath: z.string().regex(/^\/api\/m\/[a-z][a-z0-9-]*\//, 'dataExportPath must be under /api/m/<module-name>/').optional(),
    routeTiers: z.array(z.object({
      pathPrefix: z.string().min(1),
      tier: z.enum(['PUBLIC', 'MEMBER', 'TRUSTED_MEMBER']),
    })).default([]),
  }).optional(),
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

// Validates that a publicBasePath is unique among already-installed modules.
export function validatePublicBasePathUnique(
  base: string,
  existingBases: string[]
): void {
  if (existingBases.includes(base)) {
    throw new Error(
      `Public base path "${base}" is already used by an installed module. Choose a unique publicBasePath.`
    )
  }
}

// Fetch and parse a manifest from a public GitHub repo's raw URL.
// The raw URL is built exclusively from a validated owner/repo pair (never from
// the caller's string directly) so a non-github.com repoUrl can never reach
// fetch() with the GitHub token attached — see parseGitHubRepo.
export async function fetchManifestFromRepo(
  repoUrl: string,
  filename: 'cactus.module.json' | 'cactus.theme.json'
): Promise<unknown> {
  const { owner, repo } = parseGitHubRepo(repoUrl)
  const raw = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${filename}`

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

// Parse owner/repo from a github.com URL. Validates the hostname strictly (via
// URL parsing, not a substring match) so URLs like
// "https://attacker.example/?x=github.com/a/b" are rejected rather than treated
// as GitHub — that mismatch is what let the GitHub token leak to arbitrary hosts.
export function parseGitHubRepo(repoUrl: string): { owner: string; repo: string } {
  let url: URL
  try {
    url = new URL(repoUrl)
  } catch {
    throw new Error(`Cannot parse GitHub repo from URL: ${repoUrl}`)
  }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
    throw new Error(`Repo URL must be an https://github.com/ URL: ${repoUrl}`)
  }
  const match = url.pathname.match(/^\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  const owner = match?.[1]
  const repo = match?.[2]
  if (!owner || !repo || !/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) {
    throw new Error(`Cannot parse GitHub repo from URL: ${repoUrl}`)
  }
  return { owner, repo }
}
