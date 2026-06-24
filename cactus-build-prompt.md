# Cactus build prompt

This file is the source of truth for everything being built in this repository. `AGENTS.md` governs how to work; this file governs what to build. If they conflict, this file wins.

---

## Phase 10 addendum: Puck-based page builder for Info pages

### Context and scope

This extends Phase 10 (Info pages and SEO). It is core, not a module, since it's an alternate authoring mode for a model that already exists in core. It does not touch themes, nav, footer, 404/500, or anything theme-controlled, none of that changes. If nav or footer ever gets a visual editor later, it's a small structured list editor against `SiteConfig`, not this, and is separate work, don't conflate the two.

The goal: give admins a second way to author the content area of an `InfoPage`, a visual drag-and-drop builder (Puck), alongside the existing sanitized-markdown editor. Slug, draft/publish status, `metaDescription`, and `ogImage` stay real columns on `InfoPage` regardless of which authoring mode is in use, surfaced inside Puck's own root-fields sidebar so the admin edits everything in one place, but never trusted from Puck's client-side state as the source of truth.

### Library

Use Puck (MIT licensed, github.com/puckeditor/puck). Confirm the current package name and import paths against Puck's own docs before installing, recent sources show both `@measured/puck` and `@puckeditor/core` in circulation (an apparent rename), confirm which is current and pin the version once installed. Don't substitute a commercial SDK or paid tier of any other builder.

### Data model

Add to `InfoPage`:
- `bodyFormat`: enum, `markdown` | `builder`, default `markdown`
- `builderData`: nullable JSON column, holds the Puck `Data` object (content only, see Reconciliation)

`body` (markdown) is untouched and simply unused when `bodyFormat` is `builder`. Don't drop or repurpose it.

Migration via `prisma migrate dev`, per AGENTS.md's migration rules. Never `db push`.

### Puck config

- Components: a small, explicit set of content blocks (Hero, TextBlock, ImageBlock, ButtonLink, a Columns/Section type using Slots for nesting, etc.). Exact set is an implementation decision, keep v1 small and extend later. Every field is typed (text, textarea, select, custom), there is no free-HTML field type anywhere in this config.
- Root fields (`config.root.fields`): `title`, `slug`, `status` (draft/published), `metaDescription`, `ogImage`. `ogImage` is a custom field type that opens the existing media library picker (already wired to B2 and the Worker) and stores a `Media` id, not a raw URL and not a new upload path.
- The editor (`<Puck>`) is a client component, mounted only on the page-edit route. Lazy-load it the same way `@simplewebauthn/browser` is lazy-loaded, only where it's actually needed.
- The published render path (`<Render>`) stays a server component wherever the registered components themselves don't need client interactivity. The editor being a client component is not a reason for the public page to become one.

### Reconciliation (the part that has to be exact)

`InfoPage`'s typed columns are canonical. `builderData.root.props` is a working copy, never the source of truth, for `slug`, `status`, `metaDescription`, `ogImage`.

On load (building the `Data` object handed to `<Puck>`): take the stored `builderData`, then overwrite `root.props.slug`, `.status`, `.metaDescription`, `.ogImage` with the current values from the `InfoPage` row. A stale blob from an old session, another tab, or an interrupted save must never win over the real columns.

On save: split those four fields back out of `data.root.props` before persisting. Write them to their real columns. Persist everything else, the actual content tree, as `builderData`, with `root.props` stripped to whatever non-reconciled fields actually belong there. This split happens in exactly one place, the save handler, never client-side, never duplicated elsewhere.

### API and permission boundaries

Two distinct mutation paths, matching the draft/publish distinction the spec already has for markdown pages:
- Autosave (debounced `onChange`): requires `pages.write`. Always persists `status: draft`, regardless of what the client's root props say. Never flips to published.
- Publish (`onPublish`): requires `pages.publish`, checked server-side on every call, never inferred from the client having shown a "Published" option in its own select field. This is the only path that can set `status: published`.

Slug uniqueness is validated server-side on every save, draft or publish, regardless of UX (a debounce-check field is fine as a nicety, the server check is mandatory either way since a second tab or a stale client can race past a client-only check).

Standard CSRF protection on both endpoints, same as every other mutating admin action.

Publishing or editing a published builder page triggers the existing on-demand static regeneration, exactly as the markdown path does. Sitemap inclusion is driven by `status` and `slug`, not `bodyFormat`, no separate logic needed.

### Rendering

The public `InfoPage` template branches on `bodyFormat`: `markdown` renders through the existing sanitized-markdown pipeline unchanged, `builder` renders `<Render config={...} data={page.builderData} />` using the same component config the editor used. Draft pages still 404 for non-admin visitors regardless of `bodyFormat`, that's one check upstream of the branch, don't duplicate the draft-gate per format.

### Validation and field safety

Puck's closed component schema means persisted JSON can only ever contain prop values for components you registered, there's no arbitrary-HTML field anywhere in this config. Free-text fields (TextBlock body, button labels, etc.) still get the same escaping on render as any other user-supplied string elsewhere in the app. A closed schema is not the same thing as "safe to render unescaped."

### Verification checklist for this task

Per AGENTS.md's work loop, confirm each of these explicitly, not "looks about right":
- Draft builder-format pages 404 for non-admins, confirmed with an actual logged-out request, not by inspecting the route
- A request sending `status: published` to the autosave endpoint, while holding only `pages.write`, does not publish the page
- Slug collision is rejected server-side even when bypassing the editor's own UI
- Editing root fields from a stale loaded session never overwrites a value changed elsewhere in between, confirmed by editing the same page in two tabs
- Sitemap and revalidation behave identically for builder-format and markdown-format published pages
- The public render of a builder page ships no more client-side JS than its registered components actually need, confirmed by checking the editor bundle isn't present on the public route

---

## Addendum: Multi-provider media storage

Give this addendum the same weight as the rest of this file. It retroactively changes core media plumbing — it is not a quick patch. It replaces the `// 'backblaze' — others added later` placeholder in `SiteConfig.imageProvider`, converts that column to a proper enum (`mediaProvider`), and extends the Media section of both the setup wizard and the Config page.

### Context and scope

The base build supports exactly one media provider, Backblaze B2, fetched and resized through a private Cloudflare Worker. This addendum extends that to ten providers across two distinct shapes, adds a provider-selection step to setup and the Config page, and adds a migration mechanism so a site is never serving images off more than one provider as a steady state.

This does not change the Worker's resizing mechanism (Cloudflare Image Resizing on whatever bytes it fetches from origin), the upload size/type limits, or the `Media` table's existing columns — all of that is untouched. It changes which provider those bytes can live on, how that's selected, and what happens to existing media when the selection changes.

### The two provider shapes

- **Proxied** (B2, Cloudflare R2, AWS S3, DigitalOcean Spaces, Wasabi, MinIO, Vercel Blob, Supabase Storage): private object storage, fetched and resized by the existing Cloudflare Worker, served from `CLOUDFLARE_WORKER_URL` exactly as B2 is today. The Worker is origin-agnostic already — it just needs the right credentials and fetch logic for whichever proxied provider a given object actually lives on.
- **Direct** (Cloudinary, ImageKit): these have their own CDN and their own URL-based transformation system. Routing them through the Worker would mean fetching an already-optimised image just to hand it to a second edge network for no reason. Direct-provider images are served straight from the provider's own domain to the browser; the Worker is never involved, and the custom Next.js `<Image />` loader builds that provider's transformation URL instead of a Worker URL.

Confirm exact field names, env var conventions, and current SDK/API shape for each provider against their own current docs before implementing — names below reflect each provider's typical convention but provider APIs change.

### Principle: provider selection is config, secrets stay in env vars

This follows the same principle already stated for the Email tab: provider *selection* is a config value; the actual secret values never leave environment variables. Apply it identically here.

Add to `SiteConfig`:

```prisma
enum MediaProviderType {
  B2
  R2
  S3
  SPACES
  WASABI
  MINIO
  VERCEL_BLOB
  SUPABASE_STORAGE
  CLOUDINARY
  IMAGEKIT
}

enum MediaProviderKind {
  PROXIED
  DIRECT
}
```

```prisma
mediaProvider MediaProviderType?
```

Nullable, same reasoning as `comingSoonPageId` etc. — a fresh install has none selected until an admin picks one. `MediaProviderKind` is a static lookup the app code holds for each `MediaProviderType` value (not a database column), used to decide which serving/upload code path and which loader logic applies.

**Backward compatibility**: if this addendum lands on an install that already has the existing `B2_*` vars set, `mediaProvider` should backfill to `B2` automatically during migration rather than sitting null and telling an already-working install that nothing is configured. The existing `imageProvider String?` column is replaced by this enum column — write the migration to carry the value forward.

`Media.provider` (existing column) records which provider a given item actually lives on right now. It is set at upload time from whichever provider is active at that moment, and is only ever changed by a completed migration (see below), never by flipping `SiteConfig.mediaProvider` alone. Changing the selector affects new uploads immediately; it does not retroactively touch existing rows.

### Environment variables, scoped per provider

| Provider | Kind | Vars | Notes |
|---|---|---|---|
| B2 | Proxied | `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_ENDPOINT` | Existing, unchanged |
| Cloudflare R2 | Proxied | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Endpoint derives from account id |
| AWS S3 | Proxied | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `S3_REGION` | Standard signature v4 |
| DigitalOcean Spaces | Proxied | `SPACES_ACCESS_KEY_ID`, `SPACES_SECRET_ACCESS_KEY`, `SPACES_BUCKET_NAME`, `SPACES_REGION` | S3-compatible |
| Wasabi | Proxied | `WASABI_ACCESS_KEY_ID`, `WASABI_SECRET_ACCESS_KEY`, `WASABI_BUCKET_NAME`, `WASABI_REGION` | S3-compatible, no egress fees |
| MinIO | Proxied | `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY_ID`, `MINIO_SECRET_ACCESS_KEY`, `MINIO_BUCKET_NAME`, `MINIO_USE_SSL` | Self-hosted; endpoint is admin-supplied, not a fixed domain |
| Vercel Blob | Proxied | `BLOB_READ_WRITE_TOKEN` | Simplest credential set of any provider; confirm current Vercel naming |
| Supabase Storage | Proxied | `SUPABASE_STORAGE_PROJECT_URL`, `SUPABASE_STORAGE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET_NAME` | Must be the service role key, never the anon key |
| Cloudinary | Direct | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Own CDN and transformation; no Worker involvement |
| ImageKit | Direct | `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT` | Own CDN and transformation; no Worker involvement |

`CLOUDFLARE_WORKER_URL` stays a single, global, shared var for every proxied provider — unchanged. It's one Worker regardless of which proxied provider sits behind it.

**For proxied providers, the same credential values above must also be configured as secrets on the Cloudflare Worker itself, manually, by the admin.** The app cannot read, verify, or push Worker secrets — there is no Cloudflare API token requirement introduced by this addendum. Surface this clearly in the env check UI: a one-line note beside the proxied-provider checklist pointing at the relevant wiki page. Document the actual `wrangler secret put` steps in the self-hosting docs.

### Setup wizard and Config page

Both reuse the same component:

- A provider dropdown, grouped or labelled so the kind distinction is visible (e.g. "object storage, served via your Worker" vs "image CDN, served and resized by the provider directly") — not just a flat list of ten names.
- Selecting a provider scopes the environment checklist beneath it to only that provider's vars, ✓/✗ per var, same one-line-description convention used everywhere else in the env check system. No other provider's vars are shown until selected.
- This entirely replaces the flat, undifferentiated var dump that previously listed B2's four vars among unrelated ones like Sentry or Edge Config. Those other sections are untouched; this addendum only restructures the media portion.
- In setup, this lives as a sub-section within step 1 (environment check), not a new numbered wizard step, so the existing five-step structure doesn't need renumbering. Media stays optional at setup, exactly as B2 is today — upload (including logo/favicon) stays disabled until a provider is fully configured.
- On the Config page's Media tab, this replaces the "image provider selector (Backblaze only for now)" placeholder. Changing the selection here, post-setup, is what triggers the migration prompt below.

### Existing media and migration

**Invariant**: once configured, `SiteConfig.mediaProvider` names exactly one provider as the destination for new uploads, never two; and the goal state is for every `Media` row to actually live on that same provider. Changing the dropdown alone only affects where new uploads land — it does not move anything that already exists. Migration is the only mechanism that actually converges every row onto one provider.

When the admin changes the selector and confirms, before applying, show a breakdown of how many existing `Media` rows currently live on each provider other than the newly selected one. Present two explicit choices — no silent default:

- **Migrate now**: kicks off a migration job (below) moving every such row to the newly selected provider.
- **Switch without migrating**: `mediaProvider` updates immediately for new uploads. Existing rows are untouched and keep pointing at whatever they're actually stored on. The per-provider breakdown stays visible on the Media tab afterward, with a "Migrate now" action available at any time — not only at the moment of switching — since the admin may want to migrate later rather than immediately.

#### Migration job

```prisma
model MediaMigrationJob {
  id            String    @id @default(cuid())
  toProvider    MediaProviderType
  status        String    // pending | running | completed | failed | cancelled
  totalItems    Int
  migratedItems Int       @default(0)
  failedItemIds Json      @default("[]")
  cursor        String?
  startedAt     DateTime  @default(now())
  completedAt   DateTime?
  lastError     String?
}
```

- **A single global migration lock** — same pattern as the existing modules/themes deploy lock. Exactly one job runs at a time.
- A job always targets the currently active provider as `toProvider`, and processes every `Media` row whose `provider` differs from it, regardless of how many distinct old providers are represented. If an admin switched twice without migrating in between, one job cleans up every straggler in a single run.
- **Processed in small batches (10–20 items) triggered by repeated client-side calls while the admin keeps the migration screen open.** This is deliberately not a Vercel Cron job — Hobby-tier cron frequency is far too coarse for this, and a single blocking request risks function timeouts on any real media library. `cursor` records the last successfully processed `Media` id, so closing the tab or losing connection resumes exactly where it left off on the next visit — it never restarts from zero.
- **Per item**: download the original bytes from wherever it currently lives. For a direct provider as the source, fetch the original, untransformed asset — never a resized derivative URL; repeated migrations must never compound a lossy resize. Upload to the new provider via its own SDK/API. Only once that upload is confirmed, update the `Media` row's `provider`, `key`, and `url` in a single write, then delete the original from the old provider. If the delete fails, log it and continue — an orphaned original costs storage; doing this in the opposite order risks actual data loss, which is far worse.
- A failed item is recorded in `failedItemIds` with its error; the job continues with the remaining items rather than aborting the whole run — consistent with `AGENTS.md`'s stance on partial failure: surface it clearly, don't let one bad item silently stop everything else.
- The admin can cancel a running job. Already-migrated items stay migrated; cancelling never rolls back completed work.
- The Media tab shows live progress while a job runs (X of Y migrated, failures listed individually with a "retry just these" action) and the per-provider breakdown the rest of the time.

### Upload and serving logic

- **Custom Image loader**: branches on the `Media` row's own `provider`, not on `SiteConfig.mediaProvider`, since a row may not yet have been migrated to the active selection. Proxied providers build a Worker URL exactly as today. Direct providers build that provider's own transformation URL (Cloudinary's `/upload/w_x,q_y/` convention, ImageKit's `?tr=w-x,q-y` convention — confirm current syntax against each provider's docs).
- **`images.remotePatterns`**: add static entries for Cloudinary's and ImageKit's default CDN domains, alongside the existing Worker domain entry. Custom CNAME domains for either service are out of scope (see below).
- **Worker fetch logic**: per request, the Worker resolves which provider a requested key actually belongs to (it already must do a lookup of some kind to enforce the existing "only serve keys present in the `Media` table" rule) and selects the matching credential set from its own configured secrets. This is what makes the "switch without migrating" path actually work — the Worker must be able to serve a request for any proxied provider it currently holds secrets for, not only whichever one is presently selected as active.
- **Upload path**: branches by kind. Proxied providers upload via the app's server-side credentials and that provider's SDK, exactly as B2 does today. Direct providers upload via their own signed-upload API. Either way, uploads remain server-mediated — never a direct-from-browser presigned upload; see Explicitly out of scope.
- Upload limits and accepted mimetypes are unchanged (10 MB max, jpg/png/webp/gif, SVG rejected) and enforced identically regardless of provider.

### Validation and field safety

- Env var checks remain presence checks, ✓/✗ on whether a var is set — not a live API call to the provider. This matches every other optional integration in the base spec, including B2 today; this addendum doesn't introduce a new live-validation requirement.
- No new permission key is introduced. Provider configuration is gated by whatever already gates access to the Config page, consistent with how the other Config tabs work.
- The third-party data processors list (GDPR & legal tab) must include whichever media provider is currently selected — the existing "dynamically built from whichever providers are actually configured" logic extends to the new provider set without needing new logic of its own.

### Explicitly out of scope

- No steady-state support for serving from more than one provider at once — exactly one provider per item once migration to it has completed; the only sanctioned exception is the transient window while a migration job is actually running.
- No unattended, Cron-driven migration — the admin must have the migration screen open for a job to progress; a self-hosted/Hobby-tier constraint stated plainly rather than worked around.
- No per-image manual override of provider outside of running a migration job.
- No custom-domain support for Cloudinary or ImageKit beyond their default CDN domains in `remotePatterns`.
- No client-side direct-to-provider browser uploads, presigned or otherwise — uploads stay server-mediated exactly as today.
- No automatic Cloudflare Worker secret sync — Worker-side credentials are a manual, documented step.

### Verification checklist for this addendum

Per AGENTS.md's work loop, confirm each of these explicitly, not "looks about right":

1. Selecting a provider in setup or Config shows only that provider's env vars — not a flat list of all ten — confirmed for at least one proxied and one direct provider.
2. An install with pre-existing `B2_*` vars and no prior `mediaProvider` value backfills to `B2` automatically; doesn't show as unconfigured.
3. Migrating between two proxied providers end to end actually moves bytes — the new provider has the object, the old provider no longer does, and the `Media` row's `key`/`url`/`provider` reflect the new location.
4. Migrating away from a direct provider fetches the original asset, not a resized derivative — confirmed by checking the migrated file's dimensions/size match the true original, not a previously-served transformed variant.
5. Cancelling a migration partway through and resuming later continues from the stored cursor, not from the start — confirmed by killing the tab mid-job.
6. A deliberately failing item (bad credentials mid-job, or similar) is recorded in `failedItemIds` and the job continues processing the rest rather than halting.
7. Choosing "switch without migrating" leaves prior items loading correctly (Worker still holds the old provider's secrets) and visible in the per-provider breakdown — confirmed by an actual page load, not just a database check.
8. A direct-provider image's network request goes straight to that provider's CDN domain — confirmed by inspecting actual network requests — with zero requests touching the Cloudflare Worker.
