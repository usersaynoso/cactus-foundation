# Modular Configurator

The **Modular Configurator for Shop** module (`modular-configurator-for-shop`) lets a shopper build a layout out of a modular product's units - a sofa that turns a corner, a run of bench seating - in 3D on the product page, see how much floor it takes, and put the whole arrangement in the basket in one go.

It needs the Shop, Shop Variations and Product 3D Views modules. It works on the variations and models a product already has: a unit is simply one value of one option ("Unit: Left Unit, Central Unit, Corner Unit, Right Unit"), and every unit in a layout is sold as the real variation it is, at its own price.

## Setting it up

1. **Place the block.** Put **Shop: Layout builder tabs (modular products)** in the product page layout, straight after the short description, and drag the page's options, price, delivery options and Add to basket into its **Shop individual items** space. Anything that belongs under both tabs - accessories, the delivery and returns links - goes after the block. On a product without the builder the block shows what is in its space and nothing else, so the shared product layout is the right home for it.
2. **Switch it on for the product.** On the product's edit screen, open the **Layout builder** panel and tick **Show the layout builder on this product**.
3. **Say which option holds the units.** Every other option - fabric, frame and so on - is chosen once for the whole layout, and can be changed unit by unit.
4. **Describe each unit**, always as you see it standing in front of it - the way the product photographs and the 3D view show it:
   - **How it joins**:
     - no arms (joins on both sides), with a back or without one;
     - arm on the left (starts a row), arm on the right (finishes a row), or arms both sides (stands alone);
     - a corner. A corner's "second back" is the backrest down one side - say which side it is on;
     - a **curve** - a quarter of a circle. Say where its back is: on the **outside** (the seats face in, and three make a booth), on the **inside** (the seats face out, and four make a round island), or **no back** (it bends whichever way the layout needs, and the shopper can turn it round);
     - a **rounded end** (a "D end") - joins the end of one row to the end of the row sat back to back with it. Two rounded ends and two rows make a capsule island.
   - **Sizes** in millimetres. For most units, the width and depth of the footprint. For a curve, its size from the outside (the width and depth of the whole quarter circle) and its seat depth, which should match the units it joins. For a rounded end, the flat side is the width and how far the rounded part sticks out is the depth. Where the unit's specification has an Overall Width and Overall Depth, they are filled in for you and a button offers them again if you change them.
   - **3D model**: leave it on **Work it out from each model**. Supplier model files face all sorts of ways - often differently between a unit's own variations, a high back one way and a low back another - so the builder looks at each file as it loads and turns it to match the shape you described. Pick a turn yourself only if a unit still arrives the wrong way round.
5. **Ready-made layouts are optional.** Write your own - a name and the units in the order they join, drawn beside it so a layout that cannot be built says so before you save. Write none and shoppers are offered a pair, a row of three, an L-shape, a U-shape, a booth, a round island and a capsule island, made from your units wherever the range can make them.

**Getting a corner the right way round.** If a corner in the 3D view has its backs on the inside of the L, the second-back side is set the wrong way: change it on the Layout builder panel. The same goes for a curve with its back on the wrong side - it is set as the other kind of curve.

## What the shopper sees

- **Two tabs under the short description**: **Shop individual items** on the left and **Build a layout** on the right (rename either on the block).
  - The page opens on **Shop individual items**, so adverts and shared links land on the unit and price that was clicked. Only a layout link opens on **Build a layout**.
  - A fabric or frame chosen in either tab is chosen in the other.
- **Build a layout** starts with the ready-made shapes drawn to scale, each priced in the options already chosen, and **Design your own**. Choosing one starts the builder - the 3D view only loads at that point:
  - **The product picture becomes the layout.** The gallery's main picture shows the layout, a **Your layout** thumbnail leads the strip, and the photographs stay in the strip underneath. Clicking a photo shows that photo; changing the layout brings the layout back up. Switching to **Shop individual items** gives the gallery back to the photos. On a phone the pinned gallery keeps the layout in sight while the controls scroll beneath it, covering the product tab row while it is pinned. A page layout with no gallery shows the view inside the tab instead, and that view pins in the same place.
  - **The view**: the 3D model, or **Plan** for the same layout from above with numbered units, with **Sizes** marking the overall width and depth. Tap a unit to select it; tap a dashed space to add a unit there. Hovering a unit shows a red cross to take it out; where a dashed space's + sits over that same unit (the space just inside an arm unit), the cross moves up and back out of its way, and the + always wins a tap where the two meet. The plan does everything the 3D view does, by keyboard.
  - **Adding a unit** lists every unit type with its price. Ones that cannot go at that end stay in the list, greyed out, saying why ("Its arm would face into the layout", "No room - it would overlap").
  - **Front units**: where a backed straight unit can take a backless cube or ottoman in front of it, the selected unit offers that as an extra position. It is counted, priced, shared and bought as one more real unit in the layout, just not one that extends the main row.
  - **Growing a finished shape.** A ready-made sofa ends in arms at both ends, and still has a dashed space at each: a unit added there goes just inside the arm unit, and the arm unit slides out to stay at the end.
  - **Design your own** opens straight onto **Choose your first unit**.
  - **A selected unit** can be swapped for another type that still fits, given a fabric (or any other option) of its own, or taken out - the units either side close up. A curve with no back can also be **curved the other way**.
  - **Units that are not made in every option.** The layout's options apply to every unit that is made in them. A unit that is not - a backless unit that only comes in a standard back, in a layout chosen in a high back - is matched to the nearest combination it is made in, and its row in the list says what it is in. The option then reads "High Back wherever a unit comes in it" rather than "every unit", and the unit's own panel offers "Closest it comes in" in place of "Same as the layout".
  - **Choices that cannot be made are crossed out and cannot be picked.** In a unit's own panel, any value that unit does not come in (keeping the other choices it has made for itself) is crossed out in the dropdown, and choosing it does nothing. On the layout's own options, a value is crossed out only when no unit in the layout comes in it at all; if even one does, it can be chosen and applies wherever it is made.
  - **Undo** and **Reset layout** (empties the layout and goes back to the ready-made shapes, with a **Back to your layout** link to undo the reset; a product with no shapes goes straight to the first unit), and the layout's own options (fabric, frame) with swatches.
  - **The price**, set exactly like the individual tab's - the layout's total, the RRP where every unit has one, the tax wording - with **Reset options** beside it, which also goes back to the ready-made shapes.
  - **Delivery**, in the same box and "Switch to" chips as the individual tab. The services on offer are the ones every unit in the layout can have; each is dated by the unit that arrives last, and priced **per item** ("+£25.95 per item"), with the total for the layout written underneath. The choice goes onto every unit in the basket, where it is charged per item exactly as the basket always does. It is worked out by asking the basket itself, so it can never quote something the basket will not charge.
  - **The buy row**: a quantity for how many of the layout, and **Add layout to basket**, styled like the individual tab's. A unit that cannot be bought in the chosen combination is named, and the button waits.
- **Nothing jumps.** Adding to either end, swapping or removing re-lays the layout around the units the shopper already had, so what they were looking at stays put.
- **The link reopens the layout.** It is written into the address as the shopper builds (`?modular-layout=…`), so a shared or bookmarked link opens on the same units, in the same order, with the same choices.

### How units go together

Walking a layout from its first unit to its last is walking each straight run from its left end to its right end, as seen standing in front of the seats. So a unit with an arm on its left can only start a layout, and one with an arm on its right can only finish it. A corner always turns towards the seats' front, and the unit added after it lands against the corner's open side with its back in line with the corner's second back - never off the end of the row, never behind it.

A curve with its back outside turns towards the seats' front like a rounded corner; one with its back inside turns away from it. A curve with no back goes in the usual way (towards the front) where it fits and the other way round where only that fits. A rounded end turns the row right round, so the next unit sits back to back with the one before it. When the last unit meets the first all the way round - a round island, a capsule - the layout has no ends left, and the builder stops offering spaces to add to. Units are checked for overlap by their real outlines, so a unit can sit in the empty corner of a curve's square without being refused.

The link code marks a curve laid the other way round with `~flip` after its name; older links without it open exactly as before.

## Linking another product to the builder

A ready-made set - a capsule island, an L-shaped sofa - is usually sold as its own product, but made from the same units as the range that has the builder. It can send shoppers there with a line under its short description: "Need a custom layout? **Click to create your own layout**".

1. **Place the block.** Put **Shop: Build your own layout link (modular products)** in the product page layout, straight after the short description. Products without a link show nothing there, so the shared layout is fine.
2. **Set up the link on the set.** On the set's edit screen, open **Layout builder**, then **Link to a layout builder on another product**:
   - **Link to the layout builder on** - pick the product with the builder. Only products with their builder switched on are offered.
   - **Words before the link** (blank for none), **The link**, and **Open it in a new tab**.
   - **Starting layouts** - the layout the builder opens on, built from that product's units and drawn beside it so one that cannot be built says so before you save. **Used when** is either **Whatever is chosen** or one of the set's own choices, so an 8 seater and a 10 seater can each open on their own number of seats, or a left-arm sofa on a left-arm layout. The first layout matching what the shopper has chosen wins; otherwise the "whatever is chosen" one; with neither, the link opens the builder's product page as it is.
3. **Save link.** Choosing **No link** and saving takes it off.

**Choices travel with the shopper.** A choice made on the set goes across when the builder's product offers it too - an option of the same name with the same value, or, where the names differ ("Back Height" on the set, "Back" on the range), the one option that has a value of the same name. A value two options could both mean is left behind rather than guessed at. The link follows the shopper's choices as they make them, so the fabric they picked on the set is already picked in the builder.

**When the link hides itself.** If the builder's product is archived, hidden or has its builder switched off, the line disappears from the set rather than sending shoppers to a page with no builder on it. A starting layout that uses a unit since taken out of the builder is skipped.

## The basket, checkout and orders

A layout goes in as **one grouped set of lines**: one line per distinct variation, with repeats folded into a quantity (two identical central seats are one line of two), each priced, stocked, taxed and delivered exactly as if bought on its own. The first unit heads the group and carries two notes for whoever packs the order - **Layout** ("L-shape, 5 units") and **Arrangement** ("Left Unit → Central Unit → Corner Unit → Central Unit → Right Unit") - and the other lines sit under it captioned "Part of your L-shape layout".

Removing the first line asks whether to remove the rest of the layout too. If a unit is taken out on its own, the lines stay (they are still real products at real prices) and the first line notes that part of the layout has been taken out.

## Product add-ons

The add-ons box carries on exactly as it does on any product.

- **The builder's 3D view never changes for add-ons.** Each unit is drawn as itself, whatever accessories are ticked on the page. (The product gallery's own 3D view behaves as it always has.)
- **Accessories group with the layout** when the product the add-ons box is adding them for is one of the layout's units - the usual case when the page's options and the layout agree. Units and accessories then nest under one line, whichever order they went in.
- **Recommended add-on quantities are per single unit**, from the page's own quantity, as on any product. The shopper can change the count in the add-ons box.

## Good to know

- A layout can hold up to the "Most units in one layout" figure on the panel (12 unless changed, 30 at most).
- A unit whose option value is deleted drops out of the builder, and any ready-made layout using it stops being offered.
- Set-ups refer to options by name and values by their slugs, so re-importing a catalogue does not detach them - renaming the unit option does, until it is picked again.
- Devices that cannot show 3D still get the plan, which does everything the 3D view does.
- The builder tab and the individual tab are both in the page from the start; switching tabs never reloads anything, and the individual tab's blocks behave exactly as they do on any product.

## For developers

- **Table** `mcf_product_configs` (`product_id` → `shp_products`, cascade; `enabled`; `config` jsonb, validated by `lib/config-schema.ts`).
- **Table** `mcf_layout_links` (migration 002): `product_id` PK → `shp_products` cascade, `target_product_id` → `shp_products` cascade (indexed), `lead_text`, `link_text`, `new_tab`, `starting_layouts` jsonb (`[{ when: { optionName, valueSlug } | null, valueSlugs }]`, `lib/layout-link-schema.ts`, read defensively). Validation `lib/layout-link-validation.ts`; address logic (`pickStartingLayout`, `carriedChoices`, `layoutLinkHref`, `usableStartingLayouts`) is pure in `lib/layout-link.ts`. The link carries the builder product's own option parameters (shop-variations' `?option-key=value-slug`) and `modular-layout=<unit slugs joined by .>`.
- **Link block** `ShopModularLayoutLink` on `shopProductDetail`: RSC half `loadLayoutLinkBlockData(slug)` (null unless a link exists and the target is ACTIVE, not catalogue-hidden and has an enabled set-up with units); the island `LayoutLinkView` renders the plain address during hydration and follows `useVariationSelection` once live. Shared markup `components/public/LayoutLinkLine.tsx`, class `mcf-layout-link`.
- **Placement** is one pure function, `placeChain` in `lib/chain-geometry.ts`, and every edit goes through `lib/chain-editing.ts`. The 3D view, plan, price and basket all read its output. Shapes: `straight` (optional `backless`), `corner`, `curve` (`back: outside | inside | none`, `seatDepthMm`; `widthMm` = `depthMm` = the quarter circle's outer radius) and `round-end`. A `ChainEntry` may carry `flipped` for a reversible piece (a backless curve) and `frontSpur` for a backless straight piece placed in front of a backed straight host. Joins meet on the back edge, except a backless straight beside a backed straight or a corner, which meets on the seat front (the front ends of the two faces line up), so a shallower cube sits flush with the front of whatever it joins - either side of a corner included. Backless beside backless, and anything beside a curve or rounded end, stays back-aligned. `layoutIsClosed` spots a layout that joins up; `piecesOverlap` tests real outlines (convex pieces, separating axis) after the rectangle check. Layout sharing uses the normal dotted unit slugs plus `front:<slug>` markers, with the older `front-...` spelling still read on the way back in.
- **Model turning**: `modelTurnDegrees` is `'auto'` (the default for a unit saved without one) or 0/90/180/270. `'auto'` rasterises the loaded model's top surface onto a grid and scores each quarter turn against the declared shape - footprint proportions, covered area, backrests and arms where the shape says (`lib/model-orientation.ts`), cached per file and shape.
- **Pricing**: a unit whose exact selection has no switched-on variation takes the nearest one that keeps its own choices - fewest options changed, then nearest value position, then in stock - and lists them in `PricedUnit.adjustedOptionIds` (`lib/layout-pricing.ts`).
- **Extension points**: `shop.product-editor-sections` (the panel), `shop.gallery-media` (the layout on the gallery stage, fed by a per-page store the builder publishes to - `components/public/layout-stage-store.ts`; sets `mobileStage: 'immersive'` so the phone sticky gallery gives the layout the whole strip), `shop.cart-line-resolver` and `shop.cart-line-resolver-prefetch` (grouping). Puck block `ShopModularConfigurator` on `shopProductDetail`, with a slot field `individual`; without an enabled set-up its RSC half renders the slot alone. Opening tab: `lib/opening-tab.ts`.
- **Line meta** `meta.modularLayout` (`lib/line-meta.ts`). The prefetch plans each layout's group; when a layout line already heads a Product Add-ons group (`meta.productAddons.role === 'main'`), the layout adopts that group key so the two sets share one head regardless of resolver order.
- **Adding** calls shop-variations' `collectPurchaseCompanions` for each unit, so companion stamps land exactly as they would on an ordinary add.
- **Delivery** is a trial run of shop's `POST /api/m/shop/public/cart/validate`: once with the layout's lines as they are, once with each service the lines' shared per-line `control` offers set on every line. `lib/layout-delivery.ts` keeps the services common to every line, dates each by the latest `lineMeta.batch.sort`, prices it per item and totals it by quantity. A choice other than the basket's default is written onto every line under the control's own `key`. No delivery module is named or imported.
- **Admin API** `GET`/`PUT /api/m/modular-configurator-for-shop/admin/products/[productId]` (`shop.products`), and `GET`/`PUT .../admin/products/[productId]/layout-link` (body `{ link: LayoutLink | null }`, null deletes).
- **SQL suite**: `RUN_MODULAR_CONFIGURATOR_SQL=1 npx vitest run modules/modular-configurator-for-shop/lib/db/configurator-sql.live.test.ts` with the OVH credentials exported.
