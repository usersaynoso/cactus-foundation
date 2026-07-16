# Ultimate SEO

**Ultimate SEO** is the SEO command centre for a Cactus site. It gathers every page the site serves - core pages and the content of any installed modules (Gazette posts, Shop products, Directory entries) - into one place, scores each one against a set of search-friendly rules, suggests fixes, applies the easy ones with one click, crawls the live site the way a search engine would, and puts the sitemap and robots controls in the admin where they belong.

Install it and a new **SEO** section appears in the admin sidebar with four screens, plus an **SEO** tab on **Settings**.

---

## Who can do what

Two permissions, set on your core roles from **Settings → Users → Roles**:

- `seo.view` - see the dashboard, the pages list and audit results, and run the analyser.
- `seo.manage` - apply one-click fixes, run site audits, edit sitemap and robots rules, and change SEO settings.

---

## The Dashboard

The first screen is the state of the nation:

- **Average SEO score** across every analysed page, plus counts of pages missing descriptions, missing social images, missing focus keywords, and duplicate titles.
- **Quick wins** - the lowest-scoring pages, one click away from their analysis.
- **Recent site audits** with error and warning counts.
- A **very loud warning** if the whole site is currently hidden from search engines (or the site status is coming-soon/maintenance, which blocks crawlers just as thoroughly). No point polishing metadata nobody is allowed to read.

## Pages

One table of everything with a URL: core pages always, and - when the modules are installed - Gazette posts, Shop products and Directory entries. Each row shows type, publication status, whether a meta description exists, and the latest score.

Click a row and the detail panel opens:

- A **Google-style result preview** showing how the title and description will actually look in search results, truncation and all.
- A **focus keyword** box - the search phrase the page should win. The analyser scores keyword placement (title, description, slug, body copy) and density against it.
- **Analyse** runs a 20-odd-rule check: title and description length and uniqueness, slug hygiene, one-H1 structure, content depth, image alt text, internal links, readability, publication status.
- For **core pages**, the title and meta description are editable right there, with a *Use suggestion* button that drafts a description from the page's own copy. Saving writes through properly - the page editor and the next publish both see the change.
- For **module content**, editing happens where that content lives - the panel deep-links straight to the right editor in Gazette, Shop or Directory. The analysis still applies either way.

## Site audit

The Pages screen analyses what is stored; the audit checks what is actually served. It fetches your published pages over HTTP - the same view a search engine gets - and reports:

- Broken pages and timeouts
- Missing or overlong titles, missing meta descriptions
- Stray `noindex` directives
- Heading problems, missing image alt text, thin content
- Missing Open Graph tags and canonical links
- Slow responses

Run it on demand from the button, or let it run itself weekly (Mondays, 4am, when it is least likely to be in the way). History is kept per run with per-page issue lists. The page limit per crawl is configurable in settings (default 50).

## Sitemap & robots

- **Blocked paths** - add robots.txt Disallow rules from the admin. They join the ones Cactus already blocks (admin, setup, API paths) and take effect immediately.
- **Extra sitemap entries** - your pages and module content are in the sitemap automatically; anything else you want crawled can be added here with optional priority and change frequency.
- Both screens link straight to the live `/sitemap.xml` and `/robots.txt` so you can see the result.

## Structured data blocks

Two new blocks appear in the page builder:

- **Structured data (SEO)** - invisible on the page, very visible to search engines. Describes an *Organisation*, *Local business* (with address, phone and opening hours), *Website*, or any custom JSON-LD you paste in. Organisation fields pre-fill from your saved SEO settings.
- **FAQ (SEO)** - a real, working FAQ accordion for visitors, with FAQPage markup underneath so the questions are eligible for rich results in search.

## Settings → SEO

- **Search engine visibility** - the master switch (this is the same setting that used to live in general settings; it has moved in with the rest of the SEO controls, and still works from either home).
- **Organisation details** - name, legal name, logo, official profile links and X/Twitter handle, used to pre-fill the structured data block.
- **Analyser targets** - title/description length ranges, keyword density band, and the audit page limit. The defaults follow current good practice.

---

## For developers

- Repo: [cactus-foundation-modules/ultimate-seo](https://github.com/cactus-foundation-modules/ultimate-seo)
- Requires core `0.5.436+`. No environment variables; the weekly audit authenticates with the standard `CRON_SECRET`.
- Tables are prefixed `seo_` (settings singleton, per-page analysis, audit runs and issues, robots rules, sitemap entries) and are torn down on uninstall.
- Integration is entirely through existing module hooks: `lib/sitemap.ts` (`getPublicSitemapEntries`), `lib/robots.ts` (`getPublicRobotsDisallow`), a `settingsTabs` manifest entry, manifest `puckBlocks`, and a `cronJobs` entry. No core changes.
- One-click fixes write only to core `InfoPage` rows (columns plus the Puck `root.props` mirror in both draft and published data, so a later publish does not revert them). Module-owned content is analysed read-only and deep-linked to its own editor - this module never writes another module's tables.
