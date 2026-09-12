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
- Each variation's listing links to that combination's **published address** - the product page carrying the chosen options, exactly as it appears in your sitemap - which opens the product page with that combination already chosen. From 0.1.11 this is the same address search engines are told about, rather than the variation's own private one.
- Its own photos when it has them, the product's photos when it doesn't.
- Its real availability: in stock, out of stock, back-order or pre-order, by the same rules the shop itself applies. Sale prices travel as sale prices.
- Prices are always sent **VAT-inclusive**, whatever the storefront is set to display - that is what Google requires in the UK.
- The shop's own category trail (for Google's "product type"), and - once you have filled them in - Google's own category for the same product. The two are different things and the feed carries both: yours is your wording, Google's is theirs. See [Getting your listings onto the same page as everyone else's](#getting-your-listings-onto-the-same-page-as-everyone-elses).
- The variation's options mapped onto Google's colour, size, material and pattern attributes by their names - a "Seat Colour" option lands on colour, a "Width" on size, a "Finish" on material. Options that fit none of them stay in the listing's title, which always carries the full variation name.

**What stays out:** draft and hidden products, products the shop is hiding for being out of stock (where that setting is on), non-physical products, and anything ticked **Keep this product out of the feed**. Your product codes stay out too unless you say otherwise - see the section below, which is about when you should.

## Per-product details

Each product's editor gains a **Google Shopping** tab (on the parent product - variations inherit it):

- **Brand** - overrides everything else for this product.
- **GTIN** - the product's barcode, where it has one. Variations don't need this: each variation's own **Barcode** field (on the Variations tab) is used automatically, whenever it holds a real 8, 12, 13 or 14 digit code.
- **MPN** - the manufacturer's part number, if the maker publishes one.
- **Google product category** - a value from Google's own category list, for this product alone. Optional, and usually unnecessary: it is far less work to answer once per category, which is what the settings tab is for. Filled in here, it beats whatever the category says.
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

**These four now reach further than the feed.** The brand, the barcode, the part number and the condition are also published in the hidden description every product page carries for search engines and AI assistants - see [Shop](Shop#what-search-engines-and-ai-assistants-are-told-about-a-product). It is the same answer resolved the same way, so a shopping result and a Google listing can never name two different makers. Worth a look at rule 2 above if your suppliers are middlemen: switched on, the middleman's name is now the brand on your own product pages too, not only in the feed.

Left entirely alone, the feed still works: products with no GTIN or MPN are marked for Google as having no standard identifiers, which is normal for made-to-order furniture and the like.

## Getting your listings onto the same page as everyone else's

If your products show up on Google on a page of their own, with your shop as the only seller, while half a dozen rivals sit together on another page for the very same thing, this section is the one you want.

Google decides which of those pages a listing belongs on by asking three questions in order:

1. Does the barcode match one Google already knows?
2. Failing that, do the brand and the maker's part number match?
3. Failing that, does the title and the photograph look enough like somebody else's?

Miss all three and Google has no choice but to give you a page to yourself. That is not a penalty, but it does mean nobody comparing sellers ever sees you.

The awkward truth is that a barcode only helps if somebody else is publishing the same one. In plenty of trades - office furniture very much included - nobody publishes barcodes at all. Everybody publishes the maker's part number instead.

### Send your product codes as the maker's part number

**Shop → Settings → Google Shopping → Defaults**, the tick box reading **Send your product codes as the maker's part number**.

Off by default, and it stays off until you decide. Whether to switch it on comes down to one question: **whose codes are they?**

- **Switch it on** if your product codes come off a manufacturer's price list - the codes printed on the box, the ones every other shop selling that thing quotes. Sending them is what puts you on the same page as those shops instead of a page of your own. Each variation sends its own code, which is the whole point: a code names one particular thing, not forty colours of it.
- **Leave it off** if the codes are your own invention, or a private buying reference you would rather not publish. A part number nobody else uses matches nothing, so you would be giving away what you call your stock for no return whatsoever.

If you have typed a part number on a product's own Google Shopping tab, that still wins. A variation never borrows its parent's typed-in part number - that would claim forty colourways are all the same item, which Google is quite right to object to.

The same codes also appear in the hidden description your product pages carry for search engines and AI assistants, for the same reason the brand does: a page and a feed that name two different part numbers for one product are worse than neither.

### Google's own categories

**Shop → Settings → Google Shopping → Google's own categories.**

Google keeps a list of every kind of thing anybody sells, and knowing which entry a product is decides where it can be shown and what Google expects to be told about it. Your own categories go along to Google as well, but those are your wording; this is theirs.

It is filled in **once per category, not per product**. A shop with twelve thousand products usually has about forty categories, so this is a morning's work rather than a fortnight's. Paste either the number or the full wording from Google's product taxonomy, such as `Furniture > Chairs > Office Chairs`.

- A category you leave blank uses whatever its **parent** says, so filling in the top of your tree does most of the work and a category added later is never left blank by accident.
- A value typed on an individual product's Google Shopping tab beats both.
- Nothing is checked against Google's list here. Google revises that list, and being refused a save because this module's copy of it had gone stale would be the more annoying failure by far. Merchant Center says plainly enough if a value is wrong.

### What this cannot do for you

Two things decide the same question and neither is a setting:

- **Your brand has to be the one Google knows.** If your products are filed under a distributor rather than the name on the box, and **Use the supplier as the brand** is on, that distributor's name is what Google is told. Worth checking what the sellers you want to sit beside are calling it.
- **Your titles have to resemble theirs.** Where there is no barcode and no part number to go on, the title is all Google has, and a product named your way is a product Google cannot place.

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

## Delivery charges

Separately from the dates above, the feed can carry your actual delivery charges - every service a product can be bought with, priced and dated, rather than the flat rates set up in your Merchant Center account. Find it under **Delivery** in the Google Shopping settings tab.

It is off to start with, deliberately. Switching it on has a consequence worth being clear about: **for every product in the feed, your Merchant Center delivery rates stop applying and these charges take over.** That is the whole point of it, but it means a wrong charge here is a wrong charge on Google, not a harmless extra.

Two things to fill in:

- **Send your delivery charges with each product** - the switch itself. Greyed out on a shop with no module publishing delivery services, because there would be nothing to send.
- **Country these charges apply to** - two letters, GB for the United Kingdom. Google will not take a delivery charge without knowing where it applies.

What actually goes across, per product:

- Every service that product is offered, by the name you gave it - "Flat-Pack", "Express Flat-Pack", "Installation".
- Each one's price, with VAT added the same way the product's own price has VAT added.
- Each one's own dispatch and delivery days, which can differ per service - an express service and an installation on the same desk carry their own timings.

**What a shopper sees:** not a menu. Google takes the cheapest service a shopper can have and quotes that, so a product with a free option is advertised as free delivery, and the paid services simply sit behind it. The gain is accuracy on the free option and honest dates, not a picker on the search results.

A service the shop cannot put a firm number on gets left out rather than misquoted. The rest still go.

**On tax classes.** The charge follows the product: a variation uses its own tax class, or its parent listing's where it has none of its own, exactly as its price does. Only a product with no tax class anywhere - itself or its parent - sends its delivery charge without VAT, and that product is already selling at the wrong price too, so it is a catalogue problem rather than a delivery one.

## Grouping products for delivery rates

The other way round from the section above, and the two are alternatives rather than a pair. Instead of sending Google your charges, you can tell it which **delivery group** each product belongs to and set the rate for each group over in Merchant Center. It suits a shop where what you charge depends on what the thing is - a chair, a desk, something made to order - more than on the product itself.

Find it under **Delivery** in the Google Shopping settings tab, as **Group your products for delivery rates**. Pick one of your product attributes and each product goes to Google labelled with its own value for it. Off to start with, and off is the whole list until you pick something.

- A variation uses its **own** value where it has one, and its parent listing's where it has not - the same way everything else about a variation reads.
- A product ticked against two values of the attribute sends the first of them, in the order you have the values in. Arbitrary, but the same every time - a label that wandered between runs would move the product between rate groups every time Google fetched the feed.
- The dropdown is empty, and the setting greyed out, on a shop with no module keeping product attributes. Nothing to group by.

**Keep the wording brief.** Google allows 100 characters. Anything longer is shortened on the way out, with four odd-looking characters put on the end so that two long values that only differ near their end do not arrive as the same group - which would quietly hand them the same delivery rate. It works, but you then have to recognise the shortened version in Merchant Center, so short names are worth the ten minutes.

Whatever the label says is what you type into the delivery rate in Merchant Center. It is your own wording travelling across unchanged, not a code.

## Things that cannot be sent back

Some things genuinely cannot come back - upholstered to order in a fabric somebody chose, cut to a size nobody else wants, painted a colour only one office likes. The shop already knows which those are: it is the **Returns** setting on the product, and the sentence you wrote there is what a customer reads before they buy.

Turn on **Tell Google which things cannot be sent back**, under Delivery in the Google Shopping settings tab, and that same sentence travels to Google as the item's return policy label. Off to start with, and deliberately so - see the warning below.

- Every variation of a listing you marked follows it, without you touching a single combination. A variation that carries its own answer keeps it, in both directions: the one stock finish in a bespoke range can be returnable, and the one made-to-order finish in a stock range need not be.
- A product you marked as non-returnable without writing a reason sends the stock sentence instead of nothing at all, because sending nothing tells Google the thing **is** returnable.
- Anything you have not marked sends no label and is judged by whatever default policy your Merchant Center account holds. That is the right answer for ordinary stock.

**Set the policies up first.** Merchant Center holds the actual policies - how long somebody has, who pays the postage, what state it has to come back in. The feed only names one. Create a return policy in Merchant Center for each different reason you use, named **exactly** the sentence you wrote on the product, character for character. A name Google does not recognise is ignored without a word, and the item goes back to being treated as returnable - which is the one outcome worth avoiding, and the reason this starts switched off.

The same 100-character limit applies as to delivery groups above, and the same shortening if you go over it. One sentence per reason is plenty.

If you change the wording on the product, change the policy name in Merchant Center to match. They are one thing said in two places, and they only work while they agree.

## Discounts on your listings

If your shop takes money off once a basket holds enough of one supplier's goods - the **order-size discount**, set up under Shop → Settings → Pricing and on each supplier - Google can print that on the listings themselves rather than leaving shoppers to find it in the basket.

Turn on **Advertise the discount on Google**, under Discounts on your listings in the Google Shopping settings tab, and the module serves a third document: a promotions data source. Off to start with, and there is a genuine catch below.

The address is your feed address with `&content=promotions` on the end, and there is a Copy button beside it. It goes into Merchant Center as a **third data source**, the promotions one - alongside the product feed, not in place of it. Google asks to be let into promotions before they will read it, which is a form on their side rather than a switch on ours, and they review each offer before it shows on anything.

### What it works out for you

- **One offer per supplier and amount.** Two products from the same supplier, one taking £6 off and one taking £40, make two offers - because Google's offers carry one figure each. Every product is told which offer it belongs to, so you never have to match them up by hand and there is no limit worth worrying about on how many products an offer covers.
- **Only products currently on offer take part**, because only they carry the money. A product whose sale ends drops out of the next fetch on its own.
- **Every figure includes VAT**, whichever way round you keep your prices, because that is what Google quotes a shopper.
- **A product stamped with more than it sells for is left out.** The basket would only ever take it down to nothing, so advertising the full amount would be a promise nobody could keep. Shop's own mis-stamp report already flags those.

### The catch, in plain words

Google can only say **"spend this much"** about a whole basket. Your rule counts one supplier's goods, and leaves delivery out of the total. So a basket that reaches the figure across two suppliers meets Google's condition and does not meet yours.

The terms sent with every offer say so - that the total is counted across those products only, and that delivery does not count towards it - and there is a box for anything else you want to add. That is the honest fix available, and it is why this starts switched off: it is your advertisement, so it is your decision.

Two smaller differences, both in the shopper's favour, so neither needs an apology:

- The money comes off **each** qualifying item. Google advertises the single figure, so a basket of three gets three times what it says.
- Where a group of products sits on two different VAT rates, the advertised discount is the smallest one anybody gets and the advertised spend is the highest bar anybody has.

### How long an offer lasts

Google caps a promotion at 183 days, so a standing discount is served as a rolling six-month window that every fetch renews. You do not have to do anything about it, and there is no end date to remember.

## Customer reviews on Google

Two separate things, and a shop can have either on its own. Both live under **Shop → Settings → Google Shopping → Customer reviews on Google**.

### Sending your reviews to Google

Needs the [Reviews](Reviews) module, or any other module that publishes reviews. Without one, the switch says so and stays off - there would be nothing to send.

Switch **Serve the review feed** on and copy the **review feed address**. It is the product feed's address with one extra parameter on the end, and it carries the same key. In Merchant Center it goes in as a **second** data source - the product reviews one - not in place of the product feed.

Google will not read it until they have let you into the product reviews programme, which is a form on their side. Ask for it from the Merchant Center account the feed is filed under.

What travels: every review you have **published**, with its star rating, its wording, the reviewer's name as they gave it, when it went live, and the product it is about with whatever brand and barcode that product carries. Reviews still waiting in your queue, and reviews you turned down, stay here - as does anything about a product you have kept **out** of the product feed. Email addresses never travel. Your product codes travel only if you have switched on **Send your product codes as the maker's part number**, and then only as the part number they are.

Reviews collected by the invitation emails the Reviews module sends are marked as such, because Google treats "we asked after delivery" and "somebody wrote in unprompted" differently. A review with no name on it goes as anonymous rather than under an invented one.

### Letting Google ask your customers

Switch **Offer Google's survey when an order is placed** on and fill in your **Merchant Center account number** (the field further up the same tab - nothing appears without it).

From then on, a customer who has paid sees Google's own small dialog on the confirmation page asking whether they would like to be surveyed about their order. If they say yes, Google emails them after the delivery date and asks how it went. Those answers are what produce the star rating beside your name in Google adverts, and - where the barcode is known - reviews of the products themselves.

- **Where it appears** is Google's choice of five positions plus a bottom tray. Their own finding is that the middle of the page gets said yes to far more often than a corner.
- **Usual working days to delivery** is what Google is told when nothing else can say. Where [Advanced Shipping](Advanced-Shipping) (or any delivery module) knows the timing for a product, that is used instead, and the slowest thing in the order decides.
- If your cookie banner carries a **Marketing** category, the dialog waits until the shopper has accepted it. If it does not, there is nothing to wait for and the dialog appears as soon as the page does.

**Switching this on shares the order's email address with Google**, which is what lets them send the survey. Your privacy notice needs to say so.

**One thing to do by hand on an existing site.** The survey rides on a marker block on your **Order Confirmation** layout. Sites that install the module from now on get it placed for them; a site that already had the module needs it added once, in **Design → Layouts → Order Confirmation**, from the block list as **Google Review Survey**. It draws nothing on the page - the dialog is Google's - and once it is there it stays.

## Duplicate pages, canonicals and structured data

Two things ship in the Shop module itself to keep Google happy about all those variation links:

- Every product page now declares a **canonical address**. A variation's own private link shows the parent's page (with the variation pre-selected), so it declares the parent's address as the real one - Google never mistakes thousands of variation links for thousands of duplicate pages.
- A product with variations describes itself to search engines with a **price range** starting at its cheapest choice, rather than claiming one exact price no variation may actually cost - so the feed and the page can never contradict each other.

Neither needs any setting up; they are simply how the Shop behaves from 0.1.243.

### Why the feed's links changed in 0.1.11

The two above did their job a little too well. The feed used to send Google to each variation's own private address, the page quite correctly answered "the real page is the parent listing", and Google filed the lot under **"Alternative page with proper canonical tag"** in Search Console - technically the right answer to the wrong question, and a few thousand of them on a large catalogue.

From 0.1.11 the feed links to the combination's published address instead: the same one in your sitemap, the same one the page stands behind. Feed, sitemap and page now all name one address per variation, and Search Console stops reporting them.

Nothing else about your listings changes - Merchant Center identifies them the same way it always has, so no listing is retired and re-created. Google re-reads the feed on its usual schedule and the reported count falls away over the following weeks rather than overnight. Where a combination has no published address of its own - one where an option was left unanswered, or a product with two options named so alike they cannot be told apart in an address - the feed keeps the old link, because a link that works beats a tidy one that doesn't.

## If Merchant Center turns products down over their pictures

The one to know about is **"Unsupported image type"**. It sounds like the picture is the wrong sort of file, and it almost never is - Google is perfectly happy with JPEG, PNG, GIF and WebP, which is everything the media library makes.

What it usually means is that Google asked your storage for the picture, got a shrug instead, and took the shrug for the picture. Storage does that to a small share of requests - once or twice in a hundred - and Google is working through every image in your catalogue in one go, so a small share of a very large number is a lot of turned-down products. Variations bear the brunt simply because there are more of them.

The cure is one click: **Settings → Media → Deploy Worker**. A current media service asks storage again before giving up, and answers the quick "is it there?" check Google makes before downloading anything, which older ones refused. Once it is redeployed, ask Merchant Center to fetch your feed again and the rejections clear on the next run.

Genuinely broken pictures are a different message - Google says it could not find the image, not that it could not read it.

**Wiki:** [Home](Home) · [Shop](Shop) · [Shop Variations](Shop-variations) · [Advanced Shipping](Advanced-Shipping) · [Modules](Modules) · [Configuration reference](Configuration-reference)
