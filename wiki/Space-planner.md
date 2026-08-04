# Space Planner

The Space Planner lets a customer draw their own room to scale, put your furniture in it, and find out what actually fits before they spend anything. What they take away is a PDF with the floor plan and a priced item list in it, a full basket, or a quote request with the plan attached.

It is a module, so it is not there until you install it: **Modules → Add module →** `cactus-foundation-modules/space-planner-for-shop`.

**It arrives switched off for customers.** See [Staff only](#staff-only) - installing it puts the planner in your admin's hands and nowhere else until you say otherwise.

## What your customers see

**Drawing the room.** Two ways in, plus three shapes to start from. The first is the one most people want: type the width and depth, the way anybody standing in a room with a tape measure already has it. The second is to tap out the corners themselves - as many as the room has. Under that sit a small office, an open-plan rectangle and an L-shape to adjust.

**Rooms are not all rectangles**, and the planner does not pretend otherwise. Under **Room** they can drag any corner about, double-tap a wall to put a new corner in it, or remove one - so a bay, a return or a chimney breast is a couple of taps rather than a compromise. Walls snap square while they draw and write their own length as they go, and clicking any wall afterwards lets them type its exact length. If an outline ever folds through itself the planner says so and puts the last good one back.

Measurements are always the **inside** of the room. That is what a tape measure gives you, so it is what the planner asks for.

**Putting things in it.** They search your catalogue, pick something, and it lands in the room at its real size, in the first clear space rather than on top of whatever is already there. Listings with a proper 3D model are badged, because most listings have not got one and it saves a hunt. Prices read exactly as they do on the rest of your site, "from" figures and all.

**Doors and windows.** Under **Room → Doors & windows**, a tap on any wall puts one in it, and it can be slid along that wall, resized, or swapped between a door, a window and a plain opening. They are part of the room rather than part of one layout, so they follow the wall when it moves and they are still there in every layout tried in that room - and a desk in front of the only doorway is exactly the thing drawing the room was meant to catch.

**Moving things about.** Furniture snaps flat against a wall when they drag it near one, and comes away again the moment they drag it back - which sounds obvious and is worth saying, because it did not always. It also snaps to the other furniture: drag a desk near the one beside it and the two click together edge to edge, and line up on the other axis at the same time, so a bank of desks actually touches instead of nearly touching. Holding **alt** switches all the snapping off for the fussy moments. Turning something is a handle on the selected item - drag it round, in fifteen-degree steps unless alt is held - and anything mounted on it or tucked under it comes round with it.

**Start again** sits on the toolbar. It throws the room away and keeps everything they have chosen, with a tick if they would rather clear that too.

**What "fits" means.** Furniture overlapping in plan is normal - a chair tucks under a desk, a pedestal slides under the desktop - so the planner only complains when things genuinely clash. A chair pushed under a desk overlaps it in both plan and height, and is not a clash; two desks in the same square metre is. Where we know the clearance under a desktop, it will say "fits underneath" or "5 cm too tall" while they are still dragging.

**Two views.** **Edit** is the flat plan, where things are arranged. **Preview** is the room in 3D, which can be spun, tilted and zoomed, and where the walls nearest the viewer step out of the way so you are looking into the room rather than at the outside of a box. **Perspective** can be switched off there: on is how the room will look to somebody standing in it, off is how a drawing is drawn, where two identical desks are the same size on screen wherever they are in the room and can be compared by eye. The flat plan works on any device; the 3D view needs a reasonably modern one and says so plainly rather than showing a blank square.

**Getting it out.** **Export PDF** makes a document with the room's measurements and the priced item list, plus the floor plan, the 3D view and a quote page if they tick for them - the quote page in your own quote wording and terms. Send the lot to the basket in one go. Ask for a quote, which lands in your ordinary Quotes list with a link to the plan. Or have the plan emailed to whoever holds the budget.

**Opening one again.** Everything saved is listed under **My spaces**, and every layout in it opens with a click - straight back into the planner with the room already drawn. A room has its own link for starting a fresh layout in it, which is the point of measuring once.

**Saving.** Saving needs an account. Everything up to that point works signed out, and what they were doing is kept in their browser so closing the tab is not a disaster - but the moment they press Save, they are asked to sign in. Their rooms then live under **My spaces** in their account, and a room can hold several layouts, so somebody can measure once and compare three options.

## Staff only

**Shop settings → Space Planner → Hide the Space Planner from customers (staff only).** On to begin with, and it is the switch to reach for if you have decided the planner is not ready to be put in front of people who are paying you.

With it on, the planner is not on your shop at all. No button on the basket, no button on product pages, nothing where the teaser block sits, no tab in a customer's account, and `/space-planner` tells anyone who bookmarked it that the page does not exist. Behind that, the data it runs on says the same thing, so it is genuinely gone rather than merely out of sight.

Anyone signed in to your admin with Space Planner access carries on using it exactly as before, on the real catalogue, which is rather the point: you get to live with it for a fortnight before anybody else meets it.

Two things worth knowing:

- **Plans you have already shared by link keep working.** You sent those to a specific person on purpose, and a staff-only planner is mostly a tool for building somebody's layout and sending it to them. What goes is the invitation at the bottom of the shared page to open the planner, which would only lead nowhere.
- **Saving still needs a customer account**, staff or not, because a saved room belongs to a customer. Drawing a room and filling it needs nothing but the switch; keeping it needs an account like everybody else's.

Turning it off lets customers in immediately - with one wrinkle. A page you built yourself carrying the **teaser** block is stored ready-made for speed, so the teaser may take until that page is next saved to appear or disappear. Every other button is immediate, and the planner's own address is immediate either way, so nobody is ever looking at a button that works when it should not.

## Where it appears on your site

Nothing shows up for customers until you put it somewhere - and nothing at all while it is [staff only](#staff-only):

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

- **Hide the Space Planner from customers (staff only).** On by default. The whole feature disappears from your shop while your own staff carry on using it - see [Staff only](#staff-only).
- Where the buttons appear, and what they say.
- What customers can do with a plan: quote, email it to themselves, ask for a photoreal picture, show delivery dates.
- **Let customers download the 3D models in their plan.** Off by default, and worth leaving off unless you mean it: with it on, anyone can save your suppliers' models to their own computer. The floor plan, the item list, the pictures and the quote all work perfectly well without it.
- Spacing guidance - walkway widths and the room behind a desk for a chair - and the wording that travels with every warning.
- Limits: how many spaces a customer keeps, how many layouts per space, how much goes in one room.
- Housekeeping: how long usage counts are kept, and after how long an untouched space is flagged. Flagged, not deleted - somebody spent an afternoon on those.

## A word about the spacing warnings

They are rules of thumb to help arrange furniture. They are **not** a workplace assessment, not fire-safety or means-of-escape advice, and not a building-regulations check. That wording appears with every warning and on every printed plan, and you can edit it. A tool that draws a green tick next to a walkway must not be mistaken for one that has signed it off.

## Photoreal pictures

Off until you switch them on, and the admin says so rather than leaving you guessing. Switching them on is a button on **Space Planner -> Pictures**.

If your site already has a Fly.io key - and it probably does, because the video converter asks for one first - that button is the whole job. If it does not, there is one box to paste a key into: an **organisation** key from the Tokens page of your Fly.io dashboard, because a key tied to a single app cannot build anything new. Press the button, and the site builds its own picture service.

**Nothing runs, and nothing costs, between pictures.** There is no machine sitting there. When a customer asks for a picture, a machine is built for that one picture, and it is destroyed the moment the picture arrives. Ten customers asking at once get ten machines and ten pictures at the same time - which costs the same as ten one after another and takes a tenth as long. There is a ceiling on how many at once, so a busy afternoon cannot run away with your money; past it, a customer is asked to try again in a minute.

Three separate things make sure a machine goes away: the site deletes it when the picture lands, the machine puts itself to bed if it goes quiet, and the nightly tidy-up sweeps up anything that managed neither.

Already run your own render machine? Set `SPACE_PLANNER_RENDER_URL` and `SPACE_PLANNER_RENDER_SECRET` and the site will use that instead, and stay out of the way. It will not offer to build you a second one.

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

- Delivery dates on the item list. Waiting on a small addition to the Advanced Shipping module.
- Downloading the whole room as a 3D file, sharing a whole space rather than one layout, and staff editing a customer's plan and sending it back.

The PDF export needs an account, because the document is made from the saved plan and the prices in it are worked out on our side rather than in the customer's browser. Everything up to that point still works signed out.

## Related

- [Quotes](Quotes) - where a plan's quote request lands.
- [Product 3D views](Product-3D-views) - where the 3D models come from.
- [Product attributes](Product-attributes) - where the measurements come from.
