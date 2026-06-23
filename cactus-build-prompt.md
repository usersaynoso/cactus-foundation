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
