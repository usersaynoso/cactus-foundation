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

// A cookie consent category a module asks the site to carry. It is offered to
// the owner as a suggestion on the admin's GDPR tab and never installed behind
// their back - the site's own banner config stays the only source of truth.
//
// Two forms, both permanent. The short form is a bare key ("live-chat"), which
// is every module written before this schema grew up. The long form carries the
// wording as well, so a suggestion the owner accepts arrives with a description
// already written instead of an unexplained switch in the banner's manage panel.
// Keys are folded to core's machine-readable shape by whoever consumes them, so
// a module may word its key however it likes.
const CookieCategorySchema = z.union([
  z.string().min(1),
  z.object({
    key: z.string().min(1),
    label: z.string().min(1).optional(),
    description: z.string().optional(),
  }),
])

export type CookieCategoryDeclaration = z.infer<typeof CookieCategorySchema>

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
  cookieCategories: z.array(CookieCategorySchema).default([]),
  // Blocks core should place onto matching layouts when this module is FIRST
  // installed, for blocks that draw nothing and exist only to say "run this
  // module here". Never re-applied on update: an owner who deletes the block
  // must not find it back. See lib/layout/auto-place-blocks.ts.
  autoPlaceBlocks: z.array(z.object({
    /** A puckBlocks type this module registers. */
    type: z.string().min(1),
    /** The layout type to place it on, e.g. "header". */
    layoutType: z.string().min(1),
    position: z.enum(['start', 'end']).optional(),
  })).default([]),
  // External origins this module's front-end genuinely needs, per CSP fetch
  // directive. Collected across every installed module by
  // scripts/generate-module-csp.mjs and unioned into the site's own
  // Content-Security-Policy (see proxy.ts).
  //
  // This exists because a payment or mapping SDK that draws its own iframes
  // cannot load at all under core's default policy, and the alternative was
  // either naming the module's supplier in a committed core file (which no
  // module may do) or asking the owner to fill in CSP_EXTRA_ORIGINS by hand
  // before their checkout would take a card. Core still knows nothing about
  // which module wants which origin, or why.
  //
  // Only these directives, and only https origins - a module cannot widen
  // script-src to 'unsafe-eval', reach a plain-http host, or touch
  // frame-ancestors/base-uri/form-action, which are the directives that keep
  // the site itself from being framed or hijacked. One leading "*." wildcard
  // label is allowed, since several SDKs serve from per-shard subdomains.
  cspOrigins: z.record(
    z.enum(['script', 'style', 'img', 'font', 'connect', 'frame', 'media']),
    z.array(z.string().regex(
      /^https:\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?$/i,
      'cspOrigins entries must be https origins, optionally with one leading *. label'
    ))
  ).optional(),
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
  //
  // `host` moves the panel out of the top-level Settings tab strip and into a
  // named slot another module publishes in its own settings UI. The slot name is
  // an arbitrary string the publishing module documents and reads live from
  // Module.manifest; core has no knowledge of any specific slot name. Core
  // resolves the panel and hands both a merged node and the id/label to the host
  // (see app/cactus-admin/config/page.tsx and lib/modules/hosted-settings.ts). A
  // panel whose host slot no module publishes simply doesn't render, so a `host`
  // pointing at an uninstalled module is inert rather than an error.
  settingsTabs: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    permission: z.string().optional(),
    import: z.string().min(1),
    component: z.string().min(1),
    host: z.string().optional(),
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
  // Lets a module put its own content on a bare top-level slug (/my-post) rather
  // than under publicBasePath (/gazette/my-post). `claimImport`/`claimExport`
  // name a module file exporting `(slug: string) => Promise<boolean>`, asked only
  // after core has failed to find an info page or a module index at that slug, so
  // core content always wins a collision. `page` is the page file rendered when a
  // claim is taken; it receives `params: { slug }` like any other page.
  //
  // Both are loaded lazily by lib/modules/router.ts. The public bare-slug route
  // imports that file statically, so nothing declared here may be eager.
  publicRootSlug: z.object({
    page: z.string().min(1),
    claimImport: z.string().min(1),
    claimExport: z.string().min(1),
  }).optional(),
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
  // Emails this module sends, surfaced in core's single Settings > Emails
  // editor alongside core's own. `import`/`export` name a module file exporting
  // an EmailTemplateDef[] (lib/email/registry.ts); every key in it must be
  // namespaced with this module's own name (`shop.order-confirmed`), which is
  // what stops two modules claiming the same email. `groupLabel` is the heading
  // they sit under in that editor.
  //
  // Collected by scripts/generate-module-email-templates.mjs into
  // lib/modules/email-templates.ts. Modules send through core's
  // sendTemplateEmail(), so an owner's copy edits and the site's wrapper design
  // both apply with nothing further for the module to do.
  emailTemplates: z.object({
    groupLabel: z.string().min(1),
    import: z.string().min(1),
    export: z.string().min(1),
  }).optional(),
  // Text messages this module sends, surfaced in the same style of editor as
  // the emails above - the one an SMS-provider module puts on its own admin
  // page. Identical seam to `emailTemplates`, pointing at an SmsTemplateDef[]
  // (lib/sms/registry.ts), with the same module-namespaced key rule.
  //
  // Collected by scripts/generate-module-sms-templates.mjs into
  // lib/modules/sms-templates.ts. Sending goes through core's sendSmsTemplate(),
  // so an owner's wording edits apply with nothing further for the module to do,
  // and a site with no SMS provider simply sends nothing.
  smsTemplates: z.object({
    groupLabel: z.string().min(1),
    import: z.string().min(1),
    export: z.string().min(1),
  }).optional(),
  // Declarative contributions to the core Members system (see MEMBERS_SPEC.md
  // amendment 5). Pure data, read live from this manifest at request time by
  // core Members code (lib/modules/member-extensions.ts) - no codegen step,
  // since (unlike extensionPoints/settingsTabs) nothing here needs a static
  // component import.
  memberExtensions: z.object({
    activityTypes: z.array(z.object({ type: z.string().min(1), label: z.string().min(1) })).default([]),
    notificationCategories: z.array(z.object({
      category: z.string().min(1),
      label: z.string().min(1),
      // Which ways a member may ask to be told. Defaults to email alone, which
      // is what every category declared before this field existed meant.
      // 'SMS' only appears on the account page when an active module actually
      // has a working SMS provider.
      channels: z.array(z.enum(['EMAIL', 'SMS'])).default(['EMAIL']),
      // A category the member may choose the delivery of but not opt out of -
      // at least one channel must stay switched on. For the things somebody has
      // to be told about (an order they have paid for), not for anything a site
      // would like to send them.
      required: z.boolean().default(false),
    })).default([]),
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
  cookieCategories: z.array(CookieCategorySchema).default([]),
})

export type ThemeManifest = z.infer<typeof ThemeManifestSchema>

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

// The core version a manifest asks for, read straight off the raw JSON without
// validating anything else.
//
// This exists because of the order the two checks have to run in. A module
// written against a newer core can perfectly legitimately use a manifest field
// this core's schema has never heard of - that is what `requiresCoreVersion` is
// FOR - and validating first turns "update Cactus first" into a page of zod
// internals about a field the owner has never seen. Worse, on the update path a
// failed parse was swallowed, which skipped the version gate altogether and let
// an install take a module its build could not compile.
//
// So: ask the raw JSON what it needs before asking the schema whether it is
// well formed. Deliberately tolerant - anything that is not a semver-shaped
// string is treated as "did not say", which lands on the ordinary parse error.
export function readDeclaredCoreVersion(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const value = (raw as { requiresCoreVersion?: unknown }).requiresCoreVersion
  return typeof value === 'string' && /^\d+\.\d+\.\d+/.test(value) ? value : null
}

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
//
// `ref` is the git ref (release tag, branch, or commit sha) to read the manifest
// at. Install and update ship a specific `release.tag`, so they MUST pass that tag
// here - reading the manifest at HEAD instead would validate requiresCoreVersion /
// requiresModules / permissions against unreleased code, not the version actually
// being installed. It defaults to 'HEAD' only for callers that genuinely want the
// latest default-branch manifest.
export async function fetchManifestFromRepo(
  repoUrl: string,
  filename: 'cactus.module.json' | 'cactus.theme.json',
  ref: string = 'HEAD'
): Promise<unknown> {
  const { owner, repo } = parseGitHubRepo(repoUrl)
  const raw = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${filename}`

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

// Human-readable module name for user-facing copy (errors, notifications) - the
// same "cactus-module-foo-bar" -> "Foo Bar" transform the Modules admin page
// uses for its cards, kept here so server-side messages match what the admin
// actually sees instead of leaking the manifest's kebab-case `name` slug.
export function formatModuleDisplayName(repoUrl: string): string {
  const { repo } = parseGitHubRepo(repoUrl)
  return repo
    .replace(/^cactus-module-/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
