# Shop Variations

**Shop Variations** adds product options to your shop. It comes in two flavours, and you can use either or both on any product:

- **Variants** - fixed choices like Size and Colour, where each combination can have its own price, stock level, SKU, barcode, weight and photo. A "Red / XL" jumper and a "Blue / S" jumper are the same product to your customer, but you can price and count them separately behind the scenes.
- **Personalisation** - free-form extras the customer fills in: engraving text, a gift message, a paid gift-wrap tick-box, a dropdown of finishes, a date, or an uploaded file (artwork, a photo, a logo). You decide which are optional, which are required, and what each one adds to the price.

It needs the **Shop** module installed and up to date. Once both are in, you'll find a **Product options** entry in the Shop section of your admin sidebar.

## Adding options to a product

1. Open any product in your shop (Shop → Products → the product).
2. Scroll to the **Variations & personalisation** panel and click **Add options** (or **Manage variations** if it already has some).
3. Add an option - give it a name like "Size", pick how it should look on the page (a dropdown, a row of pills, or colour swatches), and type in the values (`S, M, L, XL`).
4. Add as many options as you need. Two options - say Size and Colour - give you every combination of the two.
5. Click **Generate variants**. Cactus creates one behind-the-scenes product for each combination, so the cart, checkout, stock and refunds all just work.

You'll then get a grid with one row per combination. Set each one's price, stock, SKU and photo, or use **Set all** to fill them in one go. Untick a row to hide that combination from the shop without deleting it.

Click the little square in a row's Photo column to pick that combination's photo from your media library, or upload a new one on the spot - the same picker you get on the product itself. The × beside it takes the photo off again. Whichever photo you pick gets filed into the product's own folder in your media library, alongside the product's main photos, so all of one product's pictures live together rather than scattered about.

Change your options later and hit **Generate variants** again - Cactus keeps the combinations you've already priced and only adds or removes the ones that changed.

### Renaming an option or a value

Settled on "Colour" and then decided it should say "Finish"? Click the name of any option, or any of its values, type the new one and press Enter. Escape backs out if you thought better of it.

Renaming a value tidies up after itself: the variants it appears in are relabelled to match, so nothing is left calling itself Red when it's now Crimson. Your prices, stock, SKUs and photos all stay exactly where they were - there's no need to generate the variants again. Orders already placed keep the name they were bought under, which is rather the point of an order.

Two options on the same product can't share a name, and neither can two values in the same option - Cactus will say so rather than let you build a product with two identical-looking choices.

## Adding personalisation

In the same editor, scroll to **Personalisation** and add a field. Pick the kind (short text, long text, number, dropdown, tick-box, date, or file upload), give it a label, and say whether it's required.

Each field can add to the price - a flat amount, an amount per character (handy for engraving), or a price per dropdown choice. Whatever the customer types or picks travels through to the order, the confirmation email, and your admin, so you know exactly what to make.

Uploaded files are kept safely and linked from the order. Abandoned uploads (ones that never became an order) are tidied away automatically after a while, so your storage doesn't fill up with orphaned artwork.

## On the shop page

Nothing to do. As soon as a product has options or personalisation, its page picks them up on its own: the option choosers and personalisation fields appear above the basket button, the price keeps up with what the customer has chosen, and the photo swaps when their choice has one of its own. The add-to-cart button stays put until they've made a valid, in-stock choice and filled in anything required, and combinations that are sold out or don't exist are greyed out with a note, so nobody adds something you can't send.

This happens on the standard product page layout you already have, and only on products that actually use options - everything else in your shop carries on exactly as before. You don't need to edit a layout or drag anything in.

If you'd rather build the page yourself, you still can. The **Variant Purchase** block does the lot in one, and there are five smaller blocks - options, personalisation, price, add-to-cart and gallery - that you can place independently and they'll stay in step.

## Reports and spreadsheets

- **Reports** (Product options → Reports) rolls your variant sales up under each parent product, with the best and slowest sellers, so you can see whether it's the small blue ones flying off the shelf.
- **Import / export** (Product options → Import) downloads every variant as a spreadsheet and lets you upload one back - one row per variant, with its options and price, stock, SKU, barcode and weight. Handy for a big price change or setting up lots of variants at once. Create the parent products in the shop first; the spreadsheet fills in their options and variants.

## Good to know

- A variant only appears through its parent product - it never turns up as its own item in the shop grid, search or sitemap.
- Personalisation prices are always worked out on our side at checkout, so nobody can tinker with the total.
- Removing this module leaves the behind-the-scenes variant products in place; tidy them up from the shop if you no longer want them.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Gazette](Gazette) · [Boards](Boards) · [Directory](Directory) · [Shop](Shop) · [Shop Variations](Shop-variations) · [Reply Catcher](Reply-catcher) · [Gemini Watermark Remover](Gemini-Watermark-Remover) · [Configuration reference](Configuration-reference)
