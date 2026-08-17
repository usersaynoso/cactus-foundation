# Shop

**Shop** turns your Cactus site into a fully working shop: products, a cart, checkout, orders, discounts and more - all from your own admin, no third-party shop platform needed.

The shop lives at `/shop` on your site (`/shop/products/your-product` for a product, `/shop/categories/mugs` for a category, and so on).

> **Where things live now.** The shop used to spread nine links across your sidebar, and each add-on you installed took another. It now takes two: **Catalogue** and **Sales**.
>
> - **Catalogue** - Products, Categories, Collections, and a tab for each catalogue add-on you have installed (Variations, Attributes, Add-ons, Filters, Reviews).
> - **Sales** - Orders, Cancellations & returns, Customers, Discounts, Reports, Tax & shipping, and Quotes if you have that module.
>
> Nothing was taken away and nothing moved house without leaving a forwarding address: every old link still works, it just carries you to the right tab.

---

## Who can do what

Shop has seven permissions, set on your core roles from **Users → Roles**:

- `shop.access` - see the Shop section in the admin sidebar, view (but not change) orders, products and customers.
- `shop.manage` - full run of the shop: settings, tax and shipping setup. (Editing what the shop's emails say needs `emails.templates` instead - they live on the site-wide Emails tab now. Its text messages need `sms.templates`, and live on the Twilio tab.) Overrides every other Shop permission below.
- `shop.products` - create, edit and delete products, categories, tags and collections; run CSV imports and exports.
- `shop.orders` - view and manage orders and refunds.
- `shop.customers` - view customer records.
- `shop.discounts` - create and manage coupon codes and automatic discounts.
- `shop.reports` - see tax and revenue reports.

Core admins always have full run of Shop, permissions or no permissions.

---

## Setting up payments

**Settings → Shop → Payments** opens on a list of every way this shop can take money - the four Shop comes with, plus anything an installed module has added. Each row has a switch, a plain-English line saying whether it is actually working, and a handle for dragging it up or down. That order is the order shoppers meet the methods at checkout, and the top one is the one already selected when they get there. Arrow buttons do the same job if you would rather not drag. Underneath, a sentence spells out exactly what a shopper will be offered, so there is no guessing.

Along the top is a row of buttons - the list, then one for each method. Everything to do with a method lives on its own button: its switch, its instructions, its keys. Nothing to scroll past to reach the thing you came for.

A row can be switched on and still not be working, and it will say so rather than leaving you to find out at checkout. Switching a method off changes nothing else about it - your keys, your bank details and your wording all stay exactly where they were, ready for whenever you switch it back on.

The four Shop comes with:

- **Card payments (Stripe)** - needs a Stripe account. Enter your publishable key, secret key and webhook signing secret right there on the Payments tab (full admins only - a Shop Manager without full admin access will be told to ask one). Saving triggers the usual "changes awaiting deployment" notice - redeploy your site for the new keys to take effect. Until all three are set, Stripe won't be offered at checkout even if you've ticked it on.
- **PayPal** - same screen: Client ID, Client secret, Webhook ID, plus a Mode switch (sandbox for testing, live once you're ready to take real payments). Same rule - missing keys mean it's silently hidden at checkout.
- **Bank transfer** - no keys needed. Write your account details on the same tab and orders sit as "awaiting confirmation" until you mark them paid by hand once the money lands.
- **Cash** - for in-person or over-the-phone sales. Same manual confirmation as bank transfer.

You can offer as many or as few of these as you like, in whatever order suits you.

Underneath the box where you write those bank details (and the collection details
for cash) there is a switch: **Show this on the checkout page too**. Leave it on
and the shopper reads them the moment they pick the method, which is what Shop has
always done. Turn it off and they wait until the order is actually placed - handy
if you would rather your account number only went to someone who has committed to
buying something. Either way the thank-you page and the shopper's own order page
still show them, so nobody is ever left wondering where to send the money. The two
methods have a switch each, so you can be cagey about the bank details and still
tell people where to come and collect.

Bank transfer and cash are the two methods where the shopper leaves with an order
nobody has been paid for yet, and an installed module is allowed to say what that
means for them: picking one of those at the checkout can add a short line
underneath it, and the order's own lines can read differently until you mark the
payment received. [Advanced Shipping](Advanced-Shipping) uses this to stop the
shop promising a delivery date counted from a day the money had not arrived - see
"Orders that are paid for later" there. With no such module installed, nothing
changes.

**Instant Bank Pay (open banking)** is a fifth option, added by installing the separate [GoCardless Instant Bank Pay for Shop](https://github.com/cactus-foundation-modules/gocardless-instant-bank-pay-for-shop) module. Shoppers authorise a one-off payment straight from their banking app - no card, no stored details. Once installed it joins the list on the **Shop → Payments** tab like any other method, with a button of its own along the top for its settings (add your GoCardless access token and webhook secret, choose sandbox or live). Switch it on, and drag it where you want it, on the list itself. The email address and name the shopper has already typed at checkout are carried over to the GoCardless page so they need not type them twice, and they can still change them there if they want the payment under different details. Refunds and confirmation work the same as any other method.


**Card payment (Square)** is another card option, added by installing the separate [Square Payments for Shop](https://github.com/cactus-foundation-modules/square-payment-for-shop) module. Shoppers pay by card on Square's hosted checkout page, so card details never touch your site. It joins the list on the **Shop → Payments** tab, with a button of its own along the top for its settings. Sandbox and production get their own boxes, so both sets of credentials can be held at once and choosing which one the shop uses is a single dropdown. That dropdown saves itself the moment you change it and takes effect at once - there is nothing to deploy and no Save to press for it. The credentials in the boxes below are a different matter: those are stored with your hosting, so a token you have only just pasted in needs the site to redeploy before it will work. Paste in the access token from your Square developer dashboard - the Application ID shown next to it is not needed - then press **Look up locations** to fill the location ID in rather than hunting for it. Add the webhook URL shown on the page to your Square developer dashboard, paste back the signature key it gives you, then switch the method on. The signature key is optional: without it payments are still confirmed when the shopper comes back from Square, but a shopper who pays and then closes the tab has to be confirmed by hand. Refunds and confirmation work the same as any other method.

**Payment description** on that tab decides what the method is called: fill it in with "Card payment" and that is what shoppers pick at checkout, what the Payments tab calls it, and what shows on the order. The same wording goes to Square for the shopper to see on their page, with the order number added on the end. Leave the box empty and the method keeps its default name, **Card payment (Square)**.

**Badges at checkout.** Card (Stripe), PayPal, Card payment (Square) and Instant Bank Pay each show their own logo beside the name, so a shopper spots the one they know before reading a word. Nothing to switch on and nothing to upload: the badge comes with the method, and it is drawn to suit whichever face your site is showing, light or dark. Bank transfer and cash are not brands, so they keep their name and nothing else.

**The line under each method.** Underneath the name sits a sentence saying who handles the money - "Credit and debit card payments are securely handled by our payment partner Stripe", and so on. Every method arrives with wording of its own, and the boxes at the bottom of the **Payment methods** list let you write over any of it. Empty a box again and the original wording comes back, so there is no way to lose it. A method that arrived with nothing to say shows nothing until you type something in.

---

## Adding products

From **Shop → Catalogue → New product**, fill in a name and price to get started, then come back to fill in the rest.

The search box on the products list matches whole words in any order, across the name and the SKU. Typing "evolve screen" finds "Evolve / Impulse Plus Bench Screen" - you no longer have to remember the exact wording, or everything that sits between the two words you do remember. Every word you type has to appear somewhere, so adding another word narrows things down rather than widening them.

If you use **Product options** (variations), this also searches every variation's own code, not just the listing's own SKU. Type a code off a delivery note or a customer's order and you get taken straight to the listing it belongs to - never to the hidden entry underneath it that variations use to keep each combination's own price and stock. The same is true of the search box shoppers use on your storefront.

The product page is split into tabs, with a panel down the right that stays put as you work: whether the product is on sale, its main photo, its price and stock at a glance, and the **Save changes** button.

- **Details** - the name, the descriptions, and your own SKU and barcode. If you've switched on suppliers (see below), the box for picking one lives here too. The web address is set when you first save; if the name has changed a lot and nothing links to it yet, you can ask for it to be rebuilt. The full description can stay plain text, or you can hit **Design with the page builder** to lay it out with headings, images and columns instead - and once you're designing, **Open in a new tab** pops that builder out into a page of its own with nothing else on screen, handy on a small window. Saving there sends the design straight back to the product; it never fights with anything you're doing on the main page.
- **Images** - add one or more. The first one is the main photo, so drag them into the order you want (or use the arrows) and the first is what shows on listing cards and in the cart. Each one can have a short description for screen readers and search engines. When you save, your product photos are tidied away into a folder of the product's own, inside a folder named after its lead category (so "Blue Mug" ends up in Shop → Kitchenware → Blue Mug), keeping whatever filenames you uploaded them under. If that lead category sits inside another, the folders nest the same way, so a mug filed under Kitchenware inside Homeware lands in Shop → Homeware → Kitchenware → Blue Mug - the media library mirrors your category tree rather than flattening it. Re-save a product after moving it between categories and its whole folder (photos, 3D models and downloads together) shifts to match. If the product has variations, their photos are filed in that same folder, so everything for one product sits in one place. Housekeeping you never have to think about. The picker plays along too: choosing an existing image opens in that product's own folder rather than the whole library at once, with a breadcrumb to wander back up and folders to click into if the picture you want lives elsewhere - and the search box looks across every folder regardless. A folder with more pictures than fit on one screenful gets a **Load more** button at the bottom, so nothing is stranded out of reach, and a sort menu lets you order them newest or oldest first, or by name A-Z or Z-A. On a product with variations, two tick boxes under the grid decide whether these pictures lead the product page's gallery or sit behind the combinations promoted with **Image up front**, and whether the picture on category pages and other grids comes from one of those combinations rather than from here - see [Shop variations](Shop-variations#letting-the-promoted-ones-lead).
- **Pricing** - the price, and the tax class. Every product needs a price and that one is not optional. Beyond it you can switch on any of four extra prices under **Shop → Settings → General → Prices**, and only the ones you switch on show up here: a **sale price** (what the item drops to during an offer - shoppers are charged this, with the normal price struck through beside it), a **retail price** (the RRP, kept as a reference or, if you like, shown to shoppers), a **trade price** (what a trade customer would pay, kept in the admin only), and a **cost price** (your own supplier cost). Fill in the cost price and Cactus works out your profit and margin as you type - against the sale price when there's an offer on - and says so plainly if you're selling at a loss. Switch a price off and whatever you'd typed in it is kept, ready for when you switch it back on. Beside the sale price, once it's switched on, there's a **Sale SKU** box - some suppliers issue a separate code for discounted stock, and this is where you note it down so you order under the right one while the offer runs. Your own SKU on the Details tab is left exactly as it is, since a supplier's stock list still expects to see it.
- **Stock & delivery** - turn on stock tracking to set a stock count and a low-stock warning threshold, and choose what happens when it hits zero: block further sales, or let people order anyway (backorder). Pre-order lives here too: flag a product as a pre-order with an expected dispatch date and an optional note, and customers can buy it straight away while stock only comes off the shelf once you actually mark the order as shipped. So does the weight and size of the thing, which is what postage priced by weight is worked out from - though the weight box only appears while **Charge postage by weight** is switched on under Tax & shipping.
- **Download** - for digital products only, the file customers download after paying, with an optional download limit and expiry. The limit only counts downloads that actually finished, so a transfer that gives up halfway through doesn't quietly cost your customer one of their goes. The file arrives named as you uploaded it, tidied up where it has to be: the odd character that would confuse a browser is swapped for a space, and accents and other alphabets survive intact.
- **Organisation** - categories, tags and collections, however suits. A product can sit in as many categories as you like, but one of them is its **lead category**, chosen from a dropdown of the ones you've ticked. It's the category the product's photos get filed under.
- **Recommendations** - what to show as "you might also like", and what to nudge at the cart. Pick them yourself or let the shop choose.
- **Search** - a custom page title and description for search engines, with a preview of roughly what Google will show. Leave them empty and the product's own name and short description are used.

Install the Shop Variations or Product Attributes modules and they add their own tabs here too, so options, personalisation and filters are all on the product rather than off on some other screen.

**One button saves the lot.** Any tab holding changes you haven't saved gets an amber dot, and they're listed next to the Save button so nothing hides from you. Anything that needs fixing first goes red and Cactus takes you to it. Try to wander off with unsaved work and you'll be asked first, rather than finding out later.

Leave it as a draft to keep working on it privately, or set it **Active** to put it in front of customers straight away.

Both the products list and a product's own edit page carry a **Preview** button - the list's sits beside each row's actions, the edit page's just under Save - opening the live shop page in a new tab. It only works once a product is Active; a draft or archived one greys it out, since there's nothing to see yet.

And the same trip the other way round. While you're signed in and allowed to edit products, the product's name on its own shop page is a link back to its edit page, opening in a new tab so the shop page you were checking stays where it is. There's a faint pencil beside the name to remind you it's there. Spot a typo while browsing your own shop, click the name, fix it - no hunting through the products list for the right row. Customers see none of this: to anyone who isn't signed in with permission to edit products, the name is just a name, and the link is never put on the page in the first place.

**The stock figure behind "In stock".** A shopper is told whether something can be bought and nothing more, which is right for them and no use at all to you. So while you're signed in with Shop access, a product page also shows the actual number, in a small dashed box marked **staff only** so there's no wondering whether the customer looking over your shoulder can see it too. On an ordinary product it sits with the badges as **Stock: 42**, or **Stock: not tracked** where you've left stock counting switched off - a blank would only look like something that failed to load. On a product with options it sits under the buy button instead and belongs to the combination you've actually chosen, changing as you pick, because "how many of these are there" only has an answer once you've said which one. Shoppers get none of it: the numbers aren't merely hidden from them, they're never sent to their browser at all, so there's nothing to go digging for.

**And the codes you order under.** The **Sale SKU** - the supplier's code for stock they've put on clearance - now shows on the product's own shop page in the same dashed **staff only** box, just under the SKU line. It appears whenever the product has one, on offer or not, so when a customer rings up about the chair on the page in front of you, the code you'd actually place the order with is right there rather than three clicks into the admin. Customers never see it, and it's never put on the page for them in the first place.

The product's own SKU is now staff-only too, and by default. It's a buying reference, and a customer has no more use for it than they do for your supplier's clearance code - so it sits on the page for you, with a small "staff only" note beside it, and isn't put in front of shoppers at all. If yours is one of the shops that quotes SKUs to customers deliberately, the SKU block carries a **Show the code to** setting: Editing pages → your product detail layout → click the SKU block → set it to **Everyone**.

---

## Categories, tags and collections

**Categories** are the usual grouping (Mugs, under Kitchenware, under Homeware). A product can belong to several at once, and one is nominated the **master category** on the product page - the lead one, which is also where its photos get filed in your media library (under Shop → that category → the product's own folder, and if the category is itself a sub-category, nested inside its parents to match your tree). Products with no master land in a "Uncategorised" folder instead. **Tags** are free-text labels for cross-cutting themes, and get a page and an optional card badge of their own - see below. **Collections** are curated groups you build by hand (a "Summer Sale" collection, say) with their own page and optional cover image.

### Tags

**Shop → Catalogue → Tags** is where tags are made and dressed. Each one has:

- **A name and a web address.** The address is what the tag's own page lives at (`/shop/tag/summer-sale`) and what any page block pointed at the tag is holding, so it is a separate box rather than something that quietly changes when you rename the tag. Change it and you'll be asked to confirm first, because old links stop finding it.
- **A description**, printed at the top of the tag's page and used as its wording in search results.
- **Show this tag on the shop**, on by default. Turn it off and the tag becomes filing for your own benefit: no page, no badge, nothing about it printed anywhere a shopper can see.
- **A badge**, off by default. Switch it on and products carrying the tag get a small label on their card, with your own wording and your own colours. Pick colours from your site palette (the same swatches as Appearance → Styles) or choose freely, and set light and dark mode separately - there are previews of both side by side, which is the quickest way to catch a label that has gone invisible against a dark background.
- **A place in the order**, set with the arrows. It sorts this list, and it settles which badge sits above the other when a product carries two badge-bearing tags: the higher one goes first.

Cards and product pages both print every badge a product has earned, not just one - so a reduced chair that is also flagged Ex-display says both, in the grid and on the page it leads to. On a card they sit in a row across the top-left corner of the photo in that order, wrapping onto a second line if a product has collected a lot of them. "Out of stock" and "Pre-order" come first whatever else is true, then your own tag badges, then the built-in ones. If you'd rather not see a particular kind at all, the **Card: Badge** part in your Product Card layout has a switch for each.

Tags are ticked on a product under **Organisation** on the product editor, and there's an **Add tag** box right there for when you think of one mid-edit.

A tag's page can be designed like any other: **Appearance → Layouts → Shop → Tag** gives you a **Tag** layout with a header block, product grids and a promo panel to arrange as you like. One layout serves every tag - each block works out which tag it is looking at on its own - so you build it once. Publish nothing there and tags keep their plain built-in page.

### The "On Sale" tag

Every shop starts with one tag it doesn't have to look after: **On Sale**. It applies itself. A product is in it for as long as it actually has money off - either because it has a sale price of its own, or because one of its variations does - and drops out again the moment the offer ends. There is nothing to tick, and nothing to remember to untick when a sale finishes.

It behaves like any other tag otherwise: it has its own page listing everything currently reduced, and it arrives with a red **Sale** badge switched on. Rename it, recolour it, reword the badge, hide it from the shop or delete it outright - all of that is yours. The only thing you can't do is put it on a product by hand, which is rather the point.

If you've switched sale prices off altogether under **Shop → Settings**, nothing is on offer, so the tag's page is empty and no badges appear.

### Sub-categories

**Shop → Categories** lets you nest categories as deeply as you like - Homeware → Kitchenware → Mugs → Travel Mugs, and on as far as makes sense for your shop. Each category shows as a row in a tidy indented tree, with a little number next to its name telling you how many products are filed directly in it:

- **Search** at the top filters the list as you type - handy once you've a lot of categories. Matches are highlighted, and their parents stay in view so you never lose the trail.
- Any category with sub-categories has a small arrow you can click to fold it away or open it up, and **Collapse all / Expand all** does the lot in one go - so a big catalogue stays manageable.
- **Add sub** tucks a new category underneath an existing one. **New category** (top right) starts a fresh top-level one.
- **Edit** opens a single panel to rename the category, move it somewhere else (pick its new parent, or "Top level" to promote it), choose what its page lists (see below), and write the category up properly (see "Giving a category a picture and some words" just below). You can't move a category inside itself or one of its own sub-categories - the shop won't let you tie a knot.
- **Drag to reorganise.** Grab a category by the handle on the left and drag it: drop it above or below another to reorder it among its siblings, or drop it right onto another category to tuck it inside as a sub-category. Nest as deep as you like, and rearrange whole branches this way. Prefer buttons? The **↑ / ↓** arrows nudge a category up or down one step among its siblings, and **Edit** lets you pick a new parent from a list. Whichever way you move things, the order you set is the order shoppers see, and it now sticks properly (an earlier gremlin let the top category spring back to where it started - that's sorted).
- **Delete** does what it says. Deleting a category also deletes everything nested under it - a warning tells you how many sub-categories will go. Products filed in them aren't deleted; they simply lose that filing and stay in your catalogue.

On the shop front, a category page shows a breadcrumb trail back up to the top, and leads with its sub-categories as proper cards so shoppers can drill down.

### Giving a category a picture and some words

Until recently a category was just a name, which made for a slightly bleak page: a wall of products with a heading over it, and any sub-categories reduced to a row of little grey pills. Categories now carry the same three things a product does, all in the **Edit** panel on **Shop → Categories**:

- **Short description.** One line, printed on the category's card. "Height-adjustable desks for every office" is the idea; a paragraph is not.
- **Picture.** Choose one from your media library, or upload a new one there and then. It's the picture on the category's card, so it wants to be square-ish; anything else is trimmed to fit rather than squashed. The picker opens in that category's own folder in your media library (Shop → Homeware → Kitchenware, matching your category tree), and anything you upload is filed there rather than dumped in the top of the library - the same folder the products in that category keep their photos in. Rename a category, or drag it under a different parent, and its picture moves along with it.
- **Full description.** A paragraph or two shown on the category's own page.

Fill those in and a parent category's page opens with its sub-categories as cards - picture, name, your one-liner and a "Browse" link - laid out exactly like the product cards further down, because they *are* the product cards' design. Restyle one and you restyle both, which saves you doing the job twice.

**A description you can actually design.** If a paragraph in a box isn't enough - you want headings, images, two columns, a callout - the same **Edit** panel has a **Design this description** button. It opens the page builder full screen in a new tab, with none of the admin furniture in the way, and gives you the usual content pieces to arrange as you like. Save, close the tab, and that's what shoppers see on the category page instead of the plain text. The plain box stays exactly where it was, so nothing is forced on you: leave the builder alone and the plain version keeps working. A category that has one shows a small **Designed** label in the list. And if you open the builder for a nose around and build nothing, your plain text carries on as before - an empty design doesn't count.

Every category also gets a thumbnail beside its name in the list, so the ones still waiting for a picture are obvious at a glance.

**What a category page lists.** By default a category shows every product from itself *and* all its sub-categories - so "Kitchenware" includes the mugs filed under "Mugs". If you'd rather a category showed only the products filed directly on it, you can change that. The shop-wide default is in **Shop → Settings → General** ("Products shown on a category page"), and any single category can override it from its **Edit** panel.

**Flicking through photos on the grid.** When a product has more than one photo, its card on a listing grows a pair of arrows: shoppers hover (or, on a phone, just look) and click the right arrow to see the next picture without opening the product, and a left arrow appears once they've moved along. If you use variations, each variation's own photo joins the run too, so someone can flick straight from the blue one to the green one on the grid. A product with a single photo shows no arrows, as before. This turns up everywhere product cards do - category and collection grids, "you might also like" rows, and featured blocks.

**Spinning a 3D model from the grid.** If you have the 3D Views add-on and a product (or one of its variations) has a model, its card shows a small **3D** button in the bottom-right corner. Clicking it loads the model right there in the card to turn, tilt and zoom, with a close button to go back to the photos. It follows the photo you're on: flick to a variation's picture and tap **3D**, and you get that variation's model with its own material; if that variation has none, it falls back to the first model the product has. No model on the product or any of its variations means no button at all. Only one card's model is live at a time - opening another closes the last - so a grid full of them stays light.

---

## Orders

**Shop → Sales** is the screen you'll live on. Across the top sit four counters: how many orders are waiting on money, how many are paid and haven't gone out yet, how many are waiting on pre-order stock, and what you've taken in the last thirty days. The first three are buttons: click one and the list below shows exactly those orders, so "three to send" always turns into three orders and never four.

Refunds go back through whichever payment method the customer used automatically for Stripe and PayPal; bank transfer and cash refunds are a manual job outside Cactus, since there's no card or account to refund back to automatically.

### Finding the orders you need

Search by order number, name or email, then narrow it down: by status, by whether the money has arrived, by how much of the order has gone out, by date (last week, last month, or a range you pick), pre-orders only, or hiding cancelled ones. Sort by newest, oldest, biggest, smallest, customer name or status, and show 25, 50 or 100 at a time.

Whatever you pick ends up in the web address, so a filtered list can be bookmarked, sent to someone else, or come back exactly as you left it with the back button.

Each row tells you the lot at a glance: how old the order is, how many items, whether it's paid, how much of it has been dispatched, its status, the total, and whether the buyer has an account with you or checked out as a guest. The **⋯** button on the right opens the order, jumps to that customer's other orders, starts an email, copies the address, or changes the status there and then.

**Doing several at once.** Tick a few rows and a bar appears: pick a status, decide whether the customers should be emailed about it, and apply. If one of them can't be changed - an order being held back by a pre-order, say - the others still go through and Cactus tells you which one was left alone and why, by order number.

**Export CSV** hands you the orders you're currently looking at, filters and all, one row each. Handy for the accountant, and rather easier than copying numbers off the screen by hand.

### The order page

Open an order and everything sits in two columns. Down the left: what was bought, the parcels that have gone out, any downloads, anything ticked at checkout, and the order's whole history. Down the right: the customer, where it's going, how it was paid for, and the money.

**History** is the useful bit. Placed, paid, every email sent, every parcel, every refund and every note you've written, all in one list with the newest at the top. No more reading four separate lists and working out the order of events in your head. Notes go in at the top of it, and are only ever seen by you and your team.

Also on the page: a note of how many orders this customer has placed and what they've spent, copy buttons for the email address and the delivery address, a link to everything else they've bought, and a **Print** button that turns the page into a tidy packing slip with the admin furniture stripped out.

**Emailing a customer.** Press **Email customer** to send a one-off message about this order - the "your sofa is stuck in Dover" sort of message that no automatic email covers. It goes out from your usual sending address and is added to the order's history, so the record stays complete.

### Sending an order out in more than one parcel

Orders rarely leave in one tidy box. Two of the four items are on the shelf, the third is on a lorry somewhere, and the fourth is a pre-order that won't land until next month. Marking the whole order as shipped would be a fib, so an order can now be dispatched a bit at a time.

Open the order and press **Dispatch items**. You get a line for every item with anything still owed, each capped at the number still to go out, so you can send two of the five today and the rest on Friday. Optionally add the courier, a tracking number, a note, and the date the parcel actually went out - handy on a Monday morning, when you're recording something that left on Friday afternoon.

Once recorded, each item shows how many have gone and how many are still to follow, a **Parcels** list appears with every parcel so far, and the badges at the top of the order read **Partly dispatched** or **All dispatched**. That badge is worked out from what's actually left the building rather than being a status you set, so it can't drift out of step with reality and there's no extra status to remember to change. The same badge shows on the orders list, and you can filter the whole list by it.

Ticking **Email the customer** sends the **Part of an order dispatched** message, which lists what's in this parcel and what's still to come, and reassures them that separately sent parcels often arrive a day or two apart. When the parcel is the one that finishes the order off, the same email says so instead. It's editable like every other message under **Settings → Email → Templates**.

Recorded a dispatch that never happened? Press **Undo** beside it in the Parcels list and the items go straight back to being outstanding. Nothing else needs correcting, because the totals are counted from the parcels rather than kept in a separate tally that could disagree with them.

Two sensible limits: you can't dispatch more of something than was bought, and you can't dispatch something you've already refunded. If a refund and a dispatch are attempted at the same moment, one of them waits its turn rather than both squeezing past the check.

### Mixed baskets with a pre-order in them

**Settings → Shop → Checkout** has a setting for what happens when a basket mixes something in stock with something on pre-order. It has never stopped anyone buying such a basket, and it still doesn't - it decides how the order gets sent.

- **Hold everything until it's all in** - the whole order goes out in one piece. Cactus won't let you mark the order as dispatched while any pre-order item is still waiting on stock, and it tells you which items are holding things up and when they're expected. Shoppers are told at checkout that the order will be sent together once everything has arrived.
- **Offer to split the shipment** - anything on the shelf can go straight away, with the pre-order following on. That's the setting to use if you want to dispatch part of an order, and shoppers are told as much at checkout.

If you're on "hold everything" and the stock has actually arrived, take the products off pre-order on their **Stock & delivery** tab and the order will let you mark it dispatched. Or switch this setting over to splitting shipments, if sending things separately suits you better after all.

---

## Discounts

**Shop → Discounts** has two kinds:

- **Coupon codes** - a code customers type in at checkout. Percentage off, a fixed amount off, or free shipping. Set a minimum order value, a total usage limit, and a per-customer limit if you like.
- **Automatic discounts** - apply themselves with no code needed, whenever their conditions are met. Useful for a blanket "10% off everything this weekend" or a free-shipping threshold. When several could apply at once, priority decides which wins.

---

## Back-in-stock alerts

When a product is out of stock, visitors can leave their email address to be notified the moment it's back. The moment you top the stock back up (or switch it to allow backorders), Cactus emails everyone waiting automatically - no extra step needed on your part.

---

## Hiding things that have sold out

Some shops are happy for a sold-out product to sit there wearing its "Out of stock" badge, because it will be back on Thursday. Others would rather it vanished. **Settings → Shop → General → Out of stock products** covers both, and a middle position for everybody else.

**When something sells out** gives you three answers:

- **Leave it where it is, marked out of stock.** What the shop has always done, and still the default. Nothing changes.
- **Take it out of the listings, keep its page.** It disappears from category pages, collections, product grids, search results and your sitemap, but its own page stays up. Anyone holding a link - a returning customer, an ad still running, a search result from last week - lands on the product rather than a dead end, and can still ask to be told when it's back.
- **Hide it completely, page and all.** As above, and its page gives a page-not-found instead. For when sold out means gone.

**Hide them from me and my staff as well** decides whether any of that applies to you. Leave it off, which is how it arrives, and anyone signed in with shop access still sees hidden products on the storefront with their usual out-of-stock badge, so nothing quietly disappears without your knowing. On a product page that shoppers can't reach at all, you'll get a short note at the top saying so. Tick the box and you see exactly what a shopper sees, which is handy for checking your own work and less handy for spotting that half a range has gone missing.

A few things it deliberately does not do:

- **It never hides anything from your Products screen.** That's where you go to reorder the stock, so hiding it there would be a peculiar sort of help.
- **It only hides what you actually count.** A product with stock tracking switched off, one that takes backorders, or one on pre-order stays exactly where it is.
- **It changes nothing about what can be bought.** A sold-out product could not be bought before this setting existed either. This is only about who gets shown it.
- **Nothing is deleted or archived.** The moment stock goes back above zero, everything reappears on its own. There is no list to tidy up afterwards.

Where a product comes in several variations, it counts as sold out only when every switched-on variation of it is - which is precisely when the picker on its page has nothing left to offer. One colour running out never hides the whole listing.

---

## Best selling

Every product carries a popularity figure, and both your Products list (**Sort → Best selling**) and the shopper-facing **Sort by** dropdown can order on it.

It's built from two things. The first is what you have genuinely sold: paid orders only, refunded items taken back off, and nothing older than a year, so a hit from three catalogues ago can't squat at the top forever. The second is a starting rank you can be given - a supplier's own best-seller order, say, or your own hand-picked favourites - which matters enormously on a shop that hasn't been trading long. A best-seller list that says nothing until you've had a year of orders isn't much of a best-seller list.

One real sale beats any starting rank. So a borrowed ranking quietly steps aside as your own trade builds up, without anyone having to remember to turn it off.

Where a product comes in several variations, the sales count for the listing rather than each colour. A chair sold thirty times across fifteen fabrics is one popular chair, not fifteen also-rans.

Products nothing has ranked either way sort last, not bottom. "We don't know" and "it sells badly" are different claims and the list treats them that way.

The figure refreshes itself once a day, in the same overnight run that sends your low-stock email. It is not recalculated the instant a sale lands, which we're comfortable with: nobody has ever needed their best-seller list to be right to the second.

---

## Bringing in a spreadsheet

**Shop → Catalogue → Import** takes a CSV file of your catalogue - name, web address, price, stock, size and weight, categories, tags, images, SEO fields, pre-order settings, download rules and more. Existing products are matched and updated by their SKU, or by their web address where a product has no SKU. Anything new comes in as a draft unless the file says otherwise, so you can check it over before making it live. Grab the **Import template** button first if you're not sure of the column layout. A running log of your last few imports sits on the same page, so you can see what came in and what (if anything) got skipped and why.

A file doesn't have to carry every column. Anything the file leaves out is left exactly as it is on your site rather than being wiped, so a spreadsheet of just names and prices does only what it says. A column that *is* there but left blank is taken at its word and clears that field - which is how you empty something on purpose.

**Export CSV** goes the other way - a full download of your current catalogue, handy for backups or bulk editing outside Cactus.

---

## Tax and shipping

**Shop → Tax & shipping** is where both live, because they share the same building block: a **zone**.

A zone is a group of postcodes that get the same treatment - "United Kingdom", say, or one zone per region if your tax or delivery costs vary within a country. You give a zone a name and a list of postcode prefixes (`SW` catches every London postcode starting SW; a US seller might use `9` to catch every California ZIP code starting with 9). A customer's postcode is matched against the longest prefix that fits, so they only ever land in one zone.

For each zone you set:

- **Tax rates** - a percentage per tax class (Standard, Reduced, Zero-rated, or whatever classes you've defined above the zone list). This is exactly what lets a shop with customers across several US states charge the right sales tax per state - just create one zone per state with its own rate, rather than a single fixed rate for the whole country.
- **Shipping rates** - as many as you like per zone: a flat fee, a rate that scales with the order's weight (in bands you define), or free shipping above a threshold you choose. Each can have an estimated delivery time and be switched on or off without deleting it.

Tax is always worked out on the server at checkout, never left to the customer's browser.

### Showing prices with or without tax

How you type a price in and how a shopper sees it are two different questions, and **Shop → Tax & shipping → Prices on your shop** is where you answer the second one.

The first is answered by **Tax mode** in **Settings → Shop → Checkout**: it tells Cactus what the number in the price box means - either the tax is already in it, or the tax gets added at the till. That is a bookkeeping decision, and plenty of shops keep their prices without tax because that's how their suppliers quote them.

Shoppers, though, generally want the number they'll actually pay. So the Tax & shipping box offers three answers:

- **Exactly as you type them** - no conversion at all. This is how Cactus has always behaved and stays the setting until you change it, so nothing moves on its own.
- **With tax included** - the tax is added on before the price is shown. What most shops selling to the public want, and what UK consumer rules expect.
- **With tax taken off** - the tax is stripped out before the price is shown. Trade catalogues, mostly.

Underneath there's a box for the wording that goes after each price - "inc. VAT", say. Pick one of the two converted options and a suggested wording is filled in for you; type over it with anything you like, or clear it if you'd rather have no note at all. Leaving prices to change side without a word of explanation reads to a returning customer as a price rise, which is why the box is there.

Whichever you choose applies everywhere a shopper meets a price: product cards, product pages, the options picker on a product with variations, delivery and assembly upgrades, the basket and the checkout, and the price search engines read off your product pages. The rate used is the one from the zone that covers everyone, because a shelf price has to be printed long before anybody knows where the parcel is going - the checkout still works out the real rate from the delivery address.

**None of this changes what anyone is charged.** The till works from the stored figure and the real zone, exactly as before. This setting decides what is printed, and nothing else. If you switch a public shop over to tax-included prices, do check your minimum order value in Settings → Shop → Checkout, since that is still measured against the stored figures.

### Charging postage by weight

At the top of **Shop → Tax & shipping** there's a single switch, **Charge postage by weight**, which is on to begin with. Plenty of shops post everything for the same money and have no use for weights at all, so turning it off tidies them away:

- The weight-based option disappears from the Type dropdown when you add a shipping rate, leaving flat rate and free shipping.
- The weight box disappears from the Stock & delivery tab of the product editor. Length, width and height stay put, since they're often worth recording for their own sake.
- The weight column disappears from the variants grid, if you have the product options module installed.

Nothing is deleted. Weights you've already recorded stay on your products and come straight back if you switch it on again, and an existing weight-based shipping rate keeps working and keeps showing its own type when you open it for editing.

---

## Customer accounts

Guests can always check out without an account. If you have the [Members](Members) system switched on, signed-in customers additionally get an order history, saved addresses that pre-fill at checkout, a basket that follows them from one device to the next, and a "create an account" nudge after their first purchase (switch that nudge off in **Settings → Shop → Checkout** if you'd rather not).

That nudge appears on the confirmation page, once the order is safely placed rather than in the middle of paying, and only to guests - a customer who was already signed in doesn't need telling. It sits below anything the customer still has to do about the money (bank transfer details, say) and above the list of what they've bought, so it's in plain sight rather than stranded at the bottom of a long receipt. It stays out of the way entirely if you've got Members switched off, or if your site is invite-only, since sending someone to a page that will only turn them away is worse than not asking at all.

The nudge is the sign-up form itself, sitting right there on the confirmation with the address they ordered with already typed in - not a button that carries them off somewhere else to start again. It's the same form as the one on your sign-up page, so it asks for exactly the fields you've chosen in **Settings → Members** and holds them to the same privacy policy. Someone who just spent five minutes paying you is unlikely to go looking for a second form.

Which does mean the shop's own tickbox is not the whole story: with accounts switched off site-wide, it can be ticked and still show nothing, because there is no account to create. The Checkout settings say so underneath the tickbox when that is the case, and point you at **Users → Settings → Registration**, which is where accounts are turned on.

The useful part is what happens next: sign up with the same email address and the order they just placed joins the new account by itself, so their order history isn't empty on the day they make it. Orders are claimed this way only once the customer has confirmed their email address, for the obvious reason - anyone can type someone else's address into a sign-up form, and an unconfirmed match would hand over that person's order history and delivery addresses along with it. If you've turned email confirmation off in the Members settings, nothing is claimed.

Anyone can look up an order's status without an account too, using their order number and the email address it was placed under.

### Order updates by text message

With the [Twilio](Twilio) module installed and a text-enabled number added, customers can have their order updates texted to them as well as - or instead of - emailed.

The choice is offered on the page they land on after ordering: **How shall we keep you posted?**, with a tickbox each for email and text message, and a box for the mobile number when they want texts. It's the same card whether they have an account or not, and it saves against that order, so a guest gets the choice too. Signed-in customers can change their mind later on the **Notifications** tab of their account, and that change carries across to any order still in progress.

What they can't do is untick both. An order is something you have to be able to tell somebody about, so the choice is how you reach them, not whether. Cactus refuses the save and says so.

A few sensible details:

- A landline in the delivery number won't do - texts need a mobile, and Cactus says so rather than pretending to send one. If the number is unusable and text was the only channel chosen, the email goes out anyway rather than the customer hearing nothing.
- Texts cover the customer-facing milestones only: order confirmed, being processed, dispatched, complete, cancelled, part of an order dispatched, and the three about a cancel or return request. Your own alerts - new order, low stock, import finished - stay on email, on the grounds that you're sitting at a screen and texts cost money.
- The wording of every text lives on **Settings → Twilio → Templates**, editable exactly like the emails.
- The delivery phone number and the number for text updates are kept apart, because they aren't always the same person: one is whoever's at the door, the other is whoever placed the order.

No Twilio, or no text-enabled number? None of this appears anywhere, and orders carry on being emailed about exactly as before.

### What a signed-in customer actually sees

**Orders** and **Addresses & Phone Numbers** are tabs in the customer's account, next to Profile and Security, and those pages carry the same tabs across the top - so nobody clicks "order history" and finds themselves stranded on a page with no way back.

The order list shows each order with its date, a photo of what's in it, how many items, what it cost, and where it's got to - being prepared, on its way, complete. Four filters across the top narrow it to orders in progress, completed or cancelled. Opening one shows the lot: every line with its picture and any options they chose, what's been dispatched and what hasn't, each parcel with the courier and tracking number, any refunds, the full breakdown of what they paid (items, discount and the code they used, delivery, VAT), both addresses, and any downloads. There's a **Buy again** button on each line, and a **printable receipt** on its own tidy page.

If they paid by bank transfer or cash, your payment instructions sit at the very top of that order, above everything else on the page, for as long as the money is still to come. They're in a highlighted box with the amount outstanding spelled out, so somebody opening their banking app a week later has the account details and the sum in one place instead of digging through their inbox for the confirmation email. The moment you mark the payment received they go - from the order page and from the thank-you page both - because a panel of bank details on a paid order reads like a bill arriving twice. An order that's been cancelled or refunded shows nothing either, on the same reasoning. This happens whether or not you show those details at the checkout: the switch on the Payments tab only governs the checkout page.

A line with options on it gets the same **Buy again** button, but it opens the product page with those same options already chosen rather than dropping straight into the basket - so a chair in a particular colour and back height comes back up exactly as it was bought, with only the basket click left to do. The detour is deliberate: what the order stores is a record of what they chose for reading, not the recipe for rebuilding it, so anything typed in by hand (an engraving, an uploaded file) wants confirming rather than guessing at.

Re-ordering is on by default and switches off in **Settings → Shop → Checkout → Order history**, which takes the button away everywhere. Worth doing if your range moves faster than your order history - made-to-order work, one-offs, anything where pointing somebody at a year-old product page is more likely to disappoint than to sell.

The **Addresses & Phone Numbers** tab fills itself in. Every address a signed-in customer orders to is kept there once the order is placed, so the second order asks them for rather less than the first one did. They can add one by hand too, and delete any of them, but nobody has to remember to save anything.

Each saved address has an **Edit** button, which opens the whole address for changing - names, business name, phone number, both address lines, town and postcode - rather than only the phone number. A company that's moved office edits the address it already has instead of adding the new one and deleting the old one. The **Add address** button opens the same form, empty. Both are the checkout's own form, down to the labels and the messages when something's missing, and both will look an address up for you where the checkout does (see below).

Each address keeps its own phone number, which is why it's in that form rather than on the account: the number wanted for a delivery is whoever's actually at that door - the site manager at the second office, the colleague taking it in at home - and not automatically the person who paid. Pick that address at the checkout and its number comes along with it. A number that isn't a UK one gets a polite refusal rather than being filed and quietly failing later, and an address saved with no number at all is perfectly fine unless you've made a number compulsory, in which case the form asks for one here too.

At the delivery step, a customer with addresses on file gets a short **Deliver to** list above the form: their addresses, and a **Use a different address** option for when they're sending something somewhere new. Picking one fills the form in, and the form stays right there underneath, so a flat number they've since moved past can be corrected on the spot without touching what's stored in their account. Whichever address the order actually goes to is the one that gets kept.

The same address ordered to twice stays one entry. Two entries only appear when the parcels would genuinely land at two different doors, so typing a postcode in capitals one week and lower case the next doesn't quietly grow a list of near-identical duplicates. It's the door that's matched on and not the name against it, which means two people at one address share one entry - the name comes up as whoever ordered first, and is typed over in the form like anything else. And a customer paying by bank transfer gets their address kept the moment they finish checking out, rather than whenever you get round to confirming the money.

With the [Address Lookup](Address-Lookup) module installed, the address book's own Add and Edit forms suggest addresses as they're typed, exactly as the checkout does - an address added in the account is worth no less than one typed at the till.

Guests aren't offered any of this and aren't asked to sign up for it. They see the form exactly as they always did.

### The basket follows them about

A signed-in customer's basket is kept with their account rather than in the browser they happened to be using. Fill one up on the train on a phone, open the laptop at the desk, and it's already there. Nothing to press, no "save my basket" button, no emailed link.

Signing in joins the two baskets rather than picking a winner: whatever they'd put in as a guest stays, whatever was waiting on the account comes back, and something sitting in both counts once at the larger quantity rather than doubling up. Signing out takes the basket off that browser, since it's safe on the account and a shared laptop is nobody's idea of a good place to leave a shopping list. Sign in on somebody else's machine and you get your basket, not theirs.

Changes are sent up as they're made, so a phone put in a pocket mid-shop has already saved. If two devices are open at once, the one being used wins, and the other picks the change up the next time it's brought back to the front.

Guests carry on exactly as before, basket kept in their own browser, nothing sent anywhere. It's worth saying that a basket is a list of what somebody fancied, not a promise about the price: what things cost, what's in stock and what delivery comes to are all worked out fresh when the basket is opened and again at the checkout, so a basket left for a fortnight can't hold you to a fortnight-old price.

There's nothing to switch on. If you've got [Members](Members) running, it's running.

### Cancellations and returns

Customers can ask to call an order off or send something back from the order page itself, rather than hunting for your email address. They pick a reason from a short list and can add a note.

The rules are the sensible ones and you don't have to police them: **cancelling** is only offered while nothing has been dispatched (once part of it is in a van, it's a return), and **returning** is only offered after something has actually gone out, within a window you set. That window is counted from the day the last parcel left, not the day they ordered - an order that sat on your shelf for three weeks shouldn't eat the customer's return window. One open request per order, and they can withdraw it if they change their mind.

Both are on by default and can be switched off in **Settings → Shop**, along with the length of the return window (30 days out of the box). Off means the pages say to get in touch instead, rather than pretending the option was never there.

Requests land in **Shop → Cancellations & returns** in your admin, waiting ones first and the oldest at the top. Each shows who asked, for what, why, in their own words, and what the order was worth. You approve or decline, and either way you can add a line that goes in the email to them. Approving offers a tickbox to send the money back at the same time - it's a second, deliberate step, because a refund is money leaving the business and shouldn't be one stray click away. Leave it unticked to approve now and refund when the goods are actually back in your hands.

Nothing is ever decided automatically. There is no auto-approve, by design: money going out on a timer is not a setting anyone should inherit without noticing.

Approving a cancellation also closes the order, so it can't be picked and packed by mistake while you're sorting out the refund. If the refund itself fails - a card processor having a bad minute - you're told plainly, the request still counts as approved, and you can retry the refund from the order page where the refund tools already live.

Customers get an email when their request arrives, and another when you've decided. You get one too, at whichever address takes your new-order alerts. All four are editable like every other email the site sends, in **Settings → Email → Templates**.

---

## Designing your shop pages

The look of every kind of shop page can be customised in **Appearance → Layouts**, under the **Shop** tab - the same drag-and-drop editor used for your header and footer. There are nine sub-tabs: seven for the whole-page types - **Shop Home**, **Category**, **Collection**, **Product**, **Checkout**, **Confirmation** and **Cart** - plus two for the pieces *inside* a page, **Product Detail** and **Product Card** (both covered below). Each comes with ready-made starter designs and Shop's own blocks (product grid, featured collection, promo banner, checkout steps, and more) alongside the usual layout and content blocks - pick one, tweak it as you like, and publish.

Shop Home, Product, Checkout, Confirmation and Cart always show one of these designs (a plain default is published from the moment Shop is switched on, so there's never a blank page). Category and Collection pages keep their current simple grid look until you publish a starter for them - nothing changes there until you actively pick one.

The **Category** tab has two blocks worth knowing about. **Category Browser** shows a category's sub-categories as cards - or, with its "Show as" setting flipped to **Pills**, as a compact row of wrapping link chips, which suits pages where the sub-categories are shortcuts above a product grid rather than the main event. Drop it on the Category design and it works out which category it's on by itself, so one design serves the lot. (It's the same block you can put on Shop Home to show your top-level categories.) **Category Description** prints whatever you've written for the category - the designed version if you've built one, the plain paragraph if you haven't, and nothing at all if you've written neither, so a category you haven't got round to yet doesn't leave a hole. There's a starter called **Sub-categories First** that puts the two in the sensible order: heading, sub-category cards, description, then the products.

The product grid shows each item as a card with its photo, price and a short line of detail, and can flag an item with small badges - **New**, **Low stock** or a **Trade price** - worked out from the product's tags and its stock level. Give a product the `new` or `trade` tag to earn one of those two; the low-stock badge appears on its own once stock drops to your warning threshold. For badges in your own wording and colours, switch them on for tags under **Shop → Catalogue → Tags** instead - that's also where the automatic **Sale** badge comes from. A product wearing several says all of them, side by side in the corner of its photo. The card's own design - where the photo, name, price and badge sit - comes from the **Product Card** layout described below, and that one design is used everywhere a product card shows up: the catalogue grid, the "you might also like" row, a featured collection, or a single pinned product.

By default the **Product** page puts large photos on the left, with thumbnails to click through the rest of the gallery, and everything a shopper needs to buy on the right: the price, any saving against a higher "was" price, the stock status and the **Add to basket** button with a quantity picker. Below that sits a tabbed panel with the full description, a plain specification list, the dimensions and any download - all drawn straight from what you filled in on the product, so there's nothing extra to write. The related and "step up to" suggestions below use the same card design as the rest of the shop.

Product photos are square, everywhere they appear - the big one on the product page, and the little ones on cards throughout the shop. There's no shape to choose and nothing to keep in step: a photo that isn't square is trimmed to fit rather than squashed, so a catalogue built up over years still lines up. The exception is the **Overlay** card design, where the photo filling the whole card is rather the point.

The photo and its thumbnails are sized to fit the screen as one piece, with room left for your header if you've set it to stay put when the page scrolls. Nothing is left dangling below the fold, so a shopper can see every thumbnail without hunting for it. On a short screen the photo shrinks rather than losing its shape, and the left-hand side shrinks with it - so the price and the **Add to basket** button take the width the photo gave up, instead of the photo sitting marooned in the middle of a half-empty column. The taller the screen, the bigger the photo and the narrower the buy details; the shorter the screen, the more room the buy details get. Neither side is allowed to bully the other: the photo never takes more than about three-fifths of the width, however much room it thinks it deserves.

Thumbnails sit on a single line that scrolls sideways if there are more than fit. A product with a dozen photos gets one tidy strip rather than three rows of them quietly eating the space the photo was meant to have.

When there are more thumbnails than the line can show, the strip says so rather than leaving the shopper to guess: the last one fades out at the edge with a small arrow to walk the strip along, and once they've moved it, a matching arrow and fade appear at the start to go back. It works the same way as the tabs across the top of your admin pages, and it's the same strip a finger or a trackpad could always scroll - the arrows just mean nobody has to discover that for themselves. Thumbnails set to sit beside the photo rather than below it stack in a column and are left as they were.

If the buy details on the right run longer than the photo - a wordy description, a long list of options - the photo and thumbnails stay with the shopper as they scroll down, rather than sliding away and leaving them reading about a product they can no longer see. On a phone the page stacks and the photo scrolls along with everything else, which is rather the point of a small screen. Up to and including shop version 0.1.48, a product with enough photos to fill the thumbnail strip could be swiped sideways on a phone: the strip laid claim to the width of every thumbnail at once, and quietly dragged the whole page out with it. From 0.1.49 the strip keeps to the width it's given and scrolls inside it, so the page is only ever as wide as the phone.

### Rearranging the product page and the cards

That default is no longer fixed. The **Product Detail** sub-tab lets you design the product area itself from small pieces - the gallery, the badges, the title, the price, the **Add to basket** button, the reassurance lines, the tabs and so on - so you can drag them into whatever order and columns you like. It ships with three designs to start from: **Default** (the classic two-column look), **Editorial** (a big image up top with the details below) and **Compact** (a single narrow column for a quick, focused buy). Every piece now has its own small options. The gallery chooses where the thumbnails go; the badges piece lets you switch the **New**, **Trade price** and stock badges on or off individually; the title and the price each take a **text size** and the title an **alignment**; the SKU line lets you change (or remove) the word printed before the code and line it up left, centre or right; the price still decides whether to show the "was" figure, a "Save X%" flash and the RRP. The **short description** used to cap itself at a comfortable reading width whether you liked it or not, which left a stripe of empty space beside it in a wide column - it now fills its column by default, with a **Text width** option to bring the reading-width cap back and a text size of its own. The buy button has its quantity picker switch as before, plus a **button label** box if "Add to basket" isn't the wording you want (pre-order products keep saying **Pre-order now** regardless - that's a different promise). The old **reassurance lines** (a warranty promise, a returns note, that sort of thing) are one of those pieces too - drop it in and fill in the lines. The **Add to basket** piece can't be removed, so a product page always has a way to buy.

The product's **description, specification and downloads** now come as two pieces you place separately. The **Sections** piece holds the actual writing - the description, the spec table, the downloads - shown either **stacked** one under another with everything on show, or as an **accordion** where each heading opens and closes on a tap. It fills the width you give it, so there's no odd gap left down the right-hand side.

The **Tabs** piece is the row of buttons that steers it. Tapping one slides the shopper straight to that part of the Sections piece, and the button for whatever they're reading lights up on its own as they scroll past it. You can line the row up **left, centre or right**, make it **stick** to the top of the screen as the shopper scrolls so it's always to hand, set the **padding above and below the row** (it ships at 16px each way; anything from 0 to 64px goes), and there's a **divider** switch for the faint line and gap above it - handy to turn off when the row leads the page, where that gap would otherwise sit there looking like a mistake. The Tabs piece points at the Sections piece, so keep the two together: on its own it's a row of buttons with nowhere to go.

The row itself now sits inside a single rounded frame, like the segmented switches you'd find in a phone's settings, rather than each button carrying its own separate outline. Whichever part the shopper is reading is filled in with your site's main colour and the rest are plain text beside it, so the row reads as one control with a current position instead of a handful of buttons that happen to be next to each other. Nothing to set: it's simply how the row looks now, and everything below - the alignment, the sticky switch, the padding, the colours - still does exactly what it did.

The row can also carry a **background colour of its own**, picked from your site's palette (or any colour you like) rather than sitting on the page background. Set a **separate dark mode colour** underneath it if the light one doesn't suit after dark, and slide the **background opacity** down if you'd rather the page showed through a little - handy when the row is stuck to the top of the screen and you want a hint of what's passing behind it. Leave the colour blank and nothing changes: the row stays as it always was.

On a phone the row of buttons scrolls sideways when there are more tabs than fit, and the one for whatever the shopper is reading now slides itself into view as they scroll down the page. Before, the **Downloads** button could quietly light up somewhere off the right-hand edge, where only a shopper who thought to drag the row across would ever see it.

The row also ends with a filled button of its own, so the shopper never has to hunt for the buy button after tapping their way down the page. On a straightforward product it says **Add to basket** and pops the item straight in the basket from wherever they're reading. On a product sold in different versions - a colour, a size, that sort of thing - it says **Configure** and jumps them straight to the option pickers themselves, since there's nothing to add until they've chosen. And on a phone, where the product photo pins itself to the top of the screen while the shopper picks their options, a sticky tab row now stays put above that pinned photo rather than ducking out of sight.

If you'd rather a plainer set of jump-links - the same idea with none of the tab-style buttons or the lit-up highlight - drop in the separate **Section links** piece instead and put it wherever you like, above the photo or across the top of the page. Either way, pair your links with a **Sections** piece set to **stacked** or **accordion** so there's always a section for each one to land on.

The **Product Card** sub-tab does the same for the little product cards, with **Standard** (photo on top), **Overlay** (the name and price floating over the photo) and **Horizontal** (photo on the left, details on the right) to choose from. Design it once and it applies to every card across the shop.

If you have the Variations module, the Product Card sub-tab also offers a **Card: Variation options** piece. Drag it onto the card and every product that has options set to show there summarises them: a row of colour or fabric swatches, or a plain comma-separated list of sizes, each behind whatever heading you chose. Which options appear, what they are called and how many are shown before a "+4" is decided per product on its Variations tab. See [Shop variations](Shop-variations) for that half.

The **Card: Short description** piece has a fourth setting alongside its 1, 2 and 3 line caps: **Fill the spare space**. Cards in a row are all drawn to the height of the tallest one, so a product with fewer options than its neighbours used to sit above a band of empty card. Set to fill, the short description pours into exactly that band - as many whole lines as fit, ending with an ellipsis where the writing runs on - and never a line more, so it cannot stretch the card or the row. The tallest card in a row shows no description at all (it has no spare space to fill), a card with a little shows a little, and the same card may show four lines on a desktop and one on a phone, because the space itself changes with the screen. Products with no short description are unaffected either way.

On a phone, product grids now show **two products across** rather than one. A single card per row turned a category into a very long scroll indeed, with most of the shop hiding below the fold. Because each card is half the width it was, the wording on it - the name, the price, the option swatches, the link - steps down a little to match, so it still sits neatly inside the card instead of wrapping onto five lines. The photos keep their shape and take the room the words gave up. Nothing changes on a tablet or a desktop.

Both come with a sensible design switched on from the moment Shop starts, so nothing looks broken before you touch them. If you want a *particular* grid or the product page to use a different design from the shop-wide one, open that block's settings and pick a **Layout** there; leave it on "Use shop default" to follow whatever you've published.

You can also drop a whole **Category** layout onto any other page - your homepage, for instance - using the **Embed Layout** block, then pick the category and the number of products to show. See [Managing pages](Managing-pages) for how that block works.

### Every block with a proper set of settings

From shop 0.1.198 the blocks that used to take life as they found it carry settings of their own. Every one of them starts set to exactly what the block did before, so nothing on a published page changes until you open a block and change something.

- The **product grid** can order its shelf: newest first (as always), best sellers first, price in either direction, or by name. It can carry a **heading** and a smaller line beside it, and you can reword the message shown when a shelf turns out to be empty.
- A **featured collection** can take a heading of its own instead of the collection's name, the same ordering choices as the grid, and a **View all** link through to the full collection page for shoppers who want more than the sample.
- The **category browser**'s cards can drop their little descriptions where you'd rather have a tighter grid of pictures and names.
- The **category header**'s small line above the name - it has said *The range* since the day it appeared - is now yours to reword or remove, and the breadcrumb trail and the description each have an on/off switch. The **collection header** gets the same two switches.
- The **promo banner** chooses which side its picture sits and how big it is, a filled or outline button, centred text if the mood takes you, and a line of small print under the button for the terms nobody reads but everybody needs.
- Every **checkout step heading** is editable - Contact details, Delivery address, Delivery method, Payment method, Order review - along with the order summary's heading and its **Edit basket** link, the wording on the **Place order** button (the total stays on it no matter what you call it), and the padlock reassurance line beneath it, which steps aside entirely if you blank it.
- The **back-in-stock form**'s invitation line, the hint inside the email box, the button and the thank-you message are all yours to reword.
- On the **product card**, the name and the short description can each be capped at one, two or three lines, so one long-winded product can't make its card twice the height of its neighbours; anything longer trims off with an ellipsis. The **badge** piece can switch each kind of badge - New, stock, trade - on or off individually, for shops that find "Low stock" a bit much on a browsing page.
- The **related products** strip can lie down as a sideways-scrolling carousel instead of a grid, and the **you might also like** strip takes a cap on how many suggestions it offers.

### The cart, your way

The basket page is now designable too, from its own **Cart** sub-tab - it no longer has to make do with one fixed look. Out of the box it shows a ready-made design built around a new **Cart** block: the full working cart - items, quantities, a remove button, a coupon box, the running total and the checkout button - with a suggestions row underneath. Two other starters come with it: a **two-column** layout with the items on the left and suggestions in a sidebar, and a **card list** that puts each item in its own tidy card.

The basket is quick about it, too. Once a shopper has visited their cart, coming back to it shows their items instantly from a copy kept in the browser for that visit, while the shop double-checks prices and stock in the background and corrects anything that changed - no more staring at grey placeholder boxes. The "you might also like" suggestions are fetched in one go for the whole basket and only refresh when the items themselves change, so fiddling with quantities or delivery choices no longer makes the whole strip reload.

The Cart block carries a generous drawer of settings to make it look like yours rather than ours. Choose whether the items sit as simple **rows**, tidy **cards** or a proper **table**; show or hide the product photos (and set their size), the per-item price, the stock warnings and the pre-order note; and pick how shoppers change the amount - the rounded minus/plus stepper it now uses out of the box, a plain number box, or read-only if you'd sooner they adjusted it elsewhere. The remove control is a small red cross by default, though the old **Remove** wording is still there if you prefer words to symbols.

The totals at the foot of the basket now show their working. Instead of one Subtotal quietly swallowing everything, the shopper gets **Subtotal**, then a line for anything a module has priced into their items - with **Advanced Shipping** installed that is a **Delivery** line carrying whatever the chosen delivery and assembly services come to - then **VAT**, then the **Total**. The goods figure is genuinely the goods, so a £66 installation service no longer hides inside the price of a chair. If your prices already include VAT (the usual setup here), the VAT line is labelled "VAT (included)" and is not added on top again, because it is already in the figures above it - the Total is Subtotal plus Delivery, and the VAT line is there so the shopper can see how much of it is the taxman's. Switch the shop to VAT-exclusive pricing and the same line starts adding itself to the Total instead, with no setting to change. Set [prices to show with tax included](#showing-prices-with-or-without-tax) and the basket follows suit: the item prices are the ones the shopper saw on the shelf, and the VAT line goes back to reading "(included)" whichever way the prices are actually stored. Every label is yours to reword, and the sticky bar at the bottom of the window carries the Total rather than the subtotal, so the two never disagree. The **Order review** step at checkout now reads the same way - goods, then any delivery or service charge, then a discount if there is one, then postage where you charge it, then VAT, then the Total - so a shopper who compared the two would find them telling the same story. The figure charged is unchanged by any of this: the split is about explaining the money, not moving it.

Two more switches sit with the totals. **Sticky checkout bar** puts a slim bar along the bottom of the window - item count on the left, running total and a checkout button on the right - which slides up only once the real total has scrolled out of sight, so a long basket never leaves the checkout button stranded miles below. Other modules can add a line to it: with **Advanced Shipping** installed the left-hand side reads "3 items · everything by Friday", the date being the last of the basket's own delivery dates, so the whole order's finish line follows the shopper down the page. **Undo after removing an item** catches the inevitable mis-click: remove a line and a small dark message appears at the bottom of the screen saying what went, with an **Undo** link that puts it back exactly as it was - same quantity, same options, same place in the list. It waits five seconds, fades away, and takes the offer with it. Both are on to begin with; turn either off in the block's settings if you'd rather not. You can reword and recolour the checkout button, the coupon box, the subtotal line and even the "your basket is empty" message, with every colour drawn from your own palette so it stays on-brand without any faff. The same block can be dropped onto any other page too, should you want a cart somewhere unusual. Prefer the old plain basket? Just leave the Cart tab unpublished and it carries on exactly as before.

Two more blocks let you break the basket in half: **Cart items** and **Cart totals**. Between them they do precisely what the single **Cart** block does - the same settings, the same look - only in two pieces, so anything you want to say between the shopping and the paying can go where it belongs. A delivery arrivals summary, a note about lead times, a reassuring word about returns: drop it between the two rather than parking it above the basket or stranding it under the checkout button. The items half carries the lines, the remove buttons and the undo message; the totals half carries the coupon box, the item count, the totals and the checkout button. An empty basket says so once, in the items half, and the totals half has the good sense to say nothing at all. Your existing basket page is untouched until you choose to swap the one block for the pair.

### The checkout page, pulling its weight

The checkout used to keep the shopper's actual order rather quiet: a totals table at the bottom and not a word about what was being bought. It now opens with **Your order** - every item with its photo, its quantity, its price and, crucially, its own choices spelled out underneath: with **Advanced Shipping** installed that means each item's chosen delivery service and its promised date ("Delivery: Express Delivery - by Mon 11 Aug"), shown *before* anyone pays rather than springing it on the confirmation page afterwards. Any whole-basket promise ("everything by Fri 4 Sep") sits under the list, and an **Edit basket** link takes the shopper back to the cart if something needs changing - checkout itself stays a straight line to the finish.

That summary is its own block, **Shop: Checkout - Order summary**, and the ready-made checkout designs all include it: the single-column ones put it first, so the shopper starts by seeing what they're buying, and the two-column one puts the whole summary down the left with the checkout steps alongside on the right - and the summary can be set to stay put while the page scrolls, so the order never disappears off the top while someone types their address. On a phone the summary starts folded away behind a Show link (the item count and total stay visible), because the fields are what a phone-sized screen is really there for. And a basket whose items have since been removed from the shop now says so plainly, rather than presenting a heading over thin air. The checkout page itself now gives a published design proper room to spread out, rather than squeezing everything into one narrow middle column. An existing published checkout design won't change by itself - open **Appearance → Layouts → Shop → Checkout** and drop the block in wherever suits, or pick a fresh starter.

The delivery address can look itself up, too. With the [Address Lookup](Address-Lookup) module installed (and an Ideal Postcodes key entered), the shopper types the first line of their address into the ordinary Address line 1 field, picks the right one from the suggestions underneath, and the rest of the address fills itself in. Without the module - or if the lookup service is having a bad day - the fields simply behave as they always have.

An empty basket now gets an honest answer, too. Arrive at checkout with nothing in the basket - a bookmarked link, a back button, an order already placed in another tab - and the page no longer presents a full set of contact, delivery and payment forms for an order that doesn't exist. The order summary says the basket is empty and offers the way back to the shop, and the rest of the checkout politely stays out of it.

The forms have come along too. Every field has a proper visible label (not grey text that vanishes the moment you start typing), the browser's own saved details fill things in with a tap, and mistakes are pointed out politely next to the field the moment you leave it - "Enter your postcode", not a vague red sulk at the top. The email field says why it's wanted (that's where the confirmation goes), and the phone number explains itself: it's only used about that delivery. The phone box sits on the delivery step, directly under the first and last name and above the business name, rather than up with the contact details - the number wanted is whoever's at that door, which isn't always the person paying, and it's kept against that address afterwards for the same reason. Contact details are now just the email address and the full name, and for a signed-in customer that name arrives already filled in from their account. The phone box says **Phone (optional)** unless you've ticked **Require a phone number at checkout** under Settings → Shop → Checkout, in which case it drops the "(optional)", asks for a number before the order can be placed, and says "Enter a phone number" if someone skips past it. With a number made compulsory, picking a saved address that hasn't got one brings the delivery form back out so there's somewhere to put one, instead of hiding the only box that could answer for it. Up to and including shop version 0.1.177 that tickbox was pure decoration: it saved happily, and the checkout carried on calling the field optional and taking orders without a number, which is a poor show from a setting with the word "require" in its name. The address section is now honestly titled **Delivery address**, with **Delivery method** below it where you charge postage by zone.

The last step earns some trust as well. The place-order button now says exactly what's about to happen - **Place order - £84.20** - so nobody clicks into the unknown, and a small padlock note by the card fields points out that card details go straight to the payment provider, encrypted, without ever touching your site. And if you've never published a checkout design at all, the page no longer shrugs and shows nothing: the full standard checkout appears on its own, exactly as the classic starter would lay it out.

Picking a payment method is now just that - picking one. The methods that finish somewhere else (PayPal, Instant Bank Pay) used to whisk the shopper off the moment they touched the radio button, before they'd so much as glanced at the total. Now nothing happens until **Place order** is pressed, and that button is the only thing that hands anyone over. Coming back afterwards without having paid starts the payment again properly rather than quietly waving the order through to the thank-you page, which is the sort of tidiness you only notice when it's missing. And paying that way now empties the basket on the way through, so nobody is thanked for an order they're apparently still carrying.

And the payment methods no longer insist on being last. A shopper who fancies choosing how they'll pay before they've finished typing their address can now do exactly that: the choice is remembered, a line underneath says what's still needed, and the card fields (or the bank details) appear on their own the moment the rest is done. What holds the order back instead is the **Place order** button, which stays greyed out until everything is genuinely finished and tells you which bit is missing - a payment method, or a tickbox further down. Rather better than being told off for doing things in the wrong order by a page that put them in that order in the first place.

And when the total isn't showing at all, the order review now says why in as many words. Rather than a blanket "fill in your details above", it lists the boxes still waiting - Email, Postcode, whatever it happens to be, named exactly as the form above names them, your own wording included if you've renamed the business-name box. Each one is a link that takes the shopper straight to it, which on a long checkout saves a good deal of scrolling and squinting. An address typed into the email box that isn't quite an address gets a note of its own rather than being called blank, since telling somebody to fill in a field they have very obviously filled in helps nobody.

The thank-you page is straighter about what happens next, too. Pay by bank and the money is authorised on the spot but takes a few minutes to actually clear, which used to leave the page saying only that the order was "awaiting payment confirmation" - the same wording someone gets when they've been asked to go and make a bank transfer themselves, and quite the opposite meaning. It now says the payment has gone through and that clearing usually takes a few minutes, and then the page waits with them: it checks quietly in the background and announces the moment the payment clears, so nobody sits there jabbing refresh. It checks briskly for the first minute, eases off, and after five minutes stops and says so, since the confirmation email is coming either way. Wander off to another tab and it picks the thread back up when you return. If the payment doesn't clear, the page says so plainly, points out that nothing has been charged, and sends the shopper back to checkout with their basket still intact rather than thanking them for an order that never happened. Behind the scenes those failures now actually land: a bank payment that fell over after being authorised used to sit in your orders list looking like money still on its way, forever, and now shows as failed like it should.

### Asking for a business name

Sell to businesses and you'll want their company name on the delivery label. **Settings → Shop → Checkout → Business name** adds a box for it, sitting directly above the first line of the delivery address where a business address expects to find it (and where the browser's own autofill will happily fill it in).

Two switches go with it. One makes the box compulsory, so an order can't be placed without one. The other lets you call it whatever your customers call themselves - Company name, Practice name, School, Department - and the wording follows through to the message they see if they leave it blank. Left off, nothing changes and nobody sees an extra box.

The business name shows up on the order in the admin, above the address, and on the customer's own confirmation.

### Tickboxes at checkout

Under **Settings → Shop → Checkout → Tickboxes at checkout** you can put tickboxes just above the Place order button.

The first one is ready-made: **agree to your terms and conditions**. Switch it on and it appears; mark it required and no order goes through until it's ticked. Leave the link box empty and it points at whichever page you've set as your terms page, so moving that page around never leaves a dead link behind at the one moment it matters. Want your own wording? Put square brackets round the words that should be the link - `I have read and agree to the [terms and conditions]` - and those words become it.

Below that you can add as many of your own as you like: age confirmations, a note about bespoke items being non-returnable, permission to be contacted about the order. Each one has its own wording, its own optional link, and its own required-or-not switch. A tickbox you've written nothing beside is quietly left out rather than presented as an unanswerable question.

What matters most is what happens afterwards. Every tickbox the shopper was shown is recorded on the order **in the wording they saw on the day**, along with whether they ticked it and when. Rewrite your terms next month and past orders still show what was actually agreed to - which is rather the point of asking. It's all on the order in the admin, under **Agreed at checkout**.

A required box that hasn't been ticked simply leaves the **Place order** button greyed out, with a line above it saying which boxes are wanted - no clicking a button to find out it wasn't going to work. And because a tickbox in a browser is only ever a suggestion, the order won't be created without the required ones ticked even if someone tries to go round the form.

### The order confirmation

The thank-you page used to be a heading, a bare list of items and a couple of grey paragraphs. It's the last page of the whole shop, the one people screenshot, forward to whoever does the accounts and come back to a week later wondering where their parcel is - so it now behaves like a receipt.

It opens with the answer: a tick and a thank you by name, and one line saying where the confirmation email is going - which is the last moment anyone can spot a typo in their own email address. Then the order itself: every item with its picture, quantity, unit price and any choices made at the time, followed by a proper totals block that shows the discount and the coupon that earned it, the delivery charge and which service it was (free delivery says so out loud, rather than leaving a row missing), and the VAT. Underneath sit the delivery address, the delivery method and how it was paid - side by side on a computer, stacked on a phone. It prints sensibly too, since a receipt is one of the few web pages people genuinely do print.

The page still says the right thing for every ending: paid, still clearing at the bank, waiting on a bank transfer you've asked them to make, or a payment that fell over. And it still waits with the shopper while a bank payment clears, announcing the moment it does.

### The slide-out basket

The **Cart Summary** widget - the little trolley you drop into your header - has always been a link to the basket page. It can now be a door instead. In its settings, **When clicked** offers two choices: *Go to the cart page*, which is what it has always done, or *Slide out a basket summary*, which keeps the shopper exactly where they are and slides the basket in over the page.

It also opens itself. Add something to the basket from anywhere on the site and the panel slides in of its own accord, so nobody has to go hunting in the header to check that the thing they clicked actually went in. It comes in from whichever side you've set, at a proper unhurried slide rather than simply materialising.

Whatever was just added sits at the very top of the basket, on the panel and on the cart page alike - including something already in there that the shopper has added more of, which moves up to join it. A long basket no longer means scrolling to the bottom to see what you just did.

What slides in is the real basket, not a teaser. Every item with its photo, its chosen options, the minus/plus stepper and a **Remove** link, and - if you run **Advanced Shipping** - the same delivery service picker each item has on the cart page, so a shopper can move something to a faster service without ever leaving the product they were reading. A panel is a narrow thing, so it arranges those pieces to suit itself: the price, the amount and the **Remove** link stack in one tidy column down the right, all the same width, and the delivery service sits across the full width underneath the photo and the name where its wording has room to breathe. The cart page itself is unchanged. Any whole-basket promise your delivery settings work out ("everything by Fri 4 Sep") sits above the total, in green, with a tick. Underneath: the subtotal, a **Checkout** button and a **View full basket** button for anyone who wants the roomier page. Remove something by mistake and the usual **Undo** message appears, exactly as it does on the cart page.

One place the trolley now keeps quiet: the basket page. The whole basket is already on the screen there, so a second one in the header was never earning its keep. It reappears everywhere else, checkout included.

It behaves itself, too. The panel closes on the **Esc** key, on a click of the dimmed page behind it, or on the cross in its corner, and the page underneath stops scrolling while it's open so a shopper can't lose their place. Keyboard users are put inside the panel when it opens and back on the trolley when it shuts.

The wording and the look are yours: the heading, the subtotal label, both button labels, the "your basket is empty" message and the keep-shopping link are all editable, the buttons take colours from your own palette, and you can set how wide the panel is, how round the buttons are, and whether it comes in from the right or the left. Product photos and the delivery picker can each be switched off if you'd rather keep it lean. Leave **View full basket** blank and that button simply isn't there.

The trolley itself has a **Hover colour** as well. Leave it blank and it warms to your site's main colour under the mouse, the same as the theme toggle, the Icon Link and the members sign-in button, so the whole row of header icons answers the cursor in one voice.

Leave the **Text label** blank and the trolley also gains a small "Basket" tooltip on hover, the same quiet label the other icon-only header buttons already show.

One honest caveat: the panel stays shut inside the layout editor. It covers the whole page it belongs to, and letting it do that over the design canvas would hide the very thing you were editing. Publish and try it on the real site.

Editing layouts is covered by the core **Appearance → Layouts** permission, same as your header and footer - not by any of the Shop permissions above. A role with `shop.manage` but not that permission can run every other part of the shop but won't see the Layouts screen.

---

## Product options and personalisation

Want size/colour choices, or let customers add engraving, a gift message or an uploaded file? Install the **[Shop Variations](Shop-variations)** module. It adds size/colour variant matrices (each combination with its own price, stock, SKU and photo) and personalisation add-ons, right inside the product editor, with no changes to how your cart or checkout work.

Selling something a photograph struggles with - furniture, a lamp, anything with a back to it? Install the **[Product 3D views](Product-3D-views)** module. It puts a slowly turning 3D model in the product gallery alongside your photographs, which shoppers can click to turn, pan and zoom. Models can be attached to a product or to individual variations.

Want your customers saying why the thing was good, where the next shopper will read it? Install the **[Reviews](Reviews)** module. It adds a Reviews tab to every product page, holds each new review until you have read it (unless you would rather it went straight up), badges the ones written by people who actually bought the thing, lets you reply underneath, and will email past customers to ask if you want it to.

## Quoting instead of selling

Price every job on its own merits, quote trade against list, or simply have customers who want a figure in writing before they commit? Install the **[Quotes](Quotes)** module.

It works two ways. Leave your checkout exactly as it is and add a "Save basket as a quote" button, so a shopper can park a basket, walk away with a short code and fetch it back later - useful on any shop, not only a quoting one. Or switch the shop over entirely: every buy button becomes "Add to quote", the basket leads to a quote request page rather than the till, checkout stops serving, and prices can be withheld until you have quoted them yourself. Quotes land in a list under Shop, where you price them, reply, send them out and turn the accepted ones into ordinary orders.

## Settings

**Settings → Shop** is split into General, Checkout, Payments and Notifications tabs. General covers store identity (currency, order number format, weight/dimension units), page title and description for search engines, the shop's open/browse-only/closed status, what happens to products that have [sold out](#hiding-things-that-have-sold-out), the supplier support described below, and the product image zoom described below. Checkout covers tax mode, guest checkout, minimum/maximum order value, whether a phone number is required, which checkout steps are shown, the back-in-stock account nudge, and how mixed pre-order/in-stock baskets are sent out (see [Mixed baskets with a pre-order in them](#mixed-baskets-with-a-pre-order-in-them) above). Payments lists every method the shop can take money with - switch each on or off, drag them into the order shoppers meet them at checkout, and give each one a button of its own holding its keys, its bank details or its wording. Notifications covers alert addresses for new orders and low stock. What those emails actually say - order confirmed, shipped, back in stock, and the rest - is edited on **Settings → Email → Templates** alongside every other email your site sends, wrapped in whichever design you have set there. Any wording you had already changed came across with the update.

### Recording who supplied something

**Enable suppliers support** on the General tab is off to begin with, on the reasonable assumption that plenty of shops make their own things and have nobody to name. Switch it on and two things appear: a **Suppliers** entry in the menu under Shop, and a box on every product for picking which of them it came from.

Switch it on and three choices follow. First, what to call it: **Supplier**, **Manufacturer**, **Retailer**, **Importer**, or your own wording if none of those is quite right. Whatever you pick is the wording used everywhere the field turns up, so a shop that thinks in makers never has to read the word "supplier" again.

Second, whether shoppers see it. Leave that off and the name is yours alone, sitting in the admin as a buying reference. Switch it on and it appears as a line on the product page's Specification tab, alongside the SKU and the weight.

Third, where the box appears: **Products only**, or **Products and variations**. The second option adds a column to the variations grid, which is what you want when the red ones come from one place and the blue ones from another. Products and variations both carry their own name, so a variation only shows one if you've actually filled it in - and if shoppers can see it, the line on the product page follows whichever one they've picked, falling back to the product's own if that particular variation hasn't got one.

Switching the whole thing back off hides the Suppliers menu entry and the boxes, but keeps every supplier and every name you'd recorded, ready for when you change your mind. The same goes for narrowing the field back to products only: variation suppliers are left where they are, not scrubbed.

Supplier names travel with your product spreadsheet as well, in a **supplier** column on the products export and a **Supplier** column on the variations one, so you can fill in a hundred of them in a spreadsheet rather than one at a time. A spreadsheet exported before the field existed imports perfectly happily - a missing column leaves the names alone rather than wiping them.

### The Suppliers screen

**Shop → Suppliers** is the address book behind that box. Each entry holds a name, your account number with them, the trade discount you're on, whether they're enabled or disabled, a contact person with their phone number, email address and postal address, and a notes field for everything that fits nowhere else.

Two columns on the list are worked out for you rather than typed: how many products carry that supplier's name, and how many variations do. Handy for the moment somebody stops trading and you need to know how much of the shop that actually affects.

**Disabled** is the polite version of deleting. The record stays, everything filed against it stays, and the name simply stops being offered when you're picking a supplier on a product. Ideal for a supplier you've stopped using but might go back to.

Renaming a supplier carries every product and variation filed under the old name across with it, so nothing is left stranded. Deleting one, on the other hand, leaves those names exactly where they are - removing an address book entry isn't a decision to forget where four hundred products came from. Add the same name back and the counts come straight back with it.

Adding a supplier doesn't mean stopping what you're doing, either. The dropdown on a product, and the one in the variations grid, both end with **Add a new supplier**, which records a new one there and then and makes it available on everything else too.

### Their catalogues

Most suppliers hand you a catalogue or three - "Spring 2026", "Seating", the trade price list - and most of those end up as a spreadsheet somebody has to go and find. The supplier form has a **Catalogues** section for exactly that: add as many as you like, each with a name and the web address it lives at, usually a Google Sheet.

They show up on the Suppliers list beside the supplier, as clickable links where you've given one, so getting to the right price list is a click rather than a rummage through your email. A catalogue with no link yet is fine - the name on its own is still better than nothing.

Two catalogues under the same supplier can't share a name, for the obvious reason. Different suppliers can, of course, since half of them call theirs "Main catalogue". Deleting a supplier takes their catalogues with them, which is the one place the address book does forget something.

If you have the Google Sheet module, your suppliers and their catalogues also get a tab of their own in the spreadsheet - see [Google Sheet Products](Google-Sheet-Products).

### Zooming in on your product photos

**Zoom the image on hover** on the General tab magnifies whichever part of the main product photo a shopper points at, so they can inspect the grain, the stitching or the small print without you having to upload a set of close-ups. On a phone or tablet a tap magnifies the spot they touched, a drag moves the magnified area about, and a second tap zooms back out. It's off to begin with, and switching it on changes nothing about the photos themselves - the same picture simply gets a closer look.

Worth knowing: the zoom works on the shopper's biggest copy of the photo, so a small, low-resolution upload will magnify into a blurry mess. If you're turning this on, upload your product photos at a decent size.

When the shop status is set to closed, visitors see your closed message instead of the shop. That covers every shop page, not just the front one: product pages, categories, collections, the cart, the checkout, order lookups and download links all show the closed message too. Closed means closed, including to somebody who kept a link to a particular product and tried it directly.

Anyone signed in with Shop access still sees the whole shop as normal, with a note at the top of each page reminding them it's closed to everyone else, so you can walk the place over before you reopen.

One deliberate exception: the unsubscribe link at the bottom of a back-in-stock email keeps working while you're closed. Someone who wants off your list should never have to wait for you to open the doors again.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Gazette](Gazette) · [Boards](Boards) · [Directory](Directory) · [Shop](Shop) · [Shop Variations](Shop-variations) · [Product 3D views](Product-3D-views) · [Reply Catcher](Reply-catcher) · [Configuration reference](Configuration-reference)
