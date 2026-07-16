# Product Attributes

**Product Attributes** lets shoppers narrow your shop down to what they're actually after. Material, colour, room, finish, whatever matters in your trade - you decide what the labels are, tick them onto your products, and drop a filtered grid onto your shop page.

It needs the **Shop** module installed and up to date. It works nicely alongside **Shop Variations** if you have it, and perfectly well without.

Once installed, you'll find a **Product attributes** entry in the Shop section of your admin sidebar.

## Setting up your attributes

Attributes belong to the whole shop rather than to one product, which is the point - one "Colour" filter covering everything beats a different one on every product.

1. Go to **Shop → Product attributes**.
2. Type a name ("Material"), choose how shoppers should pick it, and click **Add**.
3. Add its values underneath ("Oak", "Walnut", "Brass").

There are three ways a shopper can pick:

- **Tick list** - the everyday choice. A column of tick-boxes.
- **Colour swatches** - little coloured dots. You choose the colour for each value as you add it.
- **Dropdown** - a single-choice menu, handy when there are a lot of values and not much room.

Untick **Show in filters** to keep an attribute for your own reference without offering it on the shop. Deleting an attribute takes its values with it, and removes it from every product - so it asks first.

## Putting attributes on a product

1. Open any product (**Shop → Products →** the product).
2. Scroll to the **Attributes** panel.
3. Tick whatever applies and click **Save attributes**.

That's the whole job for a straightforward product.

## Products with variants

If you have the **Shop Variations** module, the same panel gains a **Per-variant attributes** section.

This matters because a product's variants often differ in exactly the thing people filter by. A shirt that comes in red, blue and green isn't really "a red shirt" - but someone filtering for red should still find it. So attributes can sit on an individual variant, and the product turns up whenever **any** of its variants match.

Click **Show variants** to expand the list and tick values onto each one.

### Importing what you've already typed

You've likely already set up Size and Colour as variation options. No need to type them twice.

Click **Import from variations** and Cactus will:

- turn each of the product's variation options into an attribute (so "Colour" becomes a Colour filter),
- create the values it finds, carrying over any colours you picked for swatches,
- and tick each value onto exactly the variants that use it.

It matches on the option's name, so if three products all have a "Colour" option they all feed the same shop-wide Colour filter rather than making three of them. Run it again whenever you change a product's variants - it tidies up after itself rather than piling duplicates on top.

## Putting the filter on your shop

Drop the **Shop: Filtered Product Grid** block onto your Shop Home, Category or Collection layout. It's the shop's usual product grid with filters attached, so your product cards look exactly as they do everywhere else - it uses the same Product Card design.

The block's options:

| Option | What it does |
|--------|--------------|
| Category / Collection / Tag slug | Narrows down which products appear, same as the ordinary grid |
| Number of products | How many to show |
| Columns | How many across |
| Filters | Down the left, or across the top |
| Show product counts | Whether each option shows how many products match |
| Card layout | Which Product Card design to use; leave it be and it uses your published default |

Ticking a filter is instant - no page reload, no waiting. The address bar keeps up, so a shopper can bookmark "oak sideboards" or send the link to someone else and it'll open filtered.

## How the filtering behaves

Ticking two values of the same attribute widens the net; ticking values of different attributes narrows it. So Red **and** Blue under Colour, plus Oak under Material, means "red or blue, and oak" - the same way every high-street shop's filters work, because that's what people expect.

Filter options that nothing on the page could match are hidden, so a category page never offers a tick that always comes back empty.

## Good to know

- Filtering covers the products the grid has loaded, and a grid tops out at 100 products. For most shops that's the whole shelf and nobody notices. If you're running a catalogue in the thousands, this block isn't the right tool for the job.
- A variant you've switched off is left out of filters. It isn't buyable, so sending someone to it would only annoy them.
- Renaming an attribute changes its web address, so any bookmarked filter link for the old name stops working. Worth settling on a name before you advertise the link.
- Removing the module takes your attributes and their assignments with it. Your products are untouched.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Gazette](Gazette) · [Boards](Boards) · [Directory](Directory) · [Shop](Shop) · [Shop Variations](Shop-variations) · [Product Attributes](Product-attributes) · [Reply Catcher](Reply-catcher) · [Gemini Watermark Remover](Gemini-Watermark-Remover) · [Ultimate SEO](Ultimate-SEO) · [Configuration reference](Configuration-reference)
