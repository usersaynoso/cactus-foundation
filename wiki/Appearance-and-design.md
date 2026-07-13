# Appearance and design

Cactus has a visual design system that controls every aspect of how your site looks - colours, fonts, layouts, header, and footer. All of it is configurable through the admin with no coding required.

Find these settings under **Appearance** in the admin sidebar.

---

## Styles

**Appearance → Styles** is where you set your site's global visual style. It's split into tabs, each covering a different area of design. The **first tab, Branding**, holds your logo and app identity (covered under [Branding](#branding) below); the rest cover colour, type, buttons, images, forms, and spacing.

### Branding tab

The first tab holds your **logo, icons, and app identity**. It sits at the front because branding is part of how your site looks; the design-token tabs that follow cover the rest. Branding has its own **Save branding** button, separate from the **Save Styles** button the other tabs share. See the [Branding](#branding) section below for the full detail.

### Colour presets

The fastest way to change your site's look is a **colour preset**. At the top of the Colours tab you'll find ten ready-made colour schemes. Clicking one updates your site's primary colour, link colour, and hover colour instantly - in both light and dark mode, since each preset comes with a matching dark-mode set built in.

You can customise further after applying a preset, or ignore presets entirely and define your own colours from scratch.

Once you've settled on a combination you like, you can save it as your own preset - click **Save as preset**, give it a name, and it'll appear on the preset bar ahead of the ten built-in ones, ready to reuse any time. If you tweak the colours further and want to update that saved preset rather than making a new one, the button changes to **Update preset** whenever your current colours exactly match one you've saved. Presets you've created can be deleted with the small ✕ on their card; the ten built-in presets can't be changed or removed.

### Colours tab

- **Global colours** - define up to 12 named colours, each with a light-mode and dark-mode variant. Once defined, these colours are available as swatches everywhere else in the Styles editor, keeping your palette consistent.
- **Page background** - the background colour for all public pages.
- **Links** - the colour of hyperlinks and what they change to when hovered.
- **Status boxes** - the accent colours for the four Callout box types (info, success, warning, error). Pick one colour per type and Cactus derives a matching soft background and title tint automatically, in both light and dark mode. Each has its own optional dark-mode override for a brighter accent on dark backgrounds.
- **Badges** - background and text colours for the Badge block's Blue, Yellow, Red and Gray options (its Brand option already follows your primary colour, so isn't listed here). Unlike Status boxes, nothing is derived automatically - set both the background and text colour for each. A **Badge / pill corner radius** field alongside these controls how rounded the Badge and Eyebrow blocks are; leave it empty for the default fully-rounded pill.

Every colour box on this page - and on the Headings, Buttons, Images, and Form fields tabs - also has an optional **Dark mode override** tucked just beneath it. Set one to make that colour look different when a visitor is in dark mode; leave it empty and dark mode simply reuses your light colour. See [Light and dark mode](#light-and-dark-mode) below.

### Fonts and typography tab

- **Global fonts** - define named font styles (for example, "Brand heading font"). Search any Google Font by name and Cactus loads it automatically - no coding, no separate download step.
- **Body text** - the font, size, line height, and weight used for ordinary paragraph text.

### Headings tab

Pick a **Headings font** once and every heading level uses it. Below that, set the font, size, weight, and colour for each heading level (H1 through H6) independently - a font chosen on an individual level overrides the shared one. Each level is collapsible so the page stays manageable. Leave everything empty and headings simply inherit the body font.

### Buttons tab

Set the typography, colours (text, background, border), border radius, padding, and hover state for buttons across the whole site. This first section styles the **Primary** button option.

The Button block also offers **Secondary** and **Outline** options, each with its own section further down the tab - set their colours and hover state independently, or leave a field empty to have that variant keep following your primary colour (a filled block of it for Secondary, a border and text colour for Outline) rather than a custom one. Typography, border width, radius and padding are shared across all three variants.

A **live preview** sits pinned to the bottom of the tab, showing all three variants in their normal and hover states, side by side in light and dark mode. It updates as you type, before you save, so you can see the effect of every tweak without leaving the page.

### Images tab

Control the border radius and border style applied to images.

### Form fields tab

Set the appearance of text inputs, labels, and other form elements - useful if you have a contact form or other forms on your site.

As on the Buttons tab, a **live preview** stays pinned to the bottom of the tab showing a sample label, text input, dropdown, and message box in light and dark mode, updating as you make changes.

### Spacing & Breakpoints tab

Two things live here:

- **Default block padding** - the left and right "breathing room" that stops content running right to the edges of the page. Individual blocks can override it.
- **Responsive breakpoints** - the screen widths where your layouts start reflowing so they stay readable on smaller screens. **Tablet** is where wider multi-column grids drop to two columns; **Mobile** is where everything stacks into a single column. These same two widths drive the rest of the site too: when the main menu folds into a hamburger, when any "hide on tablet/mobile" options take effect, how the shop's product grids and the article contents sidebar reflow, and every per-device setting you make in the page editor (the little monitor/tablet/phone toggles) - the whole site switches over at the same two widths, with a width exactly on a breakpoint counting as the smaller size. Sensible defaults are filled in for you (1024px tablet, 640px mobile) - change them only if you want your site to switch layouts at different widths.

### Saving

Click **Save** to apply your changes. The public site updates immediately. If you navigate away before saving, a prompt will ask whether you want to save or discard.

### Light and dark mode

Cactus supports light mode, dark mode, and auto (which follows the visitor's device setting). The toggle at the bottom of the admin sidebar lets you switch between them. Visitors get the same toggle on the public site.

Your global colours each have a separate light and dark variant. On top of that, **every other colour setting in the Styles editor has an optional dark-mode override** - the page background, links, body and heading colours, buttons and their hover state, image borders, and form fields. Each override sits just beneath its normal (light) colour, labelled "Dark mode override (optional)". Set one to change how that colour looks in dark mode; leave it empty and dark mode quietly reuses the light colour. So you can define exactly how your site looks in both modes, right down to the last detail.

---

## Layouts

**Appearance → Layouts** is where you build the structural templates for your site - the header, footer, page wrapper, and special pages like 404 errors.

Layouts use exactly the same drag-and-drop editor as pages, with all the same blocks available. The left panel has the same **Blocks** and **Outline** tabs as the page editor, plus **Settings** (name, description, and a manual priority tiebreaker), **Conditions** (see Display conditions below), **History** (past published versions, with restore), and **Saved Blocks** (reuse a block saved from any page or layout).

### Layout types

| Type | What it does |
|------|--------------|
| **Header** | The navigation bar at the top of every page. |
| **Footer** | The bottom of every page. |
| **Info page layout** | The wrapper around your page content. Use the **Content slot** block to mark where page content appears. |
| **404 page** | What visitors see when a page doesn't exist. |
| **Status page** | What visitors see when your site is in coming-soon or maintenance mode. |

Some modules add their own layout types too, shown as an extra tab alongside the built-in ones (with a second row of tabs underneath for that module's own sub-types). At the moment: **Directory** (Category, Entry), **Gazette** (Listing, Post), **Boards** (Board, Thread), and **Shop** (Shop Home, Category, Collection, Product, Checkout, Confirmation) - so you can design the look of a directory category page, a blog article, a forum thread, or a shop product the same way you design your header or footer. See each module's own wiki page for what its sub-tabs mean.

### Starter templates

When you first set up Cactus, a library of ready-made starter templates is installed automatically, marked with a **Starter** badge. Starter templates are read-only - they can't be edited, published, or deleted. Instead:

- Click **Duplicate** (on the layout card, or on the template's own page) to get your own editable copy, which opens straight in the editor as a draft
- Click **Use Sitewide** on the layout card to publish a starter's look as-is across your whole site in one go, no editing needed - the button disappears once that template is the one currently live, and using a different template of the same type (say, another header) automatically takes over from whichever one was live before
- Or build your own layout from scratch

Cactus also seeds an editable working copy of each essential template (the default header, footer, page layout, 404 and status pages) when your site is first set up, so the site works out of the box and those live layouts are yours to edit freely.

The template library keeps itself up to date: after each Cactus update, the starter templates are automatically refreshed to the latest designs. This never touches layouts you've duplicated or built yourself - and if you'd somehow edited a starter template in the past (older versions of Cactus allowed it), your edited version is kept as a copy of your own before the template is restored to its default design.

### Editing the header or footer

1. Go to **Appearance → Layouts**.
2. Click on the header or footer you want to edit.
3. Use the drag-and-drop editor to add, remove, or rearrange blocks.
4. Click **Publish** to make the changes live.

The **Site logo**, **Menu**, **Login button**, **Copyright**, and **Cookie settings link** blocks are all designed for use in headers and footers - they read your site settings automatically and don't need manual content.

The header editor also offers the **Heading**, **Text**, **Rich text** and **Button** blocks, plus a **Divider**, so you can drop in things like a phone number, a strapline, or a "Call us" button alongside the logo and menu. Use a Button pointed at a `tel:` link if you want the number to be tappable on a phone.

**Centring things in the header.** When you set a header column, or a spaced-out group, to centre, whatever sits in the middle now lines up with the true centre of the header itself - and stays there even when something beside it changes width, such as your logo shrinking as the page scrolls. It used to quietly drift off to one side whenever its neighbours grew or shrank, which rather defeated the point of centring it. Nothing to switch on: it just behaves itself now.

**Site logo height.** The Site logo block's height setting is labelled **Element height**, with a matching **Element height when shrunk** if your header is set to shrink on scroll. The logo scales to that height and keeps its proportions.

### Display conditions

Each layout can be set to apply to specific contexts - so you can have a different header on your homepage, a simplified layout for a particular section, or a unique 404 page. Set this on the **Conditions** tab in the layout editor.

Options include:
- Entire site
- A specific page
- A specific URL prefix (e.g. everything under `/blog/`)
- A specific module's pages

When multiple layouts match a page, the most specific one wins.

### Publishing layouts

Like pages, layouts have a draft state and a published state. Changes stay in draft until you click **Publish**. The **Preview** button lets you see the layout before making it live.

Module layout types come with a few starter templates each, same as headers and footers. Most don't publish anything automatically - Directory, Gazette and Boards' pages, plus Shop's Category and Collection pages, already have a perfectly good built-in look, so nothing changes until you duplicate a starter and hit Publish yourself. Shop's Home, Product, Checkout and Confirmation pages are the exception: they have no built-in look of their own to fall back on, so an editable working copy of a plain default is published automatically from the moment Shop is switched on - edit it, or swap it for a duplicate of another starter, whenever you like.

---

## Branding

**Appearance → Styles → Branding** (the first tab) is where you set your logo, icons, and app identity. These replace the default Cactus branding everywhere - public pages, the admin area, the status and error pages, browser tabs, bookmarks, and the icon people see when they add your site to their phone.

- Your **logo** appears wherever you've placed a **Site logo** block in the header or footer.
- Your **favicon** appears in the browser tab.

### App icon and favicons

Rather than making you prepare a pile of differently-sized image files, you upload **one square app icon** (at least 512×512) and Cactus generates the whole set for you: the browser favicon, the Apple touch icon (for "add to home screen" on iPhone and iPad), and the installable-app icons (192 and 512).

Every generated icon is then shown in its own box, so if you'd rather hand-pick a particular one - say a simpler design for the tiny favicon - just upload a replacement into that box. Your override sticks; re-uploading the source app icon regenerates the others but leaves the ones you set by hand.

If you don't set an app icon at all, the standard **Favicon** box still works on its own, exactly as before.

### App name and colours

- **App name** and **Short name** are used when someone installs your site as an app. The short name is the label under the icon on a phone home screen. Both fall back to your site name if left blank.
- **Theme colour** tints the browser toolbar on mobile and the installed app.
- **Background colour** is shown briefly while the installed app is loading.

### Dark-mode logo and favicon

You can also upload a **dark-mode logo** and a **dark-mode favicon**. Both are optional - leave them empty and your standard logo and favicon are used everywhere.

- The **dark-mode logo** is shown automatically whenever a visitor is viewing your site in dark mode, whether they chose it with the toggle or their device is set that way. Handy if your normal logo is dark ink that would vanish against a dark background.
- The **dark-mode favicon** follows the visitor's browser or device setting rather than the toggle on your site, because browsers decide favicons for themselves. It swaps in when their system is set to dark mode.

Uploading a logo or favicon requires a media storage provider to be set up. See [Managing media](Managing-media) for how to set that up.

---

## Menus

Navigation menus are managed separately from layouts. A menu is just a list of links - the **Menu** block in a layout or page then displays it.

To create or edit a menu:

1. Go to **Menus** in the admin sidebar.
2. Click **New menu** to create one, or click an existing menu to edit it.
3. Add links, name the menu, and save.
4. In your header (or wherever you want it), place a **Menu** block and select this menu from the block's settings.

You can have multiple menus and use them in different places - for example, a main navigation in the header and a footer links menu in the footer.

The **Menu** block's **Nav behaviour** setting decides how the menu appears at each screen size (desktop, tablet, mobile):

- **Always show** - the full row of links, as-is.
- **Collapse to hamburger** - the links fold away behind the usual three-line hamburger button that opens a drop-down panel.
- **Dropdown (current page)** - the menu shrinks to a single button showing the page you're currently on, with a little arrow; clicking it opens the full menu. Handy when space is tight but a hamburger feels like overkill.

Click **+ Add item** to open the picker, then choose where the link should go:

- **Page** - one of your info pages. Pick this to search and select from your pages.
- **A module** (Boards, Gazette, Directory, etc, whichever you have installed) - pick the module, then pick what kind of thing to link to (its home page, a board/sub-board/tag/category, a Gazette post/tag/series/author, a Directory listing/category...), then search for the specific one you want.
- **External link** - any web address, with the option to open it in a new tab.

Use the **←** back arrow in the top-left of the picker to change your mind at any step without starting over.

If a module item's target is later unpublished or deleted, the admin list still shows it (so you can fix or remove it), but it's automatically left out of the menu on the live site.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Configuration reference](Configuration-reference)
