# Product 3D views

Some things are hard to sell from a photograph. A chair has a back, a lamp has a shape that a single angle flatters or ruins, and a shopper who cannot see round the thing tends to go and look somewhere they can.

This module lets you upload a 3D model to a product - or to one of its variations - and leads the product gallery with it. On a product that has a model the big view opens on the model rather than a photograph, and its thumbnail sits at the front of the strip with a small **3D** badge, turning slowly on its own so nobody has to be told it does something. A shopper can turn it, slide it about and zoom in as close as they like from the off; the photographs are right there in the strip for anyone who would rather see one.

Requires the **Shop** module. It works alongside **Shop Variations** if you have it, and perfectly well without.

---

## Adding a 3D model

1. Open a product under **Shop → Products**.
2. Go to the **3D views** tab.
3. If the product has variations, pick what the model is for: **the whole product**, or one particular variation.
4. Click **Add a 3D model**, then either pick a file you have uploaded before or upload a new one.

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
| OBJ | Works, but carries no colours of its own, so it shows plain. |
| FBX | Works. Tends to make big files. |
| 3DS | Works. It is an old format and it looks it. |

Models can be up to **50 MB**. Bear in mind every shopper who opens that product downloads it, so smaller is kinder - and usually looks no worse.

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

---

## The material configurator

Some products are the same shape in a great many finishes - a chair offered in two dozen seat colours and two dozen back colours is nine hundred-odd combinations, and uploading a model for each is a day nobody wants. The material configurator does it the other way round: the variation's own model is **re-covered live** as the shopper picks. Change the seat colour and the seat fabric changes on the model in front of them; change the desk top and the laminate changes. It is not only for cloth - upholstery, wood, veneer, laminate, metal, anything whose surface the shopper gets to choose works the same way. No reload, no separate file per finish.

It sits below the model list on the **3D views** tab, and appears only on a product that has variations. To set it up you need four things in place first:

1. **The model has named material parts.** When your 3D file was made, each surface needs a name - "Fabric seat" and "Oak top", say. Click **Detect from model** and the configurator lists the names it finds. If it finds none, the file's surfaces were not named, and your supplier will need to name them.
2. **A colour option per part.** Your product's variations supply the choices - a **Seat Colour** option and a **Top Finish** option, each with its swatches. In the configurator you simply point each material part at the option that changes it. Where a part isn't the shopper's to choose - a painted frame, a powder-coated leg, a black plastic foot - choose **Manual** in the **Colour from** box instead and set one fixed colour for it, either from the colour picker or by pasting a hex code such as `#7a5c3a`. That part is then painted the same colour on every variation, with no option to set up and nothing for the shopper to pick.
3. **A swatch size per part.** Swatches come at real-world sizes - a 10×10 cm sample and a 20×20 cm sample tile differently on the same seat - so the texture is drawn at true scale. Set this up with a **Product Attribute** (for example "Seat Material Size") holding the sizes, and point each material part at it. This is set per variation, by you - it tells the system what real size the swatch picture covers. Where a finish is the same size right across the range - a laminate or a veneer usually is - choose **Manual** in the **Size from** box instead and simply type the size in: "20cm", "200mm" and a plain "20" all read the same way, and it then applies to every variation without an attribute to maintain.
4. **An overall-height attribute.** To turn "this swatch is 20 cm" into the right number of tiles on the seat, the system needs the model's real size - and a 3D file doesn't reliably say whether it was built in millimetres or metres. So you give it one real dimension: a **Product Attribute** (for example "Overall Height") holding the product's real height in cm, set per variation, and pick it in the configurator's **Overall height from** box. Where every variation stands the same height - most products that vary in colour alone - choose **Manual** there instead and type the height in once. From that one number the system works out the true size of every surface and scales the texture itself. **There is no scale slider to nudge** - it's all worked out.

**Turning a texture round.** Grain, weave and brushed metal all run in a direction, and a 3D file now and then arrives with one laid the wrong way - a wood grain running across a desk top rather than along it. Rather than sending the file back to whoever built it, set the **Rotation** box on that part: it's in degrees, so 90 lays the grain the other way round and anything in between works for a panel whose grain runs at an angle. It turns the pattern about the middle of the part, so nothing slides out of place, and it leaves the scale alone. A part set to a fixed colour has no Rotation box, a flat colour having no direction to speak of.

**Which model gets coloured.** Whatever model the chosen variation carries. Attach a model to each variation from the **3D** column on the **Variations** tab, exactly as you would its picture; if a shape changes rather than just its colour - a headrest that is there on one option and not on another - that is simply a different file on that variation, no special rule to set. Variations that are the same shape can share one file, uploaded against each. If a variation has no model of its own, the product's own model stands in. (This is also why the height is set per variation: a taller model is genuinely taller.)

Shoppers see your 3D models in the gallery as normal - the product's own to begin with, replaced by the variation's own once they pick a variation that has one. Once they have settled on a full combination, that variation's model leads the view, painted with the colours they chose, updating as they change their mind. There is no separate thumbnail per colour to wade through.

**One thing to finish off:** for the texture to be true-scale everywhere, each variation needs its **swatch size** and **overall height** filled in on the **Attributes** tab - unless you typed those in by hand, in which case there is nothing left to fill. Where either is missing, that surface still shows in the right colour - only its scale sits neutral until you fill the values in, so the product works from day one.

Because both measurements can be typed in, the configurator also works on a site with no product attributes set up at all: choose **Manual** in both boxes, type the two sizes, and you are done. A part on a fixed colour needs neither, so its size boxes disappear altogether.

The configurator only starts colouring for shoppers once you have set up **at least one material part** and saved. Leave it untouched and your product behaves exactly as any other 3D product does.

### Not yet, but on the list

- **Leather as well as fabric.** Swapping between fabric and leather is more than a colour change - leather catches the light differently - so for now keep those as separate whole-model choices rather than a live swap.
- **Rectangular swatches.** A 10×20 cm swatch is read as 10 for now; square swatches are exact.

---

## Where the files live

Models are filed in your media library alongside the product's photographs, under:

**Shop → *category* → *product* → 3d**

So everything belonging to a product sits together in one place, rather than models ending up in a separate corner you have to go hunting through.

---

## Fine-tuning the viewer

Everything above works out of the box, and most shops will never need to touch a single setting. If you do want to change how your models are lit or handled, the controls live under **Settings → Shop → 3D Viewer**. They apply to every model on the site, not one product at a time, and they arrive set to the same sensible defaults the viewer has always used - so opening the tab changes nothing until you actually move something. There is a **Reset to defaults** button for when you have fiddled yourself into a corner.

The settings come in four groups.

**Lighting.** The studio your models stand in. The most useful control here is the one for shiny surfaces: chrome, steel and glass have no colour of their own and show you nothing but a reflection of the room, so if a polished product looks dull or too dark, turn the studio up. You can also switch on a **shadow** under the model to ground it rather than leave it floating - worth a look at your own products first, mind, because a model whose photograph already has a shadow baked in will end up wearing two. There is a colour-handling choice for the odd model that looks washed out here but perfect in whatever built it; picking one wakes a **Brightness** slider beside it, which sets how bright the whole catalogue renders.

### Brightness for one product

One model in a range often arrives darker or lighter than its shelf-mates, and turning the whole site up to rescue it just breaks everything else. So brightness can also be set per product: on that product's **3D views** tab there is a **Viewer brightness** panel - tick **Set a brightness just for this product**, move the slider, done. It saves as you change it, covers the product's variations too, and unticking it puts the product straight back on the site-wide setting. The panel only wakes once a colour handling other than **None** is picked in the site-wide settings, because without one the brightness dial - site-wide or per product - has nothing to turn.

**Stage.** What sits behind the model. Transparent is the default and suits most shops, since it quietly follows your light and dark modes without being asked. You can swap it for a solid colour of your choosing, or show the studio itself behind the model.

**Handling.** How the model behaves when a shopper takes hold of it - whether it turns slowly on its own, how fast, whether they can slide it about, and how near or far they can zoom. There is also a choice of what the turning actually moves. Normally the view swings around a still model - drifting on its own or dragged by hand - so if you have a shadow switched on, it appears to travel round with the model. Tick **Spin the model itself** and the model turns on the spot instead, idling or dragged sideways, while its shadow stays anchored to the floor beneath it and changes shape as the model turns - which is what makes the turning obvious. Dragging up and down still tilts the view either way. It is only really worth pairing with the shadow, since without one there is nothing standing still to turn against. Anyone who has asked their device for less movement still gets a still model whatever you set here; that is their call to make, not yours to override - though they can of course still turn it by hand.

**Speed.** Mostly only worth touching if shoppers on older phones tell you the viewer is struggling - on anything reasonably modern the defaults cost nothing. The one dial here you might reach for on purpose is **Fine-detail sharpening**: turn it up if a fine fabric or other fine detail looks grainy or choppy when the whole model is on screen and tidies itself up only once a shopper zooms in. It draws the model at higher detail and smooths it back down, which does cost real speed - the top setting draws four times the work - so nudge it up only as far as it needs to go.

---

## If something looks wrong

**The thumbnail is there but the model never appears.** The file may be too complex, or damaged. Try re-exporting it as GLB.

**The model is plain white.** If it is an OBJ, that is simply what an OBJ looks like - the file does not carry its colours with it, so export it as GLB instead.

If it is a GLB and it looks right when you open it on your own computer, the site was failing to unpack the textures packed inside it, and anything coloured by a texture rather than by a flat colour came out white. A chair could lose its fabric to this while its arms and base looked perfectly normal, which made it look for all the world like a bad export. It was ours, not yours, and it is fixed - update to the latest version and give the page a refresh.

**Chrome, steel or aluminium looks black.** Also ours, also fixed, same advice: update and refresh. Polished metal has no colour of its own - everything you see in it is a reflection of the room it is standing in. We were not giving it a room, so it had nothing to reflect and turned black, while everything else on the same product looked perfectly fine. Your chair now stands in a plain, well-lit studio that we build for it, which is what every other 3D viewer has been quietly doing all along.

**A fine fabric looks grainy or choppy when zoomed out, but fine once you zoom in.** The weave is finer than the screen can draw at that size, so it breaks up. Open the 3D viewer settings, find **Fine-detail sharpening** under Speed, and nudge it up until the surface holds together at a normal viewing distance. It costs some speed, so raise it only as far as it needs to go rather than straight to the top.

**The fabric shows as a flat colour with no visible weave.** Your file is probably asking for the weave to be shrunk to something smaller than a human hair, which averages out to a flat colour on any screen. Models exported from pCon/EasternGraphics have this - the weave is described correctly and then shrunk by a second instruction that should not be there. Ask your supplier for a corrected export, and mention that their exporter is writing a texture transform on top of texture coordinates that already carry the scale. Do note that even a correct weave is very fine: at the size the whole chair fits on screen you will barely see it, and it only really shows once a shopper zooms in - which is rather what the 3D viewer is for.

**The model shows but looks tiny, or enormous.** It shouldn't - models are sized to fit automatically, whatever units they were built in. If one genuinely looks wrong, the model most likely has stray geometry far away from the object itself, dragging the sizing out; clean that up in whatever built it.

**It does not turn on its own.** If you have "reduce motion" switched on in your computer's or phone's accessibility settings, the thumbnails hold still on purpose. Clicking through to the viewer still works normally.

**Nothing at all shows, on any product.** Check that a media provider is set up under **Settings → Media**. Models are stored the same way images are, so without one there is nowhere to put them.

**"Your media service needs updating before it will accept 3D files."** Exactly what it says, and the fix takes a minute. Go to **Settings → Media** and deploy the Worker again. Your media service is a small program that runs on Cloudflare and handles your files; it only learns new tricks when you send it a new copy, and accepting 3D models is a new trick. Once redeployed, upload as normal. Your existing images are untouched by this.

**Uploads fail on a model over 4 MB, and mention passing through the site.** Some storage providers - Cloudinary, ImageKit, Vercel Blob and Supabase - cannot take a file straight from your browser, so it has to travel through the site itself, and there is a hard 4 MB ceiling on that journey that we do not control. Most real models are bigger. Switching to **Cloudflare R2**, **Backblaze B2** or **S3** under **Settings → Media** lifts the limit to the full 50 MB.

---

**Wiki:** [Home](Home) · [Shop](Shop) · [Shop Variations](Shop-variations) · [Product Attributes](Product-attributes) · [Managing media](Managing-media) · [Modules](Modules)
