// ---------------------------------------------------------------------------
// Admin command-palette search index.
//
// The sidebar search (⌘K) knows about every top-level nav destination for free
// (those come from the resolved nav sections). This registry adds everything the
// nav can't see: individual Settings tabs, the sections inside them, and the key
// controls a site owner actually goes looking for ("backup", "SMTP", "roles",
// "cookie banner", "reset database"). Each entry deep-links straight to its spot
// via a query param (which tab) and/or a hash (which section on that tab); the
// destination page switches to the tab and scrolls the matching anchor into view.
//
// Framework-agnostic (no React) so it can be unit-tested and shared. Adding a new
// searchable setting is one entry here plus a matching `id="…"` anchor on the page.
//
// KEEP IN SYNC: every `path` hash below must correspond to an element `id` that the
// relevant admin page actually renders, or the jump lands at the top of the page.
// ---------------------------------------------------------------------------

export type AdminSearchEntry = {
  /** Stable, unique id (used as the React key and for dedupe). */
  id: string
  /** Primary label shown in the results list. */
  label: string
  /** Breadcrumb-style context shown as the muted hint, e.g. "Settings › General". */
  section: string
  /**
   * Admin-relative destination, including any query and hash, e.g.
   * "/config?tab=email#email-test". The palette prefixes the site's admin path.
   */
  path: string
  /**
   * Extra terms that should match this entry even though they aren't in the label
   * (synonyms, the underlying jargon, provider names). Lower-weighted than the label.
   */
  keywords?: string[]
  /**
   * Base nav path this entry lives under (e.g. "/config", "/appearance"). The entry
   * is only offered when that page is visible in the user's sidebar, so search never
   * links someone to a screen their role can't open. Omit for always-available pages.
   */
  requires?: string
}

// A short group of "these all belong to the same tab" shares one section label and
// requires value, so the table below stays readable.
const S = {
  general: 'Settings › General',
  email: 'Settings › Email',
  media: 'Settings › Media & storage',
  gdpr: 'Settings › GDPR & Legal',
  integrations: 'Settings › Integrations',
  users: 'Settings › Users',
  nav: 'Settings › Navigation',
  styles: 'Appearance › Styles',
  appearance: 'Appearance',
} as const

export const ADMIN_SEARCH_ENTRIES: AdminSearchEntry[] = [
  // ── Settings: the tabs themselves ──────────────────────────────────────────
  { id: 'tab-general', label: 'General settings', section: 'Settings', path: '/config?tab=general', requires: '/config', keywords: ['basics', 'site details'] },
  { id: 'tab-email', label: 'Email settings', section: 'Settings', path: '/config?tab=email', requires: '/config', keywords: ['mail', 'smtp', 'brevo', 'sender'] },
  { id: 'tab-media', label: 'Media & storage settings', section: 'Settings', path: '/config?tab=media', requires: '/config', keywords: ['storage', 'uploads', 'provider', 'images', 's3', 'r2', 'bucket'] },
  { id: 'tab-gdpr', label: 'GDPR & Legal', section: 'Settings', path: '/config?tab=gdpr', requires: '/config', keywords: ['consent', 'cookies', 'privacy', 'legal', 'data protection'] },
  { id: 'tab-integrations', label: 'Integrations', section: 'Settings', path: '/config?tab=integrations', requires: '/config', keywords: ['github', 'sentry', 'turnstile', 'neon', 'webhook', 'connections', 'api keys'] },
  { id: 'tab-users', label: 'User & member settings', section: 'Settings', path: '/config?tab=users', requires: '/config', keywords: ['members', 'registration', 'accounts'] },
  { id: 'tab-navigation', label: 'Navigation & menu editor', section: 'Settings', path: '/config?tab=navigation', requires: '/config', keywords: ['sidebar', 'menu', 'reorder', 'rename', 'admin menu'] },

  // ── General tab sections ───────────────────────────────────────────────────
  { id: 'general-updates', label: 'Core updates & release channel', section: S.general, path: '/config?tab=general#general-updates', requires: '/config', keywords: ['update', 'upgrade', 'version', 'beta', 'release notes'] },
  { id: 'general-identity', label: 'Site name, tagline & description', section: S.general, path: '/config?tab=general#general-identity', requires: '/config', keywords: ['title', 'brand', 'name', 'strapline'] },
  { id: 'general-homepage', label: 'Homepage & main menu', section: S.general, path: '/config?tab=general#general-homepage', requires: '/config', keywords: ['home page', 'front page', 'header menu'] },
  { id: 'general-status', label: 'Site status (live / coming soon / maintenance)', section: S.general, path: '/config?tab=general#general-status', requires: '/config', keywords: ['maintenance', 'coming soon', 'offline', 'take down', 'publish'] },
  { id: 'general-seo', label: 'Hide from search engines', section: S.general, path: '/config?tab=general#general-seo', requires: '/config', keywords: ['noindex', 'crawlers', 'robots', 'seo', 'google'] },
  { id: 'general-locale', label: 'Timezone, date & time format', section: S.general, path: '/config?tab=general#general-locale', requires: '/config', keywords: ['timezone', 'time zone', 'date format', 'locale', 'clock'] },
  { id: 'general-admin-path', label: 'Admin path & trusted-browser login', section: S.general, path: '/config?tab=general#general-admin-path', requires: '/config', keywords: ['admin url', 'login path', 'slug', 'trust device', 'remember me', 'otp'] },
  { id: 'general-backup', label: 'Download a backup', section: S.general, path: '/config?tab=general#general-backup', requires: '/config', keywords: ['backup', 'export', 'download', 'save database', 'sql'] },
  { id: 'general-restore', label: 'Restore from a backup', section: S.general, path: '/config?tab=general#general-restore', requires: '/config', keywords: ['restore', 'import', 'upload backup', 'recover'] },
  { id: 'general-reset-db', label: 'Reset database', section: `${S.general} › Danger zone`, path: '/config?tab=general#general-danger', requires: '/config', keywords: ['reset', 'wipe', 'delete everything', 'danger zone', 'factory reset', 'start over'] },
  { id: 'general-reset-all', label: 'Reset everything (environment variables)', section: `${S.general} › Danger zone`, path: '/config?tab=general#general-danger', requires: '/config', keywords: ['reset everything', 'danger zone', 'env vars', 'factory settings'] },

  // ── Email tab sections ─────────────────────────────────────────────────────
  { id: 'email-provider', label: 'Email provider (Brevo / SMTP) credentials', section: S.email, path: '/config?tab=email#email-provider', requires: '/config', keywords: ['brevo', 'smtp', 'mail server', 'from address', 'sender'] },
  { id: 'email-test', label: 'Send a test email', section: S.email, path: '/config?tab=email#email-test', requires: '/config', keywords: ['test email', 'check email', 'try email'] },

  // ── Media tab sections ─────────────────────────────────────────────────────
  { id: 'media-provider', label: 'Storage provider', section: S.media, path: '/config?tab=media#media-provider', requires: '/config', keywords: ['s3', 'r2', 'cloudflare', 'bunny', 'vercel blob', 'bucket', 'cdn', 'switch provider', 'migrate media'] },

  // ── GDPR tab sections ──────────────────────────────────────────────────────
  { id: 'gdpr-legal', label: 'Privacy policy & terms pages', section: S.gdpr, path: '/config?tab=gdpr#gdpr-legal', requires: '/config', keywords: ['privacy policy', 'terms of service', 'legal pages'] },
  { id: 'gdpr-retention', label: 'Data retention (session & recovery purge)', section: S.gdpr, path: '/config?tab=gdpr#gdpr-retention', requires: '/config', keywords: ['retention', 'purge', 'sessions', 'recovery', 'delete after'] },
  { id: 'gdpr-banner', label: 'Cookie consent banner', section: S.gdpr, path: '/config?tab=gdpr#gdpr-banner', requires: '/config', keywords: ['cookies', 'consent', 'banner', 'categories', 'cookie notice'] },
  { id: 'privacy-generator', label: 'Privacy policy generator', section: S.gdpr, path: '/config/privacy-generator', requires: '/config', keywords: ['generate privacy policy', 'gdpr', 'legal'] },

  // ── Integrations tab sections ──────────────────────────────────────────────
  { id: 'integrations-github', label: 'GitHub App connection', section: S.integrations, path: '/config?tab=integrations#integrations-github', requires: '/config', keywords: ['github', 'repository', 'deploy', 'updates', 'personal access token', 'pat'] },
  { id: 'integrations-edge', label: 'Edge Config', section: S.integrations, path: '/config?tab=integrations#section-edge-config', requires: '/config', keywords: ['edge config', 'vercel', 'fast reads'] },
  { id: 'integrations-turnstile', label: 'Cloudflare Turnstile (bot protection)', section: S.integrations, path: '/config?tab=integrations#section-turnstile', requires: '/config', keywords: ['turnstile', 'captcha', 'bot protection', 'spam'] },
  { id: 'integrations-webhook', label: 'Vercel deployment webhooks', section: S.integrations, path: '/config?tab=integrations#section-webhook', requires: '/config', keywords: ['webhook', 'deployment status', 'vercel'] },
  { id: 'integrations-sentry', label: 'Sentry error reporting', section: S.integrations, path: '/config?tab=integrations#section-sentry', requires: '/config', keywords: ['sentry', 'errors', 'logging', 'monitoring'] },
  { id: 'integrations-neon', label: 'Neon database provisioning', section: S.integrations, path: '/config?tab=integrations#section-neon', requires: '/config', keywords: ['neon', 'database', 'postgres', 'provisioning'] },

  // ── Users settings sub-tabs ────────────────────────────────────────────────
  { id: 'users-registration', label: 'Registration settings', section: S.users, path: '/config?tab=users&sub=registration', requires: '/config', keywords: ['sign up', 'registration', 'members', 'open registration'] },
  { id: 'users-avatars', label: 'Avatars', section: S.users, path: '/config?tab=users&sub=avatars', requires: '/config', keywords: ['avatar', 'profile picture', 'gravatar'] },
  { id: 'users-usernames', label: 'Usernames', section: S.users, path: '/config?tab=users&sub=usernames', requires: '/config', keywords: ['username', 'handle', 'display name'] },
  { id: 'users-account-sections', label: 'Account sections', section: S.users, path: '/config?tab=users&sub=sections', requires: '/config', keywords: ['account page', 'profile sections'] },
  { id: 'users-access', label: 'Access control', section: S.users, path: '/config?tab=users&sub=access', requires: '/config', keywords: ['access', 'restrict', 'membership'] },
  { id: 'users-roles', label: 'Roles & permissions', section: S.users, path: '/config?tab=users&sub=roles', requires: '/config', keywords: ['roles', 'permissions', 'capabilities', 'access rights'] },
  { id: 'users-email-templates', label: 'Email templates', section: S.users, path: '/config?tab=users&sub=email-templates', requires: '/config', keywords: ['email template', 'welcome email', 'verification email', 'notification email'] },

  // ── Appearance / Styles ────────────────────────────────────────────────────
  { id: 'appearance-design', label: 'Header & footer design', section: S.appearance, path: '/appearance', requires: '/appearance', keywords: ['header', 'footer', 'layout', 'design', 'site chrome'] },
  { id: 'styles-branding', label: 'Branding (logo, favicon, app icons)', section: S.styles, path: '/appearance/styles?tab=branding', requires: '/appearance', keywords: ['logo', 'favicon', 'app icon', 'brand', 'pwa icon'] },
  { id: 'styles-colours', label: 'Colours', section: S.styles, path: '/appearance/styles?tab=colours', requires: '/appearance', keywords: ['colour', 'color', 'palette', 'theme', 'primary colour', 'links'] },
  { id: 'styles-typography', label: 'Typography & fonts', section: S.styles, path: '/appearance/styles?tab=typography', requires: '/appearance', keywords: ['font', 'typeface', 'typography', 'google fonts', 'text'] },
  { id: 'styles-headings', label: 'Headings', section: S.styles, path: '/appearance/styles?tab=headings', requires: '/appearance', keywords: ['heading', 'h1', 'h2', 'titles'] },
  { id: 'styles-buttons', label: 'Buttons', section: S.styles, path: '/appearance/styles?tab=buttons', requires: '/appearance', keywords: ['button', 'cta', 'radius'] },
  { id: 'styles-images', label: 'Images', section: S.styles, path: '/appearance/styles?tab=images', requires: '/appearance', keywords: ['image', 'rounded corners', 'aspect ratio'] },
  { id: 'styles-form-fields', label: 'Form fields', section: S.styles, path: '/appearance/styles?tab=formFields', requires: '/appearance', keywords: ['form', 'input', 'field', 'textbox'] },
  { id: 'styles-spacing', label: 'Spacing', section: S.styles, path: '/appearance/styles?tab=spacing', requires: '/appearance', keywords: ['spacing', 'padding', 'margin', 'gap', 'density'] },

  // ── Layouts ────────────────────────────────────────────────────────────────
  { id: 'layouts-status', label: 'Status page layouts', section: 'Layouts', path: '/layouts?type=statusPage', requires: '/layouts', keywords: ['coming soon page', 'maintenance page', 'status page'] },

  // ── Personal / always-available ────────────────────────────────────────────
  { id: 'account', label: 'Your account & security', section: 'Account', path: '/account', keywords: ['profile', 'password', 'passkey', 'security', 'my account', 'change email'] },
  { id: 'notifications', label: 'Notifications', section: 'Account', path: '/notifications', keywords: ['alerts', 'inbox', 'deploy status'] },
]
