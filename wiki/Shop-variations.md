# Shop Variations

**Shop Variations** adds product options to your shop. It comes in two flavours, and you can use either or both on any product:

- **Variants** - fixed choices like Size and Colour, where each combination can have its own price, stock level, SKU, barcode, weight and photo. (The weight column only appears while the shop is charging postage by weight - that switch lives at the top of Shop → Tax & shipping.) A "Red / XL" jumper and a "Blue / S" jumper are the same product to your customer, but you can price and count them separately behind the scenes.
- **Personalisation** - free-form extras the customer fills in: engraving text, a gift message, a paid gift-wrap tick-box, a dropdown of finishes, a date, or an uploaded file (artwork, a photo, a logo). You decide which are optional, which are required, and what each one adds to the price.

It needs the **Shop** module installed and up to date. Once both are in, every product in your shop grows a **Variations** tab, and you'll find a **Product options** entry in the Shop section of your admin sidebar for the shop-wide overview, reports and spreadsheet import.

## Adding options to a product

1. Open any product in your shop (Shop → Products → the product).
2. Go to its **Variations** tab. It sits right there on the product, alongside Details, Pricing and the rest - there's no separate screen to go off to any more, so you won't lose half-finished edits getting there.
3. Add an option with **Add from attributes**, and pick the attribute it should be built from - Size, Colour, Finish, whatever you've set up over on [Product Attributes](Product-attributes). Options always come from an attribute now, rather than being typed out product by product, so the same twelve finishes are one list everybody draws on instead of forty near-identical lists that drift apart the first time somebody spells "Grey" the other way. You still choose how it looks on the page (a dropdown, a row of pills, colour swatches, or image swatches), and tick only the values this product actually comes in - see [Building an option from a list you already have](#building-an-option-from-a-list-you-already-have) just below.
4. Add as many options as you need. Two options - say Size and Colour - give you every combination of the two.
5. Click **Generate variants**. Cactus creates one behind-the-scenes product for each combination, so the cart, checkout, stock and refunds all just work.

Changed your mind about how an option looks? Every option on the list has its own **Dropdown / Pills / Colour swatch / Image swatch** picker beside its name, so a Size you set up as a dropdown two months ago can become a row of pills this afternoon without deleting it and typing the values back in. Nothing else moves: the values, their order, and any colours or pictures already given to them are kept, so you can switch to pills and back to swatches and find your colours exactly where you left them.

You'll then get a grid with one row per combination. Set each one's price, stock, SKU and photo, or use the **Fill every row** boxes above the grid to do the lot in one go. Untick the **On sale** box to take that combination off sale without deleting it, or use the **Delete** button at the end of the row to be rid of it for good - handy when a big pile of options throws up combinations you'll never actually sell. To clear out a whole batch at once, tick the box at the start of each row you want gone (or the box in the header to select the lot), then press **Delete selected** - rather than working down the list one Delete at a time. When there are more columns than fit, the grid scrolls sideways and the first column, the one naming each combination, stays put so you never lose track of which row you're on.

The grid carries the same prices the rest of the shop does. Whichever extra price types you've switched on under **Shop → General** - sale, RRP, trade, cost - each gets its own column here, next to the ordinary price, so a variant can be on offer or carry its own cost figure without you having to think of it as a separate product. Switch one off in the settings and its column goes; the figures already typed are kept, waiting, in case you switch it back. Leave a box empty and that variant simply hasn't got one, which is a different thing from it being zero - an empty sale price means "not on offer", not "free". A variant with a sale price under its normal one is charged and shown at the sale price on the shop, with the normal figure struck through beside it, exactly as an ordinary product would be.

Edits to the grid are saved by the product's own **Save changes** button, along with everything else on the product - one button, one save, no wondering which bits went and which didn't. Rows you've touched are highlighted until they're saved, and the tab keeps an amber dot while anything is outstanding. Adding an option or generating the variants happens there and then, since those are jobs rather than typed-in details.

A really big set of options - hundreds of combinations - is built a batch at a time rather than all in one click, because each combination is a genuine behind-the-scenes product and there's a limit to how many can be made in one go. You still only press the button once: the count climbs as it works through the batches and stops when it's done. If you close the tab halfway, nothing is lost - the **Continue building options** button picks up exactly where it left off, and it only ever adds the combinations still missing, so anything you've already priced is left well alone.

If instead you change your options so there are now more combinations on the grid than your options call for, that same button becomes **Rebuild from options** - which keeps the combinations you've already priced and only adds or removes the ones that changed.

Click the little square in a row's Photo column to pick that combination's photos from your media library, or upload new ones on the spot - the same picker you get on the product itself. A combination can have as many photos as it deserves: the walnut version shot from the front, the side, and the back all belong to the walnut row. Pick several at once, or come back and add more later - clicking the square again adds to what's there rather than replacing it, and the same picture chosen twice only counts once.

The column has one row's worth of space, so it shows the first photo with a small **+2** (or +3, or however many) tucked in the corner to account for the rest. The × beside it clears the whole set for that row. Whichever photos you pick get filed into the product's own folder in your media library, alongside the product's main photos, so all of one product's pictures live together rather than scattered about. The picker opens in that same folder too, so the product's own pictures greet you first - though you can browse up and into any other folder, and the search box covers the whole library.

On the product page, choosing that combination puts all of its photos at the front of the thumbnail strip, in the order you added them, with the product's own pictures following on behind. The first one takes the main stage. So a customer who picks walnut gets the walnut photos to browse, not one walnut photo and then the oak ones.

### Building an option from a list you already have

Typing "Black, Walnut, Oak, Ash, Beech" out again on the fortieth product is nobody's idea of a good afternoon. So the Variations tab doesn't ask you to: options are built from your [Product Attributes](Product-attributes), using the **Add from attributes** button.

You'll need Product Attributes installed for this, since it's what supplies the lists. Without it the Variations tab says as much and points you at setting your attributes up first, rather than offering a button with nothing behind it.

Click it and you get your attributes, in their groups, with a count of how many values each one holds. Pick one and you can:

- **Change the option's name.** It starts as the attribute's name, because that's usually right, but this product's dropdown can say "Finish" while the attribute stays "Colour". Your version sticks - see below.
- **Choose how it looks** - dropdown, pills, colour swatches or image swatches. Cactus has a guess ready: values with colours on them suggest colour swatches, values with pictures suggest image swatches.
- **Tick only the values you want.** Everything starts ticked, so bringing the whole lot across is one click, but a chair that only comes in three of your twelve finishes takes only those three.

The values are copied onto the product and are yours from that moment - rename them and reorder them as this product needs. Renaming a copy here changes only this product's copy; the attribute carries on as it was.

Adding a *new* value is the one thing that does travel back the other way. Type "Sage green" into an option's **Add value** box and it's added to the attribute behind it as well, so it's waiting on the list the next time any product wants it. That's rather the point: the value you met on this product is exactly the sort that turns up on the next one, and having to go and type it out a second time on the Attributes screen to make it reusable was a small daily tax nobody signed up for. If the attribute already has a value by that name, yours is quietly pointed at the existing one rather than making a second copy of it.

### Using the same attribute twice on one product

A chair whose frame and seat are both sold in your twelve finishes wants that one Colour attribute twice, not two near-identical attributes set up side by side. So you can add the same attribute to a product as many times as it earns its keep.

The one rule is the one that was always there: two options on a product can't share a name, or the shopper meets two identical-looking dropdowns and your spreadsheet exports have nothing to tell them apart by. So the first helping can happily be called "Colour", and every one after it needs a name of its own - "Frame colour", "Seat colour", "Piping".

The picker makes this easy rather than obstructive. Attributes already on the product say **Already added as "Colour"** underneath, so you know before you click. Pick one of those and the name box starts empty instead of pre-filled with a name that's already spoken for, with a line explaining why. Type the name you want and **Add option** wakes up. Type one that's already in use and it says so on the spot, rather than after the click.

Each helping is its own option from then on: its own values, its own ticked subset, its own look. Bring five finishes across for the frame and three for the seat if that's what you sell. And your names stick - a "Seat colour" option built off the Colour attribute is never nagged about the attribute calling itself Colour, because you renamed it on purpose and Cactus can tell the difference between your decision and a drift.

Values you typed in here are treated like any other, since they're on the attribute too - rename one on the Attributes screen and this copy follows. Values typed in before this became the way of things have no attribute behind them, and those are left alone, always. **Your option name is never overwritten.** If you renamed it to "Finish", it stays "Finish", and Cactus never starts calling it by the attribute's own name instead.

If you uninstall Product Attributes, the options themselves carry on working perfectly well. They're your own copies.

### Where an option came from

Under the name of any option built from an attribute you'll see a quiet line saying so - **From attributes: Upholstery Colour**. Handy when the option is called something else on this product, which is exactly when you'd otherwise have no way of telling what it's tied to.

If the attribute behind it has since been deleted, the line says that instead.

### Adding a few more values later

The attribute might list twenty-two colours and this chair only come in four of them, so next to the box where you type a value, a sourced option also offers **Add from source**, with the number of values the attribute has that this option hasn't taken yet.

Open it, tick the ones you want, add them. The rest stay out of it. If the attribute has nothing left to offer, the button isn't there at all, which is its own small answer to "am I missing anything?".

One thing it won't do is add a value whose name that option already carries - two values with the same name make the combination names ambiguous. It skips those and tells you which.

A sourced value's swatch picture stays filed with the attribute it came from, under **Shop → Attributes** in your media library - it isn't copied or moved into the product's own folder. The same oak picture serves every product built from that attribute, so there's exactly one of it, in one sensible place. Only pictures for values you type in by hand on a product go into that product's **colours** folder.

### Renaming the attribute, or one of its values

Rename an attribute over on the Attributes screen and every option built from it follows suit, on every product, without you visiting any of them. The exception is an option you deliberately renamed here: that one keeps your name, because that's what overriding it was for.

Edit one of its *values* - a new label, a new colour, a new picture - and the same thing happens a level down. Every copy of that value updates, and the combinations built on it are re-named to match, so you aren't left with a "Small / Oak" that nobody calls oak any more. A copy is skipped only where this option already has a value by that name, since two of those would make the combination names ambiguous; Cactus says which product that was.

Values typed in here go onto the attribute as well, so they follow along with the rest. Only the older hand-typed ones, from before that was the case, are copies of nothing and are never touched. See [Product Attributes](Product-attributes) for the full account.

If you've switched suppliers on in **Shop → Settings → General** and set them to cover variations as well as products, the grid gains a supplier column too. It's a dropdown of your supplier list rather than a free-text box, and it ends with **Add a new supplier** for the ones you haven't got round to recording yet. Useful when the red ones come from one place and the blue ones from another.

### Other modules can add columns here

Some modules add a column of their own beside Photo, for things that belong to one combination rather than to the product as a whole. If you have [Product 3D views](Product-3D-views) installed, that is where its **3D** column turns up: drop a model file onto a row and that combination has one. If you have [Product Attributes](Product-attributes) installed and tick **Use for variations** on an attribute, it adds a column here too, so each combination can carry its own Colour, Material or the like.

Columns like these save as soon as you use them, rather than waiting for **Save changes** with the rest of the grid. They deal in uploaded files, and a file has either arrived or it hasn't. If you have no such modules, you simply won't see any extra columns.

### Renaming an option or a value

Settled on "Colour" and then decided it should say "Finish"? Click the name of any option, or any of its values, type the new one and press Enter. Escape backs out if you thought better of it.

### Putting them in order

The order your options and their values appear in is the order the customer meets them on the product page, so it's worth getting right - Size before Colour, or your sizes running S, M, L rather than however they happened to be typed in.

Each option and each value now carries a little grip handle (the dots to its left). Drag an option by its handle to slot it above or below another, and drag a value by its handle to move it along its own row. Values stay within their own option - you can't accidentally fling "Large" into your list of colours. The new order is saved as you drop, and the storefront follows suit; there's nothing to press afterwards. A handle only appears once there's more than one thing to shuffle, since a single option has nowhere to go.

The grid of variations underneath reshuffles to match. Previously it kept whatever order it was built in, so after a drag the rows and the options above them told two different stories until you rebuilt the matrix - which was a lot to ask for what should be a tidying-up job. Nothing is rebuilt now: every variation keeps its own stock figure, price, photographs and code, and anything already ordered is untouched. Only the running order changes. Moving whole options about also re-words the variation names to match, so shifting Colour above Size turns "Dining chair - Small / Oak" into "Dining chair - Oak / Small".

### Revealing options in order

Sometimes a later choice only makes sense once earlier ones are made - pick the frame before the glass, the model before the trim. From the second option down, each one carries a tickbox: **Only show once every option above it is chosen**. Tick it and that option stays out of sight on the product page until the customer has picked every option that comes before it, so they meet the choices one at a time instead of all at once. It waits for *all* of them, not just the one immediately above - a fourth option set to wait won't appear until the first three are all filled in.

The first option never gets the tickbox, since there's nothing before it to wait on. The tick only hides the option until its turn comes - it doesn't change the combinations, the prices or anything a customer can eventually buy; it just keeps the page from showing every choice at once when they'd rather be led through them. Drag an option that had the tick set up to the top and it quietly stops hiding, on the same "nothing before it" logic.

### Changing a swatch colour

Picked a red, then found out the actual red? Click the coloured dot next to any swatch value. The picker and the hex box both open, so you can nudge it by eye or paste in the code you were given. The tick saves it, Enter does the same, and Escape leaves it as it was. A value that never got a colour shows a dotted outline instead of a dot - click that to give it one.

### Image swatches

Some choices simply aren't a colour. An oak worktop, a herringbone weave, a marble finish - describing any of those with a single hex code is a losing battle, and "Walnut" in a dropdown asks the customer to already know what walnut looks like.

So pick **Image swatch** as the option's type and each value carries a picture instead of a dot. Add your values as usual (`Oak, Walnut, Ash`), then click the dotted square beside each one to give it its picture: choose one you've already got in your media library, or upload it there and then. Click the picture again later if you'd rather use a different one. If the picture is already sitting on your desktop, you can skip the library altogether and drag it straight onto the dotted square - it uploads on the spot, same as dropping a photo onto a variant row.

On the product page each value shows as a thumbnail with its name beside it. The name stays put on purpose - a picture answers "which one is that?" but only the name answers "what's it called?", and a customer who can't see the picture is left with nothing at all otherwise. Hover the thumbnail, or tap it on a phone, and the full picture pops up at a proper size so the grain or the weave is actually visible before anyone commits. Peeking is deliberately kept off the choosing itself - the picture zooms, the name beside it chooses - so a good look never lands a colour in the basket by accident.

A value you haven't given a picture to yet just shows its name, so an option half-way through being set up looks unfinished rather than broken.

Renaming a value tidies up after itself: the variants it appears in are relabelled to match, so nothing is left calling itself Red when it's now Crimson. Your prices, stock, SKUs and photos all stay exactly where they were - there's no need to generate the variants again. Orders already placed keep the name they were bought under, which is rather the point of an order.

Two options on the same product can't share a name, and neither can two values in the same option - Cactus will say so rather than let you build a product with two identical-looking choices.

## Adding personalisation

In the same editor, scroll to **Personalisation** and add a field. Pick the kind (short text, long text, number, dropdown, tick-box, date, or file upload), give it a label, and say whether it's required.

Each field can add to the price - a flat amount, an amount per character (handy for engraving), or a price per dropdown choice. Whatever the customer types or picks travels through to the order, the confirmation email, and your admin, so you know exactly what to make.

Uploaded files are kept safely and linked from the order. Abandoned uploads (ones that never became an order) are tidied away automatically after a while, so your storage doesn't fill up with orphaned artwork.

## On the shop page

Nothing to do. As soon as a product has options or personalisation, its page picks them up on its own: the option choosers and personalisation fields appear above the basket button, the price keeps up with what the customer has chosen, and the photo swaps when their choice has one of its own. The add-to-cart button stays put until they've made a valid, in-stock choice and filled in anything required. As the customer works down the choices, each chooser narrows to fit only the choices above it, never the ones below. So the last chooser shows just what's genuinely left to buy - dead ends and sold-out combinations drop out rather than sitting there greyed - but an earlier chooser never loses an option merely because the exact full combination the customer had in mind isn't one you offer. They can always go back and change a colour or a size without it vanishing under them. Change an earlier choice and the choices below it are kept wherever they still make sense - swap the colour and a size that's still on offer stays picked, rather than making the customer choose it all over again. Only the ones the new choice has actually ruled out give way, and even those aren't quietly binned: the now-impossible value stays on show, struck through and greyed, with a note explaining which earlier choice it clashes with. So the customer can see what changed and why, instead of watching a choice disappear and wondering where it went.

If narrowing things down that way leaves a later chooser with only one genuine choice left, that one picks itself - the customer isn't made to click something when there's nothing to decide. Picking that value can in turn leave the chooser after it with only one option too, and so on down the row.

This happens on the standard product page layout you already have, and only on products that actually use options - everything else in your shop carries on exactly as before. You don't need to edit a layout or drag anything in.

The thumbnail strip under the photo now behaves the same here as everywhere else: with more photos than fit on one line, the row fades out at the edge and offers a small arrow to walk it along, with a matching arrow and fade appearing at the start once it has moved. Products with options had been quietly missing out on that, which was precisely the wrong way round - they tend to be the ones with the most photos to show. A shopper with no wheel or trackpad had nothing to click.

On a phone, the photo keeps the customer company while they choose. A product with options tends to have a long enough list of choices that the picture would normally scroll clean off the top - just as the customer starts changing the very thing the picture shows. So once it's about to disappear, the photo (or the 3D view, if the product has one) tucks itself in under your site's header and stays put at half width, with the other photos in a small four-square grid beside it - anything beyond four scrolls within the grid. Pick a colour and the pinned picture swaps along with it, which is rather the point. Scroll on past the choices and it lets go and leaves with them; scroll back up to the top and the page is exactly as it was. Bigger screens keep the arrangement they already had, where the photo and the choices sit side by side anyway.

The choosers arrive with the rest of the page, rather than turning up a moment after it. Up to and including version 0.1.6 they were fetched separately once the page had already appeared, so on a quiet shop that hadn't been visited for a while the customer could sit looking at a product they couldn't yet buy. They're now part of the page from the off.

Every option starts unchosen, and the page opens showing the product's own price. Until version 0.1.12 the page helpfully picked a combination for the customer the moment it loaded - which sounds thoughtful right up until someone buys a medium in green because that's what was already sitting there when they reached the basket button. The choice is now theirs to make. Once they've picked something, a **Reset options** link appears to put everything back to blank, which saves a lot of clicking about on a product with several options. From version 0.1.14 it sits just to the right of the price, at a comfortable distance from it. Before that it lived under the last chooser, which is the one place nobody looks once they've finished choosing - the thing the link undoes is the price, so that's where it now waits. On a narrow screen it drops onto its own line rather than crowding the figure.

If you'd rather build the page yourself, you still can. The **Variant Purchase** block does the lot in one, and there are five smaller blocks - options, personalisation, price, add-to-cart and gallery - that you can place independently and they'll stay in step.

## Reports and spreadsheets

The **Product options** entry in your sidebar is where the shop-wide views live. Editing still happens on each product's own Variations tab.

- **Product options** lists every product that has options or personalisation, with its counts, and **Manage** drops you straight onto that product's Variations tab.
- **Reports** (Product options → Reports) rolls your variant sales up under each parent product, with the best and slowest sellers, so you can see whether it's the small blue ones flying off the shelf.
- **Import / export** (Product options → Import) downloads every variant as a spreadsheet and lets you upload one back - one row per variant, with its options and price, stock, SKU, barcode and weight. Handy for a big price change or setting up lots of variants at once. Create the parent products in the shop first; the spreadsheet fills in their options and variants.

## Good to know

- A variant only appears through its parent product - it never turns up as its own item in the shop grid, search or sitemap.
- Personalisation prices are always worked out on our side at checkout, so nobody can tinker with the total.
- Removing this module leaves the behind-the-scenes variant products in place; tidy them up from the shop if you no longer want them.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Gazette](Gazette) · [Boards](Boards) · [Directory](Directory) · [Shop](Shop) · [Shop Variations](Shop-variations) · [Reply Catcher](Reply-catcher) · [Gemini Watermark Remover](Gemini-Watermark-Remover) · [Configuration reference](Configuration-reference)
