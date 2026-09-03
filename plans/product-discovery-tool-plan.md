# Product Discovery Tool - guided buying flow module - implementation plan

Status: PLAN ONLY, nothing built. Written 2026-09-03, decisions settled the same day.
Scope: a new first-party module `product-discovery-tool` (prefix `pdt_`) giving shoppers a
three-step guided flow - product type, then sub-type, then features/finishes - with a written
explanation and a like-for-like comparison behind every choice, and a live-narrowing results
grid on the final step. Built generic for any Cactus shop; Deskwell is the first site to be
configured on it, in a separate second phase against the live install.
Repo: `https://github.com/cactus-foundation-modules/product-discovery-tool`.

**Decisions taken (do not re-open):**
1. Step 3's vocabulary is `filters-for-shop`'s own - hard dependency, no second vocabulary.
2. Several flows per site, each at its own address.
3. The browse tree is hand-built, pointing at categories / collections / tags / filters. It is
   never a mirror of the category tree.
4. A finish CTA exists but is **off unless configured**. Deskwell does not run
   `quote-for-shop`, so Deskwell's flow ends at the results and nothing else.
5. Insights ship in v1, aggregate counters only.

**Module name deliberately does not end `-for-shop`.** The repo Chris created is
`product-discovery-tool`, and the manifest name, the module directory, the `/api/m/` path and
the art filename all follow the repo rather than the convention. Precedent exists both ways
(`live-chat` / `live-chat-powered-by-chatwoot`).

---

## 1. What already exists (recon)

The narrowing engine is built. `filters-for-shop` v0.1.48 has:

- `flt_groups` -> `flt_filters` -> `flt_filter_rules`, where a rule is a `(source, option
  name, value label)` triple. `source` is `OPTION` (shop-variations option values) or
  `ATTRIBUTE` (product-attributes values); a `PRICE`-kind group carries bands instead of
  rules. One "Blue" therefore covers "Stevia Blue" on every product, present and future.
- `lib/db/matching.ts` `getProductFilterMatches(productIds, groups, urlStyle)` returning
  `{ matrix, combos, swaps }` - which filters each product matches, which filters each single
  *variation* resolves (so "red" + "leather" must be true of the same variation, not of the
  listing), and the representative variation's photo and deep link per filter.
- `lib/grid-build.ts` - `applyPriceBands`, `internVariations` (the wire format; spelled out,
  a whole-catalogue page carries about a megabyte of repeated UUIDs), `offerGroups`.
- `components/public/FilterShell.tsx` - server renders every card once in the shop's own
  Product Card layout, the client shows/hides/re-dresses them in place. Counts, sorting,
  query-string state, card image swapping, paging over the *filtered* set through the
  `loadFilterGridCards` server action.
- `flt_collections` - a saved starting selection at its own address with its own title, meta
  and designed intro, plus a `filterCollection` layout type and a root-slug claim.

`product-attributes-for-shop` owns the spec vocabulary (`pat_attributes`, `pat_attribute_values`,
`pat_product_values`) and feeds filters' `ATTRIBUTE` rule source.

Shop owns `shp_categories` (a tree, with `short_description`, `description`, `description_puck`,
`image_url`), collections, tags and suppliers, and the `shopProductCard` layout type the cards
are stamped with.

**So the discovery tool is not a second filtering engine.** It is a guided front end over the one that
exists, plus the thing filters deliberately has none of: teaching copy. Everything new in this
module is content, sequencing and interface.

---

## 2. Shape of the module

Repo: `cactus-foundation-modules/product-discovery-tool`, prefix `pdt_`.

```
"requiresModules": [
  { "name": "shop",             "minVersion": "0.1.377" },
  { "name": "filters-for-shop", "minVersion": "0.1.48"  }
]
```

`shop-variations` and `product-attributes-for-shop` are NOT declared: filters already requires
variations, and attributes are optional there too. The tool never reads either directly.

Isolation, per the standing rule: the tool adds **no column, table, migration or UI** to
shop or to filters. It reads their rows (cross-module reads are fine - it hard-depends on both)
and owns 100% of its own. Nothing about it appears in core.

`requiresCoreVersion`: whatever release ships last of the core capabilities used (layout types,
settings tabs, root-slug claims, extension points all exist today, so it can pin the current
core at build time).

---

## 3. Schema - `migrations/001_initial.sql`

All idempotent, every later change a new numbered file.

### `pdt_flows`
One configured tool. Several are allowed - "Find your desk" and "Find your chair" can be
separate flows with separate addresses - and a site that wants one covering everything simply
has one.

```
id, name, slug (bare root address: /find-your-desk),
status DRAFT|PUBLISHED,
heading, standfirst, intro_puck JSONB,
scope_type ALL|CATEGORY|COLLECTION|TAG, scope_slug TEXT,   -- products the tool can reach
meta_title, meta_description, og_image, noindex,
show_prices BOOL, allow_skip BOOL, results_per_page INT,
finish_cta_label, finish_cta_href,                          -- both NULL = no CTA at all
position, created_at, updated_at
```

**The finish CTA is opt-in and blank by default.** Label and address both empty means the
results are the end of the flow, which is what Deskwell gets: `quote-for-shop` is not installed
there, and a flow must never end on a button pointing at a module the site does not run. The
admin only offers the field, never a default value, and never infers one from an installed
module.

`scope_slug` is a slug and not a foreign key, for the reason `flt_collections` gives: shop owns
those tables and a dependent module has no business constraining a rename. A slug pointing at
nothing shows as a warning in the admin.

### `pdt_nodes`
The browse tree behind the early steps. Self-referencing, so depth 1 is "Desks, Tables, Chairs,
Storage, Accessories" and depth 2 is "Rectangular, Height adjustable, Corner...". Depth is not
fixed at two - a site with a simpler catalogue can have one level, and the wizard's step count
follows the tree.

```
id, flow_id -> pdt_flows ON DELETE CASCADE,
parent_id -> pdt_nodes ON DELETE CASCADE,
label, slug,                       -- slug is the query-string value
blurb TEXT,                        -- one line on the card
explainer TEXT,                    -- "what this is", the long version
best_for TEXT, not_for TEXT,       -- the comparison table's two useful columns
image_url TEXT, icon TEXT,
scope_type CATEGORY|COLLECTION|TAG|FILTERS|ALL, scope_slug TEXT,
position, created_at, updated_at
```

Uniqueness is an expression index, not a constraint:
`CREATE UNIQUE INDEX ... ON pdt_nodes (flow_id, COALESCE(parent_id, ''), slug)`. A plain
`UNIQUE (flow_id, parent_id, slug)` is no constraint at all on root nodes, because Postgres
treats every NULL as distinct from every other - two root "Desks" would both save. Same trap,
same fix, on the two tables below with a nullable `node_id`.

`scope_type = FILTERS` matters: a Deskwell desk "type" is sometimes a category (Corner desks)
and sometimes a filter tick (Height adjustable). Both must work, and one node can do both -
narrow to a category *and* arrive with filters ticked.

### `pdt_node_filters`
Filters a node applies the moment it is chosen.

```
id, node_id -> pdt_nodes CASCADE, filter_id -> flt_filters CASCADE, position
UNIQUE (node_id, filter_id)
```

A real foreign key this time, exactly as `flt_collection_filters` does: these are this module's
own rows, so a filter deleted in the filters admin takes its preselection with it rather than
leaving a step selecting something that no longer exists.

### `pdt_questions`
Step 3's curation. Which filter groups are asked, in what order, with what wording. Rows are
optional - a group with no row still appears, in the filters module's own order, after the
curated ones - so a shop gets a working step 3 before anybody writes a word.

```
id, flow_id CASCADE, node_id -> pdt_nodes CASCADE NULL,   -- NULL = every node
group_id -> flt_groups CASCADE,
heading TEXT,                       -- override the group name: "How much height do you need?"
explainer TEXT,                     -- what this feature is, before the options
importance PRIMARY|SECONDARY,       -- primary asked up front, secondary under "More options"
multi BOOL, position, hidden BOOL
```
`CREATE UNIQUE INDEX ... ON pdt_questions (flow_id, COALESCE(node_id, ''), group_id)`.

### `pdt_option_notes`
The teaching copy, per filter. Written once and reused by every flow, with an optional
node-scoped override for the cases where the same word means something different on a chair
than on a desk.

```
id, filter_id -> flt_filters CASCADE, node_id -> pdt_nodes CASCADE NULL,
explainer TEXT, best_for TEXT, watch_out TEXT,
image_url TEXT, learn_more_href TEXT
```
`CREATE UNIQUE INDEX ... ON pdt_option_notes (filter_id, COALESCE(node_id, ''))`.

The comparison table is **derived** from these three columns across a group's filters, not
stored separately. One place to write, and a comparison that cannot drift from the option cards
beside it.

### `pdt_stats`
Aggregate only - a counter per (flow, step key, choice key, day). No visitor row, no
identifier, no cookie, so it needs no consent category and says nothing about anybody.

```
flow_id -> pdt_flows CASCADE, day DATE, step_key TEXT, choice_key TEXT,
kind SHOW|PICK|REACH|FINISH|DEAD_END|RELAXED, count INT
PRIMARY KEY (flow_id, day, step_key, choice_key, kind)
```

`day` is the UTC date. The counters answer "which options does nobody pick" and "where do
people leave", and a day boundary an hour out changes neither answer; a per-site zone would
mean a second column and a conversion on every beacon for nothing. `DATE` is a udt the backup
serialiser already handles (`lib/backup/serialize.ts` TIME_OF_DAY), so the schema-coverage
backstop stays green.

Written with `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1` from a single
fire-and-forget route. Answers the question the owner actually has: which options nobody picks,
and where people leave.

### `pdt_settings`
Singleton: `zero_result_recovery BOOL`, `show_counts BOOL`, `compare_enabled BOOL`,
`swap_card_images BOOL`, `preselect_on_click BOOL`, `updated_at`.

`teardown` lists every table, children first.

---

## 4. Public experience

### Where it lives
- Puck block **`ProductDiscovery`** - the whole wizard, droppable on the flow's own layout type
  and on ordinary pages, so a site can put it on `/find-your-desk` or halfway down a landing page.
- Puck block **`ProductDiscoveryLauncher`** - a card/CTA that deep-links *into* the flow at a
  chosen node ("Find your desk" on the Desks category page, arriving at step 2 with Desks
  already answered).
- New layout type **`productDiscovery`** in `layoutTypes`, with a starter layout seeded on install
  (standing rule: a new layout type ships with a default layout - a hardcoded fallback page is
  not an acceptable resting state).
- `publicRootSlug` claim so a flow answers at a bare address, the way filter collections do.

### The three steps
Server work per step is the same shape as `ShopFilterGrid.rsc`: resolve the product set for the
current node, run `getProductFilterMatches`, band prices, intern the variations, render every
card once in the shop's own Product Card layout, hand the lot to a client shell.

**Step 1 and 2 (browse).** Cards for the node's children: image, label, one-line blurb, and a
live count of what lies behind it ("Height adjustable - 34 desks"). An info affordance on each
card opens the long explainer. A **Compare these** control opens a table of every sibling with
its "best for" and "watch out" lines side by side - the answer to "what is the difference
between a corner desk and a wave desk" without leaving the flow. "Not sure yet" skips the step
(when `allow_skip`), keeping every option live rather than guessing.

**Step 3 (features).** Products are on screen **before** anything is picked, exactly as asked.
Questions run down the side (or above, on a phone), primary ones open, secondary under "More
options". Every option shows:
- its swatch/photo and label,
- the count it would leave ("Oak - 12 of 34"),
- a one-line note, with the full explainer and the comparison table an affordance away.

Ticking narrows in the browser with no reload - `FilterShell`'s proven approach, cards shown,
hidden and re-dressed in place so the card design stays the shop's own. An option that would
leave nothing is **shown disabled with the reason**, never silently dropped: a guided flow is
supposed to teach, and a vanishing option teaches nothing.

### Things that make it feel finished rather than v1
- **Answer chips**: a running summary bar of every answer, each removable, each naming its step.
- **Never a dead end**: if a selection reaches zero, the shell relaxes the least-selective
  answer and says so - "Nothing matches all five. Here are 6 without *Glass top*." Configurable
  off.
- **Full deep-linking**: every answer in the query string, so back/forward work, a result set is
  shareable, and a launcher block can drop somebody in mid-flow. Also makes the flow linkable
  from a blog post or an email.
- **Preselected products**: a card click opens the product with the matching variation's options
  already chosen, borrowing filters' existing swap/preselect machinery - the shopper does not
  answer the same questions twice.
- **Sorting and paging** over what the answers left, through the same server-action window as
  the filter grid.
- **Compare products** at the end: tick two or three results, see them beside each other with
  the attributes the flow asked about as the rows. (Reads `pat_` values through filters'
  matrix - no new vocabulary.)
- **Mobile**: one step per screen, sticky "See 24 products" bar, thumb-reachable back.
- **Accessibility**: real fieldset/legend radio and checkbox groups, focus moved to the step
  heading on change, live region for the count, AA contrast in both themes, colour tokens only.
- **Performance**: one query pass per step, interned wire format, cards rendered once.
- **SEO**: the flow's own page has a title, meta description, og image, noindex switch and a
  designed intro; step state is a query string, so the tool never mints thin duplicate pages.
  (Filter collections already exist for the pages worth ranking.)

---

## 5. Admin experience

No new sidebar link. A **Product Discovery** tab on the shop's Products screen
(`shop.products-tabs`, the pattern filters uses), with sub-tabs:

1. **Flow** - the tree builder. Drag to reorder, nest, set each node's picture, blurb,
   explainer, best-for/watch-out, and what it selects (category / collection / tag / filters).
   Shows the live product count for every node as you build, so a node that catches nothing is
   obvious at once.
2. **Questions** - per node (or "every node"), which filter groups get asked, their order,
   their wording, primary or secondary.
3. **Guidance** - one row per filter in the whole filter vocabulary with a tick for "has an
   explanation". This is the coverage screen: it makes the missing copy visible instead of
   letting the flow ship half-explained. JSON export/import of the whole flow config lives
   here too.
4. **Insights** - `pdt_stats` rolled up: reach and drop-off per step, options nobody picks,
   dead ends hit.

Settings go where module settings go: a tab under Shop settings (`settingsTabs`, host
`shop.settings-sub-tabs`).

The **JSON import/export** is not a nicety. It is how Deskwell's configuration gets authored
and applied in phase 2 without hand-written INSERTs against a live customer database, and how
the same configuration can be re-applied or rolled back. Three rules make it usable:

- **Everything is referenced by slug, never by id.** A filter is `"colour/oak"` (group slug /
  filter slug), a category is its shop slug, a node is its path `"desks/height-adjustable"`.
  Ids differ between sites and are unreadable by the person writing the file; slugs are what
  the admin screens show and what the query string carries anyway.
- **Validate, then apply, as two steps.** `POST .../import?dryRun=1` resolves every reference
  and returns a report - each filter, category and collection slug that names nothing, each
  duplicate node path - and writes nothing. The real import refuses if the dry run would have
  reported anything. On a live site the report is read first, always.
- **Upsert by slug, in one transaction, whole flow or nothing.** A re-import of an edited file
  updates rows in place and deletes nodes the file no longer names (with their notes and
  questions), so the file is the truth. Option notes with no node scope are global and are
  matched on filter slug alone.

A CLI twin, `scripts/import-flow.mjs <file> [--dry-run]`, runs the same validation and write
code against `DATABASE_URL` for the case where there is no browser session to hand - which is
exactly phase 2's case. Same code path, so it cannot disagree with the button.

---

## 6. Files (indicative)

```
cactus.module.json
migrations/001_initial.sql
lib/types.ts                      pure shapes, shared editor/RSC/client
lib/db/{flows,nodes,questions,notes,stats,settings}.ts
lib/resolve.ts                    node path -> effective scope + locked filter ids (ancestors intersected)
lib/flow.ts                       pure: steps from a tree, answers <-> query string
lib/compare.ts                    pure: option notes -> comparison table rows
lib/recovery.ts                   pure: which answer to relax on zero results
lib/starterLayouts.ts             seeded productDiscovery layout
lib/root-slug.ts                  discoveryClaimsRootSlug
lib/sitemap.ts                    getPublicSitemapEntries - the exact export name the router generator scans for
lib/menu-entity-provider.ts       a flow is offered in the site menu editor like a category is
lib/import-export.ts              slug-referenced JSON in and out, validate-then-apply
scripts/import-flow.mjs           the CLI twin of the import endpoint
lib/cards-action.tsx              paging over the answered set
lib/media-reference-rewriter.ts   guidance images move with the media library
lib/media-usage-provider.ts       guidance images never read as "unused"
components/puck/ProductDiscovery{,.rsc}.tsx
components/puck/ProductDiscoveryLauncher{,.rsc}.tsx
components/public/DiscoveryShell.tsx        client wizard
components/public/{StepBrowse,StepFeatures,CompareTable,AnswerChips}.tsx
components/public/discovery-css.ts
components/admin/{DiscoveryTab,FlowScreen,QuestionsScreen,GuidanceScreen,InsightsScreen}.tsx
components/SettingsTab.tsx
app/api/admin/**                  flows, nodes, questions, notes, import, export, settings
app/api/public/stats/route.ts     fire-and-forget counter
app/root/[slug]/page.tsx          the flow's own address
```

The two media hooks are not optional: guidance pictures are media items, and without them a
moved blob breaks the flow's images and the media screen reports them as leftovers.

---

## 7. Build order

1. **Scaffold** - repo, manifest, `node scripts/install-module-ci.mjs product-discovery-tool`
   for the build gate, 001 migration, types, db layer.
2. **Admin** - flow tree, questions, guidance coverage, import/export, settings tab. Nothing
   public yet; the config has to be authorable before there is anything to render.
3. **Public** - layout type + seeded starter, root slug, `ProductDiscovery` RSC half over filters'
   matrix, `DiscoveryShell`, the three steps, results grid, paging, deep links.
4. **Depth** - comparison tables, zero-result recovery, product compare, launcher block,
   insights, a11y and dark-mode pass.
5. **Checks** - `tsc --noEmit`, `eslint .`, unit tests on every pure module (`flow`, `compare`,
   `recovery`, resolve's scope logic), and **the raw SQL actually executed against a throwaway
   `cactus_rt_*` database on the OVH VPS**: no standard gate ever runs a query, so a statement
   Postgres will not parse passes typecheck, lint, tests and the build gate alike.
6. **Ship it** - and this is one sequence, not a place to stop and ask:
   - commit and push the module to
     `https://github.com/cactus-foundation-modules/product-discovery-tool` (branch `main`,
     identity `airings.snug-0m@icloud.com` / `Chris Taylor-Guest`), staging only this work's
     files;
   - **set the repo description** with
     `gh repo edit cactus-foundation-modules/product-discovery-tool --description "..."` -
     draft below;
   - check the tag's build gate run (`gh run list --repo
     cactus-foundation-modules/product-discovery-tool --limit 3`) and only then
     `gh release create` with `--prerelease` and notes written for site owners;
   - README opening with the card art, wiki page, and `FIELD_NOTES.md`;
   - the card art is **already made and converted** (see below), so this step is only the two
     copies still outstanding: the module repo's `module-art.webp` and the README head;
   - add the module to core's `modules.json` and to the README module list, then cut the **core
     pin release**. A module release without its core pin is not finished.

   **Repo description** (one line, verbatim):
   > Guided product discovery for the Cactus shop: type, then sort, then features, every option explained. Requires the shop and filters-for-shop modules.

7. **Deskwell** (separate phase, on your word) - author the real configuration as JSON: the five
   product types, their sub-types, the copy that distinguishes each, which filter groups are
   asked where, and an explanation per option. Apply through the import endpoint on the live
   site, having backed up the `pdt_` tables first. No CTA at the end, because `quote-for-shop`
   is not installed there. Nothing hand-DDL'd, nothing else touched.

---

## 8. Card art - done

Generated from the house style block and converted 2026-09-03: three cream clay archways of
decreasing size forming a short tunnel, a single terracotta block resting at the far end of it.
Narrowing to one answer, which is the whole tool in one object.

- Source: `/Users/chris/Downloads/product-discovery-tool.jpg`, 1536x864.
- Converted with `magick ... -resize 1200x675^ -gravity center -extent 1200x675 -strip` then
  `cwebp -q 76 -m 6 -sharp_yuv`. **1200x675, 13.7 KB**, which is where the rest of the set sits.
- **Landed:** `public/module-art/product-discovery-tool.webp` in core (the file the admin Modules
  page actually reads - filename is the repo slug), and the prompt appended to
  `plans/module-card-art-prompts.md` as entry 35 with the count bumped.
- **Still outstanding**, because the module directory does not exist yet: `module-art.webp` in
  the module repo, and the `<p align="center"><img src="module-art.webp" ...></p>` block above
  the README's `# Title`. Both land during the scaffold step.

---

## 9. Edge cases and the rules that settle them

Written down here so no two files answer them differently.

**Scope and the tree**
1. **A node inherits its ancestors' scope.** The effective product set at
   `desks/height-adjustable` is Desks' category narrowed by Height adjustable's own scope, and
   its locked filters are the union of every ancestor's `pdt_node_filters`. `scope_type = ALL`
   on a child means "same products as my parent", not "the whole shop". Resolved by
   `lib/resolve.ts`, pure over the loaded tree, unit-tested.
2. **Two categories in one chain intersect**; they do not union. A child that names a category
   outside its parent's is a configuration error the admin flags with a live count of zero.
3. **Locked filters are not ticks.** A filter a node applies is what the node *is*; step 3 never
   offers it to be unticked, and a group every remaining product satisfies identically is not
   asked (filters' `offerGroups` rule, reused). Picking "Height adjustable" as a type must not
   then ask "Height adjustable?" as a feature.
4. **Branches can be different depths.** Accessories may have no sub-types. The step count is
   per branch: a node with no children goes straight to features. The progress bar says
   "Step 2 of 2" on that branch and "Step 2 of 3" on another, and that is correct, not a bug.
5. **Skipping a browse step** (when `allow_skip`) jumps to features over the scope reached so
   far - skip step 1 and step 3 runs over the whole flow scope, skip step 2 and it runs over the
   parent. Nothing is guessed on the shopper's behalf.
6. **Changing an earlier answer clears the later ones.** Removing the step 1 chip drops step 2
   and every feature tick, because they were chosen against a scope that no longer exists.
   Changing a feature tick clears nothing.
7. **Live counts on browse cards come from one pass, not one query per card.** Resolve the
   current node's product set and matrix once, then narrow it per child in memory. A step 1
   page with five types is one product query, not five.

**Filters and matching**
8. **Everything about matching is filters' own.** `getProductFilterMatches`, `applyPriceBands`,
   `internVariations`, `facetCount`, `matchesSelection`, `pickSwapFilters`, the swap pack and
   the deep-link preselect are imported, never copied. If one of them needs to change, it
   changes in filters, for every consumer.
9. **"Red" and "Leather" must be true of one variation**, not merely of the listing. The combos
   index does this in the filter grid and does it here for free.
10. **A product with no variations** is reached only through ATTRIBUTE and PRICE rules, because
    the OPTION matcher cannot see it. Same as the filter grid; documented, not fixed here.
11. **A PRICE group is a question like any other** - "What's your budget?" comes free, with
    bands the owner already drew.
12. **A shop with no filter groups yet** still gets a working flow: browse steps work, step 3
    shows the products with no questions, and the admin Questions tab says why.

**Zero results and recovery**
13. **The option that would leave nothing is shown, not hidden**, with `aria-disabled` (still
    focusable, so the reason can be read) and the count "0". Ticking it is refused with the
    reason inline. Browse cards with a live count of zero are hidden - a type nothing is filed
    under is a configuration gap, not a choice to explain.
14. **When a combination reaches zero anyway** (a deep link, or an answer that was fine until an
    earlier chip was removed), `lib/recovery.ts` offers the nearest sets: for each single answer,
    the count without it, best first, worded as "6 without *Glass top*". It never relaxes
    silently, and a DEAD_END counter is bumped so the Insights tab shows where it happens.

**Addresses and state**
15. **The query string is the whole state.** One parameter carries the browse path
    (`?pick=desks/height-adjustable`), and feature ticks use filters' own convention - the group
    slug as the parameter, filter slugs as values - so a step 3 URL is the same shape as a filter
    grid URL and the preselect code reads both. `pick`, `sort` and `page` are reserved. A
    filter group whose slug collides with one of them is NOT refused in filters' admin (filters
    is not edited for this module); it is read under a `q-` prefixed parameter here instead and
    flagged on the Questions tab.
16. **Back and forward work.** Every step change is a `pushState`; `popstate` restores the whole
    state from the query string, and a deep link with an unknown node path lands on step 1 with
    a quiet "we could not find that" line rather than a 404.
17. **Root-slug precedence is alphabetical by module name.** `filters-for-shop` is asked before
    `product-discovery-tool`, which is asked before `shop` - so a filter collection at the same
    slug wins over a flow, and a flow wins over a product or a post. Therefore a flow's slug is
    checked at **save time** against pages, module bases, filter collections, products,
    categories and posts, and refused with a sentence, the way `ensureUniqueCollectionSlug`
    does. A DRAFT flow still claims its slug (so staff can preview it); the page decides what a
    draft shows to whom.
18. **A launcher block names its target by slugs** (flow slug + node path) in plain text fields,
    not by id, because Puck fields are static configuration and slugs are what the editor can
    read. A launcher pointing at nothing renders nothing on the public side and a warning in the
    editor.

**Rendering**
19. **Editor half and RSC half emit identical markup** (standing invariant). The editor half
    renders the same shell over data fetched through this module's own admin API, exactly as
    `ShopFilterGrid.tsx` does; no second template.
20. **Cards are the shop's own Product Card layout**, rendered once on the server and shown,
    hidden and re-dressed in place. The flow never invents a card design.
21. **Guidance images are media items** - the rewriter keeps them pointing at the right blob
    when one moves, and the usage provider stops the media screen calling them leftovers.
22. **Colour tokens only**, AA in both themes, the site's tablet breakpoint decides when the
    questions become a sheet - `FilterShell`'s `tabletBp` approach.

**Insights**
23. **The beacon is cheap to send and cheap to refuse.** One unauthenticated POST via
    `sendBeacon`; the route checks the flow exists and the step/choice keys name something in
    its configuration, and drops anything else with a 204 - so row growth is bounded by the
    configuration, not by whoever is posting. No cookie, no id, no IP kept. Bot traffic will
    inflate SHOW counts somewhat; PICK, REACH and FINISH need a real click, and those are the
    ones that matter.

**Data lifetime**
24. **Deleting a filter or group in the filters admin** cascades this module's notes, questions
    and locked-filter rows. Renaming a group's slug changes deep links, which is true of the
    filter grid too and is accepted.
25. **Deleting a shop category** a node names leaves the node pointing at a slug that resolves to
    nothing: live count zero, warning in the Flow tab, card hidden on the public side. Deliberate
    - shop is not constrained by a dependent module.
26. **Teardown** drops `pdt_stats`, `pdt_option_notes`, `pdt_questions`, `pdt_node_filters`,
    `pdt_nodes`, `pdt_flows`, `pdt_settings`, in that order.

---

## 10. Risks and the answers to them

- **Copy is the product.** The code is a week; a hundred honest explanations of what a
  cantilever frame is are the actual work. Hence the coverage screen and the JSON round-trip -
  the flow can ship with the copy landing in tranches, and it never pretends to explain
  something it has not.
- **Deskwell's filter vocabulary decides how good step 3 is.** If a distinction is not
  expressible as a filter today, it needs a filter (in the filters module, where filters live) -
  not a private one here.
- **A node that catches nothing** is the obvious failure mode of a hand-built tree. Live counts
  in the builder, and a warning on a node whose slug names a category that no longer exists.
- **Two things claiming the same address.** Root-slug claims are checked in order; this module's
  claim must refuse a slug already taken by a page, product, category or filter collection, and
  the admin must say so at save time rather than at request time.
