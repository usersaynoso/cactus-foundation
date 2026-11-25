# Core bug sweep - follow-ups

Found during the full core bug sweep on Tuesday the 24th of November 2026 and deliberately left for later. Each entry says what is wrong, how it bites, and the fix proposed at the time. Nothing here is verified as exploited or observed live; the "unverified" ones need checking before work starts.

The six security items from the same sweep (setup bootstrap cookie, Neon key during setup, first password without a fresh session, member challenge codes as plain sha256, disabled modules still routed, `users.manage` role ceiling) were fixed in the same working tree and are not repeated here.

## Behaviour bugs

1. **Vercel team projects may never show a deploy as running** (unverified). `lib/vercel/deploy.ts` `listVercelDeployments` and `getVercelDeploymentState` never pass `teamId`, though the same file says team projects need it, and `listLatestDeployment` / `createRedeploy` do pass it. If so, on a team-owned project the in-flight gate always says "nothing running" and reconcile stays UNKNOWN. Fix: resolve with `resolveVercelTeamId(token, projectId)` and append `&teamId=`; thread `projectId` into `getDeploymentState`. Cost: one extra API call on frequent polls unless cached. Needs a real team project to confirm.

2. **Two people uploading same-named files at once can overwrite each other.** `lib/media/upload.ts` `buildLibraryUploadKey` plus `/upload-url` and `/record` only treat a key as taken once its row exists, which is after the upload. The sweep added a one-tab queue in `lib/media/upload-client.ts`; two tabs or two people are still exposed. Fix: reserve the key when it is signed (placeholder Media row or a short-lived reservation table), or a conditional PUT (`If-None-Match: *`) where the provider supports it. Needs a schema change or new placeholder-row behaviour.

3. **Moving a library file re-mints an exact filename into the nanoid form.** `lib/media/organise.ts` `moveOrRenameMedia` is called from PATCH `/[id]` and `/move` without `exactName`, so `photo.jpg` becomes `V1St...-photo.jpg` on every move, while a folder rename keeps the exact form. References are rewritten, so nothing breaks; urls and names are just inconsistent. Fix: pass `exactName: isExactNameKey(media.key, media.originalName)` when the wanted key is free, as `relocateWithinSameFolder` does.

4. **Forced "purge missing rows" skips detaching references.** `lib/media/reconcile.ts` `purgeMissingRows(force)` deletes rows without `detachMediaReferences`, unlike a forced library delete, so module gallery rows and site-config ids are left naming a deleted row. Low impact (the file had already gone). Fix: detach rows that still have references before the `deleteMany`.

5. **Two module seams ignore whether a module is switched on.** `lib/agent-content/providers.ts` and `lib/inventory/adjusters.ts` read the generated extension map with no `INSTALLED_MODULE_WHERE` gate, unlike every other seam, so a built-but-disabled module may still answer `/llms.txt` or move stock. Unverified whether a disabled module stays in the built map. Fix: gate on installed manifests as the conversations and dialler resolvers do.

6. **`pages.write` can change a published markdown page's live content directly.** `app/api/admin/pages/[id]/route.ts` PATCH lets title, slug and body of a published markdown page be edited without `pages.publish`. Design question: route edits on published pages through a draft, or require `pages.publish`.

7. **Markdown escaping before parsing.** `lib/markdown-client.ts` and `lib/sanitize.ts` escape `<` and `>` before `marked`, so code spans show a literal `&lt;` and `>` blockquotes never parse. Both do it the same way on purpose; fixing it means sanitising after parsing instead.

8. **Page pickers fetch every page.** `app/api/admin/pages/route.ts` GET has no search parameter, so the menu page picker and the layout display-conditions picker (fixed in the sweep to see more than the newest 25/30 pages) now page through every info page in the browser. Fine for normal sites, wasteful for thousands of pages. Fix: optional `q` (title/slug `contains`, case-insensitive) and send it from both pickers.

9. **Menu external links accept `javascript:` urls.** React 19 refuses to render them as hrefs, so the public menu is safe, but any other renderer of menu items (emails, feeds, a future non-React path) would not be. Fix: validate the scheme on save.

9a. **Two simultaneous first-time create-admin calls can both create an Admin.** `app/api/setup/create-admin/route.ts` checks "no protected user yet" then creates, with no lock. Only reachable in the first seconds of a fresh install. Fix: a Postgres advisory lock (`pg_advisory_xact_lock`) around the check and create, no schema change needed.

9b. **Extension-point providers still reach disabled modules.** The sweep gated every router path (API, admin pages, public pages, feeds, sitemap, robots, head), but module code called through extension-point registries (see item 5, plus any other generated provider map) does not ask whether the module is switched on. Same fix as item 5, applied to every generated provider map.

9c. **A finished setup can leave an admin with no way to sign in.** If the admin is created but the passkey step fails, a reload shows the wizard's "admin already exists" mode, which completes setup with no credential enrolled. The owner then needs the recovery email. Fix: in that mode, let the browser holding the setup cookie retry the passkey or authenticator step before completing.

## Design and accessibility

10. **Dark-mode primary buttons fail contrast.** In the default theme's dark mode `--color-primary` is cactus-400 (#459578) and `--color-on-primary` stays #ffffff, about 3.6:1 (hover cactus-300 is worse), below AA for button text. Fix: a dark `--color-on-primary` (for example cactus-950) in both dark blocks of `app/globals.css`. Design decision.

## Watch points from the sweep's own fixes

11. **Email wrapper blocks now escape every merge value.** `lib/email/blocks.ts` EmailText, EmailTwoColumn and EmailFooterText escape values (they did not before, which let typed markup through). A template's `rawTags` (pre-built markup such as an order table) are still raw in the body, but now escaped if an owner places one in a shared wrapper block. Unlikely, since a wrapper serves every template; worth knowing if someone reports a table showing as code in a footer.

12. **Header and footer display conditions now apply.** Homepage and URL path prefix rules on header/footer layouts were silently ignored before; any live site with such rules will start seeing them obeyed after updating.

## Not reviewed in depth (candidates for the next sweep)

- `app/cactus-admin`: most of ConfigPageClient beyond load/save, the media dialogs (Aspect, Resize, ImageEditor, VideoOptimise, VideoSettings, StorageCheck, FolderTree, ModelPreview, DetailPanel), EmailTemplatesClient beyond load and preview, privacy-generator, the rest of LayoutPuckEditor, layouts/new, the body of LoginForm.
- `lib/media`: model-optimise, model-palette-pin, cloudflare-deploy, fly-machines internals, swatch and rendition generation.
- `cactus-host`: monitor-* files, certificates, cloudflare, backups, snapshots, rename, create.
- `services/video-worker` (separate repo) and `workers/media-worker`.
- Pre-existing: the module-leak check (`git grep "modules/contact-form" -- ':!modules' ':!wiki' ':!.gitmodules'`) matches `lib/updates/core.plan.test.ts`. It is a test fixture string, not wiring, but the check as written in CLAUDE.md says it must return empty.
