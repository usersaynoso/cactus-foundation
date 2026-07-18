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

To remove one, click **Remove** next to it in the list. The file is deleted properly rather than merely hidden, so it stops costing you storage.

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

- A model on **the whole product** always shows.
- Models on **variations** stay tucked away until the shopper actually picks that variation - the same way the photographs behave, where a variation's own picture only turns up once it is chosen. Nobody is shown oak, walnut and ash all at once before they have decided anything.
- Once a shopper **picks a variation**, that one's model shows alongside the product's own. Leaving the oak one on screen after somebody picked walnut is worse than showing nothing.
- If several variations share the same model file - a run of sizes in one shape, typically - upload it against each of them. The gallery works out they are the same file and shows it **once**, not once per size.

---

## The fabric configurator

Some products are the same shape in a great many fabrics - a chair offered in two dozen seat colours and two dozen back colours is nine hundred-odd combinations, and uploading a model for each is a day nobody wants. The fabric configurator does it the other way round: **one model, re-coloured live** as the shopper picks. Change the seat colour and the seat fabric changes on the model in front of them; change the back and the back changes. No reload, no second file.

It sits below the model list on the **3D views** tab, and appears only on a product that has variations. To set it up you need four things in place first:

1. **The model has named fabric parts.** When your 3D file was made, each fabric area needs a name - "Fabric seat" and "Fabric back", say. Click **Detect from model** and the configurator lists the names it finds. If it finds none, the file's fabric areas were not named, and your supplier will need to name them.
2. **A colour option per part.** Your product's variations supply the colours - a **Seat Colour** option and a **Back Colour** option, each with its swatches. In the configurator you simply point each fabric part at the option that changes it.
3. **A swatch size per part.** Fabric swatches come at real-world sizes - a 10×10 cm sample and a 20×20 cm sample tile differently on the same seat - so the weave is drawn at true scale. Set this up with a **Product Attribute** (for example "Seat Material Size") holding the sizes, and point each fabric part at it. This is set per variation, by you - it tells the system what real size the swatch picture covers.
4. **An overall-height attribute.** To turn "this swatch is 20 cm" into the right number of tiles on the seat, the system needs the model's real size - and a 3D file doesn't reliably say whether it was built in millimetres or metres. So you give it one real dimension: a **Product Attribute** (for example "Overall Height") holding the product's real height in cm, set per variation, and pick it in the configurator's **Overall height from** box. From that one number the system works out the true size of every fabric surface and scales the weave itself. **There is no scale slider to nudge** - it's all worked out.

If a part of the shape changes rather than just its colour - a headrest that is there on one option and not on another - add a **model rule** for it, pointing each option value at the file that has it. The configurator shows one file or the other; the colours are still painted on whichever is showing. (This is also why the height is set per variation: the with-headrest model is genuinely taller.)

Shoppers see a single **3D configurator** in the gallery that updates as they choose, rather than a separate thumbnail per colour - though not until they have picked a variation. Before that there is nothing to re-colour yet, so the gallery leads with the product's own model or photographs as normal, the same as any other 3D product.

**One thing to finish off:** for the weave to be true-scale everywhere, each variation needs its **swatch size** and **overall height** filled in on the **Attributes** tab. Where either is missing, that fabric still shows in the right colour - only its weave scale sits neutral until you fill the values in, so the product works from day one.

The configurator only appears to shoppers once you have set a **default model** in it and saved. Leave it untouched and your product behaves exactly as any other 3D product does.

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

**Lighting.** The studio your models stand in. The most useful control here is the one for shiny surfaces: chrome, steel and glass have no colour of their own and show you nothing but a reflection of the room, so if a polished product looks dull or too dark, turn the studio up. You can also switch on a **shadow** under the model to ground it rather than leave it floating - worth a look at your own products first, mind, because a model whose photograph already has a shadow baked in will end up wearing two. There is a colour-handling choice for the odd model that looks washed out here but perfect in whatever built it.

**Stage.** What sits behind the model. Transparent is the default and suits most shops, since it quietly follows your light and dark modes without being asked. You can swap it for a solid colour of your choosing, or show the studio itself behind the model.

**Handling.** How the model behaves when a shopper takes hold of it - whether it turns slowly on its own, how fast, whether they can slide it about, and how near or far they can zoom. Anyone who has asked their device for less movement still gets a still model whatever you set here; that is their call to make, not yours to override.

**Speed.** Only worth touching if shoppers on older phones tell you the viewer is struggling. On anything reasonably modern the defaults cost nothing.

---

## If something looks wrong

**The thumbnail is there but the model never appears.** The file may be too complex, or damaged. Try re-exporting it as GLB.

**The model is plain white.** If it is an OBJ, that is simply what an OBJ looks like - the file does not carry its colours with it, so export it as GLB instead.

If it is a GLB and it looks right when you open it on your own computer, the site was failing to unpack the textures packed inside it, and anything coloured by a texture rather than by a flat colour came out white. A chair could lose its fabric to this while its arms and base looked perfectly normal, which made it look for all the world like a bad export. It was ours, not yours, and it is fixed - update to the latest version and give the page a refresh.

**Chrome, steel or aluminium looks black.** Also ours, also fixed, same advice: update and refresh. Polished metal has no colour of its own - everything you see in it is a reflection of the room it is standing in. We were not giving it a room, so it had nothing to reflect and turned black, while everything else on the same product looked perfectly fine. Your chair now stands in a plain, well-lit studio that we build for it, which is what every other 3D viewer has been quietly doing all along.

**The fabric shows as a flat colour with no visible weave.** Your file is probably asking for the weave to be shrunk to something smaller than a human hair, which averages out to a flat colour on any screen. Models exported from pCon/EasternGraphics have this - the weave is described correctly and then shrunk by a second instruction that should not be there. Ask your supplier for a corrected export, and mention that their exporter is writing a texture transform on top of texture coordinates that already carry the scale. Do note that even a correct weave is very fine: at the size the whole chair fits on screen you will barely see it, and it only really shows once a shopper zooms in - which is rather what the 3D viewer is for.

**The model shows but looks tiny, or enormous.** It shouldn't - models are sized to fit automatically, whatever units they were built in. If one genuinely looks wrong, the model most likely has stray geometry far away from the object itself, dragging the sizing out; clean that up in whatever built it.

**It does not turn on its own.** If you have "reduce motion" switched on in your computer's or phone's accessibility settings, the thumbnails hold still on purpose. Clicking through to the viewer still works normally.

**Nothing at all shows, on any product.** Check that a media provider is set up under **Settings → Media**. Models are stored the same way images are, so without one there is nowhere to put them.

**"Your media service needs updating before it will accept 3D files."** Exactly what it says, and the fix takes a minute. Go to **Settings → Media** and deploy the Worker again. Your media service is a small program that runs on Cloudflare and handles your files; it only learns new tricks when you send it a new copy, and accepting 3D models is a new trick. Once redeployed, upload as normal. Your existing images are untouched by this.

**Uploads fail on a model over 4 MB, and mention passing through the site.** Some storage providers - Cloudinary, ImageKit, Vercel Blob and Supabase - cannot take a file straight from your browser, so it has to travel through the site itself, and there is a hard 4 MB ceiling on that journey that we do not control. Most real models are bigger. Switching to **Cloudflare R2**, **Backblaze B2** or **S3** under **Settings → Media** lifts the limit to the full 50 MB.

---

**Wiki:** [Home](Home) · [Shop](Shop) · [Shop Variations](Shop-variations) · [Product Attributes](Product-attributes) · [Managing media](Managing-media) · [Modules](Modules)
