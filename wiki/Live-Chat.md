# Live Chat (Powered By Chatwoot)

The `live-chat` module gives a Cactus site real live chat: visitors talk to staff from a bubble on the site, attachments travel both ways, and staff answer from whichever surface suits - the Cactus admin, a floating console while browsing the public site, or the Chatwoot mobile app (with push notifications).

> **Where it lives now.** Live chat used to have its own sidebar link. Conversations now sit on the shared **Inbox** screen, on a **Live chat** tab beside your contact-form enquiries. Old links still work - they just carry you to the tab.

Repo: `cactus-foundation-modules/live-chat-powered-by-chatwoot`

## How it fits together

- **The site (Vercel)** carries only the thin module: the widget block, the admin inbox, and API routes.
- **The chat engine is a self-hosted [Chatwoot](https://www.chatwoot.com/) server** on a single Fly.io machine (Rails + Sidekiq + Redis + a small backup endpoint in one VM, auto-suspends when idle and wakes in seconds). Visitors' browsers talk to it directly.
- **Chatwoot's database is a separate, ordinary Postgres database** - never the site's own. The module mirrors conversations/messages into its `lc_` tables (fed by Chatwoot webhooks) so the admin inbox lists and polls locally.
- Realtime in the admin is the **browser's own WebSocket** to the chat server's ActionCable, using a limited pubsub token (the full agent token never reaches the browser). A 15-second poll of the mirror is the fallback.

## The two places (read this first)

Everything **day-to-day happens in the Cactus admin**: answering chats, canned replies, settings, backups, the notification bell. Underneath sits a small separate **chat engine** (the Chatwoot server, e.g. `chat.your-site.co.uk`) that the widget, the admin inbox, and the phone app all talk to. You rarely open the engine's own website - its two real jobs are:

- being what the **Chatwoot mobile app** signs into (server address + the chat login), which is where push notifications come from;
- handing a staff member their personal **Access Token** if they want replies under their own name.

The **chat login** is created by the setup wizard for whoever runs it, and stays visible under Settings → Live Chat → *Chat server login* (password revealed only to admins with the manage permission). Two identities exist on the engine: the everyday **owner login** (use this one), and a **super-admin** maintenance login that is deliberately not a member of any chat account - signing into the normal dashboard with it shows "No account found", which is correct; its console lives at `/super_admin` and is for emergencies only.

## Setting it up (self-serve installs)

1. Install the module, open **Settings → Live Chat**.
2. Paste a **Fly.io API token** and the connection URL of an **empty Postgres database**, pick an app name, and press *Build my chat server*. The module provisions the whole thing - app, volume, database schema, machine, IPs, inbox, webhook - in a couple of minutes.
3. Add the **Live Chat** block to a sitewide layout (usually the footer/header layout row).
4. Each staff member pastes their personal Chatwoot access token under *My agent identity* so replies carry their own name, and installs the Chatwoot mobile app pointed at the chat server for push.

Installs managed centrally can instead be pre-provisioned with `LIVECHAT_*` environment variables (see Configuration reference); env always wins over the settings UI.

## Privacy behaviour (deliberate)

- **Chat itself is consent-gated, and says so.** Where the site's consent banner carries a **`live-chat` cookie category**, nothing chat-related runs until that category is granted - no script, no cookie, no contact record. The bubble still shows, but clicking it opens a short notice instead of a conversation: *Live chat needs a cookie*, worded one way for someone who has not answered the banner yet and another for someone who answered and left live chat off, with a button underneath that reopens the cookie preferences on their existing choices. Tick live chat, save, and the chat they asked for opens on its own - no second click, no reload. Withdraw the permission mid-visit and an open panel closes, the widget is dropped, and this visit's buffered journey is forgotten.
  - Earlier versions hid the bubble entirely in this state. A missing bubble reads as "this site has no live chat", not "live chat is waiting on you", and left a visitor who had declined with no way back short of hunting for a cookie settings link.
  - Needs core **v0.5.1098 or newer**: on older core the reopened banner shows the site defaults rather than the visitor's own choices, so saving from it would quietly reset their other categories.
  - The category is added on **admin → Config → GDPR & Legal**, from the *Suggested by active modules* row (key `live-chat`). Adding it re-prompts existing visitors once. Without it, the banner has nothing for visitors to decide, so the bubble behaves as it always did and shows to everyone.
  - Staff with `livechat.view` get the agent console instead, which is a signed-in staff tool and is not gated this way.
- **Nothing loads until the visitor clicks the bubble.** No script, no cookies, no contact record. Once clicked, the conversation opens directly - no "Start conversation" interstitial - it follows the visitor across pages while open, and the chat window follows the site's light/dark mode.
- The **page journey** (this visit only, with rough dwell times) buffers in `sessionStorage` and leaves the browser only when a chat is opened - and only at all under the same permission as the bubble.
- Logged-in members are identified with a **server-computed HMAC**, so nobody can impersonate someone else's email by fiddling with the page.
- **Retention**: a nightly job deletes resolved conversations older than the configured months (default 12) on the Chatwoot server and in the mirror. Keep the number in step with the site's privacy policy.
- When core **Turnstile** is configured, opening chat runs a managed (invisible for most people) challenge first.

## Answering

- **Admin → Live Chat**: two-pane inbox. Open/Resolved tabs, unread badges, customer-typing indicator (receive-only - customers never see staff typing), attachments, `/` inserts canned replies, resolve/reopen. Canned replies live on the chat server, so the mobile app shares them.
- **On the public site**: staff with the `livechat.view` permission see a floating agent console instead of the customer widget - answer without leaving the page. It's styled to match the customer widget (brand header with the Online/Offline switch, avatars, chat bubbles), follows the site's dark mode, and while closed it still announces new messages instantly - the button pulses red with an unread count.
- **Mobile**: the official Chatwoot app against your chat server. Push notifications come from there.

## Email from the chat server

The chat server sends its own emails (missed-message alerts to agents, transcripts, password resets), and being a separate machine it cannot read the site's email settings directly. Fill in the **SMTP section under Settings → Email** (for Brevo that is the SMTP key from *SMTP & API → SMTP*, not the ordinary API key), deploy so the values reach the site, then press **Sync email to chat server** on Settings → Live Chat - the module copies them across and restarts the chat server with email switched on. Until then chat works fully; it just sends no email, and the mobile app's push covers the alerting.

## Backups and updates

- The chat database is **outside** Cactus backups, so the module gives it its own: a nightly dump (the cron call wakes a suspended machine), shipped to S3-compatible storage with unguessable filenames, newest 30 kept - all surfaced on **Settings → Backup** next to the site backup, with a *Back up now* button and downloads via short-lived signed URLs.
- **Updates**: the image repo watches upstream Chatwoot releases - security patches rebuild and apply automatically overnight; minor/major versions wait for the **Update Chatwoot** button (which takes a fresh dump first, then swaps the machine image; Chatwoot migrates itself on boot).
- The settings tab shows machine state, health, running version and last backup, and emails nothing - if the machine is unreachable the card says so in plain sight.

## Contact-form integration

With the contact-form module installed, each submission's detail page gains a *Live chats with this person* panel (matched by email), the inbox toolbar gains a *Live Chats* button, and inside Chatwoot a Dashboard App panel shows the person's form history while you chat. Email is the join key throughout.

## Permissions

| Key | Grants |
| --- | --- |
| `livechat.view` | See the inbox, transcripts, and the frontend agent console |
| `livechat.reply` | Send replies, resolve/reopen, save a personal agent token |
| `livechat.manage` | Settings, canned reply management, machine wake/update, backups, provisioning |
