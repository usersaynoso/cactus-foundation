# Google Shopping growth plan - reports, feed rules, shipping sync, health

Status: approved 2026-09-22. Stages run in order, 0 to 7. Each stage is left in the working tree for review - **no commit, push or release** unless the owner says so.

## Ground rules (every stage)

- Read `/Users/chris/Git Local/Cactus/CLAUDE.md` first and follow its work loop: `tsc --noEmit`, `eslint .`, relevant tests, all clean. Never `npm run build`.
- Nothing site-specific in core or any module. Every behaviour is a setting any install can switch on. Worked examples in comments are fine.
- Module schema change = new numbered idempotent migration (`modules/<name>/migrations/0NN_*.sql`), never edit an old one. Any migration touched means `npm run test:backup-roundtrip` must genuinely PASS (skip = fail; OVH creds exported per CLAUDE.md, never `source` the Deskwell `.env`). Update `lib/backup/serialize.ts` if a new column type appears.
- Any stage touching SQL: run `npm run test:ledger-guards` too.
- Update `FIELD_NOTES.md` (and wiki where CLAUDE.md says) for new routes, tables, settings, env vars, extension points.
- Module wiring leak check: `git grep "modules/google-shopping-for-shop" -- ':!modules' ':!wiki' ':!.gitmodules' ':!plans'` must be empty.
- Colours are tokens, AA contrast light and dark. British spelling, no em dashes in UI copy.
- Live database (Deskwell) is read-only for this work. No DDL by hand, ever.
- Google credentials: never print or log secrets. Store new ones the way the module already stores the service-account JSON (`/api/admin/env`).
- Each module has two version fields (`package.json`, `cactus.module.json`) - leave versions alone; release is a separate step.

## Where things are today (facts, 2026-09-22)

Module `modules/google-shopping-for-shop` (prefix `gsf_`, v0.1.24):
- Feed: `app/public/google-shopping/feed.xml/route.ts`, rebuilt per request by `lib/feed-data.ts` `collectFeedItems`; XML in `lib/feed-xml.ts`. Google fetches it; nothing is pushed.
- Google access: `lib/merchant-reports.ts` - service-account JWT, scope `https://www.googleapis.com/auth/content`, env `GOOGLE_SHOPPING_SERVICE_ACCOUNT_JSON` (fallbacks listed there). Only Merchant API Reports `product_view` + `price_competitiveness_product_view`, daily cron `cron/match-status` (05:30) and manual refresh. Stored in `gsf_item_match_status` / `gsf_item_match_history`.
- Workbench: `components/ShoppingWorkbench.tsx` + `components/workbench/*`, one screen, registered on `shop.products-tabs` (id `google-shopping-workbench`). Shop settings sub-tab pattern (`?sub=`) lives in `modules/shop/lib/admin/tab-url.ts`.
- Exclusion: manual `gsf_product_data.excluded` per parent only; one withholding rule (no image) in `lib/withholding.ts`, run after build; recorded by `lib/withheld.ts`.
- Title templates (`gsf_title_templates`, batches + undo in migration 015), identifiers (`lib/identifiers.ts`), `shipping_label` from a chosen attribute via `shop.product-attribute-values` (`lib/product-labels.ts`), optional per-item `<g:shipping>` via `send_delivery_options` (off by default), delivery timing read from advanced shipping via `shop.product-delivery-timing`.
- No custom labels, no item issues, no alerts, no general change log, no click tracking.

Module `modules/advanced-shipping-for-shop` (prefix `ash_`): services in `ash_service_tiers` (key, label, transit_days, min_lead_days); price/availability per (service, scope) in `ash_tier_scope_config` with scope RANGE / CATEGORY / SUPPLIER / DEFAULT, flat price **per unit**; shop-wide cut-off, dispatch lead days, ship days in `ash_settings`; holidays in `ash_holidays`. Resolution in `lib/resolve.ts`, timing in `lib/estimate.ts`. No destination (postcode/region) data.

Core/shop seams:
- Consent: `cactus-consent` cookie; client `lib/consent/gate.ts` (`hasConsent`, `cactus:consent-change`); server-side each module parses the cookie - copy `modules/abandoned-carts-for-shop/lib/consent.ts` (`mayCapture`, marketing).
- Conversion: client event `cactus:conversion` from `lib/analytics/conversion.ts`, fired on order confirmation. Observer point `shop.order-paid` (`modules/shop/lib/order-paid-hooks.ts`).
- Cron: manifest `cronJobs`, dispatched hourly by `/api/cron/dispatch`.
- Alerts: `upsertAlert` / `clearAlert` in `lib/notifications/alerts.ts`; email `sendTemplateEmail` in `lib/email/index.ts`, manifest `emailTemplates`.
- Live admin UI pattern: polling with visibility catch-up (`components/admin/NotificationBell.tsx`).
- Google Tag module (`modules/google-tag`) already sends Google Ads conversions from the browser (`adsConversionId`).

## Decisions (owner, 2026-09-22)

1. Shipping: push account-level shipping settings to Merchant Center from a Shipping tab (not per-item shipping).
2. Workbench gets sub-tabs; today's screen becomes **Products**; **Reports** is the default.
3. Click-to-sale attribution only for visitors with **marketing** consent; anonymous landing counts for everyone.
4. Google Ads API: build now. OAuth client, refresh token and customer ID exist on the site owner's side; developer token still to come. Build it gated on credentials being present.
5. Precedence: manual per-product choice beats rules; any matching Exclude wins over label actions; label/template/identifier rules apply in list order, first match per target field wins.
- Profit/margin reporting: **out of scope**.

---

## Stage 0 - Groundwork (google-shopping-for-shop)

1. Workbench sub-tabs inside `ShoppingWorkbench`: **Reports** (default, placeholder until stage 4), **Products** (current screen, unchanged behaviour), **Feed Rules**, **Shipping**, **Health**. URL param `?tab=google-shopping-workbench&sub=<id>`, default no param = Reports. Keep existing workbench query params working under Products. Placeholders say plainly what is coming.
2. Google client: refactor `lib/merchant-reports.ts` auth into a reusable `lib/google/` client (token cache, Merchant API base, typed errors, retry on 429/5xx with backoff). Existing reports behaviour unchanged; existing tests still pass; add tests for the client.
3. Access check: settings shows what the service account can do - reads reports OK, can read shipping settings, can write (needs Merchant Center admin/standard access). Plain-English guidance when missing.
4. General change log: `gsf_change_log` (id, area, action, summary, before jsonb, after jsonb, created_by, created_at, undone_at) with a small lib to write, list and undo by area. Title template batches stay as they are. Pruning like migration 015's.
5. Tests, checks, backup round-trip, FIELD_NOTES.

## Stage 1 - Feed Rules

1. Tables: `gsf_feed_rules` (id, name, enabled, position, conditions jsonb, action jsonb, created_by, timestamps). Conditions: nested groups `{ op: 'all'|'any', items: [condition|group] }`; condition `{ field, operator, value }`.
2. Fields: product and variation level - every attribute from `shop.product-attribute-values`, supplier, category (with ancestors), range, stock quantity, stock status, price, sale price, product status, has image, has GTIN, brand. Each field declares its level; a product-level field on a variation reads the parent (same inheritance the feed already uses).
3. Operators: equals, not equals, contains, not contains, is empty, is not empty, greater than, less than, in list.
4. Actions: `exclude`; `custom_label` (slot 0-4, value); `title_template` (template id or text); `identifiers` (identifier_exists no / MPN from SKU / brand override). Emit `custom_label_0..4` in the feed XML.
5. Evaluation: pure function over built feed items, run in `collectFeedItems` right after build and alongside `lib/withholding.ts`; precedence per Decision 5. Result carries the reason (rule id + name) per item.
6. Manual override: `gsf_product_data.excluded` boolean becomes tri-state (always include / always exclude / follow rules) via a new column, migrating true → always exclude. Per-variation override too. Update `GoogleShoppingPanel`.
7. UI (Feed Rules sub-tab): list with enable toggle, drag order, builder with AND/OR groups, field picker showing product vs variation, **preview before save** (counts + list of affected items), change log entries with undo.
8. Products sub-tab: "Excluded by rule: name" / "Label set by: name" on each row; filter by rule.
9. Workbench cache invalidation when rules change.
10. Tests: evaluator unit tests (nesting, precedence, inheritance, empty values), feed XML tests for custom labels.

## Stage 2 - Health and alerts

1. Pull item issues via Merchant API Reports `product_view` (item issues / status fields) in the existing cron + manual refresh; store `gsf_item_issues` (item id, code, severity, description, attribute, detected_at, resolved_at).
2. Feed fetch status via Merchant API data sources (latest file upload: state, item counts, issues) - needs the data source id; add a setting or discover by feed URL.
3. Health sub-tab: totals by severity, top issues, per-item list with reason and Merchant Center link (`lib/merchant-centre-url.ts`); Products sub-tab gets issue filters.
3b. "Explain this item" (owner added 2026-09-22): a button per item in the Health list fetches that item's full issue detail on demand from Merchant API `accounts.products` (`ProductStatus.itemLevelIssues`: description, detail, documentation, resolution, applicableCountries). One call per item, only on click, never in bulk. Fills and caches the existing `gsf_item_issues.description` / `documentation_url` columns; degrades honestly when Google gives nothing.
4. Alerts: `upsertAlert`/`clearAlert` for disapproval spike (threshold setting), feed fetch failed, shipping out of sync (wired in stage 3). Optional email to a setting-chosen address via a new email template. All thresholds are settings.

## Stage 3 - Shipping sync (advanced-shipping-for-shop + google-shopping-for-shop)

1. advanced-shipping: new extension point provider (e.g. `shop.delivery-services-catalogue`) exposing services, per-scope prices and availability, timing (cut-off, ship days, dispatch lead, transit, min lead) and holidays. Generic, read-only.
2. google-shopping: new setting "shipping labels from delivery services" - each feed item's `shipping_label` = its resolved scope (range, else category, else supplier, else default) using the same resolution order as `ash/lib/resolve.ts`. Existing attribute-based label stays as the alternative.
3. Mapping: one Merchant Center shipping service per delivery service (name = service label, country = shipping country, currency GBP). Rate groups: scopes offering the service grouped by identical price, `applicableShippingLabels` = those labels, flat rate = price (gross of VAT per shop tax setting - confirm how the feed grosses up). Unavailable scopes not listed. Delivery times from cut-off, ship days, handling = dispatch lead (+ min lead where larger), transit = transit days. Respect Google limits; surface any overflow as "can't map exactly".
4. Diff: read current Merchant API `shippingSettings`; per service show Matches / Different (field-level) / Missing / Only in Google.
5. Push: preview, then read-merge-write with the etag; services Cactus doesn't manage are preserved untouched. Snapshot of the previous settings stored in `gsf_change_log`; undo = push the snapshot back (with etag check). Never push without the preview confirm.
6. Daily out-of-sync check feeding the stage 2 alert.
7. Document the per-unit vs per-order compromise in the UI.

## Stage 4 - Reports: Google figures

1. Daily import (cron + manual) of Merchant API `product_performance_view`: date, offer id, marketing method (ORGANIC / ADS), clicks, impressions, CTR, conversions -> `gsf_performance_daily`. Backfill 90 days on first run.
2. Best sellers: `best_sellers_product_cluster_view` / brand view for the shop's categories -> stored, shown with "in your catalogue / not in your catalogue".
3. Reports sub-tab (Google-reported section): KPIs free vs paid (today, 7, 30, custom range), per-product table, trend chart, price competitiveness moved in beside it. Clear "Google-reported, about a day behind" labelling.

## Stage 5 - Reports: live tracking and attribution

1. Feed setting "tag Shopping links": appends `utm_source=google&utm_medium=free_listing&utm_campaign=shopping` to `link`, and emits `ads_redirect` = link with `utm_medium=cpc`. Preserve existing query strings (variation links). Canonical tags unaffected - check the page cache (`lib/cache/page-cache.ts`) does not fragment on these params; if it does, fix generically.
2. Landing beacon: small client script on product pages (via an existing public slot/extension point - do not add module code to core `proxy.ts`) posts to a public module route when the URL carries our tag or `gclid`/`gbraid`/`wbraid`/`srsltid`. Classification: any click id -> paid; our free tag -> free.
3. Storage: `gsf_click_events` (id, product id, variant id, source free/paid, click id hash, landed_at, session key, user agent class, consented bool). Bot filtering (Storebot-Google, Googlebot, AdsBot, prefetch), dedupe per session per product within 30 min. Rate limit the public route.
4. Consent: anonymous event always (no click id, no persistent id without consent). With marketing consent: first-party cookie holding attribution id, 30 days, last click wins; store click id (gclid) for stage 7. **Owner decisions, 2026-09-23:** (a) withdrawing marketing consent ERASES the stored click id and attribution id (anonymous counts remain), and the consent check must run at the moment the sale is linked, not only at landing; (b) `srsltid` on its own counts as a FREE click, not paid - Google appends it to free Shopping clicks and to ordinary search results, so treating it as paid would overstate paid clicks. This supersedes "any Google click id -> paid" in item 2 above.
5. Sale link: on `cactus:conversion` the client posts order id + attribution id; server verifies the order belongs to the session/receipt access; `shop.order-paid` observer confirms and records value -> `gsf_attributed_orders`.
6. Reports sub-tab (live section): KPIs Deskwell-tracked free vs paid landings, attributed orders, revenue, conversion rate; live feed of recent landings with "converted" badges linking to the order; order view showing the click, time to purchase, landed product vs bought products. Poll every ~20 s with visibility catch-up.
7. Retention setting (default 13 months) with pruning in cron.

## Stage 6 - Instant price and stock updates

1. Find or add a generic shop signal for product price/stock/status change (observer extension point in `modules/shop`, fired from the product save paths, stock import, and order stock decrement). Generic, documented.
2. google-shopping: setting "push price and stock changes"; on signal, queue item ids; a short-debounced worker and an hourly cron send price, sale price and availability via Merchant API product inputs into a supplemental API data source (created/validated by the module). Respect feed rules (excluded items not pushed). Change log entries, error surfacing in Health.
3. Reconcile job hourly compares a sample against what was last sent.

## Stage 7 - Google Ads

1. Settings for Ads: customer id, login customer id (optional), developer token presence, OAuth client id/secret/refresh token stored like the service-account JSON. Env names: `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID`. Everything gated: missing token = friendly "not connected" state, no errors.
2. Spend: daily import via GAQL `shopping_performance_view` (product item id, cost, clicks, impressions, conversions) -> `gsf_ads_performance_daily`; Reports shows paid spend and cost per attributed sale (not profit).
3. Conversion upload: create (or reuse) an "Import from clicks" conversion action set as **secondary**; upload paid attributed orders that have a gclid and marketing consent with order id, value, currency, time; consent fields set. Idempotent by order id; retry and status in Health.
4. Cannot be tested against the live account until the developer token is added - build with unit tests on request building and a clear "untested against Google" note in the report.

## Done means

All stages built, checks clean, backup round-trip PASS where migrations changed, FIELD_NOTES/wiki updated, a final independent review of the whole change set, and a report listing: files changed per repo, migrations added, settings added, anything untested against Google and why, and what the owner must do (developer token, Merchant Center access level, switching settings on).
