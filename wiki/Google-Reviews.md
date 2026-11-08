# Google Reviews

Brings your Google reviews onto your own site. It finds your business on Google, pulls its reviews in by itself every day, hides anything under the star rating you choose, and shows them wherever you put the **Google Reviews** block.

Module repo: [cactus-foundation-modules/Google-Reviews](https://github.com/cactus-foundation-modules/Google-Reviews). Needs Cactus core 0.5.1946 or newer.

## Setting it up

You need a **Google Cloud API key** with the **Places API (New)** switched on and billing set up on its project. A daily check sits well inside Google's monthly allowance. Restrict the key to the Places API (New) so it is no use for anything else.

1. Install **Google Reviews** from **Modules**.
2. Open **Settings → General → Google Reviews**.
3. Paste the API key and press **Save changes**. The key is encrypted before it is stored and never sent back to the browser.
4. Type your business name and town into **Find your business on Google**, pick it from the results, and save.
5. Press **Fetch reviews now**.
6. Add the **Google Reviews** block to a page.

After the first fetch it checks Google every day by itself. **How often to check Google** on the same tab changes that, and the job also appears under **Settings → General → Schedules**.

## Choosing which reviews show

| Setting | Where | What it does |
|---|---|---|
| Hide reviews under | Settings tab | Site-wide floor. Reviews under this many stars are never shown, whatever a block asks for. |
| Skip reviews with no words | Settings tab | Drops ratings that came without a written review. |
| Hide / Show | Settings tab, review list | Hides one review. It stays hidden through every future fetch. |
| Lowest star rating to show | Block | A block can be stricter than the site setting, never more lenient. |
| Only reviews with words | Block | The same, per block. |

### Five reviews at a time

Google hands over **at most five reviews per request**, chosen by its own idea of relevance, and offers no way to ask for more. Out of the box the site shows exactly the five Google sent last, and lets the rest go - which is what Google's terms expect.

Tick **Keep reviews Google has stopped sending** and every review Google has ever sent is kept, so the collection grows past five over time. Google's terms are not keen on sites storing its content, so this is the site owner's call.

Choosing a different business clears every review from the old one.

## The block

The block's sidebar is split into **Block**, **Appearance** and **Layout** tabs, and only shows the settings that apply to the display you have picked.

### Display styles

| Display as | What it looks like |
|---|---|
| Carousel | Three equal-height cards side by side (two on a tablet, one on a phone, all adjustable) sliding from right to left at the interval you set. Arrows either side or underneath, dots, and a pause button. |
| Spotlight | One review at a time, centred, moving on by itself. |
| Ticker | A steady strip of reviews scrolling right to left without stopping. |
| Grid | Rows of cards. |
| Wall of quotes | Cards of different heights packed into columns. |
| List | One review under another. |
| Rating badge only | A single pill with the overall score, the stars and the number of reviews, linking to your Google page. |

### Block tab

Display style, heading and heading level, introduction, the overall rating under the heading, most reviews to show, lowest star rating, words only, order (newest, highest, lowest, longest), moving on by itself, seconds between moves, slide speed, ticker lap time, pausing under the pointer, arrows, dots, reviewer photos, review date (how long ago, the date, or nothing), "Posted on Google", a link from each review to Google, a link to all your Google reviews, a link to leave a review, and a message for when there are none.

### Appearance tab

Card style (outlined, filled, raised, or no card), shadow, corner radius, border width, review text size and style, cutting long reviews off after a number of lines, heading size, star size, a large quote mark, reviewer photo shape, and fifteen colours: section background, card background, review text, card border, heading and score, introduction, dates and counts, stars, empty stars, quote mark, links, arrow and pause button background and icon, dots and the current dot.

Every colour picks from the site's own palette (**Appearance → Styles → Colours**) or takes any colour you like, and each has its own **dark mode colour**. Leave one blank and it follows the site's theme in both modes.

### Layout tab

Reviews across on a computer, tablet and phone, space between reviews, space inside each card, equal-height cards, review and heading alignment, arrow position, maximum width, and space above and below.

### Moving displays and accessibility

The carousel, spotlight and ticker all have a pause button, pause while the pointer or keyboard focus is on them (unless you switch that off), stop while the browser tab is in the background, and start paused for visitors whose device asks for reduced motion. Reviewer names link to their Google profiles, as Google's terms ask.

Until the module has fetched anything, the block shows labelled sample reviews in the page editor so you can design it first. Visitors never see the samples - with no reviews and no empty message, the block draws nothing.

## For developers

- Tables: `grv_settings` (singleton; `api_key_encrypted` is picked up by core's key rotation) and `grv_reviews` (keyed by Google's review resource name).
- Permission: `googlereviews.manage`.
- Routes, under `/api/m/google-reviews/`: `admin/settings` (GET, PATCH), `admin/refresh` (POST), `admin/search` (POST), `admin/reviews` (PATCH), `cron/refresh` (GET, `CRON_SECRET`, daily at 05:00 UTC by default), `public/reviews` (GET, five-minute shared cache, used by the editor preview only).
- Content Security Policy: adds `https://lh3.googleusercontent.com` and `https://*.googleusercontent.com` to `img-src` for reviewer photos.
- Google calls: Places API (New) place details (`id,displayName,rating,userRatingCount,googleMapsUri,reviews`) and text search. Every response is checked with Zod before anything is stored, and only `https` links are kept.

## Related

- [Modules](Modules) - installing and updating modules
- [Appearance and design](Appearance-and-design) - the site colour palette the block picks from
- [Reviews](Reviews) - the Shop's own product reviews, collected on your site
