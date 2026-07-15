# Managing pages

Pages in Cactus are built using a drag-and-drop visual editor. There's no coding or HTML to write - you add content blocks, arrange them however you like, and publish when you're ready.

---

## Creating a page

1. In the admin, go to **Pages**.
2. Click **New page**.
3. Enter a title and a slug (the URL-friendly name for the page, e.g. `about` gives you `example.com/about`).
4. Click **Create** to open the editor.

---

## The page editor

The editor has three areas:

- **Left panel** - a row of tabs down the side:
  - **Blocks** - browse and drag blocks onto your page, organised into categories.
  - **Outline** - a tree view of every block on the page, handy for jumping to something buried deep in the layout. You can also drag blocks up and down the tree to reorder them, or drop one inside a column or group to nest it - often easier than aiming on the canvas when a page gets long.
  - **Settings** - the page's title, URL slug, status, and which menus it appears in.
  - **SEO** - the page's meta description and social-share (OG) image.
  - **History** - past published versions, with a one-click restore.
  - **Saved Blocks** - save any block as a reusable snippet, then drop it into any other page or layout.
- **Canvas** (centre) - a live preview of your page. Click any block to select it.
- **Right panel** - settings for the selected block. Change text, images, colours, and more here.

Your changes are saved automatically as you type. You won't lose anything if you close the tab.

---

## Adding and moving blocks

1. In the left panel, find the block you want - scroll through the categories or search by name.
2. Drag it onto the canvas and drop it where you want it.
3. Click the block on the canvas to open its settings in the right panel.

To reorder blocks, drag them up or down the canvas, or use the **Outline** tab in the left panel and drag them there instead - drop a block onto a column or group to tuck it inside. On a keyboard, select a block in the Outline and hold Alt while pressing the arrow keys to move it.

To remove a block, select it and click the delete icon.

---

## Setting things differently per screen size

Lots of block settings - alignment, spacing, sizes, gaps, widths, side padding and the like - can be set separately for desktop, tablet, and mobile. Look for the little row of screen icons (a monitor, a tablet, a phone) beside a setting: click one to choose which screen size you're setting, then pick the value.

The screen icons and the preview are linked both ways: click a screen icon and the canvas switches to that width so you can see what you're changing; pick a width from the viewport menu above the canvas and every setting's icons follow along. Whatever size the preview shows is the size you're editing - no guesswork.

You only set the ones you want to change. Leave tablet or mobile blank and they simply follow the size above - mobile falls back to tablet, tablet falls back to desktop - so you can nudge the odd setting on smaller screens without redoing the lot. A small dot on a screen icon shows where you've set something specific.

A few settings that used to be one-size-only now join in: the shared left/right padding on most blocks, an image's maximum width and alignment, a video's aspect ratio, an embed's height, the Hero's layout (so a text-and-image hero on desktop can become a centred text hero on phones), the column counts on the shop's product and category grids and the Gazette feed, and the number of columns in a Group. Also per screen size now: a grid's space below, a Heading's block height, vertical position and font size, a Card's height, a button's alignment (including full width), the Site Logo's height (a smaller logo on phones, at last), and the header menu's font size, weight and alignment.

This is a different thing from hiding a block on certain screens (the show/hide-per-device toggle), which carries on working exactly as before.

---

## Sizes, colours, and settings that stay out of your way

Three things hold across every block's settings panel:

**Sizes come with a unit picker.** Anywhere a size is yours to choose - a column width, an image's maximum width, an embed's height, a sticky offset - you type the number and pick the unit from the little dropdown to its right: `px` for exact pixels, `%` for a share of the available space, `vh`/`vw` for a share of the screen, and so on. Type 50 and pick %, rather than having to know to write "50%". If you'd previously typed a value by hand it still works and shows up in the new picker.

**Colours always offer your palette plus a custom pick.** Every colour setting shows your site's colour swatches first (each previewing its light and dark half), with a rainbow swatch on the end that opens a full colour picker for anything else. That now includes the Divider's line colour, the Text block's colour, and the CTA Banner (choose **Custom colours** as its background). Backgrounds are smarter about what they ask for, too: pick a gradient and you get a proper gradient box instead of colour swatches that wouldn't apply; pick an image and the colour swatches step aside.

**Only settings that apply are shown.** A border's colour and width only appear once you've chosen a border style; a sticky offset only once the block is sticky; an overlay's strength only once you've picked an overlay colour; an image's alt text, size and alignment only once there's an image; a second button's style only once there's a second button; a vertical menu doesn't offer hamburger options, and so on. If a setting seems to be missing, it's usually waiting for the thing it depends on.

A couple of blocks gained proper custom sizes along the way: the Section's **Content max-width** and the Spacer's **Height** both have a **Custom…** option that reveals a size field with the unit picker - per screen size, like everything else.

The Section's **Content max-width** also has an **Edge to edge (no padding)** option. **Full bleed** stretches the content to full width but still keeps a small breathing gap down each side so text never quite touches the screen edge; **Edge to edge** removes that gap entirely, so a hero image, map or full-width band runs clean to both edges. Pick it per screen size if you like - edge to edge on desktop, tidy gaps on phones.

**Scroll animations and sticking are everywhere they make sense.** Nearly every block now has a **Scroll animation** setting (fade, slide, zoom) - pick one and the speed and delay options appear; leave it on None and they stay hidden. Content blocks that might sit beside something taller - images, cards, text, buttons, spec panels, videos and the like - also have **Stick while scrolling**, which pins the block in place while its neighbour scrolls past (an offset field appears once it's on, for clearing a sticky header). Sticking only has room to work when the block's column is taller than the block itself.

---

## Available blocks

### Layout

Use these to structure the page and create visual sections.

| Block | What it does |
|-------|--------------|
| **Section** | A full-width container with a background colour, image, or gradient. Drop other blocks inside it. Great for creating distinct visual sections. When the background is a colour, a **Colour opacity** slider lets you make it see-through - handy for a soft, readable panel sitting over a background photo - and a **Dark mode colour** picker lets you choose a different colour for dark mode (so a panel can be light in light mode and dark in dark mode). Both are available on the Hero block too. The **Vertical padding** setting includes a **Full view height** option that makes the section fill the whole screen - useful for a landing section a visitor sees in full before scrolling. **Content vertical alignment** (top, middle or bottom) decides where the content sits when the section is taller than the content inside it - pair it with Full view height to centre a hero on the screen. It can be set separately for desktop, tablet and mobile. The **Border** dropdown only reveals its colour and width settings once you actually choose a border style; set it to None and they stay out of your way. |
| **Grid** | A two-to-four column grid. Drop content into each column independently. **Stack columns** decides when the columns pile up underneath each other on smaller screens: **On mobile** (the usual - side by side on computers and tablets, stacked on phones), **On tablet and mobile** (stacked from tablet width down), or **Never** (stay side by side at every size). It works even when you've set your own **Column widths** to Manual. Speaking of which: the per-column width boxes only appear while Column widths is set to **Manual**, and switching back to **Equal** (or any preset) drops those custom widths straight away. |
| **Split** | A two-column layout where each side is a separate drop zone. Good for side-by-side content. |
| **Group** | A flexible container for arranging blocks side by side or stacked. Switch on **Columns** to lay any number of blocks out in an even grid - and pick a different number of columns for desktop, tablet and phone (say three across on a computer, two on a tablet, one on a phone). Handy when a Grid's fixed two-to-four columns won't line up the way you want. |
| **Spacer** | Adds a fixed vertical gap between blocks. Pick a preset size, or choose **Custom…** and set an exact height with the unit picker - per screen size if you like. |
| **Divider** | A horizontal line to visually separate content. Its colour comes from your site's swatches, or pick any custom colour. |

### Text and headings

| Block | What it does |
|-------|--------------|
| **Heading** | A standalone heading. Choose from sizes H2 through H5 (or Display for the biggest hero text). A **Font size** override lets one heading break from the sitewide style - type a number, pick the unit, per screen size if you like. **Block height** and **Vertical position** place the heading within a taller space (or the full screen), and both can differ per screen size too - a full-screen statement on desktop can settle back to normal height on phones. |
| **Text** | A paragraph of body text. |
| **Rich Text** | A full text editor with bold, italic, bullet lists, numbered lists, links, and blockquotes. A **Text colour** setting recolours the whole block - pick one of your site colours or set a custom colour of your own. Links keep their usual link colour so they still look clickable. |
| **Quote** | A styled pull quote with optional attribution, and an optional photo (pick one from your media library). The photo sits *inside* the quote panel, tucked between the coloured bar down the left edge and the quote itself. Choose its width, its shape (circle, rounded or square), and - if square isn't what you're after - type a height in pixels. Leave the height blank and it stays square, as before. |

### Actions

| Block | What it does |
|-------|--------------|
| **Button** | A clickable button that links to a URL or another page. Choose where it sits with **Alignment** (left, centre, right or **Full width**, and you can set it differently on mobile - a button can sit inline on desktop and stretch edge to edge on phones). **Style** picks one of your three sitewide button looks, or **Custom** if this one button needs to stand apart - Custom lets you set its colour, text colour, hover colours and border on the block itself, without touching any other button on the site. |
| **Phone** | A click-to-call phone number. Type the number in and it becomes a proper `tel:` link, so tapping it on a phone starts a call. Type it however reads best - spaces and brackets and all - and Cactus tidies it up behind the scenes for the dialler (for that to work reliably, use the full international form like `+44 20…` so the number dials from any country, and put the tidy local version in **Display text** if you'd rather show that). A **Phone icon** can sit alongside it, and you can have it appear on phones only. There's also an **icon-only on mobile** option: on a phone the number collapses to just the little dial icon, saving space in a tight header while still ringing you when tapped. For the look, you've got the lot: alignment, text size (small right up to XXL), font, **Font weight**, letter spacing and uppercase/capitalise, a colour and a separate **Hover colour**, and underlining - either always on or only when someone points at it, with its own colour, thickness and offset. Those underline settings appear as soon as you switch either underline on, so a number that only underlines on hover can still be styled just so. **Keep on one line** shrinks a long number to fit rather than letting it wrap, and **Block height** with **Vertical position** lets the number sit top, middle or bottom of a taller space - the same controls the Heading block has, so a phone number can sit dead-centre of a column next to it. |
| **CTA Banner** | A call-to-action banner with a heading, description, and button. **Vertical padding** sets how tall the banner is - how much breathing room sits above and below the text - and can differ per screen size. Left at None, the coloured panel hugs the text, which is how it has always behaved. |

### Media

| Block | What it does |
|-------|--------------|
| **Image** | An image with optional caption. Requires a media provider to be set up. |
| **Video** | Embed a YouTube or Vimeo video. Paste the video URL and choose an aspect ratio. |
| **Embed** | Embed anything via URL - maps, booking forms, surveys, and so on. |

### Content

| Block | What it does |
|-------|--------------|
| **Hero** | A large banner section with a heading, sub-heading, and an optional button. Great for the top of a homepage. |
| **Card** | An image, heading, body text, and optional button. Good inside a Grid. **Card height** lets you pin it to a set height, or to **Fill container** so a row of cards all match the tallest one instead of each ending wherever its own text happens to stop - and it can differ per screen size. |
| **Callout** | A highlighted notice box. Available in info, success, warning, and error styles. |
| **Badge** | A small coloured pill label. |
| **Accordion** | Collapsible questions and answers. A good choice for FAQ sections - no extra scripts needed. |
| **Feature list** | A list of features, each with an icon, title, and description. |
| **Stats** | A row of numbers with labels. Good for displaying key metrics. |
| **Logos** | A horizontal strip of logo images. |

### Embed

| Block | What it does |
|-------|--------------|
| **Embed Layout** | Drop a saved layout straight into any page. Pick the layout you want in the settings panel and its own options appear - for a shop **Category** layout, for example, you choose which category to show and how many products. Handy for putting a slice of your shop on the homepage without rebuilding it by hand. Only layouts that support embedding show up in the picker. |

### Site

These blocks read from your site settings automatically - no manual content to enter.

| Block | What it does |
|-------|--------------|
| **Site logo** | Displays your uploaded logo, or your site name if no logo is set. **Alignment** moves it left, centre or right, and can be set separately for desktop, tablet and mobile (look for the little screen icons beside the setting) - so a logo can sit left on a wide screen and centred on a phone. In the header the logo takes its position from the column it sits in, so the setting has nothing to do there; it earns its keep on pages and in the footer. |
| **Menu** | A navigation menu. Pick which menu to display, how to orientate it, and whether dropdowns open on hover or click. Its horizontal alignment, item spacing, font size, font weight and text transform can each be set separately for desktop, tablet and mobile (look for the little screen icons beside the setting) - so a menu can spread out across the header on desktop and sit centred on a phone, for instance. Styling options cover the font (your site's fonts appear at the top of the list, or search for any Google font), link colour, hover colour and hover background, and how the current page's item stands out - its own colour, weight, and an optional underline with its own colour, thickness, and distance from the text. The same styling options are available on the Site Header block's built-in menu. |
| **Copyright** | Displays © current year and your site name. |
| **Login button** | Shows log-in and register links for visitors, or account and sign-out links for logged-in users. |
| **Cookie settings link** | A button that reopens the cookie preferences panel. Place this in your footer so visitors can update their choices at any time. |

If you have modules installed, they may add extra blocks under a **Modules** category.

---

## Email addresses are protected automatically

Put an email address anywhere on a page and Cactus quietly protects it from spam bots on the live site. You don't need to do anything, or use a special block. Just type the address as normal.

This covers every place an address can end up on a page:

- **Typed into your words** - any block at all: a Heading, Text or Rich Text block, but equally a Card's body, a call-to-action's message, an FAQ answer, a stat, a caption, a footer line.
- **Used as a link** - an "Email us" button, a call-to-action, a card, a menu item, a footer link, a linked heading, or a social link. This is the one that matters most: an email link is the easiest thing on a page for a spam bot to spot, easier than the address itself, so a button pointing at your inbox used to be the most exposed address on the whole site.

Behind the scenes, the address is scrambled in the page's underlying code so the automated programs that trawl the web harvesting addresses for spam lists come away empty-handed. Visitors still see the address exactly as you typed it, and clicking it opens their email app with a new message ready to go - the address is quietly reassembled in their browser at the last moment.

A couple of things worth knowing:

- **In the editor you'll still see the plain address** - the protection only applies once the page is live, so you can always read and edit what you typed.
- **On the rare browser with JavaScript switched off**, the address still shows and is still readable - it just isn't clickable. Everyone else gets the normal click-to-email link.
- **An address in a code sample is left alone.** If you deliberately wrote one inside a Rich Text code block, it's there as an example, so Cactus doesn't touch it.
- **One spot it can't reach**: an address hidden in an image's alt text (the description a screen reader reads out) isn't scrambled, because of how that part of the page works. Keep contact addresses in your visible words or a link, which is where visitors look for them anyway.

---

## Drafts and publishing

Every page starts as a **draft** - not visible to the public. When you're ready to make it live, click **Publish**.

- While editing, all your changes stay in the draft only. The live page is unchanged.
- Clicking **Publish** makes the current draft live and saves a snapshot of the previous version in history.
- You can keep editing after publishing - the live page won't change again until you publish again.
- The button greys out when there's nothing new to publish, so you can tell at a glance whether your latest edits are already live.

### Previewing before you publish

Click **Preview** in the editor toolbar to see the current draft exactly as visitors will see it. The preview opens in a new tab with a "Draft preview - not live" banner so it's clear you're looking at a draft.

---

## Page history

Every time you publish, Cactus saves a copy of the previous live version. Up to ten past versions are kept.

To restore an older version:

1. In the editor, open the **History** tab in the left panel.
2. Click a past version to see what it looked like.
3. Click **Load into editor** to make it your current draft.
4. Click **Publish** to make it live again.

Loading a version into the editor never immediately changes the live page - it only updates your working draft.

---

## Setting the homepage

To choose which page appears at your site's root address:

1. Go to **Settings → General**.
2. Find the **Homepage** field and select the page you want.
3. Save.

---

## Setting a page as coming-soon or maintenance

You can show a specific page to visitors when your site is in "Coming soon" or "Maintenance" mode:

1. Go to **Settings → Site status**.
2. Select the page to show under **Coming soon page** or **Maintenance page**.

See [Configuration reference](Configuration-reference) for more on site status.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Configuration reference](Configuration-reference)
