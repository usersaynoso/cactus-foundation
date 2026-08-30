# Ultimate SEO

**Ultimate SEO** is the SEO command centre for a Cactus site. It gathers every page the site serves - core pages and the content of any installed modules (Gazette posts, Shop products, product categories and collections, filter pages, Directory entries) - into one place, scores each one against a set of search-friendly rules, suggests fixes, applies the easy ones with one click, crawls the live site the way a search engine would, and puts the sitemap and robots controls in the admin where they belong.

> **Where it lives now.** SEO used to take four sidebar links. It takes one - **SEO** - with Dashboard, Pages, Site audit, Structured data and Sitemap & robots as tabs across the top. Old links still work.

Install it and a new **SEO** section appears in the admin sidebar with five screens, plus an **SEO** tab on **Settings**.

---

## Who can do what

Two permissions, set on your core roles from **Users → Roles**:

- `seo.view` - see the dashboard, the pages list and audit results, and run the analyser.
- `seo.manage` - apply one-click fixes, run site audits, edit sitemap and robots rules, set up structured data, and change SEO settings.

---

## The Dashboard

The first screen is the state of the nation:

- **Average SEO score** across every analysed page, plus counts of pages missing descriptions, missing social images, missing focus keywords, and duplicate titles.

**What counts as having a social image.** A page has one if it would actually show a picture when somebody pastes its address into a message or a post, not merely if a picture was chosen for it by hand. A product counts if it has photographs. A product category counts if it has its own picture, or if the products on it do. A collection counts if the products on the shelf do. So a shop that has never once opened the social image box is not told off eighty-odd times for something it is already doing perfectly well.
- **Quick wins** - the lowest-scoring pages, one click away from their analysis.
- **Recent site audits** with error and warning counts.
- A **very loud warning** if the whole site is currently hidden from search engines (or the site status is coming-soon/maintenance, which blocks crawlers just as thoroughly). No point polishing metadata nobody is allowed to read.

## Pages

One table of everything with a URL: core pages always, and - when the modules are installed - Gazette posts, Shop products, Shop **product categories** and **product collections**, **filter pages**, and Directory entries.

The last three are the ones people are surprised to find here, and they are usually the ones doing the heavy lifting. A product category at `/shop/categories/office-chairs`, a collection at `/shop/collections/impulse` and a filter page at `/green-office-chairs` are each a real address with its own page title and description, written to bring people in from a search - so they are listed, scored and filtered exactly like everything else. Whether a shop's products sit at `/desk-name` or `/shop/products/desk-name` is followed too; categories, collections and filter pages keep their own addresses either way.

### Reading the table

Across the top sit the figures you opened the screen for: how many pages there are, the average score, how many are good, need work or are frankly poor, how many have never been analysed, how many have no meta description, and how many carry a score that is now out of date. **Every one of those tiles is a filter.** Reading "43 pages have no meta description" and then having to build that filter by hand is precisely what made this screen basic; click the tile instead.

Each row shows the page and its address, its type, publication status, the meta description (with its length, since length is the thing that goes wrong), the focus keyword, a count of failures and warnings, the score, and when it was last analysed.

**Every column sorts.** Click a heading to sort by it, click again to turn it over. Columns start the way round they are useful - worst score first, most problems first, longest-unlooked-at first, missing descriptions first - because nobody opens this screen to admire the pages that are already fine. Pages with no score at all, no keyword or no date stay at the bottom whichever way the arrow points: absent is not the same as worst, and a wall of blanks at the top would bury what you asked to see.

### Narrowing it down

Under the tiles: filter by **content type**, by **published or not**, by **score band**, and by **issue**. The issue list is built from what the analyser actually found on your site, commonest first with a count beside each - *No meta description (43)*, *Duplicate title (7)* - plus two of its own: **Never analysed** and **Score out of date**.

**Score out of date** is the useful one nobody thinks to ask for. It means the page has been edited since it was last analysed, so the score describes a version of the page that no longer exists. The row says so, and so does the detail panel.

The search box matches titles, addresses, focus keywords and meta description text at once.

Your filters, sort order and page size are remembered, so coming back to the screen picks up where you left it. **Clear filters** puts it all back.

### Working through a long list

- **Page size** of 25, 50, 100 or the lot, with the usual Previous/Next underneath, so a shop with four hundred products is a table rather than a scroll.
- **Tick boxes** on each row, and one in the heading that takes the whole page of results. Once anything is ticked, a bar appears with **Analyse selected** on it - and, when your filters match more than is on screen, **Select all *N* matching**.
- **Export** hands you the current view as a spreadsheet, in the order it is on screen, with the description, keyword, score, failure and warning counts and both dates. Useful for handing a list to whoever writes the copy.

### The detail panel

Click a row and the detail panel opens:

- A **Google-style result preview** showing how the title and description will actually look in search results, truncation and all.
- A **focus keyword** box - the search phrase the page should win. The analyser scores keyword placement (title, description, slug, body copy) and density against it.
- **Analyse** runs a 20-odd-rule check: title and description length and uniqueness, slug hygiene, one-H1 structure, content depth, image alt text, internal links, readability, publication status.
- For **core pages**, the title and meta description are editable right there, with a *Use suggestion* button that drafts a description from the page's own copy. Saving writes through properly - the page editor and the next publish both see the change.
- For **module content**, editing happens where that content lives - the panel deep-links straight to the right editor in Gazette, Shop or Directory. The analysis still applies either way.

### Analysing everything at once

Clicking Analyse on four hundred products one at a time is nobody's idea of an afternoon. The button beside the filters does the lot:

- **Analyse all *N*** scores every page in the table and saves the results, with a progress bar and a **Stop** button for when you change your mind. It works through the list in small batches, so a big catalogue is a longer wait rather than a broken one.
- Narrow the list first with any of the filters and the button follows suit - it reads **Analyse these *N*** and only touches what the filters match, whether or not it is on the page you are looking at. Filter to **Never analysed** and press it for the obvious first pass; filter to **Score out of date** and press it to bring everything back up to date after a busy week of editing.
- Or tick individual rows and use **Analyse selected**, for when only a handful are worth the wait.
- Focus keywords are left exactly as they are. A bulk run re-scores pages, it never re-words them.
- When it finishes you get the count and the average score, and the Dashboard's figures catch up with it.

Run it again whenever you have added a batch of content - re-analysing an already-scored page simply replaces its score.

## Site audit

The Pages screen analyses what is stored; the audit checks what is actually served. It fetches your published pages over HTTP - the same view a search engine gets - and reports:

- Broken pages and timeouts
- Missing or overlong titles, missing meta descriptions
- Stray `noindex` directives
- Heading problems, missing image alt text, thin content
- Missing Open Graph tags and canonical links
- Canonical tags pointing at another site entirely, or at nothing usable
- Missing or unreadable structured data
- Missing viewport tag, or a page that never says what language it is in
- Slow responses

Run it on demand from the button, or let it run itself weekly (Mondays, 4am, when it is least likely to be in the way). History is kept per run with per-page issue lists. The page limit per crawl is configurable in settings (default 50).

## Sitemap & robots

- **Blocked paths** - add robots.txt Disallow rules from the admin. They join the ones Cactus already blocks (admin, setup, API paths) and take effect immediately.
- **Extra sitemap entries** - your pages and module content are in the sitemap automatically; anything else you want crawled can be added here with optional priority and change frequency.
- Both screens link straight to the live `/sitemap.xml` and `/robots.txt` so you can see the result.

> **Fixed in 0.1.6.** Both lists were being collected only from modules that serve public pages under a prefix of their own, which this module does not - so the rules you added here were saved, listed back to you, and then had no effect whatsoever on the live `/sitemap.xml` and `/robots.txt`. They apply now. If you added a Disallow rule at any point and wondered why the page was still being crawled, that is why, and it is worth a look at the list to check you still mean all of it.

## Structured data

**New in 0.1.10.** Fill this in once and it goes out on every page of the site. Before, the only way to tell search engines who you were was to drag a block onto a page, and it then applied to that page and no other.

**What goes out** - three switches, all off until you turn them on:

- **Organisation details on every page** - the record search engines use to build a knowledge panel: your name, logo, description, contact details, address, registration numbers and official profile links.
- **Website details on every page** - names the site itself and ties it to the organisation above, so the two read as one record rather than two unrelated claims.
- **A search box in search results** - lets Google offer a search box for your site directly in its results. Needs a search address containing `{search_term_string}` where the visitor's words go, and the website details switched on.

**What kind of organisation is this?** - tick as many as are true, not just one. An online shop is both an *Organisation* and an *Online shop*, and saying so is how it qualifies for both sets of treatment in search results. *Local business*, *Shop with premises* and *Professional service* are for somewhere with a door, and ticking one of those three is what makes the opening hours and price range fields appear - putting them on the others is markup search engines throw away.

**Everything else is a field.** The whole record is fillable in, with nothing needing hand-written JSON:

| Section | Fields |
| --- | --- |
| Who you are | Name, also known as, registered legal name, description, home page, founded |
| Logo and photograph | Logo, logo width, logo height, logo caption, photograph |
| How to reach you | Email, phone, street address, town, county, postcode, country, areas served |
| Contact point | What it is for, email, phone, areas served, languages |
| Registration numbers | VAT number, tax ID, D-U-N-S number, ISO 6523 code, and one free "other number" pair - what it is, and the number |
| Official profiles | One URL per line |
| Premises | Opening hours, price range - only when a premises type is ticked |

Leave anything blank and it is simply left out. Leave the name blank and it uses the site name; leave the home page blank and it uses this site. The logo can be a full web address or a site path like `/brand/logo.png`; either way it goes out as a full address, because whatever reads it has no idea what site it came from.

A few things the screen decides for you, so you do not have to think about them:

- **A single value goes out as a single value.** One area served is `"GB"`, not `["GB"]`. Both are correct; only one of them matches what you will see in every reference example when you go to check your own markup.
- **The contact point needs a way to be contacted.** A contact type with no email and no phone number says nothing anybody can act on, so it is left out entirely until one of them is filled in.
- **The "other number" needs both halves.** A registration number nobody can name is a number nobody can use.
- **The free-text "other number" is for anything with a name** - a Companies House company number, a charity number, a licence number. The named boxes above it exist because VAT, D-U-N-S and ISO 6523 have proper homes of their own in the vocabulary.

**The preview** on the right is not a mock-up. It is the exact text every page will carry, built by the same code that builds the live one, so it cannot quietly drift into being a flattering approximation. Paste it into Google's Rich Results Test if you want a second opinion.

> **Nothing is published until you say so.** Every switch starts off, including on a site updating from an earlier version. A half-filled organisation record on every page of the site is worse than none, so the module will not make that decision for you.

## Structured data blocks

Two blocks also appear in the page builder, for the pages that need to say something different:

- **Structured data (SEO)** - invisible on the page, very visible to search engines. Describes an *Organisation*, *Local business* (with address, phone and opening hours), *Website*, or any custom JSON-LD you paste in. Organisation fields pre-fill from your saved SEO settings. Now mainly for a page that describes somebody other than you - a partner, a venue, an event; the site-wide settings above handle your own details better.
- **FAQ (SEO)** - a real, working FAQ accordion for visitors, with FAQPage markup underneath so the questions are eligible for rich results in search.

## Settings → SEO

- **Search engine visibility** - the master switch (this is the same setting that used to live in general settings; it has moved in with the rest of the SEO controls, and still works from either home).
- **Organisation details** - name, legal name, logo, official profile links and X/Twitter handle. The profile links feed the site-wide structured data as well as pre-filling the page-builder block. The X/Twitter handle is now published as the `twitter:site` tag, so shared links credit your account - it was stored and used by nothing before 0.1.10.
- **Analyser targets** - title/description length ranges, keyword density band, and the audit page limit. The defaults follow current good practice.

---

## For developers

- Repo: [cactus-foundation-modules/ultimate-seo](https://github.com/cactus-foundation-modules/ultimate-seo)
- Requires core `0.5.1418+` (the site-wide head hook the structured data is emitted through arrived in that release; earlier core builds also never collected this module's sitemap and robots entries at all). No environment variables; the weekly audit authenticates with the standard `CRON_SECRET`.
- Tables are prefixed `seo_` (settings singleton, per-page analysis, audit runs and issues, robots rules, sitemap entries) and are torn down on uninstall. `002_structured_data.sql` adds the `structured_data` column to the settings singleton.
- Integration is entirely through existing module hooks: `lib/sitemap.ts` (`getPublicSitemapEntries`), `lib/robots.ts` (`getPublicRobotsDisallow`), `lib/head.ts` (`getPublicHead`, new in core 0.5.1418 - see [Authoring a module](Authoring-a-module)), a `settingsTabs` manifest entry, manifest `puckBlocks`, and a `cronJobs` entry.
- The JSON-LD builders in `lib/structured-data.ts` are pure functions with no database or environment access, so the admin preview and the live page are the same code path rather than two renderings that agree until one is edited.
- One-click fixes write only to core `InfoPage` rows (columns plus the Puck `root.props` mirror in both draft and published data, so a later publish does not revert them). Module-owned content is analysed read-only and deep-linked to its own editor - this module never writes another module's tables.
