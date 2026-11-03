# Analytics

Shows you **who visits your site and where they came from** - Google, an advert, your newsletter, Facebook, another website, or straight in - and, if you run the [Shop](Shop), **which visits ended in an order and who placed it**.

It is counted on your own site. Nothing is sent to Google or anyone else, and no IP addresses are stored. (If you also want Google Analytics or Google Ads, that is the separate [Google Tag](Google-Tag) module; the two get on fine.)

---

## Switching it on

1. Install the module. A small invisible **Analytics** block is added to your header layout for you.
2. Check **Settings > General > Analytics** - it tells you in plain words whether your cookie banner is set up to ask first.
3. Make sure your cookie banner has an **Analytics** category (Settings > General > GDPR & Legal offers it as a one-click suggestion). Until a visitor agrees to it, they are not counted.

Visits you make while signed in to the admin are left out, so you do not become your own best customer.

---

## Reading the numbers (sidebar > Analytics)

Pick a period at the top - the last 24 hours, 7, 14, 30, 90 or 180 days, the last 12 months, or any two dates you like. Every figure is compared with the same stretch of time just before it, so you can see at a glance whether things are up or down.

| Tab | What it shows |
|---|---|
| **Overview** | Visitors, visits, page views, bounce rate, average visit length, orders, order value and conversion, each against the period before. Click a figure to chart it day by day. Then the top sources, the channels, landing pages, devices and countries - and, when there have been any, a note of what AI assistants such as ChatGPT sent you. |
| **Where from** | Every source by name - *Google search*, *Google Ads*, *ChatGPT*, *Facebook*, *Mailchimp email*, *some-blog.co.uk* - with visits, visitors, bounce rate, pages per visit, time on site, orders, conversion, order value and how many customers first found you that way. A chart shows each one day by day. Group it instead by channel, referring website, campaign, landing page, or the raw tags. Click any row to look inside it (a channel shows its sources, a source shows the pages it sent people to). Sort by any column, search, and download a CSV. |
| **Campaigns** | Every tagged campaign, keyword (`utm_term`) and ad or link (`utm_content`), with the same figures. |
| **Pages** | Where visits start, with how well each page held on to people and what it sold; and the most viewed pages with how often each was the last one somebody saw. |
| **Audience** | Devices and countries, with the same figures. |
| **Orders** | Each order, who placed it, what they spent, where it came from by name, how they first found you, how many visits it took and how many days. Click an order number to open it. CSV download. |
| **Visits & links** | The latest visits: where each came from, the full landing address with every `utm_` tag, ad click id and referring page. CSV download. |
| **Link builder** | Type a page and a source, medium and campaign; get a tagged link to paste into an advert, email or post. |

Clicking a row anywhere narrows every tab to it - the filter shows above the report, and the cross takes it off again. The address in your browser keeps the whole view, so a report can be bookmarked or sent to a colleague.

A **visit** ends after 30 quiet minutes, or when the same person arrives from a different tagged link.

### Who gets the credit for an order

Each order is credited to the customer's **latest visit that was not simply typing the address in**. Somebody who clicked an advert on Monday and came back direct on Friday to pay counts as an advert customer. The Orders tab also shows how they **first found you**, and the Where from tab has a *First found us* column.

The Orders tab says how many of the shop's orders it could not link to a visit. Those are customers who did not accept the Analytics cookie, blocked it, or ordered some other way.

### On the order itself

Every order the Shop takes shows where it came from in two places:

- **The orders list** - a line under the order number and date, such as *via ChatGPT* or *via Google Ads - Spring sale*. Orders nobody could trace (the customer said no to the cookie, or ordered by phone) simply have no line.
- **The order page** - a **Where this order came from** card: the source by name, the channel, the campaign, keyword and ad where there were any, the page they arrived from and the page they landed on, every link tag, how they first found you, and how many visits and days it took. Open **Every visit before the order** to see each visit in turn, with the one that gets the credit marked.

Both need the **View analytics** permission.

### How a visit is filed

1. **Your own tags** (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, and any other `utm_` tag, which is kept) always win.
2. **Ad click ids** (Google `gclid`, Microsoft `msclkid`, Facebook `fbclid`, TikTok, LinkedIn and others) are used when there are no tags.
3. **The referring website** is used otherwise: an AI assistant (ChatGPT, Perplexity, Claude, Gemini, Copilot and the rest) is **AI Assistants**, a search engine is Organic Search, a social network is Organic Social, anything else is Referral.
4. No referrer is **Direct**.

ChatGPT tags the links it hands out with `utm_source=chatgpt.com`; that is filed as ChatGPT under AI Assistants too, not as "Other". Visits and orders recorded before Analytics learned this were re-filed automatically when it was updated.

Coming back from a payment page (PayPal, Stripe, your bank) is the same visit carrying on, not a new source.

---

## Settings (Settings > General > Analytics)

- **Count visitors** - the master switch.
- **Leave out browsers that ask not to be tracked** - honours Do Not Track and Global Privacy Control.
- **Leave out anyone signed in to the admin.**
- **Keep page-by-page history for** - 30 to 3650 days (default 730). Visits and orders are kept; only the list of individual pages is cleared, along with visits that never led to an order. Runs nightly (needs `CRON_SECRET`, like the other modules' jobs).
- **Other addresses that are this site** - extra hostnames so a visit from your other domain is not called a referral.

---

## Under the hood

- Tables: `ana_settings`, `ana_visitors`, `ana_sessions`, `ana_pageviews`, `ana_orders`.
- Cookies (first-party, HTTP-only): `ana_v` identifies the browser for about 13 months, `ana_s` the current visit for 30 minutes. Both are removed when a visitor withdraws consent.
- The browser reports to `POST /api/m/analytics/collect`. Orders arrive through core's conversion seam; the module reads the total and customer from the shop's own order, ignores anything not placed in the last 48 hours, and records each order once.
- Reports: `GET /api/m/analytics/admin/report?view=overview|breakdown|trend|pages|orders|visits` with `days=` or `from=`/`to=`, `dimension=`, and `f_<key>=` filters (permission `analytics.view`). Settings need `analytics.manage`.
- The order card uses the Shop's `shop.order-detail-panels` point and the orders-list line its `shop.order-row-notes` point; neither module imports the other.

**Wiki:** [Home](Home) · [Modules](Modules) · [Google Tag](Google-Tag) · [Shop](Shop)
