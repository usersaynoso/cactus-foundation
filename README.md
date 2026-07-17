<p align="center">
  <img src="cactus.svg" width="160" alt="Cactus Foundation" />
</p>

<h1 align="center">Cactus Foundation</h1>

> **Tough on the outside. Thrives on neglect. Refuses to die.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[![Deploy latest release](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/usersaynoso/cactus-foundation/tree/v0.5.208)
[![Deploy latest pre-release (beta)](https://img.shields.io/badge/Deploy-latest%20beta-black?logo=vercel)](https://vercel.com/new/clone?repository-url=https://github.com/usersaynoso/cactus-foundation)

The first button deploys the latest stable release. The second deploys straight off `main`, which is usually a day or two ahead but hasn't had a stable tag cut yet - expect the odd rough edge.

---

## What is it?

Cactus Foundation is a web application platform that gives you everything you need to run a proper website - pages, menus, users, media, and a visual drag-and-drop page editor - without requiring you to understand what any of those words mean at a technical level. You click buttons. Things happen. The website works.

It is deliberately small. Unlike most website platforms that arrive at your door with seventeen cookbooks, strong opinions about your fonts, and a six-week onboarding course, Cactus ships only what you need. Want forums? Add a module. Want a custom design? Use the built-in Appearance editor. Want to debate tabs versus spaces? You've picked the wrong platform for that, but the internet has no shortage of people absolutely gagging to have that conversation.

**The core idea:** ship a solid foundation, extend it with optional bits, and never make sensible defaults somebody else's emergency.

---

## Things it does (and why you'd care)

### 🔑 Login with your face (or finger, or a little USB key)

Cactus uses **passkeys** - the modern login method that lets you authenticate with Face ID, a fingerprint scanner, or a hardware security key. No password to forget. No "must contain one uppercase letter, one number, one hieroglyph, and a strong emotional connection to your childhood pet." You register your passkey during the five-minute setup wizard and that's it - your face is your password.

There's still a traditional email-and-password fallback if you're sentimental about that sort of thing, but it's not the main event.

### 🤫 A secret admin door

Your admin panel doesn't live at `/admin` like every other site in the world, which is the first place anyone trying to get in would look. Instead, it lives at a secret path you choose during setup - something like `/lemon-4f8a2c`. Visitors who don't know it get a perfectly ordinary 404, not even a hint that there's anything behind it. No brute-forcing. No automated attacks. Just a door that, from the outside, doesn't appear to exist.

Very British. Very effective.

### 🧱 A proper page builder, drag-and-drop and everything

Every page is built using a visual drag-and-drop editor. You pick from a library of ready-made blocks - headings, text, images, videos, buttons, call-to-action banners, hero sections, cards, accordions, stats, logo strips, and more - and arrange them however you like. No code. No fighting with a theme. No accidentally demolishing the header because you moved a semicolon.

Blocks snap together on a canvas. What you see is (more or less) what you get.

### 🎨 A fully visual Appearance system

Every visual aspect of the site is configurable through **Appearance**, without touching a single line of code:

- **Header** - design your site navigation exactly how you want it, with your logo, menus, and login button where you put them, using the same drag-and-drop editor.
- **Footer** - copyright notice, links, social icons, whatever tickles your fancy.
- **Design Tokens** - pick your brand colours, fonts, and spacing once; they apply everywhere automatically as CSS variables.
- **Layouts** - define reusable page body structures (full width, boxed, with sidebar) that pages can inherit or override.

No hardcoded design. Every pixel is yours to move about.

### 🧩 Optional modules (powers you only need when you need them)

Forums, comments, job boards, e-commerce - these are separate **modules** you add only when you actually want them. They install via a GitHub URL, run their own database setup during the next build, and appear in the admin panel as though they were always there. They're properly isolated so one module can't accidentally break another. The core has no idea they exist and isn't bothered.

**Available modules:**

- [Shop](https://github.com/cactus-foundation-modules/shop) - a full e-commerce foundation: products, categories, collections, cart, checkout, payments, orders, refunds, customers, discounts, tax and shipping, all run from your own admin. No third-party shop platform required.
- [Shop Variations](https://github.com/cactus-foundation-modules/shop-variations) - adds product options to the shop: size/colour variant matrices with their own price, stock, SKU and image, plus personalisation add-ons (engraving text, gift messages, dropdowns, dates and artwork uploads). Requires the Shop module.
- [Product Attributes for Shop](https://github.com/cactus-foundation-modules/product-attributes-for-shop) - lets shoppers narrow the catalogue by the things they actually care about: material, colour, room, finish. Attributes can sit on a product or on one of its variants, and existing size/colour options import in one click. Requires the Shop module.
- [Product 3D Views for Shop](https://github.com/cactus-foundation-modules/product-3d-views-for-shop) - puts a slowly turning 3D model in the product gallery beside the photographs; shoppers click it to turn, pan and zoom the product. Models attach to a product or to individual variations. Requires the Shop module.
- [Product Downloads for Shop](https://github.com/cactus-foundation-modules/product-downloads-for-shop) - attach the manual, the spec sheet, the care card or the drawing to a product, give each one a name in plain English, and shoppers get them free under a Downloads tab on the product page. Requires the Shop module.
- [GoCardless Instant Bank Pay for Shop](https://github.com/cactus-foundation-modules/gocardless-instant-bank-pay-for-shop) - adds Instant Bank Pay at checkout: a one-off, open-banking (pay-by-bank) payment the shopper authorises straight from their banking app, with refunds and automatic confirmation. Requires the Shop module.
- [Google Sheet Products for Shop](https://github.com/cactus-foundation-modules/google-sheet-products-for-shop) - mirror your whole catalogue into a Google Sheet you can bulk-edit, then pull the changes back in after a preview shows you exactly what will happen. Two buttons, both pressed by a human: nothing is live, nothing syncs behind your back. Requires the Shop and Shop Variations modules.
- [Directory](https://github.com/cactus-foundation-modules/directory) - map-based listings with categories, featured entries, and a public directory page.
- [Contact Form](https://github.com/cactus-foundation-modules/contact-form) - a contact form for any page, with an admin inbox and reply composer.
- [Contact Form Reply Catcher](https://github.com/cactus-foundation-modules/reply-catcher) - threads real mailbox replies back into the Contact Form inbox.
- [Boards](https://github.com/cactus-foundation-modules/boards) - a discussion forum, with polls, moderation, and a phpBB/Discourse importer.
- [Gazette](https://github.com/cactus-foundation-modules/gazette) - a writing-first blog/news module, with tags, series, comments, reactions, an RSS feed, and a WordPress/Medium/Substack importer.
- [Twilio](https://github.com/cactus-foundation-modules/twilio) - call forwarding for your Twilio numbers with voicemail and opening hours, call and message logs, recording playback, click-to-dial, plus sign-in codes by text message for admins and members.
- [Gemini Watermark Remover](https://github.com/cactus-foundation-modules/gemini-watermark-remover) - drop in an image from Google Gemini and it comes back watermark-free, straight into your media library.
- [Ultimate SEO](https://github.com/cactus-foundation-modules/ultimate-seo) - the SEO command centre: site-wide scoring, page-by-page analysis with one-click fixes, a full site crawl audit, sitemap and robots controls, and structured-data blocks for the page builder.

### 👥 Members (visitor accounts, kept well away from the controls)

Flip one switch and your site gains a proper **members system**: registration, sign-in, public profiles, avatars, and optional members-only areas of the site. Members are completely separate from the admin Users who run the site - a member can never wander into your admin panel, and your admins never appear in the members directory. You choose the registration policy, whether usernames are a thing, and which parts of the site require signing in. With the Twilio module installed, members can even get their sign-in codes by text message.

### 🔄 One-click updates

Cactus checks for new releases and shows them in **Settings → Updates**, release notes included - written for humans, not robots. One click and your site updates itself; the little bell in the admin sidebar keeps you posted on how the redeploy is getting on. No terminal, no `git pull`, no crossing of fingers.

### 🎭 Themes

Beyond the Appearance editor, whole **themes** can be installed through the admin and activated without a redeploy. Developers can build and publish their own - there's a [full authoring guide](wiki/Authoring-a-theme.md) in the wiki.

### 📸 Image storage that won't bankrupt you

Photos and images go into cloud storage (your choice of provider - Backblaze, Amazon S3, Cloudflare, Cloudinary, and several others) and are served through a **Cloudflare Worker** - a fast, cheap middleman that handles resizing and caching. This matters because some hosting platforms charge handsomely for serving large files through their infrastructure. The Worker handles all of that outside the expensive bits. Your bank account remains in better shape than anticipated.

Ten media providers are supported. Pick whichever you already have, or whichever looks least threatening.

The media library itself has grown up nicely too: built-in image optimisation (single images or the whole lot in one go), a lightbox with previous/next browsing, shift-click range selection, and infinite scroll - so a few thousand photos won't reduce it to tears.

### 🔐 Security taken seriously

- Login rate limiting, so a bot can't sit there guessing passwords all afternoon
- Passwords checked against a database of known breaches (via Pwned Passwords) at registration - "password123" is politely but firmly refused
- Sessions stored in the database, so suspending a user kicks them out immediately - not "eventually, once their cookie expires"
- Content Security Policy headers on every page
- CSRF protection baked in
- HTTP Strict Transport Security, with preload

It's not flashy. Security rarely is. But it's real, and it works, which is rather the point.

### 📋 GDPR done properly (well, decently)

Users can export all their data in one click, delete their account with a sensible confirmation step, and the footer links to your privacy policy and terms of service once you've set those up. The last admin standing cannot delete their own account - the software physically prevents it. Someone has to be in charge, and the software has strong opinions about who that is.

### 🧭 A setup wizard you'll actually finish

Five steps. About five minutes. No YAML files. No config arrays with twenty-seven nested keys. You pick your secret admin path, register your passkey, name your site, and copy down a recovery code for emergencies. That's it. The dashboard then shows you a friendly checklist of optional features you haven't configured yet, with explanations that don't assume you know what an API key is.

---

## Getting started

### What you'll need

- A [Vercel](https://vercel.com) account - Hobby plan is fine
- Node.js 22 or later on your computer (for local development)
- A database - either a free [Neon](https://neon.tech) account (Cactus can create one for you, automatically, during setup) or a PostgreSQL connection string you already have
- `npm` - not yarn, not pnpm. Just npm. The repo is quite firm about this.

### Step 1: Get the code onto Vercel

```bash
git clone https://github.com/usersaynoso/cactus-foundation.git my-site
cd my-site
```

Import the project into your Vercel dashboard. Before deploying, add these environment variables in Vercel's project settings:

| Variable | How to get it |
|----------|---------------|
| `SESSION_SECRET` | Run `openssl rand -base64 32` in your terminal - it produces a long random string |
| `SITE_URL` | Your domain, e.g. `https://example.com` |
| `NEXT_PUBLIC_SITE_URL` | Same as above |
| `VERCEL_API_TOKEN` | Vercel dashboard → Account Settings → Tokens |
| `VERCEL_PROJECT_ID` | Vercel dashboard → your project → Settings → General |

**Highly recommended - lets Cactus create your database for you:**

| Variable | What it does |
|----------|--------------|
| `NEON_API_KEY` | Cactus provisions a free PostgreSQL database automatically. Get one at [console.neon.tech](https://console.neon.tech) → Account Settings → API keys. |

### Step 2: Deploy and run the setup wizard

Deploy. Vercel builds the app. Visit your production URL. You'll be redirected to `/_setup`. The wizard walks you through five steps:

1. **Connect your project** - checks everything's wired up. If you added `NEON_API_KEY`, there's a button to create a database automatically. If you already have one, paste in the connection string.
2. **Admin account** - your name, email, and passkey registration. Your face or fingerprint become your login from this point.
3. **Admin path** - pick your secret admin URL. The wizard suggests something like `lemon-4f8a2c`. Keep it. Don't share it.
4. **Name your site** - site name and timezone.
5. **Recovery code** - shown once, never again. The system stores only a hash of it. Put it in your password manager, or write it on a bit of paper and keep it somewhere sensible. Not the kitchen drawer. That drawer is a graveyard for batteries, rubber bands, and good intentions - your recovery code deserves better.

Click "I've saved it." You're in.

### Step 3: Go live when you're ready

The site starts in coming-soon mode. Add content, set up optional features at your leisure, and when you're happy, flip the status to **Live** in Settings → Site Status.

---

## Optional features (disabled until you configure them)

The admin dashboard shows a checklist of unconfigured features with friendly explanations. Nothing is mandatory beyond the basics. Add things when you need them.

### Email (enables password login, account recovery, email verification)
Provide either:
- **Brevo**: add `BREVO_API_KEY`
- **SMTP**: add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`

### Image uploads (enables the media library)
Choose a provider in Settings → Media and add the corresponding credentials. Supported options include Backblaze B2, Cloudflare R2, AWS S3, DigitalOcean Spaces, Wasabi, MinIO, Vercel Blob, Supabase Storage, Cloudinary, and ImageKit. For most of these, you'll also deploy a Cloudflare Worker from `workers/media-worker/` - full instructions are in the [Configuration reference](wiki/Configuration-reference.md).

### Module installs (enables installing extensions)
Create a GitHub personal access token with `repo` scope, then add `GITHUB_API_TOKEN` and `GITHUB_REPO` (format: `owner/repo`, pointing at your Cactus fork).

### Bot protection on public forms
Create a [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) site, then add `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`.

---

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run db:migrate            # set up the database schema
npm run dev                   # start the dev server
```

The app runs at `http://localhost:3000`. Passkeys work on localhost - Cactus handles the technical side of that automatically, so you don't have to.

---

## How it's put together (the 30-second version)

```
/
├── app/                    The pages and behind-the-scenes endpoints
│   ├── _cactus_admin/      Admin panel (only reachable via your secret path)
│   ├── _setup/             Setup wizard (disappears once you've finished it)
│   ├── _status/            Coming-soon and maintenance pages
│   └── (public)/           Your actual website, as the world sees it
│
├── lib/                    The engine room - auth, media, config, permissions, page builder
├── workers/media-worker/   Cloudflare Worker - serves your images without involving Vercel
├── scripts/                Build-time utilities (migrations runner, etc.)
├── prisma/                 Database schema - the canonical source of truth
└── wiki/                   Full documentation, in plain English
```

---

## Documentation

Everything in more depth is in the `/wiki` folder:

**Getting going**
- **[Home](wiki/Home.md)** - overview and philosophy
- **[Getting started](wiki/Getting-started.md)** - the full setup process, step by step
- **[Running locally](wiki/Running-locally.md)** - developing on your own machine

**Day-to-day**
- **[Managing pages](wiki/Managing-pages.md)** - the page builder and everything on it
- **[Managing media](wiki/Managing-media.md)** - the media library, providers, and optimisation
- **[Managing users](wiki/Managing-users.md)** - admin users, roles, and permissions
- **[Members](wiki/Members.md)** - visitor accounts, profiles, and members-only areas
- **[Appearance and design](wiki/Appearance-and-design.md)** - header, footer, design tokens, layouts
- **[Modules](wiki/Modules.md)** - installing, updating, and removing modules

**Module guides**
- **[Shop](wiki/Shop.md)**, **[Directory](wiki/Directory.md)**, **[Boards](wiki/Boards.md)**, **[Gazette](wiki/Gazette.md)**, **[Twilio](wiki/Twilio.md)**, **[Reply Catcher](wiki/Reply-catcher.md)**, **[Gemini Watermark Remover](wiki/Gemini-Watermark-Remover.md)**

**For the curious and the technical**
- **[Architecture overview](wiki/Architecture-overview.md)** - how everything fits together
- **[Configuration reference](wiki/Configuration-reference.md)** - every setting and what it does
- **[Authoring a module](wiki/Authoring-a-module.md)** - build and publish your own extension
- **[Authoring a theme](wiki/Authoring-a-theme.md)** - build and ship a theme
- **[Self-hosting and operations](wiki/Self-hosting-and-operations.md)** - backups, recovery, and "oh no" procedures

---

## One important rule about databases

Cactus has exactly one rule it will not bend on: **database schema migrations run only during a Vercel build, never from the running app.**

The build command is:
```
prisma generate && node scripts/build-migrate.mjs && next build
```

That's it. No "apply schema on startup." No "run a migration via an API endpoint." This isn't laziness - it's the design. A migration that fires from a live server and goes wrong is the sort of thing that ruins evenings, weekends, and your faith in computers generally. Running it only at build time, where the build either succeeds or fails cleanly, means you always know where you stand.

If you're building a module: write `.sql` files, put them in `migrations/`, and the build runner handles the rest. The wiki explains the convention.

---

## Frequently asked questions (nobody has asked these yet but they will)

**Q: Can I run this without Vercel?**
A: In theory, yes - it's a Next.js app with a PostgreSQL database, nothing exotic. In practice, the Edge Config integration, deployment webhooks, and automatic database provisioning are all built around Vercel. You could re-wire those bits for another platform, but that's a project in itself, and you'd be largely on your own. Not impossible. Just a significant amount of faff.

**Q: Why can't I use pnpm?**
A: Because the repo uses `package-lock.json` and enforces npm. Using a different package manager in the same project is how you end up with subtle version drift and an afternoon debugging something that should have been perfectly obvious. It's not personal. It's just tidy.

**Q: What if I lose my passkey AND my recovery code?**
A: There's a procedure in [Self-hosting and operations](wiki/Self-hosting-and-operations.md) under "Completely locked out." It involves a database connection and isn't fun, but it exists. This is a persuasive argument for keeping your recovery code somewhere sensible - your password manager, a printed sheet in a filing cabinet, anywhere that isn't the kitchen drawer.

**Q: Is this production-ready?**
A: The security model is real, the architecture is solid, and it's been built with care. It is, however, a young project made by humans who drink too much tea and occasionally miss edge cases. Keep backups. Read the operations guide. Let us know when something's not right.

**Q: Why "Cactus"?**
A: Low-maintenance. Sharp edges where they matter. Surprisingly resilient. And it thrives in hostile environments, which describes most of the internet. The metaphor does most of the work.

---

## Contributing

Contributions welcome. The sensible starting points:

1. Open an issue before writing a large feature - not gatekeeping, just avoiding duplicate effort.
2. Modules are the encouraged extension points. New core features need a good reason.
3. Follow the same code discipline as the rest of the project: type-check, verify your changes actually work, commit clearly.

---

## Licence

MIT. Take it, use it, build things with it, charge money for those things if you like. A mention is appreciated but not required.

---

*Built in Britain, with stubbornness, strong opinions about TypeScript strict mode, and the quiet conviction that software should do what it says on the tin.*
