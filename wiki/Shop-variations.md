# Shop Variations

**Shop Variations** adds product options to your shop. It comes in two flavours, and you can use either or both on any product:

- **Variants** - fixed choices like Size and Colour, where each combination can have its own price, stock level, SKU, barcode, weight and photo. (The weight column only appears while the shop is charging postage by weight - that switch lives at the top of Shop → Tax & shipping.) A "Red / XL" jumper and a "Blue / S" jumper are the same product to your customer, but you can price and count them separately behind the scenes.
- **Personalisation** - free-form extras the customer fills in: engraving text, a gift message, a paid gift-wrap tick-box, a dropdown of finishes, a date, or an uploaded file (artwork, a photo, a logo). You decide which are optional, which are required, and what each one adds to the price.

It needs the **Shop** module installed and up to date. Once both are in, every product grows a **Variations** tab for editing its own options, your **Products** list (Shop → Products) grows a **Variations** tab that lists every variation across the whole shop in one place, and a **Variation tools** entry appears in the Shop section of your admin sidebar for reports and spreadsheet import.

## Adding options to a product

1. Open any product in your shop (Shop → Products → the product).
2. Go to its **Variations** tab. It sits right there on the product, alongside Details, Pricing and the rest - there's no separate screen to go off to any more, so you won't lose half-finished edits getting there.
3. Add an option with **Add from attributes**, and pick the attribute it should be built from - Size, Colour, Finish, whatever you've set up over on [Product Attributes](Product-attributes). Options always come from an attribute now, rather than being typed out product by product, so the same twelve finishes are one list everybody draws on instead of forty near-identical lists that drift apart the first time somebody spells "Grey" the other way. You still choose how it looks on the page (a dropdown, a row of pills, colour swatches, or image swatches), and tick only the values this product actually comes in - see [Building an option from a list you already have](#building-an-option-from-a-list-you-already-have) just below.
4. Add as many options as you need. Two options - say Size and Colour - give you every combination of the two.
5. Click **Generate variants**. Cactus creates one behind-the-scenes product for each combination, so the cart, checkout, stock and refunds all just work.

Changed your mind about how an option looks? Every option on the list has its own **Dropdown / Pills / Colour swatch / Image swatch** picker beside its name, so a Size you set up as a dropdown two months ago can become a row of pills this afternoon without deleting it and typing the values back in. Nothing else moves: the values, their order, and any colours or pictures already given to them are kept, so you can switch to pills and back to swatches and find your colours exactly where you left them.

You'll then get a grid with one row per combination. Set each one's price, stock, SKU and photo, or use the **Fill every row** boxes above the grid to do the lot in one go. Untick the **On sale** box to take that combination off sale without deleting it, tick **Image up front** or **3D up front** to put its photo or its model on the product page before anyone has chosen anything (see [below](#showing-off-a-finish-before-anyone-has-chosen)), or use the **Delete** button at the end of the row to be rid of it for good - handy when a big pile of options throws up combinations you'll never actually sell. To clear out a whole batch at once, tick the box at the start of each row you want gone (or the box in the header to select the lot), then press **Delete selected** - rather than working down the list one Delete at a time. When there are more columns than fit, the grid scrolls sideways and the first column, the one naming each combination, stays put so you never lose track of which row you're on.

The grid carries the same prices the rest of the shop does. Whichever extra price types you've switched on under **Shop → General** - sale, RRP, trade, cost - each gets its own column here, next to the ordinary price, so a variant can be on offer or carry its own cost figure without you having to think of it as a separate product. Switch one off in the settings and its column goes; the figures already typed are kept, waiting, in case you switch it back. Leave a box empty and that variant simply hasn't got one, which is a different thing from it being zero - an empty sale price means "not on offer", not "free". A variant with a sale price under its normal one is charged and shown at the sale price on the shop, with the normal figure struck through beside it, exactly as an ordinary product would be.

Because each variation now carries its own price, the product's own **Pricing** tab steps back: once it has variations, the price boxes there are put away behind a short note pointing you to this grid instead. A figure set on the product as a whole would never be shown to anyone - the shop prices the product from its variations - so there's nothing to fill in there and no risk of the two disagreeing. Anything already typed on that tab is kept, just not editable, so nothing is lost if the last variation is ever removed. Out on the shop - product pages, and every listing and grid of cards - a product whose variations differ in price shows as **From £** its cheapest one, rather than a single figure, so a shopper sees where it starts at a glance. Price every variation the same and the "From" is dropped: there's nothing to count up from, so the shop simply states the price, and it goes back to saying "From" the moment one combination costs more than another.

Edits to the grid are saved by the product's own **Save changes** button, along with everything else on the product - one button, one save, no wondering which bits went and which didn't. Rows you've touched are highlighted until they're saved, and the tab keeps an amber dot while anything is outstanding. Adding an option or generating the variants happens there and then, since those are jobs rather than typed-in details.

A really big set of options - hundreds of combinations - is built a batch at a time rather than all in one click, because each combination is a genuine behind-the-scenes product and there's a limit to how many can be made in one go. You still only press the button once: the count climbs as it works through the batches and stops when it's done. If you close the tab halfway, nothing is lost - the **Continue building options** button picks up exactly where it left off, and it only ever adds the combinations still missing, so anything you've already priced is left well alone.

If instead you change your options so there are now more combinations on the grid than your options call for, that same button becomes **Rebuild from options** - which keeps the combinations you've already priced and only adds or removes the ones that changed.

Click the little square in a row's Photo column to pick that combination's photos from your media library, or upload new ones on the spot - the same picker you get on the product itself. A combination can have as many photos as it deserves: the walnut version shot from the front, the side, and the back all belong to the walnut row. Pick several at once, or come back and add more later - clicking the square again adds to what's there rather than replacing it, and the same picture chosen twice only counts once.

The column has one row's worth of space, so it shows the first photo with a small **+2** (or +3, or however many) tucked in the corner to account for the rest. The × beside it clears the whole set for that row. Whichever photos you pick get filed into the product's own folder in your media library, alongside the product's main photos, so all of one product's pictures live together rather than scattered about. The picker opens in that same folder too, so the product's own pictures greet you first - though you can browse up and into any other folder, and the search box covers the whole library.

On the product page, choosing that combination puts all of its photos at the front of the thumbnail strip, in the order you added them, with the product's own pictures following on behind. The first one takes the main stage. So a customer who picks walnut gets the walnut photos to browse, not one walnut photo and then the oak ones.

### Showing off a finish before anyone has chosen

That leaves a slight shame: you photograph a desk in six finishes, and a shopper who has picked nothing sees only the one beige catalogue shot on the product itself. The good ones sit in the dark until somebody guesses their way to them.

So each row of the grid has two tick boxes: **Image up front** and **3D up front** - separate, because the combination with your best photo is not always the one with your best model, and you may only have one of the two to show off in the first place.

Tick **Image up front** and that combination's first photo joins the product's own gallery straight away, before anyone has touched an option, sitting behind the product's own pictures in the thumbnail strip. Tick it on three rows and all three turn up. The product's own photo still takes the main stage, so nothing is hijacked - the extra ones are simply there to be clicked.

Tick **3D up front** and the same thing happens for that combination's model, if it has one - with the [3D views](Product-3D-views) add-on installed, it joins the opening view behind the product's own model. A combination worth promoting for its model alone is fine too: tick just that box, and even with no photograph of its own the model still turns up.

The moment the shopper picks anything at all, whatever you've promoted drops out again. They've said what they want, and a rival finish loitering in the strip is only answering a question nobody asked. From that point the gallery behaves exactly as it always has: the chosen combination's own photos and model at the front, the product's own behind. Press **Reset options** and the promoted ones come back, since the shopper is browsing again rather than choosing.

Left unticked, which is how every row starts, nothing changes at all.

### Building an option from a list you already have

Typing "Black, Walnut, Oak, Ash, Beech" out again on the fortieth product is nobody's idea of a good afternoon. So the Variations tab doesn't ask you to: options are built from your [Product Attributes](Product-attributes), using the **Add from attributes** button.

You'll need Product Attributes installed for this, since it's what supplies the lists. Without it the Variations tab says as much and points you at setting your attributes up first, rather than offering a button with nothing behind it.

Click it and you get your attributes, in their groups, with a count of how many values each one holds. Pick one and you can:

- **Change the option's name.** It starts as the attribute's name, because that's usually right, but this product's dropdown can say "Finish" while the attribute stays "Colour". Your version sticks - see below.
- **Choose how it looks** - dropdown, pills, colour swatches or image swatches. Cactus has a guess ready: values with colours on them suggest colour swatches, values with pictures suggest image swatches.
- **Tick only the values you want.** Everything starts ticked, so bringing the whole lot across is one click, but a chair that only comes in three of your twelve finishes takes only those three.

The values are copied onto the product and are yours from that moment - rename them and reorder them as this product needs. Renaming a copy here changes only this product's copy; the attribute carries on as it was.

Adding a *new* value is the one thing that does travel back the other way. Type "Sage green" into an option's **Add value** box and it's added to the attribute behind it as well, so it's waiting on the list the next time any product wants it. That's rather the point: the value you met on this product is exactly the sort that turns up on the next one, and having to go and type it out a second time on the Attributes screen to make it reusable was a small daily tax nobody signed up for. If the attribute already has a value by that name, yours is quietly pointed at the existing one rather than making a second copy of it.

Two values on one option may share a name now - "Black" in melamine beside "Black" in fabric, told apart by their swatches and, behind the scenes, by each value's permanent slug (`black-mfc`, `black-fabric` - set on the [Product Attributes](Product-attributes) screen and carried through every spreadsheet as `(slug)Name`). On a swatch or picture control the shopper sees two different tiles and all is well; on a dropdown or pills, which show text only, two "Black"s would read identically - so the tab says so when it happens, with the slugs shown beside the offending values, and leaves the fix (a different control, or a rename) to you.

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

### Finding one combination in a big grid

Four options with five values each makes six hundred and twenty-five rows, and scrolling through them looking for the oak one in 1600mm is nobody's idea of an afternoon. So above the grid there's a row of dropdowns - one per option, in the order the shopper meets them, with the same value names. Pick a colour and the grid shows only that colour; pick a size as well and it narrows again. Leave an option on **Any** and it asks nothing.

The dropdowns tidy up after each other: once you've picked a size that only comes in two of your five finishes, the other three drop off the finish list rather than sitting there leading nowhere. **Show all** puts everything back, and the heading counts what you're looking at - "Variants (8 of 625)" - so a filtered grid never passes for the whole thing.

Two things follow the filter, deliberately. The tick box in the header selects the rows **shown**, not all six hundred, and **Fill the rows shown** does what its name says - which is rather the point, since "every row in oak, £340" is why you filtered in the first place. **Delete all** and **Rebuild from options** ignore the filter entirely; they were never about a subset.

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

### When two choices are the same product

Once in a while two choices describe the same thing. An office chair offering **Black back** or **Matching back** has, in black, exactly one chair to sell: its back is black, and it matches the black seat. Both wordings are honest, and neither is wrong.

Left alone that becomes a small trap. The one chair has to be filed under one of the two, so a customer who picked the other wording finds black greyed out - and greyed out reads as "we don't sell that", when in fact they were one word away from it.

So a variation can be told it also answers to a second choice. It stays filed where it is, with its own price, SKU, stock and photographs; it simply turns up under both wordings, and either route puts the identical thing in the basket. Nothing is duplicated, so there's no second stock figure to keep in step and no risk of the two drifting apart.

Two things it deliberately won't do. It never overrides a real variation: where a combination has one of its own, that one wins, and standing in only happens where there's genuinely nothing there. And it doesn't spread - only the variations you've named answer to the extra choice, so a colour that truly isn't sold with a matching back stays greyed out rather than quietly shipping something else.

There's no button for this on the Variations screen yet; ask and it can be set up for you. It also leaves your catalogue spreadsheet exactly as it is - one choice per column, same as always - so a Pull can't undo it.

## Adding personalisation

In the same editor, scroll to **Personalisation** and add a field. Pick the kind (short text, long text, number, dropdown, tick-box, date, or file upload), give it a label, and say whether it's required.

Each field can add to the price - a flat amount, an amount per character (handy for engraving), or a price per dropdown choice. Whatever the customer types or picks travels through to the order, the confirmation email, and your admin, so you know exactly what to make.

Uploaded files are kept safely and linked from the order. Abandoned uploads (ones that never became an order) are tidied away automatically after a while, so your storage doesn't fill up with orphaned artwork.

## On the shop page

Nothing to do. As soon as a product has options or personalisation, its page picks them up on its own: the option choosers and personalisation fields appear above the basket button, the price keeps up with what the customer has chosen, and the photo swaps when their choice has one of its own. The add-to-cart button stays put until they've made a valid, in-stock choice and filled in anything required. As the customer works down the choices, each chooser narrows to fit only the choices above it, never the ones below. So the last chooser shows just what's genuinely left to buy - dead ends and sold-out combinations drop out rather than sitting there greyed - but an earlier chooser never loses an option merely because the exact full combination the customer had in mind isn't one you offer. They can always go back and change a colour or a size without it vanishing under them. Change an earlier choice and the choices below it are kept wherever they still make sense - swap the colour and a size that's still on offer stays picked, rather than making the customer choose it all over again. Only the ones the new choice has actually ruled out give way, and even those aren't quietly binned: the now-impossible value stays on show, struck through and greyed, with a note explaining which earlier choice it clashes with. So the customer can see what changed and why, instead of watching a choice disappear and wondering where it went. And that chooser isn't left sitting empty in the meantime: it lands on the first choice still available to it, so the customer always has a whole, buyable combination in hand - the struck-through one stays on show as a reminder of what they'd had, while the price and the basket button carry straight on rather than waiting for them to pick a replacement.

If narrowing things down that way leaves a later chooser with only one genuine choice left, that one picks itself - the customer isn't made to click something when there's nothing to decide. Picking that value can in turn leave the chooser after it with only one option too, and so on down the row.

This happens on the standard product page layout you already have, and only on products that actually use options - everything else in your shop carries on exactly as before. You don't need to edit a layout or drag anything in.

The thumbnail strip under the photo now behaves the same here as everywhere else: with more photos than fit on one line, the row fades out at the edge and offers a small arrow to walk it along, with a matching arrow and fade appearing at the start once it has moved. Products with options had been quietly missing out on that, which was precisely the wrong way round - they tend to be the ones with the most photos to show. A shopper with no wheel or trackpad had nothing to click.

On a phone, the photo keeps the customer company while they choose. A product with options tends to have a long enough list of choices that the picture would normally scroll clean off the top - just as the customer starts changing the very thing the picture shows. So once it's about to disappear, the photo (or the 3D view, if the product has one) tucks itself in under your site's header and stays put - large, taking up most of the width, with two of the other photos stacked beside it and anything beyond those two scrolling within. Pick a colour and the pinned picture swaps along with it, which is rather the point. Scroll on past the choices and it lets go and leaves with them; scroll back up to the top and the page is exactly as it was. Bigger screens keep the arrangement they already had, where the photo and the choices sit side by side anyway.

The choosers arrive with the rest of the page, rather than turning up a moment after it. Up to and including version 0.1.6 they were fetched separately once the page had already appeared, so on a quiet shop that hadn't been visited for a while the customer could sit looking at a product they couldn't yet buy. They're now part of the page from the off.

Every option starts unchosen, and the page opens showing a **From** price - the cheapest combination you offer - so a shopper knows where the product starts before touching a single chooser. As soon as they've picked a full combination it settles to that combination's own price. Until version 0.1.12 the page helpfully picked a combination for the customer the moment it loaded - which sounds thoughtful right up until someone buys a medium in green because that's what was already sitting there when they reached the basket button. The choice is now theirs to make. Once they've picked something, a **Reset options** link appears to put everything back to blank, which saves a lot of clicking about on a product with several options. From version 0.1.14 it sits just to the right of the price, at a comfortable distance from it. Before that it lived under the last chooser, which is the one place nobody looks once they've finished choosing - the thing the link undoes is the price, so that's where it now waits. On a narrow screen it drops onto its own line rather than crowding the figure.

If you'd rather build the page yourself, you still can. The **Variant Purchase** block does the lot in one, and there are five smaller blocks - options, personalisation, price, add-to-cart and gallery - that you can place independently and they'll stay in step.

The **options** block has a few looks to choose from in the editor. By default every option's choices are on show at once, one under the next. Switch it to **Accordion** and each option folds into its own labelled section that the customer opens and closes, which keeps a product with a long list of options from running the page on forever. With the accordion picked, you decide how it opens: every section closed, just the first section open, or all of them open. Unless you've started with all of them open, you can also have each choice carry the customer along - leave the next section closed, open the next section as they go, or open the next and tidy the one they've just finished away behind them. Whichever you pick, the customer can always open and close any section by hand. One thing overrides your choice: when a customer follows a link that lands straight on a particular variation, every option is already answered for them, so the accordion opens all its sections regardless - it would be daft to greet them with the answers folded away.

Colour and image choices have a look of their own too. Left as they are, each shows as a pill carrying both the swatch and its name. Choose **Swatch only** and the name steps back to a small label that appears when the customer hovers over the swatch, leaving a tidy row of colours or pictures - handy when a product has a lot of them and the names would only crowd the page.

### Working through the choices

A product with five options is a small form, and a page that treats it as a loose pile of buttons leaves the customer to work out for themselves how far along they are. So the choosers now read as a sequence, and nothing about the way you set them up has to change - it applies to every product with options, on the standard layout and on one you've built yourself.

**Each option is numbered.** A circle sits in front of the option's name - 1, 2, 3 - and fills in once that option has been answered. It counts the options the customer can actually see, so an option you've set to appear only after the ones before it doesn't leave a gap in the numbering when it's still hidden.

**Choices that cost more say so.** Where an option genuinely changes the price, each of its choices carries the figure underneath: "180cm" with "from £246" under it. It only appears where there's something to tell - if every choice for an option costs the same, printing the same number four times helps nobody, so it stays quiet. "From" appears when that choice still leaves a range depending on what comes after it, and drops away when the choice pins the price exactly.

**The choice they've made is unmistakable.** A chosen value keeps its coloured outline, takes a light tint of your site's main colour, gains a small tick on its corner, and says **Selected** where the price used to be. At a glance, on a page with six options, the customer can see which rows they've answered and which they haven't.

**The basket button waits until they've finished.** It stays firmly off until every option has an answer - and rather than a vague "choose your options", it now names the ones still outstanding: "Choose Width and Storage first". That wording appears both as a tooltip when they point at the button and as a line of text under it, so it's there for someone on a phone as well. The moment the last option is answered, a green line appears above the button reading back exactly what they've built - "Ready to add: 140cm · 2 Drawer Fixed Pedestal · Black" - so the thing they're about to pay for is written down in words rather than left implied by which buttons happen to be lit.

**The picture says whose it is.** Once the whole combination is settled and the page is showing that combination's own photograph or its own 3D view, a small **Your choice** badge sits in the top-left corner of it. It's answering a question a configurator quietly raises: is this the thing I just built, or the one off the catalogue page? Click back to one of the product's general photos and the badge goes, because that one isn't theirs.

**Reset options really does reset.** As well as clearing the choices and the price, it now puts the picture back too - including the 3D view of the variation they'd configured, which used to stay up looking rather like a live choice long after the choices had gone. The page returns to how it looked when they arrived.

**And, for you alone, how many there are.** While you're signed in with Shop access, a small dashed box marked **staff only** sits under the basket button showing the chosen combination's actual stock - **Stock: 4** - rather than the cheerful "In stock" everyone else gets. It follows the choices, so it always belongs to the one currently in hand, and it says nothing at all until a full combination is settled, because until then there's no single number to give. Where a variation isn't counting its stock it says so plainly instead of leaving a blank. Customers see none of this, and the figures aren't sent to their browser either. Ordinary products without options get the same thing beside their badges - see the Shop page for that.

## On your category pages

A shopper scrolling a category sees a photo, a name and a price. What they don't see is that the chair comes in eleven colours, which is quite often the thing that would have made them click.

So each option now carries a tickbox: **Display in categories**. Tick it and that option summarises itself on the product's card wherever cards appear - your category pages, your shop home, the "you might also like" row, a featured collection. Colour and image swatches show as a small row of dots or thumbnails; dropdowns and pills show as a plain list of names separated by commas. Either way the option's heading goes in front, so nobody is left guessing what the row of dots is meant to be.

Two settings appear alongside the tick once it's on.

**Label.** What the option is called on a card, which needn't be what it's called on the product page. "Seat upholstery colour" is a perfectly good heading on a full product page and hopeless on a tile two inches wide, so put "Colour" here and the product page keeps its longer name. Leave the box empty and the card simply uses the option's own name.

**Swatches shown** (or **Options shown**, for dropdowns and pills). How many values appear before Cactus stops and adds a **+4** to say how many more there are. Eleven colours on a card is a wall of dots; a few and a "+6" tells the same story and leaves room for the price. Three ways to say it:

- **All of them** - every value, however many that turns out to be. Where it starts.
- **As many as fit on one line** (up to six lines, if you like your cards taller). Cactus fills exactly that many lines of the card and no more, keeping room for the **+4** marker at the end. The counting happens on the shopper's screen, so a wide card shows more swatches and a narrow one fewer, and the row never spills past the lines you chose - whatever size the card happens to be drawn at.
- **A number I type** - a fixed count, the same everywhere.

However many show, the first swatches always sit on the same line as the heading, with any spill carrying on underneath - the heading never sits alone on a line of its own.

One thing to do first, and only once for the whole shop: the summary needs somewhere to sit on the card, and where it sits is your decision rather than ours. Go to **Appearance → Layouts → Shop → Product Card** and drag the **Card: Variation options** piece into your card design - under the name reads well, or above the price. Publish it and every card in the shop follows suit. Until you do, ticking the box quietly changes nothing, which is why the Variations tab reminds you the moment you first tick one.

Options you leave unticked carry on exactly as before and never appear on a card, so a product with a Size, a Colour and three fitting choices doesn't turn its tile into a specification sheet. An option nobody has given any values to yet is skipped as well, rather than printing an empty heading and looking broken.

### Showing the photo for the one they're pointing at

A row of swatches tells a shopper the desk comes in walnut. It doesn't show them the walnut desk, which is the bit that actually sells it.

So the **Card: Variation options** piece carries a setting of its own: **Preview the photo when a shopper points at a value**. Turn it on (Appearance → Layouts → Shop → Product Card, click the piece, answer **Yes**) and the values stop being a list and start being something to point at. Hover 120cm and the card shows the 120cm desk. Move on to walnut and it shows the 120cm walnut one. Then a black frame, and there it is in 120cm, walnut, black frame. The choices build up as they go, so the picture is always the whole of what they've pointed at rather than just the last thing.

On a phone, where nothing hovers, a tap does the same job - and it stays put, so they can look properly rather than losing it the moment their thumb moves. Tap the same swatch again to let it go. Whichever value the picture is currently showing is marked, so nobody has to guess which walnut they're looking at.

If you have the 3D module, the little 3D icon comes along for the ride. Point at 120cm walnut, tap the icon, and the model that opens is the 120cm walnut one - the picture and the 3D view never disagree about which desk is being discussed.

A few honest limits. It can only show a photo that exists: a combination nobody has photographed shows the nearest one it does have rather than an empty box, giving up the last choice first, so pointing at a finish that doesn't come in the chosen width leaves the width showing. A product whose variations have no photos of their own carries on as a plain summary. And leaving the setting at **No** - which is where it starts, including on every card design you've already published - keeps the tile exactly as it is today, with no extra weight in the page.

## Browsing every variation

Your **Products** list (Shop → Products) has a **Variations** tab beside the usual list of products. It shows every variation across the whole shop in one place - a thumbnail, which product it belongs to, its options (like "Walnut / Large"), price, stock and SKU, and, if you have the 3D module, its 3D file.

- Pick a product from the **searchable dropdown** to narrow the list down to just that one.
- Use the **Nothing set** half of the filter to find the gaps: variations with no image, no SKU, or (with the 3D module installed) no 3D file - so you can spot at a glance the ones still waiting for a photo, a code or a model. Any extra columns your other add-ons contribute can be filtered on the same way.
- **Without SKU** is the one to reach for after a big import or a new range: it lists every variation nobody has given a code, which is what you want in front of you before the stock file arrives and starts looking for them. A SKU that's nothing but a space counts as not set, on the grounds that it isn't one.
- Use the **Broken links** half - **Lost image** and **Lost 3D file** - to find the opposite problem: a variation that still has a file recorded against it, but the file itself has gone. That's what you get when something is renamed, moved or deleted in the Media library after a product was pointed at it, and it's the sort of thing you'd otherwise only discover from a customer describing an empty grey box. Picking one of these checks the files there and then, so it takes a moment on a big shop and the answer is held for a few minutes afterwards. A spinner sits beside the filter while it's working, so you can tell the difference between "still checking" and "nothing found". It errs on the side of quiet: a file it can't get a straight answer about is left off the list rather than accused, so anything it does show you is worth looking at. A shop with thousands of pictures can run out of time before every last one has been checked - if that happens it says so underneath the filter, and narrowing to a single product first will get you through the rest.
- Where several products use the same extra column - an **Overall Height** attribute, say - you get one column and one filter entry for it, not one per product.
- It's a read-only overview: click a product's name to jump to its own Variations tab, which is where the actual editing happens.

Variation SKUs are also picked up by the **main Products list's own search box**, and by your storefront's search - typing a variation's code in either place takes you straight to the listing it belongs to. See "Adding products" in the Shop wiki page.

## Reports and spreadsheets

The **Variation tools** entry in your sidebar holds the shop-wide reports and the spreadsheet import. Editing still happens on each product's own Variations tab.

- **Reports** rolls your variant sales up under each parent product, with the best and slowest sellers, so you can see whether it's the small blue ones flying off the shelf.
- **Import / export** downloads every variant as a spreadsheet and lets you upload one back - one row per variant, with its options and price, stock, SKU, barcode and weight. The extra price types travel too: **Sale Price, RRP, Trade Price and Cost Price** each get their own column beside the ordinary price, so a big change to any of them is a spreadsheet job rather than a variant-by-variant one. A blank price cell means the variant simply hasn't got that figure; fill it in and upload to set it. Handy for a big price change or setting up lots of variants at once. Create the parent products in the shop first; the spreadsheet fills in their options and variants.

  Each option value travels as **`(slug)Name`** - `(black-mfc)Black`, say. The bit in brackets is the value's permanent slug from the Attributes screen; the bit after is what shoppers see. That's what lets two values both called "Black" (one melamine, one fabric) sit in the same column without ever being muddled: the slug says which is which, however the label reads. Uploading, the slug wins - change the name after the brackets and that value is renamed; use a slug the option hasn't seen and a new value is created under it. Plain cells without brackets still work exactly as they always did, so an old sheet imports unchanged.

  The export also carries a **Variant ID** column - each variation's permanent identity. Leave it alone and re-importing an edited file recognises every row even when you've reworded its option values: change "Red" to "Crimson" down the column and the import renames the value (or moves just the edited variations onto the new wording) instead of treating them as strangers and creating duplicates. Rows without an ID - a file from before the column existed, or a row you add by hand for a new variation - still match by their option values exactly as before.

  A choice the spreadsheet invents also reaches the Attributes screen now. Type a finish nobody has offered before into the sheet - "Beech & White", say - and it's added to the attribute the option was built from, exactly as if you'd typed it on the product's Variations tab, so it's on the list every other product picks from and shoppers can filter by it. Before this it landed on the one product and nowhere else, with no picture and no tie to the attribute, so it quietly sat out of the filters and had to be typed a second time on the Attributes screen to become reusable. If the attribute already has a choice by that name yours is pointed at that one instead of a second copy being made, and if the attribute can't take it at all the row is refused with an explanation rather than half-done.

  A rename from the spreadsheet also sorts out what the value is linked to. If the choice you've renamed it to is already on the Attributes screen, the copy on the product quietly re-links to that one and picks up its colour or picture, so a choice called Black is the attribute's Black and behaves like it from then on. Rename it to something the attribute has never heard of and the link is cut instead: the wording is yours, and nothing on the Attributes screen will come along later and overrule it. Previously the link stayed put wherever the name went, which is how a Black leg finish could end up wearing Silver's grey.

## Good to know

- A variant only appears through its parent product - it never turns up as its own item in the shop grid, search or sitemap.
- **VAT comes from the main product, not from each variation.** Whichever tax you pick on the product itself now applies to every one of its variations, and it keeps up on its own when you change it - including when the change arrives from a Google Sheet. There is no per-variation tax box to go hunting for, which is just as well, because there never was one. Until now a variation quietly kept whatever the tax happened to be on the day it was created, so a shop that sorted its VAT out afterwards could show a price with tax on the product page and then charge without it at the basket. Variations already on your site are put right for you.
- **You can link straight to a variation.** The web address a variation carries in the basket - the one with its colour and size in it - now opens the product page with exactly those choices already made, rather than the customer having to pick them all again. Drop that link in an email or an advert, or hand it to a customer, and whoever follows it lands on the right product already set to the right combination, price and photo and all. Until now those links led nowhere, which rather defeated the object.
- **Other blocks can follow the chosen variation.** The page now announces which variation the customer has settled on, so a block from another add-on can react to it - the delivery add-on's shipping options do exactly that, showing what every variation agrees on until a combination is chosen and then the real services for that one. Nothing to switch on: it happens by itself, and a shop without those add-ons carries on as before.
- **A listing is only sold out when every variation is.** If your shop is set to hide products that have sold out (**Settings → Shop → General → Out of stock products**), a listing with variations is judged on the whole set: one colour running out never takes the listing with it, and it disappears only when the picker on its page has nothing left to offer.
- **A choice that's simply run out now says so.** Where every version of a colour or size is off the shelf, hovering it reads **Out of Stock** rather than the old, rather unhelpful "unavailable" - which had customers assuming something was broken. A choice ruled out by an earlier pick still explains itself the way it always did, naming the clash or pointing at where the choice is to be had, because that isn't a stock problem and shouldn't pretend to be.
- **You can still pick a sold-out choice yourself.** Signed in with shop access, the picker lets you select combinations that are out of stock, so you can check a colour, show a customer the photos, or read the stock figure off the page. The basket button still refuses, and customers still can't get near it. A variation you've switched off stays off for everyone, yourself included - that one's your decision, not the warehouse's.
- Personalisation prices are always worked out on our side at checkout, so nobody can tinker with the total.
- **Deleting a product deletes its variations too.** Remove a product that carries variations and its behind-the-scenes variant products go with it, codes and all. They used to linger invisibly and sit on their codes, which then blocked those codes for anything you imported later.
- **A code that's already taken now says who has it.** If a spreadsheet import (or a Google Sheet Pull) tries to give a variation a code some other product already holds, the import carries on with everything else and reports the clash by row, naming the product in the way - rather than failing that variation quietly on every run.
- Removing this module leaves the behind-the-scenes variant products in place; tidy them up from the shop if you no longer want them.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Gazette](Gazette) · [Boards](Boards) · [Directory](Directory) · [Shop](Shop) · [Shop Variations](Shop-variations) · [Reply Catcher](Reply-catcher) · [Gemini Watermark Remover](Gemini-Watermark-Remover) · [Configuration reference](Configuration-reference)
