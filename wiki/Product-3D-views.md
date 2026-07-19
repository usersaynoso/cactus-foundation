# Product 3D views

Some things are hard to sell from a photograph. A chair has a back, a lamp has a shape that a single angle flatters or ruins, and a shopper who cannot see round the thing tends to go and look somewhere they can.

This module lets you upload a 3D model to a product - or to one of its variations - and leads the product gallery with it. On a product that has a model the big view opens on the model rather than a photograph, and its thumbnail sits at the front of the strip with a small **3D** badge, turning slowly on its own so nobody has to be told it does something. A shopper can turn it, slide it about and zoom in as close as they like from the off; the photographs are right there in the strip for anyone who would rather see one.

Requires the **Shop** module. It works alongside **Shop Variations** if you have it, and perfectly well without.

---

## Adding a 3D model

1. Open a product under **Shop → Products**.
2. Go to the **3D views** tab.
3. If the product has variations, pick what the model is for: **the whole product**, or one particular variation.
4. Click **Add a 3D model**, then either pick a file you have uploaded before or upload a new one. The picker opens in the product's own 3d folder (see [Where the files live](#where-the-files-live)), so this product's models are what you see first - you can still browse into any other folder, and the search box covers the whole library.

That is the whole job. The model appears on the product page straight away - there is no layout to edit and no block to drag in. Your photographs stay exactly where they are, just behind the 3D view, which now leads the strip and opens the gallery.

To remove one, click **Remove** next to it in the list. A model you uploaded here is deleted properly rather than merely hidden, so it stops costing you storage - though not while the same file is still in use elsewhere on the product, in which case it waits until the last thing using it has gone. A file you picked from your media library is never deleted: it was yours before you attached it, so removing the model only unhooks it and leaves the file exactly where you keep it.

### Straight onto a variation

If you have **Shop Variations**, there is a quicker route for models that belong to one particular variation. The **Variations** tab now has a **3D** column sitting next to the Image column, and it behaves the way the picture beside it does. Click the **+** and you can either pick a 3D file you have uploaded before - the same idea as choosing an existing picture - or upload a new one; dropping a file straight onto the row still uploads it in one go. Either way that variation ends up with its model, with no dropdown and no leaving the table.

Both routes do exactly the same thing, so use whichever suits. The **3D views** tab is still the only place to put a model against the **whole product** rather than one variation.

One difference worth knowing: a model uploads the moment you drop it, rather than waiting for **Save** like the prices and stock counts in the same table. A file has either arrived or it hasn't, and pretending otherwise is a good way to lose one.

---

## Which file to use

**Use GLB if you have the choice.** It packs the shape, the colours and the textures into a single file, which is exactly what a web page wants.

| Format | How it does |
| --- | --- |
| **GLB** | The one to use. Everything in one file. |
| glTF | Fine, but if your model came as a `.gltf` with separate files beside it, only the shape will arrive. Export it as GLB instead. |
| OBJ | Works, but carries no colours of its own, so it shows in plain grey. |
| FBX | Works. Tends to make big files. |
| 3DS | Works. It is an old format and it looks it. |

Models can be up to **50 MB**. Bear in mind every shopper who opens that product downloads it, so smaller is kinder - and usually looks no worse.

### Models that move

If your GLB has an animation saved inside it, the viewer plays it, on a loop, as soon as the shopper opens the model. A desk with a pop-up power socket rising out of the top, a drawer sliding open, a chair arm folding down - if the file does it, the viewer does it.

There is nothing to switch on and nothing to configure. The movement is part of the file, so it is your 3D person's decision rather than a setting here, and a product that should move differently needs a new file rather than a new tick box.

Three things worth knowing:

- **Only the full viewer plays it.** Thumbnails stay still, which is rather the point of a thumbnail.
- **A shopper who has asked their device for less on-screen movement gets a still model.** That is their setting to make, not yours to override, and it is the same rule the gentle turning motion already follows.
- **Turning the model with your finger does not stop the animation.** The turning motion stops when touched, because it fights someone trying to look at one corner. An animation is usually the thing they opened the model to watch, so it keeps going.

### DWG and USDZ are not accepted

Two formats people reasonably expect are turned away at the door, and it is better to say why than to take the file and do nothing with it.

**DWG** is AutoCAD's own format. Nothing in any web browser can read one - turning it into something a shopper could see needs a separate paid conversion service. If your model started life in AutoCAD, export it as GLB or FBX and upload that.

**USDZ** is Apple's format for their augmented-reality preview. It only does anything on an iPhone or iPad, where it takes over the whole screen, and does nothing whatsoever on a computer or an Android phone. Since the entire point here is a model a shopper can turn round inside your product page, USDZ cannot do the job.

---

## Products with variations

If you have **Shop Variations** installed, each variation can carry its own model - the oak version and the walnut version of the same chair, say.

The quickest way to set one is the **3D** column on the product's **Variations** tab - drop a file onto the row, exactly as you would a photograph. The **3D views** tab's **Attach to** dropdown does the same job and is the only way to reach the whole product.

The rules are meant to match what a shopper expects:

- A model on **the whole product** shows while nothing more specific is on offer.
- Models on **variations** stay tucked away until the shopper actually picks that variation - the same way the photographs behave, where a variation's own picture only turns up once it is chosen. Nobody is shown oak, walnut and ash all at once before they have decided anything.
- Once a shopper **picks a variation that carries its own model**, that model takes over and the whole product's own drops out of the strip. The shopper is looking at the exact thing they have configured, so a second, near-identical thumbnail of the generic one is only there to be clicked by mistake. Other variations' models go too - leaving the oak one on screen after somebody picked walnut is worse than showing nothing.
- If the variation they pick has **no model of its own**, the product's own model stays put rather than the strip emptying.
- If several variations share the same model file - a run of sizes in one shape, typically - upload it against each of them. The gallery works out they are the same file and shows it **once**, not once per size.
- Changing one option away from a fully picked variation doesn't blank the model - it stays put until a new full combination is chosen (or nothing is picked at all), rather than flicking back to a photo mid-choice.
- Once the page has settled, the shop quietly fetches the product's other models and fabric colours in the background, so switching to a different option shows the new model or colour near-instantly rather than after a short wait. It only ever runs after the page is ready, so it never holds up the first view a shopper sees.
- When an option change swaps in a **different model** - a headrest appearing, a different base - the viewer keeps the shopper's viewing angle and zoom rather than snapping back to the opening view. Someone peering at a corner stays on that corner while the model changes under them, and the **Reset view** button still takes them back to the opening framing if they want it. If they hadn't touched the model yet, the slow turn simply carries on from where it was.

---

## The material configurator

Some products are the same shape in a great many finishes - a chair offered in two dozen seat colours and two dozen back colours is nine hundred-odd combinations, and uploading a model for each is a day nobody wants. The material configurator does it the other way round: the variation's own model is **re-covered live** as the shopper picks. Change the seat colour and the seat fabric changes on the model in front of them; change the desk top and the laminate changes. It is not only for cloth - upholstery, wood, veneer, laminate, metal, anything whose surface the shopper gets to choose works the same way. No reload, no separate file per finish.

It sits below the model list on the **3D views** tab, and appears only on a product that has variations. To set it up you need four things in place first:

1. **The model has named material parts.** When your 3D file was made, each surface needs a name - "Fabric seat" and "Oak top", say. Click **Detect from model** and the configurator lists the names it finds. If it finds none, the file's surfaces were not named, and your supplier will need to name them.
2. **A material per part.** Set your finishes up as a **Picture swatches** attribute - an "Upholstery" or "Veneer" attribute whose values each carry a photo of the real material - and point each material part of the model at it in the **Colour from** box. The part is then painted from whichever value that variation is given on its **Attributes** tab. Picture swatches are what the box offers, and for a good reason: a picture swatch also records how big the real material is, so pointing a part at one settles both what it looks like and how it should be scaled, with nothing else to keep in step. Where a part isn't the shopper's to choose - a painted frame, a powder-coated leg, a black plastic foot - choose **Manual** in the **Colour from** box instead and set one fixed colour for it, either from the colour picker or by pasting a hex code such as `#7a5c3a`. That part is then painted the same colour on every variation, with no option to set up and nothing for the shopper to pick.
3. **A size on each swatch.** Swatches come at real-world sizes - a 10×10 cm sample and a 20×20 cm sample tile differently on the same seat - so the texture is drawn at true scale. That size lives on the swatch itself: go to **Shop → Product attributes**, and beside each picture swatch type its real size ("20cm", "200mm", a plain "20" - all read alike). There is nothing to set here in the configurator. Set it once against the oak and every product painted with oak is scaled correctly, for good. A swatch you haven't got round to sizing simply shows in the right colour, untiled, until you do.
4. **One real measurement of the product.** To turn "this swatch is 20 cm" into the right number of tiles on the seat, the system needs the model's real size - and a 3D file doesn't reliably say whether it was built in millimetres or metres. So you give it one real dimension, and one is genuinely all it needs. In the configurator's **Overall size** section, the **Scale by** box picks which dimension you are giving it: **Overall height** or **Overall width**. Choose whichever your variations actually differ by - height for a chair that comes in three seat heights, width for a bench or a sideboard that comes in three lengths at one height. Then point the box beside it at a **Product Attribute** (for example "Overall Height", or "Overall Width") holding that measurement in cm, set per variation. Where every variation is the same - most products that vary in colour alone - choose **Manual** there instead and type the measurement in once. From that one number the system works out the true size of every surface and scales the texture itself. **There is no scale slider to nudge** - it's all worked out.

   It is deliberately one or the other and never both: a second measurement could only ever disagree with the first, and there is nothing useful to do with a disagreement. One note on width - it is read left to right as the model was built, so a file that arrived lying on its side wants re-exporting the right way up rather than a number fudged to suit.

**Turning a texture round.** Grain, weave and brushed metal all run in a direction, and a 3D file now and then arrives with one laid the wrong way - a wood grain running across a desk top rather than along it. Rather than sending the file back to whoever built it, set the **Rotation** box on that part: it's in degrees, so 90 lays the grain the other way round and anything in between works for a panel whose grain runs at an angle. It turns the pattern about the middle of the part, so nothing slides out of place, and it leaves the scale alone. A part set to a fixed colour has no Rotation box, a flat colour having no direction to speak of.

**Which model gets coloured.** Whatever model the chosen variation carries. Attach a model to each variation from the **3D** column on the **Variations** tab, exactly as you would its picture; if a shape changes rather than just its colour - a headrest that is there on one option and not on another - that is simply a different file on that variation, no special rule to set. Variations that are the same shape can share one file, uploaded against each. If a variation has no model of its own, the product's own model stands in. (This is also why the height is set per variation: a taller model is genuinely taller.)

Shoppers see your 3D models in the gallery as normal - the product's own to begin with, replaced by the variation's own once they pick a variation that has one. Once they have settled on a full combination, that variation's model leads the view, painted with the colours they chose, updating as they change their mind. There is no separate thumbnail per colour to wade through.

**Two things to finish off:** each picture swatch needs its **size** typed in on the **Product attributes** screen, and each variation needs its **overall height or width** - whichever you chose to scale by - filled in on the **Attributes** tab, unless you typed that measurement in by hand, in which case there is nothing left to fill. Where either is missing, that surface still shows in the right colour - only its scale sits neutral until you fill the values in, so the product works from day one.

**Where the same attribute is used twice.** A product can put one attribute up more than once, each copy under a name of its own - a chair whose "Fabric" attribute appears as **Seat fabric** and again as **Back fabric**, rather than two near-identical attributes in your shop's vocabulary. The configurator's **Overall height from** / **Overall width from** and **Colour from** boxes list each copy separately, under the name you gave it, so a material part is pointed at the one that actually carries its values. Pick **Seat fabric** for the seat and **Back fabric** for the back and each part is painted from its own, instead of both quietly taking whichever came first. Products that use an attribute once see it once, exactly as before, and nothing you set up previously needs revisiting.

**If you set one up the old way.** Products configured before the sizes moved onto the swatches keep working exactly as they did, including any part pointed at a variation option rather than an attribute - nothing is re-pointed behind your back and nothing needs revisiting.

Better still, those keep scaling properly too. Where a variation option shows the **same swatch picture** as one of your picture swatches - which is usually the case, since most shops photograph a swatch once and use it in both places - the size you typed against the picture is used, whichever of the two the part happens to be pointed at. So setting the sizes up on the **Product attributes** screen is enough on its own: you don't need to go back and re-point older products at anything.

A part on a fixed colour needs none of this, so it shows no size or rotation settings at all.

The configurator only starts colouring for shoppers once you have set up **at least one material part** and saved. Leave it untouched and your product behaves exactly as any other 3D product does.

### Not yet, but on the list

- **Leather as well as fabric.** Swapping between fabric and leather is more than a colour change - leather catches the light differently - so for now keep those as separate whole-model choices rather than a live swap.
- **Rectangular swatches.** A 10×20 cm swatch is read as 10 for now; square swatches are exact.

---

## Where the files live

Models are filed in your media library alongside the product's photographs, under:

**Shop → *category* → *product* → 3d**

So everything belonging to a product sits together in one place, rather than models ending up in a separate corner you have to go hunting through.

Each file is also named after the product it belongs to, the same way your product photographs are: upload `120cm-natural-wood-2-person-1.glb` to the Oslo desks and it's filed as `oslo-back-to-back-office-desks-120cm-natural-wood-2-person-1.glb`. Previously it kept a string of random letters on the front, which was tidy enough for a computer and no use whatsoever to you. If two of your variations happen to use the same file name, the second one quietly picks up a `-2` so neither can overwrite the other. Models uploaded before this stay exactly where and as they are - nothing has been renamed under your feet.

---

## How well protected are your models?

Reasonably, with one honest caveat.

Your model files are not left sitting at a permanent public address any more. Each link a shopper's browser is given is stamped with a pass that stops working after a day or two. So if somebody digs through the page code, copies the link and saves it for later, it will be dead by the time they get round to using it. And if a rival tries to point their own website at your model, it simply will not load for them.

The caveat: anything a browser can display, a determined person with the right tools can eventually capture. That is true of every 3D viewer on the web, ours included, because the shopper's own machine has to be handed the shape in order to draw it. What this does is move the effort from "right-click and save" to "write and maintain a scraper", which is where the great majority of casual copying gives up.

Your fabric swatch pictures are not covered by this, on purpose. They are photographs the shopper is already looking at in the colour picker, and they live in your media library alongside everything else, so locking them away would cause more bother than it saves.

**One thing you need to do.** This only takes effect once your media Worker has been redeployed. Go to **Settings → Media** and press **Deploy Worker**. Until you do, everything carries on working exactly as before - nothing breaks, you simply do not have the protection yet.

---

## Fine-tuning the viewer

Everything above works out of the box, and most shops will never need to touch a single setting. If you do want to change how your models are lit or handled, the controls live under **Settings → Shop → 3D Viewer**. They apply to every model on the site, not one product at a time, and they arrive set to the same sensible defaults the viewer has always used - so opening the tab changes nothing until you actually move something. There is a **Reset to defaults** button for when you have fiddled yourself into a corner.

The settings come in four groups.

**Lighting.** The studio your models stand in. The most useful control here is the one for shiny surfaces: chrome, steel and glass have no colour of their own and show you nothing but a reflection of the room, so if a polished product looks dull or too dark, turn the studio up. You can also switch on a **shadow** under the model to ground it rather than leave it floating - worth a look at your own products first, mind, because a model whose photograph already has a shadow baked in will end up wearing two. There is a colour-handling choice for the odd model that looks washed out here but perfect in whatever built it; picking one wakes a **Brightness** slider beside it, which sets how bright the whole catalogue renders.

These controls mean the same thing whatever format your models arrived in. That was not always true: an OBJ, FBX or 3DS used to be lit by an older, simpler set of rules than a GLB, which in practice meant it turned up noticeably brighter than the GLB standing next to it and shrugged off half the lighting settings you gave it. Every model is now treated the same way, so a shop with a mix of formats looks like one shop rather than several. If you had wound a particular product's brightness down to rescue an OBJ that was blowing out, it may now be too dark - have a look at it and put the slider back where it belongs, or untick the override entirely.

### Brightness for one product

One model in a range often arrives darker or lighter than its shelf-mates, and turning the whole site up to rescue it just breaks everything else. So brightness can also be set per product: on that product's **3D views** tab there is a **Viewer brightness** panel - tick **Set a brightness just for this product**, move the slider, done. It saves as you change it, covers the product's variations too, and unticking it puts the product straight back on the site-wide setting.

Ticking the box also brings up a preview underneath the slider, showing the product's own model - or, failing that, the first of its variations' - lit exactly as a shopper will see it, with the rest of your site-wide settings in place. Drag the slider and the preview keeps up, so you can stop when it looks right rather than saving, opening the shop in another tab and squinting. You can turn the model in the preview as well, which is worth doing before you settle: a brightness that flatters the front of something is not always kind to the back of it. The preview only appears while the tick is in, since loading a model is not something to do to every product page for the sake of a panel nobody is using. The panel only wakes once a colour handling other than **None** is picked in the site-wide settings, because without one the brightness dial - site-wide or per product - has nothing to turn.

On a product with variations, a row of dropdowns sits above the preview - the same options a shopper picks from. Choose a full set and the preview swaps to that variation's own model, so a brightness that suits the oak one can be checked against the walnut one before you settle. Leave any of them on **Any** and you get the product's own model, which is what a shopper sees before they have chosen anything. A combination that has no model of its own falls back to the product's model and says so underneath, rather than presenting you with an empty box and letting you wonder.

**Stage.** What sits behind the model. Transparent is the default and suits most shops, since it quietly follows your light and dark modes without being asked. You can swap it for a solid colour of your choosing, or show the studio itself behind the model.

**Handling.** How the model behaves when a shopper takes hold of it - whether it turns slowly on its own, how fast, whether they can slide it about, and how near or far they can zoom. There is also a choice of what the turning actually moves. Normally the view swings around a still model - drifting on its own or dragged by hand - so if you have a shadow switched on, it appears to travel round with the model. Tick **Spin the model itself** and the model turns on the spot instead, idling or dragged sideways, while its shadow stays anchored to the floor beneath it and changes shape as the model turns - which is what makes the turning obvious. Dragging up and down still tilts the view either way. It is only really worth pairing with the shadow, since without one there is nothing standing still to turn against. Anyone who has asked their device for less movement still gets a still model whatever you set here; that is their call to make, not yours to override - though they can of course still turn it by hand.

**Speed.** Mostly only worth touching if shoppers on older phones tell you the viewer is struggling - on anything reasonably modern the defaults cost nothing. The one dial here you might reach for on purpose is **Fine-detail sharpening**: turn it up if a fine fabric or other fine detail looks grainy or choppy when the whole model is on screen and tidies itself up only once a shopper zooms in. It draws the model at higher detail and smooths it back down, which does cost real speed - the top setting draws four times the work - so nudge it up only as far as it needs to go.

---

## If something looks wrong

**The thumbnail is there but the model never appears.** The file may be too complex, or damaged. Try re-exporting it as GLB.

**The model is plain white.** If it is an OBJ, that is simply what an OBJ looks like - the file does not carry its colours with it, so export it as GLB instead.

If it is a GLB and it looks right when you open it on your own computer, the site was failing to unpack the textures packed inside it, and anything coloured by a texture rather than by a flat colour came out white. A chair could lose its fabric to this while its arms and base looked perfectly normal, which made it look for all the world like a bad export. It was ours, not yours, and it is fixed - update to the latest version and give the page a refresh.

**Chrome, steel or aluminium looks black.** Also ours, also fixed, same advice: update and refresh. Polished metal has no colour of its own - everything you see in it is a reflection of the room it is standing in. We were not giving it a room, so it had nothing to reflect and turned black, while everything else on the same product looked perfectly fine. Your chair now stands in a plain, well-lit studio that we build for it, which is what every other 3D viewer has been quietly doing all along.

**The same finish looks darker on a variation than on the product's own model.** Ours, and fixed - update and refresh. A file that arrives without its colours is given a plain grey to stand in until something paints it, and that grey was being left underneath the swatch, dimming it. So a product whose own model was a GLB and whose variation was an OBJ showed the same beech twice, a shade apart, which is precisely what the configurator exists to avoid. A part you have set to a fixed colour is untouched by this - there, the colour is the finish.

**A fine fabric looks grainy or choppy when zoomed out, but fine once you zoom in.** The weave is finer than the screen can draw at that size, so it breaks up. Open the 3D viewer settings, find **Fine-detail sharpening** under Speed, and nudge it up until the surface holds together at a normal viewing distance. It costs some speed, so raise it only as far as it needs to go rather than straight to the top.

**The fabric shows as a flat colour with no visible weave.** Your file is probably asking for the weave to be shrunk to something smaller than a human hair, which averages out to a flat colour on any screen. Models exported from pCon/EasternGraphics have this - the weave is described correctly and then shrunk by a second instruction that should not be there. Ask your supplier for a corrected export, and mention that their exporter is writing a texture transform on top of texture coordinates that already carry the scale. Do note that even a correct weave is very fine: at the size the whole chair fits on screen you will barely see it, and it only really shows once a shopper zooms in - which is rather what the 3D viewer is for.

**The model shows but looks tiny, or enormous.** It shouldn't - models are sized to fit automatically, whatever units they were built in. If one genuinely looks wrong, the model most likely has stray geometry far away from the object itself, dragging the sizing out; clean that up in whatever built it.

**It does not turn on its own.** If you have "reduce motion" switched on in your computer's or phone's accessibility settings, the thumbnails hold still on purpose. Clicking through to the viewer still works normally.

**Nothing at all shows, on any product.** Check that a media provider is set up under **Settings → Media**. Models are stored the same way images are, so without one there is nowhere to put them.

**"Your media service needs updating before it will accept 3D files."** Exactly what it says, and the fix takes a minute. Go to **Settings → Media** and deploy the Worker again. Your media service is a small program that runs on Cloudflare and handles your files; it only learns new tricks when you send it a new copy, and accepting 3D models is a new trick. Once redeployed, upload as normal. Your existing images are untouched by this.

**Uploads fail on a model over 4 MB, and mention passing through the site.** Some storage providers - Cloudinary, ImageKit, Vercel Blob and Supabase - cannot take a file straight from your browser, so it has to travel through the site itself, and there is a hard 4 MB ceiling on that journey that we do not control. Most real models are bigger. Switching to **Cloudflare R2**, **Backblaze B2** or **S3** under **Settings → Media** lifts the limit to the full 50 MB.

---

**Wiki:** [Home](Home) · [Shop](Shop) · [Shop Variations](Shop-variations) · [Product Attributes](Product-attributes) · [Managing media](Managing-media) · [Modules](Modules)
