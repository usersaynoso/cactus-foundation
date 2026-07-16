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

**Instant Bank Pay (open banking)** is a fifth option, added by installing the separate [GoCardless Instant Bank Pay for Shop](https://github.com/cactus-foundation-modules/gocardless-instant-bank-pay-for-shop) module. Shoppers authorise a one-off payment straight from their banking app - no card, no stored details. Once installed it's set up on its own **Settings → Instant Bank Pay** tab (add your GoCardless access token and webhook secret, choose sandbox or live, then switch it on) rather than the Shop → Payments tab. Refunds and confirmation work the same as any other method.

---

## Adding products

From **Shop → Products → New product**, fill in a name and price to get started, then come back to fill in the rest.

The product page is split into tabs, with a panel down the right that stays put as you work: whether the product is on sale, its main photo, its price and stock at a glance, and the **Save changes** button.

- **Details** - the name, the descriptions, and your own SKU and barcode. The web address is set when you first save; if the name has changed a lot and nothing links to it yet, you can ask for it to be rebuilt.
- **Images** - add one or more. The first one is the main photo, so drag them into the order you want (or use the arrows) and the first is what shows on listing cards and in the cart. Each one can have a short description for screen readers and search engines. When you save, your product photos are tidied away into a folder of the product's own, inside a folder named after its lead category, and renamed after the product (so "Blue Mug" ends up in Shop → Kitchenware → Blue Mug as blue-mug1, blue-mug2 and so on). If the product has variations, their photos are filed in that same folder, so everything for one product sits in one place. Housekeeping you never have to think about.
- **Pricing** - price, an optional "was" price to show a discount, a cost price (for your own records, never shown to customers), and the tax class. Fill in the cost price and Cactus works out your profit and margin as you type, and says so plainly if you're selling at a loss.
- **Stock & delivery** - turn on stock tracking to set a stock count and a low-stock warning threshold, and choose what happens when it hits zero: block further sales, or let people order anyway (backorder). Pre-order lives here too: flag a product as a pre-order with an expected dispatch date and an optional note, and customers can buy it straight away while stock only comes off the shelf once you actually mark the order as shipped. So does the weight and size of the thing, which is what postage priced by weight is worked out from.
- **Download** - for digital products only, the file customers download after paying, with an optional download limit and expiry.
- **Organisation** - categories, tags and collections, however suits. A product can sit in as many categories as you like, but one of them is its **lead category**, chosen from a dropdown of the ones you've ticked. It's the category the product's photos get filed under.
- **Recommendations** - what to show as "you might also like", and what to nudge at the cart. Pick them yourself or let the shop choose.
- **Search** - a custom page title and description for search engines, with a preview of roughly what Google will show. Leave them empty and the product's own name and short description are used.

Install the Shop Variations or Product Attributes modules and they add their own tabs here too, so options, personalisation and filters are all on the product rather than off on some other screen.

**One button saves the lot.** Any tab holding changes you haven't saved gets an amber dot, and they're listed next to the Save button so nothing hides from you. Anything that needs fixing first goes red and Cactus takes you to it. Try to wander off with unsaved work and you'll be asked first, rather than finding out later.

Leave it as a draft to keep working on it privately, or set it **Active** to put it in front of customers straight away.

---

## Categories, tags and collections

**Categories** are the usual grouping (Mugs, under Kitchenware, under Homeware). A product can belong to several at once, and one is nominated the **master category** on the product page - the lead one, which is also where its photos get filed in your media library (under Shop → that category → the product's own folder). Products with no master land in a "Uncategorised" folder instead. **Tags** are free-text labels for cross-cutting themes. **Collections** are curated groups you build by hand (a "Summer Sale" collection, say) with their own page and optional cover image.

### Sub-categories

**Shop → Categories** lets you nest categories as deeply as you like - Homeware → Kitchenware → Mugs → Travel Mugs, and on as far as makes sense for your shop. Each category shows as a row in a tidy indented tree, with a little number next to its name telling you how many products are filed directly in it:

- **Search** at the top filters the list as you type - handy once you've a lot of categories. Matches are highlighted, and their parents stay in view so you never lose the trail.
- Any category with sub-categories has a small arrow you can click to fold it away or open it up, and **Collapse all / Expand all** does the lot in one go - so a big catalogue stays manageable.
- **Add sub** tucks a new category underneath an existing one. **New category** (top right) starts a fresh top-level one.
- **Edit** opens a single panel to rename the category, move it somewhere else (pick its new parent, or "Top level" to promote it) and choose what its page lists (see below). You can't move a category inside itself or one of its own sub-categories - the shop won't let you tie a knot.
- **Drag to reorganise.** Grab a category by the handle on the left and drag it: drop it above or below another to reorder it among its siblings, or drop it right onto another category to tuck it inside as a sub-category. Nest as deep as you like, and rearrange whole branches this way. Prefer buttons? The **↑ / ↓** arrows nudge a category up or down one step among its siblings, and **Edit** lets you pick a new parent from a list. Whichever way you move things, the order you set is the order shoppers see, and it now sticks properly (an earlier gremlin let the top category spring back to where it started - that's sorted).
- **Delete** does what it says. Deleting a category also deletes everything nested under it - a warning tells you how many sub-categories will go. Products filed in them aren't deleted; they simply lose that filing and stay in your catalogue.

On the shop front, a category page shows a breadcrumb trail back up to the top, and links to its sub-categories so shoppers can drill down.

**What a category page lists.** By default a category shows every product from itself *and* all its sub-categories - so "Kitchenware" includes the mugs filed under "Mugs". If you'd rather a category showed only the products filed directly on it, you can change that. The shop-wide default is in **Shop → Settings → General** ("Products shown on a category page"), and any single category can override it from its **Edit** panel.

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

The look of every kind of shop page can be customised in **Appearance → Layouts**, under the **Shop** tab - the same drag-and-drop editor used for your header and footer. There are nine sub-tabs: seven for the whole-page types - **Shop Home**, **Category**, **Collection**, **Product**, **Checkout**, **Confirmation** and **Cart** - plus two for the pieces *inside* a page, **Product Detail** and **Product Card** (both covered below). Each comes with ready-made starter designs and Shop's own blocks (product grid, featured collection, promo banner, checkout steps, and more) alongside the usual layout and content blocks - pick one, tweak it as you like, and publish.

Shop Home, Product, Checkout, Confirmation and Cart always show one of these designs (a plain default is published from the moment Shop is switched on, so there's never a blank page). Category and Collection pages keep their current simple grid look until you publish a starter for them - nothing changes there until you actively pick one.

The product grid shows each item as a card with its photo, price and a short line of detail, and can flag an item with a small badge - **New**, **Low stock** or a **Trade price** - worked out from the product's tags and its stock level. Give a product the `new` or `trade` tag to earn its badge; the low-stock badge appears on its own once stock drops to your warning threshold. The card's own design - where the photo, name, price and badge sit - comes from the **Product Card** layout described below, and that one design is used everywhere a product card shows up: the catalogue grid, the "you might also like" row, a featured collection, or a single pinned product.

By default the **Product** page puts large photos on the left, with thumbnails to click through the rest of the gallery, and everything a shopper needs to buy on the right: the price, any saving against a higher "was" price, the stock status and the **Add to basket** button with a quantity picker. Below that sits a tabbed panel with the full description, a plain specification list, the dimensions and any download - all drawn straight from what you filled in on the product, so there's nothing extra to write. The related and "step up to" suggestions below use the same card design as the rest of the shop.

### Rearranging the product page and the cards

That default is no longer fixed. The **Product Detail** sub-tab lets you design the product area itself from small pieces - the gallery, the badges, the title, the price, the **Add to basket** button, the reassurance lines, the tabs and so on - so you can drag them into whatever order and columns you like. It ships with three designs to start from: **Default** (the classic two-column look), **Editorial** (a wide image up top with the details below) and **Compact** (a single narrow column for a quick, focused buy). A few pieces have their own small options - the gallery's shape and where the thumbnails go, whether the price shows the "was" figure and a "Save X%" flash, and whether the buy button has a quantity picker. The old **reassurance lines** (a warranty promise, a returns note, that sort of thing) are now one of those pieces - drop it in and fill in the lines. The **Add to basket** piece can't be removed, so a product page always has a way to buy.

The **Product Card** sub-tab does the same for the little product cards, with **Standard** (photo on top), **Overlay** (the name and price floating over the photo) and **Horizontal** (photo on the left, details on the right) to choose from. Design it once and it applies to every card across the shop.

Both come with a sensible design switched on from the moment Shop starts, so nothing looks broken before you touch them. If you want a *particular* grid or the product page to use a different design from the shop-wide one, open that block's settings and pick a **Layout** there; leave it on "Use shop default" to follow whatever you've published.

You can also drop a whole **Category** layout onto any other page - your homepage, for instance - using the **Embed Layout** block, then pick the category and the number of products to show. See [Managing pages](Managing-pages) for how that block works.

### The cart, your way

The basket page is now designable too, from its own **Cart** sub-tab - it no longer has to make do with one fixed look. Out of the box it shows a ready-made design built around a new **Cart** block: the full working cart - items, quantities, a remove button, a coupon box, the running total and the checkout button - with a suggestions row underneath. Two other starters come with it: a **two-column** layout with the items on the left and suggestions in a sidebar, and a **card list** that puts each item in its own tidy card.

The Cart block carries a generous drawer of settings to make it look like yours rather than ours. Choose whether the items sit as simple **rows**, tidy **cards** or a proper **table**; show or hide the product photos (and set their size), the per-item price, the stock warnings and the pre-order note; and pick how shoppers change the amount - a plain number box, plus and minus buttons, or read-only if you'd sooner they adjusted it elsewhere. You can reword and recolour the checkout button, the coupon box, the subtotal line and even the "your basket is empty" message, with every colour drawn from your own palette so it stays on-brand without any faff. The same block can be dropped onto any other page too, should you want a cart somewhere unusual. Prefer the old plain basket? Just leave the Cart tab unpublished and it carries on exactly as before.

Editing layouts is covered by the core **Appearance → Layouts** permission, same as your header and footer - not by any of the Shop permissions above. A role with `shop.manage` but not that permission can run every other part of the shop but won't see the Layouts screen.

---

## Product options and personalisation

Want size/colour choices, or let customers add engraving, a gift message or an uploaded file? Install the **[Shop Variations](Shop-variations)** module. It adds size/colour variant matrices (each combination with its own price, stock, SKU and photo) and personalisation add-ons, right inside the product editor, with no changes to how your cart or checkout work.

## Settings

**Settings → Shop** is split into General, Checkout, Payments, Notifications and Email templates tabs. General covers store identity (currency, order number format, weight/dimension units), page title and description for search engines, and the shop's open/browse-only/closed status. Checkout covers tax mode, guest checkout, minimum/maximum order value, whether a phone number is required, which checkout steps are shown, the back-in-stock account nudge, and how mixed pre-order/in-stock carts are handled. Payments covers which payment methods are switched on and their instructions text. Notifications covers alert addresses for new orders and low stock. Email templates gives you an editable copy of every transactional email Shop sends (order confirmed, shipped, back in stock, and so on).

When the shop status is set to closed, visitors see your closed message instead of the shop page. Anyone signed in with Shop access still sees the shop itself, with a note at the top reminding them it is closed to everyone else, so you can check the place over before you reopen.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Gazette](Gazette) · [Boards](Boards) · [Directory](Directory) · [Shop](Shop) · [Shop Variations](Shop-variations) · [Reply Catcher](Reply-catcher) · [Configuration reference](Configuration-reference)
