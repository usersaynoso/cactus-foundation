# AGENTS.md

Instructions for any AI agent (Codex or otherwise) working in this repository. This file governs *how* you work. `cactus-build-prompt.md` governs *what* you're building, it's the spec, treat it as the source of truth for every requirement. If anything here ever conflicts with it, the spec wins, come back and flag the conflict rather than silently picking one.

This is a large build: custom WebAuthn auth, a permission system, a submodule-based module and theme architecture, GDPR tooling, account recovery, the lot. Don't attempt it in one pass. The structure below exists specifically so the work survives being interrupted, resumed, picked up by a different invocation of you, or handed to a different agent entirely, without losing track of what's actually been done versus what's been claimed.

## Before writing a single line of code

1. Read `cactus-build-prompt.md` in full. Twice. Don't start coding from memory of a skim.
2. Generate `PROGRESS.md` at the repo root (format below), and add it to `.gitignore` immediately, before it exists, so it's never accidentally committed. One checklist item per concrete requirement in the spec, grouped into the phases under "Build order" below. This file is your working memory. Treat gaps in it as seriously as gaps in the code.
3. Confirm `.gitignore` also covers `.env`, `.env.local`, `node_modules`, build output, and anything else standard for a Next.js/Prisma project. Never let a secret reach a commit.
4. Initialize git if it isn't already. Commit the empty scaffold before writing any feature code, so there's a clean starting point to diff against.

## PROGRESS.md is mandatory — no exceptions

**Update `PROGRESS.md` at the start AND end of every task, without fail.** This is not optional and not something to catch up on later. The file is your continuity contract: if you are interrupted mid-task, a resuming agent reads this file before touching anything. If it's stale, the resuming agent is flying blind and will redo or break work you've already done.

- **Before writing a single line of code for any task**: set `## Current task` to exactly what you're about to do and which spec section it covers.
- **After completing and verifying any task**: tick it in `## Phase checklist`, add a one-line note under `## Completed`, and update `Last updated` timestamp.
- **If you are interrupted**: the `## Current task` field is the single most important thing to keep current. Update it before every file write, not just before every task.

If you find `PROGRESS.md` stale (last task marked in-progress but code looks complete, or no entry at all), fix the file before doing anything else — that is the task.

## The work loop — apply this to every single task, no exceptions

1. **Before starting**: update `PROGRESS.md`'s "Current task" section with exactly what you're about to do and which spec section it implements. Do this *before* touching code, not after, since this is the line that matters most if you're interrupted mid-task.
2. **Implement it.**
3. **Run the checks**: typecheck, lint, and any relevant automated tests. All must pass, not "mostly pass."
4. **Re-read the exact spec bullets this task covers, line by line**, and confirm explicitly, in your own working notes, that each clause is actually satisfied, not just "looks about right." If the spec says draft pages 404 for non-admins, don't move on until you've actually verified that, not assumed it because the route exists.
5. **If anything fails or doesn't match**: fix it, go back to step 3. This is the triple-check the build needs, it isn't a one-and-done lint pass, it's implement, verify, fix, re-verify, until the task is actually clean against both the automated checks and the spec text itself.
6. **Update the wiki — no exceptions, no deferrals.** Before committing, ask yourself: did this change affect any user-facing behaviour, environment variable, API endpoint, setup flow, or architectural detail? If yes, update the relevant `/wiki` page(s) right now, in the same commit. A task is not done until the docs match the code. Undocumented changes are incomplete changes.
   - Changed or added an env var → update `Getting-started.md` table + `Configuration-reference.md` table.
   - Changed the setup flow or a request lifecycle → update `Architecture-overview.md`.
   - Changed a feature end-to-end → update the feature's own wiki page.
   - Added a new top-level capability → add/extend the page, link it from `Home.md`.
7. **Once genuinely clean**: mark the task done in `PROGRESS.md` with a one-line verification note (what you checked, not just "done"), commit to git with a message referencing the spec section, then move to the next task.

## When a check fails repeatedly

Thoroughness has a limit that matters: if the same specific check fails three times despite genuine, different fix attempts, stop looping on it. Mark it `BLOCKED` in `PROGRESS.md` with full detail, what you tried, what error came back each time, then move on to the next independent task rather than burning the entire session on one stuck issue. An infinite retry loop with no escape valve is a real failure mode for autonomous agents, it either runs forever or eventually fakes success to make the loop stop. Neither is acceptable. Surface blocked items clearly rather than hiding them.

## Build order

Work through these in sequence, each one depends on the last. Don't jump ahead because a later phase looks easier, the dependency order exists for a reason.

0. **Scaffolding**: Next.js + TypeScript init, Prisma init, package scripts for build/lint/typecheck/test, git init, `.gitignore` correct from the start
1. **Full database schema**: every model in the spec, even for features landing in later phases, one migration now is far less painful than ten later
2. **Environment variable check system** + `.env.example`, everything downstream depends on knowing what's configured
3. **Core auth**: passkeys via simplewebauthn, sessions, password+OTP fallback, trust-device, rate limiting, recovery code, email-based recovery, email verification, Pwned Passwords check, Turnstile
4. **Admin login path + middleware**: secret path, Edge Config, blocklist, indistinguishable 404 behavior
5. **First-run setup wizard**: ties together env check, admin account, admin path, essentials, recovery code
6. **Roles and permissions**: Role/Permission/RolePermission, protected-Admin short-circuit, the privilege-escalation guard, Roles admin page
7. **Site status**: live/comingSoon/maintenance, the lockdown middleware, preview-as-visitor
8. **Config page**: every tab, every field, wired to `SiteConfig`
9. **GDPR and legal**: consent architecture, data export, privacy/terms pages, processor list, retention cleanup
10. **Info pages and SEO**: CRUD, sanitized markdown, sitemap, robots, meta tags, JSON-LD
11. **Media**: private B2 bucket, Cloudflare Worker proxy, library page, reference-check on delete
12. **Themes**: Theme model, Prickly bundled, submodule install, live activation flag
13. **Users page**: management, last-admin protection, self-service deletion under the same protection
14. **Modules and themes management**: install/update/disable flow, manifest validation, deploy lock, release pinning
15. **Security and performance sweep**: CSP, CSRF, pagination everywhere it's needed, health endpoint, image cache headers, server-components-by-default audit
16. **Documentation**: write the full `/wiki` folder per the spec's Documentation section, Home, Getting started, Configuration reference, Architecture overview, the in-depth Theme authoring and Module authoring guides, and Self-hosting and operations. The two authoring guides each need a complete, copy-pasteable minimal example walked through end to end. This phase comes after the features exist so the docs describe what was actually built, not what was planned
17. **Full-system verification pass** (see below), this is not optional and is not the same as phase 15's sweep

## Phase 17: the final pass, not a formality

Once every phase above is marked done in `PROGRESS.md`, do this before telling anyone the build is finished:

1. Re-read `cactus-build-prompt.md` top to bottom, one more time, against the actual current codebase, not your memory of building it.
2. For every single bullet point in that document, confirm it's genuinely implemented and working. Build a literal checklist if it helps, this is the moment gaps hide in, the small things that felt "obviously covered" three phases ago.
3. **Verify the `/wiki` docs against the real code**: every environment variable documented matches what the code actually reads, the theme and module authoring guides describe the real manifest fields and the real migration mechanism, and both worked examples would actually run as written. Stale docs are worse than no docs.
4. Fix anything found. Re-run this entire pass again afterward. Repeat until a full pass turns up nothing.
5. Run a full `build`, full `lint`, full `typecheck`, and the full test suite, clean, no warnings waved away.
6. Only then update `PROGRESS.md` to reflect full completion and report it as done.

## If you're resuming after an interruption

Read `PROGRESS.md` before doing anything else. Specifically the "Current task" and "Resume notes" sections.

**Don't blindly trust what it says.** An interruption could have landed between finishing code and updating the file, or between updating the file and actually committing the code. Spot-check: does the file the last entry references actually exist and look complete? Does the test suite still pass? If `PROGRESS.md` claims something is done and the codebase disagrees, the codebase is the truth, fix the discrepancy and correct the file before moving forward, don't just proceed on faith.

## Package manager and migrations: don't improvise

Two specific ways a multi-session build corrupts itself silently, both easy to prevent, both costly to fix after the fact:

- **Use `npm` only. Never `yarn`, never `pnpm`, no exceptions.** If you're interrupted and a fresh session resumes later, it won't remember which package manager the last one reached for, and a project with mixed lockfiles becomes a genuine mess to untangle. `npm` is mandated specifically because it ships with Node everywhere, no global install or environment assumption required, the most reliable choice across whatever sandbox happens to be running you.
- **Use `prisma migrate dev` for every schema change that's meant to persist, never `prisma db push`.** `db push` doesn't create a migration file, so the migration folder and the actual database can silently drift apart, especially across an interruption. On resuming any session, run `prisma migrate status` *before* touching the schema again, to confirm your mental model of the database actually matches its real state rather than assuming it does.
- **`prisma migrate deploy` only ever runs as part of the `build` script, executed by Vercel during its build step.** Never write code in an API route, server action, or any other runtime path that calls `prisma migrate deploy` or otherwise mutates the schema on demand. If a task seems to need that, the actual fix is committing the migration files so the next build picks them up, not running them from inside a request handler.

## Wiki documentation — mandatory after every change

**Every code change that affects user-facing behaviour, environment variables, API contracts, or architecture must be reflected in the `/wiki` docs before the task is marked complete.** This is not optional and is not something to catch up on later.

Specifically:
- If you add, remove, or rename an environment variable: update `Getting-started.md` (required/optional table), `Configuration-reference.md` (env var reference table), and any other wiki page that mentions it.
- If you change the setup wizard flow, add a new API endpoint, or modify the request lifecycle: update `Architecture-overview.md`.
- If you change how a feature works end-to-end (provisioning, modules, themes, auth, etc.): update the relevant wiki page so it describes what was actually built, not what was planned.
- If you add a new top-level capability or concept: add or extend the appropriate page, and link it from `Home.md`.

The phase 17 verification rule applies continuously, not just at the end: wiki docs must describe the real code at every commit, never a prior state.

## Git discipline

Commit after every verified task, not in one giant commit at the end. Descriptive messages referencing the spec section they implement. This, alongside `PROGRESS.md`, is part of how this build survives interruption, git history is itself a checkpoint trail. Never commit `.env` or any secret value, ever, no exceptions for "just testing."

## PROGRESS.md format

Not committed to git, but written in exactly this shape so it's genuinely useful on resume rather than just a vague log:

```markdown
# Cactus build progress

Last updated: <ISO timestamp, update this every single time you touch this file>

## Current task
<Exactly what you are doing right now, and which spec section it implements.
If mid-task when interrupted, this is what tells a resuming agent precisely
where to pick back up, be specific: not "working on auth" but "implementing
the email recovery token generation in /lib/auth/recovery.ts, migrations done,
endpoint not yet written">

## Phase checklist
- [ ] Phase 0: Scaffolding
- [ ] Phase 1: Database schema
- [ ] Phase 2: Environment variable checks
- [ ] Phase 3: Core auth
- [ ] Phase 4: Admin login path + middleware
- [ ] Phase 5: First-run setup wizard
- [ ] Phase 6: Roles and permissions
- [ ] Phase 7: Site status
- [ ] Phase 8: Config page
- [ ] Phase 9: GDPR and legal
- [ ] Phase 10: Info pages and SEO
- [ ] Phase 11: Media
- [ ] Phase 12: Themes
- [ ] Phase 13: Users page
- [ ] Phase 14: Modules and themes management
- [ ] Phase 15: Security and performance sweep
- [ ] Phase 16: Documentation (/wiki)
- [ ] Phase 17: Final verification pass

## Completed (with verification notes)
<One line per finished task: what it was, what you actually checked to confirm
it works, not just "done". e.g. "Passkey registration — tested register+login
flow manually, typecheck clean, unit test for challenge expiry passes">

## Blocked / needs attention
<Anything that failed three genuine attempts. What you tried each time, the
actual error, and why you set it aside rather than looping forever>

## Resume notes
<The single most important section. If this file is the only thing a fresh
agent reads before continuing, what do they absolutely need to know? Last
command run, last file touched, anything mid-flight that isn't obvious from
the code alone>
```