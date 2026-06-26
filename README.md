<p align="center">
  <img src="cactus.svg" width="160" alt="Cactus CMS" />
</p>

<center>#Cactus CMS</center>

> **A minimal, extensible, fast, and themeable CMS built on Next.js 16.**
> Tough on the outside, surprisingly welcoming inside. Thrives on neglect. Will not die.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## What even is this?

Cactus is a content management system — the thing that lets you run a website where you can write posts, manage users, upload images, and generally feel like you're in charge of the internet, without needing to remember which folder you put the PHP in.

Unlike most CMS platforms that arrive at your door carrying seventeen cookbooks, a sourdough starter, and opinions about your CSS, Cactus is deliberately small. It does the fundamentals — authentication, content pages, user management, configuration, themes — and then gets out of your way. Want forums? Add a module. Want a fancy homepage design? Swap a theme. Want to argue about semicolons? This is JavaScript, you'll find your people.

**The core philosophy, in one sentence:** ship only what you need, add the rest as extensions, and never make the wrong defaults someone else's problem.

---

## Features that'll make you smile (or at least nod approvingly)

### 🔑 Passkeys — the future, actually
Forget passwords. Cactus uses **passkeys** (Face ID, fingerprint, hardware security key) as the primary login method. You set yours up during the five-minute setup wizard. The password+email fallback exists for people who genuinely enjoy typing `Tr0ub4dor&3` into things, but it's not the star of the show.

### 🤫 A secret admin URL
Your admin panel lives at a secret path you choose — something like `/lemon-4f8a2c`. Everyone else gets a plain, boring 404. No guessing, no brute-forcing, no "nice WordPress install you got there." The path is stored encrypted, mirrored to Vercel Edge Config, and checked on every request before the server even thinks about letting anyone through.

### 🚀 One-click database creation
Don't have a database? Fine. If you drop in a Neon API key, Cactus will create one for you during setup, wire up the connection string automatically, and wait patiently while your app redeploys to pick up the new credentials. It will not pretend the database appeared by magic — it honestly tells you "sit tight, this takes a minute or two" — because it respects you enough not to lie.

### 🎨 Themes that don't require a PhD
The bundled **Prickly** theme is clean, fast, and requires zero configuration. Installing a different theme is one GitHub URL away. Activating it is one button click. No file editing. No cache clearing. No ritual sacrifice to the CSS gods.

### 🧩 Modules (optional superpowers)
Forums, comments, e-commerce, job boards — these are separate modules you add only if you actually want them. They live as git submodules, install via the GitHub API, and run their own database migrations during the next build. The core never knows or cares what's in them. They can't break each other because they each have their own database table prefix.

### 📸 Media that doesn't cost a fortune
Images are stored in a private Backblaze B2 bucket and served through a Cloudflare Worker — **not** through your Vercel functions. This matters because Vercel charges for function runtime, and serving a 10 MB hero image through a serverless function 50,000 times a day adds up fast. The Cloudflare Worker handles resizing, caching, and delivery for fractions of a penny. Your wallet will thank you.

### 🔐 Security that earns its keep
- **Content Security Policy** headers on every response
- **HTTP Strict Transport Security** (with preload)
- **Rate limiting** on every auth endpoint, keyed by both IP and account
- **Pwned Passwords check** during registration (if your password has appeared in a data breach, you'll know)
- **Session database backing** — not JWTs, meaning if you suspend a user, they're out immediately, not "out in however long until the token expires"
- **CSRF protection** via `SameSite=Lax` cookies + origin checking

### 📋 GDPR bits done properly
Users can export their data (one button, JSON download), delete their account (with a "are you really sure" step), and the site keeps a proper privacy policy and terms of service linked in the footer. The last admin cannot delete themselves — the code literally stops them. Democracy dies in darkness; Cactus dies with one admin.

### 🧭 Setup wizard you'll actually finish
Five steps. Roughly five minutes. No YAML files. No config arrays with seventeen nested keys. You pick your admin path, register your passkey, enter a site name, save the recovery code that lets you back in if you forget everything, and you're done. The dashboard looks welcoming. The banner shows you what's still unconfigured. Everything from that point is self-explanatory.

---

## Technology stack (for the curious)

You don't need to know this to use Cactus, but if you're the kind of person who likes to look under the hood before buying the car:

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 16 (App Router) | Handles routing, server components, and builds in one package |
| Language | TypeScript (strict) | Catches mistakes before they escape into the wild |
| Database | PostgreSQL via Prisma ORM | Boring in the best possible way |
| Auth | Passkeys via `@simplewebauthn` | WebAuthn, properly done |
| Sessions | Database-backed | Revokable immediately, no token expiry nonsense |
| Media | Backblaze B2 + Cloudflare Worker | Cheap storage, fast delivery |
| Hosting | Vercel (required) | The deployment, Edge Config, and webhook integrations are built around it |
| CSS | Yours to decide | The core ships no UI framework; themes supply their own styles |

---

## Getting started

### What you'll need before you begin

- A [Vercel](https://vercel.com) account (Hobby plan is fine)
- `Node.js 22+` installed locally (for development)
- A database — either a free [Neon](https://neon.tech) account (Cactus can create one for you), or any PostgreSQL connection string you already have
- `npm` — not `yarn`, not `pnpm`. Just `npm`. The repo enforces this.

### Step 1: Deploy to Vercel

```bash
# Clone the repo
git clone https://github.com/usersaynoso/cactus.git my-site
cd my-site
```

Import the project in your Vercel dashboard (it's a drag to the dashboard or a `vercel` CLI command). Before the first deploy, add these environment variables in Vercel's project settings:

| Variable | How to get it |
|----------|---------------|
| `SESSION_SECRET` | Run `openssl rand -base64 32` in your terminal |
| `SITE_URL` | Your domain, e.g. `https://example.com` |
| `NEXT_PUBLIC_SITE_URL` | Same as above |
| `VERCEL_API_TOKEN` | Vercel dashboard → Account Settings → Tokens |
| `VERCEL_PROJECT_ID` | Vercel dashboard → your project → Settings → General |

**Optional but recommended for zero-effort setup:**

| Variable | What it unlocks |
|----------|-----------------|
| `NEON_API_KEY` | Cactus creates your database for you. Get one at [console.neon.tech](https://console.neon.tech) → Account Settings → API keys |

### Step 2: Deploy and run the wizard

Deploy. Vercel builds the app. Visit your production URL. You'll be redirected to `/_setup`.

The wizard walks you through five steps:

1. **Environment check** — if you left `DATABASE_URL` out, you'll see a button to have it created automatically (if you added `NEON_API_KEY`), or instructions to paste one in yourself.
2. **Admin account** — enter your name and email, then register a passkey. Your device biometrics become your login. No password required at this step.
3. **Admin path** — pick a secret URL prefix for your admin area. The wizard suggests something like `lemon-4f8a2c`. Keep it. Or invent your own. Don't tell anyone.
4. **Site essentials** — site name and timezone.
5. **Recovery code** — a one-time offline code displayed **once**. Copy it into your password manager or write it on a Post-it and tape it to the back of your monitor. (That second option isn't recommended, but it's better than nothing.)

Click "I've saved it." Setup is complete. You're in.

### Step 3: Go live when you're ready

The site starts in "coming soon" mode. Add some content, configure the optional features at your own pace, then flip the status to **Live** in Settings → Site Status.

---

## Optional features (configure when needed)

Everything below is disabled until you add the relevant credentials. The admin dashboard shows a banner for each unconfigured item.

### Email (enables password login, account recovery, email verification)
Provide either:
- **Brevo**: add `BREVO_API_KEY`
- **SMTP**: add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`

### Image uploads (enables the media library)
1. Create a private bucket at [Backblaze B2](https://www.backblaze.com/cloud-storage)
2. Deploy a Cloudflare Worker using the config in `workers/media-worker/` (it proxies images from B2 to browsers)
3. Add `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_ENDPOINT`, `CLOUDFLARE_WORKER_URL`, `CLOUDFLARE_WORKER_HOSTNAME`

### Module and theme installs (enables the extension marketplace)
1. Create a GitHub personal access token with `repo` scope
2. Add `GITHUB_API_TOKEN` and `GITHUB_REPO` (format: `owner/repo`, your Cactus repo)

### Bot protection on public forms
1. Create a [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) site
2. Add `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`

---

## Local development

```bash
# Install dependencies
npm install

# Copy the example env file and fill it in
cp .env.example .env.local

# Create the database schema (run once per migration)
npm run db:migrate

# Start the dev server
npm run dev
```

The app runs at `http://localhost:3000`. The setup wizard appears automatically if no database is set up yet.

Passkeys work on `localhost` because Cactus has a development carve-out that sets the WebAuthn relying party ID to `localhost` automatically. No extra configuration needed.

---

## Project structure (the 30-second tour)

```
/
├── app/                    Next.js pages and API routes
│   ├── _cactus_admin/      Admin panel (reachable only via your secret path)
│   ├── _setup/             Setup wizard (vanishes after first use)
│   ├── _status/            Coming-soon and maintenance pages
│   └── [slug]/             Public info pages (your content)
│
├── lib/                    All the business logic
│   ├── auth/               Passkeys, sessions, passwords, rate limiting, recovery
│   ├── config/             Environment vars, Edge Config, site settings
│   ├── media/              Upload, serve, validate images
│   ├── modules/            GitHub API, module manifests, migrations runner
│   └── permissions/        Role checks, admin short-circuit, privilege guards
│
├── themes/prickly/         The bundled theme. Clean. Fast. Yours to customise.
├── workers/media-worker/   Cloudflare Worker — serves your images without billing Vercel
├── scripts/                Build-time module migration runner
├── prisma/                 Database schema (the canonical source of truth)
└── wiki/                   The full documentation, in Markdown
```

---

## Documentation

The `/wiki` folder contains the full documentation:

- **[Home](wiki/Home.md)** — overview and philosophy
- **[Getting started](wiki/Getting-started.md)** — prerequisites, deploy, setup wizard in depth
- **[Architecture overview](wiki/Architecture-overview.md)** — how everything hangs together
- **[Configuration reference](wiki/Configuration-reference.md)** — every setting and what it does
- **[Authoring a theme](wiki/Authoring-a-theme.md)** — build and publish your own theme
- **[Authoring a module](wiki/Authoring-a-module.md)** — build and publish your own module
- **[Self-hosting and operations](wiki/Self-hosting-and-operations.md)** — backups, recovery, monitoring

---

## A note on migrations (important, non-negotiable, pinky-promise important)

Cactus has one hard rule about databases: **schema migrations only ever run during a Vercel build, never from the running app.**

The `build` script is:
```
prisma migrate deploy && node scripts/run-module-migrations.mjs && next build
```

That's it. No "run migrations on startup." No "apply schema from an API route." This is not laziness — it's how the system guarantees consistency. A half-applied migration that fired from a live serverless function is the kind of thing that ruins Tuesday afternoons. We don't do that here.

If you're extending Cactus or authoring a module: write `.sql` files, put them in `migrations/`, and let the build runner handle them. The wiki explains the full convention.

---

## Contributing

Cactus is early. Contributions welcome. The sensible starting points:

1. Read `AGENTS.md` — it's the build discipline document. Contributions should follow the same loop: update `PROGRESS.md`, run typecheck, verify the checklist, commit with a proper message.
2. Open an issue before writing a large feature. Not because we're gatekeeping, but because duplicate effort is sad.
3. Modules and themes are the encouraged extension points. New core features need a good reason.

---

## Frequently asked questions that nobody has asked yet but someone definitely will

**Q: Can I run this without Vercel?**
A: Technically yes — it's a Next.js app with a PostgreSQL database. But the Edge Config integration, deployment webhooks, and module installation via the GitHub API are all wired around Vercel. If you self-host on something else, those features need re-wiring. Nothing is impossible; some things are just more work than they're worth.

**Q: Why can't I use `pnpm`?**
A: Because the repo says `npm` and consistency is a virtue. The lock file is `package-lock.json`. Using a different package manager in the same project is how you end up with subtle version drift and an afternoon debugging something that should have been obvious.

**Q: What happens if I forget my passkey AND my recovery code?**
A: There's a procedure involving a database connection, a `bcrypt` hash, and a temporary password. It's in [Self-hosting and operations](wiki/Self-hosting-and-operations.md) under "Completely locked out." It's not fun, but it exists. Which is another argument for saving the recovery code somewhere sensible.

**Q: Is this production-ready?**
A: Version 0.1, so: it's solid, the security model is real, and the tests cover the critical paths. But you're also running a new project built by humans who drink coffee and miss edge cases. Keep backups. Read the operations guide. Tell us when something breaks.

**Q: Why "Cactus"?**
A: It's low-maintenance, it has sharp edges where it needs them, it's surprisingly resilient, and the bundled theme is called Prickly. The metaphor writes itself.

---

## License

MIT. Take it, use it, sell things with it, tell your friends. A mention is appreciated but not required.

---

*Built with stubbornness, strong opinions, and an unreasonable fondness for TypeScript strict mode.*
