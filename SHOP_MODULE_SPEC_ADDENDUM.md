# Shop Module Spec -- Addendum A
## Features: Back-in-Stock Notifications, Pre-orders, CSV Import/Export, Related Products and Upsells

This addendum extends `SHOP_MODULE_SPEC.md`. All conventions from the parent spec apply: `shp_` table prefix, `cuid()` IDs, British English, single JSON column on `SiteConfig` for config, optional Members integration throughout.

---

## A. Back-in-Stock Notifications

### A.1 Decisions

- Any visitor can subscribe using an email address only. No account required.
- Logged-in Members subscribe with one click (email pre-filled, no form entry needed).
- After a guest subscribes, an optional prompt offers them a Members account. Controlled by `shopConfig.backInStockAccountPrompt` (boolean, default `true`).
- When stock is restored (stock count goes from zero to any positive value, or out-of-stock behaviour changes from BLOCK to BACKORDER), all subscribers for that product are notified and their subscription is marked as fulfilled.

### A.2 [PROTECTED] Prisma models

```prisma
model ShpBackInStockSubscription {
  id          String    @id @default(cuid())
  productId   String
  product     ShpProduct @relation(fields: [productId], references: [id], onDelete: Cascade)
  email       String
  memberId    String?   // Nullable -- guest subscriptions have no member
  notifiedAt  DateTime? // Null until notification is sent
  createdAt   DateTime  @default(now())

  @@unique([productId, email])
  @@map("shp_back_in_stock_subscriptions")
}
```

Add the reverse relation to `ShpProduct`:

```prisma
backInStockSubscriptions ShpBackInStockSubscription[]
```

### A.3 Trigger logic

Back-in-stock notifications are triggered in two places:

1. When a product's `stockCount` is updated via `PUT /api/admin/shop/products/[id]` and the new value is greater than zero while the previous value was zero or null.
2. When a product's `outOfStockBehaviour` changes from `BLOCK` to `BACKORDER`.

On trigger, the platform:

1. Fetches all `ShpBackInStockSubscription` records for the product where `notifiedAt` is null.
2. Sends the `BACK_IN_STOCK` email template to each subscriber.
3. Sets `notifiedAt` to the current timestamp on each record.
4. Does not delete records -- fulfilled subscriptions are retained for reporting.

Notifications are sent inline at the time of the stock update, not via a cron job, to minimise latency. If the subscriber list is large (over 50), dispatch is queued via a background task pattern to avoid blocking the admin save action.

### A.4 API routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/shop/back-in-stock` | Public | Subscribe to a back-in-stock alert. Body: `{ productId, email }`. Returns 200 if already subscribed (idempotent). |
| DELETE | `/api/shop/back-in-stock` | Public | Unsubscribe via a signed token in the email link. |
| GET | `/api/admin/shop/back-in-stock` | `shop.products` or `shop.access` | List all subscriptions, filterable by product. Shows fulfilled and pending counts per product. |

### A.5 Email template

Add to the seeded `ShpEmailTemplate` records:

| Trigger | Recipient | Subject default |
|---|---|---|
| `BACK_IN_STOCK` | Subscriber | `{{productName}}` is back in stock |

Available merge tags: `{{productName}}`, `{{productUrl}}`, `{{productImage}}`, `{{shopName}}`, `{{unsubscribeUrl}}`.

The unsubscribe link uses a signed token (HMAC of `productId + email` using `ENCRYPTION_KEY`) so no database lookup is needed to validate it.

### A.6 shopConfig additions

```typescript
backInStockAccountPrompt: boolean // default: true
```

### A.7 Admin surface

Add a "Subscribers" count column to the product list view. Clicking it links to the back-in-stock admin route filtered to that product. No dedicated sidebar nav entry is needed -- this surfaces from the product list.

### A.8 Puck block

| Block | Props | Notes |
|---|---|---|
| `ShopBackInStockForm` | productId, buttonLabel? | Renders inline on out-of-stock product pages. Hidden automatically when product is in stock. |

---

## B. Pre-orders

### B.1 Decisions

- Payment is taken immediately at checkout, identical to a standard order.
- Pre-order status is a product-level flag, not an order-level concept. The order model records a snapshot of the expected dispatch date at the time of purchase.
- Expected dispatch date is displayed on the product page, in the cart, at checkout, and in the order confirmation email.
- Admins manage pre-order fulfilment from a dedicated filter on the orders list ("Pre-orders" tab).
- When the admin marks a pre-order as shipped, the standard `STATUS_SHIPPED` email is sent with no special pre-order messaging (the item has now dispatched -- the pre-order context is no longer relevant).

### B.2 [PROTECTED] Prisma schema additions

Add the following fields to `ShpProduct`:

```prisma
isPreOrder          Boolean   @default(false)
preOrderDispatchDate DateTime? // Expected dispatch date shown to shoppers
preOrderNote        String?   // Optional additional message shown on product page
preOrderMaxQuantity Int?      // Optional cap on pre-order units
preOrderCount       Int       @default(0) // Running count of units pre-ordered
```

Add the following field to `ShpOrderItem`:

```prisma
isPreOrder              Boolean   @default(false)
preOrderDispatchDate    DateTime? // Snapshot from product at time of order
```

### B.3 Checkout behaviour

When any item in the cart has `isPreOrder: true`:

1. The checkout displays a clearly labelled pre-order notice at the cart and order review steps. Example: "This order contains a pre-order item. Expected dispatch: 15 March 2026."
2. If the cart contains a mix of pre-order and in-stock items, the notice explains that all items will be held until the pre-order dispatches, or the shopper is prompted to place two separate orders. This behaviour is controlled by `shopConfig.preOrderMixedCartBehaviour` (see A.6 below).
3. The order confirmation email includes the `PRE_ORDER` template addendum block showing the expected dispatch date.
4. Payment proceeds identically to a standard order.

### B.4 Inventory interaction

If `trackInventory` is true on a pre-order product:

- `preOrderCount` increments on each purchase.
- If `preOrderMaxQuantity` is set and `preOrderCount` reaches it, `isPreOrder` is automatically set to false and the product moves to out-of-stock behaviour.
- `stockCount` is not decremented at purchase time for pre-order items. It is decremented when the admin marks the order as shipped.

If `trackInventory` is false, no quantity cap applies unless `preOrderMaxQuantity` is explicitly set.

### B.5 API routes

No new routes required. Pre-order fields are managed via the existing `PUT /api/admin/shop/products/[id]` endpoint. The orders list route gains a `preOrder=true` filter parameter.

### B.6 Email template addition

No new template trigger is created. The existing `ORDER_CONFIRMED` template gains a conditional block:

```
{{#if hasPreOrderItems}}
  Pre-order notice: Your order contains a pre-order item ({{preOrderItemName}}),
  expected to dispatch on or before {{preOrderDispatchDate}}.
{{/if}}
```

Available merge tags added: `{{hasPreOrderItems}}`, `{{preOrderItemName}}`, `{{preOrderDispatchDate}}`.

### B.7 shopConfig additions

```typescript
preOrderMixedCartBehaviour: "HOLD_ALL" | "PROMPT_SPLIT"
// HOLD_ALL: all items held until pre-order dispatches (default)
// PROMPT_SPLIT: shopper is prompted to place separate orders
```

### B.8 Admin surface

- Product editor gains a "Pre-order" toggle section below the inventory section, revealed when `isPreOrder` is true: dispatch date picker, optional note field, optional max quantity field, and a live counter showing units pre-ordered.
- Orders list gains a "Pre-orders" filter tab showing orders containing at least one pre-order item, sorted by expected dispatch date ascending.
- Dashboard widget gains a pre-order count chip if any active pre-orders exist, linking to the filtered orders list.

### B.9 Puck block additions

The existing `ShopProductDetail` block gains a pre-order badge and dispatch date display that renders automatically when `isPreOrder` is true. No new block is needed.

---

## C. CSV Product Import and Export

### C.1 Decisions

- Export covers the full catalogue: products, their categories, tags, collections, pricing, inventory, and SEO fields. Media URLs are included as comma-separated values in a single column.
- Import supports new product creation and updates to existing products (matched by SKU). Deletes are never performed via import.
- A column mapping step is provided for imports from third-party or supplier CSVs where column names differ from the Cactus format.
- Import runs as a background job. The admin sees a progress indicator and receives an email summary on completion showing rows created, rows updated, and rows skipped with reasons.
- A downloadable import template CSV is available from the import screen.

### C.2 [PROTECTED] Prisma model

```prisma
model ShpImportJob {
  id            String          @id @default(cuid())
  status        ShpImportStatus @default(PENDING)
  filename      String
  totalRows     Int             @default(0)
  processedRows Int             @default(0)
  createdCount  Int             @default(0)
  updatedCount  Int             @default(0)
  skippedCount  Int             @default(0)
  errors        Json?           // Array of { row: number, reason: string }
  columnMap     Json?           // User-defined column mapping
  createdBy     String          // Admin user ID
  startedAt     DateTime?
  completedAt   DateTime?
  createdAt     DateTime        @default(now())

  @@map("shp_import_jobs")
}

enum ShpImportStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

### C.3 CSV column specification

The Cactus native export format uses the following columns. All are included in the downloadable import template.

| Column | Required on import | Notes |
|---|---|---|
| `sku` | Yes (for updates); auto-generated if blank on create | Used as the unique match key for updates |
| `name` | Yes | |
| `type` | Yes | PHYSICAL, DIGITAL, or SERVICE |
| `status` | No | Defaults to DRAFT on import |
| `description` | No | Plain text or HTML |
| `short_description` | No | |
| `price` | Yes | Decimal, e.g. 19.99 |
| `compare_at_price` | No | |
| `cost_price` | No | |
| `tax_class` | No | Matches `ShpTaxClass.code` |
| `track_inventory` | No | true or false |
| `stock_count` | No | Integer |
| `low_stock_threshold` | No | Integer |
| `out_of_stock_behaviour` | No | BLOCK or BACKORDER |
| `weight` | No | Decimal |
| `weight_unit` | No | kg or lb |
| `categories` | No | Pipe-separated slugs, e.g. `clothing|menswear` |
| `tags` | No | Pipe-separated slugs |
| `collections` | No | Pipe-separated slugs |
| `meta_title` | No | |
| `meta_description` | No | |
| `image_urls` | No | Pipe-separated URLs; first is primary |
| `barcode` | No | |

### C.4 API routes

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/api/admin/shop/products/export` | `shop.products` | Streams a CSV export of the full catalogue. Accepts optional filters (status, category). |
| GET | `/api/admin/shop/products/import-template` | `shop.products` | Returns the blank import template CSV. |
| POST | `/api/admin/shop/products/import` | `shop.products` | Accepts a multipart CSV upload. Creates a `ShpImportJob` and returns the job ID immediately. Processing happens in the background. |
| GET | `/api/admin/shop/products/import/[id]` | `shop.products` | Returns the current status and progress of an import job. |

### C.5 Import processing detail

1. The uploaded CSV is stored temporarily via the Cloudflare Workers media pipeline.
2. A background worker reads the file row by row.
3. For each row: if a product with a matching SKU exists, it is updated. Otherwise a new product is created with status `DRAFT`.
4. Categories, tags, and collections named in the row are created if they do not already exist (matched by slug derived from the value).
5. Image URLs in `image_urls` are not re-uploaded -- they are stored as `VIDEO_URL` type media entries pointing to the external URL. Admins can replace them with hosted media after import.
6. On completion, an `IMPORT_COMPLETE` email is sent to the admin who initiated the job, summarising the result.
7. Import jobs older than 30 days are deleted by the existing retention cron (add this scope to the cron handler).

### C.6 Email template addition

| Trigger | Recipient | Subject default |
|---|---|---|
| `IMPORT_COMPLETE` | Admin who initiated | Product import complete: {{createdCount}} created, {{updatedCount}} updated |

### C.7 Admin surface

- A "Import / Export" button group on the products list header.
- Export triggers an immediate CSV download via the export route.
- Import opens a two-step modal: step 1 is file upload with a link to the import template; step 2 is the column mapping screen (shown only if the uploaded CSV headers do not exactly match the Cactus format). After submission the modal shows a live progress bar polling the import job route.
- A recent imports log below the button group shows the last five import jobs with status, row counts, and a link to the error detail for any that have skipped rows.

---

## D. Related Products and Upsells

### D.1 Decisions

- Each product has two curated lists: related products and upsell products.
- Each product also has a per-product mode toggle: "Manual" or "Automatic".
- In Manual mode, only the curated lists are shown. If a list is empty, nothing is shown.
- In Automatic mode, the platform falls back to same-category products when no manual curation exists. Admins can optionally exclude specific products from the automatic selection.
- Upsells appear in the cart and at the checkout review step. Related products appear at the bottom of the product detail page.
- Both lists have a configurable display limit (default 4).

### D.2 [PROTECTED] Prisma models

```prisma
model ShpRelatedProduct {
  productId   String
  relatedId   String
  position    Int        @default(0)
  product     ShpProduct @relation("ProductRelated", fields: [productId], references: [id], onDelete: Cascade)
  related     ShpProduct @relation("RelatedProduct", fields: [relatedId], references: [id], onDelete: Cascade)

  @@id([productId, relatedId])
  @@map("shp_related_products")
}

model ShpUpsellProduct {
  productId  String
  upsellId   String
  position   Int        @default(0)
  product    ShpProduct @relation("ProductUpsell", fields: [productId], references: [id], onDelete: Cascade)
  upsell     ShpProduct @relation("UpsellProduct", fields: [upsellId], references: [id], onDelete: Cascade)

  @@id([productId, upsellId])
  @@map("shp_upsell_products")
}

model ShpAutoExcludeProduct {
  productId  String
  excludedId String
  product    ShpProduct @relation("ProductAutoExclude", fields: [productId], references: [id], onDelete: Cascade)
  excluded   ShpProduct @relation("AutoExcludedProduct", fields: [excludedId], references: [id], onDelete: Cascade)

  @@id([productId, excludedId])
  @@map("shp_auto_exclude_products")
}
```

Add the following fields to `ShpProduct`:

```prisma
relatedMode         ShpRecommendationMode @default(AUTOMATIC)
upsellMode          ShpRecommendationMode @default(AUTOMATIC)
relatedLimit        Int                   @default(4)
upsellLimit         Int                   @default(4)
relatedProducts     ShpRelatedProduct[]   @relation("ProductRelated")
relatedOf           ShpRelatedProduct[]   @relation("RelatedProduct")
upsellProducts      ShpUpsellProduct[]    @relation("ProductUpsell")
upsellOf            ShpUpsellProduct[]    @relation("UpsellProduct")
autoExcludeProducts ShpAutoExcludeProduct[] @relation("ProductAutoExclude")
autoExcludedFrom    ShpAutoExcludeProduct[] @relation("AutoExcludedProduct")

enum ShpRecommendationMode {
  MANUAL
  AUTOMATIC
}
```

### D.3 Automatic selection logic

When a product is in `AUTOMATIC` mode and the curated list is empty, the platform:

1. Fetches the product's primary category (the first category in `ShpProductCategory` ordered by position).
2. Queries for active products in the same category, excluding the current product and any products in `ShpAutoExcludeProduct` for this product.
3. Orders by `ratingAverage` descending, then `createdAt` descending.
4. Returns up to `relatedLimit` or `upsellLimit` results.

If the product has no category, the automatic fallback returns nothing rather than an unrelated selection.

### D.4 API routes

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/api/shop/products/[slug]/related` | Public | Returns related products (manual or automatic, resolved server-side) |
| GET | `/api/shop/products/[slug]/upsells` | Public | Returns upsell products for cart/checkout display |
| PUT | `/api/admin/shop/products/[id]/related` | `shop.products` | Update related products list, mode, limit, and exclusions |
| PUT | `/api/admin/shop/products/[id]/upsells` | `shop.products` | Update upsell products list, mode, limit, and exclusions |

### D.5 Admin surface

The product editor gains a "Recommendations" section below the main content fields, split into two subsections: "Related Products" and "Upsells". Each subsection contains:

- A mode toggle (Manual / Automatic)
- A search-to-add product picker for the curated list, with drag-to-reorder and a remove button per item
- In Automatic mode: a secondary search-to-add exclusion list labelled "Exclude from automatic selection"
- A display limit input (number)

### D.6 Puck blocks

| Block | Props | Notes |
|---|---|---|
| `ShopRelatedProducts` | productId, heading?, layout? | Renders related products. Resolves manual or automatic server-side. Hidden if no results. |
| `ShopUpsellProducts` | heading?, layout? | Renders upsell suggestions. Reads from current cart context. Hidden if no results or empty cart. |

The `ShopProductDetail` block automatically includes the `ShopRelatedProducts` block below the product description. Editors can remove or reposition it in Puck.

The cart page and checkout review step automatically include `ShopUpsellProducts`. Editors can remove or reposition it in Puck.

---

## E. Schema summary (addendum models)

| Table | Purpose |
|---|---|
| `shp_back_in_stock_subscriptions` | Back-in-stock alert subscriptions |
| `shp_import_jobs` | CSV import job tracking |
| `shp_related_products` | Manual related product curation |
| `shp_upsell_products` | Manual upsell product curation |
| `shp_auto_exclude_products` | Per-product exclusions for automatic recommendations |

New fields on `shp_products`:

| Field | Feature |
|---|---|
| `isPreOrder` | Pre-orders |
| `preOrderDispatchDate` | Pre-orders |
| `preOrderNote` | Pre-orders |
| `preOrderMaxQuantity` | Pre-orders |
| `preOrderCount` | Pre-orders |
| `relatedMode` | Related products |
| `upsellMode` | Upsells |
| `relatedLimit` | Related products |
| `upsellLimit` | Upsells |

New fields on `shp_order_items`:

| Field | Feature |
|---|---|
| `isPreOrder` | Pre-orders |
| `preOrderDispatchDate` | Pre-orders |

---

## F. shopConfig additions (full list)

Add the following to the `ShpConfig` interface defined in the parent spec:

```typescript
// Back-in-stock
backInStockAccountPrompt: boolean // default: true

// Pre-orders
preOrderMixedCartBehaviour: "HOLD_ALL" | "PROMPT_SPLIT" // default: "HOLD_ALL"
```

---

## G. Email templates (addendum)

Add the following to the seeded `ShpEmailTemplate` records:

| Trigger | Recipient | Subject default |
|---|---|---|
| `BACK_IN_STOCK` | Subscriber | `{{productName}}` is back in stock |
| `IMPORT_COMPLETE` | Admin | Product import complete: {{createdCount}} created, {{updatedCount}} updated |

---

## H. Puck blocks (addendum full list)

| Block | Feature |
|---|---|
| `ShopBackInStockForm` | Back-in-stock notifications |
| `ShopRelatedProducts` | Related products |
| `ShopUpsellProducts` | Upsells |

These are registered in `lib/puck/module-components.ts` alongside the blocks listed in the parent spec.

---

## I. FIELD_NOTES.md additions (addendum)

Before closing, the agent must add to `FIELD_NOTES.md`:

- All five new `shp_` tables from this addendum
- All new fields on `shp_products` and `shp_order_items`
- All new API routes from this addendum
- The `BACK_IN_STOCK` and `IMPORT_COMPLETE` email template triggers
- The three new Puck blocks
- The two new `shopConfig` keys
- The import job retention scope added to the existing retention cron

---

*End of SHOP_MODULE_SPEC_ADDENDUM.md*
