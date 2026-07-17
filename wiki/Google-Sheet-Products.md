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

Everything lives under **Settings → Google Sheet** (a tab alongside your other site settings).

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
3. Use the link on the settings tab to open it whenever you like.

---

## Cost price - a quiet warning

Your product cost price is your supplier cost - your margin. If you push it to the sheet, anyone you share that sheet with can see it.

There is an **Include cost price** switch on the settings tab. It is on by default. Turn it off and Push again, and the cost price column disappears from the sheet entirely - so it can't be seen, and a later Pull can't blank it out.

---

## Pushing and pulling

### Push to sheet (your site → the sheet)

Overwrites the sheet with whatever is currently on your website. This is how you get an up-to-date working copy before a big edit. The Products tab is filled first, then Variations.

### Pull from sheet (the sheet → your site)

This is the one to take a breath over, so it makes you look first. Click **Pull from sheet** and Cactus reads the sheet and shows you a **preview**: how many products it will create, how many it will update, any rows it can't make sense of, and - importantly - a list headed **"In the shop but not in your sheet."**

Nothing has changed at this point. When you are happy, press the button in the preview to actually do it.

A few things the preview will tell you:

- **Products always sync before variations**, in both directions. A variant's parent product must already exist, or its rows are skipped.
- If you have edited products in the admin since you last pushed, the preview warns you - pulling would overwrite those admin edits with the (older) sheet.
- Rows with an obvious mistake (a missing name, a price that isn't a number, a made-up status) are listed as errors and skipped, rather than being guessed at.

### Rows you deleted from the sheet

If you delete a product's row from the sheet, Cactus does **not** delete the product - deleting something with order history on the strength of a spreadsheet edit is not a risk worth taking. Instead, those products appear in the preview under "In the shop but not in your sheet", and are **left completely alone by default.**

If you genuinely want to retire one, tick it in the preview and Cactus will **archive** it - which is reversible, keeps all its order history, and simply takes it off sale. It is never permanently deleted.

---

## What the sheet covers, and what it doesn't

The Products and Variations tabs cover the bulk of a catalogue: names, prices, stock, categories, tags, collections, images and videos, SEO fields, and the size/colour options with their per-variant price, stock and SKU.

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
