# Appearance and design

Cactus has a visual design system that controls every aspect of how your site looks - colours, fonts, layouts, header, and footer. All of it is configurable through the admin with no coding required.

Find these settings under **Appearance** in the admin sidebar.

---

## Styles

**Appearance → Styles** is where you set your site's global visual style. It's split into tabs, each covering a different area of design.

### Colour presets

The fastest way to change your site's look is a **colour preset**. At the top of the Colours tab you'll find ten ready-made colour schemes. Clicking one updates your site's primary colour, link colour, and hover colour instantly.

You can customise further after applying a preset, or ignore presets entirely and define your own colours from scratch.

### Colours tab

- **Global colours** - define up to 12 named colours, each with a light-mode and dark-mode variant. Once defined, these colours are available as swatches everywhere else in the Styles editor, keeping your palette consistent.
- **Page background** - the background colour for all public pages.
- **Links** - the colour of hyperlinks and what they change to when hovered.

### Fonts and typography tab

- **Global fonts** - define named font styles (for example, "Brand heading font"). Cactus loads them from Google Fonts automatically.
- **Body text** - the font, size, line height, and weight used for ordinary paragraph text.

### Headings tab

Set the font, size, weight, and colour for each heading level (H1 through H6) independently. Each level is collapsible so the page stays manageable.

### Buttons tab

Set the typography, colours (text, background, border), border radius, padding, and hover state for buttons across the whole site.

### Images tab

Control the border radius and border style applied to images.

### Form fields tab

Set the appearance of text inputs, labels, and other form elements - useful if you have a contact form or other forms on your site.

### Spacing tab

Set the default left and right padding applied to content blocks. This is the "breathing room" that stops text running right to the edges of the page.

### Saving

Click **Save** to apply your changes. The public site updates immediately. If you navigate away before saving, a prompt will ask whether you want to save or discard.

### Light and dark mode

Cactus supports light mode, dark mode, and auto (which follows the visitor's device setting). The toggle at the bottom of the admin sidebar lets you switch between them. Visitors get the same toggle on the public site.

Your global colours each have a separate light and dark variant, so you can define exactly how your site looks in both modes.

---

## Layouts

**Appearance → Layouts** is where you build the structural templates for your site - the header, footer, page wrapper, and special pages like 404 errors.

Layouts use exactly the same drag-and-drop editor as pages, with all the same blocks available.

### Layout types

| Type | What it does |
|------|--------------|
| **Header** | The navigation bar at the top of every page. |
| **Footer** | The bottom of every page. |
| **Info page layout** | The wrapper around your page content. Use the **Content slot** block to mark where page content appears. |
| **404 page** | What visitors see when a page doesn't exist. |
| **Status page** | What visitors see when your site is in coming-soon or maintenance mode. |

### Starter templates

When you first set up Cactus, a library of ready-made starter templates is installed automatically. You can:

- Use a starter template as-is
- Edit a starter template to suit your needs
- Build your own layout from scratch

Starter templates can be reset to their original state at any time. Go to **Settings → General** and click **Refresh starter templates**.

### Editing the header or footer

1. Go to **Appearance → Layouts**.
2. Click on the header or footer you want to edit.
3. Use the drag-and-drop editor to add, remove, or rearrange blocks.
4. Click **Publish** to make the changes live.

The **Site logo**, **Menu**, **Login button**, **Copyright**, and **Cookie settings link** blocks are all designed for use in headers and footers - they read your site settings automatically and don't need manual content.

### Display conditions

Each layout can be set to apply to specific contexts - so you can have a different header on your homepage, a simplified layout for a particular section, or a unique 404 page. Set this with the **Display conditions** controls on the layout editor.

Options include:
- Entire site
- A specific page
- A specific URL prefix (e.g. everything under `/blog/`)
- A specific module's pages

When multiple layouts match a page, the most specific one wins.

### Publishing layouts

Like pages, layouts have a draft state and a published state. Changes stay in draft until you click **Publish**. The **Preview** button lets you see the layout before making it live.

---

## Branding

**Settings → Branding** is where you upload your logo and favicon.

- Your **logo** appears wherever you've placed a **Site logo** block in the header or footer.
- Your **favicon** appears in the browser tab.

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

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Configuration reference](Configuration-reference)
