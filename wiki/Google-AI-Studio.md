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
   - **This product** - the photographs in the grid above.
   - **Variations** - the lead photograph from each variation, if you use them.
   - **Attribute pictures** - fabrics, finishes and the like, if you use picture attributes.
4. **Say what you would like.** Describe the *shot*, not the product: "the same desk in a bright
   open-plan office, seen from the side" rather than "an oak desk". The pictures you ticked are
   already doing the describing.
5. Choose **how many** and what **shape**, and press **Create pictures**.

They arrive one at a time. When they have all landed, tick the ones worth keeping and press
**Add to product images**.

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
- **Look at what comes back.** These models are very good and occasionally very confident about a
  detail that is not there - a handle that has grown a screw, a fabric with the wrong weave. You are
  the one publishing it.
- **It never touches your existing pictures.** Nothing is overwritten, replaced or edited in place.
  Every picture it makes is a new one.
- **No shop, no section.** With no Shop module installed the key sits there quietly until there is
  something to use it on.
- **Nothing is left at Google.** The pictures are sent to make the new one and are not kept there
  afterwards.

---

**Wiki:** [Home](Home) · [Shop](Shop) · [Managing media](Managing-media) · [Modules](Modules) · [Product attributes](Product-attributes) · [Configuration reference](Configuration-reference)
