# Product 3D views

Some things are hard to sell from a photograph. A chair has a back, a lamp has a shape that a single angle flatters or ruins, and a shopper who cannot see round the thing tends to go and look somewhere they can.

This module lets you upload a 3D model to a product - or to one of its variations - and shows it in the product gallery as an extra thumbnail with a small **3D** badge, turning slowly on its own so nobody has to be told it does something. Click it and the model takes the place of the main photograph, where a shopper can turn it, slide it about and zoom in as close as they like.

Requires the **Shop** module. It works alongside **Shop Variations** if you have it, and perfectly well without.

---

## Adding a 3D model

1. Open a product under **Shop → Products**.
2. Go to the **3D views** tab.
3. If the product has variations, pick what the model is for: **the whole product**, or one particular variation.
4. Click **Add a 3D model** and choose your file.

That is the whole job. The model appears on the product page straight away - there is no layout to edit and no block to drag in. Your photographs stay exactly where they are; the 3D thumbnail simply joins them in the strip.

To remove one, click **Remove** next to it in the list. The file is deleted properly rather than merely hidden, so it stops costing you storage.

### Straight onto a variation

If you have **Shop Variations**, there is a quicker route for models that belong to one particular variation. The **Variations** tab now has a **3D** column sitting next to the Image column, and it behaves the way the picture beside it does: drop a file onto a row, or click the **+**, and that variation has its model. No dropdown, no leaving the table.

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
- Models on **variations** show all together while the shopper has not chosen yet, so they can look through the options.
- Once a shopper **picks a variation**, only that one's model shows. Leaving the oak one on screen after somebody picked walnut is worse than showing nothing.
- If several variations share the same model file - a run of sizes in one shape, typically - upload it against each of them. The gallery works out they are the same file and shows it **once**, not once per size.

---

## Where the files live

Models are filed in your media library alongside the product's photographs, under:

**Shop → *category* → *product* → 3d**

So everything belonging to a product sits together in one place, rather than models ending up in a separate corner you have to go hunting through.

---

## If something looks wrong

**The thumbnail is there but the model never appears.** The file may be too complex, or damaged. Try re-exporting it as GLB.

**The model is plain white.** If it is an OBJ, that is simply what an OBJ looks like - the file does not carry its colours with it, so export it as GLB instead.

If it is a GLB and it looks right when you open it on your own computer, the site was failing to unpack the textures packed inside it, and anything coloured by a texture rather than by a flat colour came out white. A chair could lose its fabric to this while its arms and base looked perfectly normal, which made it look for all the world like a bad export. It was ours, not yours, and it is fixed - update to the latest version and give the page a refresh.

**The model shows but looks tiny, or enormous.** It shouldn't - models are sized to fit automatically, whatever units they were built in. If one genuinely looks wrong, the model most likely has stray geometry far away from the object itself, dragging the sizing out; clean that up in whatever built it.

**It does not turn on its own.** If you have "reduce motion" switched on in your computer's or phone's accessibility settings, the thumbnails hold still on purpose. Clicking through to the viewer still works normally.

**Nothing at all shows, on any product.** Check that a media provider is set up under **Settings → Media**. Models are stored the same way images are, so without one there is nowhere to put them.

**"Your media service needs updating before it will accept 3D files."** Exactly what it says, and the fix takes a minute. Go to **Settings → Media** and deploy the Worker again. Your media service is a small program that runs on Cloudflare and handles your files; it only learns new tricks when you send it a new copy, and accepting 3D models is a new trick. Once redeployed, upload as normal. Your existing images are untouched by this.

**Uploads fail on a model over 4 MB, and mention passing through the site.** Some storage providers - Cloudinary, ImageKit, Vercel Blob and Supabase - cannot take a file straight from your browser, so it has to travel through the site itself, and there is a hard 4 MB ceiling on that journey that we do not control. Most real models are bigger. Switching to **Cloudflare R2**, **Backblaze B2** or **S3** under **Settings → Media** lifts the limit to the full 50 MB.

---

**Wiki:** [Home](Home) · [Shop](Shop) · [Shop Variations](Shop-variations) · [Product Attributes](Product-attributes) · [Managing media](Managing-media) · [Modules](Modules)
