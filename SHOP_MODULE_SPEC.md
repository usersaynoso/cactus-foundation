# Shop Module Spec -- Cactus Foundation
## Module ID: `shop` | Table prefix: `shp_` | Version target: v0.1.0

---

## 0. Pre-implementation checklist

Before writing any code the agent must:

1. Read `FIELD_NOTES.md` and `CLAUDE.md` in full.
2. Read the Gazette and Boards modules as pattern references.
3. Flag any item marked **[PROTECTED]** in this spec with a code comment before implementing it. Protected categories are: Prisma schema changes, payment provider integrations, webhook handlers, session/auth logic, and permission enforcement.
4. Commit all work before any push. Never push to the Tester repo. Only push to the main repo when Chris explicitly asks.
5. Update `FIELD_NOTES.md` to reflect all new routes, models, permissions, env vars, components, and cron jobs before closing.

---

## 1. Overview

The `shop` module is a full-featured ecommerce foundation for Cactus. It handles the entire purchase lifecycle: product catalogue, checkout, payment processing, order management, and customer accounts. It is designed to be extended by future bolt-on modules (product variations, product bundles, promotions enhancements, international sales, shipping carrier integrations, a returns workflow, and a reviews media extension).

The module works standalone. It integrates optionally with the Members module (customer accounts, saved addresses, order history, verified purchase badges) and optionally with the Reply Catcher module (customer communication on order detail pages).

---

## 2. Decisions summary

| Topic | Decision |
|---|---|
| Product types | Physical, digital, and services |
| Catalogue | Hierarchical categories + tags + collections |
| Media | Multiple images, optional video upload and video URL, variant images deferred |
| Inventory | Stock count with low-stock threshold and out-of-stock behaviour (block or backorder) |
| Pricing | Price, compare-at price, cost price, tax classes |
| Discounts | Coupon codes, automatic discounts, free shipping threshold |
| Checkout | Fully configurable (Puck-editable with locked anchor fields) |
| Shipping | Postcode/zip-based zones, flat rate, free shipping threshold |
| Orders | Full CRUD, status management, notes, customer comms (Reply Catcher optional), reporting widget |
| Payments | Provider interface: Stripe, PayPal, bank transfer, cash -- all fully built |
| Refunds | Per-item refunds; automated via API for Stripe and PayPal; manual for bank transfer and cash |
| Customer accounts | Optional Members integration; saved addresses; order history; guest always supported |
| Tax | Tax classes, inclusive/exclusive mode, per-zone rates, CSV export |
| Emails | Order confirmation, status updates, admin alerts, low-stock alerts, editable templates |
| Puck | Full block set including checkout blocks; payment/order-summary fields are non-removable anchors |
| SEO | Configurable base path, meta fields, sitemap, schema.org Product JSON-LD |
| Reviews | Star ratings, written reviews, admin moderation, verified purchase badge (Members required) |
| Admin nav | `navGroupLabel: "Shop"`, settings via `settingsTabs` on core config page |
| Dashboard | Widget via `core.admin-dashboard-widgets` extension point |
| Permissions | Granular: `shop.access`, `shop.manage`, `shop.products`, `shop.orders`, `shop.customers`, `shop.discounts`, `shop.reports` |
| Settings storage | `shopConfig` JSON column on `SiteConfig` singleton |
| Table prefix | `shp_` |
| Implementation | Single pass |

---

## 3. Permissions

Register the following permission keys. All are gated in both API routes and admin UI.

| Key | Description |
|---|---|
| `shop.access` | Read-only access to orders, products, and customers |
| `shop.manage` | Full shop management (supersedes all other shop keys) |
| `shop.products` | Create, edit, and delete products, categories, tags, and collections |
| `shop.orders` | View and manage orders and refunds |
| `shop.customers` | View and manage customer records |
| `shop.discounts` | Create and manage coupon codes and automatic discount rules |
| `shop.reports` | Access tax exports and revenue reporting |

---

## 4. Environment variables

Add the following to `.env.example` and document in `FIELD_NOTES.md`.

```
# Shop module -- Stripe
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Shop module -- PayPal
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
PAYPAL_MODE=sandbox # or live
```

No new env vars are needed for bank transfer or cash payment methods.

---

## 5. [PROTECTED] Prisma schema

Add all models below to `prisma/schema.prisma`. All IDs use `cuid()`. Run migrations at build time only -- no runtime schema mutations.

### 5.1 Product model

```prisma
model ShpProduct {
  id              String            @id @default(cuid())
  name            String
  slug            String            @unique
  type            ShpProductType    // PHYSICAL | DIGITAL | SERVICE
  status          ShpProductStatus  // DRAFT | ACTIVE | ARCHIVED
  description     String?           @db.Text
  shortDescription String?
  sku             String?           @unique
  barcode         String?

  // Pricing
  price           Decimal           @db.Decimal(10, 2)
  compareAtPrice  Decimal?          @db.Decimal(10, 2)
  costPrice       Decimal?          @db.Decimal(10, 2)
  taxClassId      String?
  taxClass        ShpTaxClass?      @relation(fields: [taxClassId], references: [id])

  // Inventory (physical only)
  trackInventory  Boolean           @default(false)
  stockCount      Int?
  lowStockThreshold Int?
  outOfStockBehaviour ShpOutOfStockBehaviour @default(BLOCK) // BLOCK | BACKORDER

  // Physical dimensions
  weight          Decimal?          @db.Decimal(10, 3)
  weightUnit      String?           // kg | lb
  dimensionL      Decimal?          @db.Decimal(10, 2)
  dimensionW      Decimal?          @db.Decimal(10, 2)
  dimensionH      Decimal?          @db.Decimal(10, 2)
  dimensionUnit   String?           // cm | in

  // Digital
  digitalFileId   String?
  digitalFile     ShpDigitalFile?   @relation(fields: [digitalFileId], references: [id])
  downloadLimit   Int?
  downloadExpiry  Int?              // days after purchase

  // SEO
  metaTitle       String?
  metaDescription String?
  ogImageId       String?

  // Aggregate rating (populated by reviews)
  ratingAverage   Decimal?          @db.Decimal(3, 2)
  ratingCount     Int               @default(0)

  media           ShpProductMedia[]
  categories      ShpProductCategory[]
  tags            ShpProductTag[]
  collections     ShpProductCollection[]
  reviews         ShpReview[]
  orderItems      ShpOrderItem[]

  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  @@map("shp_products")
}

enum ShpProductType {
  PHYSICAL
  DIGITAL
  SERVICE
}

enum ShpProductStatus {
  DRAFT
  ACTIVE
  ARCHIVED
}

enum ShpOutOfStockBehaviour {
  BLOCK
  BACKORDER
}
```

### 5.2 Media

```prisma
model ShpProductMedia {
  id          String      @id @default(cuid())
  productId   String
  product     ShpProduct  @relation(fields: [productId], references: [id], onDelete: Cascade)
  type        ShpMediaType // IMAGE | VIDEO_FILE | VIDEO_URL
  url         String      // Cloudflare Workers URL for images/video files, or embed URL
  altText     String?
  position    Int         @default(0)
  isPrimary   Boolean     @default(false)
  createdAt   DateTime    @default(now())

  @@map("shp_product_media")
}

enum ShpMediaType {
  IMAGE
  VIDEO_FILE
  VIDEO_URL
}
```

### 5.3 Categories

```prisma
model ShpCategory {
  id          String        @id @default(cuid())
  name        String
  slug        String        @unique
  description String?
  parentId    String?
  parent      ShpCategory?  @relation("CategoryTree", fields: [parentId], references: [id])
  children    ShpCategory[] @relation("CategoryTree")
  position    Int           @default(0)
  metaTitle       String?
  metaDescription String?
  ogImageId       String?
  products    ShpProductCategory[]
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@map("shp_categories")
}

model ShpProductCategory {
  productId   String
  categoryId  String
  product     ShpProduct  @relation(fields: [productId], references: [id], onDelete: Cascade)
  category    ShpCategory @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@id([productId, categoryId])
  @@map("shp_product_categories")
}
```

### 5.4 Tags

```prisma
model ShpTag {
  id       String          @id @default(cuid())
  name     String          @unique
  slug     String          @unique
  products ShpProductTag[]

  @@map("shp_tags")
}

model ShpProductTag {
  productId String
  tagId     String
  product   ShpProduct @relation(fields: [productId], references: [id], onDelete: Cascade)
  tag       ShpTag     @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([productId, tagId])
  @@map("shp_product_tags")
}
```

### 5.5 Collections

```prisma
model ShpCollection {
  id          String        @id @default(cuid())
  name        String
  slug        String        @unique
  description String?
  imageId     String?
  position    Int           @default(0)
  metaTitle       String?
  metaDescription String?
  ogImageId       String?
  products    ShpProductCollection[]
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@map("shp_collections")
}

model ShpProductCollection {
  productId    String
  collectionId String
  position     Int         @default(0)
  product      ShpProduct  @relation(fields: [productId], references: [id], onDelete: Cascade)
  collection   ShpCollection @relation(fields: [collectionId], references: [id], onDelete: Cascade)

  @@id([productId, collectionId])
  @@map("shp_product_collections")
}
```

### 5.6 Tax

```prisma
model ShpTaxClass {
  id       String       @id @default(cuid())
  name     String       // e.g. "Standard Rate", "Zero Rate", "Exempt"
  code     String       @unique // e.g. STANDARD | REDUCED | ZERO | EXEMPT
  products ShpProduct[]
  zoneRates ShpTaxZoneRate[]

  @@map("shp_tax_classes")
}

model ShpShippingZone {
  id          String          @id @default(cuid())
  name        String
  postcodes   String[]        // Array of postcode prefixes or exact codes
  shippingRates ShpShippingRate[]
  taxRates    ShpTaxZoneRate[]
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  @@map("shp_shipping_zones")
}

model ShpTaxZoneRate {
  id         String          @id @default(cuid())
  zoneId     String
  taxClassId String
  rate       Decimal         @db.Decimal(5, 4) // e.g. 0.2000 = 20%
  zone       ShpShippingZone @relation(fields: [zoneId], references: [id], onDelete: Cascade)
  taxClass   ShpTaxClass     @relation(fields: [taxClassId], references: [id], onDelete: Cascade)

  @@unique([zoneId, taxClassId])
  @@map("shp_tax_zone_rates")
}
```

### 5.7 Shipping

```prisma
model ShpShippingRate {
  id              String          @id @default(cuid())
  zoneId          String
  zone            ShpShippingZone @relation(fields: [zoneId], references: [id], onDelete: Cascade)
  name            String          // e.g. "Standard", "Express"
  type            ShpShippingRateType // FLAT | WEIGHT_BASED | FREE
  flatRate        Decimal?        @db.Decimal(10, 2)
  weightRates     Json?           // Array of { upToKg: number, rate: number }
  freeThreshold   Decimal?        @db.Decimal(10, 2) // Free if order subtotal >= this
  estimatedDays   String?         // e.g. "3-5 business days"
  position        Int             @default(0)
  isActive        Boolean         @default(true)

  @@map("shp_shipping_rates")
}

enum ShpShippingRateType {
  FLAT
  WEIGHT_BASED
  FREE
}
```

### 5.8 Digital files

```prisma
model ShpDigitalFile {
  id          String       @id @default(cuid())
  filename    String
  url         String       // Cloudflare Workers URL
  size        Int          // bytes
  mimeType    String
  products    ShpProduct[]
  downloads   ShpDigitalDownload[]
  createdAt   DateTime     @default(now())

  @@map("shp_digital_files")
}

model ShpDigitalDownload {
  id          String          @id @default(cuid())
  orderId     String
  orderItemId String
  fileId      String
  order       ShpOrder        @relation(fields: [orderId], references: [id])
  orderItem   ShpOrderItem    @relation(fields: [orderItemId], references: [id])
  file        ShpDigitalFile  @relation(fields: [fileId], references: [id])
  token       String          @unique @default(cuid())
  downloadCount Int           @default(0)
  expiresAt   DateTime?
  createdAt   DateTime        @default(now())

  @@map("shp_digital_downloads")
}
```

### 5.9 Discounts

```prisma
model ShpCoupon {
  id              String          @id @default(cuid())
  code            String          @unique
  type            ShpDiscountType // PERCENTAGE | FIXED_AMOUNT | FREE_SHIPPING
  value           Decimal?        @db.Decimal(10, 2)
  minimumOrderValue Decimal?      @db.Decimal(10, 2)
  usageLimit      Int?
  usageCount      Int             @default(0)
  perCustomerLimit Int?
  startsAt        DateTime?
  expiresAt       DateTime?
  isActive        Boolean         @default(true)
  orders          ShpOrder[]
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@map("shp_coupons")
}

model ShpAutomaticDiscount {
  id              String          @id @default(cuid())
  name            String
  type            ShpDiscountType
  value           Decimal?        @db.Decimal(10, 2)
  minimumOrderValue Decimal?      @db.Decimal(10, 2)
  freeShippingThreshold Decimal?  @db.Decimal(10, 2)
  startsAt        DateTime?
  expiresAt       DateTime?
  isActive        Boolean         @default(true)
  priority        Int             @default(0)
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@map("shp_automatic_discounts")
}

enum ShpDiscountType {
  PERCENTAGE
  FIXED_AMOUNT
  FREE_SHIPPING
}
```

### 5.10 Orders

```prisma
model ShpOrder {
  id              String        @id @default(cuid())
  orderNumber     String        @unique
  status          ShpOrderStatus @default(PENDING)
  memberId        String?       // nullable -- guest orders have no member
  // member relation intentionally loose (Members module is optional)

  // Customer snapshot (captured at order time, not a live relation)
  customerEmail   String
  customerName    String
  customerPhone   String?

  // Addresses
  shippingAddress Json          // ShpAddress shape
  billingAddress  Json?         // If different from shipping

  // Financials
  subtotal        Decimal       @db.Decimal(10, 2)
  discountAmount  Decimal       @db.Decimal(10, 2) @default(0)
  shippingAmount  Decimal       @db.Decimal(10, 2) @default(0)
  taxAmount       Decimal       @db.Decimal(10, 2) @default(0)
  total           Decimal       @db.Decimal(10, 2)
  taxMode         String        // INCLUSIVE | EXCLUSIVE snapshot at order time
  currency        String        @default("GBP")

  // Coupon
  couponId        String?
  coupon          ShpCoupon?    @relation(fields: [couponId], references: [id])
  couponCode      String?

  // Payment
  paymentMethod   ShpPaymentMethod
  paymentStatus   ShpPaymentStatus @default(PENDING)
  paymentReference String?      // Provider transaction/order ID
  paidAt          DateTime?

  // Shipping
  shippingRateId  String?
  shippingRateName String?      // Snapshot

  items           ShpOrderItem[]
  refunds         ShpRefund[]
  notes           ShpOrderNote[]
  digitalDownloads ShpDigitalDownload[]
  emailLog        ShpOrderEmail[]
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@map("shp_orders")
}

model ShpOrderItem {
  id              String          @id @default(cuid())
  orderId         String
  order           ShpOrder        @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId       String?         // Nullable in case product is later deleted
  productName     String          // Snapshot
  productSku      String?
  productType     ShpProductType
  quantity        Int
  unitPrice       Decimal         @db.Decimal(10, 2)
  taxRate         Decimal         @db.Decimal(5, 4)
  taxAmount       Decimal         @db.Decimal(10, 2)
  total           Decimal         @db.Decimal(10, 2)
  refundedQty     Int             @default(0)
  digitalDownloads ShpDigitalDownload[]

  @@map("shp_order_items")
}

enum ShpOrderStatus {
  PENDING
  PROCESSING
  SHIPPED
  COMPLETED
  CANCELLED
  REFUNDED
  PARTIALLY_REFUNDED
  ON_HOLD
}

enum ShpPaymentMethod {
  STRIPE
  PAYPAL
  BANK_TRANSFER
  CASH
}

enum ShpPaymentStatus {
  PENDING
  PAID
  PARTIALLY_REFUNDED
  REFUNDED
  FAILED
  AWAITING_CONFIRMATION // Bank transfer / cash
}
```

### 5.11 Refunds

```prisma
model ShpRefund {
  id              String        @id @default(cuid())
  orderId         String
  order           ShpOrder      @relation(fields: [orderId], references: [id])
  amount          Decimal       @db.Decimal(10, 2)
  reason          String?
  providerRefundId String?      // Stripe/PayPal refund ID
  status          ShpRefundStatus @default(PENDING)
  items           ShpRefundItem[]
  createdBy       String        // Admin user ID
  createdAt       DateTime      @default(now())

  @@map("shp_refunds")
}

model ShpRefundItem {
  id          String      @id @default(cuid())
  refundId    String
  refund      ShpRefund   @relation(fields: [refundId], references: [id], onDelete: Cascade)
  orderItemId String
  quantity    Int
  amount      Decimal     @db.Decimal(10, 2)

  @@map("shp_refund_items")
}

enum ShpRefundStatus {
  PENDING
  COMPLETED
  FAILED
}
```

### 5.12 Order notes

```prisma
model ShpOrderNote {
  id          String    @id @default(cuid())
  orderId     String
  order       ShpOrder  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  content     String    @db.Text
  isInternal  Boolean   @default(true) // false = visible in customer email
  createdBy   String?   // Admin user ID; null = system note
  createdAt   DateTime  @default(now())

  @@map("shp_order_notes")
}

model ShpOrderEmail {
  id          String    @id @default(cuid())
  orderId     String
  order       ShpOrder  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  subject     String
  to          String
  sentAt      DateTime  @default(now())
  trigger     String    // ORDER_CONFIRMED | STATUS_UPDATED | MANUAL | REPLY_CATCHER

  @@map("shp_order_emails")
}
```

### 5.13 Customer saved addresses (Members optional)

```prisma
model ShpSavedAddress {
  id          String    @id @default(cuid())
  memberId    String    // References Member.id from Members module
  label       String?   // e.g. "Home", "Work"
  isDefault   Boolean   @default(false)
  address     Json      // ShpAddress shape
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@map("shp_saved_addresses")
}
```

### 5.14 Reviews

```prisma
model ShpReview {
  id          String        @id @default(cuid())
  productId   String
  product     ShpProduct    @relation(fields: [productId], references: [id], onDelete: Cascade)
  memberId    String?       // From Members module; null = anonymous (not shown)
  authorName  String
  rating      Int           // 1-5
  title       String?
  body        String?       @db.Text
  isVerified  Boolean       @default(false) // Verified purchase
  status      ShpReviewStatus @default(PENDING)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@map("shp_reviews")
}

enum ShpReviewStatus {
  PENDING
  APPROVED
  REJECTED
}
```

### 5.15 Email templates

```prisma
model ShpEmailTemplate {
  id          String    @id @default(cuid())
  trigger     String    @unique // ORDER_CONFIRMED | STATUS_PENDING | STATUS_PROCESSING | STATUS_SHIPPED | STATUS_COMPLETED | STATUS_CANCELLED | LOW_STOCK | ADMIN_NEW_ORDER
  subject     String
  bodyHtml    String    @db.Text
  isActive    Boolean   @default(true)
  updatedAt   DateTime  @updatedAt

  @@map("shp_email_templates")
}
```

### 5.16 SiteConfig addition

Add a `shopConfig` Json column to the existing `SiteConfig` model:

```prisma
shopConfig Json? // ShpConfig shape -- see section 9
```

---

## 6. ShpAddress type

Used in `shippingAddress`, `billingAddress`, and `ShpSavedAddress.address` JSON columns.

```typescript
interface ShpAddress {
  firstName: string
  lastName: string
  company?: string
  line1: string
  line2?: string
  city: string
  county?: string
  postcode: string
  country: string // ISO 3166-1 alpha-2, default "GB"
  phone?: string
}
```

---

## 7. [PROTECTED] Payment provider interface

Create `lib/shop/payments/provider.ts`:

```typescript
export interface ShpPaymentProvider {
  id: ShpPaymentMethod
  label: string
  createIntent(order: ShpOrderDraft): Promise<ShpPaymentIntent>
  confirmPayment(orderId: string, payload: unknown): Promise<ShpPaymentResult>
  refundOrder(refund: ShpRefundRequest): Promise<ShpRefundResult>
  handleWebhook?(req: Request): Promise<ShpWebhookResult>
}

export interface ShpPaymentIntent {
  clientSecret?: string   // Stripe
  approvalUrl?: string    // PayPal
  instructions?: string   // Bank transfer / cash
  providerOrderId?: string
}

export interface ShpPaymentResult {
  success: boolean
  providerReference?: string
  error?: string
}

export interface ShpRefundRequest {
  providerReference: string
  amount: number
  currency: string
  items: Array<{ name: string; quantity: number; amount: number }>
}

export interface ShpRefundResult {
  success: boolean
  providerRefundId?: string
  error?: string
}

export interface ShpWebhookResult {
  orderId?: string
  status?: ShpPaymentStatus
  error?: string
}
```

### 7.1 Stripe provider

File: `lib/shop/payments/stripe.ts`

- Use `stripe` npm package.
- `createIntent`: create a Stripe PaymentIntent, return `clientSecret`.
- `confirmPayment`: validate on server; do not trust client-side confirmation alone.
- `handleWebhook`: verify signature using `STRIPE_WEBHOOK_SECRET`; handle `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`.
- `refundOrder`: call `stripe.refunds.create`.
- Webhook route: `POST /api/shop/webhooks/stripe` -- unauthenticated, signature-verified.

### 7.2 PayPal provider

File: `lib/shop/payments/paypal.ts`

- Use PayPal REST API directly (no SDK dependency to keep bundle lean).
- `createIntent`: create a PayPal Order, return `approvalUrl`.
- `confirmPayment`: capture the approved PayPal Order.
- `handleWebhook`: verify webhook signature using `PAYPAL_WEBHOOK_ID`; handle `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`.
- `refundOrder`: call PayPal capture refund endpoint.
- Webhook route: `POST /api/shop/webhooks/paypal` -- unauthenticated, signature-verified.

### 7.3 Bank transfer provider

File: `lib/shop/payments/bank-transfer.ts`

- `createIntent`: return `instructions` string from `shopConfig.bankTransferInstructions`.
- `confirmPayment`: no-op; returns pending. Admin manually confirms via order detail page.
- `refundOrder`: returns instructions-only result with a note to process manually.
- No webhook route needed.

### 7.4 Cash provider

File: `lib/shop/payments/cash.ts`

- Same pattern as bank transfer.
- `createIntent`: return `instructions` from `shopConfig.cashInstructions`.
- No webhook route needed.

### 7.5 Provider registry

File: `lib/shop/payments/registry.ts`

```typescript
import { stripeProvider } from './stripe'
import { paypalProvider } from './paypal'
import { bankTransferProvider } from './bank-transfer'
import { cashProvider } from './cash'

export const paymentProviders: Record<ShpPaymentMethod, ShpPaymentProvider> = {
  STRIPE: stripeProvider,
  PAYPAL: paypalProvider,
  BANK_TRANSFER: bankTransferProvider,
  CASH: cashProvider,
}
```

---

## 8. API routes

All routes under `/api/shop/`. Admin routes require session validation and the relevant permission key. Public routes are unauthenticated unless noted.

### 8.1 Public routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/shop/products` | Paginated product list with filters (category, tag, collection, type, status=ACTIVE) |
| GET | `/api/shop/products/[slug]` | Single product detail |
| GET | `/api/shop/categories` | Category tree |
| GET | `/api/shop/categories/[slug]` | Single category with products |
| GET | `/api/shop/collections` | Collection list |
| GET | `/api/shop/collections/[slug]` | Single collection with products |
| GET | `/api/shop/tags` | Tag list |
| POST | `/api/shop/cart/validate` | Validate cart items (stock, price) before checkout |
| POST | `/api/shop/checkout/session` | Create checkout session, calculate totals |
| POST | `/api/shop/checkout/apply-coupon` | Apply coupon code, return discount amount |
| POST | `/api/shop/checkout/payment-intent` | Create payment intent for chosen provider |
| POST | `/api/shop/checkout/confirm` | Confirm order after payment |
| GET | `/api/shop/orders/[id]/status` | Order status lookup by order number + email (guest) |
| GET | `/api/shop/downloads/[token]` | Secure digital file download (validates token, expiry, download limit) |
| POST | `/api/shop/reviews` | Submit a product review (Members auth required) |
| POST | `/api/shop/webhooks/stripe` | Stripe webhook receiver |
| POST | `/api/shop/webhooks/paypal` | PayPal webhook receiver |

### 8.2 Member routes (Members module optional)

| Method | Path | Description |
|---|---|---|
| GET | `/api/shop/member/orders` | Authenticated member's order history |
| GET | `/api/shop/member/orders/[id]` | Single order detail for authenticated member |
| GET | `/api/shop/member/addresses` | Saved addresses |
| POST | `/api/shop/member/addresses` | Add saved address |
| PUT | `/api/shop/member/addresses/[id]` | Update saved address |
| DELETE | `/api/shop/member/addresses/[id]` | Delete saved address |

### 8.3 Admin routes

All require session + relevant permission key.

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/api/admin/shop/products` | `shop.products` or `shop.access` | Product list |
| POST | `/api/admin/shop/products` | `shop.products` | Create product |
| GET | `/api/admin/shop/products/[id]` | `shop.products` or `shop.access` | Product detail |
| PUT | `/api/admin/shop/products/[id]` | `shop.products` | Update product |
| DELETE | `/api/admin/shop/products/[id]` | `shop.products` | Delete product |
| GET/POST/PUT/DELETE | `/api/admin/shop/categories` | `shop.products` | Category CRUD |
| GET/POST/PUT/DELETE | `/api/admin/shop/tags` | `shop.products` | Tag CRUD |
| GET/POST/PUT/DELETE | `/api/admin/shop/collections` | `shop.products` | Collection CRUD |
| GET/POST/PUT/DELETE | `/api/admin/shop/tax-classes` | `shop.manage` | Tax class CRUD |
| GET/POST/PUT/DELETE | `/api/admin/shop/tax-zone-rates` | `shop.manage` | Tax zone rate CRUD |
| GET/POST/PUT/DELETE | `/api/admin/shop/shipping-zones` | `shop.manage` | Shipping zone CRUD |
| GET/POST/PUT/DELETE | `/api/admin/shop/shipping-rates` | `shop.manage` | Shipping rate CRUD |
| GET/POST/PUT/DELETE | `/api/admin/shop/coupons` | `shop.discounts` | Coupon CRUD |
| GET/POST/PUT/DELETE | `/api/admin/shop/automatic-discounts` | `shop.discounts` | Auto discount CRUD |
| GET | `/api/admin/shop/orders` | `shop.orders` or `shop.access` | Order list with filters |
| POST | `/api/admin/shop/orders` | `shop.orders` | Manual order creation |
| GET | `/api/admin/shop/orders/[id]` | `shop.orders` or `shop.access` | Order detail |
| PUT | `/api/admin/shop/orders/[id]/status` | `shop.orders` | Update order status |
| POST | `/api/admin/shop/orders/[id]/notes` | `shop.orders` | Add order note |
| POST | `/api/admin/shop/orders/[id]/email` | `shop.orders` | Send status email to customer |
| POST | `/api/admin/shop/orders/[id]/refund` | `shop.orders` | Create refund (per-item) |
| POST | `/api/admin/shop/orders/[id]/confirm-payment` | `shop.orders` | Manually confirm bank transfer / cash payment |
| GET | `/api/admin/shop/customers` | `shop.customers` or `shop.access` | Customer list |
| GET | `/api/admin/shop/customers/[id]` | `shop.customers` or `shop.access` | Customer detail with orders |
| GET | `/api/admin/shop/reviews` | `shop.products` or `shop.access` | Review list |
| PUT | `/api/admin/shop/reviews/[id]` | `shop.products` | Approve / reject review |
| DELETE | `/api/admin/shop/reviews/[id]` | `shop.products` | Delete review |
| GET | `/api/admin/shop/reports/tax` | `shop.reports` | Tax report with CSV export |
| GET | `/api/admin/shop/reports/revenue` | `shop.reports` | Revenue summary |
| GET | `/api/admin/shop/dashboard-widget` | `shop.access` | Dashboard widget data |
| GET/PUT | `/api/admin/shop/email-templates` | `shop.manage` | Email template list and update |
| GET/PUT | `/api/admin/shop/settings` | `shop.manage` | Shop config read and update |

---

## 9. shopConfig shape

Stored as a JSON column on `SiteConfig`. Default values shown.

```typescript
interface ShpConfig {
  // Store identity
  currency: string          // default: "GBP"
  currencySymbol: string    // default: "£"
  storeEmail: string        // default: ""
  orderNumberPrefix: string // default: "ORD-"
  weightUnit: "kg" | "lb"  // default: "kg"
  dimensionUnit: "cm" | "in" // default: "cm"

  // Tax
  taxMode: "INCLUSIVE" | "EXCLUSIVE" // default: "INCLUSIVE"

  // Checkout configuration
  guestCheckoutEnabled: boolean       // default: true
  postPurchaseAccountPrompt: boolean  // default: true
  minimumOrderValue: number | null    // default: null
  maximumOrderValue: number | null    // default: null
  requirePhone: boolean               // default: false
  checkoutSteps: ShpCheckoutStep[]    // ordered array of step configs

  // Payment methods
  enabledPaymentMethods: ShpPaymentMethod[] // default: ["STRIPE"]
  bankTransferInstructions: string    // default: ""
  cashInstructions: string            // default: ""

  // Notifications
  adminOrderAlertEmail: string        // default: same as storeEmail
  lowStockAlertEnabled: boolean       // default: true
  lowStockAlertEmail: string          // default: same as storeEmail

  // Shop status
  shopStatus: "OPEN" | "BROWSE_ONLY" | "CLOSED" // default: "OPEN"
  shopClosedMessage: string           // default: "Our shop is temporarily unavailable."

  // SEO
  shopBasePath: string                // default: "shop"
  shopTitle: string                   // default: ""
  shopMetaDescription: string         // default: ""
}

interface ShpCheckoutStep {
  id: string        // e.g. "contact" | "shipping" | "payment" | "review"
  label: string
  enabled: boolean
  required: boolean
}
```

---

## 10. Admin sidebar navigation

Register in module manifest (`module.json`):

```json
{
  "id": "shop",
  "navGroupLabel": "Shop",
  "navItems": [
    { "label": "Products",   "href": "/cactus-admin/shop/products" },
    { "label": "Categories", "href": "/cactus-admin/shop/categories" },
    { "label": "Collections","href": "/cactus-admin/shop/collections" },
    { "label": "Orders",     "href": "/cactus-admin/shop/orders" },
    { "label": "Customers",  "href": "/cactus-admin/shop/customers" },
    { "label": "Discounts",  "href": "/cactus-admin/shop/discounts" },
    { "label": "Reviews",    "href": "/cactus-admin/shop/reviews" },
    { "label": "Reports",    "href": "/cactus-admin/shop/reports" }
  ],
  "settingsTabs": [
    { "label": "Shop", "component": "ShopSettingsTab" }
  ],
  "crons": [
    { "path": "/api/shop/cron/low-stock-alerts", "schedule": "0 7 * * *" }
  ]
}
```

---

## 11. core.admin-dashboard-widgets

Register a widget that displays:

- Total revenue (last 30 days)
- Order count (last 30 days)
- Average order value (last 30 days)
- Low stock product count (links to filtered product list)
- Pending bank transfer / cash orders awaiting confirmation

Widget component: `ShopDashboardWidget.tsx`

---

## 12. Puck blocks

All blocks registered in `lib/puck/module-components.ts` as part of the standard module wiring.

| Block | Props | Notes |
|---|---|---|
| `ShopProductGrid` | categorySlug?, collectionSlug?, tagSlug?, limit, columns, showFilters | Paginated product grid |
| `ShopProductCard` | productSlug | Single product embed |
| `ShopFeaturedCollection` | collectionSlug, layout (grid/carousel), limit | Featured collection display |
| `ShopCategoryBrowser` | parentCategorySlug?, columns | Category grid |
| `ShopPromoBanner` | heading, body, ctaLabel, ctaHref, backgroundColour, imageId? | Promotional banner |
| `ShopCartSummary` | -- | Mini cart with item count and subtotal |
| `ShopCheckoutContact` | -- | Checkout contact details step [ANCHOR] |
| `ShopCheckoutShipping` | -- | Checkout shipping address and method step [ANCHOR] |
| `ShopCheckoutPayment` | -- | Checkout payment method step [ANCHOR -- payment fields non-removable] |
| `ShopCheckoutReview` | -- | Order review and place order step [ANCHOR] |
| `ShopOrderConfirmation` | -- | Post-purchase confirmation display |
| `ShopProductDetail` | -- | Full product detail (images, description, add to cart) [ANCHOR -- ATC button non-removable] |

Blocks marked `[ANCHOR]` render non-removable core fields. The Puck editor must enforce this by marking these fields as locked in the block schema.

---

## 13. Public routes (Next.js App Router pages)

All under the configured `shopBasePath` (default `shop`).

| Path | Description |
|---|---|
| `/[shopBasePath]` | Shop index -- product grid, Puck-editable |
| `/[shopBasePath]/products/[slug]` | Product detail page, Puck-editable |
| `/[shopBasePath]/categories/[slug]` | Category page, Puck-editable |
| `/[shopBasePath]/collections/[slug]` | Collection page, Puck-editable |
| `/[shopBasePath]/cart` | Cart page |
| `/[shopBasePath]/checkout` | Checkout (Puck-editable) |
| `/[shopBasePath]/checkout/confirmation` | Order confirmation (Puck-editable) |
| `/[shopBasePath]/orders/[orderNumber]` | Guest order status lookup |
| `/[shopBasePath]/downloads/[token]` | Digital file download handler |

Member-area shop pages (requires Members module):

| Path | Description |
|---|---|
| `/[memberAreaPath]/orders` | Member order history |
| `/[memberAreaPath]/orders/[id]` | Member order detail |
| `/[memberAreaPath]/addresses` | Saved address management |

---

## 14. SEO

### 14.1 Sitemap

Contribute product, category, and collection pages to the sitemap following the pattern established by Gazette. Export an async function from the module's router entry point:

```typescript
export async function shopSitemapEntries(): Promise<SitemapEntry[]>
```

### 14.2 Schema.org JSON-LD

Each product detail page outputs a `<script type="application/ld+json">` block:

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "...",
  "description": "...",
  "image": ["..."],
  "sku": "...",
  "offers": {
    "@type": "Offer",
    "price": "...",
    "priceCurrency": "GBP",
    "availability": "https://schema.org/InStock",
    "url": "..."
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "...",
    "reviewCount": "..."
  }
}
```

`aggregateRating` is omitted if `ratingCount` is zero.

---

## 15. Transactional emails

All templates are seeded on first install via a migration seed and editable from the admin. Available merge tags are documented in the template editor.

| Trigger | Recipient | Subject default |
|---|---|---|
| `ORDER_CONFIRMED` | Customer | Your order {{orderNumber}} is confirmed |
| `STATUS_PROCESSING` | Customer | Your order {{orderNumber}} is being processed |
| `STATUS_SHIPPED` | Customer | Your order {{orderNumber}} is on its way |
| `STATUS_COMPLETED` | Customer | Your order {{orderNumber}} is complete |
| `STATUS_CANCELLED` | Customer | Your order {{orderNumber}} has been cancelled |
| `ADMIN_NEW_ORDER` | Admin | New order received: {{orderNumber}} |
| `LOW_STOCK` | Admin | Low stock alert: {{productName}} |

Available merge tags: `{{orderNumber}}`, `{{customerName}}`, `{{customerEmail}}`, `{{orderTotal}}`, `{{orderItems}}`, `{{orderStatus}}`, `{{shippingAddress}}`, `{{trackingUrl}}`, `{{productName}}`, `{{stockCount}}`, `{{shopName}}`, `{{shopUrl}}`.

---

## 16. Cron jobs

| Route | Schedule | Purpose |
|---|---|---|
| `/api/shop/cron/low-stock-alerts` | `0 7 * * *` | Daily check; sends low-stock alert email for any product below threshold with `trackInventory: true` |

---

## 17. Reply Catcher integration

When the Reply Catcher module is installed and active, the order detail page in the admin shows a "Customer Communications" tab. This tab uses the `contact-form.thread-messages` style data contract pattern:

- The shop module exports an async function from its router:

```typescript
export async function shopOrderMessages(orderId: string): Promise<ThreadMessageContribution[]>
```

- Core merges contributions from Reply Catcher (matched by customer email + order number in subject) with the order's own `ShpOrderEmail` log.
- When Reply Catcher is not installed, the tab is hidden and no function is called.

---

## 18. Members module integration

All Members integration is conditional on `membersModule.isInstalled()`. The shop module never hard-imports from the Members module.

| Feature | Behaviour without Members | Behaviour with Members |
|---|---|---|
| Guest checkout | Always available | Always available |
| Post-purchase account prompt | Hidden | Shown if `shopConfig.postPurchaseAccountPrompt` is true |
| Order history | Guest lookup only (order number + email) | Full authenticated order history in member area |
| Saved addresses | Not available | Available in member area and pre-filled at checkout |
| Verified purchase badge | Not shown | Shown on reviews where `memberId` matches a completed order |

---

## 19. Checkout flow detail

The checkout is Puck-editable. The step sequence is configurable via `shopConfig.checkoutSteps`. The default sequence is:

1. Contact details (email, name, phone if required)
2. Shipping address (with saved address selector if Members present)
3. Shipping method (rates filtered by postcode zone)
4. Payment method selection and payment details
5. Order review and place order

Tax is calculated server-side during checkout session creation and recalculated on any address or coupon change. The client never calculates tax.

Coupon codes and automatic discounts are evaluated in priority order. Free shipping thresholds are applied after coupon discounts.

---

## 20. Module wiring files

The following generated files must be updated by the module wiring script (`scripts/checkout-modules.mjs`):

- `lib/modules/router.ts` -- export `shopSitemapEntries`, `shopOrderMessages`
- `lib/puck/module-components.ts` -- register all 12 Puck blocks
- `vercel.json` -- add low-stock alert cron

---

## 21. Future extension points (do not build now)

The following are explicitly deferred to companion modules. The schema and interfaces above are designed to accommodate them without breaking changes.

| Module | Notes |
|---|---|
| Product Variations | Attach to `shp_products` via a `variantId` join; per-variant stock, price, media. |
| Product Bundles | A `ShpBundle` model referencing multiple `ShpProduct` IDs. |
| Promotions Enhancements | Extend `ShpAutomaticDiscount` with product/category targeting rules. |
| International Sales | Multi-currency, country-level shipping zones, VAT MOSS. |
| Shipping Carriers | Live rates from Royal Mail, DHL etc via the `ShpPaymentProvider`-style interface. |
| Returns Workflow | Formalises the refund flow with RMA numbers, return labels, restocking. |
| Reviews Media | Add a `ShpReviewMedia` model joining to `shp_reviews`. |
| Shop Analytics | Deeper revenue, conversion, and product performance reporting. |
| Wishlist | `ShpWishlist` model joining `memberId` to `productId`. |

---

## 22. FIELD_NOTES.md additions

Before closing, the agent must add the following sections to `FIELD_NOTES.md`:

- All `shp_` tables and their key fields
- All new API routes (public, member, admin, webhook)
- All new admin page routes
- All new public page routes
- All new permission keys
- All new environment variables
- All new Puck blocks
- The `shopConfig` shape
- The cron job route and schedule
- The Reply Catcher extension point export
- The sitemap export function

---

*End of SHOP_MODULE_SPEC.md*
