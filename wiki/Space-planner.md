# Space Planner

The Space Planner lets a customer draw their own room to scale, put your furniture in it, and find out what actually fits before they spend anything. What they take away is a PDF with the floor plan and a priced item list in it, a full basket, or a quote request with the plan attached.

It is a module, so it is not there until you install it: **Modules → Add module →** `cactus-foundation-modules/space-planner-for-shop`.

**It arrives switched off for customers.** See [Staff only](#staff-only) - installing it puts the planner in your admin's hands and nowhere else until you say otherwise.

## What your customers see

**Drawing the room.** Two ways in, plus three shapes to start from. The first is the one most people want: type the width and depth, the way anybody standing in a room with a tape measure already has it. The second is to tap out the corners themselves - as many as the room has. Under that sit a small office, an open-plan rectangle and an L-shape to adjust.

**Rooms are not all rectangles**, and the planner does not pretend otherwise. Under **Room** they can drag any corner about, double-tap a wall to put a new corner in it, or remove one - so a bay, a return or a chimney breast is a couple of taps rather than a compromise. Walls snap square while they draw and write their own length as they go, and clicking any wall afterwards lets them type its exact length. If an outline ever folds through itself the planner says so and puts the last good one back.

Measurements are always the **inside** of the room. That is what a tape measure gives you, so it is what the planner asks for.

**Putting things in it.** They search your catalogue, pick something, and it lands in the room at its real size, in the first clear space rather than on top of whatever is already there - and if the room has genuinely run out of clear floor, the planner says so instead of quietly stacking things. Listings with a proper 3D model are badged, because most listings have not got one and it saves a hunt - and the "only things with a 3D model" tick now filters the whole catalogue properly, with page counts that tell the truth. Cards say how many of that thing are already in the room, the category list is grouped into sections rather than one long pile, and the panel remembers the search, category and page they were on when they come back to it. Prices read exactly as they do on the rest of your site, "from" figures and all. So does what is on the shelf: if your shop is set to hide products that have sold out (**Settings → Shop → General → Out of stock products**), the browse panel does not offer them either, so nobody plans a room around something they cannot buy.

**Which one of it, though.** Anything that comes in sizes or finishes now asks before it goes in. Tapping the card opens the same choices your product page offers - swatches, sizes, the lot - and combinations you do not make are dimmed and struck through, with a line of text saying why, so nobody ends up in a dead end they cannot back out of. The chosen one's real size and real price appear before it is placed, and that is what gets placed - and a little counter alongside means six matching desks go in with one press rather than six trips through the choices. This matters more than it sounds: a range's own measurements describe the family rather than any member of it, so a boardroom table that comes in 180 and 240 cm has no width of its own to be placed at, and used to arrive at a category guess. Choosing first is what stops that.

**In the right colour.** Anything sent over from the basket arrives in the fabric or finish they actually chose, so a room of blue chairs is a room of blue chairs. Picked from the catalogue panel instead, where no colour has been chosen yet, it wears the first one you list - the same one the product page opens on.

**The basket gets a tab of its own.** Everything brought over from the basket sits under **Cart** in the side panel - a proper list with pictures, prices and sizes, not the cramped strip it used to be - and each thing goes into the room with a tap, or all of them at once with one button. Changed their mind about something? It comes off the list without going in. Anything a redrawn room can no longer hold waits in the same place rather than being thrown away. The tab only appears while something is actually waiting, and the count on it says how much. A **Refresh from basket** button re-reads the basket if it has changed while the planner was open, and if a basket line cannot come along - something since retired from the shop, say - the tab says so instead of leaving them to wonder. Somebody arriving from the basket before they have drawn a room is told their basket is coming along, too.

**On a phone.** The side panel sits below the room at a steady, sensible height - the room keeps the top of the screen, the panel keeps the bottom, and each scrolls on its own. Search and category sit side by side to spend less of the screen on furniture-finding and more on furniture.

**Doors and windows.** Under **Room → Doors & windows**, a tap on any wall puts one in it, and it can be slid along that wall, resized, or swapped between a door, a window and a plain opening. They are part of the room rather than part of one layout, so they follow the wall when it moves and they are still there in every layout tried in that room - and a desk in front of the only doorway is exactly the thing drawing the room was meant to catch.

**Columns and pillars.** Under **Room → Columns & pillars**, a tap on the floor drops one where the real one stands - a support column, a boxed-in riser, a chimney breast. Drag it about, type its width, depth and height, call it what you like. Once it is down it can be clicked again straight from the ordinary view - no going back through **Room** first - and its measurements, its name and **Remove** appear on the toolbar for as long as it is picked out. Escape, or **Done**, hands the toolbar back. Where a desk sits over a column the click belongs to the desk, since the desk is the thing being arranged and the column is a fact about the building. It draws on the plan and it stands in the 3D view as a proper column, floor to its own height, faintly see-through so a desk behind it is still a desk rather than a rumour. The planner treats it as floor nothing can occupy: new furniture is never dropped on top of one, and anything pushed into one gets the same amber warning two clashing desks do. Like doors, they belong to the room itself, so every layout tried in that room has them.

**Moving things about.** Furniture snaps flat against a wall when they drag it near one, and comes away again the moment they drag it back - which sounds obvious and is worth saying, because it did not always. It also snaps to the other furniture: drag a desk near the one beside it and the two click together edge to edge, and line up on the other axis at the same time, so a bank of desks actually touches instead of nearly touching. Holding **alt** switches all the snapping off for the fussy moments.

**And through each other, when that is the point.** Keep pushing a chair at a desk and it goes under it, rather than stopping dead at the desk's edge. The click-together happens on the way in, from outside, which is what builds a bank of desks; push past it and the planner gets out of the way, because a chair under a desk and a pedestal under a worktop are arrangements somebody is aiming for rather than mistakes to be prevented. It still lines the chair up with the middle of the desk while it is under there, and the amber warning still knows the difference between a tucked-in chair and two desks in the same square metre. Turning something is a handle on the selected item - drag it round, in fifteen-degree steps unless alt is held - and anything mounted on it or tucked under it comes round with it.

**What is in the room, in a list.** The **Item list** tab totals everything up, and tapping a line picks out those items on the plan - six of one chair, all lit up at once. The **Selected** tab shows the chosen thing's measurements as plain reading rather than something to fiddle with: a product is the size it is. Anything the planner had to guess the size of is drawn with a dashed outline and a "≈" on its measurements, so a guess never dresses up as a fact - and the moment its 3D model is seen, the plan quietly corrects itself to the model's true size.

**Start again** sits on the toolbar. It throws the room away and keeps everything they have chosen, with a tick if they would rather clear that too.

**What "fits" means.** Furniture overlapping in plan is normal - a chair tucks under a desk, a pedestal slides under the desktop - so the planner only complains when things genuinely clash. A chair pushed under a desk overlaps it in both plan and height, and is not a clash; two desks in the same square metre is. Where we know the clearance under a desktop, it will say "fits underneath" or "5 cm too tall" while they are still dragging.

A chair sticking out past the front edge of a desk is what tucking one under a desk looks like, and the planner now treats it that way. It used to want the chair to be no deeper than the desk, which office chairs rarely are - they are 64 to 69 cm deep and half of these desks are 60 - so the commonest arrangement in the catalogue came up red. What still comes up red is two things that are both the sort of thing others go under (two desks, a desk and a sideboard), anything too tall to be going under a desk at all, and anything overlapping a cupboard of desk height, which is solid to the floor and has no space beneath it whatever its top looks like.

**Two views.** **Edit** is the flat plan, where things are arranged. **Preview** is the room in 3D, which can be spun, tilted and zoomed, and where the walls nearest the viewer step out of the way so you are looking into the room rather than at the outside of a box. **Perspective** can be switched off there: on is how the room will look to somebody standing in it, off is how a drawing is drawn, where two identical desks are the same size on screen wherever they are in the room and can be compared by eye. The flat plan works on any device; the 3D view needs a reasonably modern one and says so plainly rather than showing a blank square. The note explaining how to drive it keeps to one line on a phone, where the room is only a few centimetres tall to begin with, and takes itself off after a few seconds whether or not anybody has touched anything.

**How tall you are.** A slider down the side of the 3D view sets eye height, with **Sitting** and **Standing** on it as one tap each and the height written out in the room's own units. Holding **alt** and scrolling does the same thing, as do Page Up and Page Down, for anybody who prefers not to reach for the slider. Whichever way, the view stays level - you simply get taller or shorter, rather than finding yourself looking at the ceiling.

**Keeping the angles you like.** Found the spot that shows the meeting table and the window at once? **Keep this view** puts it on the strip above the 3D view, where it can be renamed, pointed somewhere else, or clicked to stand there again. A saved view belongs to the **space** rather than to one layout, which is rather the point: every option tried in that room can be looked at, and photographed, from the identical spot. Twelve per space, which is more than anybody compares.

**Getting it out.** **Export PDF** makes a document with the room's measurements and the priced item list, plus the floor plan, the 3D view and a quote page if they tick for them. Any saved view can be ticked in too, each photographed from its own spot, so the document can show the room from the doorway and from the window without anybody re-aiming a camera. Your logo sits at the top of every page, and the floor plan always prints in ink-on-paper colours - a customer working in dark mode used to be handed a black plan. The quote page is laid out to match the quote document your shop already sends from the cart, on a page of its own, in your own quote wording and terms. Send the lot to the basket in one go. Ask for a quote, which lands in your ordinary Quotes list with a link to the plan. Or have the plan emailed to whoever holds the budget.

**Opening one again.** Everything saved is listed under **My spaces**, and every layout in it opens with a click - straight back into the planner with the room already drawn. A room has its own link for starting a fresh layout in it, which is the point of measuring once.

**Throwing one away.** Every layout in that list has a **Delete** beside it, and so does every room. It asks once before it does it, and deleting a room takes its layouts with it - the confirmation says how many, so nobody finds that out afterwards. It is the customer's own list, so this is theirs to tidy rather than yours.

The opening screen offers them too, so somebody coming back does not have to go via their account to find the office they measured last week. Their rooms are listed by name at the top of it, with the floor area and how many layouts are in each, and one click drops them back into the layout they last worked on. Six of them, and a link to the full list for anybody with more. A visitor with nothing saved never sees any of this, and one who is signed out gets a quiet line saying where their rooms went.

**Naming the room.** The room's name sits under the heading with a small pencil beside it, so it can be changed the moment they think of a better one - "Ground floor, east wing" rather than "My space". It is the name every layout, PDF and photograph is filed under, and on a room already saved the new name is kept straight away rather than waiting for the next save.

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

1. **Measured from the 3D model**, where there is one and you have run the measuring pass.
2. **Read from the spec sheet** - your Overall Width, Depth and Height values. A colour or size option that says nothing about its own dimensions takes them from the product it belongs to.
3. **A typical size for the category**, where the spec sheet is silent. Anything sized this way is labelled **approx.** on screen.
4. **Typed in by the customer**, if they know better. Nothing overwrites that, including a measurement.
5. **A plain labelled block** at an ordinary size, so nothing is ever un-placeable.

### How big the 3D model itself is drawn

The list above is about the space a thing takes up in the plan. How big the **model** is drawn is a separate question, and it now has a shorter answer.

Where you have told the 3D views setup how big a product really is - the overall height, or the overall width, that its materials are already scaled by - that one measurement decides it. The model is drawn to that size and nothing else about it is touched: a chair recorded at 111cm tall arrives 111cm tall, in the proportions its maker drew it in.

Only where no such measurement exists does the planner go back to reconciling the model against the spec sheet, which is where a model could come out squashed or stretched: a spec figure that is not quite the overall size - a seat height, a range like "111-127cm", a width measured to the worktop rather than to the frame - used to pull the model to fit it. It no longer does for anything you have set a real size on.

If a model still looks the wrong size, the number to check is the overall height or width on that variation in **3D views**, not the spec sheet.

### When a model looks the right size but the wrong shape

A room full of furniture is a great deal for a browser to draw at once, so the planner used to thin out the detail in every model before putting it on screen. On a heavy model - a mesh-backed chair, say - you would never notice. On a simple one it went badly: the Oslo oval boardroom table lost the join between its top and the band round the edge, so the curved ends came out faceted, with a gap you could see through.

The planner now leaves a model alone unless it is genuinely heavy, and where it does thin one out it holds the outside edges still, which is where the damage always showed. There is also a **leave the detail alone** tick against each file in **Space Planner → Models** if you ever meet one that still does not survive the trip. Every model in your catalogue currently has that tick on.

### Measuring your 3D models

**Space Planner → Sizes → Measure** opens every 3D model you have, measures it, and remembers the answer. It is the single best thing you can do for how the planner looks, because a measured model beats anything written on a spec sheet.

It runs in the tab you start it in, so leave that tab open - it downloads each model to measure it, and a few hundred models takes a while. You can stop it at any point and start again later. Anything a customer has typed in by hand is left exactly as it was.

Worth running again after you add 3D models, and worth running once now if you have never run it.

Two things are worth your attention in **Space Planner → Sizes**:

- **Measurements we could not read.** The actual wording from the sheet, so you can fix it. "Overall Width: please enquire" takes a minute to sort and improves every plan afterwards.
- **The 3D model and the spec sheet disagree.** One of the two is wrong. This is exactly how a beautifully drawn room ends up full of furniture that is not the size it claims, so it is worth a look.

Filling in the category fallback sizes is the single cheapest thing you can do for the planner's quality - it is what turns "a plain block" into "roughly the right shape".

Delete a product and its remembered size hangs about until the nightly tidy-up clears it. Nothing on your shop uses it in the meantime; it only means the counts on this screen read a shade high for a day.

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

Once they are on and the picture service is set up, customers get a **Make a photo** button in the planner's toolbar, next to Export PDF. It only appears when both of those are true - a button that answers "not set up yet" is worse than no button at all. On a phone it lives behind **More**, with the other occasional things.

Pressing it opens the pictures for that layout: the last one taken, any before it, and a button to ask for a new one. Asking saves the layout first, because the picture is built from the saved plan and a desk moved a moment ago would otherwise be photographed where it used to be. Then it can be closed - the picture carries on without anybody watching it, and is waiting the next time they open it.

**Where the picture is taken from** is a choice on that dialog: where they are looking right now, any view they have kept, or standing at the wall looking down the room. That last one used to be the only answer, whether it suited the room or not, which explained a good few photographs arriving from somewhere nobody had pointed the camera.

**It is a proper photograph, not the preview blown up.** The room is built again on a machine of its own, with the full-size models, real lighting, real shadows and the soft darkening where a chair leg meets the floor - none of which a phone can be asked to draw sixty times a second, which is why the preview does not have them and why the picture takes a few minutes. Earlier versions promised this and quietly delivered the preview at a larger size, with the site header and the cookie bar sitting across the top of it. Both are sorted.

If your site already has a Fly.io key - and it probably does, because the video converter asks for one first - that button is the whole job. If it does not, there is one box to paste a key into: an **organisation** key from the Tokens page of your Fly.io dashboard, because a key tied to a single app cannot build anything new. Press the button, and the site builds its own picture service.

**Nothing runs, and nothing costs, between pictures.** There is no machine sitting there. When a customer asks for a picture, a machine is built for that one picture, and it is destroyed the moment the picture arrives. Ten customers asking at once get ten machines and ten pictures at the same time - which costs the same as ten one after another and takes a tenth as long. There is a ceiling on how many at once, so a busy afternoon cannot run away with your money; past it, a customer is asked to try again in a minute.

Three separate things make sure a machine goes away: the site deletes it when the picture lands, the machine puts itself to bed if it goes quiet, and the nightly tidy-up sweeps up anything that managed neither.

Already run your own render machine? Set `SPACE_PLANNER_RENDER_URL` and `SPACE_PLANNER_RENDER_SECRET` and the site will use that instead, and stay out of the way. It will not offer to build you a second one.

A picture is a photograph of a moment. If the customer moves things about afterwards, the picture is labelled with the date it shows rather than pretending to be current.

## Privacy and data

- The usage counts hold no personal data at all - no addresses, no session ids, nothing that identifies anybody. They are purged on the schedule you set.
- A customer's rooms, layouts and saved views come out in their ordinary account data export.
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
