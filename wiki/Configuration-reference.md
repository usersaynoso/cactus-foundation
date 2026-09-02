# Configuration reference

The configuration page lives at `/<your-admin-path>/config`. All settings are saved to the database. Secrets (API keys, passwords) are stored in environment variables and never in the database.

---

## General tab

### Updates

At the top of the General tab, Cactus checks whether a newer version is available. The check runs against the upstream Cactus Foundation repository and is cached for 10 minutes.

The panel shows "Checking for updates..." while a check is in flight, and only auto-checks once per visit - reloading the page or navigating back within 10 seconds reuses the last known result instead of checking again. A **Refresh** button forces an immediate re-check at any time, bypassing both the 10-second client-side window and the server's 10-minute cache.

**Update channel** - choose which releases to consider:

- **Public** (default) - stable releases only.
- **Beta** - stable and pre-releases. Useful for trying upcoming features before they reach the stable channel.

The preference is saved immediately and the update check refreshes straight away.

**Update states:**

- **Up to date** - shows the current version number.
- **Update available** - shows the version jump (e.g. v0.5.97 → v0.5.100), the combined release notes for every version since yours, and an **Update now** button.
- **Not configured** - shown when GitHub is not set up; links to Settings → Integrations.

**What the Update button does:** Cactus fetches the files that changed between your version and the latest release, copies them into your GitHub repository, and triggers a redeploy. Your content, pages, media, and user accounts are never touched. Only core Cactus files are updated.

### General site settings

| Field | Description | Default |
|-------|-------------|---------|
| Site name | Shown in the admin sidebar, browser title, and any emails your site sends | `My Cactus Site` |
| Tagline | A short description, shown on the public homepage | — |
| Description | A longer description used in page metadata | — |
| Homepage | The page shown at the root of your site (`/`) | — |
| Main menu | The default navigation menu shown in the site header | — |
| Timezone | All timestamps in the admin are shown in this time zone | `UTC` |
| Locale | Sets the language attribute and date formatting. Does not translate the admin interface. | `en-GB` |
| Date format | How dates are displayed (e.g. `DD/MM/YYYY`) | `DD/MM/YYYY` |
| Time format | How times are displayed (e.g. `HH:mm`) | `HH:mm` |
| Admin path | The secret URL prefix for the admin area. Changing it takes effect automatically. | Set during setup |
| Trust this browser (days) | How long a "trust this browser" cookie lasts before asking for a one-time sign-in code again | `28` |
| Measure how fast pages feel for real visitors | Adds Vercel's Speed Insights to your pages: it times how quickly they load for the people actually using them and reports it to your Vercel dashboard. No cookies, nobody identified. Untick it and the script is never sent at all, rather than sent and told to keep quiet - useful if your Vercel plan charges for the measurements. | On |

**Site URL** is shown read-only. It comes from your hosting environment and cannot be changed here. Changing it requires updating your hosting settings and redeploying - and re-registering all passkeys, since they're tied to your domain.

### Danger zone - Reset Everything

At the bottom of the General tab is a **Reset Everything** button. Confirming will permanently remove all the optional credentials you've entered through the admin (email, media, integration keys). Your core settings (`DATABASE_URL`, `SESSION_SECRET`, `SITE_URL`, and your Vercel connection) are not affected. The site redeploys automatically after the reset.

### Speed settings

A tab of its own, because these three belong together: they are the ones that decide how quickly a page reaches a visitor.

| Field | Description | Default |
|-------|-------------|---------|
| Keep ready-made copies of your pages | Normally every visitor waits while their page is built from scratch, even if a hundred people asked for the same one a minute earlier. Turn this on and a copy is kept for a short while and handed straight out instead - quicker for them, cheaper for you. Anyone signed in always gets a freshly built page. See **Speeding up your site** below. | Off |
| How long to keep a copy | Only shown when the above is ticked. How long an old copy may be handed out before a fresh one is built: 1 minute, 5 minutes, 15 minutes or 1 hour. | `5 minutes` |
| My site's traffic goes through Cloudflare | Tick only if visitors genuinely reach your site through Cloudflare - in Cloudflare's DNS settings your site's record shows an **orange** cloud, not a grey one. It tells Cactus where to find a visitor's real location, which is what stops one person getting their password wrong from locking out everyone else nearby. Ticking it when it isn't true is worse than leaving it alone. | Off |

---

## Speeding up your site

### What is already fast

Two things people usually ask for are already on, and there is no switch for either because neither needs one.

**Compression.** Every page, stylesheet and script your site sends is already compressed before it leaves - with Brotli, which is a little better than gzip. Your host does it automatically. There is nothing to turn on and nothing to configure.

**Long-lived files.** Stylesheets, scripts and fonts are already marked so a browser keeps them for a year and never asks for them twice.

### What was slow, and the switch that fixes it

Out of the box, every visit builds its page from scratch. A hundred people asking for the same page in the same minute means a hundred rebuilds and a hundred trips to the database, and each of those visitors waits for their own.

**Settings → Speed → Keep ready-made copies of your pages** changes that. A finished page is kept for a short while and handed straight out to whoever asks next. It is usually the single biggest difference you can make to how quickly your site feels, and because a stored copy costs no work, it generally lowers your hosting bill rather than raising it.

**Who never gets a stored copy:**

- You, or anyone else signed in to the admin.
- Any signed-in member.
- Anything that isn't a straightforward page view - forms, checkouts, sign-ins.

So nobody is ever handed a page meant for somebody else.

**How long?** Editing a page clears its copy right away. The window you choose only governs how long something you changed *elsewhere* - a price, a menu, a product - might take to appear. Five minutes suits most sites. Pick an hour if your pages barely change and you want every last scrap of speed.

**Turning it off** clears every stored copy immediately, so the site goes back to how it was straight away.

### Getting it for free with Cloudflare

The switch works with whatever sits in front of your site. If you would rather not pay your host for the traffic, Cloudflare will do the same job on its free plan, and if you already use Cloudflare for your domain's DNS you are most of the way there.

1. In the Cloudflare dashboard, open your domain's **DNS** settings. Your site's main record probably shows a **grey** cloud, which means Cloudflare is only answering DNS questions and traffic goes straight past it. Click it so it turns **orange**.
2. Under **SSL/TLS**, set the encryption mode to **Full (strict)**. Anything else and visitors get an endless redirect loop.
3. Under **Caching → Cache Rules**, add a rule that applies to your whole site and sets it as **eligible for cache**. Cloudflare's free plan does not store pages by default, only images and scripts, so without this rule nothing changes.
4. Back in Cactus, tick **My site's traffic goes through Cloudflare** in Settings → Speed. This one matters for safety rather than speed: without it, everyone arriving through the same Cloudflare location looks like a single visitor, and one person mistyping their password could lock the rest of them out of signing in.

**Optional, but worth it.** Fill in `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_PURGE_API_TOKEN` in the **Clearing copies the moment you edit** card at the bottom of Settings → Speed, and editing a page clears Cloudflare's copy the instant you save, instead of waiting out the window. Like every credential entered through the admin, they take effect on the next deployment. Everything works without them; you just wait a bit longer to see your own changes.

Once both are set (and live - after that next deployment) a **Purge everything now** button appears underneath, for anything that does not go through a page save: a new theme, a bulk price change. It calls Cloudflare directly and tells you straight away whether it worked, rather than waiting quietly for pages to age out.

---

## Branding

Branding - your logo, favicon, app icons, and app identity - has **moved to Appearance → Styles**, where it is now the first tab. It still needs a media provider configured in the **Media** tab (below) before you can upload, and it still replaces the Cactus defaults across the whole site. See [Appearance and design](Appearance-and-design) for the full walk-through.

---

## Email tab

Two sub-tabs: **Delivery** (who your email comes from and how it gets out) and **Templates** (what every email actually says, and what it looks like).

### Delivery

| Field | Description |
|-------|-------------|
| From name | The display name on outgoing emails (e.g. "My Site") |
| From address | The email address outgoing messages come from |

The email provider is set by whichever credentials you've entered in your environment variables - Brevo takes priority if both Brevo and SMTP are configured.

Saving email credentials triggers a short redeploy. A progress screen appears while the rebuild runs, then returns you to the admin when done.

If the rebuild takes longer than expected, a **Dismiss and continue** button appears after two minutes. Clicking it returns you to the admin while the rebuild continues in the background.

A **Send a test email** button sends a one-off email using the current From name/address and provider credentials, to a chosen address (or your own admin address if left blank). Use it to confirm outgoing mail actually reaches an inbox - a saved config with no errors doesn't guarantee your provider accepts the From address; some providers reject unverified sender addresses at send time.

When you type new credentials into the Brevo or SMTP card, a second **Send a test email** button appears next to **Save credentials**. It tests the values you've just typed (before saving, so no redeploy) by sending a test email to your own admin address. Any field you leave blank falls back to the value already saved in your environment, so you can test a changed password against an unchanged host. If the test fails, the provider's error appears in the card. Test sends are recorded in the site's outgoing email log alongside every other email, so a test you sent last week is still there to look at when you are working out what changed.

### Templates

Every email your site sends, in one list: the member ones (welcome, verification, magic sign-in link, digests, security alerts), the account and security ones (login code, password changed, account recovery), and one group per module you have installed - Shop's order emails, Boards digests, contact form notifications, and so on. Only modules you actually have installed appear.

Pick an email on the left and you get:

- **Subject** and **Message**. The message is just the words - the header, footer and colours come from the wrapper design, so you are not editing the same logo eleven times. Every message starts life with its own subject repeated as a heading, so the email opens with a title rather than diving straight into a sentence. It is ordinary wording in the box like everything else: reword it, move it down the page, or delete the line if you would rather it were not there.
- **The wording you can drop in**, listed as chips. `{{siteName}}`, `{{orderNumber}}`, and so on. Anything marked with a `*` has to stay in: a sign-in email with the code taken out is no use to whoever receives it, so saving one is refused rather than allowed and regretted.
- **Wrapper design** - the design wrapped around this particular email. Leave it on **Site default** unless one email wants a look of its own.
- **Send this email** - a tick you can clear to stop one going out entirely. Emails people need in order to get into their account do not have this tick; they always send.
- **Preview** shows the finished email, wrapper and all. Anything that only exists at the moment of sending - an order number, a sign-in code, a link - appears as an obvious stand-in so nobody mistakes a preview for the real thing. Things the site already knows about itself, `{{siteName}}` chief among them, show their real values, because seeing your own site's name replaced by a placeholder is a fine way to conclude the tag is broken and type the name in by hand.
- **Send test to myself** posts it to your own address and nobody else's, subject marked `[Test]`.
- **Put the original wording back** appears once you have edited something. It restores the wording only - your wrapper choice and on/off tick stay as you set them.

### Email wrapper designs

The design around your emails is a layout like any other. **Layouts → Email Wrapper** lists them, and the page builder edits them, with a block set made for email: Message (where the words land), Logo, Heading, Text, Button, Image, Two columns, Social links, Small print, Divider and Space. Site blocks are deliberately not offered - they lean on styling that email programs throw away, so they would look right in the builder and wrong in the inbox.

A fresh site starts with three to choose from - **Default Email** (logo, message, quiet footer), **Plain Email** and **Branded Email** - plus a blank one. Whichever published wrapper sits highest in the priority order is the site default, and every email uses it unless told otherwise.

Colour boxes take either a colour name from your Styles page (`primary`, `text`) or a plain hex code. The first is the better habit: change your site's colours and your emails follow.

**Background patterns work here too**, with the caveats email always brings. The wrapper's own settings (click the page background, not a block) take a **Background pattern**, a **Pattern size** in pixels, a **Background pattern in dark mode** and a **Pattern size in dark mode** - the same tile often wants to be bigger to read against a dark background, and either dark setting on its own is enough to make the difference. The pattern tiles behind the message card, in the email itself rather than only in the builder. Three things worth knowing before you reach for one:

- The picture has to come from your media library, so it has an address the recipient's email program can actually fetch. A pattern is a background, and many email programs block images until the reader clicks "show images" - so treat it as decoration, never as something the message needs to make sense.
- **Pattern size is a request, not a promise.** Outlook on Windows tiles the picture at its own natural size and ignores the setting entirely. Pick a picture that already tiles at roughly the size you want and the setting becomes a nicety rather than a necessity.
- **The dark mode pattern only reaches some programs** - Apple Mail, Mail on iPhone and iPad, and Outlook for Mac. Gmail does its own thing with dark mode and shows the light pattern regardless. Setting one also tells those programs that you have handled dark mode yourself, so they stop applying their own automatic darkening to the rest of the email. That is usually what you want if you have gone to the trouble, but it is a change to the whole email, not just the pattern - leave the dark box empty and nothing about your emails changes.

There is no Conditions tab on an email wrapper. Which email uses which design is set per email on the Templates tab, not by a page rule. A couple of emails are not on that tab at all - the contact form's reply and its auto-reply are free text you write on the day rather than a template - and those always use the site default, which is one more reason to keep the top of the priority order pointed at the design you actually want.

---

## Media tab

Choose your media storage provider from the dropdown. Options are grouped by type:

- **Object storage** (Backblaze B2, Cloudflare R2, AWS S3, DigitalOcean Spaces, Wasabi, MinIO, Vercel Blob, Supabase Storage) - images are stored in a private bucket and delivered to visitors via a Cloudflare Worker.
- **Image CDN** (Cloudinary, ImageKit) - images are uploaded to and served directly from the provider's own delivery network. No Cloudflare Worker needed.

Choosing a provider shows a checklist of the credentials it needs. Enter them and save. A redeploy runs automatically to apply the new settings.

**Changing provider:** Switching to a new provider immediately sends new uploads there. Existing images stay on the old provider until you migrate them. Click **Migrate now** to move them across in batches. The per-provider breakdown on the tab shows how many images are on each provider before you commit.

For providers that use the Cloudflare Worker, you also need to configure the Worker separately. See [Self-hosting and operations](Self-hosting-and-operations) for the exact steps.

---

## Site Status tab

| Field | Description |
|-------|-------------|
| Status | `live`, `coming soon`, or `maintenance`. Non-live statuses block all public pages for visitors who aren't signed in as admin. |
| Coming soon page | The page shown to visitors when status is `coming soon`. Falls back to a built-in template. |
| Maintenance page | The page shown to visitors when status is `maintenance`. Falls back to a built-in template. |
| Hide from search engines | Adds a "don't index this" instruction to all pages and blocks search engine crawlers. Automatically on whenever status is not `live`. |

A **Preview as visitor** link opens the status page exactly as a real visitor would see it.

---

## GDPR & Legal tab

### Legal pages and data retention

| Field | Description | Default |
|-------|-------------|---------|
| Privacy policy page | The page linked in your public footer. Also shown at registration once set. | — |
| Terms of service page | The page linked in your public footer. Also shown at registration once set. | — |
| Purge expired sessions after (days) | Old sign-in sessions older than this are deleted automatically | `30` |
| Purge unused recovery requests after (days) | Unused password-recovery tokens older than this are deleted | `7` |

The **Third-party data processors** list is generated automatically from the email, media, and hosting providers you've actually configured, so it stays accurate without manual maintenance.

**The outgoing email log.** Your site keeps a record of every email it sends: who it went to, the subject, whether it went, and what went wrong if it did not. It keeps **no copy of the message itself**, deliberately, so the record stays small enough that nobody ever has to clear it out to keep the site working. It exists because your site's email is sent by Brevo or by your own mail server and never passes through your own Sent folder, so without it there was nowhere on the site to answer "did that order confirmation actually go?".

Rows are kept for **twelve months** and then swept nightly. There is no box to change that number yet, and no screen listing the log on its own: today it is read by things that show one person's history, such as [Unified Inbox](Unified-Inbox), where it is what puts automated emails on a customer's timeline.

### Privacy policy generator

The **Generate a privacy policy** button opens a six-step wizard that produces a draft privacy policy page in the page builder.

The wizard asks about:

1. **Your site** - name, URL, contact email, business address
2. **Data you collect** - tick the relevant categories. The data Cactus always collects (email addresses, IP addresses, device and browser info for sign-in) is pre-ticked and cannot be removed.
3. **Why you collect it** - purposes such as providing the service, analytics, or legal compliance. The purposes Cactus always has (running the service, managing accounts, security) are pre-ticked.
4. **Third-party services** - pre-filled from your cookie consent categories; you can add others with a name and description.
5. **Jurisdiction** - EU/UK (GDPR), US (CCPA/CPRA), both, or unsure.
6. **Extras** - a cookies clause, minimum age (for children's privacy), and optional data protection officer details.

The wizard pre-fills your site name and contact email from your General and Email settings.

**Output:** A single draft page with the full policy. The page is always saved as a draft - review it and publish it manually when ready.

**Important:** The generated policy is a starting point only and is not legal advice. A notice to this effect appears throughout the wizard and at the top of the generated document. Have a qualified legal professional review it before publishing.

Running the wizard again always creates a new draft - it never overwrites the existing page. If a privacy policy is already linked, the wizard asks whether to update the link to the new draft or keep the existing one.

### Cookie consent banner

| Field | Description | Default |
|-------|-------------|---------|
| Enable cookie consent banner | Master toggle. When off, no banner appears and no consent is logged. | Off |
| Banner style | `bottom-bar` - a strip at the foot of the page. `modal` - a centred overlay. | `bottom-bar` |
| Banner title | Heading shown to visitors | `Cookie preferences` |
| Banner body text | Explanatory text. Use `{privacyPolicy}` to insert a link to your privacy policy. | — |
| Accept all label | Button label for accepting all categories | `Accept all` |
| Reject all label | Button label for rejecting non-essential categories | `Reject all` |
| Manage label | Link/button label that opens the per-category toggle panel | `Manage preferences` |
| Dismiss button label | Button label used when the banner is notice-only (no optional categories configured) | `Got it` |
| Cookie categories | The list of cookie categories visitors can accept or reject. The **Necessary** category is always present, always on, and cannot be removed. | Necessary, Preferences, Analytics, Marketing |
| Re-prompt after (days) | Visitors whose consent is older than this are shown the banner again | `365` |
| Keep consent records for (days) | How long consent records are kept. Leave blank to keep them indefinitely (recommended - proof of consent should outlive the processing it authorises). | Indefinite |
| Show a preferences panel on the privacy policy page | Puts the same category switches at the top of whichever page is set as your privacy policy, so a visitor can change their mind without waiting to be re-prompted. | On |

**Category keys:** Each category has a machine-readable **Key** as well as a visitor-facing **Label**. Keys must start with a lowercase letter and contain only lowercase letters, numbers, hyphens and underscores - `live-chat`, not `Live chat`. The editor folds what you type into that shape as you type it, and the one-click suggestions offered by active modules arrive already in it (the module's own wording becomes the label, and where the module supplies one, its description is filled in for you as well - hover a suggestion to read it before you accept it). The key is what module code checks, so renaming the label is safe; changing the key is not.

**Category changes:** Adding or removing a category, or changing whether a category is required or on by default, automatically triggers re-consent for returning visitors. Purely cosmetic changes (renaming a label, editing copy) do not.

**Privacy page panel:** With **Show a preferences panel on the privacy policy page** on (the default), the page you have chosen as your privacy policy renders the category switches above its own content, with **Save preferences**, **Accept all** and **Reject all** buttons. It reads the visitor's current choice from their consent cookie, writes the new one straight away, and logs it exactly as the banner does. It appears only when the consent banner is enabled, only on the linked privacy policy page, and only when at least one optional category exists - a site whose categories are all required has nothing to offer, so nothing is drawn.

**Cookie settings link:** To give visitors a persistent way to change their preferences anywhere else, add a **Cookie settings link** block to your footer. It reopens the banner on the manage view, pre-filled with the visitor's existing choices. See [Appearance and design](Appearance-and-design).

---

## Schedules tab

Everything your site does on a timer, in one list, grouped by what it belongs to - your website's own housekeeping first, then each add-on you have installed.

Each job has a dropdown: **every minute, 5, 10, 15, 20 or 30 minutes, every hour, every 3, 6 or 12 hours, or once a day**. The first choice is always **Normal**, which is whatever the job was set up to do - a weekly search-engine audit stays weekly, at the time it was meant to run, unless you deliberately move it. Picking a new frequency keeps the time of day the job prefers wherever that still makes sense: a job that likes 3.40am, set to every 6 hours, runs at 3.40, 9.40, 15.40 and 21.40.

Beside each job is when it last ran, and what went wrong if something did.

### Your site's wake-up time

The banner at the top says how often your site wakes up. That is set for you from whichever job runs most often, and it is the soonest anything on this page can possibly happen - a job set to every 5 minutes on a site that wakes hourly would arrive hourly, which is why the two move together.

Asking for something faster than your site currently wakes up **rebuilds the site**. That takes a minute or two, happens on its own, and needs your site connected to GitHub. If it is not connected, your choice is still saved and takes effect the next time you update.

### Before you set something to every minute

Frequent checking is not free. Your host charges for the time your site spends working, and a job that takes twenty seconds and runs every minute spends rather a lot of it. Something small and quick every minute is pennies; something heavy every minute is not. Hourly, or every 15 minutes, covers most of what most sites need - and anything you want *right now* usually has a "Check now" button of its own.

One thing this page cannot do: if your site is on a free hosting plan, your host only wakes it once a day no matter what you choose here.

---

## Integrations tab

Shows the connection status of:

- **GitHub** - needed to install and update modules and themes, and to apply Cactus core updates.
- **Vercel** - needed to save settings that require a redeploy and to check deployment status.
- **Neon** - only shown during initial setup. Used for automatic database provisioning.

Credentials are read from environment variables. Their values are never displayed here.

### Environment variables reference

This table lists every environment variable Cactus recognises. Variables marked **Required** block setup or core features if absent. Everything else is optional and only affects the feature it describes.

| Variable | Required | What it's for |
|----------|----------|----------------|
| `DATABASE_URL` | Yes | Connection string for your PostgreSQL database. Provisioned automatically if `NEON_API_KEY` is set. |
| `SESSION_SECRET` | Yes | A secret key (at least 32 random characters) used to secure sign-in sessions. |
| `SITE_URL` | Yes | Your site's full public address (e.g. `https://example.com`). Tied to passkey sign-in and cannot change after the first passkey is registered. |
| `VERCEL_API_TOKEN` | Yes | Vercel API token. Create one at Vercel → Account Settings → Tokens. |
| `VERCEL_PROJECT_ID` | Yes | Your Vercel project ID. Find it at Vercel → your project → Settings → General. |
| `NEON_API_KEY` | No | Neon database API key. Enables one-click database setup during the setup wizard. Leave unset if you supply your own `DATABASE_URL`. |
| `BREVO_API_KEY` | No | Brevo email API key. Enables email sign-in, verification, and account recovery. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | No | SMTP email credentials. Alternative to Brevo. |
| `CLOUDFLARE_WORKER_URL` | No | Your Cloudflare Worker's URL - the base every proxied media provider (B2, R2, S3, Spaces, Wasabi, MinIO, Vercel Blob, Supabase) serves images from. Set automatically by the admin **Deploy media Worker** flow: a `https://media.<your-domain>` Custom Domain when Cactus could attach one, otherwise the `https://<name>.<subdomain>.workers.dev` URL. |
| `CLOUDFLARE_WORKER_HOSTNAME` | No | The Worker's bare hostname, used in the image security policy (CSP) and image host allowlist. Optional: when unset it is derived automatically from `CLOUDFLARE_WORKER_URL`, so you normally never set this by hand. |
| `CLOUDFLARE_ZONE_ID` | No | Your domain's zone id in Cloudflare. Only used with **Keep ready-made copies of your pages**: with it, editing a page clears its stored copy immediately. Without it, everything still works - an edited page just waits out its window. Find it on your domain's overview page in the Cloudflare dashboard. |
| `CLOUDFLARE_PURGE_API_TOKEN` | No | A Cloudflare API token with the **Zone → Cache Purge** permission, used with the above. If it's missing, Cactus falls back to `CLOUDFLARE_API_TOKEN`, which only works if that token happens to carry the purge permission as well - the one created for the media Worker does not. |
| `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_ENDPOINT` | No | Backblaze B2 credentials. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | No | Cloudflare R2 credentials. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `S3_REGION` | No | AWS S3 credentials. |
| `SPACES_ACCESS_KEY_ID`, `SPACES_SECRET_ACCESS_KEY`, `SPACES_BUCKET_NAME`, `SPACES_REGION` | No | DigitalOcean Spaces credentials. |
| `WASABI_ACCESS_KEY_ID`, `WASABI_SECRET_ACCESS_KEY`, `WASABI_BUCKET_NAME`, `WASABI_REGION` | No | Wasabi credentials. |
| `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY_ID`, `MINIO_SECRET_ACCESS_KEY`, `MINIO_BUCKET_NAME`, `MINIO_USE_SSL` | No | MinIO credentials. |
| `BLOB_READ_WRITE_TOKEN` | No | Vercel Blob token. |
| `SUPABASE_STORAGE_PROJECT_URL`, `SUPABASE_STORAGE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET_NAME` | No | Supabase Storage credentials. Use the service role key, not the anon key. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | No | Cloudinary credentials. |
| `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT` | No | ImageKit credentials. |
| `GITHUB_API_TOKEN` | No | GitHub personal access token (`repo` scope). Used for module and theme installs when a GitHub App is not connected. |
| `MODULE_CLONE_TOKEN` | No | Only needed for private custom modules, and only when the GitHub App route is not wanted: a fine-grained personal access token with read-only **Contents** access on the module repositories, used solely at deploy time to fetch their code. Without it, deploys try the site's GitHub App connection, then `GITHUB_API_TOKEN`. See [Authoring a module](Authoring-a-module#writing-a-module-for-your-own-site). |
| `ENCRYPTION_KEY` | No | 64-character hex key for encrypting GitHub App credentials, authenticator secrets and stored phone numbers. Required to connect a GitHub App. Generate with `openssl rand -hex 32`. Setup generates one per site. **Changing it makes everything encrypted with the old one unreadable** - the GitHub App connection and any two-factor enrolments would have to be set up again. It is not in your backup file either, which is why a backup restored onto a *different* site clears those items rather than pretending they work - see [Self-hosting and operations](Self-hosting-and-operations#what-a-backup-cant-carry-across-to-a-different-site). |
| `EDGE_CONFIG`, `VERCEL_EDGE_CONFIG_ID` | No | Vercel Edge Config credentials. Used for faster admin-path and site-status lookups. |
| `VERCEL_WEBHOOK_SECRET` | No | Enables automatic deployment status updates. Requires a Vercel Pro or Enterprise plan. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | No | Cloudflare Turnstile credentials. Adds bot protection to public-facing forms. |
| `CSP_EXTRA_ORIGINS` | No | Extra web addresses (https origins, separated by spaces or commas) the site's security policy should trust - needed when a module talks to a service on its own subdomain, such as the Live Chat module's chat server (see [Live Chat](Live-Chat)). Set automatically where the Live Chat wizard can; otherwise add e.g. `https://chat.your-site.co.uk` and redeploy. |
| `SENTRY_DSN` | No | Sentry error-reporting address. |
| `MEMBER_AREA_PATH` | No | The web address prefix for the member account area (login, registration, profile). Defaults to `account`. Set at deploy time only - changing it requires a redeploy. Lowercase letters, numbers and hyphens; unusable values quietly fall back to the default. |
| `CACTUS_CORE_REPO` | No | Override the upstream repository the Updates panel checks. Set this if you maintain a fork of Cactus Foundation. |
| `CRON_SECRET` | No | Password Vercel presents when it triggers a scheduled job, so a route can tell a real schedule from anyone who guessed its address. **You never have to find this one anywhere.** Cactus makes it up for you during setup, writes it to the hosting project itself, and every scheduled job then just works. A site created before that was true gets one the next time it updates, or the next time a module with a schedule is installed. Worth knowing what it does, because without it every scheduled job on the site (stock refreshes, low-stock alerts, search reindexing, quote expiry and the rest) refuses to run and says nothing about it. Visible as set/unset on Config → Environment. |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | No | Shop module - enables card payments via Stripe (see [Shop](Shop)). All three must be set before Stripe is offered at checkout, even if switched on in Settings → Shop. |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_MODE` | No | Shop module - enables PayPal payments. `PAYPAL_MODE` is `sandbox` for testing or `live` for real payments. |
| `GOCARDLESS_ACCESS_TOKEN`, `GOCARDLESS_WEBHOOK_SECRET`, `GOCARDLESS_ENVIRONMENT` | No | GoCardless Instant Bank Pay module - enables pay-by-bank (open banking) payments (see [Shop](Shop)). `GOCARDLESS_ENVIRONMENT` is `sandbox` for testing or `live` for real payments; sandbox and live use different access tokens. Set them on Settings → Instant Bank Pay (or in `.env.local` locally), then switch the method on there. Both the token and webhook secret must be set before it is offered at checkout. |
| `SQUARE_ACCESS_TOKEN`, `SQUARE_APPLICATION_ID`, `SQUARE_LOCATION_ID`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_SANDBOX_ACCESS_TOKEN`, `SQUARE_SANDBOX_APPLICATION_ID`, `SQUARE_SANDBOX_LOCATION_ID`, `SQUARE_SANDBOX_WEBHOOK_SIGNATURE_KEY`, `SQUARE_ENVIRONMENT` | No | Square Payments module - enables card payments, taken either in Square's card fields on your own checkout or on Square's hosted page (see [Shop](Shop)). Which environment the shop takes payments in is **not** one of these variables: it is a setting on Shop → Payments → Square, so switching between sandbox and production takes effect immediately rather than at the next deployment. `SQUARE_ENVIRONMENT` (`sandbox` or `production`) is only the starting point for a site that has never chosen on that page, and for local development. The choice picks which of the two credential sets is used: the `SQUARE_SANDBOX_*` variables for sandbox, the unprefixed ones for production. Both sets can be held at once, so switching environment does not mean retyping anything. Set them on Shop → Payments → Square (or in `.env.local` locally), then switch the method on. Credentials themselves are stored with the hosting project, so a newly pasted token does need a deployment before it works. The access token and location ID for the chosen environment must be set before it is offered at checkout; the location ID can be looked up from the token with the button on that page. The signature key is optional - without it payments are still confirmed when the shopper returns from Square, but a shopper who pays and closes the tab needs confirming by hand. The Application ID is optional too, but only in the sense that the hosted page does not use it: with card entry set to "on your own checkout" it is what the card form is drawn from, so the method is not offered at all until it is set. It sits next to the access token in the Square developer dashboard and is publishable by design - it is handed to the browser. |
| `ATOA_ACCESS_SECRET`, `ATOA_WEBHOOK_SIGNING_SECRET`, `ATOA_SANDBOX_ACCESS_SECRET`, `ATOA_SANDBOX_WEBHOOK_SIGNING_SECRET` | No | Pay With Atoa module - enables a second flavour of pay-by-bank (open banking) payment (see [Pay With Atoa](Pay-With-Atoa)). Which environment the shop takes payments in is **not** one of these variables: it is a dropdown on Shop -> Payments -> Pay With Atoa, so switching between sandbox and production takes effect on the next payment rather than at the next deployment. That choice picks which pair is used: the `ATOA_SANDBOX_*` variables for sandbox, the unprefixed pair for production. Both pairs can be held at once, so switching environment means retyping nothing. Set them on Shop -> Payments -> Pay With Atoa (or in `.env.local` locally), then switch the method on there. **Both** variables in the chosen pair must be set before the method is offered at checkout - the signing secret is not optional here, because without it there is no way to tell a genuine payment confirmation from a forged one. The access secret is the bearer token itself; the access ID Atoa shows beside it plays no part in authentication and has no variable. The signing secret is Atoa's V2 webhook secret, in its `whsec_...` form, generated in the Atoa dashboard under Settings -> Webhooks. Credentials are stored with the hosting project, so a newly pasted secret needs a deployment before it works - a box can correctly read *(set)* while the panel still says Atoa is not connected. |
| `SPACE_PLANNER_RENDER_URL`, `SPACE_PLANNER_RENDER_SECRET` | No | Space Planner module - points photoreal pictures at a render machine you run yourself (see [Space Planner](Space-planner)). The URL is where render jobs are sent; the secret is what proves the request came from your site. **Only for people who already run one.** Ordinarily you press the button on Space Planner → Pictures instead and the site builds its own, which needs no variables at all. Set these and the button is not offered, because your machine is yours to look after. |
| `IDEAL_POSTCODES_KEY` | No | Address Lookup module - fallback Ideal Postcodes API key for checkout address suggestions (see [Address Lookup](Address-Lookup)). The key saved on Shop → Settings → Address lookup takes precedence; this covers installs that already carry the key in their environment. |
| `LIVECHAT_SERVER_URL`, `LIVECHAT_ACCOUNT_ID`, `LIVECHAT_INBOX_ID`, `LIVECHAT_WEBSITE_TOKEN`, `LIVECHAT_HMAC_TOKEN`, `LIVECHAT_API_TOKEN`, `LIVECHAT_WEBHOOK_TOKEN` | No | Live Chat module - pre-provisioned connection to a chat server (see [Live Chat](Live-Chat)). Ordinarily you never set these: the wizard on Settings → Live Chat builds and connects the chat server itself and stores everything for you. Any of these that ARE set win over what the settings page holds, which is what lets a centrally managed install arrive ready-connected. |
| `LIVECHAT_FLY_APP`, `LIVECHAT_FLY_TOKEN` | No | Live Chat module - lets the settings page show the chat server's state and offer the wake and update buttons. Same rule: set by the wizard or centrally, not by hand. |
| `LIVECHAT_IMAGE` | No | Live Chat module - the Docker image the setup wizard puts on the chat server's machine. Defaults to the standard public de-branded Chatwoot build (`ghcr.io/cactus-foundation-modules/chatwoot:latest`); set this only if you publish your own build. The form has a matching optional field for a one-off choice. |
| `LIVECHAT_BACKUP_ENDPOINT`, `LIVECHAT_BACKUP_TOKEN`, `LIVECHAT_BACKUP_BUCKET_PATH`, `LIVECHAT_B2_ENDPOINT`, `LIVECHAT_B2_KEY_ID`, `LIVECHAT_B2_KEY` | No | Live Chat module - where nightly chat backups are taken from and stored, and the storage credentials used to list and download them on Settings → Backup. Without them the backup card simply says storage is not configured. |
| `MEDIA_WORKER_URL`, `MEDIA_WORKER_SECRET` | No | The background service that optimises video (see [Managing media](Managing-media)). The URL is the service's address; the secret is the shared key that authenticates both directions. Unset simply hides the **Optimise video** action. The older names `SEQUENCE_WORKER_URL` and `SEQUENCE_WORKER_SECRET` are still read, so a site set up before the rename keeps working untouched. |
| `MEDIA_WORKER_FLY_TOKEN` | No | Fallback Fly.io API key for video optimising. With a key (here or saved under Media → Video, which wins), each video runs on its own short-lived machine - as many at once as you start, and every machine is removed when its job finishes. Without one, videos queue on the single service. The older name `SEQUENCE_FLY_TOKEN` is still read. |
| `SEQUENCE_MAX_JOB_MACHINES` | No | A lid on how many scroll-sequence conversions may run at the same time. Left unset (the default) there is no lid at all. Set a number only if you want to cap what the conversion machines can cost you in one go: asking for one past the lid is politely refused rather than left queueing. |
| `SKIP_BUILD_STATIC_GENERATION` | No | Stops a deploy pre-building every published page; each one is built instead the first time somebody asks for it, and kept from then on. The pages are identical either way, they are just made later. Worth switching on if your site has more pages than the deploy wants to sit through. Setting it to *anything at all* switches it on, `0` included - to turn it off again, remove it. |
| `CACTUS_TURBOPACK_BUILD_CACHE` | No | Set to `0` to make every deploy start from scratch instead of reusing the last one's working copy. Slower, and the first thing to try if a deploy stops producing anything at all. See [a deploy that never finishes](Self-hosting-and-operations#a-deploy-that-never-finishes). |
| `CACTUS_BUILD_WATCHDOG` | No | Set to `0` to switch off the safety net that gives up on a stuck deploy and retries it, or `1` to switch it on when working locally. On by default wherever the site is actually deployed. |
| `CACTUS_BUILD_SILENT_LIMIT_MINUTES` | No | How many minutes a deploy may go without saying anything before it is treated as stuck rather than slow, and retried. Defaults to `10`. |
| `CACTUS_BUILD_TOTAL_LIMIT_MINUTES` | No | How many minutes any single deploy attempt gets in total before it is treated as stuck and retried. Defaults to `25`. |

---

## Users tab

Only shown once you (or someone) holds at least one of the permissions below - see [Managing users](Managing-users). The member-settings sub-tabs below (Registration through Data & deletion) sit directly on the Users tab, alongside Roles - see [Members](Members) for a plain-English walkthrough. Email wording moved off this tab: it is on the **Email** tab now, covering every email the site sends rather than only the member ones.

### Registration

| Field | Description | Default |
|-------|-------------|---------|
| Members system enabled | Master switch. Off hides every member-facing page and admin section. | Off |
| Registration mode | `Open`, `Invite only`, or `Approval required` | `Open` |
| Require email verification | New accounts must click a verification link before they're active | On |
| Ask new members to choose a username | Off hides the box and makes one up from their email address, with a few random digits after it | On |
| Ask new members for a display name | Off hides the optional display-name box | On |
| Ask new members to set a password | Off hides the password box at sign-up; members add one later from their account security page. Only shown while Password (below) is Optional | On |
| Allowed email domains | If set, only these domains can register | — |
| Blocked email domains | Domains that are never allowed to register | — |
| Post-registration redirect | Page to send members to right after registering | — |
| Notify admins on pending approval | Sends an admin notification whenever a new registration is waiting for approval | On |

### Access control

| Field | Description | Default |
|-------|-------------|---------|
| Passkey | Off, Optional or Required. Required members are asked to add one the first time they sign in, before they can go anywhere else in their account | Optional |
| Email sign-in link | Off or Optional. No Required option: there is nothing for a member to set up, the mailbox they have already verified is the credential | Optional |
| Password | Off, Optional or Required. Required members choose one on the sign-up form, and set up their second step the first time they sign in. Optional members are offered one at sign-up too, unless you've turned that box off under Registration. A short code is always compulsory alongside a password | Off |
| Trust this browser (days) | How long a member's "trust this browser" cookie lasts before a two-factor code is required again | `30` |
| Session length (days) | How long a member stays signed in (sliding expiry) | `30` |
| Site-wide members-only mode | Locks the entire public site behind member sign-in | Off |
| Site-wide members-only exceptions | Pages that stay visible to everyone even when the above is on | — |
| Guest preview | Shows a locked-down preview to signed-out visitors instead of blocking them outright, when site-wide members-only is on | Off |

### Profile & directory

| Field | Description | Default |
|-------|-------------|---------|
| Profile visibility | `Public`, `Members only`, or `Hidden` | `Public` |
| Member directory enabled | Whether a page listing all members is available | Off |
| Avatar uploads enabled | Whether members can upload their own avatar photo | On |
| Gravatar enabled | Whether members can show the picture attached to their email address at gravatar.com. On, it is also what new members start on, falling through to their initials if they haven't got one | On |
| Username changes enabled | Whether members can change their own username | Off |
| Username change cooldown (days) | Minimum gap between username changes, once enabled | `90` |
| Old username redirect (days) | How long a changed-from username keeps redirecting to the profile | `30` |
| Account sections enabled | Which of Profile, Security, Notifications, Activity, Danger Zone appear in the member account area | All on |

### Data & deletion

| Field | Description | Default |
|-------|-------------|---------|
| Account deletion grace period (days) | How long a member has to change their mind after requesting deletion, before it's permanent | `14` |
| Notify admins on deletion request | Sends an admin notification whenever a member requests account deletion | Off |

### Roles

Manage roles and permissions - see [Managing users](Managing-users).


---

**Wiki:** [Home](Home) · [Getting started](Getting-started) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Members](Members) · [Managing media](Managing-media) · [Modules](Modules) · [Shop](Shop) · [Reply Catcher](Reply-catcher) · [Configuration reference](Configuration-reference) · [Architecture overview](Architecture-overview) · [Authoring a module](Authoring-a-module) · [Self-hosting and operations](Self-hosting-and-operations)
