# Gazette

**Gazette** is a blog and news module for Cactus. Write, schedule and publish **Posts**, group them with **Tags** and **Series**, take comments and reactions, and publish an RSS feed - all from your own admin.

Posts live at `/gazette` on your site (or `/gazette/your-post-title` for an individual post). If you already have a page at that address, the page wins and Gazette's front page stays hidden until you rename one of them.

---

## Who can write for the Gazette

Gazette has three writing permissions, set on your core roles from **Settings → Users → Roles** alongside everything else:

- `gazette.contributor` - can write and edit their own drafts, but can't publish. Handy for guest writers you want to check over before anything goes live.
- `gazette.author` - can write, edit and publish their own posts.
- `gazette.editor` - can do everything: edit and publish anyone's posts, manage tags, series, comments, templates and settings.

Give someone more than one and the highest wins, so there's no need to worry about ticking the "wrong" combination. Because these live on a role rather than on an individual person, two writers who need different tiers need different roles - set one up per tier if you want to hand out Author to one person and Contributor to another. Even a Gazette Editor can't grant these to anyone else; that stays with a core admin. This is deliberate: who gets to publish under your name is exactly the sort of thing that shouldn't be self-service.

One more thing: to see the Gazette links in the admin sidebar at all, someone also needs the `gazette.access` permission on their core role. On its own it won't surface the sidebar links - think of it as "does this person work in the newsroom" (`gazette.access`) plus "what can they do once they're in there" (the three permissions above).

Core admins always have full run of the Gazette, permissions or no permissions.

---

## Writing and publishing

Head to **Gazette → Posts → New Post**. Pick a blank post or start from a saved template, give it a title, and you're straight into the editor.

The editor has a small, writing-focused set of blocks - paragraphs and headings, pull quotes, code snippets (with proper syntax colouring), images, and dividers. It's deliberately not the full page-builder palette you get on ordinary pages; Gazette posts are meant to be written, not laid out.

Everything autosaves a second or two after you stop typing, and you can also just press **Ctrl+S** (or **Cmd+S** on a Mac). When you're ready:

- **Publish Now** puts it live immediately.
- **Schedule** lets you pick a future date and time - the post appears on the site automatically the moment that time arrives. No one needs to be logged in, and nothing needs to run in the background; Gazette checks the time whenever a visitor loads the page.
- **Unpublish** pulls a live post back to Draft.

A **Private** toggle in the sidebar hides a post from the public site, feeds and search entirely, useful for something you're not ready to announce. **Pinned** keeps a post at the top of the front page regardless of date.

**Duplicate** and **Save as Template** (also in the sidebar) are the fastest way to reuse a post's structure without starting from a blank page each time.

---

## Preview links

Click **Copy preview link** in the Publish panel to get a private link to a draft, safe to send to a colleague or client for a look before it goes live. Generating a new one replaces the old link, so if you've shared a link too widely, just click the button again to cut it off.

---

## Tags, series and authors

**Tags** are freeform - create them inline while tagging a post, or manage them from **Gazette → Tags**. Changing a tag's slug will break any links people already have to that tag's page, so Cactus warns you before you do it.

**Series** group posts into an ordered sequence - a "Part 3 of 5" style read. Create one from **Gazette → Series**, then drag posts into the order you want from the series' own page. Each post in a series shows a "previous/next" link automatically.

Every writer gets an **author profile** (bio and photo) from **Gazette → Authors**, shown at the bottom of their posts. Writers can edit their own; Editors can edit anyone's.

Every author also gets a page listing everything they've written, at `/gazette/author/username`.

## Linking to Gazette content from a menu

When editing a menu (see [Appearance and design](Appearance-and-design)), choose **Module content** and then **Gazette** to link directly to the Gazette home page, a post, tag, series or author, instead of typing out the address by hand.

---

## Comments

Turn comments on or off, and choose how they're moderated, from **Settings → Gazette**:

- **Before publishing** - a comment sits as Pending until an Editor approves it.
- **After publishing** - comments appear straight away and can be taken down afterwards if needed.

Visibility has two options: **Public**, or **Members only**. Cactus doesn't have a public membership system yet, so "Members only" currently means "anyone with a login to your admin" - visitors who aren't logged in see "Only members can comment." instead of the form. This is how it's meant to work for now, not a bug; it'll tighten up once Cactus grows proper site memberships.

Editors moderate everything from **Gazette → Comments** - approve, reject, delete, or reply inline (an Editor's reply is posted immediately, no moderation queue for your own team).

---

## Reactions and view counts

Turn emoji reactions on or off, and pick which emoji show up, from **Settings → Gazette**. Visitors react anonymously - Gazette remembers who reacted to what using a small cookie (`cactus-gazette-vid`) rather than requiring a login.

View counts are tracked either way, but only shown publicly if you switch **Show view counts** on.

---

## RSS feed

Every Gazette install publishes an RSS feed at `/gazette/feed.xml`, ready to plug into a reader or a newsletter tool. Turn it off, and set its title and description, from **Settings → Gazette**.

---

## Importing from somewhere else

The importer, at the bottom of **Settings → Gazette**, can bring posts in from:

- **WordPress** - export your site as WordPress XML and upload the file directly.
- **Medium** - request your data export from Medium, unzip it, and choose the HTML files from inside the `posts` folder.
- **Substack** - request your export from Substack, unzip it, and choose `posts.csv` (plus the matching HTML files, if you have them, for the full post text).

Zipped exports aren't supported directly yet - unzip first, then pick the files. Click **Preview import** first to see exactly what will come in, including which posts will be skipped because a post with that title already exists. Nothing is imported until you confirm. Everything comes in as a Draft, so you can give it a once-over before publishing.

---

## Adding a Gazette feed to any page

Two Gazette blocks are available anywhere in the ordinary Cactus page builder, under the **Modules** category:

- **Gazette Feed** - a grid, list or compact roundup of recent posts, optionally filtered by tag.
- **Gazette Featured** - a single spotlighted post (latest, or your pinned one) in a hero, card or minimal layout.

Any page that includes one of these blocks always shows the very latest posts on every visit, even if the page itself is normally cached - so a scheduled post appearing on time isn't held up by an old cached copy of your homepage.

## Designing your post listing and post pages

The look of your post listing pages (the main feed, tag pages, series pages, author pages, and monthly archives all share one design) and your individual post pages can be customised in **Appearance → Layouts**, under the **Gazette** tab (with **Category** and **Entry** sub-tabs) - the same drag-and-drop editor used for your header and footer, with Gazette's own blocks (post list, author bio, table of contents, comments, and more) alongside the usual layout and content blocks. Nothing changes until you pick a starter design and publish it - until then, both page types keep their current built-in look.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Gazette](Gazette) · [Boards](Boards) · [Directory](Directory) · [Shop](Shop) · [Reply Catcher](Reply-catcher) · [Configuration reference](Configuration-reference)
