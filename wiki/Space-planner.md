# Space Planner

The Space Planner lets a customer draw their own room to scale, put your furniture in it, and find out what actually fits before they spend anything. What they take away is a floor plan they can print, a priced item list, a full basket, or a quote request with the plan attached.

It is a module, so it is not there until you install it: **Modules → Add module →** `cactus-foundation-modules/space-planner-for-shop`.

## What your customers see

**Drawing the room.** Three ways in, and the first is the one most people want: type the width and depth, the way anybody standing in a room with a tape measure already has it. The other two are a preset to adjust and a shape to drag about. Whichever they choose, clicking any wall afterwards lets them type its real length, and the rest of the room follows.

Measurements are always the **inside** of the room. That is what a tape measure gives you, so it is what the planner asks for.

**Putting things in it.** They search your catalogue, pick something, and it lands in the room at its real size. Listings with a proper 3D model are badged, because most listings have not got one and it saves a hunt.

**What "fits" means.** Furniture overlapping in plan is normal - a chair tucks under a desk, a pedestal slides under the desktop - so the planner only complains when things actually clash at the same height. Where we know the clearance under a desktop, it will say "fits underneath" or "5 cm too tall" while they are still dragging.

**Three views.** A flat plan for arranging things, a 3D view for believing it, and a stand-in-the-room view for the full effect. The flat plan works on any device; the 3D view needs a reasonably modern one and says so plainly rather than showing a blank square.

**Getting it out.** Print the floor plan and the item list. Send the lot to the basket in one go. Ask for a quote, which lands in your ordinary Quotes list with a link to the plan. Or have the plan emailed to whoever holds the budget.

**Saving.** Saving needs an account. Everything up to that point works signed out, and what they were doing is kept in their browser so closing the tab is not a disaster - but the moment they press Save, they are asked to sign in. Their rooms then live under **My spaces** in their account, and a room can hold several layouts, so somebody can measure once and compare three options.

## Where it appears on your site

Nothing shows up for customers until you put it somewhere:

- **The basket page.** On by default. This is the highest-intent spot on the site: they have picked everything and are quietly wondering whether it will all go in. The button hides itself on an empty basket.
- **Product pages.** Place the **Space Planner: see it in your room** block on your product layout, wherever it belongs - under the buy button on a desk, and nowhere at all on a box of pens.
- **Anywhere else.** The **Space Planner: teaser** block is a picture, a line of copy and a button. It is deliberately static: the planner itself only loads on its own page, so a page carrying the teaser is not slowed down by it.
- **Its own page**, at `/space-planner`.

## Sizes, and why some say "approx."

The planner will not invent a measurement. It works down a list, in order:

1. **Measured from the 3D model**, where there is one.
2. **Read from the spec sheet** - your Overall Width, Depth and Height values.
3. **A typical size for the category**, where the spec sheet is silent. Anything sized this way is labelled **approx.** on screen.
4. **Typed in by the customer**, if they know better. Nothing overwrites that.
5. **A plain labelled block** at an ordinary size, so nothing is ever un-placeable.

Two things are worth your attention in **Space Planner → Sizes**:

- **Measurements we could not read.** The actual wording from the sheet, so you can fix it. "Overall Width: please enquire" takes a minute to sort and improves every plan afterwards.
- **The 3D model and the spec sheet disagree.** One of the two is wrong. This is exactly how a beautifully drawn room ends up full of furniture that is not the size it claims, so it is worth a look.

Filling in the category fallback sizes is the single cheapest thing you can do for the planner's quality - it is what turns "a plain block" into "roughly the right shape".

## What to get 3D modelled next

**Space Planner → Rooms & plans** keeps a count of what customers keep placing that has no 3D model. That is your shopping list, in demand order, rather than a hunch.

## Settings

They live in **Shop settings → Space Planner**.

- Where the buttons appear, and what they say.
- What customers can do with a plan: quote, email it to themselves, ask for a photoreal picture, show delivery dates.
- **Let customers download the 3D models in their plan.** Off by default, and worth leaving off unless you mean it: with it on, anyone can save your suppliers' models to their own computer. The floor plan, the item list, the pictures and the quote all work perfectly well without it.
- Spacing guidance - walkway widths and the room behind a desk for a chair - and the wording that travels with every warning.
- Limits: how many spaces a customer keeps, how many layouts per space, how much goes in one room.
- Housekeeping: how long usage counts are kept, and after how long an untouched space is flagged. Flagged, not deleted - somebody spent an afternoon on those.

## A word about the spacing warnings

They are rules of thumb to help arrange furniture. They are **not** a workplace assessment, not fire-safety or means-of-escape advice, and not a building-regulations check. That wording appears with every warning and on every printed plan, and you can edit it. A tool that draws a green tick next to a walkway must not be mistaken for one that has signed it off.

## Photoreal pictures

Off until somebody sets up the picture service, and the admin says so rather than leaving you guessing. It needs two settings adding to the site - `SPACE_PLANNER_RENDER_URL` and `SPACE_PLANNER_RENDER_SECRET` - and a machine at the other end to do the rendering. Everything else in the planner works without it.

A picture is a photograph of a moment. If the customer moves things about afterwards, the picture is labelled with the date it shows rather than pretending to be current.

## Privacy and data

- The usage counts hold no personal data at all - no addresses, no session ids, nothing that identifies anybody. They are purged on the schedule you set.
- A customer's rooms and layouts come out in their ordinary account data export.
- When somebody deletes their account, their rooms and layouts go with it on the next nightly tidy-up.
- Sharing a plan mints a private link. Nothing has one until they press Share, revoking it stops the link working straight away, and shared plans are kept out of search engines.

## Uninstalling

Unlike an order or a review, **a customer has no copy of a plan anywhere else**. So when you uninstall, "keep the data" (the recommended option, and the default) leaves everything where it is and a reinstall finds the plans still there. The other option is permanent, and it is somebody's afternoon.

## What is not in this first version

Named here so nobody goes looking:

- Drawing an L-shaped or bay-windowed room freehand. The planner handles those shapes perfectly well once they exist; the drawing tool for them is next.
- Delivery dates on the item list. Waiting on a small addition to the Advanced Shipping module.
- The picture service itself.
- Downloading the whole room as a 3D file, sharing a whole space rather than one layout, and staff editing a customer's plan and sending it back.

## Related

- [Quotes](Quotes) - where a plan's quote request lands.
- [Product 3D views](Product-3D-views) - where the 3D models come from.
- [Product attributes](Product-attributes) - where the measurements come from.
