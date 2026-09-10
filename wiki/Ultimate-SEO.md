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

## AI & agents

**New in 0.1.12.** People increasingly find a shop by asking an assistant rather than by searching. This tab is about being findable that way - and about having a say in it, because "AI crawler" covers three quite different visitors and only one of them takes without giving anything back.

Nothing here changes what your site publishes until you change it, with one exception said plainly below.

### What you publish for AI readers

Three things, and the first three switches are **on** from the start:

- **`/llms.txt`** - one Markdown page listing everything on the site, with a line of summary each. This is the file assistants look for first.
- **`/llms-full.txt`** - the same index with the shorter pages written out in full. Products are deliberately left out: a catalogue of any size makes a file nobody would finish fetching. They are still in the index, one line each, with their own address.
- **A Markdown twin of every page** - the same page at the same address with `.md` on the end. `/about` also answers at `/about.md`, `/task-chair` at `/task-chair.md`, and the home page at `/index.md`. No menus, no buttons, no scripts: the words, the headings, the links and - for a product - the price, the stock, the specification, the variations and whether there is a 3D model of it.

You choose which kinds of content get a twin, and you can write a sentence or two at the top of the index saying what the site is. Untick a content type and it drops out of the index and its twins are removed at the next rebuild.

**Why "rebuild".** The twins are built ahead of time and stored, not generated when somebody asks for one. Building a large catalogue's worth takes real time and real money; serving one that is already built is a single lookup. So they are rebuilt overnight, whenever you save a summary, and whenever you press the button - and the overnight rebuild only touches pages that have actually changed since last time, so on a night when nothing was edited it costs almost nothing. The practical effect is that an edit made today is in the Markdown copy tomorrow morning; press the button if you want it there sooner. Two buttons: **Rebuild what has changed**, and **Rebuild everything** for after a change to how the pages are put together rather than to what they say. A very large catalogue may not finish in one go; it says so, and picks up where it stopped next time.

### What each page says about itself

Two switches that share one lookup, so having both costs no more than having either. **Both off by default**, because unlike everything above them they put a small database read on the render of every public page - which shows on your Vercel bill as **Fluid Active CPU**. A cached page does not pay it twice, and a page with no Markdown copy built does not pay it at all.

**Publish structured data on every page.** This is the machine-readable summary that puts the trail of links under your name in a search result, and that an assistant reads to work out what a page actually is. What goes out depends on the page:

| Page | What it publishes |
| --- | --- |
| Anything with a trail above it | Breadcrumbs - Home > Office Chairs > Task Chairs > this one |
| A blog post | Its headline, summary, picture, author and dates |
| A category or collection | That it is a listing page, and the first thirty things on it |
| A directory entry | That it is a business, with its address, telephone and website |
| A product | Breadcrumbs only - see below |

**Your shop already publishes the product details on a product page**, with the tax handled and the prices withheld when you have set the shop to hide them. This deliberately does not repeat them: two different prices for one item is the fastest way to have a shopping feed suspended. Breadcrumbs are the half nobody was publishing.

**Tell each page's reader where its Markdown copy is.** A line in the page's head pointing at the same address with `.md` on the end, so an assistant finds the plain-text version without having to guess that it exists. Needs the Markdown twins switched on above; it greys out if they are not, because a link to a page that answers "not found" is worse than no link.

Neither switch changes anything until a page has a Markdown copy built - they read the same rebuilt-overnight table everything else does, so a brand new page gets both the morning after it is published, or straight away if you press **Rebuild what has changed**.

### Which AI crawlers may read the site

Every crawler on this screen is currently allowed, because that is what your site does today and an update has no business quietly changing it. They are grouped by what they are actually for, which is the distinction no single robots.txt line can make:

- **The ones that send you customers** - they index your pages so an assistant can recommend you and link to you. Blocking these is how a business disappears from answers people are already asking.
- **The ones fetching a page for somebody right now** - somebody asked their assistant about you and it went to look. Block one and the person is told your site would not answer.
- **The ones that take and give nothing back** - they collect your pages to train a model. No link, no visit, no credit. Plenty of owners block the lot, and it costs nothing in search: Google's and Apple's training opt-outs are separate from their ordinary search crawlers, so turning them off does not affect either company's search results.

There is a **Block the lot** button on the third group for owners who want exactly that and no further reading.

Below that, **what they may do with what they read**: three declarations - may we be shown in results and answers, may our pages be used to answer a question being asked right now, may our pages be used to train a model. These are a statement of intent rather than a lock on the door, published as a `Content-Signal` line that a growing number of companies have agreed to honour. Each starts unanswered, because saying nothing and saying no are different answers and it is not for this module to put words in your mouth.

### Who has been reading

**Off by default, and it costs money.** Switched on, this counts AI crawler visits and people arriving from an assistant, and answers the question everybody asks next: is any of this working? Each AI visit is one small database write, which shows on your Vercel bill as **Fluid Active CPU**. An ordinary human visitor costs nothing extra - the check that decides is two string comparisons and never touches the database - and the write happens after the page has already been sent.

Counts are kept per day, per assistant and per page, for as long as you choose.

### Letting agents query the site directly

**Off by default, and it costs money.** This turns on a read-only endpoint at `/api/m/ultimate-seo/mcp` that an assistant can use to search your catalogue and read any page in one call instead of crawling the site. It is read-only in the strict sense: there is no tool there that changes anything, and it can see only what the site already publishes to anybody with a browser.

Every request is a function call - **Invocations** and **Fluid Active CPU** on your Vercel bill. An agent can make a great many of them in a short space of time, and unlike a person it does not get bored. That is the whole reason it starts switched off. When it is on, the address is named in `/llms.txt` so an agent that reads the index can find it.

### Summaries written for AI readers

One line per page, written by you, that goes at the top of that page's Markdown twin and into its line in the index. It is the line a model quotes when it only has room for one. Costs nothing, and the box appears on the **Pages** tab beside everything else about that page; saving one rebuilds that page's twin there and then.

The Pages tab also gains a **Ready for AI** column, which says whether each page has a Markdown copy built and whether it has a summary.

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
- Requires core `0.5.1565+` from 0.1.12 (the `core.agent-content` extension point, the `links` half of the head hook and the `/llms.txt`, `/llms-full.txt` and `.md` addresses all arrived there). 0.1.11 and earlier require `0.5.1418+` (the site-wide head hook the structured data is emitted through arrived in that release; earlier core builds also never collected this module's sitemap and robots entries at all). No environment variables; the weekly audit authenticates with the standard `CRON_SECRET`.
- Tables are prefixed `seo_` (settings singleton, per-page analysis, audit runs and issues, robots rules, sitemap entries, materialised Markdown documents, AI hit counts) and are torn down on uninstall. `002_structured_data.sql` adds the `structured_data` column to the settings singleton; `003_ai_seo.sql` adds the `ai` column, `seo_page_meta.ai_abstract`, `seo_llm_documents` and `seo_ai_hits`.
- `seo_llm_documents` is unique on `(entity_type, entity_id)` **and** on `path`. The first is what makes a rebuild update a product that has moved slug rather than leaving a second row answering at the old address; the second is what stops two entities claiming one address, and a batch carrying such a clash is retried row by row so the loser is reported rather than taking the rebuild down.
- `seo_ai_hits` is a running count keyed on `(day, kind, agent, path)`, not a row per request: the table then grows with how many different pages the crawlers ask for rather than with how often they ask.
- Integration is entirely through existing module hooks: `lib/sitemap.ts` (`getPublicSitemapEntries`), `lib/robots.ts` (`getPublicRobotsDisallow`, plus `getPublicRobotsGroups` and `getPublicRobotsExtraLines` from core 0.5.1565), `lib/head.ts` (`getPublicHead`, new in core 0.5.1418 - see [Authoring a module](Authoring-a-module)), `lib/agent-content.ts` on the `core.agent-content` extension point, a `settingsTabs` manifest entry, manifest `puckBlocks`, and two `cronJobs` entries.
- The Markdown twins are materialised by `lib/ai/materialise.ts` - the weekly `cron/ai` job, the admin button, or a summary being saved - never on the request. Measured on a live catalogue: a hundred products with their variations, attributes and 3D models take about a second and a half, so a twenty-thousand-product shop rendered per fetch would be a bill rather than a feature. A rebuild compares each entity's `updatedAt` against the stored `source_updated_at` and skips what has not moved, stops at a four-minute budget rather than being killed mid-write, and only prunes after a complete pass.
- `lib/ai/html-to-markdown.ts` is a small parser written for the purpose rather than a dependency, and `lib/ai/puck-markdown.ts` walks stored page-builder props generically - it knows no block types, because the palette differs per install - with a ProseMirror renderer for the rich-text fields that store an editor document rather than HTML.
- The MCP endpoint reads the same materialised documents as everything else, so there is no second definition of "what this site says" to drift out of step with the first.
- Per-page structured data is built at request time from **facts** stored in `seo_llm_documents.page_facts` (`004_page_structured_data.sql`), not from finished JSON-LD. Structured data is full of absolute URLs - `@id`, `url`, `image`, every breadcrumb step - and a hostname baked into twenty thousand rows is a hostname that has to be rebuilt out of them; this platform's one live site changed domain in its first year, and the same rows are read on preview deployments under another name again. The row holds names, paths and dates; `lib/ai/json-ld.ts` builds the blocks against whatever host the page is being served on, and is pure.
- The page's own head contributions cost **one** indexed read, made only when the owner has switched one of the two on, wrapped in `cache()` so it happens once per request whichever switch asked for it. The path comes from core's `x-cactus-path` request header (core 0.5.1565); an older core sets no header, and the module then simply publishes nothing extra rather than failing.
- The JSON-LD builders in `lib/structured-data.ts` are pure functions with no database or environment access, so the admin preview and the live page are the same code path rather than two renderings that agree until one is edited.
- One-click fixes write only to core `InfoPage` rows (columns plus the Puck `root.props` mirror in both draft and published data, so a later publish does not revert them). Module-owned content is analysed read-only and deep-linked to its own editor - this module never writes another module's tables.
