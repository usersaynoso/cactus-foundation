# Directory

**Directory** is a map-based listings module for Cactus. Group entries into **Categories**, drop a pin on a map for each one, pick out a few as **Featured**, and let visitors browse, search and filter the results - all from your own admin.

The directory lives at `/directory` on your site (or `/directory/cafes` for a category, `/directory/cafes/the-kettle-and-bean` for an individual entry). If you already have a page at `/directory`, that page wins and the directory's front page stays hidden until you rename one of them.

---

## Who can do what

Directory has two permissions, set on your core roles from **Settings → Users → Roles**:

- `directory.access` - see the Directory section in the admin sidebar and its dashboard summary.
- `directory.manage` - create and edit categories and entries, change settings, and run CSV imports.

Give someone `directory.manage` without `directory.access` and they can still work the API directly but won't see a sidebar link - in practice you'll want to give people both together. Core admins always have full run of Directory, permissions or no permissions.

---

## Categories

From **Directory → Categories**, anyone with `directory.manage` can add a category with a name, an optional description, and an emoji icon. Drag rows to change the order they appear in on the public front page. A category can't be deleted while it still has entries in it - move or remove those first, then the category will delete cleanly.

---

## Adding an entry

From **Directory → Entries → New entry**, fill in:

- **Core details** - name, category, and whether it's a draft or published. Tick **Featured** to pin it above the rest, with an optional end date after which it quietly drops back to normal (checked once a day).
- **Content** - a short description (shown on cards and in map pins) and a longer write-up using the same block editor as the rest of your site.
- **Location** - type an address and click **Find coordinates** to look it up automatically (no API key needed, just a moment's wait), or enter latitude and longitude by hand. A small map preview shows exactly where the pin will land. There's also an area, a sub-area, and an optional numeric "route marker" for anyone building an ordered trail or route out of their entries.
- **Contact** - phone, email and website, shown as a contact card on the public page if any are filled in.
- **Media** - add one or more images from your media library; drag to reorder, the first one becomes the cover photo.
- **Tags** - free-text, with suggestions drawn from tags you've already used elsewhere.

**Save Draft** keeps it hidden from the public site; **Publish** makes it live straight away. **Duplicate** copies an existing entry (handy for near-identical listings), and **Copy preview link** gives you a private link to a draft, safe to share for a look before it goes live - generating a new one cuts off the old link.

---

## Finding entries

**Directory → Entries** lists everything with filters for category, status, featured, and a "missing location" flag for anything without coordinates yet, plus a search box and bulk publish/unpublish/delete for tidying up in one go.

---

## Bringing in a spreadsheet

If you've got listings sitting in a spreadsheet, **Import CSV** on the Entries page takes a CSV file with columns for name, category, coordinates, description, contact details and tags (piped together with a `|`). Cactus checks every row before anything is written, flags anything it can't make sense of, and lets you download a report of just the problem rows to fix and try again. Everything comes in as a draft, so you can give it a once-over before publishing. Turn the importer off entirely from **Settings → Directory**, if you'd rather nobody used it.

---

## The public directory

Visitors land on a front page showing your categories, a map of everything published, and a paginated list with featured entries pinned to the top. Each category has its own page with a filterable map, an area filter, sorting (newest, alphabetical, or by route marker if any entry in that category has one set), and a live search box. An entry's own page shows its photos, write-up, contact details and a single-pin map.

## Linking to Directory content from a menu

When editing a menu (see [Appearance and design](Appearance-and-design)), choose **Module content** and then **Directory** to link directly to a category or a listing, instead of typing out the address by hand.

---

## Settings

**Settings → Directory** covers the intro text shown on the front page, the map's default centre point and zoom level, the label used for featured entries (defaults to "Featured", change it to "Sponsored" or whatever suits), and the CSV importer on/off switch.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Gazette](Gazette) · [Boards](Boards) · [Directory](Directory) · [Reply Catcher](Reply-catcher) · [Configuration reference](Configuration-reference)
