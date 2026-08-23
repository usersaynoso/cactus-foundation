# Google Shopping

**Google Shopping** (module name `google-shopping-for-shop`) puts your catalogue on Google Shopping. It serves a product feed for **Google Merchant Center** in which **every variation is its own listing** - its own price, its own photos, its own stock and its own link - grouped under its parent product. Someone searching for the exact size and colour you sell finds the exact size and colour you sell, not a generic parent listing with the wrong photograph.

There is nothing to export and nothing to run on a schedule: you give Google the feed's address once, and Google fetches it whenever it wants an update.

Requires the [Shop](Shop) module (0.1.243 or later) and the [Shop Variations](Shop-variations) module (0.1.146 or later).

## Setting up

1. Install the module, then go to **Shop → Settings → Google Shopping** and switch **Serve the product feed** on.
2. Copy the **Feed address**. It carries its own key, so only you and Google know it.
3. In [Google Merchant Center](https://merchants.google.com): **Products → Data sources → Add product source → Add a file with a link**, paste the address, and choose a daily fetch.
4. Back in the settings tab, check the **Brand** settings. Google wants a brand on nearly everything, and out of the box each listing takes the name of the supplier the shop files the product under. The default **Brand** covers whatever is left - products filed under no supplier at all.

That is the whole job. Merchant Center takes a day or so to process a new feed the first time.

## What goes in the feed

- **Every variation of every product**, as its own listing, grouped with its siblings so Google shows them as one product with choices. Products without variations go along as single listings.
- Each variation's listing links to the variation's own address - the same link the basket uses - which opens the product page with that combination already chosen.
- Its own photos when it has them, the product's photos when it doesn't.
- Its real availability: in stock, out of stock, back-order or pre-order, by the same rules the shop itself applies. Sale prices travel as sale prices.
- Prices are always sent **VAT-inclusive**, whatever the storefront is set to display - that is what Google requires in the UK.
- The shop's own category trail (for Google's "product type"), and the variation's options mapped onto Google's colour, size, material and pattern attributes by their names - a "Seat Colour" option lands on colour, a "Width" on size, a "Finish" on material. Options that fit none of them stay in the listing's title, which always carries the full variation name.

**What stays out:** draft and hidden products, products the shop is hiding for being out of stock (where that setting is on), non-physical products, anything ticked **Keep this product out of the feed**, and - deliberately - your buying codes. SKUs are never published in the feed.

## Per-product details

Each product's editor gains a **Google Shopping** tab (on the parent product - variations inherit it):

- **Brand** - overrides everything else for this product.
- **GTIN** - the product's barcode, where it has one. Variations don't need this: each variation's own **Barcode** field (on the Variations tab) is used automatically, whenever it holds a real 8, 12, 13 or 14 digit code.
- **MPN** - the manufacturer's part number, if the maker publishes one.
- **Google product category** - a value from Google's own category list, if you want to file it yourself. Optional; Google usually manages on its own.
- **Condition** - New, Refurbished or Used, when it differs from the shop default.
- **Keep this product out of the feed** - the product and all its variations sit Google Shopping out.

### Jumping straight to a listing on Google

Once the module knows which Merchant Center account the feed goes to, every product's **Google Shopping** tab opens with a short list of links - **one per variation** - that take you straight to that exact listing inside Merchant Center. Handy when Google has taken against one particular size and you want to see what it says about it, without hunting through a few thousand rows.

To switch it on, fill in two boxes under **Shop → Settings → Google Shopping → Your Merchant Center account**:

- **Account number** - the number Merchant Center shows at the top right of its own pages. Spaces and dashes are fine; only the digits are kept.
- **Feed label** - whatever Merchant Center lists against your feed, usually the country you sell into (`GB` for a UK shop). Leave it blank and the links still work, Google just asks which feed you meant when you arrive.

Neither has any effect on the feed itself, and nothing breaks if you never fill them in - the tab simply says so instead of offering links.

A few things the list is honest about:

- A **brand new product** takes a day or so to show up, because Google reads the feed on its own schedule. Until then the link arrives before the listing does.
- Variations that are **switched off**, or whose hidden variation product is not active, get no link - they are not in the feed, so there would be nothing at the other end.
- A product ticked **Keep this product out of the feed** gets no links at all, and says why.

### Where the brand comes from

Three places, in this order, first one that has an answer wins:

1. The **Brand** on the product's own Google Shopping tab.
2. The **Supplier** the product is filed under on its main editor tab - on by default, and switched with **Use the supplier as the brand** in the settings tab. Each variation uses its own supplier, falling back to the parent product's. Worth switching off if your suppliers are middlemen rather than the names on the box.
3. The shop-wide default **Brand** in the settings tab.

Most shops file everything under a supplier already, so in practice nobody types a brand on anything.

Left entirely alone, the feed still works: products with no GTIN or MPN are marked for Google as having no standard identifiers, which is normal for made-to-order furniture and the like.

## The feed address and its key

The feed lives at `/google-shopping/feed.xml` with a key in the address. Without the right key the address answers with a plain "not found" - as it also does while the feed is switched off, while the shop is closed, or on a shop that hides its prices (a quote-only shop has no prices for Google, so there is no feed to serve).

If the address ever ends up somewhere it shouldn't, press **New address** in the settings tab. The old address stops working immediately; give Merchant Center the new one.

## Delivery times

If you have the [Advanced Shipping](Advanced-Shipping) module, the feed also tells Google how long each product takes to arrive, so a shopper sees "get it by Thursday" against your listings instead of nothing at all. There is nothing to switch on: install both modules and it happens.

Google is told two numbers per product, both in working days:

- **How long you take to send it** - your dispatch lead time from Delivery settings.
- **How long it then takes to arrive** - the delivery service that product is offered, which on a catalogue with different rules per supplier, department or range is a different answer for different products. That is rather the point: a stocked chair and a made-to-order bench get told apart.

Where a product is offered several services, the feed quotes your default one, or the first one it is offered where the default does not reach it. Where a service is never quicker than some minimum, that minimum is honoured, so the sums never promise sooner than you would.

Pre-ordered and back-ordered products also carry the date you can first send them, which Google insists on for both and which used to be missing.

Products your delivery rules do not cover say nothing at all, and Google falls back to whatever your Merchant Center account says. Same on a shop without Advanced Shipping installed.

**Worth knowing:** Google counts working days by its own calendar, set in Merchant Center under your shipping settings. The shop counts them by your shipping days and the bank holidays it syncs. Set the two to match, or dates can differ by a day around a bank holiday.

## Duplicate pages, canonicals and structured data

Two things ship in the Shop module itself to keep Google happy about all those variation links:

- Every product page now declares a **canonical address**. A variation's own link shows the parent's page (with the variation pre-selected), so it declares the parent's address as the real one - Google never mistakes thousands of variation links for thousands of duplicate pages.
- A product with variations describes itself to search engines with a **price range** starting at its cheapest choice, rather than claiming one exact price no variation may actually cost - so the feed and the page can never contradict each other.

Neither needs any setting up; they are simply how the Shop behaves from 0.1.243.

## If Merchant Center turns products down over their pictures

The one to know about is **"Unsupported image type"**. It sounds like the picture is the wrong sort of file, and it almost never is - Google is perfectly happy with JPEG, PNG, GIF and WebP, which is everything the media library makes.

What it usually means is that Google asked your storage for the picture, got a shrug instead, and took the shrug for the picture. Storage does that to a small share of requests - once or twice in a hundred - and Google is working through every image in your catalogue in one go, so a small share of a very large number is a lot of turned-down products. Variations bear the brunt simply because there are more of them.

The cure is one click: **Settings → Media → Deploy Worker**. A current media service asks storage again before giving up, and answers the quick "is it there?" check Google makes before downloading anything, which older ones refused. Once it is redeployed, ask Merchant Center to fetch your feed again and the rejections clear on the next run.

Genuinely broken pictures are a different message - Google says it could not find the image, not that it could not read it.

**Wiki:** [Home](Home) · [Shop](Shop) · [Shop Variations](Shop-variations) · [Advanced Shipping](Advanced-Shipping) · [Modules](Modules) · [Configuration reference](Configuration-reference)
