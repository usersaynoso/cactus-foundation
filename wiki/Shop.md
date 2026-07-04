# Shop

**Shop** turns your Cactus site into a fully working shop: products, a cart, checkout, orders, discounts and more - all from your own admin, no third-party shop platform needed.

The shop lives at `/shop` on your site (`/shop/products/your-product` for a product, `/shop/categories/mugs` for a category, and so on).

---

## Who can do what

Shop has seven permissions, set on your core roles from **Settings → Users → Roles**:

- `shop.access` - see the Shop section in the admin sidebar, view (but not change) orders, products and customers.
- `shop.manage` - full run of the shop: settings, email templates, tax and shipping setup. Overrides every other Shop permission below.
- `shop.products` - create, edit and delete products, categories, tags and collections; run CSV imports and exports.
- `shop.orders` - view and manage orders and refunds.
- `shop.customers` - view customer records.
- `shop.discounts` - create and manage coupon codes and automatic discounts.
- `shop.reports` - see tax and revenue reports.

Core admins always have full run of Shop, permissions or no permissions.

---

## Setting up payments

Shop supports four ways to take payment, each switched on independently from **Settings → Shop → Payments**:

- **Card payments (Stripe)** - needs a Stripe account. Enter your publishable key, secret key and webhook signing secret right there on the Payments tab (full admins only - a Shop Manager without full admin access will be told to ask one). Saving triggers the usual "changes awaiting deployment" notice - redeploy your site for the new keys to take effect. Until all three are set, Stripe won't be offered at checkout even if you've ticked it on.
- **PayPal** - same screen: Client ID, Client secret, Webhook ID, plus a Mode switch (sandbox for testing, live once you're ready to take real payments). Same rule - missing keys mean it's silently hidden at checkout.
- **Bank transfer** - no keys needed. Write your account details on the same tab and orders sit as "awaiting confirmation" until you mark them paid by hand once the money lands.
- **Cash** - for in-person or over-the-phone sales. Same manual confirmation as bank transfer.

You can offer as many or as few of these as you like.

---

## Adding products

From **Shop → Products → New product**, fill in a name and price to get started, then come back to fill in the rest:

- **Type** - Physical, Digital, or Service.
- **Pricing** - price, an optional "was" price to show a discount, and a cost price (for your own records, never shown to customers).
- **Inventory** - turn on stock tracking to set a stock count and a low-stock warning threshold, and choose what happens when it hits zero: block further sales, or let people order anyway (backorder).
- **Pre-order** - flag a product as a pre-order with an expected dispatch date and an optional note. Customers can buy it straight away; stock only comes off the shelf once you actually mark the order as shipped.
- **Digital files** - for digital products, attach the file customers download after paying, with an optional download limit and expiry.
- **Images** - add one or more, first one becomes the main photo.
- **Categories, tags and collections** - organise your catalogue however suits.
- **SEO** - a custom page title and description for search engines.

**Save** as a draft to keep working on it privately, or set it **Active** to put it in front of customers straight away.

---

## Categories, tags and collections

**Categories** are the usual hierarchical grouping (Mugs, under Kitchenware, under Homeware). **Tags** are free-text labels for cross-cutting themes. **Collections** are curated groups you build by hand (a "Summer Sale" collection, say) with their own page and optional cover image.

---

## Orders

**Shop → Orders** lists everything, with tabs for each status and a dedicated **Pre-orders** tab sorted by expected dispatch date. Open an order to see its items, refund individual items (not just the whole order), update its status (optionally emailing the customer automatically), add internal notes, and - for bank transfer or cash orders - confirm payment once it's actually landed.

Refunds go back through whichever payment method the customer used automatically for Stripe and PayPal; bank transfer and cash refunds are a manual job outside Cactus, since there's no card or account to refund back to automatically.

---

## Discounts

**Shop → Discounts** has two kinds:

- **Coupon codes** - a code customers type in at checkout. Percentage off, a fixed amount off, or free shipping. Set a minimum order value, a total usage limit, and a per-customer limit if you like.
- **Automatic discounts** - apply themselves with no code needed, whenever their conditions are met. Useful for a blanket "10% off everything this weekend" or a free-shipping threshold. When several could apply at once, priority decides which wins.

---

## Back-in-stock alerts

When a product is out of stock, visitors can leave their email address to be notified the moment it's back. The moment you top the stock back up (or switch it to allow backorders), Cactus emails everyone waiting automatically - no extra step needed on your part.

---

## Bringing in a spreadsheet

**Shop → Products → Import** takes a CSV file of your catalogue - name, price, stock, categories, tags, images and more. Existing products are matched and updated by their SKU; anything new comes in as a draft so you can check it over before making it live. Grab the **Import template** button first if you're not sure of the column layout. A running log of your last few imports sits on the same page, so you can see what came in and what (if anything) got skipped and why.

**Export CSV** goes the other way - a full download of your current catalogue, handy for backups or bulk editing outside Cactus.

---

## Tax and shipping

**Shop → Tax & shipping** is where both live, because they share the same building block: a **zone**.

A zone is a group of postcodes that get the same treatment - "United Kingdom", say, or one zone per region if your tax or delivery costs vary within a country. You give a zone a name and a list of postcode prefixes (`SW` catches every London postcode starting SW; a US seller might use `9` to catch every California ZIP code starting with 9). A customer's postcode is matched against the longest prefix that fits, so they only ever land in one zone.

For each zone you set:

- **Tax rates** - a percentage per tax class (Standard, Reduced, Zero-rated, or whatever classes you've defined above the zone list). This is exactly what lets a shop with customers across several US states charge the right sales tax per state - just create one zone per state with its own rate, rather than a single fixed rate for the whole country.
- **Shipping rates** - as many as you like per zone: a flat fee, a rate that scales with the order's weight (in bands you define), or free shipping above a threshold you choose. Each can have an estimated delivery time and be switched on or off without deleting it.

Tax is always worked out on the server at checkout, never left to the customer's browser.

---

## Customer accounts

Guests can always check out without an account. If you have the [Members](Members) system switched on, signed-in customers additionally get an order history, saved addresses that pre-fill at checkout, and a "create an account" nudge after their first purchase (switch that nudge off in **Settings → Shop** if you'd rather not).

Anyone can look up an order's status without an account too, using their order number and the email address it was placed under.

---

## Designing your shop pages

The look of every kind of shop page can be customised in **Appearance → Layouts**, under the **Shop** tab - the same drag-and-drop editor used for your header and footer, with six sub-tabs, one per page type: **Shop Home**, **Category**, **Collection**, **Product**, **Checkout**, and **Confirmation**. Each comes with three ready-made starter designs and Shop's own blocks (product grid, featured collection, promo banner, checkout steps, and more) alongside the usual layout and content blocks - pick one, tweak it as you like, and publish.

Shop Home, Product, Checkout and Confirmation always show one of these designs (a plain default is published from the moment Shop is switched on, so there's never a blank page). Category and Collection pages keep their current simple grid look until you publish a starter for them - nothing changes there until you actively pick one.

The product grid shows each item as a card with its photo, price and a short line of detail, and can flag an item with a small badge - **New**, **Low stock** or a **Trade price** - worked out from the product's tags and its stock level. Give a product the `new` or `trade` tag to earn its badge; the low-stock badge appears on its own once stock drops to your warning threshold.

The **Product** page puts large photos on the left, with thumbnails to click through the rest of the gallery, and everything a shopper needs to buy on the right: the price, any saving against a higher "was" price, the stock status and the **Add to basket** button with a quantity picker. Below that sits a tabbed panel with the full description, a plain specification list, the dimensions and any download - all drawn straight from what you filled in on the product, so there's nothing extra to write. On the Product Detail block you can also set up to three short **reassurance lines** (a warranty promise, a returns note, that sort of thing) that show under the buy button on every product. The related and "step up to" suggestions below use the same card look as the rest of the shop.

You can also drop a whole **Category** layout onto any other page - your homepage, for instance - using the **Embed Layout** block, then pick the category and the number of products to show. See [Managing pages](Managing-pages) for how that block works.

Editing layouts is covered by the core **Appearance → Layouts** permission, same as your header and footer - not by any of the Shop permissions above. A role with `shop.manage` but not that permission can run every other part of the shop but won't see the Layouts screen.

---

## Settings

**Settings → Shop** is split into General, Checkout, Payments, Notifications and Email templates tabs. General covers store identity (currency, order number format, weight/dimension units), page title and description for search engines, and the shop's open/browse-only/closed status. Checkout covers tax mode, guest checkout, minimum/maximum order value, whether a phone number is required, which checkout steps are shown, the back-in-stock account nudge, and how mixed pre-order/in-stock carts are handled. Payments covers which payment methods are switched on and their instructions text. Notifications covers alert addresses for new orders and low stock. Email templates gives you an editable copy of every transactional email Shop sends (order confirmed, shipped, back in stock, and so on).

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Gazette](Gazette) · [Boards](Boards) · [Directory](Directory) · [Shop](Shop) · [Reply Catcher](Reply-catcher) · [Configuration reference](Configuration-reference)
