# Google Sheet Products for Shop

If you have ever wished you could edit your whole catalogue in a spreadsheet - fix fifty prices, tidy a hundred descriptions, bulk-change a category - and then just put it all back, this is that. It mirrors your shop catalogue into a Google Sheet you can bulk-edit in a tool you already know, then pulls the changes back into your site when you say so.

Two things are worth being very clear about up front, because they are the whole point:

- **The sheet is a working copy, not your live site.** Editing a cell changes nothing on your website. Nothing.
- **Everything happens on a button press, by a human.** There is no background sync, no automatic anything. You **Push** to send your catalogue to the sheet, and you **Pull** to bring the sheet's edits back - and Pull shows you exactly what it is about to do before it does it.

---

## Before you start

This module needs both the [Shop](Shop) and [Shop Variations](Shop-variations) modules installed first. If you try to install it without them, Cactus will tell you and stop.

You will also need a Google account you are happy to keep the sheet in.

---

## Setting it up

The one-off setup lives under **Settings → Google Sheet** (a tab alongside your other site settings). Once you are set up, the everyday **Push** and **Pull** buttons move to your Products page - see below.

### 1. Register your own Google project

Cactus doesn't use a shared Google app - you connect your own, so your catalogue only ever touches your Google account and nobody else's. It is a one-off job:

1. Go to the [Google Cloud console](https://console.cloud.google.com/) and create a new project.
2. Enable the **Google Sheets API** and the **Google Drive API** for it.
3. Create an **OAuth client** (of the "Web application" kind). When it asks for an authorised redirect address, use the one shown on the Cactus settings tab.
4. Copy the client ID and client secret it gives you into the Cactus settings tab, and save.

### 2. The one thing everybody trips over

When Google asks you to set up the "OAuth consent screen", it starts in **Testing** mode. **Publish it to "In production".**

If you leave it in Testing, Google quietly cuts off access after **seven days** - which shows up as "it worked all week, then just stopped." With the permissions this module asks for, publishing to production is a single button and needs no review from Google. Do it now and save yourself the puzzle later.

### 3. Connect, and make the sheet

1. Click **Connect Google** and sign in when prompted. The settings tab will then show "Connected as ..." with your account.
2. Click **Create the sheet**. Cactus makes a fresh Google Sheet - always its own, never one you picked - with four tabs: **Products**, **Variations**, **Suppliers**, and a **Read me** with the short version of this page.

Once the sheet exists, the settings tab is done with its job. The day-to-day buttons - **Push**, **Pull**, **Open sheet** and the sync log - live on your **Products** page from now on, under a **Google Sheet** button next to New product. Settings stays as the one-off setup.

---

## Cost price - a quiet warning

Your product cost price is your supplier cost - your margin. It is always included in the sheet, on both the Products and the Variations tabs, so anyone you share that sheet with can see it. Share the sheet with that in mind - and if you would rather a particular person didn't see your margins, send them a copy with the cost column deleted rather than the live sheet.

---

## Pushing and pulling

You do both from your **Products** page: look for the **Google Sheet** button up by New product, and everything is on the little menu it drops down - Open sheet, Push, Pull, and Sheet logs. The button only appears once your sheet is set up, so a shop that isn't using this feature never sees it.

### Push to sheet (your site → the sheet)

Overwrites the sheet with whatever is currently on your website. This is how you get an up-to-date working copy before a big edit. The Products tab is filled first, then a tab for each of your products that has variations, then Suppliers.

Like a Pull, a Push now works in stages with a live count and a little tracker (Products, then the product tabs, then a tidy-up), because a big catalogue is a lot of tabs to fill. You can leave the window open and watch it along; if something interrupts it, it picks up where it left off, and a **Continue** button appears if it ever needs a nudge.

Closing the Push window while it is working now means **stop**: it asks first (the same question as the Stop button), then winds the push up at the tab it is on. Tabs already written stay written; push again whenever you like. Closing the whole browser tab is different - nothing is running on your side then, so the push simply pauses, and reopening offers Continue as before.

It fills in its own columns and leaves the rest of each tab alone - so anything you have added off to the right stays where you put it, as do your formulas where they still add up. See **Using formulas in the sheet**, just below.

If you have made changes in the sheet since Cactus last synced with it, Push stops and asks first - because filling the sheet from your site would wipe those edits. You can either go and Pull them in before you Push, or say yes to overwrite them. Cactus's own Pushes and Pulls don't trip this, only edits made by hand in the sheet.

### A tab for each product's variations

Products with variations no longer share one enormous "Variations" tab. Each such product gets **its own tab**, named after it, showing only the option columns that product actually uses - so you are never scrolling past blank columns that belong to something else. A plain product without variations just lives on the Products tab as before.

One thing to leave be: **don't rename or delete a product's tab by hand.** A Pull needs to find every tab to know which variations you still have. If one has gone missing, the Pull stops and tells you which to put back (or just Push again to rebuild it) - rather than assume those variations were deleted and remove them. Tidying a product away in the admin removes its tab for you on the next Push, which is the safe way round.

### Using formulas in the sheet

You can, and a Push will do its best to leave them where they are.

The rule is simple enough: **a formula survives a Push as long as it still works out to the same value your website holds.** Put `=D2*1.2` in a price cell, and as long as your site agrees the price is that number, the formula stays put and the sheet keeps working the way you set it up. Change that price in the admin, Push, and the formula is replaced by the new number - it has to be, because the number is the one that's true and a stale formula quietly disagreeing with your shop is worse than no formula at all. The message after a Push tells you how many it kept.

There's one more thing that ends a formula's life, and it's worth knowing about: **a formula is dropped if its row moves.** This is not us being lazy - a formula's references don't shuffle along with it the way they do when you drag a cell about in Google Sheets, so a formula that moved rows would carry on pointing at whichever product had wandered into the old spot. Better a plain number than a confidently wrong one.

The good news is that rows now barely move at all. A Push keeps every product and variant in the row it already occupies in your sheet, and anything brand new is added at the bottom rather than wherever the database felt like putting it. (Older versions rebuilt the tab in whatever order the database returned, which could quietly shuffle whole blocks of rows between one Push and the next and flatten every formula in them - complete with a stray apostrophe in front of anything that looked like a number, barcodes especially. That's fixed.) A row now only moves when a product above it is removed - or when you sort the tab yourself, in which case the next Push respects your new order.

And when a product is removed, its **whole row** is now taken out of the sheet rather than just having its cells wiped. That matters if you keep columns of your own down the side: the row you have written notes against disappears along with the product it belonged to, and everything below shuffles up together, so your notes stay beside the right product instead of sliding one out of step. (A Push works out what has genuinely gone by checking both the SKU and the slug, so renaming a product - or clearing its SKU - never gets mistaken for deleting it.)

If your sheet already picked up one of the old blank gaps - from before this row-deletion behaviour existed - a Push now clears those away too, as long as there is genuinely nothing on the row: no product, no note, nothing. The moment you have written so much as a word in your own column on a row, it is left alone.

The same promise covers **columns**, and it now covers all of them rather than just the ones on the right. The attribute and extra-field columns used to come out in whatever order the database offered them up, and one software update was enough to swap whole blocks of them around - which counted as the sheet changing shape, and flattened every formula on the tab in one go. A Push now keeps every column wherever your sheet already has it, and anything genuinely new is added at the far end - and crucially, a new column arriving is slotted in *beside* your own columns rather than landing on top of the first one, so nothing you added gets overwritten.

If you want formulas that survive absolutely everything, put them in columns to the **right** of the last one Cactus fills in. That space is entirely yours: a Push never writes there and never clears it, so anything you build out there - a margin calculator, a running total, a whole second dashboard - is untouched. Same goes for a Pull, which only ever reads the columns it recognises. And on the rare occasion a formula in a catalogue cell would end up showing a different number to the one your shop actually charges - because a figure it depends on changed in the same Push - Cactus replaces it with the true number rather than leave a cell quietly disagreeing with your till.

One quirk on the **product variation tabs** is now sorted. A variant's price cells used to arrive as text - you'd sometimes spot a stray apostrophe in front of the number - which meant a formula there was replaced on every Push even when the price hadn't changed. Variant prices now behave exactly like the ones on the Products tab, so a formula on a variant price is kept for as long as it still agrees with your shop.

### Moving the columns about

The order Cactus writes the columns in is the order the database happens to keep them, which is nobody's idea of a sensible working layout. So drag them wherever you like.

**Your order is the one that sticks.** A Pull finds each column by the heading at the top of it, not by where it sits, so cost price can live next to price, the columns you never touch can be shoved off to the right, and everything still reads back correctly. A Push then writes your catalogue into the sheet exactly as you have arranged it, rather than shuffling it all back to the factory order every time. Rearrange, Pull, Push, and the sheet still looks like your sheet.

This works on the product variation tabs too, including the Parent Slug column - move it off column A if you want to, and a Pull will still find it.

Two things to keep in mind:

- **Move the whole column, don't rename the heading.** The heading is the only thing that tells Cactus what a column is. Retitle `retail_price` to "RRP" and that column simply stops being read, and a Pull will tell you the sheet is missing a column it needs.
- **New columns arrive at the far right of ours.** When an update adds a column, it goes on the end rather than being wedged into the middle, so nothing you have already arranged shuffles along to make room for it.

If you keep columns of your own, they still belong to the right-hand side. Anything of yours that ends up in the middle of Cactus's own columns is nudged out to the right on the next Push rather than being written over, which keeps it intact but probably isn't where you wanted it.

### Pull from sheet (the sheet → your site)

This is the one to take a breath over, so it makes you look first. Choose **Pull from sheet** and Cactus reads the sheet and shows you a **preview**: how many products it will create, how many it will update, how many it will delete, any rows it can't make sense of, and - importantly - a named list of everything that is **"In the shop but not in your sheet."**

If nothing at all has changed since your last Push or Pull, the window just says so - "Your sheet already matches your shop" - with nothing to confirm, rather than making you click through a list of zeros.

Nothing has changed at this point. When you are happy, press the button in the preview to actually do it.

### Watching it work, and picking up where it left off

Once you confirm, Pull shows you a live count as it goes - so many products of so many, then so many variations - along with a small tracker across the three stages (Products, Removals, Variations) so you can see how far through it is, rather than a spinner and a shrug. A big catalogue is done in stages, and you can leave the page open and watch it tick along.

It also tells you **what** it is working on, not merely how much. The window names the product it is writing at that moment - "Updating Chiro Plus Ergonomic Chair…" - and for variations it names the product and the options too, so you get "Chiro Plus Ergonomic Chair - Black / High back" rather than an anonymous number creeping upwards. Underneath, a short **Just done** list keeps the last handful of items on screen as they go by. The counts now move item by item as well, so a long stretch on one big product no longer looks like it has wandered off.

If something interrupts it - a wobbly connection, a stubborn row, a request cut short - it doesn't lose its place. It retries by itself a few times first, quietly, and only if it genuinely cannot get any further does a **Continue** button appear (on that same Google Sheet menu, and in the Pull window) so you can nudge it on or cancel. Reopening a half-finished Pull carries straight on without being asked, too. Everything it does is safe to repeat, so resuming never doubles anything up.

Every stage now works this way, products included. Previously the products stage tried to swallow the whole lot in one go, and on a large enough catalogue it would run out of time, start again, run out of time again - and sit on "Updating products…" indefinitely while looking terribly busy. It now works through products in small batches exactly like variations, banking its progress after each one, so however large the catalogue, every batch counts and the Pull always gets there. Variations also go through in larger batches than before, so the whole thing finishes sooner.

### Changed your mind halfway through

A Pull that is running now has a **Stop pull** button next to the progress bars. Press it, confirm, and it winds up at the end of the batch it is already on rather than in the middle of one - so you may see it tick over once more before it settles. Everything it had already applied stays applied; the rest of your sheet is simply left alone, and the window then shows you the tally of what did land before you close it.

It is a stop, not an undo. Nothing gets put back, and a stopped Pull cannot be resumed - if you want the rest of the changes, run Pull again and it will pick up the differences that are still outstanding. The same button is there while it is retrying after a wobble, for when you would rather not sit and wait for it.

Closing the Pull window while it is working also means stop now - it asks the same question first, then winds up at the end of the batch it is on. It used to quietly leave the job waiting to be resumed, which read as "it carried on after I closed it". Closing the whole browser tab still just pauses it (nothing is running on your side then), and reopening carries on as before.

Only one stage of a Pull can ever run at a time, so opening the same Pull in a second tab, or a retry arriving while the previous attempt is still going, waits its turn instead of both marching through the catalogue at once.

Push and Pull also refuse to run over the top of each other. If a Push is part-way through - even one you have walked away from - opening Pull says so plainly and asks you to let it finish (or cancel it) first, rather than fighting it for Google's reading allowance and timing out with a misleading "could not read the sheet". Push has always had the same manners about a Pull in progress.

The preview's numbers only count real differences: a Pull straight after a Push - with nothing edited in between - shows nothing to update, rather than solemnly claiming your entire catalogue needs redoing. This now includes the extra columns other features add to the Variations tab, like 3D files and per-variation attributes - edit one of those cells and the preview counts it as a change to make, the same as a price or a stock figure. Rows that already match your shop are shown as skipped, and - this is the bit that actually saves you time - Pull no longer touches them at all: on a big catalogue where you only changed a handful of rows, it used to grind through every row regardless, and now it only works on the ones that changed. Click **"what's changing"** under the product count to see exactly which field is changing on which product before you commit, and the matching list under the variation count to see which variations (by product and option) a Pull will update.

### Sheet logs

**Sheet logs** on the menu opens a window listing your recent Pushes and Pulls, with what each one changed - handy for a quick "did that last Pull actually land?" without leaving the Products page.

The "updated" figure counts the extra columns other features add to the Variations tab, not just the built-in ones. A Pull whose only work was attaching a pile of 3D files used to sign off with "0 updated", which is a fine way to make you do the whole thing again for nothing.

A Pull that finished but had rows rejected along the way no longer masquerades as a clean run. The log shows how many rows failed, in a colour you will not miss, and clicking that count unfolds the list - each failed row's number in your sheet and the reason it was turned away (a variation blocked by a SKU already in use, say). Previously such a run signed off as a plain success and the errors sat unread in the record, which rather defeated the point of keeping them.

A few things the preview will tell you:

- **Products always sync before variations**, in both directions. A variant's parent product must already exist, or its rows are skipped.
- If you have edited products in the admin since you last pushed, the preview warns you - pulling would overwrite those admin edits with the (older) sheet.
- Rows with an obvious mistake (a missing name, a price that isn't a number or is below zero, a made-up status) are listed as errors and skipped, rather than being guessed at. A stray minus sign in a price cell used to sail through and create a product priced in negative money, which is a generous business model but rarely the intended one.

### Rows you deleted from the sheet

The sheet is treated as the say-so on what should exist. **Delete a product's row, Pull, and that product is deleted from your site** - along with any of its size/colour variations. Delete just some of a product's variation rows and only those variations go; clear out all of a product's variation rows and it loses the lot.

Because this cannot be undone, the preview never hides it from you. Every product about to be deleted is listed by name under **"In the shop but not in your sheet"**, and every variation about to be removed is listed too - by product name and option (say, "Oak Desk - 1600mm") - so a bare "55 variations will be removed" never leaves you guessing which 55. Nothing happens until you press the button, and if you change your mind you just put the row back in the sheet before you do.

One quiet safeguard worth knowing: Pull will only ever delete something that was in the sheet as of your **last Push**. So if you add a brand-new product in the admin and then Pull before you have Pushed it out to the sheet, Cactus won't mistake "not pushed yet" for "deleted" and bin it. (And on a sheet you have never Pushed to at all, Pull deletes nothing - it has no idea what was meant to be there.)

Past orders are never harmed by a deletion: an order keeps its own record of what was bought, even once the product itself is gone.

### The Variant ID column, and renaming things in the sheet

The Variations tab carries a **Variant ID** column (it appears on your next Push if your sheet predates it). It is each variation's permanent identity - not pretty, not meant to be - and it is what lets you rename things in the sheet without consequences.

Before this column existed, a variation was recognised purely by its option values. Change "Red" to "Crimson" down a column and Pull no longer recognised those rows: it offered to delete every "Red" variation and create a fresh set of "Crimson" ones - new identities, broken links to 3D files and the like. With the column in place, Pull sees the ID, knows exactly which variation each row is, and treats the new wording as a **rename**: same variation, same stock, same SKU, new label. If every row using a value agrees on the new wording, the value itself is renamed in one go; if only some rows change, just those variations are moved to the new value.

Two things to keep in mind:

- **Leave the column alone.** Don't type into it, don't clear it, don't paste one row's ID into another. A blank cell just falls back to the old matching (by SKU, then by option values), so nothing breaks - you simply lose the safety net for that row.
- A row you add by hand for a brand-new variation naturally has no ID; leave the cell empty and Push will fill it in once the variation exists.

---

## What the sheet covers, and what it doesn't

The Products and Variations tabs cover the bulk of a catalogue: names, web addresses, prices (the main price plus the sale, retail and trade prices), stock, size and weight, categories, tags, collections, images and videos, SEO fields, pre-order settings, download rules for digital products, the related-products and upsell settings, both kinds of description (the plain one you type and the one you lay out in the designer), and the size/colour options with their per-variant prices (the main price plus the sale, RRP, trade and cost prices, exactly as on the Products tab), stock and SKU.

### Attribute columns

If you use **Attributes** on your products, they travel with the sheet too.

- Attributes that tell your **variants apart** - a per-variant Finish, Catalog and the like - each get a column on the **Variations** tab. Type a value and Pull, and it's set on that variant. Blank cells are left alone.
- Attributes you keep at the **product level** - one value for the whole product, like a markup band - get a column on the **Products** tab. Fill it in and Pull to save it against the product; if the attribute takes more than one value, separate them with commas in the same cell.

A value the attribute hasn't seen before is created for you, exactly as a new size or colour would be.

An attribute only shows up as a column once a product actually uses it - on either tab - so to put one on a product for the first time, tick it on that product's **Attributes** tab in the admin and it'll be in the sheet from then on. A Pull will not start using an attribute on your behalf just because a column happens to be headed with its name. That used to be the way of it on the Variations tab, and it turned out to be a touch too helpful: a column of supplier codes pasted onto a variations tab was enough to promote "Range" and "Catalog" into per-variation settings on every product it touched, each one then dutifully written back into the sheet so it came straight back the moment you deleted it. Your own columns, and other features' columns, are now left exactly where they are.

### The designed description column

If you have laid a product's description out in the **description designer** rather than typing it into the plain description box, that layout now travels with the sheet too. It sits on the Products tab in a column called **description_puck**, one row along from the plain `description`.

Fair warning: it looks like gibberish. It is one long line of code describing every block of the layout, and it is there so that a Push and a Pull carry your designed descriptions along with everything else, not so you can read it over breakfast.

What you can usefully do with it:

- **Copy the whole cell** from one product to another and Pull. That product gets the same designed description. This is far and away the most useful thing about the column - it's the quickest way to give forty products the same layout.
- **Empty the cell** and Pull. That product drops back to using its plain description text, exactly as if you had never opened the designer.
- **Leave it alone** on every product you aren't changing, which will be most of them.

What you should not do is edit it by hand, character by character. If you do and you get it wrong, nothing breaks: Pull tells you which row is the problem and leaves that product's description exactly as it was. The rest of the row still goes through.

Every so often a layout is too long to fit in a spreadsheet cell - Google caps them, and a very elaborate description can run past it. Rather than write half a layout into the cell and read the broken half back on the next Pull, we put a short note there instead saying it's too large. Leave that note where it is: that product's design is edited in the admin only, and a Pull won't touch it.

If your sheet was made before this column existed, your next Push adds it.

### The variations count column

The Products tab carries a **variations** column: how many variations each product has. It is the same figure as the number of rows on that product's own tab, so a desk offered in four widths and three finishes reads 12. A product with no variations at all reads 0.

It is a plain number rather than text, so you can sort by it, filter on it, or add it into your own sums - handy for spotting the product that has quietly grown to two hundred variants, or the one that was meant to have some and doesn't.

This column is worked out for you and only ever read one way. Type a different number into it and nothing happens: Pull ignores it entirely, and your next Push puts the real figure back. Variations are added and removed on the product's own tab, or in the admin, which is rather the point.

If your sheet was made before this column existed, your next Push adds it.

### The Suppliers tab

Alongside the catalogue itself, the sheet carries a **Suppliers** tab: every supplier in your address book, whether they're enabled or disabled, the trade discount you've got on file for each, and the catalogues you've recorded against them with a link to each. It's there so the person doing the pricing has the supplier's own price list, and the discount that goes with it, to hand instead of in another browser tab.

The **Discount** column is a plain number, no percent sign, so you can add it into your own sums without the sheet treating it as text. It's left blank for a supplier you've recorded no discount against.

This one only travels one way. Push refreshes it; Pull never so much as glances at it, so editing it changes nothing on your site and nothing you type there survives the next Push. Suppliers and their catalogues are added and edited under **Shop → Suppliers**, which is where they belong.

A supplier with no catalogues recorded still gets a row, with the catalogue columns left blank - "none recorded yet" being rather more useful than a silent absence.

> If you made your sheet before this tab was renamed, don't worry: your old **Supplier Catalogues** tab keeps its place and its name simply changes to **Suppliers** on your next Push, with everything on it intact.

If your sheet was created before this tab existed, don't go looking for it: your next Push adds it, formatting and all, with nothing required from you.

### The web address column

The **slug** column is the last part of a product's web address - the `nice-blue-mug` in `yoursite.com/shop/nice-blue-mug`. Change it, Pull, and the product moves to the new address. Worth knowing before you do: anyone who bookmarked or linked to the old one lands on nothing.

A product row with no SKU is matched back to your site by its slug, so if you clear that cell on an existing product, the next Pull treats the row as a brand-new product and you end up with two of them. When in doubt, leave the column alone - everything else on the row still works.

### Numbers behave like numbers

Prices, stock counts, weights and the rest arrive as proper numbers, so you can sum a column, sort by price, or point a chart at it without Google treating it as text. This now holds for **any** column that carries a number, including a custom attribute of your own - if a cell is a plain number it goes in as one, so a formula that works it out is kept rather than replaced by a stray-apostrophe copy on the next Push. SKUs, barcodes and anything that only looks like a number - a code beginning with a zero, say - stay as text on purpose, because that leading zero would otherwise quietly vanish.

On the Variations tab, the **Image** column holds every picture a variant has, not only the first one. They sit in one cell separated by commas, in the order they show on the page, and the first one in the list is the one used as that variant's main picture. Add a comma and another address to give a variant a second picture; clear the cell to take its pictures away. A cell with a single address still works exactly as it did before, so an older sheet needs no attention. If anything in the cell isn't a proper web address, that row is reported back to you and its pictures are left untouched rather than half-changed.

A few things are deliberately left out, and are never touched by a sync (so they are safe, just not editable here):

- **Personalisation add-ons** (engraving text boxes, gift-message fields, and the like) aren't in the sheet.
- **Swatches** - the little colour or image chips on an option - are filled in automatically when a value matches one on the option's master list (an attribute): it borrows that list's colour or picture. A value that has no match on any master list - a genuinely new one, on an option that isn't drawn from a list - has no chip until you add one in the admin.
- An option type created via the sheet defaults to a **dropdown**; change it in the admin if you want something else.

---

## If you make a mess of the header

The top row of each tab is the bit Pull relies on to know which column is which. Moving a column is fine - the heading travels with it and everything carries on working. Changing what a heading *says* is not, because that is the only way Cactus knows what the column holds. It is protected with a gentle warning, but if it gets mangled beyond repair, use **Reset sheet** on the settings tab. That makes a fresh, clean sheet and points Cactus at it. Your old sheet stays in your Google Drive (you can bin it yourself), and a Push refills the new one.

---

## When Pull complains

Pull does two things, and they fail for completely different reasons: it fetches the two tabs from Google, then it compares them against your catalogue. It used to report both as "could not read the sheet", which sent more than one owner off rebuilding a spreadsheet that was perfectly fine. Now it tells you which half fell over:

- **"Could not read the Google Sheet"** followed by a reason - Google would not hand the tabs over. If the reason mentions a range it could not find, a tab has been renamed or deleted: put the **Products** and **Variations** names back, or use **Reset sheet** on the settings tab.
- **"Read the sheet fine, but comparing it with your catalogue failed"** - the sheet is not the problem and rebuilding it will not help. Something on your own site fell over mid-comparison. Try again in a minute; if it keeps happening, the reason on the end of that message is the thing to quote to us.
- **"Your site answered with an error"**, or **"It ran out of time"** - your site never got as far as an opinion. The first is a crash, the second is a very large catalogue taking longer than the minute it is allowed. Either way, nothing has been changed on your site.

### Google's speed limit

Google only lets one account read from, or write to, a sheet so many times a minute. A catalogue with a lot of products used to go through that allowance quickly, because every product with variations has a tab of its own to fetch or fill in.

Pull now fetches those tabs in bundles of forty or so at a time rather than one by one, so reading even a very large catalogue costs Google a handful of requests and takes seconds - this is also what fixed the "ran out of time" failure that very large catalogues used to hit before the reading had even finished. Push still works tab by tab (filling in is fussier than fetching), pacing itself to stay inside the allowance: on a large catalogue that means the odd pause partway through and a few more goes than it used to take - the progress bar keeps ticking either way, and none of it needs anything from you. If Google says no regardless, it waits a moment and asks again rather than giving up on the spot.

Should it still run out of patience, you will see **"Google is limiting how fast it will let us read and write this sheet"**. Nothing is broken and nothing is lost. Wait a minute, then press **Continue** and it carries on from where it stopped. Running Push and Pull back to back on a big catalogue is the usual way to meet it, so if you are doing both, give it a minute in between.

---

## If it stops working after about a week

Almost always, this is the Testing-mode trap from the setup steps above: the consent screen was never published to production, so Google expired the connection after seven days. Publish it to "In production" and click **Reconnect Google**. That's it.

---

**Wiki:** [Home](Home) · [Shop](Shop) · [Shop variations](Shop-variations) · [Managing pages](Managing-pages) · [Modules](Modules) · [Configuration reference](Configuration-reference)
