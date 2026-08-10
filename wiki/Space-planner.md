# Space Planner

The Space Planner lets a customer draw their own space to scale, put your furniture in it, and find out what actually fits before they spend anything. What they take away is a PDF with the floor plan and a priced item list in it, a full basket, or a quote request with the plan attached.

It is a module, so it is not there until you install it: **Modules → Add module →** `cactus-foundation-modules/space-planner-for-shop`.

**It arrives switched off for customers.** See [Staff only](#staff-only) - installing it puts the planner in your admin's hands and nowhere else until you say otherwise.

## What your customers see

**Drawing the space.** Two ways in, plus three shapes to start from. The first is the one most people want: type the width and depth, the way anybody standing in a space with a tape measure already has it. The second is to tap out the corners themselves - as many as the space has. Under that sit a small office, an open-plan rectangle and an L-shape to adjust.

**Spaces are not all rectangles**, and the planner does not pretend otherwise. Under **Space** they can drag any corner about, double-tap a wall to put a new corner in it, or remove one - so a bay, a return or a chimney breast is a couple of taps rather than a compromise. Walls snap square while they draw and write their own length as they go, and clicking any wall afterwards lets them type its exact length. If an outline ever folds through itself the planner says so and puts the last good one back. On a phone, drawing works the way the rest of the phone does: a tap puts a corner down, a drag slides the space about, and a pinch zooms - the same is true while placing doors or columns, and a stray second finger no longer plants anything. Escape always steps back out of whichever space-editing mode is open.

Measurements are always the **inside** of the space. That is what a tape measure gives you, so it is what the planner asks for.

**Putting things in it.** They search your catalogue, pick something, and it lands in the space at its real size, in the first clear space rather than on top of whatever is already there - and if the space has genuinely run out of clear floor, the planner says so instead of quietly stacking things. Listings with a proper 3D model are badged, because most listings have not got one and it saves a hunt - and the "only things with a 3D model" tick now filters the whole catalogue properly, with page counts that tell the truth. Cards say how many of that thing are already in the space, the category list is grouped into sections rather than one long pile, and the panel remembers the search, category and page they were on when they come back to it. Prices read exactly as they do on the rest of your site, "from" figures and all. So does what is on the shelf: if your shop is set to hide products that have sold out (**Settings → Shop → General → Out of stock products**), the browse panel does not offer them either, so nobody plans a space around something they cannot buy.

**Which one of it, though.** Anything that comes in sizes or finishes now asks before it goes in. Tapping the card opens the same choices your product page offers - swatches, sizes, the lot - and combinations you do not make are dimmed and struck through, with a line of text saying why, so nobody ends up in a dead end they cannot back out of. The chosen one's real size and real price appear before it is placed, and that is what gets placed - and a little counter alongside means six matching desks go in with one press rather than six trips through the choices. This matters more than it sounds: a range's own measurements describe the family rather than any member of it, so a boardroom table that comes in 180 and 240 cm has no width of its own to be placed at, and used to arrive at a category guess. Choosing first is what stops that.

**In the right colour.** Anything sent over from the basket arrives in the fabric or finish they actually chose, so a space of blue chairs is a space of blue chairs. Picked from the catalogue panel instead, where no colour has been chosen yet, it wears the first one you list - the same one the product page opens on.

**The basket gets a tab of its own.** Everything brought over from the basket sits under **Waiting** in the side panel - a proper list with pictures, prices and sizes, not the cramped strip it used to be - and each thing goes into the space with a tap, or all of them at once with one button. Changed their mind about something? It comes off the list without going in. Anything a redrawn space can no longer hold waits in the same place rather than being thrown away. The tab only appears while something is actually waiting, and the count on it says how much. A **Refresh from basket** button re-reads the basket if it has changed while the planner was open, and **Clear the list** empties it in one press - a basket of twenty lines at a dozen apiece is not something anybody should take off one at a time. If a basket line cannot come along - something since retired from the shop, say - the tab says so instead of leaving them to wonder. A basket bigger than one layout can hold brings over as much as will fit and says how many are waiting for the next one, rather than grinding to a halt building furniture it was never going to keep and then refusing to save at all. Somebody arriving from the basket before they have drawn a space is told their basket is coming along, too, and pressing **Start again** no longer brings a second copy of the whole basket in on top of the first.

**Adding a layout to the basket no longer doubles it.** Planning a space around the things already in your basket and then pressing **Add to basket** used to add the lot a second time - four desks in, eight desks out, under a message cheerfully reporting that four had been added. It now tops the basket up to match the space: put six desks in a space your basket had four of and you get six, put two in and the four stay as they are, because a button marked "add" has no business taking things out. If the space and the basket already agree, it says so rather than reporting nothing added.

**Refresh from basket only replaces what came from the basket.** Anything sitting in the list because a redrawn space could no longer hold it stays exactly where it is - it used to be deleted along with everything else, permanently, by the button next to it, which rather undid the promise that reshaping a space never loses anybody's work.

Things still waiting do not count against the limit on how many things a layout may hold. They are not in the space yet, and counting them produced the least useful message this tool has ever shown: a warning about two hundred things in a space that was empty.

**Without a mouse.** The whole planner can be driven from a keyboard from 0.1.23. A corner of the space can be picked from a list beside the drawing and then nudged with the arrow keys - a tenth of a metre a press, a centimetre with shift held - or typed straight to a position; corners can be added and removed from the same bar. A door's position along its wall and a column's position on the floor can both be typed. The 3D view takes the focus and answers to the arrow keys, which it had never actually done, whatever it said about itself.

**On a phone.** The side panel sits below the space at a steady, sensible height - the space keeps the top of the screen, the panel keeps the bottom, and each scrolls on its own. Search and category sit side by side to spend less of the screen on furniture-finding and more on furniture. Undo and redo sit on the space itself, bottom left: there is no Ctrl+Z on a touchscreen, and they were previously folded away behind **More**, which made a mis-drag rather more permanent than anybody intended.

**Doors and windows.** Under **Space → Doors & windows**, a tap on any wall puts one in it, and it can be slid along that wall, resized, or swapped between a door, a window and a plain opening. They are part of the space rather than part of one layout, so they follow the wall when it moves and they are still there in every layout tried in that space - and a desk in front of the only doorway is exactly the thing drawing the space was meant to catch.

**Columns and pillars.** Under **Space → Columns & pillars**, a tap on the floor drops one where the real one stands - a support column, a boxed-in riser, a chimney breast. Drag it about, type its width, depth and height, call it what you like. Once it is down it can be clicked again straight from the ordinary view - no going back through **Space** first - and its measurements, its name and **Remove** appear on the toolbar for as long as it is picked out. Escape, or **Done**, hands the toolbar back. Where a desk sits over a column the click belongs to the desk, since the desk is the thing being arranged and the column is a fact about the building. It draws on the plan and it stands in the 3D view as a proper column, floor to its own height, faintly see-through so a desk behind it is still a desk rather than a rumour. The planner treats it as floor nothing can occupy: new furniture is never dropped on top of one, and anything pushed into one gets the same amber warning two clashing desks do. Like doors, they belong to the space itself, so every layout tried in that space has them.

Dropping a column on top of a desk moves that desk to the waiting list there and then. It used to do nothing on screen and then, on the next save, quietly move the furniture in the customer's *other* layouts of the same space instead - the wrong furniture, in the layouts they were not looking at. Since columns belong to the space, a change to one really does reach every layout in it, and now it says so at the time.

**Moving things about.** Furniture snaps flat against a wall when they drag it near one, and comes away again the moment they drag it back - which sounds obvious and is worth saying, because it did not always. It also snaps to the other furniture: drag a desk near the one beside it and the two click together edge to edge, and line up on the other axis at the same time, so a bank of desks actually touches instead of nearly touching. Holding **alt** switches all the snapping off for the fussy moments.

**And through each other, when that is the point.** Keep pushing a chair at a desk and it goes under it, rather than stopping dead at the desk's edge. The click-together happens on the way in, from outside, which is what builds a bank of desks; push past it and the planner gets out of the way, because a chair under a desk and a pedestal under a worktop are arrangements somebody is aiming for rather than mistakes to be prevented. It still lines the chair up with the middle of the desk while it is under there, and the amber warning still knows the difference between a tucked-in chair and two desks in the same square metre. Turning something is a handle on the selected item - drag it round, in fifteen-degree steps unless alt is held - and anything mounted on it or tucked under it comes round with it.

**What it is all coming to.** The running total sits in the heading beside the floor area and the item count, so the answer to "can we afford a twelfth desk" is on screen while the decision is being made rather than a tab away. The **Item list** tab carries the count of what is in the space on the tab itself.

Everything counts the same things. A desk bought with its screens is a desk and its screens on screen, on the PDF, in the emailed layout and on the quote - one figure, everywhere. It was not: the paperwork counted the add-ons and the screen did not, so a quote could go out for more than the planner had ever shown. Where a range is priced from a figure rather than at one, the total says "from" rather than quietly presenting the lowest price as the answer.

**What is in the space, in a list.** The **Item list** tab totals everything up - each line shows the quantity, the price of one and the price of the lot, so twelve desks do not leave anybody doing the twelve-times table against a screen - and tapping a line picks out those items on the plan - six of one chair, all lit up at once. The **Selected** tab shows the chosen thing's measurements as plain reading rather than something to fiddle with: a product is the size it is. Anything the planner had to guess the size of is drawn with a dashed outline and a "≈" on its measurements, so a guess never dresses up as a fact - and the moment its 3D model is seen, the plan quietly corrects itself to the model's true size.

**A product you archive stops being priced.** It is named in the "no longer in the shop" line at the price it was when the customer saved it, on screen and on every document alike. Until now the screen dropped it and the PDF, the email and the quote went on charging your current price for something the checkout would refuse to sell - so the two disagreed, and the paperwork was the one that was wrong.

**Start again** sits on the toolbar. It throws the space away and keeps everything they have chosen, with a tick if they would rather clear that too.

**What "fits" means.** Furniture overlapping in plan is normal - a chair tucks under a desk, a pedestal slides under the desktop - so the planner only complains when things genuinely clash. A chair pushed under a desk overlaps it in both plan and height, and is not a clash; two desks in the same square metre is. Where we know the clearance under a desktop, it will say "fits underneath" or "5 cm too tall" while they are still dragging.

A clash is now said in words above the space, with a button that picks out the offenders, rather than only drawn as a red outline. That matters more than it sounds: anything left standing inside a column is moved to the waiting list when the space is saved, and somebody who could not see a red line had no idea why their furniture had moved.

A chair sticking out past the front edge of a desk is what tucking one under a desk looks like, and the planner now treats it that way. It used to want the chair to be no deeper than the desk, which office chairs rarely are - they are 64 to 69 cm deep and half of these desks are 60 - so the commonest arrangement in the catalogue came up red. What still comes up red is two things that are both the sort of thing others go under (two desks, a desk and a sideboard), anything too tall to be going under a desk at all, and anything overlapping a cupboard of desk height, which is solid to the floor and has no space beneath it whatever its top looks like.

**Two views.** **Edit** is the flat plan, where things are arranged. **Preview** is the space in 3D, which can be spun, tilted and zoomed, and where the walls nearest the viewer step out of the way so you are looking into the space rather than at the outside of a box. **Perspective** can be switched off there: on is how the space will look to somebody standing in it, off is how a drawing is drawn, where two identical desks are the same size on screen wherever they are in the space and can be compared by eye. The flat plan works on any device; the 3D view needs a reasonably modern one and says so plainly rather than showing a blank square. The note explaining how to drive it keeps to one line on a phone, where the space is only a few centimetres tall to begin with, and takes itself off after a few seconds whether or not anybody has touched anything.

**How tall you are.** A slider down the side of the 3D view sets eye height, with **Sitting** and **Standing** on it as one tap each and the height written out in the space's own units. Holding **alt** and scrolling does the same thing, as do Page Up and Page Down, for anybody who prefers not to reach for the slider. Whichever way, the view stays level - you simply get taller or shorter, rather than finding yourself looking at the ceiling.

**Keeping the angles you like.** Found the spot that shows the meeting table and the window at once? **Keep this view** puts it on the strip above the 3D view, where it can be renamed, pointed somewhere else, or clicked to stand there again. A saved view belongs to the **space** rather than to one layout, which is rather the point: every option tried in that space can be looked at, and photographed, from the identical spot. Twelve per space, which is more than anybody compares.

**Getting it out.** **Export PDF** makes a document with the space's measurements and the priced item list, plus the floor plan, the 3D view and a quote page if they tick for them. Any saved view can be ticked in too, each photographed from its own spot, so the document can show the space from the doorway and from the window without anybody re-aiming a camera. Your logo sits at the top of every page, and the floor plan always prints in ink-on-paper colours - a customer working in dark mode used to be handed a black plan. The quote page is laid out to match the quote document your shop already sends from the cart, on a page of its own, in your own quote wording and terms. Send the lot to the basket in one go. Ask for a quote, which lands in your ordinary Quotes list with a link to the layout. Or have the layout emailed to whoever holds the budget.

**Those last two only started working in 0.1.23**, and it is worth saying plainly: the machinery behind "ask for a quote", "email it to me", the share link and the version history had been finished, guarded and sat waiting since the first release, and nothing had ever been built to press it. So the four switches under **Shop settings → Space Planner** governed buttons that did not exist, no layout ever got a share link (which made the shared page and the **Shared** badge on your admin list unreachable), no layout was ever attached to a quote (so **Quotes asked for** on your Spaces & layouts screen sat at nought for ever), and every save quietly kept the version before it for nobody to read. All four buttons are on the toolbar now.

**Share a link.** Makes an address anybody can open - no account, nothing to sign up to - showing the measurements and the priced item list, and nothing they can change. **Stop sharing** takes it back, and the old address stops working there and then rather than eventually. Your customer can copy it straight out of the dialog.

**Earlier versions.** Every save has been keeping the one before it since day one. Your customer can now look back through them - when it was, how many things were in it - and put one back. Marking one as **kept** means it survives however many times they save afterwards. Putting one back is itself a save, so it archives whatever it replaced and can be undone by putting the one above it back.

**Delivery dates on the item list**, where your shop can work them out. Read off the saved layout rather than guessed in the browser, which is why they appear once a layout is saved and not before.

**If your shop is set to quote only with prices hidden, the planner hides them too - everywhere.** On screen, on the PDF, in the emailed layout and on the share link, which is a page anybody holding the address can open. That now genuinely means everywhere: the running total in the header, the item list beside the space and the catalogue panel they pick furniture from were all worked out in the customer's own browser, from figures the planner handed over before anybody had asked whether prices were meant to be shown - so a shop that hides its prices was printing them on the one screen the customer spends all their time looking at. The item list still lists everything, at its right sizes and quantities, with your own "price on application" wording where the figures would be.

**If a layout is deleted somewhere else while you are working on it**, the planner says so and the next Save keeps what is on screen as a new one. It used to say that too, and then go on trying to save over the deleted copy for ever - and for a space it advised pressing **Start again**, which throws the space outline away, so following the instruction destroyed the work it was supposed to rescue.

**Opening one again.** Everything saved is listed under **My spaces**, and every layout in it opens with a click - straight back into the planner with the space already drawn. A space has its own link for starting a fresh layout in it, which is the point of measuring once.

**Throwing one away.** Every layout in that list has a **Delete** beside it, and so does every space. It asks once before it does it, and deleting a space takes its layouts with it - the confirmation says how many, so nobody finds that out afterwards. It is the customer's own list, so this is theirs to tidy rather than yours.

The opening screen offers them too, so somebody coming back does not have to go via their account to find the office they measured last week. Their spaces are listed by name at the top of it, with the floor area and how many layouts are in each, and one click drops them back into the layout they last worked on. Six of them, and a link to the full list for anybody with more. A visitor with nothing saved never sees any of this, and one who is signed out gets a quiet line saying where their spaces went.

**Naming the space.** The space's name sits under the heading with a small pencil beside it, so it can be changed the moment they think of a better one - "Ground floor, east wing" rather than "My space". It is the name every layout, PDF and photograph is filed under, and on a space already saved the new name is kept straight away rather than waiting for the next save. The name, and nothing else: renaming used to carry whatever wall the customer happened to be dragging at the time, so typing a better name committed a shape change they had not agreed to and moved furniture in their other layouts of that space.

**Saving.** Saving needs an account. Everything up to that point works signed out, and what they were doing is kept in their browser so closing the tab is not a disaster - but the moment they press Save, they are asked to sign in. Their spaces then live under **My spaces** in their account, and a space can hold several layouts, so somebody can measure once and compare three options.

The trip to sign in is a clean one now. Pressing Save used to raise the browser's own "Leave site? Changes you made may not be saved" box first, and choosing to stay left the shopper on a note about making an account with nothing to click - at the exact moment they had decided to sign up. The space, the furniture and the name they gave the space all come back afterwards. And a session that quietly expired while the tab sat open now offers the sign-in page rather than showing "Sign in to save your layouts" as an error with no way forward.

## Staff only

**Shop settings → Space Planner → Hide the Space Planner from customers (staff only).** On to begin with, and it is the switch to reach for if you have decided the planner is not ready to be put in front of people who are paying you.

With it on, the planner is not on your shop at all. No button on the basket, no button on product pages, nothing where the teaser block sits, no tab in a customer's account, and `/space-planner` tells anyone who bookmarked it that the page does not exist. Behind that, the data it runs on says the same thing, so it is genuinely gone rather than merely out of sight.

Anyone signed in to your admin with Space Planner access carries on using it exactly as before, on the real catalogue, which is rather the point: you get to live with it for a fortnight before anybody else meets it.

Two things worth knowing:

- **Layouts you have already shared by link keep working.** You sent those to a specific person on purpose, and a staff-only planner is mostly a tool for building somebody's layout and sending it to them. What goes is the invitation at the bottom of the shared page to open the planner, which would only lead nowhere.
- **Saving still needs a customer account**, staff or not, because a saved space belongs to a customer. Drawing a space and filling it needs nothing but the switch; keeping it needs an account like everybody else's.

Turning it off lets customers in immediately - with one wrinkle. A page you built yourself carrying the **teaser** block is stored ready-made for speed, so the teaser may take until that page is next saved to appear or disappear. Every other button is immediate, and the planner's own address is immediate either way, so nobody is ever looking at a button that works when it should not.

## Where it appears on your site

Nothing shows up for customers until you put it somewhere - and nothing at all while it is [staff only](#staff-only):

- **The basket page.** On by default. This is the highest-intent spot on the site: they have picked everything and are quietly wondering whether it will all go in. The button hides itself on an empty basket.
- **Product pages.** Place the **Space Planner: see it in your space** block on your product layout, wherever it belongs - under the buy button on a desk, and nowhere at all on a box of pens.
- **Anywhere else.** The **Space Planner: teaser** block is a picture, a line of copy and a button. It is deliberately static: the planner itself only loads on its own page, so a page carrying the teaser is not slowed down by it.
- **Its own page**, at `/space-planner`.

## Sizes, and why some say "approx."

The planner will not invent a measurement. It works down a list, in order:

1. **Measured from the 3D model**, where there is one and you have run the measuring pass.
2. **Read from the spec sheet** - your Overall Width, Depth and Height values. A colour or size option that says nothing about its own dimensions takes them from the product it belongs to. Where a product carries two attributes that both claim to be its height - "Overall Height (Spec)" and "Overall Height", say - the more specific one wins, every time. It used to be settled by whichever the database happened to hand over first, which on this catalogue meant 294 products with two different published heights were split roughly two to one between them, and could swap sides after a bulk edit with nothing to show for it.
3. **A typical size for the category**, where the spec sheet is silent. Anything sized this way is labelled **approx.** on screen.
4. **Typed in by the customer**, if they know better. Nothing overwrites that, including a measurement.
5. **A plain labelled block** at an ordinary size, so nothing is ever un-placeable.

### How big the 3D model itself is drawn

The list above is about the space a thing takes up in the plan. How big the **model** is drawn is a separate question, and it now has a shorter answer.

Where you have told the 3D views setup how big a product really is - the overall height, or the overall width, that its materials are already scaled by - that one measurement decides it. The model is drawn to that size and nothing else about it is touched: a chair recorded at 111cm tall arrives 111cm tall, in the proportions its maker drew it in.

Only where no such measurement exists does the planner go back to reconciling the model against the spec sheet, which is where a model could come out squashed or stretched: a spec figure that is not quite the overall size - a seat height, a range like "111-127cm", a width measured to the worktop rather than to the frame - used to pull the model to fit it. It no longer does for anything you have set a real size on.

If a model still looks the wrong size, the number to check is the overall height or width on that variation in **3D views**, not the spec sheet.

A model whose product the ladder knows nothing at all about - no measurement, no spec sheet, no category size - is now drawn at the size it was made at, and that size is what gets written down. It used to be nudged towards the plain fallback block first, which is a made-up 800 by 600 by 750 that describes nothing, and the result was then filed as though somebody had measured it: a five-metre bench desk came out at four and a half, lost its **approx.** label, and quoted that size on the PDF and the emailed plan for good.

### When a model looks the right size but the wrong shape

A space full of furniture is a great deal for a browser to draw at once, so the planner used to thin out the detail in every model before putting it on screen. On a heavy model - a mesh-backed chair, say - you would never notice. On a simple one it went badly: the Oslo oval boardroom table lost the join between its top and the band round the edge, so the curved ends came out faceted, with a gap you could see through.

The planner now leaves a model alone unless it is genuinely heavy, and where it does thin one out it holds the outside edges still, which is where the damage always showed. There is also a **leave the detail alone** tick against each file in **Space Planner → Models** if you ever meet one that still does not survive the trip. Every model in your catalogue currently has that tick on.

**Space Planner → Models** shows what each file belongs to by product name, not only by its filename - nobody can tell forty chairs apart by their exports. Marking one checked takes it off the list, and **Show ones I have checked** brings them back if you spot a mistake later: previously a model marked checked left the only screen that could edit it, so a wrong rotation noticed afterwards could not be put right.

**If you have ever tried to correct a model on this screen and been told to check your connection, that was us, not your broadband.** Nothing on this screen could save - not a rotation, not the leave-detail-alone tick, not marking one checked - and it failed the same way every time, in a manner that reads exactly like a network problem. It saves now. Anything you tried to fix before and gave up on is worth another go.

### Measuring your 3D models

**Space Planner → Sizes → Measure** opens every 3D model you have, measures it, and remembers the answer. It is the single best thing you can do for how the planner looks, because a measured model beats anything written on a spec sheet.

Stopping it really is a pause now. Press Start again and it carries on from where it stopped, which on a catalogue of twenty thousand products is the difference between a coffee break and an afternoon. The same is true of **Work the sizes out again** below it - and if you left the page mid-run, Stop still works when you come back.

It runs in the tab you start it in, so leave that tab open - it downloads each model to measure it, and a few hundred models takes a while. You can stop it at any point and start again later. Anything a customer has typed in by hand is left exactly as it was.

Worth running again after you add 3D models, and worth running once now if you have never run it.

If you have run it before and it said a few hundred sizes "could not be saved", run it once more. That was a fault at our end rather than anything wrong with your models: a single model file shared by a great many products - the Eclipse Plus draughtsman kit is shared by 262 of them - was sent off in one lump too big to accept, and the same products were dropped on every run. It now goes in manageable batches, so those sizes save.

Two things are worth your attention in **Space Planner → Sizes**:

- **Measurements we could not read.** The actual wording from the sheet, so you can fix it. "Overall Width: please enquire" takes a minute to sort and improves every plan afterwards.
- **The 3D model and the spec sheet disagree.** One of the two is wrong. This is exactly how a beautifully drawn space ends up full of furniture that is not the size it claims, so it is worth a look.

### Typical sizes, by category

Filling in the category fallback sizes is the single cheapest thing you can do for the planner's quality - it is what turns "a plain block" into "roughly the right shape".

**Space Planner → Sizes → Typical sizes, by category** is where you do it. Categories with nothing set yet are listed first, worst first: beside each one is the number of products currently leaning on the gap, so ten minutes of typing goes where it is actually felt rather than wherever the alphabet put it. Set a width, a depth and a height in millimetres, say whether things in that category stand on the floor or sit on a desk, and save.

That count means what it says. A product filed in four categories is only ever sized from one of them, so it is counted once, under the one that will actually be asked - and every colour and size of a range is counted, not just the range itself. Both were wrong to begin with, which had the list recommending categories where the work would have changed nothing and burying the ones where it pays best.

Leaving all three measurements blank is refused. It looks harmless and is not: a category that exists but says nothing used to make everything under it claim a typical size while still being drawn as a plain block, which is exactly the silent guess the whole thing is built to avoid. If you want a category to stop having a fallback, remove it rather than emptying it.

None of this overrules anything. It is only ever the answer when a product has no measurement of its own and no 3D model to measure - which is precisely the product that would otherwise arrive as a featureless box.

Delete a product and its remembered size hangs about until the nightly tidy-up clears it. Nothing on your shop uses it in the meantime; it only means the counts on this screen read a shade high for a day.

## When a customer rings up about their layout

**Space Planner → Spaces & layouts** is the screen for that call. Search by customer, space or layout name, then click the row: it opens to show the space's size and ceiling height, anything the customer wrote about it, and the full item list - every product, its size, how many, what each costs and what the lot comes to. Enough to talk somebody through their own layout without asking them to read it out to you.

Anything in the layout that has since left your shop is named at the top of that list and priced at what it cost when they saved it, which is the honest figure to quote against.

There is a delete on the same panel, two presses apart. It is there for the customer who asks you to get rid of something rather than for tidying: it takes their layout away as well as yours.

## What to get 3D modelled next

**Space Planner → Spaces & layouts** also keeps a count of what customers keep placing that has no 3D model. That is your shopping list, in demand order, rather than a hunch.

## Settings

They live in **Shop settings → Space Planner**.

- **Hide the Space Planner from customers (staff only).** On by default. The whole feature disappears from your shop while your own staff carry on using it - see [Staff only](#staff-only).
- Where the buttons appear, and what they say.
- What customers can do with a layout: quote, email it to themselves, ask for a photoreal picture, show delivery dates. These four switches now genuinely govern four buttons - until 0.1.23 the buttons they were meant to control had never been built, so the switches sat there controlling nothing.
- Spacing guidance - walkway widths and the space behind a desk for a chair - and the wording that travels with every warning.
- Limits: how many spaces a customer keeps, how many layouts per space, how much goes in one layout.
- Housekeeping: how long usage counts are kept.

**There is no longer a "let customers download the 3D models" switch**, and it is worth being straight about why rather than quietly removing it. Nothing read it, so it never did anything - but more to the point it could not have. The planner sends the 3D files to the customer's browser in order to draw them at all, so anybody who knows where to look can save them. That is true of every 3D shop on the internet, not just this one. If keeping your suppliers' models off other people's computers matters to you commercially, say so and we will talk about what would actually help - short-lived addresses, serving the files through the site rather than direct, or simplified public versions. A tickbox was never going to be it.

## A word about the spacing warnings

They are rules of thumb to help arrange furniture. They are **not** a workplace assessment, not fire-safety or means-of-escape advice, and not a building-regulations check. That wording appears with every warning and on every printed layout, and you can edit it. A tool that draws a green tick next to a walkway must not be mistaken for one that has signed it off.

## Photoreal pictures

Off until you switch them on, and the admin says so rather than leaving you guessing. Switching them on is a button on **Space Planner -> Pictures**.

Once they are on and the picture service is set up, customers get a **Make a photo** button in the planner's toolbar, next to Export PDF. It only appears when both of those are true - a button that answers "not set up yet" is worse than no button at all. On a phone it lives behind **More**, with the other occasional things.

Pressing it opens the pictures for that layout: the last one taken, any before it, and a button to ask for a new one. Asking saves the layout first, because the picture is built from the saved plan and a desk moved a moment ago would otherwise be photographed where it used to be. Then it can be closed - the picture carries on without anybody watching it, and is waiting the next time they open it. A finished picture can be opened full size or saved straight to the device, which on a phone had previously been a long-press and a guess.

Two taps on the button in the same second used to start two pictures, and two machines. It now starts one, whatever the finger does.

**The picture shows the space as it was when they asked for it.** Since they are told to close the dialog and come back, carrying on planning while it works is the normal thing to do rather than an odd one - and the picture used to be taken of whatever the layout had become by the time the machine got round to it, while still being labelled with the moment they pressed the button. Move a desk in that minute and the photograph was of the new arrangement dated to the old one; redraw the space and it was a photograph of a space nobody had asked for, taken from a spot chosen for a different shape. The layout now travels with the request, so the picture and its date are the same moment.

**Where the picture is taken from** is a choice on that dialog: where they are looking right now, any view they have kept, or standing at the wall looking down the space. That last one used to be the only answer, whether it suited the space or not, which explained a good few photographs arriving from somewhere nobody had pointed the camera.

**It is a proper photograph, not the preview blown up.** The space is built again on a machine of its own, with the full-size models, real lighting, real shadows and the soft darkening where a chair leg meets the floor - none of which a phone can be asked to draw sixty times a second, which is why the preview does not have them and why the picture takes a few minutes. Earlier versions promised this and quietly delivered the preview at a larger size, with the site header and the cookie bar sitting across the top of it. Both are sorted.

If your site already has a Fly.io key - and it probably does, because the video converter asks for one first - that button is the whole job. If it does not, there is one box to paste a key into: an **organisation** key from the Tokens page of your Fly.io dashboard, because a key tied to a single app cannot build anything new. Press the button, and the site builds its own picture service.

**Nothing runs, and nothing costs, between pictures.** There is no machine sitting there. When a customer asks for a picture, a machine is built for that one picture, and it is destroyed the moment the picture arrives. Ten customers asking at once get ten machines and ten pictures at the same time - which costs the same as ten one after another and takes a tenth as long. There is a ceiling on how many at once, so a busy afternoon cannot run away with your money; past it, a customer is asked to try again in a minute.

Three separate things make sure a machine goes away: the site deletes it when the picture lands, the machine puts itself to bed if it goes quiet, and the nightly tidy-up sweeps up anything that managed neither.

Already run your own render machine? Set `SPACE_PLANNER_RENDER_URL` and `SPACE_PLANNER_RENDER_SECRET` and the site will use that instead, and stay out of the way. It will not offer to build you a second one.

A picture is a photograph of a moment. If the customer moves things about afterwards, the picture is labelled with the date it shows rather than pretending to be current.

## Privacy and data

- The usage counts hold no personal data at all - no addresses, no session ids, nothing that identifies anybody. They are purged on the schedule you set.
- A customer's spaces, layouts and saved views come out in their ordinary account data export.
- When somebody deletes their account, their spaces and layouts go with it on the next nightly tidy-up.
- Sharing a plan mints a private link. Nothing has one until they press Share, revoking it stops the link working straight away, and shared plans are kept out of search engines.

## Uninstalling

Unlike an order or a review, **a customer has no copy of a layout anywhere else**. So when you uninstall, "keep the data" (the recommended option, and the default) leaves everything where it is and a reinstall finds the layouts still there. The other option is permanent, and it is somebody's afternoon.

## What is not in this first version

Named here so nobody goes looking:

- Delivery dates on the item list. The column is drawn from 0.1.23, but it still needs a small addition to the Advanced Shipping module before your shop can fill it in.
- Downloading the whole space as a 3D file, sharing a whole space rather than one layout, and staff editing a customer's layout and sending it back.

The PDF export, the share link, the emailed copy and the quote all need an account, because each is made from the saved layout and the prices in it are worked out on our side rather than in the customer's browser. Everything up to that point still works signed out.

## Related

- [Quotes](Quotes) - where a layout's quote request lands.
- [Product 3D views](Product-3D-views) - where the 3D models come from.
- [Product attributes](Product-attributes) - where the measurements come from.
