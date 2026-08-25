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

Everything on this tab is sitewide: change it here and every button on every page follows. When you want one button to stand apart without disturbing the rest, leave this tab alone and set that block's **Style** to **Custom** in the page editor instead - it gets its own colours, hover colours and border, and ignores the settings on this tab entirely.

**Your hover colour now carries the small print with it.** Some buttons are more than a word on a fill - a product's option header, for instance, carries a numbered marker, the choice you've already made, and an arrow, each drawn in a quiet grey that suits the panel it normally sits on. A strong hover fill used to arrive underneath all of that and leave it exactly where it was, so the quiet grey ended up on top of your hover colour and rather harder to read than it had been a moment earlier. Those details now brighten along with the button. If you have set a **Hover > Text colour**, they take that; if you have only set a hover background, they turn white, which is the safe answer on a fill worth choosing. Where a detail's whole job is to match the wording directly above it - the price under an option's name, or the word Selected under the one you've picked - it takes that wording's own colour instead, so the pair always read as a single label rather than two. Nothing changes for a site that sets no hover colours at all.

**A button that isn't offering anything no longer lights up.** A control the page has greyed out - the minus on a quantity box already sitting at one, say - was still picking up your hover colour when the pointer crossed it, which rather suggested it would do something if you pressed it. Greyed-out controls now stay greyed out, hover or no hover. Buttons that do work are unaffected.

**One sort of button ignores this tab, and should.** Buttons that belong to somebody else - an Apple Pay or Google Pay button at the checkout, a live-chat launcher, a payment provider's own widget - keep the look their owner insists on, and your colours are not applied to them. That is deliberate: those brands set rules about how their buttons may appear, shoppers recognise them by exactly that appearance, and painting one in your own colours makes it less trustworthy rather than more. Everything the site itself draws still follows this tab as it always did.

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

The one worth checking is **Links > Hover colour**. A hover colour picked to look good on a white page is usually a deep, near-black shade, and reusing it on a dark page makes the thing you're pointing at disappear rather than light up - which is especially obvious where a whole card is a link, since the headline goes dark just as you reach for it. Give the hover its own dark-mode override: something brighter than your page background, such as an accent colour.

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

### Starting points

Click **+ New Layout** and Cactus shows you a gallery of ready-made designs to start from, sorted into the same tabs as the Layouts list itself: headers, footers, page layouts, 404s, status pages, and a tab for each module that adds its own. Every design has a little sketch of its structure on the card, so you can see at a glance which one puts the logo in the middle, which one has the sidebar on the left, and which one is a blank canvas - rather than reading four nearly identical descriptions and guessing.

Pick one and it becomes a layout of your own immediately, opening straight in the editor. There is nothing read-only about it: rename it, gut it, publish it, delete it. It was only ever a starting point.

Every type offers a **Blank** option too, if you would rather begin with nothing. (Page layouts are the exception - they always need somewhere for the page's content to go, so every page layout starts with a content slot in it.)

Starting points are not layouts in their own right, so they never clutter up your Layouts list. That list only ever shows layouts you actually have.

Cactus does create a handful of real layouts when your site is first set up - a default header, footer, page layout, 404 and the coming-soon/maintenance screens - so the site works the moment it goes up. Those are ordinary layouts, yours to edit or bin like any other.

> **Upgrading from an older version?** Earlier versions of Cactus installed every starting point into your Layouts list as a read-only **Starter** template, and a fault meant each Cactus update quietly added more copies of them. Those get cleared out on your next update. Anything you edited, published, or built yourself is left exactly where it is - if you are not sure whether something was yours, it survives.

### Editing the header or footer

1. Go to **Appearance → Layouts**.
2. Click on the header or footer you want to edit.
3. Use the drag-and-drop editor to add, remove, or rearrange blocks.
4. Click **Publish** to make the changes live.

The **Site logo**, **Menu**, **Login button**, **Copyright**, and **Cookie settings link** blocks are all designed for use in headers and footers - they read your site settings automatically and don't need manual content.

The header editor also offers the **Heading**, **Text**, **Rich text** and **Button** blocks, plus a **Divider**, so you can drop in things like a phone number, a strapline, or a "Call us" button alongside the logo and menu. Use a Button pointed at a `tel:` link if you want the number to be tappable on a phone.

**Centring things in the header.** When you set a header column, or a spaced-out group, to centre, whatever sits in the middle now lines up with the true centre of the header itself - and stays there even when something beside it changes width, such as your logo shrinking as the page scrolls. It used to quietly drift off to one side whenever its neighbours grew or shrank, which rather defeated the point of centring it. Nothing to switch on: it just behaves itself now.

**Site logo height.** The Site logo block's height setting is labelled **Element height**, with a matching **Element height when shrunk** if your header is set to shrink on scroll. The logo scales to that height and keeps its proportions.

**A different logo on phones.** The Site logo block normally shows whatever you set in Branding, and that is still what you get. If you want something else in one place - a compact square mark on phones while the desktop header keeps the full lockup - the block now has its own **Logo image**, with a **Logo image in dark mode** appearing once you have picked one. Leave the first blank and nothing changes. Fill it in and that block uses your image instead, in both colour schemes if you only pick the one. The way to do the phone job is two Site logo blocks in the header, each hidden at the size the other one covers, which is how most headers are already built.

**Height.** Also with nothing selected, **Height** is now a box you type a number into rather than a list of six sizes, and it is set per screen size like everything else - so a phone header carrying a single row of small icons can be genuinely short while the desktop one keeps its full height and its logo. Leave it blank for 64px. Type `auto` if you would rather it simply grew to fit whatever is in it. Anything you set before this change is untouched and still reads the same.

**Border.** The header's **Border** setting used to be a straight Show or Hide, and what it showed was always a line along the bottom. It now asks which edge you actually want: **Bottom only**, **Top only**, **Top and bottom**, or **No border** - handy for a header that sits below an announcement strip and wants a line above it as well. The colour swatches underneath work exactly as before and apply to whichever edges you have picked. There is also a **Thickness** box now - type a number, pick px, rem or em - so a header can carry a hairline, a confident 2px rule or a thick band, rather than the one hairline it used to be stuck with. Leave it blank and you get the hairline you have always had. Headers set up before this carry on with their line along the bottom, so nothing moves unless you move it. The footer's Border setting and the Site Header block both gained the same thickness box.

**Side padding.** With nothing selected in the header editor, the settings panel has a **Side padding** box: the gap held clear down each side of the header, between the screen edge and whatever sits furthest left and right. Leave it blank for the usual comfortable gap. Set it per screen size like everything else, so you can claw back a few millimetres beside the logo on phones - where every pixel counts - while the desktop header stays exactly as it was.

### Display conditions

Each layout can be set to apply to specific contexts - so you can have a different header on your homepage, a simplified layout for a particular section, or a unique 404 page. Set this on the **Conditions** tab in the layout editor.

Options include:
- Entire site
- A specific page
- A specific URL prefix (e.g. everything under `/blog/`)
- A specific module's pages

When multiple layouts match a page, the most specific one wins.

### Publishing layouts

Like pages, layouts have a draft state and a published state. Changes stay in draft until you click **Publish**. The button greys out when there's nothing new to publish, so an untouched layout won't tempt you into a pointless save. The **Preview** button lets you see the layout before making it live.

Module layout types come with their own starting points, same as headers and footers, and nothing about a module's pages changes until you create a layout from one and publish it. Directory, Gazette and Boards' pages, plus Shop's Category and Collection pages, already have a perfectly good built-in look, so they carry on looking exactly as they do until you say otherwise. Shop's Home, Product, Checkout and Confirmation pages are the exception: they have no built-in look of their own to fall back on, so a plain default layout is created for them the moment Shop is switched on - edit it, or replace it with one built from a different starting point, whenever you like.

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
- **Theme colour** tints the browser toolbar on mobile, the bar around Safari's window on a Mac, and the installed app.
- **Background colour** is shown briefly while the installed app is loading.

**A note on Safari.** Recent versions of Safari stopped reading the setting every other browser uses for this and started working the colour out from the page itself, which is why the bar around the window used to come out plain white or plain black however you set your Theme colour. Cactus now hands Safari the Theme colour by a route it does pay attention to, so the bar tints the way you asked and your pages do not change colour by so much as a pixel. Nothing to switch on.

One exception, and it is deliberate: if your header is set to one of the see-through backgrounds, there is nothing solid at the top of the page to work with, so Safari falls back to matching your page instead. Headers on a solid colour are the ones that carry the tint.

### Dark-mode logo and favicon

You can also upload a **dark-mode logo** and a **dark-mode favicon**. Both are optional - leave them empty and your standard logo and favicon are used everywhere.

- The **dark-mode logo** is shown automatically whenever a visitor is viewing your site in dark mode, whether they chose it with the toggle or their device is set that way. Handy if your normal logo is dark ink that would vanish against a dark background.
- The **dark-mode favicon** follows the visitor's browser or device setting rather than the toggle on your site, because browsers decide favicons for themselves. It swaps in when their system is set to dark mode.

### Where the favicon shows up

Your favicon is used for everything the site serves, not only its pages. Ask a browser for `/sitemap.xml`, `/robots.txt` or any other file the site hands out and there is no page for the icon to be attached to, so the browser falls back to asking the site for `/favicon.ico` directly - and that now answers with **your** icon rather than the Cactus one. Before, a site with its own branding showed somebody else's logo on the tab of its own sitemap, which is not a good look for something you might well be showing a client.

Your icon is also handed out from your own web address rather than from wherever the picture is stored. That sounds like an implementation detail and is not: a browser fetches the tab icon dead last, after everything else on the page, and if that one request gets lost in the crowd it remembers the blank tab for that page and does not try again for a good while. On a busy shop page - hundreds of products, hundreds of pictures, all from the same picture store - the icon was regularly the request that lost. Serving it from your own address puts it on a road that is already open. If you ever saw a favicon on most pages but not all of them, that was this.

Changing the favicon takes up to an hour to show everywhere, since browsers hold on to tab icons rather firmly. A hard refresh hurries it along.

### Your logo in emails

Email programs are fussier than browsers. Gmail refuses to draw an SVG logo at all, and Outlook has never understood the WebP format your pictures are usually saved in - so a logo that looks perfect on your site can arrive as an empty space at the top of your order confirmations. Cactus now makes a plain PNG copy of your logo for emails on its own, the moment one is needed, and keeps it in step whenever you change your logo. Nothing to switch on and nothing to upload twice.

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
- **Collapse to hamburger** - the links fold away behind the usual three-line hamburger button that opens a drop-down panel. The button now measures exactly as wide as the three lines you can see, so it lines up with any icons sitting beside it in a header row instead of quietly claiming a bit more space than they do. It is still comfortably tappable: the touch area reaches past the lines without taking up room.
- **Dropdown (current page)** - the menu shrinks to a single button showing the page you're currently on, with a little arrow; clicking it opens the full menu. Handy when space is tight but a hamburger feels like overkill.

**Dropdown button width** applies to the **Dropdown (current page)** mode only, and can differ per screen size. **Fits its text** is how it has always behaved: the button is exactly as wide as the page name inside it. **Full width of its slot** stretches it across whatever space it was dropped into, with the three lines pushed over to the far right, so it lines up neatly with anything sitting directly above or below it - a search box in the same column, most often.

**Dressing the menu button.** The collapsed menu button - the hamburger, or the current-page dropdown - used to draw itself in plain body text inside a plain grey border, whatever it was sitting next to. **Menu button text colour**, **Menu button background** and **Menu button border colour** now let you match it to its neighbours, which in a header usually means the search box beside it. Each takes a light and a dark mode pick, like every other colour here. Leave them blank and the button looks exactly as it always has. They apply to both collapsed styles, and the hamburger's three lines take the text colour too.

**Dropdown alignment** decides which side of its space the collapsed menu sits on: **Left** (the default, and how it has always behaved), **Centre** or **Right**. It moves the button itself - the hamburger, or the current-page dropdown - and everything that opens out of it follows: the hamburger's links line up to the same side, and the dropdown's panel hangs from the matching edge of the button rather than wandering off towards the middle of the page.

**Scale (%)** shrinks or grows the whole menu, and like the other settings it can differ per screen size. 100 is normal size. Set it to, say, 50 on the phone toggle and the menu (or its hamburger button) renders at half size on phones and takes up half the room, without you having to fiddle with font sizes and spacing one at a time. The hamburger's full-width panel is deliberately left at normal size, so its links stay comfortably tappable however small you shrink the button.

**Keep on one line** is the lazy way to do the same job. Switch it on and the menu measures itself against the room it has been given and shrinks its links just enough to keep them all on a single row, rather than letting the last one or two drop onto a second line. It only ever shrinks, never grows, so a menu that already fits is left exactly as it is. Add a link later and it simply tightens up a bit more. Worth remembering that there is a floor to this in practice: shrink a ten-item menu into a narrow header and you'll get a row of very small links, which is what the hamburger is for. It also keeps the collapsed **Dropdown (current page)** button in check: a long page name shrinks to fit the button instead of wrapping onto a second line or poking out past the space the button was given.

Click **+ Add item** to open the picker, then choose where the link should go:

- **Page** - one of your info pages. Pick this to search and select from your pages.
- **A module** (Boards, Gazette, Directory, etc, whichever you have installed) - pick the module, then pick what kind of thing to link to (its home page, a board/sub-board/tag/category, a Gazette post/tag/series/author, a Directory listing/category...), then search for the specific one you want.
- **External link** - any web address, with the option to open it in a new tab.

Use the **←** back arrow in the top-left of the picker to change your mind at any step without starting over.

If a module item's target is later unpublished or deleted, the admin list still shows it (so you can fix or remove it), but it's automatically left out of the menu on the live site.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Configuration reference](Configuration-reference)
