# Authoring a theme

> This page is for developers building Cactus themes. If you're looking to customise the appearance of your existing site, see [Appearance and design](Appearance-and-design) instead.

This guide is everything you need to build and ship a working Cactus theme from scratch. If you follow it end to end, you'll have a theme that installs via the admin UI and can be activated without a redeploy.

## What themes control

Themes in Cactus v1 control the **layout and structure for core pages**:

- Info pages (`/<slug>`)
- The public homepage (`/`)
- The public 404 and 500 error pages
- The navigation header and footer

Module-rendered content gets a slot system in a future release. For now, module pages render inside the admin UI only and don't need theme integration.

## The manifest: `cactus.theme.json`

Every theme repo must contain a `cactus.theme.json` at its root:

```json
{
  "name": "Midnight",
  "version": "1.0.0",
  "description": "A dark, high-contrast theme for Cactus Foundation.",
  "author": "Jane Developer",
  "cookieCategories": []
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` (required) | Unique display name. Also used as the folder name (`themes/<name>`). |
| `version` | `string` (required) | Semver, e.g. `1.0.0`. Must match the latest tagged GitHub release. |
| `description` | `string` | Short description shown in the admin Themes page. |
| `author` | `string` | Author name or URL. |
| `cookieCategories` | `string[]` | Non-essential cookie categories this theme uses. Omit or use `[]` if it sets no cookies. |

## Repo structure

```
cactus-theme-midnight/
├── cactus.theme.json          ← manifest (required)
├── components/
│   ├── Layout.tsx             ← root layout component
│   ├── Nav.tsx                ← navigation header
│   └── Footer.tsx             ← footer
├── styles/
│   └── midnight.css           ← theme CSS
└── README.md
```

The component names are a convention, not enforced by the framework. What matters is that the theme exports a layout that the core app can use. In the current implementation, the active theme's `components/Layout.tsx` is imported directly by the app's root layout.

## Component contracts

### Layout.tsx

Must accept and render `children`:

```tsx
type LayoutProps = {
  children: React.ReactNode
  siteName?: string
  privacyPolicySlug?: string | null
  termsSlug?: string | null
}

export default function Layout({ children, siteName, privacyPolicySlug, termsSlug }: LayoutProps) {
  return (
    <div className="midnight-shell">
      <Nav siteName={siteName ?? 'My Site'} />
      <main>{children}</main>
      <Footer siteName={siteName ?? 'My Site'} privacyPolicySlug={privacyPolicySlug} termsSlug={termsSlug} />
    </div>
  )
}
```

### Nav.tsx

```tsx
type NavProps = { siteName: string }
export default function Nav({ siteName }: NavProps) { ... }
```

### Footer.tsx

```tsx
type FooterProps = {
  siteName: string
  privacyPolicySlug?: string | null
  termsSlug?: string | null
}
export default function Footer({ siteName, privacyPolicySlug, termsSlug }: FooterProps) { ... }
```

## Design tokens

Core CSS variables are defined in `app/globals.css` and available to theme CSS:

```css
:root {
  --color-bg: #ffffff;
  --color-fg: #111827;
  --color-muted: #6b7280;
  --color-border: #e5e7eb;
  --color-primary: #16a34a;
  --color-primary-hover: #15803d;
  --color-danger: #dc2626;
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  --radius: 6px;
}
```

Override these in your theme CSS to restyle the whole site consistently.

## Local development

1. Clone your theme repo into the `themes/` directory of a local Cactus install:
   ```bash
   git clone https://github.com/you/cactus-theme-midnight themes/midnight
   ```
2. Create a `Theme` database row pointing at it:
   ```bash
   # In a psql or Prisma Studio session:
   INSERT INTO "Theme" (id, name, version, "isActive", "installedAt")
   VALUES ('dev-midnight', 'midnight', '0.0.1', false, NOW());
   ```
3. Activate it in the admin UI: **Themes → Activate**.
4. Visit the public site to see your theme in action.

Changes to TSX/CSS files hot-reload with `npm run dev`.

## Publishing a release

1. Tag a release on GitHub: `git tag v1.0.0 && git push --tags`
2. Create a GitHub Release for the tag (required — the update flow only considers tagged releases, never raw branch heads).

## The install flow (from author's perspective)

When a Cactus site admin installs your theme:

1. They enter your GitHub repo URL in **Admin → Themes → Install a theme**.
2. Cactus fetches `cactus.theme.json` from the repo's `HEAD`.
3. It finds your latest tagged release and its commit SHA.
4. It commits your repo as a git submodule at `themes/<name>` in the main Cactus repo via the GitHub API.
5. Vercel deploys the commit. Your theme code is now available in the build.

After install, the admin can activate your theme immediately (no redeploy needed for activation).

## Updating your theme

1. Commit and push changes to your theme repo.
2. Tag a new release: `git tag v1.1.0 && git push --tags`
3. Create a GitHub Release for it.
4. The Cactus admin will see "Update available" on the Themes page. They click **Update**.

## Known constraints

- **Public repos only.** The install flow fetches the manifest and submodule from GitHub without authentication (or with a read-only token). Private repos are not supported.
- **No shelling out to git.** The install works via the GitHub REST API. This is a Vercel platform constraint — serverless functions run on an ephemeral, read-only filesystem.
- **Activating a theme is live and immediate**, no preview-before-activating flow. Plan accordingly.
- **The module-content slot system is not yet available.** Module admin pages don't use the theme; public-facing module content will be integrated via slots in a future release.

## Minimal complete example

Here's a complete minimal theme you can copy-paste as a starting point:

**`cactus.theme.json`:**
```json
{
  "name": "Minimal",
  "version": "1.0.0",
  "description": "A bare-bones Cactus theme for demonstration.",
  "author": "You",
  "cookieCategories": []
}
```

**`components/Layout.tsx`:**
```tsx
import Nav from './Nav'
import Footer from './Footer'

export default function Layout({
  children,
  siteName = 'My Site',
  privacyPolicySlug,
  termsSlug,
}: {
  children: React.ReactNode
  siteName?: string
  privacyPolicySlug?: string | null
  termsSlug?: string | null
}) {
  return (
    <>
      <Nav siteName={siteName} />
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1rem' }}>
        {children}
      </main>
      <Footer siteName={siteName} privacyPolicySlug={privacyPolicySlug} termsSlug={termsSlug} />
    </>
  )
}
```

**`components/Nav.tsx`:**
```tsx
import Link from 'next/link'
export default function Nav({ siteName }: { siteName: string }) {
  return (
    <header style={{ borderBottom: '1px solid #e5e7eb', padding: '1rem' }}>
      <Link href="/" style={{ fontWeight: 700, textDecoration: 'none', color: 'inherit' }}>
        {siteName}
      </Link>
    </header>
  )
}
```

**`components/Footer.tsx`:**
```tsx
import Link from 'next/link'
export default function Footer({
  siteName,
  privacyPolicySlug,
  termsSlug,
}: {
  siteName: string
  privacyPolicySlug?: string | null
  termsSlug?: string | null
}) {
  return (
    <footer style={{ borderTop: '1px solid #e5e7eb', padding: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
      <span>© {new Date().getFullYear()} {siteName}</span>
      {privacyPolicySlug && <Link href={`/${privacyPolicySlug}`} style={{ marginLeft: '1rem' }}>Privacy</Link>}
      {termsSlug && <Link href={`/${termsSlug}`} style={{ marginLeft: '1rem' }}>Terms</Link>}
    </footer>
  )
}
```

That's a complete, working theme. Tag it, create a GitHub Release, and it can be installed in any Cactus site.

---

**Wiki:** [Home](Home) · [Getting started](Getting-started) · [Running locally](Running-locally) · [Architecture overview](Architecture-overview) · [Authoring a module](Authoring-a-module) · [Authoring a theme](Authoring-a-theme) · [Self-hosting and operations](Self-hosting-and-operations)
