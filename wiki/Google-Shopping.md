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

**What stays out:** draft and hidden products, products the shop is hiding for being out of stock (where that setting is on), non-physical products, anything set to **Never send to Google** on its own Google Shopping tab, and anything a [feed rule](#feed-rules) keeps out. Your product codes stay out too unless you say otherwise - see the section below, which is about when you should.

## Per-product details

Each product's editor gains a **Google Shopping** tab (on the parent product - variations inherit it):

- **Brand** - overrides everything else for this product.
- **GTIN** - the product's barcode, where it has one. Variations don't need this: each variation's own **Barcode** field (on the Variations tab) is used automatically, whenever it holds a real 8, 12, 13 or 14 digit code.
- **MPN** - the manufacturer's part number, if the maker publishes one.
- **Google product category** - a value from Google's own category list, for this product alone. Optional, and usually unnecessary: it is far less work to answer once per category, which is what the settings tab is for. Filled in here, it beats whatever the category says.
- **Condition** - New, Refurbished or Used, when it differs from the shop default.
- **Send to Google** - three choices. **Follow the feed rules** (the default) sends the product unless a [feed rule](#feed-rules) keeps it out. **Always send to Google** sends it whatever the rules say. **Never send to Google** keeps the product and every variation of it out, whatever the rules say. Before feed rules existed this was a single "keep this product out" tick; every product that had it ticked is now set to **Never send**.
- **Each variation** - the same choice again, one variation at a time. **As the product** does whatever the product's choice does; **Always send** or **Never send** beats both the product's choice and every rule, for that one variation. Saved with its own button.

Both saves come back with an **Undo**, and both are listed in the Feed rules tab's recent changes, where they can be undone later too.

### Jumping straight to a listing on Google

Once the module knows which Merchant Center account the feed goes to, every product's **Google Shopping** tab opens with a short list of links - **one per variation** - that take you straight to that exact listing inside Merchant Center. Handy when Google has taken against one particular size and you want to see what it says about it, without hunting through a few thousand rows.

To switch it on, fill in two boxes under **Shop → Settings → Google Shopping → Your Merchant Center account**:

- **Account number** - the number Merchant Center shows at the top right of its own pages. Spaces and dashes are fine; only the digits are kept.
- **Feed label** - whatever Merchant Center lists against your feed, usually the country you sell into (`GB` for a UK shop). Leave it blank and the links still work, Google just asks which feed you meant when you arrive.

Neither has any effect on the feed itself, and nothing breaks if you never fill them in - the tab simply says so instead of offering links.

The same card can also store **Merchant API access** for the product workbench. This is only for the workbench's match snapshot and benchmark prices: the product feed still works without it, because Merchant Center reads the feed address itself.

To get the JSON key:

1. In Google Cloud, open the project connected to Merchant Center, then go to **IAM & Admin → Service Accounts**.
2. Create a service account, or open the one you already use for Merchant Center work.
3. Open **Keys**, choose **Add key → Create new key → JSON**, and download the file.
4. In Merchant Center, add the service account's email address as a user with permission to view product and report data.
5. Paste the whole JSON file into **Shop → Settings → Google Shopping → Your Merchant Center account → Merchant API access** and save it.

The JSON is stored as an environment variable, so a deployment is needed before the workbench can use the new key. That is mildly annoying, but still better than asking a spreadsheet to remember a private key. The old-fashioned way lies madness and a surprising number of quotation marks.

### Checking what the key is allowed to do

Merchant Center hands out access in levels, and the things this site asks of Google need different ones. Rather than find out halfway through a job, press **Check what this key can do** on the same panel. It asks Google four questions and answers them in plain English:

- **Read your Google reports** - the match snapshot and typical prices below. The lowest level of access covers this.
- **Read your Merchant Center delivery settings** - for the Delivery tab. Standard covers this.
- **Send product changes to Merchant Center** - Standard or Admin.
- **Send your delivery settings to Merchant Center** - **Admin, and only Admin.** Google is quite firm about this one: replacing an account's delivery settings is an administrator's job, and a Standard key is refused. It is the one place where "nearly enough access" gets you a long way into a job and then stops.

Nothing is changed by asking. The panel also shows the service account's own address, which is the thing to add under **Settings → People and access** in Merchant Center if any of them comes back as a no. If the answer is "not known", Google was having a moment rather than refusing you - press it again.

A few things the list is honest about:

- A **brand new product** takes a day or so to show up, because Google reads the feed on its own schedule. Until then the link arrives before the listing does.
- Variations that are **switched off**, or whose hidden variation product is not active, get no link - they are not in the feed, so there would be nothing at the other end.
- A product ticked **Keep this product out of the feed** gets no links at all, and says why.

### The workbench, and its tabs

**Shop → Products → Google Shopping** is where everything to do with Google lives. It has five tabs:

- **Reports** - how Google Shopping is actually doing, in Google's own figures. See [Reports](#reports).
- **Products** - every item in the feed, described below. This is the screen that has always been here.
- **Feed rules** - standing instructions about what goes to Google. See [Feed rules](#feed-rules).
- **Delivery** - the charges Merchant Center holds against the ones this site charges, and the button that makes the two agree. See [Delivery, and what Merchant Center charges](#delivery-and-what-merchant-center-charges).
- **Health** - what Google itself says about your products, and whether it can still read your feed. See [Health](#health).

Nothing that used to work has moved: a bookmark or a link with a search or a filter on it opens the Products tab exactly as it did before.

### The product workbench: matches, prices and history

The **Products** tab lists every item in the feed, how Google sees it, and the title Google is sent. It is built for catalogues in the tens of thousands.

**Finding things**

- **Search** looks at the titles (the site's, the one Google is sent and the one Google holds), SKU, MPN, GTIN, brand, category, template and item id. Every word has to appear somewhere; put a phrase in "quotes" to keep it together. Press **/** anywhere on the page to jump to the box, **Esc** to clear it.
- The **tiles** across the top (Matched, Not matched, Not reported yet, Own Google titles, Need attention) are counts and filters at once: click one to list those items, click again to let go.
- **Problems** narrows to items with something wrong: a template token the item does not have, a title over Google's 150 characters, a title Google holds that no longer matches what the feed sends, no barcode, no brand, or an item sent to Google as having no identifiers at all.
- **Price against typical**, **brand**, **category** (either of the top two levels) and **sort** do what they say. Sorting by *dearest against typical* is the quick way to find where you are being undercut.
- **One of 24 variations - show them all** on a row narrows the list to that one listing.
- The filters live in the address bar, so a list can be bookmarked or sent to a colleague and opens exactly as you left it.

While it works, the list says so: a bar moves across the top of the results, the search box shows a spinner, and the line above the table says what is happening and for how long. The very first look after a quiet spell reads the whole shop, which takes a few seconds on a big catalogue and says as much; searches and filters after that come back in a fraction of a second. **Re-read the shop** fetches fresh prices and names on demand; otherwise the shop is re-read quietly every few minutes.

**Matches and prices**

**Matched** means Google has grouped your listing with other sellers of the same product; **Not matched** means it sits on a page of its own; **Not reported yet** means Google has not said.

- **Typical price** - on a matched item, Google's typical price from other sellers sits next to yours, with how much cheaper or dearer you are. Yours is today's price; theirs is from the last match check.
- **Find on Google / Search on Google** - opens Google Shopping in a new tab, searching for the title Google holds for the item. Google does not say *which* product it matched you to, by name or by link, so this is a search, not a direct link. A matched item can still be hard to find this way - matching is Google comparing prices behind the scenes, not a promise of a product page.
- **Google still holds** - shown when the title Google last reported differs from what the feed sends now. Usually a template change the next fetch has not picked up yet; if it lingers for days, Merchant Center is the place to look.
- **History** - expand a row to see when its match state or the title Google holds last changed. A line is only added when something changes, so an item that has sat matched for months shows one line, not ninety. **Title changed** on a line is usually your own doing - a renamed product or a new title template reaching Google - and is the first place to look when a match goes missing.

Match status is checked automatically every morning, and **Check matches with Google** checks it there and then (it can take up to a minute on a big catalogue, and counts the seconds while it does). Either way it needs the Merchant API access above. History starts from the first check after the update; nothing before that was kept, so it cannot be conjured up retrospectively, much as we would like to.

**Titles for Google**

A title template changes only what Google is sent; product names on the site are left alone. Tokens in angle brackets fill in from the item: `<brand> <parent_title> <colour> <size>` and so on. **Insert a token** on any row lists that item's tokens with their values.

- As you type, the box shows the finished title, its length against Google's 150 characters (anything past the cut is struck through), and any token the item does not have.
- Edits are kept while you page and search. A bar above the list counts them, with **Save all** and **Discard all**; leaving the page with edits unsaved asks first. **Ctrl/⌘ + Enter** saves the row you are in.
- **Tick rows** to set or clear one template across all of them. Tick the whole page and it offers **Select all that match** - every item the current filters find, thousands of them if need be. Before anything is written it shows how many titles would change, how many hand-written templates it would replace, how many come out too long or missing a token, and a few real before-and-after titles. If the list has moved in the meantime (a colleague's edit, say), it refuses and asks you to look again rather than acting on a list you have not seen.
- **Recent title changes**, below the list, shows the latest saves with who made them and when, each with **Undo**. The log keeps up to fifty saves (fewer if they are whole-catalogue sized). Undo puts back only the titles still as that save left them; anything edited since is left alone and counted. An undo is itself a change, so it can be undone too, should you enjoy that sort of thing.

**Download as CSV** exports whatever the current filters find, every page of it: titles, template, match, prices, codes, problems and link.

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

## Reports

The **Reports** tab is Google's own scoreboard: how often it showed your products, how often somebody clicked, and what came of it. Free listings and paid ads are kept apart throughout, because they behave nothing like each other and an average of the two tells you about neither.

**These are Google's figures, not this site's.** Google counts a view and a click its own way, publishes them about a day late, and keeps adjusting the most recent few days afterwards as sales get matched back to the clicks that caused them. So today reads as nothing, yesterday reads low, and neither is a problem. If you compare these numbers with your own analytics they will not agree, and that is normal - the two are counting different things.

Nothing on this screen asks Google anything when you open it. The figures are fetched once a day on their own, and **Fetch now** at the top asks again if you cannot wait.

There are three panels down the page, and they are three different things rather than three views of one: Google's own figures first, then [this site's own count](#your-own-count-next-to-googles), then [what your paid adverts cost](#google-ads). They will never agree exactly, and the screen says which is which rather than picking one.

If a fetch fails, the screen says so in as many words - with the date and whatever Google said - rather than showing you the date of the last one that worked and letting you assume today's went through. A failure also raises a notice in the bell, and takes it back down again the next time a fetch succeeds. Switching the daily fetch off takes the notice down too: something that is not running is not failing, and an alert you cannot dismiss is worse than no alert at all.

### The headline figures

Pick a period along the top - today, the last week, the last month, the last quarter, or two dates of your own - and you get two columns:

- **Free listings** - the unpaid results on the Shopping tab and around Google.
- **Paid ads** - anything you are paying for.

Each shows how many times your products were shown, how many clicks that came to, the click rate, and how many sales Google attributed. **Sales only ever appear against free listings.** That is Google's rule, not a shortcoming here: it does not report sales figures for paid traffic in this report at all. Rather than print a confident nought against your ads, the screen says so.

If Google turns down the request for sales figures altogether, the screen says so **with the date it happened** rather than stating it as a permanent fact about your account. It is not taken as final either: the daily check quietly asks again after a month, and **Fetch now** asks again the moment you press it.

Very occasionally Google files some clicks under a kind of listing this version has not met yet. Those are counted in the product table but sit in neither column above, so the two will not quite add up - and a line appears saying exactly that rather than leaving you to find the gap.

A click rate is always worked out from the totals - all the clicks over all the times shown - never by averaging a column of percentages, which would let one obscure product shown four times swamp a month of real trade.

### Day by day

The chart underneath is one line per day, free against paid, switchable between clicks and times shown. Where a day has not been brought in yet **the line breaks rather than dropping to nought**, and the caption says how many days that is. A gap is a gap; a shop that sold nothing on a Sunday and a Sunday nobody has fetched look identical otherwise, and only one of them is worth worrying about.

On a first fetch the chart fills in from the oldest day forwards over the next several nightly checks. Ninety days of figures for a large catalogue is a great deal to ask Google for in one go, so it is fetched in batches, a few days of history per night; the line at the top of the screen tells you while that is still happening. It is paced on purpose. The nightly run shares its slot with everything else this site does on a timer, including the hourly price and stock updates, and filling the chart in faster would hold those up. Nothing is lost by the wait: each night carries on from where the last one stopped.

### Product by product

Underneath, every item Google reported on in the period, biggest first, with clicks, times shown, click rate and sales. Sort by any of them, search by title or item number, and click a title to open that item in Merchant Center.

The last column is **typical price** - what Google reckons the same product usually sells for elsewhere, from its own price comparison. It is only filled in where Google has enough other sellers to have an opinion. A product of yours sitting well above it is not necessarily wrong, but it is the first place to look when something gets plenty of views and no clicks.

Items that have since left your feed still appear here. They earned those clicks while they were in it, and dropping them would quietly change last month's totals every time you tidied the catalogue.

### What is selling

Optional, and off until you switch it on at the bottom of the tab. Google will rank the best-selling products and brands in the categories you trade in, whether or not you stock them - which is the nearest thing to a free look at what your competitors are shifting.

Two things to know:

- **It is not available to every account**, and not every category is ranked. A category Google will not answer for is **named** after a fetch, so a short list is explained rather than mysterious; a report Google will not give at all says so rather than pretending the market is dead.
- **Google's rankings have no item numbers in them.** It ranks products the way it groups them across every shop, so there is nothing to match against your feed directly. Each row says how it was worked out: **You sell this** means one of Google's example barcodes is in your catalogue; **Google says you list this** means Google found it in your feed but no barcode matched; **Not in your catalogue** means Google says it is not there. Anything it genuinely cannot tell says **Not known** rather than guessing.

By default the rankings use whichever Google category numbers you have already filled in on the [Google category](#googles-own-categories) screen, so there is usually nothing to type. You can name specific ones instead, choose weekly or monthly, and set how many places deep to keep - that depth applies **to each category separately**, so six categories at the top fifty is six lists of fifty, not fifty shared between them. Anything held but not drawn is counted and said on the screen.

Switching between weekly and monthly shows the new one only. The old rankings are kept rather than thrown away, but they are not mixed in with the new ones - and while you are waiting for the first new one, the screen says exactly that instead of pretending Google has nothing for you. The same goes for a category you take off the list: it stops appearing, nothing is deleted, and putting it back shows its last ranking straight away with the date on it.

Old rankings are tidied away on the same keeping window as the daily figures, with one exception: the most recent ranking in each category is never deleted, however old it is. A monthly ranking published in arrears would otherwise be older than a short keeping window the moment it arrived, and the screen would sit empty for ever while the fetch worked perfectly every day.

### Settings on this tab

- **Fetch Google's figures every day** - on by default. It only reads figures Google already holds; it changes nothing about your feed or your shop. Turn it off if you would rather not spend the requests.
- **Fetch history going back** - how far the first fetch reaches. Three months by default. Widening it later fills in the extra days over the next several nightly checks rather than all at once, for the same reason the first fetch is paced.
- **Keep figures for** - thirteen months by default, so this month can be set against the same month last year. Applies to the best-seller rankings as well as the daily figures. Set it to 0 to keep everything.
- **Also fetch what is selling in my categories** - the rankings above.

### Your own count, next to Google's

Underneath Google's figures sits a second panel in its own frame: **what this site counted**. Same period, same free-against-paid split, counted here as people actually arrive rather than reported to you a day later.

**The two will never match, and neither of them is broken.** Google counts a click the moment it hands somebody over. This counts a landing once the page has genuinely opened in their browser. Somebody who changes their mind on the way, whose connection gives up, or whose browser blocks scripts is a click to Google and nothing at all here. Expect your own column to read a little lower - if it reads *wildly* lower, that is worth a look, because it usually means the page is slow to open.

What you get:

- **Landings** - how many people arrived from a free listing, and how many from an ad. Something is only counted as **paid** when Google has labelled the click as an advert's. Google also adds a reference of its own to free Shopping results and to ordinary search results, and that one is deliberately **not** treated as an advert - counting it would show you paying for clicks you never paid for.
- **Sales** and **revenue** - orders traced back to one of those arrivals, and what they were worth. Only money your shop has actually confirmed; an order somebody has placed but not yet paid for shows as pending rather than being counted.
- **Sale rate** - sales over the arrivals that *could* have been traced (see the next bit), never over all of them.
- **Who has just arrived** - the most recent arrivals, newest first, refreshing every twenty seconds while you are looking at the screen. Anything that led to an order is badged, and the badge opens the sale: which listing they landed on, when, how long they took to decide, what it was worth, and what they actually put in the basket. That last one earns its place more often than you would think - an advert for a desk that sells a chair is still a sale, and it says so.

### On the order itself

You do not have to come here to find out where one order came from. Open it in **Shop, Orders** and, where the visit was traced, a **Came from Google** panel says which listing brought them in, whether it was a free listing or a paid ad, and how long they took to decide. It also says when what they bought is not what they landed on, which happens more than you would expect and is worth knowing: the listing did its job even though the sale was something else.

Most orders show nothing there, and that is not a fault. An order that did not come from Google has nothing to say, and neither does one from a visitor who declined marketing cookies - so an empty panel means "not traced", never "not from Google".

### Who can be traced, and who cannot

Everybody who arrives is counted. Nobody is identified.

Joining an arrival to an order weeks later needs something that remembers the visit, which means a cookie, which means asking. So:

- **Everyone** gets counted as a landing: which product, when, free or paid. Nothing is stored that could point at a person.
- **Only people who have agreed to marketing cookies** can have an order traced back to their visit. They get a cookie of this site's own that lasts thirty days, and the most recent listing they arrived through is the one the sale is credited to.

Somebody who declines is counted and can never convert, which is why the sale rate is worked out over the ones who agreed. The panel tells you how many that was, so you can see what the figure is actually based on. On a site where most visitors decline, treat the sales column as a floor rather than a total.

### If somebody changes their mind

Withdrawing marketing consent does not simply stop the next sale being traced. It erases what was only ever kept because they agreed, and it happens the moment they change the setting rather than the next time they happen to visit from Google.

What is erased:

- **The Google click reference.** This is the one thing held here that Google could use to work out who somebody is, so it is the first thing to go.
- **The identifier joining their visits together**, and the cookie carrying it.
- **Any order already traced back to one of those visits.** A record saying "this order came from that visit" ties somebody's purchase to their browsing, and it only ever existed by permission. **Worth knowing before it happens: that also takes the order out of the revenue figure on this panel, for the period it was in.** Your actual orders are untouched - this is only the line connecting one to a Google visit.

What stays: **the visits themselves, as anonymous counts.** Which product, when, and whether it came from a free listing or a paid one - precisely what is recorded for every visitor who never agreed to anything, and precisely what any shop may count without asking. Last month's traffic figures do not change.

None of this needs them to come back. The page tells this site the moment the banner changes, on whatever page they happen to be looking at. Should that message never arrive - a closed tab, a blocked script - the same erasing happens on the next thing they do here that involves it at all.

One limit worth stating plainly. What gets erased is everything held against the marker their browser is carrying at the time. If somebody agreed, later cleared their cookies, agreed again and so picked up a second marker, withdrawing clears out the second one and leaves the first behind - until it ages out of the keeping window on its own. Tying the two markers together is the only way round it, and a record linking one person's markers to each other is exactly the kind of thing this feature is built to avoid keeping. So it is left as it is, and said here rather than quietly worked around.

This needs the **Marketing** category to be offered on your cookie banner. Installing this module adds it to the list Cactus suggests on Settings, Privacy - you still have to switch it on there.

### Settings for your own count

- **Label the links you send to Google** - off until you switch it on. Adds a marker to the address of every product Google lists, so a visit from a **free** listing can be told apart from somebody typing your address in. Paid clicks carry a label of Google's own and are counted either way, but free listings carry nothing at all, so without this the free column stays empty. Anything else measuring your site (your analytics, for instance) will see the marker too, which is usually a bonus rather than a problem.

  One thing this used to do and no longer does, if you have the **longer cache window** switched on in Settings, General, Speed: a labelled address counted as one of the rarely-visited addresses that window is for, so the very page Google was sending buyers to could hold an out-of-date price for longer than the same page without the label. Cactus now ignores these markers when it decides which window an address belongs in, so a labelled address is treated exactly like the plain one. Products with options are unaffected either way - their addresses already carry their options and already use the longer window, labelled or not.
- **Count visits from Google** - off until you switch it on, because it starts recording arrivals and, for people who have agreed to marketing, sets a cookie. Neither is something an update should quietly start doing on your behalf.

  **If your site sits behind Cloudflare, check one thing first.** Settings, General, Speed has a switch called **My traffic goes through Cloudflare**, and it must be on or these counts will be wrong - not slightly, badly. With it off, everybody arriving through the same Cloudflare location looks to this site like the same person, so their visits are merged together and most of them are never counted. The figures simply come out low, with nothing to say why. Cactus notices this on its own where it can and puts a warning at the top of the panel, but it is worth checking rather than waiting to be told.
- **Keep the figures for** - thirteen months by default, so this month can be set against the same month last year. 0 keeps everything. Shortening it does not throw anything away on the spot: the daily check does the clearing out, so a slip of the finger can be put right first.

One thing your host may need to know: this needs the site's security key to be set. Without it there is no honest way to tell two visitors apart, so nothing is counted at all - and the panel says so plainly rather than showing you an empty table.

## Health

Every other screen here tells you what Cactus **would** send Google. The **Health** tab is the only one that tells you what Google did with it - which is a different question, and occasionally a nastier one. A feed that quietly stopped being fetched three weeks ago looks perfect from everywhere else, right up until you notice the orders have gone.

It answers two things.

### What Google thinks of your products

Once a day Cactus asks Google for its report on every item in the feed, and keeps what comes back. Each problem Google raises is recorded against the item, with:

- **How badly it hurts.** Turned down means the item is not being shown at all. Shown less often means it still appears, but lower. Still being checked means Google has not made its mind up and there is nothing for you to do.
- **Google's reason**, in Google's own words, and the field it is about.
- **When it started**, and when it stopped.

Problems are not deleted when they go away - they are closed and dated. "The barcodes went wrong on the 3rd and were fixed on the 5th" is usually the useful half of the story, and a screen that only ever shows today's trouble throws it away.

The tab shows the totals, then the worst reasons with a count beside each, then the products themselves. Every product links straight to its own page in Merchant Center, which is where Google spells the reason out in full and where you can appeal one you think is wrong.

Google's daily report gives the reason and the field and nothing more - no sentence, no help link. The fuller wording does exist, but Google will only hand it over one product at a time, which on a catalogue of any size would be thousands of requests to fill in a screen somebody had merely glanced at.

So there is an **Explain this** button on each product. Press it and Cactus asks Google about that one item and shows what comes back: Google's short description, its longer note on what to do, and a link to the page that explains the rule. The answer is kept, so pressing it again costs nothing until the next daily check finds the problem still there - at which point the next press fetches Google's current wording. There is an **Ask Google again** link if you want it sooner.

Three things it will never do. It never asks Google about your whole catalogue - only the item you pressed, only when you press it. It never makes up an explanation: if Google answers and has nothing to add, it says so in as many words. And if Google cannot be asked at all, it tells you why - a missing key, a missing account number, a missing feed label - rather than leaving a spinner turning.

There is also a half-minute pause built in behind each item, so that however enthusiastically the button is pressed - or however many people press it at once - Google is asked at most once per item per half minute. You will not notice it: a second press inside that window shows the same answer, the same way. It means the allowance Google gives your account cannot be used up by this screen, leaving the daily checks with nothing.

That pause is per item rather than across the whole shop, so a very large catalogue with a great many problems could in principle still get through a lot of requests. It has not been worth guarding against: it needs somebody working through hundreds of different products deliberately, one after another, and the daily checks would survive it anyway.

**An honest blank.** If Google has never been asked, the tab says so rather than showing a comforting zero. Nothing checked is not the same as nothing wrong.

The same goes for an empty answer. Google sometimes replies with nothing at all while it is working through a recent change to your feed. When that happens nothing is touched - the previous answer stays on the screen and the tab tells you Google had nothing to say - because treating silence as "all fixed" would wipe the record of every problem and then re-raise them all the next day with the wrong dates.

**On the Products tab too.** Google's verdict now shows on each row, and two new filters sit in the filter bar: one for how badly Google is treating an item, one for Google's particular reason. The summary at the top has chips for both, so you can go from "forty-one turned down" to the list of forty-one in one click.

### Whether Google can still read your feed

The second panel is the one nobody thinks to check. It shows Google's own record of the last time it fetched the feed: when, whether it worked, how many items it took, how many were new, and anything Google complained about while reading.

Cactus works out which feed at Google is yours by matching the address it fetches against the address this site serves, so there is normally nothing to set up. If you keep more than one feed pointing at the same address, you can name the right one on the settings tab.

The panel shows that address without the key on the end of it. The key is the part that makes your feed address a private one, and this screen is open to anyone who can edit products, so it shows enough to confirm Google is reading the right place and no more. The full address stays where it always was, on the Google Shopping settings tab.

### Being told without going and looking

Two things will raise a notice in the bell at the top of your admin:

- **A lot of products stopped being shown at once.** How many counts as a lot is yours to set, on the Google Shopping settings tab. It is measured against the day before, so a shop that has always had a handful turned down is not nagged about them, and it never fires on the very first check - there would be nothing to compare against. Setting it to 0 switches it off, and takes down any notice already showing.
- **Google could not read the feed**, or has stopped fetching it at all.

The first one keeps its wording up to date while things are getting worse, and clears itself once the count is back to where it was before the jump - not only when it reaches zero, so a shop with two or three permanently awkward products is not left with a notice it can never get rid of. The second clears the moment Google manages to read the feed again.

Setting-up states are deliberately **not** put in the bell. "No feed at Google yet", "no account number filled in", "Google has never fetched it" and "we could not reach Google just now" are all things the Health tab says in words, with what to do about them. An alert for any of those would sit there from the day you installed the module until the day you finished setting it up, and a notice that is always on is a notice nobody reads.

You can also have either alert emailed to an address of your choosing - switched off unless you ask for it, sent only when something first goes wrong rather than every day it is still wrong, and with no link in it, because the address of your admin is nobody else's business. The wording lives with all the other emails, in **Settings → Emails**. If the address you type is not one anything could be delivered to, the save is refused and says so, rather than quietly emptying the box.

If a great many products are turned down at once and the reason is about their pictures, read [If Merchant Center turns products down over their pictures](#if-merchant-center-turns-products-down-over-their-pictures) first - that one has a one-click cure and is not what it looks like.

## Live price and stock updates

Google reads your feed on its own schedule. Usually that is about once a day, and it is never at the moment you drop a price or sell the last one on the shelf. Live updates close that gap: a changed price or stock level goes straight over to Merchant Center, and everything else about the listing - photos, description, delivery, category - carries on coming from the feed exactly as before.

It is switched **off** to begin with, and it stays off until you switch it on. It writes to your advertising account, which is not something an update to this site should start doing on your behalf.

You will find it on the **Health** tab, under "Live price and stock updates".

### Setting it up

Three things have to be filled in first, all of them on the Google Shopping settings tab: a Google service-account key, your Merchant Center account number and your feed label. The panel names whichever of the three is missing.

After that there are two buttons:

- **Check Merchant Center** asks Google what is there and tells you what setting up would do. It only ever reads.
- **Set it up** does it. Cactus creates a second, small feed at Merchant Center called "Live price and stock updates (from your website)", and then tells your main feed to take prices and stock from it, **ahead of everything else it reads**.

That last phrase is the part that matters. Merchant Center reads a main feed and its extra feeds in a set order, and the first one to give it a price wins. Your main feed already states a price and a stock level for every product, so unless this site's small feed comes first it would never be consulted at all - everything would look connected and nothing would ever change. So it goes to the front. If you already have other extra feeds, the panel says so before you press anything: this site's prices and stock levels will come first, and everything those other feeds set that this site does not send is left exactly as it was.

The order matters after setting up, too, not only during it. If somebody rearranges that list at Merchant Center afterwards - by hand, or through another tool that adds a feed of its own - this site's prices can end up behind the main feed again, and everything would look perfectly connected while nothing changed. **Check Merchant Center** looks at the order, not just the connection, and says so plainly when it has slipped; the button then reads **Put it back in front** rather than Set it up, because there is nothing to create.

Two other things are checked before the button will do anything, both of them because they fail silently otherwise:

- **Your feed label and listings language have to match your main feed's.** Google identifies a product by its code, its language and its feed label together. Send an update under the wrong label and Google files it, without complaint, against a product that does not exist - and every check afterwards would agree with itself while nothing on your real listings ever moved. If they do not match, Cactus tells you which is which and refuses.
- **Your key has to be allowed to change things.** Reading reports needs less permission than writing, so a key that has been happily fetching your figures for months may still be refused here. This is the "Standard" access level in Merchant Center, set under Settings, then People and access. It is a lower bar than sending your delivery settings, which Google insists on "Admin" for.

### What actually gets sent

Three things, and only three: the price, the sale price while an offer is running, and whether the item is in stock, out of stock, on backorder or up for pre-order. Nothing else is ever sent from here, so nothing else can be overwritten by it.

Anything your feed rules keep out of the feed, or you have kept out by hand on the product itself, is never sent. If a product that was being kept up to date later drops out of the feed, Cactus takes its own entry back out of Merchant Center rather than leaving Google holding a price you no longer stand behind. Your main feed's own row for that product is untouched either way.

Switching your Google Shopping feed off switches this off with it. There are no listings to keep up to date, so nothing is sent until the feed is back on.

### How quickly, and how often

Saving a product, an order taking the last one off the shelf, a refund putting one back, a stock delivery being booked in, a pre-order selling out, a bulk status change - all of them put the product in a queue and set the sending going.

There is a short gap enforced between one send and the next, two minutes by default, so a bulk edit of five hundred products is a handful of sends rather than five hundred. A single price change goes within a minute or two. A bulk edit is quick for the first few hundred products and the tail can take up to an hour, so "instant" is honest for the way prices normally change and optimistic for the day you re-price the whole catalogue at once.

On top of that there is an hourly check, and it is the part that makes the whole thing trustworthy rather than merely quick. It does two jobs:

- it goes through everything and **sends anything whose price or stock level is no longer what was last sent to Google**, whether or not anything queued it;
- it **takes out** anything that has left the feed.

The first of those is not a tidy-up, it is the safety net. Plenty of things change a price or a stock level without a product being saved at all: a supplier stock file being imported, a feed rule changing what an item is worth, a category moving, a photo being deleted. Nothing can spot those as they happen. The hourly check finds them regardless, and it is also what works its way through your catalogue the first time you switch this on, rather than waiting for you to go and edit every product you own.

**Send what is waiting** on the panel does the same thing immediately, for when you cannot wait.

### Checking Google actually took it

Merchant Center saying "received" is not the same as a shopper seeing the new price, so every hour Cactus picks a handful of products - twenty by default - and asks Google what it is actually showing for them. Anything that disagrees is listed on the panel with both figures side by side, yours and Google's. Nothing is sent again until the product itself changes, and the check comes back to it as it works its way round the shop.

"Disagrees" means the price a shopper pays, or the stock, is not what you sent. A higher "was" price on Google's side does not count. Google reads your product pages as well as your feed, and when a page shows a struck-through RRP, Merchant Center files the RRP as the regular price and your price as the offer price: send £153.60 against an RRP of £391.20 and Google shows "£391.20, on offer at £153.60". That is your page, faithfully copied, and it is left alone.

Products sent in the last couple of hours are left out of that check on purpose. Merchant Center takes its time processing, so asking too soon would report a difference that is about to sort itself out.

The panel never pretends to know more than it does. If nothing has been checked yet it says so, rather than showing a reassuring nothing. If something was sent and Google's reply could not be read back, it says that too - not "sent", not "failed", but the truthful third thing. And a send that started and never came back is described as exactly that, rather than being quietly reported as the send before it.

One honest limit: where the panel says your main feed is **connected**, that is what was recorded at the moment the connection was made, not a fresh answer from Google, and it says nothing about the order. If you go into Merchant Center and take the connection out yourself, or move this site's prices behind your own feed, the panel will still say connected until you press **Check Merchant Center**, which is the only thing here that asks.

### One country at a time

Live updates work with **one** of your Merchant Center feeds: the one Google fetches from this site, under the feed label on the settings tab. Google identifies a product by its code, its language and its feed label together, so one label is one set of listings.

If your account has more than one primary feed - a UK one and an Irish one, say - only the products under the label you have set here are kept up to date live. The others carry on exactly as they did before, refreshed whenever Google next reads their feed. Nothing is broken and nothing is blocked; it is simply that this keeps one country's prices current rather than all of them.

### When something goes wrong

Products Google refused are listed with Google's own reason and a link straight to the product in Merchant Center. They are tried again on every run, so a passing problem sorts itself out on its own; a standing one needs the reason dealing with.

A notice goes in the bell at the top of your admin when prices are not getting through, or when Google turns out to be showing something different from what was sent. It clears itself the moment everything is in order again, and switching the feature off takes it down immediately rather than leaving you looking at a complaint about something that has stopped happening.

If the connection to your main feed is missing - it was never made, or somebody took it out - nothing is sent at all and the panel says so. Sending into an unconnected feed would look like it worked: Google accepts every word of it and then ignores the lot.

### Turning it off again

**Stop sending** leaves everything where it is at Merchant Center and simply stops sending anything new.

**Disconnect from Merchant Center** goes further: your main feed stops taking prices from the small extra feed, so Google goes back to using the feed's own figures. The extra feed itself is left alone, so this is one press to undo. Nothing here ever deletes a feed at Merchant Center.

Both, and the setting up, are recorded in the change log at the bottom of the panel, with an Undo. Those setup entries are never tidied away, however many sends happen afterwards, so the way back is always there. The Undo on a connection checks that nobody has been in and changed your main feed at Merchant Center since; if somebody has, it declines and says so rather than overwriting their work. Prices that have already gone cannot be unsent, and the log says that plainly rather than offering a button that would only pretend.

## Google Ads

Your paid Shopping adverts do not live in Merchant Center. They live in **Google Ads**, which is a separate account with a separate way of signing in - so the service-account key you pasted in for everything else does not cover it, and there is a second, short set of details to fill in.

Once those are in, Cactus can do two things:

1. **Bring in what the adverts cost**, day by day and product by product, so the Reports tab can show spend next to the sales this site tied to a paid click.
2. **Tell Google Ads which of its clicks turned into a sale**, so its own figures stop being guesswork about what happened after somebody left Google.

Both are switched **off** to begin with. The first only reads; the second writes to your advertising account, and neither is something an update to this site should start doing on your behalf.

### Connecting Google Ads

The details go in on the **Health** tab, in the Google Ads panel, under **How to connect Google Ads**. That is the only place they are typed. Only an administrator can enter them - anybody else with access to that tab sees the instructions and a line saying so, which is deliberate: these are the keys to your advertising account.

**Whatever you save only takes effect the next time the site is rebuilt.** Saving them raises a notice on your dashboard to remind you; until that rebuild happens the panel will go on saying Google Ads is not connected, and that is not a fault. Leave a box empty and that detail is left exactly as it is, so one of them can be replaced without retyping the rest. Nothing already saved is ever shown again - each box only says whether something is there.

There are four things to fill in and two optional ones:

- **Google Ads sign-in ID** and **Google Ads sign-in secret** - from the sign-in client you set up in the Google Cloud console.
- **Google Ads permission token** - granted once, when you let that sign-in read your Google Ads account. It does not expire on its own.
- **Google Ads account number** - the ten-digit number at the top right of Google Ads. Dashes are fine.
- **Manager account number** - only if your account sits underneath a manager account. Leave it empty otherwise.
- **Developer token** - **no longer needed, and the Health tab no longer offers a box for it.** Google retired these on 9 September 2026 and ignores the ones still being sent; what your connection is allowed to do is now decided by the Google Cloud project behind the sign-in above. If you already have one it does no harm, and if you are waiting on an application for one you can stop.

Cactus stores all of these the same way it stores your Merchant Center key - as settings on the site, never shown again. The screen only ever tells you whether each one is saved.

**Check the connection** asks Google four questions on a press and changes nothing:

- whether it will sign this site in at all, and which account it lands on;
- whether it will hand over what the adverts cost;
- whether it can see your sales trackers;
- whether it would accept an imported sale from this site.

That last one offers Google a deliberately made-up click and asks only whether the door is open. Nothing is recorded at Google's end and no real shopper's details go anywhere near it.

### What the adverts cost

Switched on, this comes in once a day alongside everything else, and **Fetch costs now** on the Health tab asks again if you cannot wait. Once a day is a deliberate choice rather than a limitation: Google Ads publishes what you spent about a day in arrears and then revises it afterwards, so asking every hour would use twenty-four times the requests to be told the same thing, and would put your price and stock updates in the queue behind it. Those stay hourly, because a price on a live listing is the half of this that cannot wait. What arrives is spend, clicks and times-shown for each product, straight from Google Ads. The first run reaches back over your history a few days at a time across several nights rather than all in one go: it deliberately takes its turn last, after the Merchant Center checks, and picks up each night where the night before stopped.

It appears on the **Reports** tab, in its own panel under this site's own figures, with two columns side by side: what Google Ads charged, and the sales this site could tie back to a paid click. Divide one by the other and you get a **cost per sale**.

Three honest caveats, all of them said on the screen as well:

- **There is no profit figure and there is not going to be one.** This site knows what a thing sold for. It has no idea what it cost you to buy, and a margin built on a guess is worse than no margin at all.
- **The two columns count their days differently.** Google Ads dates its spend in its own account's time zone, which Google chooses; the sales are dated in your shop's. Over a month that is an evening at either end. Over a single day it can be most of the difference.
- **Only shoppers who agreed to marketing can be tied to a click at all.** So the sales column is a floor rather than a full count, and the cost per sale is, if anything, on the high side.

Like the rest of the Reports tab, nothing here asks Google anything when you open it, and a fetch that fails says so with the date rather than showing you the date of the last one that worked.

### Telling Google Ads about your sales

This is the other direction: for every order that came from a paid Google click, Cactus can hand Google Ads the order number, what it was worth, and when it happened, so Google can match it back to the click it paid for.

It needs somewhere to put them. **Set it up** on the Health tab either finds the right place in your Google Ads account or makes one, called "Website sales (imported from this site)".

**The important bit, and the reason that button exists at all.** If you use the Google Tag module, your website is already reporting sales to Google Ads from the shopper's browser. If this site reported the same sale as a *primary* one as well, Google would count it twice - and then bid your money on the doubled figure. So the tracker Cactus makes is a **secondary** one, which Google keeps out of the figure your bidding uses. That is not left to trust, and it is not checked once and forgotten: Cactus asks Google again at the top of every send, and if Google says the tracker is primary, or will not say either way, **nothing is sent at all** and the panel tells you so in as many words. So if you change that setting in Google Ads next month, the sending stops rather than quietly doubling your figures.

**There is one thing "secondary" does not cover, and you have to handle it yourself.** If you put this tracker inside a **custom conversion goal** on a campaign, Google bids on it regardless - custom goals ignore the secondary setting entirely. Nothing on the tracker tells this site which goals it has been put in, so Cactus cannot check it for you and does not pretend to. Leave this tracker out of your conversion goals and the safeguard holds.

What actually gets sent, and what does not:

- Only orders the shop itself has confirmed as paid. A confirmation page on its own is not a sale.
- Only orders that came from a **paid** Google click. A free listing has no advert click to attach anything to.
- Only where the shopper **agreed to marketing**. That is checked at the moment of sending, not at the moment of the visit - so somebody who changes their mind an hour before drops out before anything leaves.
- Never the shopper's name, email address or anything they bought. The order number, the total, the currency, the time, and the click it came from.

Each order is sent once and once only, by its order number, which is also how Google refuses a duplicate - so the two agree by construction. If Google turns one down it is offered again on the next couple of runs and then left alone, with the reason on the Health panel.

**If somebody withdraws their consent afterwards**, everything this site holds joining that person's visits to their order is erased, including the line saying which visit the order came from. What stays is the bare fact that Google has already been told about that order number - without it, the next run would send the same sale a second time. Anything already at Google is Google's to remove, and you would ask them through your Google Ads account.

Sending happens on the hour, and **Send sales now** does it immediately. If sales stop getting through, a notice goes in the bell and comes down again as soon as they start getting through - or as soon as you switch the sending off, because something that is not running is not failing.

### If Google will not accept imported sales

There is a fair chance it will not, and it is not a fault here. Since 15 June 2026 Google only accepts imported sales from connections that were already sending them before that date, and points everybody else at a separate service of its own. A connection set up today has no such history.

You will see this as a plain sentence on the Health tab rather than an error code, and it only affects the sending of sales. Bringing in what your adverts cost carries on as normal, and so does everything else on this page.

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

Find it under **Delivery** in the Google Shopping settings tab, as **Group your products for delivery rates**. There are two places the group can come from, and **Where the group comes from** picks between them.

### A product attribute you choose

The original way, and still the right one where the groups you want are not the groups your delivery prices are written against. Pick one of your product attributes and each product goes to Google labelled with its own value for it. Off to start with, and off is the whole list until you pick something.

- A variation uses its **own** value where it has one, and its parent listing's where it has not - the same way everything else about a variation reads.
- A product ticked against two values of the attribute sends the first of them, in the order you have the values in. Arbitrary, but the same every time - a label that wandered between runs would move the product between rate groups every time Google fetched the feed.
- The dropdown is empty, and the setting greyed out, on a shop with no module keeping product attributes. Nothing to group by.

**Keep the wording brief.** Google allows 100 characters. Anything longer is shortened on the way out, with four odd-looking characters put on the end so that two long values that only differ near their end do not arrive as the same group - which would quietly hand them the same delivery rate. It works, but you then have to recognise the shortened version in Merchant Center, so short names are worth the ten minutes.

Whatever the label says is what you type into the delivery rate in Merchant Center. It is your own wording travelling across unchanged, not a code.

**If that attribute is the one your delivery rules group by, the two sources below are the same thing.** A delivery rule written against a range is written against a value of one of your attributes, and the Delivery tab names its rate groups with that same value's wording - so labelling by that attribute puts precisely those names on your products, character for character. The site works this out for itself: where it holds, it stops asking you to switch the setting over and says on the Delivery screen why it is not asking. If that is your arrangement, leave the setting where it is. It was already right, and changing it would be swapping one correct answer for another.

It only holds while **every** delivery rule you have is written against a range. Add one for a category, for a supplier, or a rule covering everything, and those groups cannot be said with a value of a single attribute - so the two lists really do drift apart, and the warning comes back. That is the warning doing its job rather than a fault.

### Your own delivery rules

The other source, and the tidier one if you have a delivery module set up. Instead of an attribute, each product is labelled with the **delivery group its own price is written against** - the range, the category or the supplier the rule is on, whichever is the most specific one that reaches it. Exactly the group the basket uses to work out what to charge, so the label is never a second opinion about the same product.

The point of it is the Delivery tab below. That tab sends Merchant Center a rate for each of those same groups, named by the same wording, so every label in your feed has a price waiting for it over there. Labelling by an attribute cannot promise that - you have to keep two lists in step by hand, and a product whose label matches no rate group silently takes whatever your last rule says.

- The order is the same one your delivery prices already use: the product's range if a delivery rule is written against it, else its category (the nearest one, not a distant parent), else its supplier, else your "everything" rule.
- A variation is answered the same way the basket answers it, falling back to its parent listing for anything it does not carry itself.
- A product that no delivery rule reaches at all carries **no** label, and is priced by whatever your last rate group says. Inventing a group for it would put it on somebody else's price.
- Two groups that happen to have the same name cannot both go to Google under it, so the second is sent as "Name (category)" or similar. The Delivery tab says when this has happened.
- The option is greyed out on a shop with no module publishing delivery rules.

## Delivery, and what Merchant Center charges

Under **Products -> Google Shopping -> Delivery** is the other half of that: a screen showing what this site charges for delivery, what Merchant Center currently charges, and a button that makes the second match the first.

Nothing on it rings Google when you open it. The preview is worked out here on the site; the comparison is the last one that was made, with the date it was taken sitting on it. The two buttons are the only things that pick up the telephone, and only one of them changes anything.

**Switch the labelling over first.** This screen and the feed are two halves of one thing: Google matches these prices to a product by the delivery group the product carries in your feed. So before any of it can work, set **Where the group comes from** to **Your own delivery rules** on the Google Shopping settings tab. Until you do, the Send button is held and the screen says so - sending as things stand would name groups no product carries, and every product in the shop would be charged whatever the last rule says.

**Unless you are already labelling by the delivery rules' own attribute.** If **Where the group comes from** is set to a product attribute, and that attribute is the very one your delivery rules write their ranges against, and every delivery rule you have is written against a range - then your labels and these rate groups are the same words already, because they are the same values read twice. The Send button is not held, the counts below mean what they say, and the screen prints a line explaining why you are not being told off. Do not change the setting to make the message go away: there is no message, and the setting was right to begin with. Anything less than all three of those conditions and the hold comes back, which is the point of it.

**Not at the same time as per-product delivery charges.** If you have also switched on "Send your delivery charges with each product", Google uses the per-product figure ahead of these account-wide ones, so for anything in your feed these rates become a fallback rather than the price - and this screen would still show them as matching, because it compares what is here with what is at Google, not with what the feed says. Use one or the other unless you have a reason for both. The screen warns when both are on.

**What would be sent.** A Merchant Center delivery service for each of yours, keeping your own name for it. Under each, one price per group of products, with the names those groups carry in your feed. Prices include VAT, worked out the same way the prices in your feed are. A last line with no names on it is the catch-all - everything the groups above did not cover.

Where one of your delivery services takes different lengths of time for different groups, it goes over as **more than one** service - one for each length of time - because Google holds a single delivery time per service and will not be told otherwise. The length of time most of your groups take keeps your own name for the service; the others get that name with the time on the end, like "Flat-Pack - 14 days". Nothing is invented: the wording comes from your own figures. You will see all of them listed on the screen before you send anything.

**Worth knowing.** Google's delivery settings and yours do not have quite the same shape, and everything that could not be carried across exactly is listed on the screen rather than quietly rounded off. The ones you are most likely to see:

- **This site charges delivery on every item; Google holds one figure per product.** What Google is told is the charge for buying **one**, which is what a shopper sees on the listing. A basket with several of something will cost more to deliver at the checkout than Google quoted. This is the one genuine compromise in the whole feature and there is no way round it at Google's end.
- **One delivery time per service, so a service with several becomes several services.** Google holds exactly one delivery time against a service. If yours takes five days for most things and fourteen for a few, it is sent as two services - the five-day one keeping your own name, the fourteen-day one named for its own time - each carrying only the groups that really take that long. Your quick groups are quoted quickly and your slow ones honestly, which is the point.

  Google allows twenty delivery services per country, though, and it counts services this site did not put there as well. If splitting every service would take you past that, the ones whose times differ **least** are given up first and sent at their slowest instead - a service that is five days against six loses almost nothing by being called six, while one that is five against fourteen is exactly where you would not want the wrong answer. The screen names the ones this happened to, and says which groups are being quoted more slowly than they really are. If even that will not fit, nothing is sent and the screen tells you the count and what to remove.
- **Bank holidays are not sent.** Google works in whole weekdays and has nowhere to put them. Dates around a bank holiday read a day or two early on Google and correctly on your own pages.
- **Rules of different sorts do not mix.** A product carries one delivery group to Google, but this site works out a price per service. If one service prices by category while the groups are named by range, Google cannot tell which of your rules applies to a given product - so that service is not sent at all and the screen names the groups it would have got wrong. The fix is to give that service its own rule for those groups, or to write all of its rules against the same sort of thing.

  This one is deliberately cautious, and there is no way to overrule it. On a shop that prices delivery by category with a rule covering everything, the catch-all would very often have charged the right amount anyway - but "very often" is not something worth being wrong about with somebody's delivery charges, and nothing here can tell the safe arrangement from the unsafe one without knowing every product's category. If a service you believe is fine refuses to go, that is this rule being careful rather than a fault.

- **A product in two ranges at once.** If a listing is tagged with two of your ranges, this site could charge one range's delivery price while Google charges the other's. The preview counts the products this actually applies to and names the ranges and services involved - so on a shop where every product sits in a single range, which is the ordinary case, it says nothing at all. If the count is not zero, put each of those products in one range and it goes away. It does not stop a send: the products are real but the price difference may be nil, and it is yours to judge.
- **Google's own limits.** Twenty delivery services per country, twenty different prices in one service, thirty group names on one price, fifty characters in a service's name. A price shared by more than thirty groups is simply split across several rules, which changes nothing. A service needing more than twenty different prices cannot be sent at all - the screen says so and the send is held until you have given some of those groups the same price or split the service in two. Nothing is ever trimmed to fit.

  The fifty characters are on the **service** name only. Your group names get a hundred, and a long one is perfectly fine - nothing shortens those. Where a service name plus its time would not fit, it is shortened in a way that keeps it different from every other one; where even that cannot be managed, that service is held back and the screen says which and why, rather than sending a name Google would throw the whole lot out over.

**Comparing.** **Compare with Google** reads your Merchant Center delivery settings and lines them up service by service: *Matches*, *Different* with the fields that disagree and both figures, *Not at Google yet*, or *Only at Google*. It only reads. Nothing is sent.

**Not every product gets a price, and the screen counts them.** This is the one that catches people out. If none of your delivery services has a rule covering everything, a product that falls outside all of your rules gets no delivery price at all - and Google does not quietly fall back to something sensible for those, it stops showing them. The preview counts them for you, service by service, before you send anything. If the number is not zero, the fix is on this site rather than at Google: give the service a rule covering everything, or a price for the groups it is missing.

**Where you do not deliver, Google is told so.** A delivery service you have marked as not available for a group is sent as exactly that, rather than being left out. Left out, the group would fall through to your catch-all rule and Google would go on offering - and charging for - a service you do not actually provide there.

**Sending.** **Send to Merchant Center** shows what it is about to do and waits for you to say yes. This is the one thing on the site that needs the **Admin** access level in Merchant Center rather than Standard; the access check on the settings tab tells you which you have.

- Services this site manages are written over. **Anything in Merchant Center this site did not put there is copied back exactly as it is** - a service you set up by hand keeps its own settings, and even one of ours that you have added a minimum order value to keeps that too.
- A service this site used to send and no longer offers is taken away. That is the only way a retired delivery charge ever stops being charged at Google.
- If somebody changed your delivery settings in Merchant Center between the read and the send, Google refuses it and the screen tells you plainly to look again. It is never forced through.
- **If Google refuses it for any other reason, you are told which reason.** Where it is something this site recognises - too many delivery services in the account, for instance - you get a sentence about that in plain words, with the figures in it. Where it is not, you get Google's own words instead of a shrug. Either way both are written into the change log against that send, so it can still be read next week rather than having to be guessed at from what the screen happened to say at the time.
- If your own delivery charges changed between the preview and the button - somebody editing them in another tab - the send is refused too, with "this has changed since you looked". You confirm what you read, never something else.
- What was there before is kept, so the change log at the bottom of Feed rules will put it back. Undo re-reads Merchant Center first and leaves well alone if anything has been changed there since - so it is a way back from your own change, not a way to overwrite somebody else's.
- If the send is interrupted part way - the connection drops, the site restarts - or if Google takes the settings but its reply cannot be read back, you are told exactly that rather than given a tick. The change log says the same, and Undo will not touch a send whose outcome is unknown.
- **Comparing settles it.** Press Compare and, if Merchant Center turns out to hold what that send meant to put there, the entry is marked as done, Undo becomes available again, and the screen says so. If it holds something else, the entry is left alone - that would mean somebody has been in since, and their change is not this site's to reverse. Only the most recent send can be settled this way; an older one left unsettled behind it stays as it is, and the change log says so.
- **One thing to know about undoing a send that was settled later.** Undo compares what Merchant Center holds now against what it held when the send was checked. For an ordinary send those two moments are seconds apart. For one settled by a later Compare they can be hours apart, and anything somebody added in Merchant Center during that window looks, to the undo, like part of what this site put there - so undoing would take it away with the rest. If you have been editing delivery settings in Merchant Center by hand since an unconfirmed send, set them how you want them rather than undoing.

**Keeping an eye on it.** **Check once a day and tell me if they drift apart** does one read a day and raises a notice in the bell when the two stop agreeing. It never sends anything on its own - it tells you, and leaves the deciding to you. Off to start with; it only starts meaning something once you have sent your settings over at least once.

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
- **Only products carrying an amount take part**, because only they have money to give back. Whether the item is on offer makes no difference - the amount can sit inside an ordinary price just as well as a sale one. Clear the amount and the product drops out of the next fetch on its own.
- **Every figure includes VAT**, whichever way round you keep your prices, because that is what Google quotes a shopper.
- **A product stamped with more than it sells for is left out.** The basket would only ever take it down to nothing, so advertising the full amount would be a promise nobody could keep. Shop's own mis-stamp report already flags those.

### The catch, in plain words

Google can only say **"spend this much"** about a whole basket. Your rule counts one supplier's goods, and leaves delivery out of the total. So a basket that reaches the figure across two suppliers meets Google's condition and does not meet yours.

The terms sent with every offer say so - that the total is counted across those products only, and that delivery does not count towards it - and there is a box for anything else you want to add. That is the honest fix available, and it is why this starts switched off: it is your advertisement, so it is your decision.

Two smaller differences, both in the shopper's favour, so neither needs an apology:

- The money comes off **each** qualifying item. Google advertises the single figure, so a basket of three gets three times what it says.
- Where a group of products sits on two different VAT rates, the advertised discount is the smallest one anybody gets and the advertised spend is the highest bar anybody has.

### How long an offer lasts

Google will not let an offer run for more than six months, and it will not let you extend one that is already going. So a standing discount is not one offer that keeps being pushed back: it is a run of six-month offers, each one starting under a new name shortly before the last is up. That happens on its own, and there is no end date to remember.

You can see where each one stands under **Offers running now**, in the same place you switched it on: the name Google knows it by, when its run is up, and how many times it has been started again.

### When Google has stopped one

Once an offer has finished, Google keeps the name and will never use it again. Send it back and they accept the file, say nothing, and leave the offer dead - which is a cheerful sort of silence to debug.

If Merchant Center tells you an offer has expired, or that it could not be updated, press **Start again** next to it. Nothing about the discount changes - same money off, same spend, same products - it simply goes out under a fresh name, and Google treats it as the new offer it insists on. Expect the usual review before it shows on anything, and allow a day for the product listings and the offer to find each other again.

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

### When the address names one particular choice

The price range above is the right answer for a listing somebody is browsing. It is the wrong answer when the address names one specific chair - which is exactly what your feed does, every time, for every combination.

So from Shop 0.1.424 a product page that opens on a particular combination describes **that** combination and nothing else: its own price, its own barcode, its own part number, its own photograph and its own address. A listing nobody has chosen anything on still describes the range, exactly as before.

Why it matters. Google decides which shops appear side by side on a product's page by matching barcodes. Your feed has always carried the right one. The page it sent shoppers to did not carry one at all - it described the whole range, with no barcode and a price span the feed's own figure sat outside. A shopping channel comparing the two found nothing it recognised, so your listings sat on their own instead of alongside everyone else selling the same thing.

Nothing to switch on, and nothing changes for a shop without variations.

### If your prices are shown without VAT

A trade catalogue quite reasonably prints its prices net - "£126.00 ex. VAT" - because most of its customers reclaim it. Google, just as reasonably, insists that UK shoppers are quoted the price they actually pay. Your feed has always sent the VAT-inclusive figure, which is correct.

The trouble was that the page behind it described itself with the net one. Google reads both, sees £126.00 against £151.20, and turns down a listing that was right all along - usually reported as a price mismatch, which reads like an error in your prices rather than a difference of opinion about VAT.

From Shop 0.1.424 the two agree. **Your product pages still show whatever you have chosen** - net, with your own wording beside it, if that is how you sell. What changed is the hidden description underneath, which now quotes the VAT-inclusive figure to match the feed. Shoppers see no difference; Merchant Center stops objecting.

If your prices already include VAT, nothing here applies and nothing about your site moves.

### Why the feed's links changed in 0.1.11

The two above did their job a little too well. The feed used to send Google to each variation's own private address, the page quite correctly answered "the real page is the parent listing", and Google filed the lot under **"Alternative page with proper canonical tag"** in Search Console - technically the right answer to the wrong question, and a few thousand of them on a large catalogue.

From 0.1.11 the feed links to the combination's published address instead: the same one in your sitemap, the same one the page stands behind. Feed, sitemap and page now all name one address per variation, and Search Console stops reporting them.

Nothing else about your listings changes - Merchant Center identifies them the same way it always has, so no listing is retired and re-created. Google re-reads the feed on its usual schedule and the reported count falls away over the following weeks rather than overnight. Where a combination has no published address of its own - one where an option was left unanswered, or a product with two options named so alike they cannot be told apart in an address - the feed keeps the old link, because a link that works beats a tidy one that doesn't.

## Feed rules

**Shop → Products → Google Shopping → Feed rules.** Instead of ticking products one at a time, write a rule once: *when an item matches these conditions, do this*. Rules apply to every feed Google fetches from then on, to products added later as much as to the ones there now.

### What a rule can do

- **Keep them out of the feed.**
- **Give them a custom label** - one of Google's five (`custom_label_0` to `custom_label_4`), with a value of up to 100 characters. Labels are how Google Ads and Merchant Center reports group products: "clearance", "made to order", "high margin". They are sent in the feed; nothing on the site changes.
- **Send them a title template** - the same templates and tokens as the Products tab (`<brand> <parent_title> - <colour>`).
- **Change what they say about identifiers** - say they have no identifiers (no barcode or part number), send each one's SKU as its MPN, or send a brand of your choosing.

### What a rule can ask

Conditions are grouped: a group matches when **all** of its conditions hold (AND) or when **any** of them does (OR), and groups can sit inside groups, so "(made to order AND from this supplier) OR out of stock" is one rule. For example, *attribute "MTO" is "Yes" AND supplier is "Acme Office" → keep out of the feed*.

The fields:

| Field | Whose answer, on a variation |
|---|---|
| Supplier | The variation's own, else its product's |
| Brand (as the feed sends it) | The variation's own |
| Category - matches the category itself **and anything under it** | The product's (every category it is filed in) |
| Range - whichever attribute you pick as your range at the top of the tab | The variation's own, else its product's |
| Every product attribute | The variation's own, else its product's |
| Every variation option (Seat Colour, Width...) | The variation's own |
| Stock quantity, stock status, price, sale price, has a photo, has a barcode | The variation's own |
| Product status | The product's |

The field picker labels each one **Listing**, **Each variation** or **Variation, else listing**, so you can tell which answer a rule is reading. Comparisons: is, is not, contains, does not contain, is empty, is not empty, is more than, is less than, and is any of (a list). Text is compared without regard to capitals or stray spaces; prices can be typed with a pound sign or commas. "Is empty" means there is no answer at all - zero stock is an answer, an untracked stock count is not.

### Who wins

1. **Your own choice on a product or variation beats every rule.** "Always send" keeps it in however many rules would exclude it; "Never send" keeps it out whatever the rules say.
2. **Any Exclude rule that matches keeps the item out**, wherever it sits in the list. An item that is not being sent carries no labels.
3. For labels, titles and identifiers, **the higher rule in the list wins**: each of the five labels, the title, and each of the three identifier changes separately. A lower rule fills only what the higher ones left empty.
4. Anything typed on the product itself still beats a rule doing the same job: a brand, barcode or part number on the product's Google Shopping tab, or a title template set on the item in the Products tab.

Drag a rule by its handle to move it, or use the arrows beside it.

### Seeing what a rule does before it does it

A rule cannot be saved until it has been **previewed**. The preview runs the whole list, with the new rule in place, over every item in the catalogue and says how many it matches, how many would actually change and how (out of the feed, back in, a label, a title, identifiers), and names the first sixty. It also says how many matching items stay as they are because of a choice set by hand, or because a rule higher up already does the same job. Change anything in the rule and the preview is marked out of date until you run it again.

Switching a rule on or off saves straight away. Every add, change, switch, move and delete is listed under **Recent changes** at the bottom of the tab, alongside changes to products' own Google choices, each with an **Undo**. An undo only puts back what is still as the change left it; anything changed again since is left alone, and you are told.

### Where to see the result

On the **Products** tab, each item says what the rules did to it: "Excluded by rule: ...", "Label 0 "clearance" set by: ...", "Title set by: ...". The list shows what goes to Google by default; the **In or out of the feed** filter shows what is kept out, and the **Rule** filter narrows the list to what one rule matches. "Show them" beside a rule opens exactly that.

Rule changes reach Google the next time it fetches the feed. The workbench notices a rule change straight away and reads the shop again before showing the list.

### Two places that only read the product's own choice

The **Merchant Center links** on a product's Google Shopping tab, and the **review feed**, both read only the product's own **Never send to Google** choice. A product kept out by a *rule* still shows those links (which lead to a listing Google was never sent) and still has its reviews published in the review feed. Google files a review against a product it already holds and ignores one it cannot match, so nothing goes wrong at Google's end - but the links are worth knowing about. A later update gives both a single "is this item in the feed" answer to read.

## Products we don't send, and why

Google requires a picture on every listing and rejects anything without one - every destination, every country, no exceptions. So from 0.1.425 the feed doesn't send them. A product with no photograph is held back, and the Google Shopping settings tab tells you which ones and how many.

That is a deliberate trade. Sending them would fill Merchant Center with rejections you then have to read and interpret; holding them back quietly would just move the puzzle to "why isn't this product on Google?". Saying it out loud, in the place you'd go looking, is the only version that helps.

Add a photograph and the product goes along with the next fetch. Nothing to switch on and nothing to clear.

The count only appears once Google has actually fetched your feed - working it out means building the whole thing, which is far too much for a settings page to do every time you open it, so the scheduled fetch writes down what it found. Until the first fetch after updating, the tab says nothing rather than showing you a reassuring zero it hasn't earned.

## If Merchant Center turns products down over their pictures

The one to know about is **"Unsupported image type"**. It sounds like the picture is the wrong sort of file, and it almost never is - Google is perfectly happy with JPEG, PNG, GIF and WebP, which is everything the media library makes.

What it usually means is that Google asked your storage for the picture, got a shrug instead, and took the shrug for the picture. Storage does that to a small share of requests - once or twice in a hundred - and Google is working through every image in your catalogue in one go, so a small share of a very large number is a lot of turned-down products. Variations bear the brunt simply because there are more of them.

The cure is one click: **Settings → Media → Deploy Worker**. A current media service asks storage again before giving up, and answers the quick "is it there?" check Google makes before downloading anything, which older ones refused. Once it is redeployed, ask Merchant Center to fetch your feed again and the rejections clear on the next run.

Genuinely broken pictures are a different message - Google says it could not find the image, not that it could not read it.

**Wiki:** [Home](Home) · [Shop](Shop) · [Shop Variations](Shop-variations) · [Advanced Shipping](Advanced-Shipping) · [Modules](Modules) · [Configuration reference](Configuration-reference)
