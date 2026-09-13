# Modular Configurator

The **Modular Configurator for Shop** module (`modular-configurator-for-shop`) lets a shopper build a layout out of a modular product's units - a sofa that turns a corner, a run of bench seating - in 3D on the product page, see how much floor it takes, and put the whole arrangement in the basket in one go.

It needs the Shop, Shop Variations and Product 3D Views modules. It works on the variations and models a product already has: a unit is simply one value of one option ("Unit: Left Unit, Central Unit, Corner Unit, Right Unit"), and every unit in a layout is sold as the real variation it is, at its own price.

## Setting it up

1. **Place the block.** Put **Shop: Layout builder tabs (modular products)** in the product page layout, straight after the short description, and drag the page's options, price, delivery options and Add to basket into its **Shop individual items** space. Anything that belongs under both tabs - accessories, the delivery and returns links - goes after the block. On a product without the builder the block shows what is in its space and nothing else, so the shared product layout is the right home for it.
2. **Switch it on for the product.** On the product's edit screen, open the **Layout builder** panel and tick **Show the layout builder on this product**.
3. **Say which option holds the units.** Every other option - fabric, frame and so on - is chosen once for the whole layout, and can be changed unit by unit.
4. **Describe each unit**, always as you see it standing in front of it - the way the product photographs and the 3D view show it:
   - **How it joins**: no arms (joins on both sides), arm on the left (starts a row), arm on the right (finishes a row), arms both sides (stands alone), or a corner. A corner's "second back" is the backrest down one side - say which side it is on.
   - **Width and depth** in millimetres - the footprint. Where the unit's specification has an Overall Width and Overall Depth, they are filled in for you and a button offers them again if you change them.
   - **3D model**: whether the unit's model needs a quarter turn to face forwards. Most do not.
5. **Ready-made layouts are optional.** Write your own - a name and the units in the order they join, drawn beside it so a layout that cannot be built says so before you save. Write none and shoppers are offered a pair, a row of three, an L-shape and a U-shape, made from your units wherever the range can make them.

**Getting a corner the right way round.** If a corner in the 3D view has its backs on the inside of the L, the second-back side is set the wrong way: change it on the Layout builder panel.

## What the shopper sees

- **Two tabs under the short description**: **Shop individual items** on the left and **Build a layout** on the right (rename either on the block).
  - The page opens on **Shop individual items**, so adverts and shared links land on the unit and price that was clicked. Only a layout link opens on **Build a layout**.
  - A fabric or frame chosen in either tab is chosen in the other.
- **Build a layout** starts with the ready-made shapes drawn to scale, each priced in the options already chosen, and **Design your own**. Choosing one starts the builder - the 3D view only loads at that point:
  - **The product picture becomes the layout.** The gallery's main picture shows the layout, a **Your layout** thumbnail leads the strip, and the photographs stay in the strip underneath. Clicking a photo shows that photo; changing the layout brings the layout back up. Switching to **Shop individual items** gives the gallery back to the photos. On a phone the pinned gallery keeps the layout in sight while the controls scroll beneath it. (A page layout with no gallery shows the view inside the tab instead.)
  - **The view**: the 3D model, or **Plan** for the same layout from above with numbered units, with **Sizes** marking the overall width and depth. Tap a unit to select it; tap a dashed space to add a unit there. The plan does everything the 3D view does, by keyboard.
  - **Adding a unit** lists every unit type with its price. Ones that cannot go at that end stay in the list, greyed out, saying why ("Its arm would face into the layout", "No room - it would overlap").
  - **A selected unit** can be swapped for another type that still fits, given a fabric (or any other option) of its own, or taken out - the units either side close up.
  - **Undo**, **Start from a shape**, and the layout's own options (fabric, frame) with swatches.
  - **The price**, set exactly like the individual tab's - the layout's total, the RRP where every unit has one, the tax wording - with **Reset options** beside it, which starts the layout again from the shapes.
  - **Delivery**, in the same box and "Switch to" chips as the individual tab. The services on offer are the ones every unit in the layout can have; each is dated by the unit that arrives last, and priced **per item** ("+£25.95 per item"), with the total for the layout written underneath. The choice goes onto every unit in the basket, where it is charged per item exactly as the basket always does. It is worked out by asking the basket itself, so it can never quote something the basket will not charge.
  - **The buy row**: a quantity for how many of the layout, and **Add layout to basket**, styled like the individual tab's. A unit that cannot be bought in the chosen combination is named, and the button waits.
- **Nothing jumps.** Adding to either end, swapping or removing re-lays the layout around the units the shopper already had, so what they were looking at stays put.
- **The link reopens the layout.** It is written into the address as the shopper builds (`?modular-layout=…`), so a shared or bookmarked link opens on the same units, in the same order, with the same choices.

### How units go together

Walking a layout from its first unit to its last is walking each straight run from its left end to its right end, as seen standing in front of the seats. So a unit with an arm on its left can only start a layout, and one with an arm on its right can only finish it. A corner always turns towards the seats' front, and the unit added after it lands against the corner's open side with its back in line with the corner's second back - never off the end of the row, never behind it.

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
- **Placement** is one pure function, `placeChain` in `lib/chain-geometry.ts`, and every edit goes through `lib/chain-editing.ts`. The 3D view, plan, price and basket all read its output.
- **Extension points**: `shop.product-editor-sections` (the panel), `shop.gallery-media` (the layout on the gallery stage, fed by a per-page store the builder publishes to - `components/public/layout-stage-store.ts`), `shop.cart-line-resolver` and `shop.cart-line-resolver-prefetch` (grouping). Puck block `ShopModularConfigurator` on `shopProductDetail`, with a slot field `individual`; without an enabled set-up its RSC half renders the slot alone. Opening tab: `lib/opening-tab.ts`.
- **Line meta** `meta.modularLayout` (`lib/line-meta.ts`). The prefetch plans each layout's group; when a layout line already heads a Product Add-ons group (`meta.productAddons.role === 'main'`), the layout adopts that group key so the two sets share one head regardless of resolver order.
- **Adding** calls shop-variations' `collectPurchaseCompanions` for each unit, so companion stamps land exactly as they would on an ordinary add.
- **Delivery** is a trial run of shop's `POST /api/m/shop/public/cart/validate`: once with the layout's lines as they are, once with each service the lines' shared per-line `control` offers set on every line. `lib/layout-delivery.ts` keeps the services common to every line, dates each by the latest `lineMeta.batch.sort`, prices it per item and totals it by quantity. A choice other than the basket's default is written onto every line under the control's own `key`. No delivery module is named or imported.
- **Admin API** `GET`/`PUT /api/m/modular-configurator-for-shop/admin/products/[productId]` (`shop.products`).
- **SQL suite**: `RUN_MODULAR_CONFIGURATOR_SQL=1 npx vitest run modules/modular-configurator-for-shop/lib/db/configurator-sql.live.test.ts` with the OVH credentials exported.
