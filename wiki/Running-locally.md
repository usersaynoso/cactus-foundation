# Running locally (local-development mode)

> This page is for developers running Cactus on their own machine. If you're managing a live site, see the [site owner guides](Home) instead.

Cactus is built to run on Vercel, but it also runs cleanly on your own machine for
local development. When it detects that it is not on Vercel, it switches into
**local-development mode**: it skips the Vercel control plane entirely and reads its
configuration from `.env.local` instead.

## How local mode is detected

Vercel injects `VERCEL=1` into both the build and the runtime environment. It is
never set on localhost. Cactus uses its **absence** as the signal:

```ts
// lib/config/env.ts
export function isLocalMode(): boolean {
  return process.env.VERCEL !== '1'
}
```

This is computed server-side. A real Vercel deployment that simply hasn't had its
API token connected yet still has `VERCEL=1`, so it is never mistaken for local - it
keeps the normal Vercel setup flow.

## Quick start

```bash
git clone https://github.com/usersaynoso/cactus-foundation.git my-site
cd my-site
npm install
cp .env.example .env.local
```

Then set these in `.env.local` and leave the `VERCEL_*` variables unset:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Your local Postgres URL, or a Neon dev-branch pooled URL |
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `SITE_URL` | `http://localhost:3000` |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` (must match `SITE_URL`) |

Apply the schema and start the dev server:

```bash
npm run db:migrate
npm run dev
```

Open http://localhost:3000. With an empty database you'll be redirected to the setup
wizard. In local mode the wizard **skips the "Connect your project" Vercel step** and
goes straight to the database step, which expects `DATABASE_URL` to already be present
in `.env.local`. Passkeys work on localhost (the WebAuthn relying party ID is hardcoded
to `localhost` in development), so you can register one and land in the admin.

## What is degraded in local mode

Local mode is for development, not production self-hosting. Because there is no Vercel
project to write env vars to and no redeploy mechanism, several admin features change:

| Area | Behaviour locally |
|------|-------------------|
| **Setup wizard** | The Vercel connect step is skipped. `DATABASE_URL` must be set in `.env.local` (no Neon auto-provisioning, no "save to Vercel & redeploy"). |
| **Environment editor** (Settings → Email / Media / Integrations) | Read-only. Values are shown as set/not-set, but you change them by editing `.env.local` and restarting. The write API rejects in local mode. |
| **Reset Everything** (Settings → General → Danger zone) | Hidden - it only deletes Vercel env vars. **Reset Database** still works. |
| **Core updates** (Settings → General) | Hidden; replaced with a note. Update by pulling the latest Cactus release and redeploying. |
| **Module updates** (Modules) | The per-module **Update** button is hidden; the update/deploy API rejects in local mode. Enable/disable still work. |
| **Redeploy now** (Notifications) | Hidden - there is nothing to redeploy locally. |
| **Edge Config** | Not used; admin path and site status fall back to a direct Prisma read (this is already the default when `EDGE_CONFIG` is unset). |
| **Media uploads** | Disabled until you configure a storage provider. Any S3-compatible provider (R2, B2, S3, Spaces, Wasabi, MinIO, Supabase) works locally by setting its env vars in `.env.local`. A local-disk provider is not built in. |

Everything else - content, pages, layouts, menus, the visual editors, roles and
permissions, passkeys - works exactly as it does on Vercel.

## Not a self-hosting target

Local mode is a development convenience. It does not write `.env.local` at runtime,
does not rebuild on update, and is not intended as a production self-hosting setup.
For production, deploy to Vercel and use the standard setup flow.

---

**Wiki:** [Home](Home) · [Getting started](Getting-started) · [Running locally](Running-locally) · [Architecture overview](Architecture-overview) · [Authoring a module](Authoring-a-module) · [Authoring a theme](Authoring-a-theme) · [Self-hosting and operations](Self-hosting-and-operations)
