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
2. Click **Create the sheet**. Cactus makes a fresh Google Sheet - always its own, never one you picked - with three tabs: **Products**, **Variations**, and a **Read me** with the short version of this page.

Once the sheet exists, the settings tab is done with its job. The day-to-day buttons - **Push**, **Pull**, **Open sheet** and the sync log - live on your **Products** page from now on, under a **Google Sheet** button next to New product. Settings stays as the one-off setup.

---

## Cost price - a quiet warning

Your product cost price is your supplier cost - your margin. If you push it to the sheet, anyone you share that sheet with can see it.

There is an **Include cost price** switch on the settings tab. It is on by default. Turn it off and Push again, and the cost price column disappears from the sheet entirely - so it can't be seen, and a later Pull can't blank it out.

---

## Pushing and pulling

You do both from your **Products** page: look for the **Google Sheet** button up by New product, and everything is on the little menu it drops down - Open sheet, Push, Pull, and Sheet logs. The button only appears once your sheet is set up, so a shop that isn't using this feature never sees it.

### Push to sheet (your site → the sheet)

Overwrites the sheet with whatever is currently on your website. This is how you get an up-to-date working copy before a big edit. The Products tab is filled first, then Variations.

### Pull from sheet (the sheet → your site)

This is the one to take a breath over, so it makes you look first. Choose **Pull from sheet** and Cactus reads the sheet and shows you a **preview**: how many products it will create, how many it will update, how many it will delete, any rows it can't make sense of, and - importantly - a named list of everything that is **"In the shop but not in your sheet."**

Nothing has changed at this point. When you are happy, press the button in the preview to actually do it.

### Watching it work, and picking up where it left off

Once you confirm, Pull shows you a live count as it goes - so many products of so many, then so many variations - rather than a spinner and a shrug. A big catalogue is done in stages, and you can leave the page open and watch it tick along.

If something interrupts it - you close the tab, your connection drops, a stubborn row trips it up - it doesn't lose its place. It stops exactly where it got to, and a **Continue** appears (on that same Google Sheet menu, and in the Pull window) to carry on from there rather than starting the whole thing over. Everything it does is safe to repeat, so continuing never doubles anything up. You can also just cancel and leave things as they are.

### Sheet logs

**Sheet logs** on the menu opens a window listing your recent Pushes and Pulls, with what each one changed - handy for a quick "did that last Pull actually land?" without leaving the Products page.

A few things the preview will tell you:

- **Products always sync before variations**, in both directions. A variant's parent product must already exist, or its rows are skipped.
- If you have edited products in the admin since you last pushed, the preview warns you - pulling would overwrite those admin edits with the (older) sheet.
- Rows with an obvious mistake (a missing name, a price that isn't a number, a made-up status) are listed as errors and skipped, rather than being guessed at.

### Rows you deleted from the sheet

The sheet is treated as the say-so on what should exist. **Delete a product's row, Pull, and that product is deleted from your site** - along with any of its size/colour variations. Delete just some of a product's variation rows and only those variations go; clear out all of a product's variation rows and it loses the lot.

Because this cannot be undone, the preview never hides it from you. Every product about to be deleted is listed by name under **"In the shop but not in your sheet"**, and the number of variations about to be removed is spelled out too. Nothing happens until you press the button, and if you change your mind you just put the row back in the sheet before you do.

One quiet safeguard worth knowing: Pull will only ever delete something that was in the sheet as of your **last Push**. So if you add a brand-new product in the admin and then Pull before you have Pushed it out to the sheet, Cactus won't mistake "not pushed yet" for "deleted" and bin it. (And on a sheet you have never Pushed to at all, Pull deletes nothing - it has no idea what was meant to be there.)

Past orders are never harmed by a deletion: an order keeps its own record of what was bought, even once the product itself is gone.

---

## What the sheet covers, and what it doesn't

The Products and Variations tabs cover the bulk of a catalogue: names, web addresses, prices (the main price plus the sale, retail and trade prices), stock, size and weight, categories, tags, collections, images and videos, SEO fields, pre-order settings, download rules for digital products, the related-products and upsell settings, and the size/colour options with their per-variant price, stock and SKU.

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

## If it stops working after about a week

Almost always, this is the Testing-mode trap from the setup steps above: the consent screen was never published to production, so Google expired the connection after seven days. Publish it to "In production" and click **Reconnect Google**. That's it.

---

**Wiki:** [Home](Home) · [Shop](Shop) · [Shop variations](Shop-variations) · [Managing pages](Managing-pages) · [Modules](Modules) · [Configuration reference](Configuration-reference)
