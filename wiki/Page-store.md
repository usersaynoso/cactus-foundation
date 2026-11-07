# Page store

Finished public pages held inside the running site, so a crowd can be answered without a render or a database query. Only on a server under `cactus-host`. Off by default: Settings > General > Speed, under "Keep ready-made copies of your pages".

## Why it exists

Public pages render per request: `force-dynamic` on `app/(public)/[slug]` and the homepage, cookies read in the public layout, and blocks calling `connection()`. So the `Cache-Control` from `withPageCache` in `proxy.ts` is advice to whatever is downstream and nothing else. No cache exists at the origin. A CDN keeps a copy per location, so a burst spread across countries misses everywhere, and each miss was a full render with about a hundred queries.

Making the routes static would mean rewriting every module's blocks. The store sits in the proxy instead.

## How a request is answered

`proxy.ts` asks the store at its final pass-through, after the setup, admin, status and members gates, so a held page cannot get round any of them.

| Situation | Answer | `x-cactus-page-store` |
|---|---|---|
| Fresh copy | That copy | `HIT` |
| Out of date, site quiet | Waits for a new render | `MISS` |
| Out of date, site busy | Old copy at once, refreshed behind it | `STALE` |
| No usable copy, render already running | Joins that render | `JOINED` |
| No usable copy | Queues for one of 4 render places | `MISS` |
| Queue full, or waited 60s | 503 with `Retry-After: 15` | `BUSY` |

Signed-in visitors, order-access cookies, client-side navigation (`sec-fetch-dest` other than `document`), access keys in the query and private addresses skip the store completely and render as normal, outside the queue.

Holds up to 256 MB of gzipped pages or 5,000 entries. When full it loses variation addresses and 404s before plain pages.

## Why a held page cannot be personal

The store renders by asking its own server over localhost (`lib/cache/page-store/render.ts`) with no cookies and none of the visitor's headers, identified by a secret made fresh in the process. The page cannot contain anything about a visitor because the render never had any. Anything that sets a cookie is never held or shared. Trade prices are admin-only and never shown to shoppers, so everyone not signed in sees the same prices.

A page is also refused if the database had connection trouble during its render (the layouts swallow failed reads, so the page would look fine and be wrong), if it was cut short, or if part of it failed.

## How long a page can stay out of date

Under five minutes, end to end:

| Step | Most it can add |
|---|---|
| Change noticed by the table watcher | about 20s |
| Old copy handed out, only while the site is busy | 150s |
| CDN copy (60s window, 60s while revalidating) | 120s |

The watcher reads `pg_stat_user_tables` every 10 seconds, so it sees every writer: the editor, imports, stock checkers, raw SQL, scripts outside the app. No module has to call anything. Any change marks every held page out of date, listings included.

Not covered by that: `TRUNCATE`, writes to tables on the ignore list, and changes by the clock alone such as a scheduled post. Those wait for the one-hour freshness limit, plus the CDN window.

## Settings

- **Other addresses to hold.** Top-level pages are held already, except a module's own index. Anything deeper must be listed, one per line, `*` for a section. Private words in an address (`cart`, `checkout`, `account`, `track-order` and others, see `isPrivatePath`) always lose.
- **Data that never shows on a public page.** Tables, one per line, `prefix*` for a family. Core's own bookkeeping tables are ignored already. A missing line costs needless re-renders. A wrong line leaves a page stale for up to an hour.

While the store is on, stored addresses send a 60-second CDN window whatever the owner's window says. Anything else keeps the owner's window.

## After a deploy

Nothing survives a deploy, because a held page names that build's script files. A background loop re-warms plain addresses from the sitemap, one at a time and only while nothing else is rendering, and keeps them refreshed ahead of the freshness limit. Variation addresses are rendered on demand.

## Two things Next does that shaped this

- It strips `Content-Encoding` from a proxy response and gzips the body itself, so the store hands back plain HTML. A gzipped body arrives compressed twice and reads as garbage.
- It deletes flight headers and `_rsc` from the request before the proxy sees it, so a client-side navigation looks like a page load. `sec-fetch-dest` is what tells them apart. A browser too old to send it gets HTML, and the router answers that with a full page load.

## Load test figures

450 distinct catalogue addresses at 25 requests a second, each from a different client address, from a real burst plus the sitemap. Production build on an 8-core Mac against a local copy of the database, `--max-old-space-size=2048`. The server is a different machine, so treat these as relative.

| | Store off | Store on, cold | Store on, warm |
|---|---|---|---|
| p50 | 9.7s | 11.5s | 13ms |
| p95 | 15.3s | 19.5s | 42ms |
| Slowest | 21.6s | 20.3s | 655ms |
| Pages a second | 15.2 | 11.8 | 25 (the arrival rate) |
| Failed connections | 81 of 450 | 0 | 0 |
| Peak memory | 2,445 MB | 1,776 MB | 1,804 MB |
| Sign-in page p95 / slowest during burst | 10.5s / 10.5s | 185ms / 577ms | 106ms / 106ms |
| Checkout p95 / slowest during burst | 6.9s / 6.9s | 190ms / 779ms | 105ms / 105ms |

A render cap of 6 gave the same throughput as 4 with more memory, because rendering is limited by the one thread. A cold start after 4 minutes of warming, mostly-cold pages included, gave p95 748ms. At 100 requests a second, cold, 8 of 450 got a 503 and the sign-in page stayed at p95 398ms.

## Rolling back

Untick the switch in Settings > General > Speed. It takes effect within seconds with no deploy.
