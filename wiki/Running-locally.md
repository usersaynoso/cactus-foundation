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

## Developing a module that is not in modules.json

The generators that wire modules into the app (`scripts/generate-all.mjs`, run by
`npm run dev` and `npm run typecheck`) only wire modules listed in the tracked
`modules.json`. A directory under `modules/` that is not listed is skipped with
`ignoring N module dir(s) not in modules.json`.

To work on a module that isn't listed - a private one, or one you haven't released
yet - put its code under `modules/<name>/` and list it in **`modules.local.json`** at
the repo root, rather than editing `modules.json`:

```json
{ "modules": [{ "name": "my-module" }] }
```

- **Gitignored.** It never reaches a commit, a release or an install, so a private
  module's name cannot leak into core's public registry by accident.
- **Same shape as `modules.json`**, but only `name` is read. A listed name with no
  directory on disk is ignored, as it would be in `modules.json`.
- **Adds, never replaces.** Everything in `modules.json` is still wired. A malformed
  file is reported (`modules.local.json could not be read ... ignoring it`) and
  ignored; it can never cost you the real registry.
- **Development only.** `scripts/checkout-modules.mjs` never reads it, so nothing is
  cloned, reset or deleted on its say-so. Any build ignores it too:
  `scripts/prebuild.mjs` sets `CACTUS_IGNORE_LOCAL_MODULES=1`, so `npm run build` wires
  exactly what `modules.json` pins, as an install would. You can set the same variable
  yourself to check what the app looks like without your local modules.
- **No file, no change.** Without it, everything behaves exactly as before.

The module still needs its own `Module` row and migrations in your local database -
see [Authoring a module](Authoring-a-module#local-development-loop).

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

## Before you commit: the secret scan

Credentials never go in a tracked file. They belong in the deployment
environment (`.env.local` locally, which git ignores) or in the encrypted
settings the admin stores in the database. Cactus checks this in three places:

- **On every commit**, once you switch the hook on for your checkout:

  ```bash
  npm run hooks:install
  ```

  The pre-commit hook scans exactly what you are about to commit and refuses
  the commit if it finds a token, a private key, a password inside a URL, or a
  file that should never be tracked (`.env`, `.env.local`, Claude Code's
  `.claude/settings.json` and `.claude/settings.local.json`, SSH private keys).
- **In `npm test`**, which scans every tracked file, so a key already in the
  tree fails the suite.
- **By hand**, whenever you like:

  ```bash
  npm run check:secrets
  ```

  `node scripts/check-secrets.mjs --history` scans every line ever added to the
  repository, and `--root <dir>` points it at another repository, such as a
  module's own checkout.

The scan never prints the value it found, only a short redacted preview.

GitHub provides a fourth check, on its side of the push. Secret scanning and
push protection are switched on for the core repository and for every
repository in the `cactus-foundation-modules` organisation, new ones included,
so a push that contains a recognised provider token is refused even if it got
past everything here.

If it flags a real credential, take it out, and **rotate it**: once something
has been committed, assume it has been seen. If it flags a deliberate fake (a
published test vector, a dummy key in a test fixture), put the marker
`secret-scan: allow` in a comment on that line or the line above, so that the
exception is visible in review. There is no switch that turns the scan off.

Watch out for Claude Code in particular. Its "always allow" permission rules
save the entire command line, so running `SOME_TOKEN=... some-command` once
leaves the token sitting in `.claude/settings.json`. Both settings files are in
`.gitignore` for that reason. Read credentials from a file or the environment
inside the command rather than typing them on it.

## Not a self-hosting target

Local mode is a development convenience. It does not write `.env.local` at runtime,
does not rebuild on update, and is not intended as a production self-hosting setup.
For production, deploy to Vercel and use the standard setup flow.

---

**Wiki:** [Home](Home) · [Getting started](Getting-started) · [Running locally](Running-locally) · [Architecture overview](Architecture-overview) · [Authoring a module](Authoring-a-module) · [Authoring a theme](Authoring-a-theme) · [Self-hosting and operations](Self-hosting-and-operations)
