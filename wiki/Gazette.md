# Gazette

**Gazette** is a blog and news module for Cactus. Write, schedule and publish **Posts**, group them with **Tags** and **Series**, take comments and reactions, and publish an RSS feed - all from your own admin.

> **Where it lives now.** Gazette used to take six sidebar links. It takes one - **Gazette** - with Posts, Tags, Series, Authors, Comments and Templates as tabs across the top. Old links still work.

Posts live at `/gazette` on your site (or `/gazette/your-post-title` for an individual post). If you already have a page at that address, the page wins and Gazette's front page stays hidden until you rename one of them.

---

## Who can write for the Gazette

Gazette has three writing permissions, set on your core roles from **Users → Roles** alongside everything else:

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

Both only count for posts the public can actually read. A draft, a private post or one scheduled for next Tuesday can no longer collect reactions or have its view count nudged along, so the numbers on a post reflect its life after publication rather than the afternoon you spent editing it.

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

The look of your post listing pages (the main feed, tag pages, series pages, author pages, and monthly archives all share one design) and your individual post pages can be customised in **Appearance → Layouts**, under the **Gazette** tab (with **Listing** and **Post** sub-tabs) - the same drag-and-drop editor used for your header and footer, with Gazette's own blocks (post list, author bio, table of contents, comments, and more) alongside the usual layout and content blocks.

Install Gazette from v0.1.16 onwards and one Listing design and one Post design are created and published for you, ready to edit. Three designs of each are offered under **+ New Layout** if you would rather start somewhere else.

If your Gazette went in before v0.1.16 those two tabs will be empty, and updating will not fill them - the module only ever creates its starting designs once, on the way in, and yours has already had its go. Nothing is broken: your posts carry on using the built-in look. Click **+ New Layout**, pick a Listing design and a Post design, publish each one, and set it to show on the entire site.

### Settings on the Category Header block

The **Gazette: Category Header [Anchor]** block is the heading at the top of a listing page. One Listing design serves the main feed, tag pages, series pages, author pages and the monthly archives, so by default the block shows whichever heading the page in question has of its own - "Gazette", "Tag: Standing desks", "Posts by Ada", "August 2026 archive" and so on. Select it in the Listing design and the panel offers:

| Setting | What it does |
|---------|--------------|
| **Heading** | Leave it blank and each page keeps its own heading, which is what the block has always done. Type something and every listing page gets those words instead. Include `{title}` and the page's own heading is dropped in where you put it, so "Reading: {title}" gives "Reading: Gazette" on the main feed and "Reading: Tag: Standing desks" on a tag page. |
| **Heading level** | Whether it counts as the page's main heading or a lesser one. Main heading is right unless you have put something more important above it. |
| **Heading size** | How big it looks, separately from how important it counts as. Leave it on **As the theme** to inherit your site's own heading style. |
| **Small label above** | A short line of capitals above the heading, in the style of a section label. Blank for none. |
| **Alignment** | Left or centred. |
| **Description** | The sentence under the heading. Switch it off and it goes, along with its own wording box. |
| **Description wording** | As with the heading: blank keeps whatever the page supplies, and `{title}` stands in for it. |
| **Line underneath** | A hairline rule below the whole header. |
| **Space underneath** | How much room before the next block. **As the theme** is the spacing it has always had. |

Headers designed before these settings existed carry on exactly as they were.

### Settings on the Entry List block

The **Gazette: Entry List [Anchor]** block is the run of post cards itself. Select it in the Listing design and the panel offers:

| Setting | What it does |
|---------|--------------|
| **Posts per page** | How many cards before the listing stops for breath. Leave it at 0 to keep using the number in **Settings → Gazette**, which is what every listing did before this setting existed. 48 is the ceiling. |
| **When there are more posts** | **Numbered pages** is the old behaviour. **"Load more" button** adds one more helping at a time without leaving the page. **Load as you scroll** fetches the next lot as the visitor nears the bottom. **Show nothing more** stops dead at the first page, handy for a "latest three posts" panel in a sidebar. |
| **"Load more" label** | The words on the button. |
| **Order** | Newest first, oldest first, most read first, or title A to Z. Pinned posts still come first whichever you pick, which is rather the point of pinning them. |
| **Columns** | **Fit to the space** keeps the cards flowing to suit the width they've been given. One to four pins the count instead. Phones always get a single column, whatever you choose, because four cards side by side on a handset is not a design, it's a punishment. |
| **Image**, **Excerpt**, **Author**, **Date**, **Comment count** | Each can be switched off on its own. |
| **Image shape** | The shape every card's picture is cropped to: widescreen (16:9, the shape they have always been), landscape, classic, square, or **As uploaded**, which crops nothing and lets each picture keep its own proportions. Square is the one that matches a shop laid out with product cards. |
| **When a card is hovered** | **Nothing** leaves the cards still. **Lift** raises the card slightly, deepens its shadow and eases the picture in a touch, which is exactly what the shop's product cards do, so a site running both reads as one thing. **Grow slightly** swells the whole card in place instead. Anyone who has asked their computer to keep animation to a minimum gets no movement either way. |
| **View count** | Follows the site-wide **Show view counts** setting by default, and can be forced on or off for this listing. |

"Load as you scroll" keeps its button as well, for anyone using a keyboard or a browser that won't play along, and stops loading by itself if the connection gives up rather than hammering away in the background.

Listings designed before these settings existed carry on exactly as they were: numbered pages, the site's own posts-per-page number, everything on show, widescreen pictures and no hover. Newly added blocks arrive with the lift already on. If you want the square pictures or the hover on a listing you designed earlier, open it and pick them.

### Letting visitors filter the listing

Three more blocks sit in the Listing design, for visitors to narrow the posts down themselves:

- **Gazette: Series Filter**
- **Gazette: Author Filter**
- **Gazette: Tag Filter**

Drop in as many or as few as suit you, in a sidebar or across the top. Each one lists what you actually have, with the number of published posts beside each, and a chip for "all" to clear it again. Anything with nothing published under it is left out, so nobody clicks through to an empty page.

They stack: pick a series and an author and the listing shows the posts that are both. Choosing a filter takes the visitor to the main Gazette address with the choice remembered, so the back button behaves and a filtered view can be shared as a link like any other page. The individual tag, series and author pages carry on working as they always have, and a filter block on one of those pages shows that choice as already picked.

| Setting | What it does |
|---------|--------------|
| **Heading** | The small label above the chips. Leave it blank for none. |
| **Style** | **Pills** for a row of rounded chips, **List** for a stacked column, which suits a narrow sidebar. |
| **Order** | A to Z, or most posts first. |
| **Maximum shown** | Trims a long list to the first few. 0 shows the lot. Whatever the visitor has currently picked is always shown, even if it falls outside the cut. |
| **Show post counts** | The number beside each option. |
| **Show the "all" option** and **"All" label** | The chip that clears this filter, and what it says. |

### Settings on the Entry Header block

The **Gazette: Entry Header [Anchor]** block draws the top of a post - the featured image, the headline, and the line of small print under it. Select it in the Post design and the panel offers:

| Setting | What it does |
|---------|--------------|
| **Featured image** | Show or hide the post's picture. Off is the tidy choice for a text-led blog, or for a design that puts the picture somewhere else entirely. |
| **Image shape** | Leave it **As uploaded** to keep each photo's own proportions, or crop every one to the same widescreen, landscape, classic or square shape so a run of posts all start at the same place. |
| **Image corners** | Square through to very rounded. |
| **Alignment** | Headline and small print to the left, or centred. |
| **Author name**, **Date**, **Reading time**, **Comment count**, **View count**, **Tags** | Each can be switched off on its own. The view count still obeys the site-wide **Show view counts** setting - a block can hide it, never force it on. |
| **Date style** | 14 August 2026, 14 Aug 2026, or 14/08/2026. |
| **Tags label** | The words before the list of tags. Blank leaves just the tags. |

Settings that could not do anything stay out of the way: turn the image off and its shape and corners disappear, turn the date off and the date style goes with it.

Posts designed before these settings existed look exactly as they did - everything starts switched on.

### Where the contents list sits

The **Gazette: Table of Contents** block used to tuck itself out to one side, which was right on the built-in post page and quite wrong in a design where you had given it a column of its own: it pulled itself out of that column and left whatever sat underneath - usually **Gazette: Series Navigation** - wrapping its words around it a letter at a time. It now sits squarely in whatever column you put it in, with a **Contents** heading above the links, and the blocks below it start below it. On phones it stays a tap-to-open **Contents** panel as before.

If you want the contents list to follow the reader down the page, that is the **Col sticky** setting on the Grid holding the column, not the block.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Gazette](Gazette) · [Boards](Boards) · [Directory](Directory) · [Shop](Shop) · [Reply Catcher](Reply-catcher) · [Configuration reference](Configuration-reference)
