# Product Attributes

**Product Attributes** lets shoppers narrow your shop down to what they're actually after. Material, colour, room, finish, whatever matters in your trade - you decide what the labels are, tick them onto your products, and drop a filtered grid onto your shop page.

It needs the **Shop** module installed and up to date. It works nicely alongside **Shop Variations** if you have it, and perfectly well without.

Once installed, you'll find a **Product attributes** entry in the Shop section of your admin sidebar.

## Setting up your attributes

Attributes belong to the whole shop rather than to one product, which is the point - one "Colour" filter covering everything beats a different one on every product.

1. Go to **Shop → Product attributes**.
2. Type a name ("Material"), choose how shoppers should pick it, and click **Add**.
3. Add its values underneath ("Oak", "Walnut", "Brass").

There are four ways a shopper can pick:

- **Tick list** - the everyday choice. A column of tick-boxes.
- **Colour swatches** - little coloured dots. You choose the colour for each value as you add it.
- **Picture swatches** - small pictures instead of dots, for the things a colour can't honestly describe: an oak grain, a fabric weave, a brushed brass finish. You choose the picture for each value as you add it.
- **Dropdown** - a single-choice menu, handy when there are a lot of values and not much room.

### Picture swatches

Choose **Picture swatches** when you add the attribute and each value gets a small square beside it. Click the square to pick a picture from your media library - the library has its own upload button, so a photo still on your desktop and one you filed last month are the same two clicks away. You can also drag an image file straight onto the square, which uploads it and uses it in one go.

Click the square on a value that already has a picture to swap it for a different one.

Pictures are filed in your media library under **Shop → Attributes → (the attribute's name)**, or **Shop → Attributes → (the group) → (the attribute's name)** once you've put the attribute in a group, not under a product. That's deliberate: a value belongs to the whole shop, so the same oak picture serves every product that carries it, and it doesn't go missing the day you delete whichever product you happened to have open. Rename, crop or optimise the picture later in the library and the filter follows it - no broken squares.

A value with no picture yet shows an empty dotted square, and on the shop it simply shows its label. Nothing breaks while you're still getting round to the photos.

Untick **Show in filters** to keep an attribute for your own reference without offering it on the shop. Deleting an attribute takes its values with it, and removes it from every product - so it asks first.

## Groups

A shop with six attributes reads fine as one list. A shop with thirty does not, which is what groups are for.

1. On **Shop → Product attributes**, type a name under **Add a group** ("Materials and finishes", "Dimensions") and click **Add group**.
2. Every attribute now has a **Group** dropdown next to it. Pick the group you want it in.
3. Anything you haven't filed sits under **Not in a group** at the bottom, which is a perfectly respectable place for it to stay.

Groups tidy up this screen and nothing else. Shoppers see exactly the same filters in exactly the same order whether you've spent an afternoon organising or none at all.

Two conveniences worth knowing. **Rename** on a group heading changes the name everywhere it appears. **Delete group** removes only the folder - the attributes inside it drop back to **Not in a group** with all their values and every product still attached, so it is a tidying-up decision rather than one you need to sleep on.

### Putting them in order

Every attribute and every group has a pair of arrows. Use them to shuffle things up and down until the screen reads the way you think about your stock.

The attribute order is not just for your benefit - it is the order the filters appear in on your shop, top to bottom. Groups sort themselves, and moving an attribute inside a group moves it on the shop too, so what you see here is what a shopper gets.

Picture swatches come along for the ride. Move an attribute into a group, out of one, or between two, and its pictures move to match in your media library. Same when you rename or delete the group, and same when you rename the attribute itself. You will never be left hunting through a folder named after something that no longer exists.

## Putting attributes on a product

1. Open any product (**Shop → Products →** the product).
2. Go to its **Attributes** tab.
3. Pick the attributes this product uses from the **Add an attribute** list.
4. For an ordinary attribute, tick its value ("Material: Oak"). Then hit the product's **Save changes** button.

There's no separate save for attributes: they go with the rest of the product, so one button does everything and the tab keeps an amber dot until it's done. **Remove** takes an attribute back off the product (and forgets its values for it).

### Adding a value without leaving the product

If the value you want isn't there yet, there's an **Add a value** box under each attribute on the tab. Type it, click **Add value**, and it's ticked on this product straight away - no trip back to the Product attributes screen halfway through writing a product. For a colour attribute you get a colour picker alongside, and for a picture attribute a thumbnail to click or drop an image onto, same as on the main screen.

Two things worth knowing:

- The value joins that attribute's shop-wide list, so the next product that needs "Oak" ticks it rather than typing it again. That's rather the point: one Oak on the filter, not one per product.
- Because it's a change to the shop's vocabulary rather than to this product, it saves the moment you click **Add value** - it doesn't wait for **Save changes**. Typing a value and then abandoning the product leaves the value behind; delete it from **Shop → Product attributes** if you don't want it.

Type the same label as an existing value and Cactus quietly uses that one instead of making a near-identical twin.

Each attribute you add carries two tick-boxes:

- **Use for variations** - the value changes from one variant to the next (a jumper in red, blue and green). See below.
- **Show in shop filters** - untick to keep an attribute on the product for your own reference without offering it to shoppers here. Useful when you only added it to organise the variants. This is per product; the shop-wide **Show in filters** on the attribute itself still applies on top, so an attribute switched off there is hidden everywhere regardless.

## Products with variants

If you have the **Shop Variations** module, a product's variants often differ in exactly the thing people filter by. A shirt that comes in red, blue and green isn't really "a red shirt" - but someone filtering for red should still find it.

Tick **Use for variations** on an attribute and it turns up as its own column on that product's **Variations** tab. Each variant row gets a dropdown, so a red/small and a blue/large can each carry their own Colour. The product then turns up whenever **any** of its variants match. The values save themselves as you pick them, alongside each variant's price and stock - there's no separate save for that column.

The dropdown ends with **+ New value…**. Pick it, type the label, press Enter, and the value is created and put on that variant in one go. It appears in every other variant's dropdown immediately, so a colour typed on row one is a click away on row twelve. Escape backs out if you change your mind. Values for a variation attribute can also be set up in advance from the product's **Attributes** tab, using the same **Add a value** box - handy if you'd rather line up the choices before working down the grid.

An attribute set to Use for variations is no longer ticked here on the product as a whole; its value lives per variant instead.

### Importing what you've already typed

You've likely already set up Size and Colour as variation options. No need to type them twice.

Click **Copy from variations** and Cactus will:

- turn each of the product's variation options into an attribute (so "Colour" becomes a Colour filter),
- mark it **Use for variations** and put it as a column on the Variations tab,
- create the values it finds, carrying over any colours or pictures you picked for swatches (an option with pictures on it comes across as a picture attribute),
- and set each variant's value to match.

It matches on the option's name, so if three products all have a "Colour" option they all feed the same shop-wide Colour filter rather than making three of them. Run it again whenever you change a product's variants - it tidies up after itself rather than piling duplicates on top.

### Bulk-editing in the Google Sheet

If you have the **Google Sheet** module, each **Use for variations** attribute becomes an extra column on the sheet's Variations tab, named after the attribute. Type or change a variant's value there and it comes back in on the next Pull, the same as price or stock. A value you type that didn't exist yet is created for you.

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
