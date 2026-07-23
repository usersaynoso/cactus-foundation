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
2. Click **Create the sheet**. Cactus makes a fresh Google Sheet - always its own, never one you picked - with four tabs: **Products**, **Variations**, **Supplier Catalogues**, and a **Read me** with the short version of this page.

Once the sheet exists, the settings tab is done with its job. The day-to-day buttons - **Push**, **Pull**, **Open sheet** and the sync log - live on your **Products** page from now on, under a **Google Sheet** button next to New product. Settings stays as the one-off setup.

---

## Cost price - a quiet warning

Your product cost price is your supplier cost - your margin. It is always included in the sheet, on both the Products and the Variations tabs, so anyone you share that sheet with can see it. Share the sheet with that in mind - and if you would rather a particular person didn't see your margins, send them a copy with the cost column deleted rather than the live sheet.

---

## Pushing and pulling

You do both from your **Products** page: look for the **Google Sheet** button up by New product, and everything is on the little menu it drops down - Open sheet, Push, Pull, and Sheet logs. The button only appears once your sheet is set up, so a shop that isn't using this feature never sees it.

### Push to sheet (your site → the sheet)

Overwrites the sheet with whatever is currently on your website. This is how you get an up-to-date working copy before a big edit. The Products tab is filled first, then Variations, then Supplier Catalogues.

It fills in its own columns and leaves the rest of the tab alone - so anything you have added off to the right stays where you put it, as do your formulas where they still add up. See **Using formulas in the sheet**, just below.

If you have made changes in the sheet since Cactus last synced with it, Push stops and asks first - because filling the sheet from your site would wipe those edits. You can either go and Pull them in before you Push, or say yes to overwrite them. Cactus's own Pushes and Pulls don't trip this, only edits made by hand in the sheet.

### Using formulas in the sheet

You can, and a Push will do its best to leave them where they are.

The rule is simple enough: **a formula survives a Push as long as it still works out to the same value your website holds.** Put `=D2*1.2` in a price cell, and as long as your site agrees the price is that number, the formula stays put and the sheet keeps working the way you set it up. Change that price in the admin, Push, and the formula is replaced by the new number - it has to be, because the number is the one that's true and a stale formula quietly disagreeing with your shop is worse than no formula at all. The message after a Push tells you how many it kept.

There's one more thing that ends a formula's life, and it's worth knowing about: **a formula is dropped if its row moves.** Rows move whenever a product is added or removed above it, which on a busy shop is most weeks. This is not us being lazy - a formula's references don't shuffle along with it the way they do when you drag a cell about in Google Sheets, so a formula that moved rows would carry on pointing at whichever product had wandered into the old spot. Better a plain number than a confidently wrong one.

If you want formulas that survive absolutely everything, put them in columns to the **right** of the last one Cactus fills in. That space is entirely yours: a Push never writes there and never clears it, so anything you build out there - a margin calculator, a running total, a whole second dashboard - is untouched. Same goes for a Pull, which only ever reads the columns it recognises.

### Pull from sheet (the sheet → your site)

This is the one to take a breath over, so it makes you look first. Choose **Pull from sheet** and Cactus reads the sheet and shows you a **preview**: how many products it will create, how many it will update, how many it will delete, any rows it can't make sense of, and - importantly - a named list of everything that is **"In the shop but not in your sheet."**

If nothing at all has changed since your last Push or Pull, the window just says so - "Your sheet already matches your shop" - with nothing to confirm, rather than making you click through a list of zeros.

Nothing has changed at this point. When you are happy, press the button in the preview to actually do it.

### Watching it work, and picking up where it left off

Once you confirm, Pull shows you a live count as it goes - so many products of so many, then so many variations - along with a small tracker across the three stages (Products, Removals, Variations) so you can see how far through it is, rather than a spinner and a shrug. A big catalogue is done in stages, and you can leave the page open and watch it tick along.

If something interrupts it - a wobbly connection, a stubborn row, a request cut short - it doesn't lose its place. It retries by itself a few times first, quietly, and only if it genuinely cannot get any further does a **Continue** button appear (on that same Google Sheet menu, and in the Pull window) so you can nudge it on or cancel. Reopening a half-finished Pull carries straight on without being asked, too. Everything it does is safe to repeat, so resuming never doubles anything up.

Every stage now works this way, products included. Previously the products stage tried to swallow the whole lot in one go, and on a large enough catalogue it would run out of time, start again, run out of time again - and sit on "Updating products…" indefinitely while looking terribly busy. It now works through products in small batches exactly like variations, banking its progress after each one, so however large the catalogue, every batch counts and the Pull always gets there. Variations also go through in larger batches than before, so the whole thing finishes sooner.

### Changed your mind halfway through

A Pull that is running now has a **Stop pull** button next to the progress bars. Press it, confirm, and it winds up at the end of the batch it is already on rather than in the middle of one - so you may see it tick over once more before it settles. Everything it had already applied stays applied; the rest of your sheet is simply left alone, and the window then shows you the tally of what did land before you close it.

It is a stop, not an undo. Nothing gets put back, and a stopped Pull cannot be resumed - if you want the rest of the changes, run Pull again and it will pick up the differences that are still outstanding. The same button is there while it is retrying after a wobble, for when you would rather not sit and wait for it.

Only one stage of a Pull can ever run at a time, so opening the same Pull in a second tab, or a retry arriving while the previous attempt is still going, waits its turn instead of both marching through the catalogue at once.

The preview's numbers only count real differences: a Pull straight after a Push - with nothing edited in between - shows nothing to update, rather than solemnly claiming your entire catalogue needs redoing. This now includes the extra columns other features add to the Variations tab, like 3D files and per-variation attributes - edit one of those cells and the preview counts it as a change to make, the same as a price or a stock figure. Rows that already match your shop are shown as skipped, and - this is the bit that actually saves you time - Pull no longer touches them at all: on a big catalogue where you only changed a handful of rows, it used to grind through every row regardless, and now it only works on the ones that changed. Click **"what's changing"** under the product count to see exactly which field is changing on which product before you commit, and the matching list under the variation count to see which variations (by product and option) a Pull will update.

### Sheet logs

**Sheet logs** on the menu opens a window listing your recent Pushes and Pulls, with what each one changed - handy for a quick "did that last Pull actually land?" without leaving the Products page.

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

The Products and Variations tabs cover the bulk of a catalogue: names, web addresses, prices (the main price plus the sale, retail and trade prices), stock, size and weight, categories, tags, collections, images and videos, SEO fields, pre-order settings, download rules for digital products, the related-products and upsell settings, and the size/colour options with their per-variant prices (the main price plus the sale, RRP, trade and cost prices, exactly as on the Products tab), stock and SKU.

### The Supplier Catalogues tab

Alongside the catalogue itself, the sheet carries a **Supplier Catalogues** tab: every supplier in your address book, whether they're enabled or disabled, and the catalogues you've recorded against each one with a link to each. It's there so the person doing the pricing has the supplier's own price list to hand instead of in another browser tab.

This one only travels one way. Push refreshes it; Pull never so much as glances at it, so editing it changes nothing on your site and nothing you type there survives the next Push. Catalogues are added and edited under **Shop → Suppliers**, which is where they belong.

A supplier with no catalogues recorded still gets a row, with the catalogue columns left blank - "none recorded yet" being rather more useful than a silent absence.

If your sheet was created before this tab existed, don't go looking for it: your next Push adds it, formatting and all, with nothing required from you.

### The web address column

The **slug** column is the last part of a product's web address - the `nice-blue-mug` in `yoursite.com/shop/nice-blue-mug`. Change it, Pull, and the product moves to the new address. Worth knowing before you do: anyone who bookmarked or linked to the old one lands on nothing.

A product row with no SKU is matched back to your site by its slug, so if you clear that cell on an existing product, the next Pull treats the row as a brand-new product and you end up with two of them. When in doubt, leave the column alone - everything else on the row still works.

### Numbers behave like numbers

Prices, stock counts, weights and the rest arrive as proper numbers, so you can sum a column, sort by price, or point a chart at it without Google treating it as text. SKUs and barcodes stay as text on purpose, because a code beginning with a zero would otherwise quietly lose it.

On the Variations tab, the **Image** column holds every picture a variant has, not only the first one. They sit in one cell separated by commas, in the order they show on the page, and the first one in the list is the one used as that variant's main picture. Add a comma and another address to give a variant a second picture; clear the cell to take its pictures away. A cell with a single address still works exactly as it did before, so an older sheet needs no attention. If anything in the cell isn't a proper web address, that row is reported back to you and its pictures are left untouched rather than half-changed.

A few things are deliberately left out, and are never touched by a sync (so they are safe, just not editable here):

- **Personalisation add-ons** (engraving text boxes, gift-message fields, and the like) aren't in the sheet.
- **Swatches** - the little colour or image chips on an option - aren't carried across for brand-new option values you create via the sheet. Add those in the admin.
- An option type created via the sheet defaults to a **dropdown**; change it in the admin if you want something else.

---

## If you make a mess of the header

The top row of each tab is the bit Pull relies on to know which column is which. It is protected with a gentle warning, but if it gets mangled beyond repair, use **Reset sheet** on the settings tab. That makes a fresh, clean sheet and points Cactus at it. Your old sheet stays in your Google Drive (you can bin it yourself), and a Push refills the new one.

---

## When Pull complains

Pull does two things, and they fail for completely different reasons: it fetches the two tabs from Google, then it compares them against your catalogue. It used to report both as "could not read the sheet", which sent more than one owner off rebuilding a spreadsheet that was perfectly fine. Now it tells you which half fell over:

- **"Could not read the Google Sheet"** followed by a reason - Google would not hand the tabs over. If the reason mentions a range it could not find, a tab has been renamed or deleted: put the **Products** and **Variations** names back, or use **Reset sheet** on the settings tab.
- **"Read the sheet fine, but comparing it with your catalogue failed"** - the sheet is not the problem and rebuilding it will not help. Something on your own site fell over mid-comparison. Try again in a minute; if it keeps happening, the reason on the end of that message is the thing to quote to us.
- **"Your site answered with an error"**, or **"It ran out of time"** - your site never got as far as an opinion. The first is a crash, the second is a very large catalogue taking longer than the minute it is allowed. Either way, nothing has been changed on your site.

---

## If it stops working after about a week

Almost always, this is the Testing-mode trap from the setup steps above: the consent screen was never published to production, so Google expired the connection after seven days. Publish it to "In production" and click **Reconnect Google**. That's it.

---

**Wiki:** [Home](Home) · [Shop](Shop) · [Shop variations](Shop-variations) · [Managing pages](Managing-pages) · [Modules](Modules) · [Configuration reference](Configuration-reference)
