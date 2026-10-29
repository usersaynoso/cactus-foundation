# Live Chat

The `chat` module puts a small chat bubble on your site and lets you talk to visitors from your admin. There is no chat server to run, no outside company holding your conversations and nothing to set up beyond switching it on. It does what it says on the tin, and very little else, which is rather the point.

Repo: `cactus-foundation-modules/live-chat`

> **Not to be confused with** [Live Chat Powered By Chatwoot](Live-Chat), the older and considerably busier module. The two can be installed side by side while you move over.

## Getting started

1. Install **Live Chat** from **Modules > Browse**.
2. Open your **header** or **footer** layout and drop in the **Live Chat** block. The bubble appears in the bottom corner of every page that uses that layout.
3. Look over **Settings > Live Chat**: the bubble's wording, the greeting, which corner it sits in, whether visitors may email themselves a transcript, and how long chats are kept.

Attachments need your media storage set up (Backblaze on most sites). Without it, chat still works; visitors are simply told files cannot be sent yet.

## What your visitors see

- A bubble in the corner. Clicking it opens the chat, with your greeting at the top and two optional boxes for their name and email. A **Save** button appears once either has something in it; what is saved drops out of the box, and the box goes once both are in. Saved before the first message, the details go with that message.
- They can send pictures, PDFs and office documents, up to 4MB each and three at a time.
- After their first message the chat asks whether they would like a **browser notification** when you reply. Say yes and they are told even after they have closed the tab, in browsers that allow it.
- If you reply while the chat window is shut, your message **pops up above the bubble**, the way a text does on a phone. A number on the bubble says how many they have not read.
- **End chat** closes the conversation and, if they tick the box, emails them a copy with any files linked.

## Cookies, and asking first

Live Chat has its own switch on your cookie banner, called **Live chat**. It is not added for you: open **Settings > GDPR & Legal**, find the cookie banner, and click the **Live chat** suggestion this module offers there (it arrives with its description already written). Settings > Live Chat tells you if it is missing, with a link straight to it.

Once the banner carries it:

- A visitor who has **not answered** the banner yet opens the chat and is asked first, with an **Allow live chat** button that says yes to live chat and nothing else, and a **Cookie settings** button for the full list. Anything they type stays in the box while they decide.
- A visitor who **said no** is told, politely, that live chat is switched off in their cookie settings. Try to send a message anyway and the chat tucks itself away and your cookie settings open on the switches; turn Live chat on and the chat opens again by itself.
- Saying no (or changing their mind later) wipes what the chat kept in their browser and deletes their trail from your visitor list straight away.

Without the switch on your banner (or with the banner off), nobody can be asked, so chatting works as it always has and the visitor list below stays empty, because nobody has agreed to be on it.

## Who is on the site

With **Show who is on the site** ticked in Settings > Live Chat (it is, by default), every visitor who said yes to the Live chat cookies is listed while they browse, whether or not they have said a word. You will find them under **On the site** in **Inbox > Live chat** and as the second tab of the bubble you see on the site while signed in.

For each visitor you see:

- the page they are on right now, how long they have been here, roughly what they are on (phone, tablet or computer) and where they came from;
- the pages they have looked at, newest first;
- **what is in their basket**, if you have the shop, with names and prices looked up from your own products and a total.

Close the site and they drop off the list there and then, rather than lingering like the last guest at a party. A reload, or another tab of your site still open, puts them straight back. Phones do not always say goodbye when a tab is swiped away, so on a phone it can still take up to a minute and a half.

Pick a visitor and type in the box at the bottom to **say hello first**. Once they have left, the box goes and you are told there is nobody to talk to. A chat starts with them there and then, and pops up above their bubble within half a minute. Somebody already chatting is handed to their chat instead, so nobody gets two.

The same details sit at the top of every chat with a listed visitor (click the line under their name to open them), so you can see which chair they are dithering over while you talk.

A visitor's trail is deleted a week after they were last on the site.

## Answering chats

- **Inbox > Live chat** in the admin: open and ended chats down the side, the conversation beside them (one at a time on a phone). Reply, attach files, end a chat, or delete it for good. A search box at the top of the list finds a chat by name, email or what was said, or a visitor by name or page.
- **On the site itself**: while you are signed in, you see your own bubble instead of the visitor's. It lists the chats waiting for you and lets you answer without leaving the page. New messages pop up above it while it is shut.
- **The Unified Inbox**, if you have it: chats appear there the moment they are sent and can be answered from there too.
- Waiting chats light the **bell**, and anyone with desktop alerts switched on gets a notification.

Replies go out under your display name, first name only.

**The cog in the chat header is yours alone.** It sets the name visitors see on your replies, and your own live chat notifications: whether chats waiting for a reply show **on the site** (the bell and the Notifications page) and whether they also pop up as a **browser alert**, and whether a new visitor turning up gives you a browser alert. These are the same switches as Settings > Notifications - change one and the other follows - but anybody who answers chats can reach these, not only people allowed into Settings. A browser alert only reaches the devices where you have switched desktop alerts on.

**Products show as products.** Paste the address of one of your product pages into a chat - you or the visitor - and both sides see the product itself: its photograph, its name, the options for a variation and today's price, the whole thing clicking through to the page. A product sent from the Unified Inbox's catalogue shows the same way, and so does the chat when you read it in the Unified Inbox. A product photographed only on its variations shows the first variation's picture, and a variation with no picture of its own shows its product's. Any other address stays as the words it was. Without a shop on the site nothing changes at all.

### It keeps itself up to date

Nothing in the chat window needs a reload, or closing and opening again, to catch up:

- New messages, chats starting and ending, unread counts, who is on the site and the Online switch all update by themselves within a few seconds, and straight away when you come back to the tab.
- Anything you do (reply, read, end, delete, flip the switch) shows at once in every other place you have the chat open in the same browser, in this tab or another.
- **Typing…** shows both ways: you see when the visitor is typing, and they see "Sam is typing…" while you are. It stops a few seconds after the typing does.
- Under your latest reply it says **Seen** once the visitor has had it on screen, or **Sent** until then.
- A chat that is only your automatic welcome or basket message, with nothing said since, stays in the list while that visitor is on the site and drops out when they leave without answering. It is not deleted: if they come back it reappears, and if they reply (or you do) it becomes an ordinary chat and stays.
- Each chat in the list shows whether the visitor is still on the site (the dot), how many messages are unread, and **Waiting 4 min** when they have written and nobody has answered yet.
- Scrolled up to read something? The chat leaves you there, and a **New message** button takes you back down when something arrives.
- Half-typed replies are kept per chat while you hop between them. Anything you type while a message is still sending is kept too.
- Paste a screenshot or drop a file onto the reply box to attach it.
- The browser tab's title carries the number of chats waiting, so you can see it from the tab strip.
- If the connection drops, the chat says so and carries on as soon as it is back.

## Going offline, and the phone bar

- **Online/Offline switch**: on the Live chat tab of the Inbox, and in the header of the bubble you see on the site while signed in (needs `chat.reply`). Offline is site-wide. Visitors then see your **offline label and message** (set in Settings > Live Chat) instead of the greeting, and can still leave a message. Nothing flips it back for you.
- **Going offline part way through a chat.** If a visitor writes again to a chat one of you had already answered, and you have since gone offline, they get an automatic note saying so (wording in Settings > Live Chat, under the name on automatic messages). If we have no email address or phone number for them it asks for one, and their chat window opens the box to fill them in; if we have one, it says that is where you will reply. Once per offline spell - five messages into the evening earn one note, not five - and again only after one of you has replied since. The note does not count as an answer: the chat stays waiting for a reply. On by default; untick it in Settings > Live Chat.
- **Phone bar**: add the **Live chat: message us** cell to the Mobile Bar block. It opens the chat (or your chat list, when signed in) and carries the unread count. Tick **Hide the floating bubble on phones** in Settings so the bar is the only way in; the bubble stays on larger screens. The Live Chat block must still be in the header or footer, as it is what answers the button.

## Permissions

| Key | Lets somebody |
| --- | --- |
| `chat.view` | read chats, see the admin bubble on the site and see who is on the site |
| `chat.reply` | reply to and end chats, and message a visitor first |
| `chat.manage` | change settings and delete chats |

## Keeping and deleting

Chats with nothing said in them for longer than the number of months you set (12 by default) are deleted overnight, their files with them. Deleting a chat from the inbox removes its files from storage straight away. Visitor trails (pages and basket) go a week after the visitor was last seen, or at once if they say no to the Live chat cookies; the chat itself stays.

## For developers

- Module name `chat`, table prefix `chat_`: `chat_settings` (including `agent_online`, `hide_bubble_on_mobile`, `away_label`, `away_message`, `track_visitors`), `chat_conversations` (including `visitor_id`, `started_by`), `chat_visitors`, `chat_messages` (ids from the sequence `chat_messages_id_seq`), `chat_attachments`.
- **Live on serverless means polling.** The visitor's widget asks for messages after the last id it holds every 3 seconds while open and 12 while shut; admin views every 3-5 seconds; everything slows down when the tab is hidden. The admin side polls through one hook (`components/live.ts` `usePolling`): never two requests at once, an immediate re-poll on `visibilitychange`, window `focus` and `online`, and on a nudge - `nudgeAdmin()` after any action, delivered to the same tab by a window event and to other tabs on the `cactus-chat-admin` BroadcastChannel. The open thread hands each poll's conversation to the list (`patch`), so unread dots clear without waiting for the list's own poll; the poll answer carries the post-read state. A sent message is merged by id and never moves the poll's `after` cursor, so a message that landed just before it is still fetched.
- **Typing and seen.** No extra requests: `GET /api/m/chat/admin/conversations/<id>?typing=1` and `GET /api/m/chat/widget/messages?typing=1` stamp `chat_conversations.agent_typing_at` (+ `agent_typing_name`) / `visitor_typing_at` (migration `009_typing.sql`) when that side typed in the last 4s; the other side's poll reports it while the stamp is under 7s old (`TYPING_WINDOW_MS`). A message clears its sender's stamp; an ended chat takes none; typing never bumps `updated_at`. "Seen" is `unread_for_visitor = 0`, which the widget clears while its window is open and in front. The admin list (`listConversations`) adds `waiting_since` (oldest visitor message after our last reply) and the visitor's `last_seen_at`/`left_at`, and its response carries the Online switch, which every switch on the page shares. `GET /api/m/chat/admin/visitors/<id>` returns the listed shape (chat id, status, name, unread) so an open visitor panel follows a chat starting or ending.
- **Visitor identity** is a secret handed to the browser with its first message, kept in localStorage and sent as the `x-chat-visitor` header. Only its sha256 is stored. No cookies, no accounts. New chats are limited to 5 an hour from one address, messages to 20 a minute per chat.
- **Attachments** are stored with core's `uploadMedia` under `media/chat/<conversation>/` with an unguessable key and no library row (declared through `core.media-private-storage`), and served only by `/api/m/chat/attachments/<id>`: a signed `?sig=` link for visitors and transcripts, or an admin session with `chat.view`.
- **Visitor notifications** use Web Push with the site's own signing pair, through a service worker at `/api/m/chat/widget/sw` scoped to its own folder, so it takes over no page. They need an https `SITE_URL`.
- **Products in messages** (`lib/product-links.ts`, `lib/products.ts`): nothing stored. Each message handed to a browser (`clientMessages` in `lib/serialise.ts`, every widget and admin route) carries `products`: the product behind each of its own addresses, keyed by the address as written. Addresses are bare `http(s)` ones and `[label](url)` links; only this site's (`SITE_URL` host, `www.` ignored), `/shop/products/<slug>` always and `/<slug>` when the shop's `productUrlStyle` is `ROOT`. Looked up by slug in `shp_products` (`status = 'ACTIVE'`; a `catalogue_hidden` row only as a switched-on `svr_variants` child), read only, raw SQL, only when the shop's tables exist, cached 60s per address, at most 20 new addresses per answer. Price follows the shop's own rules restated: sale price when sales are on, a listing with variations from its cheapest switched-on one ("From" only on a real spread), tax added or removed to match `priceDisplayTax`, "+ <invoiceTaxLabel>" only when the storefront prints net and the default zone taxes it. The browser (`splitMessage`) draws a card in place of the address, swallowing the line breaks round it and the inbox's " - <price>" after a `[label](url)` when it matches. The conversation provider's `html` gets the same products as small email-style tables (`messageHtml`).
- **Offline note** (`lib/offline-notice.ts`, migration `011_offline_notice.sql`): `chat_settings.offline_notice_enabled` (default true) and `offline_notice_message`; `chat_conversations.offline_notice_at`. `POST widget/messages` on an existing chat, while `agent_online` is false, claims it with one conditional UPDATE (open chat, and a message with `sender = 'agent' AND author_user_id IS NOT NULL` newer than `offline_notice_at`), inserts an `agent` message under `auto_message_author`, and returns it as `notice` beside `message`. `waiting_since` in `listConversations` now counts only replies with an `author_user_id`, so neither this note nor a welcome or basket message answers a visitor. The widget opens its contact box while offline with no email or phone saved. Live test `lib/offline-notice.live.test.ts` (in `test:ledger-guards`).
- **Notifications from the cog** (`app/api/admin/notifications/route.ts`, `chat.view`): GET/PUT the caller's own `User.notificationPrefs` for this module's kinds only (`chat:waiting`, `chat:visitor-arrived`), through core's `getNotificationKinds` and `resolvePrefs` - the same store as Settings > Notifications, whose route needs `config.manage`. Other kinds on the row are left untouched.
- **Unified Inbox** support comes through `core.conversation-provider` (id `chat`) and `core.conversation-arrived`, announced after every message. The Unified Inbox's listener needs `SITE_URL` and `CRON_SECRET`.
- **Consent.** Manifest `cookieCategories` declares `live-chat` in the long form (the same key the Chatwoot module declares, so answers carry over). `lib/consent.ts` reads core's `siteConfig.consentBannerConfig`: gate `category` when the banner is enabled and carries `live-chat`, else `none`. Server side, `POST widget/messages` refuses with 403 `{ needsConsent: 'live-chat' }` under `category` without a yes in the `cactus-consent` cookie, and `POST widget/presence` refuses unless gate is `category` AND the yes is there. Client side, `lib/consent-client.ts` saves a yes through core's `saveConsentDecision` (action `custom`; every other optional category keeps the visitor's stored answer, or `false` if they never answered) and opens the banner with `window.cactusConsent.open()`. The widget listens on `cactus:consent-change`; a stored no clears `localStorage['cactus-chat']` and DELETEs the presence row.
- **Visitors.** `chat_visitors` (migration `003_visitors.sql`): claimed like a chat, `<id>.<secret>` in localStorage, sent as `x-chat-presence`, only the sha256 stored. The widget checks in (`POST /api/m/chat/widget/presence`) on arrival, on each `usePathname()` change, on the shop's `cactus-shop-cart-changed` event and every 30s while the tab is in front; "online" means a check-in in the last 90s and `left_at IS NULL`. On `pagehide` the widget sends a keepalive `POST /api/m/chat/widget/leave` (claim header, 204 always) which stamps `chat_visitors.left_at` (migration `004_visitor_left.sql`), and posts on the `cactus-chat-presence` BroadcastChannel; any other open tab checks in 1.5s later, and every check-in clears `left_at`. A `pageshow` from the back-forward cache checks in again. Mobile browsers that kill a swiped-away tab without `pagehide` fall back to the 90s window. Trail is the newest 30 pages. The basket is read from the shop's own `localStorage['cactus_shop_cart']` (ids and quantities only, sent only when changed) and named and priced server side from `shp_products` by id, read only and only when that table exists; the chat does not require the shop. 30 new visitor rows an hour per address. Rows are pruned 7 days after `last_seen_at` by the nightly cron and opportunistically whenever a new visitor arrives.
- **Saying hello first.** `POST /api/m/chat/admin/visitors/<id>/chat` (`chat.reply`) replies into the visitor's open chat if they have one, refuses with 409 when the visitor is not online (left, or no check-in for 90s), else creates a `chat_conversations` row with `started_by = 'agent'`, `visitor_id` set and `visitor_token_hash` = the visitor row's own token hash. The presence reply names that chat id (never a secret) and the browser claims it as `<chat id>.<its presence secret>`. `chat_conversations.visitor_id` is `ON DELETE SET NULL`, so pruning a trail never takes a chat with it. Admin reads: `GET admin/visitors` (online list, plus `reason`: `off` | `no-category`), `GET admin/visitors/<id>`, and `GET admin/conversations/<id>` now carries `visitor`.
- Needs `ENCRYPTION_KEY`; `CRON_SECRET` runs the nightly retention sweep (`/api/m/chat/cron/retention`), which now prunes visitor trails first.

---

**Wiki:** [Home](Home) · [Modules](Modules) · [Unified Inbox](Unified-Inbox) · [Live Chat Powered By Chatwoot](Live-Chat)
