# AGENTS.md

Instructions for any AI agent working in this repository. This file governs *how* you work.

## The work loop — apply this to every single task, no exceptions

1. **Implement it.**
2. **Run the checks**: typecheck, lint, and any relevant automated tests. All must pass, not "mostly pass."
3. **Re-read the exact requirements this task covers, line by line**, and confirm explicitly that each clause is actually satisfied, not just "looks about right."
4. **If anything fails or doesn't match**: fix it, go back to step 2. Implement, verify, fix, re-verify, until the task is actually clean against both the automated checks and the requirements.
5. **Update the wiki — no exceptions, no deferrals.** Before committing, ask yourself: did this change affect any user-facing behaviour, environment variable, API endpoint, setup flow, or architectural detail? If yes, update the relevant `/wiki` page(s) right now, in the same commit. A task is not done until the docs match the code. Undocumented changes are incomplete changes.
   - Changed or added an env var → update `Getting-started.md` table + `Configuration-reference.md` table.
   - Changed the setup flow or a request lifecycle → update `Architecture-overview.md`.
   - Changed a feature end-to-end → update the feature's own wiki page.
   - Added a new top-level capability → add/extend the page, link it from `Home.md`.
6. **Once genuinely clean**: commit to git with a descriptive message, then move to the next task.

## When a check fails repeatedly

Thoroughness has a limit that matters: if the same specific check fails three times despite genuine, different fix attempts, stop looping on it. Mark it clearly with full detail — what you tried, what error came back each time — then move on to the next independent task rather than burning the entire session on one stuck issue. An infinite retry loop with no escape valve is a real failure mode for autonomous agents. Surface blocked items clearly rather than hiding them.

## Package manager and migrations: don't improvise

- **Use `npm` only. Never `yarn`, never `pnpm`, no exceptions.**
- **Use `prisma migrate dev` for every schema change that's meant to persist, never `prisma db push`.** `db push` doesn't create a migration file, so the migration folder and the actual database can silently drift apart. Before touching the schema, run `prisma migrate status` to confirm your mental model of the database actually matches its real state.
- **`prisma migrate deploy` only ever runs as part of the `build` script, executed by Vercel during its build step.** Never write code in an API route, server action, or any other runtime path that calls `prisma migrate deploy` or otherwise mutates the schema on demand. If a task seems to need that, the actual fix is committing the migration files so the next build picks them up.

## Wiki documentation — mandatory after every change

**Every code change that affects user-facing behaviour, environment variables, API contracts, or architecture must be reflected in the `/wiki` docs before the task is marked complete.** This is not optional and is not something to catch up on later.

Specifically:
- If you add, remove, or rename an environment variable: update `Getting-started.md` (required/optional table), `Configuration-reference.md` (env var reference table), and any other wiki page that mentions it.
- If you change the setup wizard flow, add a new API endpoint, or modify the request lifecycle: update `Architecture-overview.md`.
- If you change how a feature works end-to-end (provisioning, modules, themes, auth, etc.): update the relevant wiki page so it describes what was actually built, not what was planned.
- If you add a new top-level capability or concept: add or extend the appropriate page, and link it from `Home.md`.

Wiki docs must describe the real code at every commit, never a prior state.

## GitHub releases — versioning

Default to a **patch increment** (e.g. `0.3.0` → `0.3.1`) for every release unless explicitly told otherwise. Only bump the minor version (e.g. `0.3.0` → `0.4.0`) when the user specifically asks for it. Never guess at minor or major bumps — when in doubt, patch.

## GitHub release notes — write for humans, not robots

Every GitHub release needs a description. That description is read by site owners, not developers. They don't care that you refactored the middleware abstraction layer or resolved a race condition in the token refresh flow. They care whether their site is faster, whether a bug that was annoying them is fixed, and whether anything might break when they update. Write accordingly.

**The golden rules:**

1. **Lead with what changed for the user, not how you changed it.** "Logging in with a passkey is now faster" beats "optimised WebAuthn assertion verification latency." One of those is useful. The other is showing off.

2. **Plain English only.** If a sentence contains the words "refactor", "abstraction", "middleware", "schema", "migration", "hydration", or any acronym that hasn't been spelled out, rewrite it. Pretend you're explaining the update to someone who runs a small business and just wants their website to work.

3. **Be warm and a little bit funny.** Not stand-up-comedy funny — just human. A light touch goes a long way. Users notice when software feels like it was made by people who actually enjoy making it, and they remember it. Dry wit is fine. Dad jokes are acceptable at low doses. Puns: one maximum, and only if genuinely good.

4. **Group by impact, not by code area.** Good headings: ✨ New stuff, 🐛 Fixed, 🔧 Under the hood. Don't write headings like "Auth subsystem changes" or "Prisma migration updates." Nobody knows what that means and nobody cares.

5. **Every bug fix deserves one sentence explaining the symptom, not the cause.** "Fixed a bug where logging in on Safari would sometimes silently fail and leave you staring at the login page forever, wondering what you did wrong. (You did nothing wrong.)" That's far better than "Fixed WebAuthn assertion error on Safari due to rpId mismatch."

6. **If something requires the user to do anything after updating** — clear their cache, run a script, change a setting — call it out loud and early, in bold, before they miss it and end up confused.

7. **Mention the version number at the top, in plain language.** "This is version 1.4.2. It's a small but satisfying update." is fine. No need for elaborate preamble.

8. **Don't list every commit.** If it wouldn't mean anything to someone who has never opened a terminal, leave it out. A tight, readable five-item list beats an exhaustive thirty-line changelog that nobody finishes.

**Format to follow:**

```markdown
## What's new in vX.Y.Z

One sentence summary of the release vibe — is this a big deal, a small fix, a quality-of-life release?

### ✨ New stuff
- **[Feature name]** — What it does for you, in one sentence. If it needs more explanation, add a second sentence. That's the limit.

### 🐛 Fixed
- **[The symptom, not the bug ID]** — What was going wrong, what it felt like from the user's side, and that it's now sorted.

### 🔧 Under the hood
- Brief mention of any infrastructure or performance work, translated into what the user actually notices (faster, more reliable, uses less memory, etc.). Skip it entirely if there's genuinely nothing user-noticeable.

### ⚠️ Anything you need to do
Bold, upfront, impossible to miss. If there's nothing, omit this section entirely — don't write "No action required", that's just noise.
```

**Examples of before/after rewrites:**

| Too technical | Human-friendly |
|---|---|
| "Fixed race condition in session token refresh causing intermittent 401 errors" | "Fixed a bug where you'd randomly get logged out mid-session for no reason. Annoying. Now gone." |
| "Resolved rpId mismatch in WebAuthn assertion on Safari" | "Fixed passkey login on Safari, which was mysteriously refusing to work. Mystery solved." |
| "Refactored middleware to support per-route Edge Config cache invalidation" | "Pages now respond to config changes faster — no more waiting for things to catch up." |
| "Migrated media storage provider abstraction layer" | "File uploads now go through a new backend. You won't notice any difference, which is exactly the point." |

When in doubt: read the release note out loud. If it sounds like a GitHub commit message, rewrite it. If it sounds like something a friendly, slightly nerdy colleague would say over Slack, ship it.

---

**A real example of what NOT to do — this was actually shipped and it was bad:**

> Bug fixes
>
> Fix page builder 404 on permissions check: The _perms API route was invisible to Next.js App Router because folders prefixed with _ are treated as private (non-routable). Renamed to perms.
> Fix page builder ChunkLoadError: Puck's default CSS (puck.css) imports Inter from an external CDN (rsms.me) which is blocked by the site's Content Security Policy and caused a CSS chunk load failure. Now using no-external.css which bundles all styles locally.
> Add Page Builder option to new page form: Creating a new page now shows a Markdown / Page Builder toggle. Choosing Page Builder creates the page and opens the visual editor immediately.

Every sentence in this is wrong. It explains file naming conventions, CSS chunk loading, CDN domains, and Content Security Policy to people who run websites, not debug them. Nobody reading a release note needs to know what `no-external.css` is. Nobody cares that a folder was renamed from `_perms` to `perms`. They care that the page builder was broken and is now fixed.

The same release, done correctly:

> ## What's new in v0.3.1
>
> A small patch release — the visual page builder had a couple of rough edges right out of the gate. Consider them smoothed.
>
> ### 🐛 Fixed
> - **Page builder pages returning 404** — If you built a page with the visual editor and got a blank 404 when trying to view it, this is the one. Fixed.
> - **Page builder failing to load entirely** — Some sites were hitting an error that stopped the page builder from opening at all, usually right after setup. That's now sorted.
>
> ### ✨ New stuff
> - **Choose Page Builder when creating a new page** — The "new page" form now asks whether you want Markdown or the visual editor. Pick Page Builder and you'll land straight in the editor, ready to go.

---

**Mandatory self-check before publishing any release note:**

Before you finalise and publish, answer every question below. If any answer is "yes", rewrite before shipping.

1. Does any sentence explain *why* a bug happened technically (file paths, framework internals, naming conventions, error class names)? → **Rewrite.**
2. Does it contain any of these words or phrases: `route`, `API`, `router`, `CDN`, `CSP`, `Content Security Policy`, `chunk`, `CSS`, `bundle`, `schema`, `migration`, `middleware`, `refactor`, `abstraction`, `hydration`, `prop`, `hook`, `component`, `endpoint`, `rpId`, `WebAuthn`, `token`, `JWT`, `OAuth`, or any filename ending in `.ts`, `.tsx`, `.js`, `.css`, `.json`? → **Rewrite.**
3. Does it read like a list of commit messages with punctuation added? → **Rewrite.**
4. Does it use the required format (version header, vibe sentence, labelled emoji sections)? → If not, **fix the format.**
5. Is there at least one human moment — warmth, a light joke, a reassuring aside, anything that proves a person wrote this and not a deployment script? → If not, **add one.**
6. Read it out loud. Would you be comfortable reading it to someone who runs a small business and has no idea what a CSS chunk is? → If not, **rewrite it.**

All six checks must pass. This is not optional. A release note that fails these checks must not be published.

## Git discipline

Commit after every verified task, not in one giant commit at the end. Descriptive messages referencing what was changed and why. Never commit `.env` or any secret value, ever, no exceptions for "just testing."

## Commit, push, and release flow

When asked to commit and push:

1. Commit and push the code.
2. Create a GitHub release with a bumped version number (patch increment by default — see versioning rules above) and a release note following the format above.
3. Vercel deploys automatically on a new GitHub release — do **not** trigger a separate deployment.
4. **Do not return until the Vercel deployment has succeeded.** Poll `vercel ls` or the Vercel dashboard until the deployment status is `Ready`. If it fails, investigate the build logs and fix the issue before reporting back.
