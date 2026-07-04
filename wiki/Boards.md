# Boards

**Boards** is a discussion forum module for Cactus. Members create **Boards** and **Sub-boards**, start **Threads**, and reply to each other, with polls, reactions, subscriptions, bookmarks, search and a full set of moderation tools - all from your own admin.

The forum lives at `/boards` on your site (or `/boards/general` for a board, `/boards/t/your-thread-title` for a thread). If you already have a page at `/boards`, that page wins and the forum's front page stays hidden until you rename one of them.

---

## Who can do what

Moderating Boards is just another permission on your core roles, set from **Settings → Users → Roles**:

- `boards.access` - see the Boards section in the admin sidebar at all.
- `boards.manage` - get at structure, tags, templates and the settings/import tab.
- `boards.moderate` - the full moderator toolkit everywhere: hide, delete, lock, pin, archive, move and split threads and posts, resolve reports, and hand out bans.

There's no separate moderator list to maintain and no "just this one board" option any more - tick the box on a role and everyone with that role can moderate every board on the site. Anyone with a login can read public boards, start threads and reply; a board can also be restricted to logged-in members only, or to moderators only (handy for a staff-only area).

Core admins always have full run of Boards, permissions or no permissions.

---

## Setting up your forum

From **Boards → Structure**, an admin (with `boards.manage`) can:

- Create **Categories** to group boards visually on the front page (optional - uncategorised boards just show in a trailing group). Rename a category any time by editing its title in the list.
- Create **Boards**, each with its own title, description, icon (emoji or an uploaded image), visibility (Public, Members-only, or Private to moderators), a "hide from search engines" toggle, a minimum post length, and a word filter (one flagged term per line - a hit sends the post to the moderation queue instead of publishing it straight away). A board's title and category can both be changed later from the same list.
- Add **Sub-boards** underneath any board (one level deep). A sub-board's title and parent board can be edited later too.
- Manage **Tags** (rename them any time) and reusable thread **Templates**.

Board-wide settings - how many threads/posts show per page, reactions, signatures, posting limits, and the RSS feed - live under **Settings → Boards** (alongside the forum importer, see below).

---

## Starting a thread and replying

Any member can start a thread from a board or sub-board page - click **New Thread**, give it a title, write the opening post, and optionally attach tags or a poll. The editor has a small, forum-focused set of blocks (paragraphs and headings, pull quotes, code snippets, images, polls, and link/video embeds) rather than the full page-builder palette.

Replies use a simpler text box, with support for quoting an earlier reply. Everything you're writing autosaves as a draft, so a dropped connection or an accidental tab close won't lose your post.

New members' first few posts (configurable in **Settings → Boards**) land in the moderation queue for a quick check before going live - established members skip straight past it.

---

## Moderation

Moderators get a full toolkit at **Boards → Moderation**:

- **Queue** - pending threads and posts (new-member posts, or anything that tripped a board's word filter), approve or reject with one click.
- **Reports** - things members have flagged, resolve or dismiss.
- **Bans** and **IP Bans** - block a member or an address from posting, for a set time or indefinitely.
- **Log** - a read-only history of every moderation action taken, by whom.

From any thread or reply, a moderator can also hide, delete, lock, pin, archive, move to a different board, or split a thread from a chosen reply onwards into a brand new thread - handy when a conversation has wandered off-topic.

---

## Polls, reactions, subscriptions and bookmarks

Any thread can carry one poll, created alongside it - single or multiple choice, with an optional closing date. Results show live once someone's voted.

Members can react to individual replies with emoji (which emoji are available is set in **Settings → Boards**), subscribe to a thread or a whole board to get notified of new activity, and bookmark threads to find them again later from their own profile.

Until Cactus's own site-wide notification bell arrives, subscription and moderation notifications go out by email only (or not at all, if a member switches notifications off, or picks the daily digest instead of immediate emails).

---

## Search and RSS

A search box on the forum front page looks across thread titles and reply text, scoped to whatever boards a visitor is actually allowed to see. Every board (and the forum as a whole) publishes an RSS feed, switchable from **Settings → Boards**.

Every tag has its own page listing threads carrying it, at `/boards/tag/tag-name`. Categories don't get a page of their own - a link to one jumps to that group on the main forum page.

## Designing board and thread pages

The look of a board (or sub-board) page and a thread's own page can be customised in **Appearance → Layouts**, under the **Boards** tab (with **Category** and **Entry** sub-tabs) - the same drag-and-drop editor used for your header and footer, with Boards' own blocks (thread list, sub-board list, reply list, and more) alongside the usual layout and content blocks. Nothing changes until you pick a starter design and publish it - until then, both page types keep their current built-in look.

## Linking to Boards content from a menu

When editing a menu (see [Appearance and design](Appearance-and-design)), choose **Module content** and then **Boards** to link directly to the Boards home page, a category, board, sub-board or tag, instead of typing out the address by hand.

---

## Importing from an existing forum

The importer, at the bottom of **Settings → Boards**, brings threads and posts in from:

- **phpBB** - export your forum as XML and upload the file directly.
- **Discourse** - export your forum as JSON and upload the file directly.

Click **Preview (dry run)** first to see counts before anything is written. Re-running an import is always safe - anything already brought in is recognised and skipped, never duplicated.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Gazette](Gazette) · [Boards](Boards) · [Directory](Directory) · [Shop](Shop) · [Reply Catcher](Reply-catcher) · [Configuration reference](Configuration-reference)
