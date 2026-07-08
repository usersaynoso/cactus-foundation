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
  - **Outline** - a tree view of every block on the page, handy for jumping to something buried deep in the layout.
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

To reorder blocks, drag them up or down the canvas.

To remove a block, select it and click the delete icon.

---

## Setting things differently per screen size

Lots of block settings - alignment, spacing, sizes, gaps, widths, side padding and the like - can be set separately for desktop, tablet, and mobile. Look for the little row of screen icons (a monitor, a tablet, a phone) beside a setting: click one to choose which screen size you're setting, then pick the value.

The screen icons and the preview are linked both ways: click a screen icon and the canvas switches to that width so you can see what you're changing; pick a width from the viewport menu above the canvas and every setting's icons follow along. Whatever size the preview shows is the size you're editing - no guesswork.

You only set the ones you want to change. Leave tablet or mobile blank and they simply follow the size above - mobile falls back to tablet, tablet falls back to desktop - so you can nudge the odd setting on smaller screens without redoing the lot. A small dot on a screen icon shows where you've set something specific.

A few settings that used to be one-size-only now join in: the shared left/right padding on most blocks, an image's maximum width and alignment, a video's aspect ratio, an embed's height, the Hero's layout (so a text-and-image hero on desktop can become a centred text hero on phones), and the column counts on the shop's product and category grids and the Gazette feed.

This is a different thing from hiding a block on certain screens (the show/hide-per-device toggle), which carries on working exactly as before.

---

## Available blocks

### Layout

Use these to structure the page and create visual sections.

| Block | What it does |
|-------|--------------|
| **Section** | A full-width container with a background colour, image, or gradient. Drop other blocks inside it. Great for creating distinct visual sections. |
| **Grid** | A two-to-four column grid. Drop content into each column independently. |
| **Split** | A two-column layout where each side is a separate drop zone. Good for side-by-side content. |
| **Group** | A flexible container for arranging blocks side by side or stacked. |
| **Spacer** | Adds a fixed vertical gap between blocks. |
| **Divider** | A horizontal line to visually separate content. |

### Text and headings

| Block | What it does |
|-------|--------------|
| **Heading** | A standalone heading. Choose from sizes H2 through H5. |
| **Text** | A paragraph of body text. |
| **Rich Text** | A full text editor with bold, italic, bullet lists, numbered lists, links, and blockquotes. |
| **Quote** | A styled pull quote with optional attribution. |

### Actions

| Block | What it does |
|-------|--------------|
| **Button** | A clickable button that links to a URL or another page. |
| **CTA Banner** | A call-to-action banner with a heading, description, and button. |

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
| **Card** | An image, heading, body text, and optional button. Good inside a Grid. |
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
| **Site logo** | Displays your uploaded logo, or your site name if no logo is set. |
| **Menu** | A navigation menu. Pick which menu to display and how to orientate it. |
| **Copyright** | Displays © current year and your site name. |
| **Login button** | Shows log-in and register links for visitors, or account and sign-out links for logged-in users. |
| **Cookie settings link** | A button that reopens the cookie preferences panel. Place this in your footer so visitors can update their choices at any time. |

If you have modules installed, they may add extra blocks under a **Modules** category.

---

## Drafts and publishing

Every page starts as a **draft** - not visible to the public. When you're ready to make it live, click **Publish**.

- While editing, all your changes stay in the draft only. The live page is unchanged.
- Clicking **Publish** makes the current draft live and saves a snapshot of the previous version in history.
- You can keep editing after publishing - the live page won't change again until you publish again.

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
