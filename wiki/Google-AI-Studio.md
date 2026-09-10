# Google AI Studio

One key from Google, and your site can make pictures for you.

This module holds the key and nothing else does. The first thing it uses it for is product
photography: on any product's **Images** tab you get an **AI photo creation** section, where you tick
the photographs you already have, say what you would like, and pick from what comes back.

It is not a replacement for a photographer. It is for the shot you were never going to pay for - the
same desk in a different room, the chair from an angle the supplier never sent, a square version of a
picture that only exists in landscape.

---

## Setting it up

1. Install the module from **Modules** in the admin.
2. Go to [aistudio.google.com](https://aistudio.google.com), sign in with a Google account, and use
   **Get API key**.
3. Paste the key into **Settings → Google AI Studio** and press **Save**.

That is the whole setup. The key is stored scrambled, and it is never shown back to you - if you lose
it, make another one at Google and paste that in instead.

> **Google charges for this.** Every picture is billed to the account the key belongs to. Nothing on
> this site will spend that money without you pressing a button, but the button does spend it, so it
> is worth knowing what Google's rates are before you go and make forty of them.

---

## Making pictures for a product

1. Open a product under **Shop → Catalogue** and go to the **Images** tab.
2. Scroll past the picture grid to **AI photo creation**.
3. **Tick the photographs to work from.** These are what tell Google what the product actually looks
   like, so pick the clearest ones. You get:
   - **This product** - the photographs in the grid above. Open to start with, because it is the one
     you nearly always want.
   - **Variations** - the lead photograph from each variation, if you use them.
   - **Attribute pictures** - fabrics, finishes and the like, if you use picture attributes.

   The last two are folded away until you click them - a range with forty variations is a lot of
   scrolling past on the way to the prompt box. Each heading says how many pictures are inside and
   how many you have ticked, so a folded group never hides a choice you have made.
4. **Add angles from your 3D model, if the product has one.** See below.
5. **Say what you would like.** Describe the *shot*, not the product: "the same desk in a bright
   open-plan office, seen from the side" rather than "an oak desk". The pictures you ticked are
   already doing the describing.
6. Choose **how many** and what **shape**, and press **Create pictures**.

They arrive one at a time. When they have all landed, tick the ones worth keeping and press
**Add to product images**.

---

## Working from your 3D model

With the **3D views** module installed, a product that has a 3D model gets a **From 3D models**
button under the photographs. This is the answer to the commonest problem with the whole feature:
you have three photographs of a chair, all from the front, and you would like a picture of it from
above. Google has never seen the back of that chair and will make one up.

Your 3D model has seen every side of it.

1. Press **From 3D models**. The model appears, and you can turn, tilt and zoom it exactly as a
   shopper would on the product page.
2. If the product has options, use the dropdowns to put it in the right ones - the colour, the size,
   the finish. The model changes to match, materials and all, so what you are looking at is that
   particular version and not a generic one.
3. Turn it to the angle you want and press **Create view**.
4. Turn it somewhere else and press **Create view** again. And again. As many angles as you like.

Each one appears under **Views you have made**, ticked and ready, and goes to Google alongside the
photographs you ticked earlier. Untick one to leave it out of this job, or press its **×** to be rid
of it.

**They are not saved anywhere.** A view exists for as long as you are on the page and goes when you
leave it - it never lands in your media library, so there is nothing to tidy up. It is the *finished*
picture that gets saved, if you decide to keep it.

Four honest views of the real product beats one photograph and a lot of optimism, and it costs
nothing extra: the ten-picture limit is shared between photographs and views, so pick the ones that
earn their place.

---

## What happens to the ones you keep

They go into your media library, in the same folder as the product's own photographs, and they appear
at the end of the picture grid above - as an unsaved change, exactly as though you had added them
with **Add images**.

**They are not on your website until you press Save on the product.** That is deliberate: it means
you can change your mind, drag them into a different order, or make the new one the cover picture,
before anybody else sees any of it.

Drag the new picture to the front and it becomes the cover, same as any other.

## What happens to the ones you don't

Nothing. They are thrown away.

The pictures you did not tick never reach your media library at all, so there is no tidying up to do
afterwards. Anything left sitting in a job is cleared out a day later regardless.

---

## The settings

**Settings → Google AI Studio**:

| Setting | What it is for |
|---------|----------------|
| **API key** | The key from Google AI Studio. |
| **How many pictures a job makes** | Where each job starts. Three is sensible; you can change it for any single job. |
| **House style** | The wording added to the front of every product photo job - how your photographs always look. See below. |
| **Shape** | Square, portrait, widescreen and so on. Square suits most product listings. |
| **Size** | How big the picture comes back. 2K is plenty for a product page; 4K costs more and takes longer. |
| **Model** | Which of Google's picture-making models to use. Leave it alone unless Google has named a new one and you fancy trying it. |

### The house style is the setting that matters

It comes filled in with something sensible: keep the product exactly as it is, light it cleanly, plain
background, no text, no watermarks, nobody in shot.

That wording is added to the front of *every* product photo job, so it is where anything that is
always true of your photography belongs - "always on a mid-grey background", "always with a plant in
the corner", "never with people in it". You then only have to type the one-off part each time.

You can change it for a single job without changing it for good: open **House style** under the prompt
box on the Images tab and edit it there. That edit applies to that job and nothing else.

---

## Things worth knowing

- **It works from your photographs, not from thin air.** Tick nothing and you will get a picture of
  something Google invented, which is unlikely to be what you sell. Always tick at least one.
- **If Google is busy, it waits.** Google puts a limit on how fast a key may make pictures, and a
  busy afternoon can hit it. When that happens the panel does not give up and ask you to press the
  button again - it counts down, tries again, and carries on doing so until it has your picture.
  Leave the page open and it sorts itself out. There is a **Stop** button if you would rather not
  wait, and closing the tab or moving to another page stops it as well.
- **Look at what comes back.** These models are very good and occasionally very confident about a
  detail that is not there - a handle that has grown a screw, a fabric with the wrong weave. You are
  the one publishing it.
- **It never touches your existing pictures.** Nothing is overwritten, replaced or edited in place.
  Every picture it makes is a new one.
- **No shop, no section.** With no Shop module installed the key sits there quietly until there is
  something to use it on.
- **No 3D model, no button.** The **From 3D models** button only turns up where the 3D views module
  is installed *and* the product actually has a model.
- **Nothing is left at Google.** The pictures are sent to make the new one and are not kept there
  afterwards.

---

**Wiki:** [Home](Home) · [Shop](Shop) · [Managing media](Managing-media) · [Modules](Modules) · [Product attributes](Product-attributes) · [Product 3D views](Product-3D-views) · [Configuration reference](Configuration-reference)
