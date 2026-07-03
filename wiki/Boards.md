# Boards

**Boards** is a discussion forum module for Cactus. Members create **Boards** and **Sub-boards**, start **Threads**, and reply to each other, with polls, reactions, subscriptions, bookmarks, search and a full set of moderation tools - all from your own admin.

The forum lives at `/boards` on your site (or `/boards/general` for a board, `/boards/t/your-thread-title` for a thread). If you already have a page at `/boards`, that page wins and the forum's front page stays hidden until you rename one of them.

---

## Who can do what

Boards has its own moderator roles, separate from your core Cactus user roles:

- **Board Moderator** - can hide, delete, lock, pin, archive, move and split threads and posts, but only within the board(s) they've been assigned to.
- **Global Moderator** - the same powers everywhere, plus bans, IP bans, and global announcements.

**Only a core admin can hand these out**, from **Boards → Moderators** in your admin - even a Global Moderator can't promote anyone else. Anyone with a login can read public boards, start threads and reply; a board can also be restricted to logged-in members only, or to moderators only (handy for a staff-only area).

To see the Boards links in the admin sidebar, someone also needs the `boards.access` permission on their core role, and `boards.manage` to get at structure, settings, tags, templates and imports - both set from **Roles & Permissions**.

Core admins always have full run of Boards, roles or no roles.

---

## Setting up your forum

From **Boards → Structure**, an admin (with `boards.manage`) can:

- Create **Categories** to group boards visually on the front page (optional - uncategorised boards just show in a trailing group).
- Create **Boards**, each with its own title, description, icon (emoji or an uploaded image), visibility (Public, Members-only, or Private to moderators), a "hide from search engines" toggle, a minimum post length, and a word filter (one flagged term per line - a hit sends the post to the moderation queue instead of publishing it straight away).
- Add **Sub-boards** underneath any board (one level deep).
- Manage **Tags** and reusable thread **Templates**.

Board-wide settings - how many threads/posts show per page, reactions, signatures, posting limits, and the RSS feed - live at **Boards → Settings**.

---

## Starting a thread and replying

Any member can start a thread from a board or sub-board page - click **New Thread**, give it a title, write the opening post, and optionally attach tags or a poll. The editor has a small, forum-focused set of blocks (paragraphs and headings, pull quotes, code snippets, images, polls, and link/video embeds) rather than the full page-builder palette.

Replies use a simpler text box, with support for quoting an earlier reply. Everything you're writing autosaves as a draft, so a dropped connection or an accidental tab close won't lose your post.

New members' first few posts (configurable in **Settings**) land in the moderation queue for a quick check before going live - established members skip straight past it.

---

## Moderation

Moderators get a full toolkit at **Boards → Moderation**:

- **Queue** - pending threads and posts (new-member posts, or anything that tripped a board's word filter), approve or reject with one click.
- **Reports** - things members have flagged, resolve or dismiss.
- **Bans** and **IP Bans** (Global Moderators) - block a member or an address from posting, for a set time or indefinitely.
- **Log** - a read-only history of every moderation action taken, by whom.

From any thread or reply, a moderator can also hide, delete, lock, pin, archive, move to a different board, or split a thread from a chosen reply onwards into a brand new thread - handy when a conversation has wandered off-topic.

---

## Polls, reactions, subscriptions and bookmarks

Any thread can carry one poll, created alongside it - single or multiple choice, with an optional closing date. Results show live once someone's voted.

Members can react to individual replies with emoji (which emoji are available is set in **Settings**), subscribe to a thread or a whole board to get notified of new activity, and bookmark threads to find them again later from their own profile.

Until Cactus's own site-wide notification bell arrives, subscription and moderation notifications go out by email only (or not at all, if a member switches notifications off, or picks the daily digest instead of immediate emails).

---

## Search and RSS

A search box on the forum front page looks across thread titles and reply text, scoped to whatever boards a visitor is actually allowed to see. Every board (and the forum as a whole) publishes an RSS feed, switchable from **Settings**.

---

## Importing from an existing forum

The importer, at **Boards → Import**, brings threads and posts in from:

- **phpBB** - export your forum as XML and upload the file directly.
- **Discourse** - export your forum as JSON and upload the file directly.

Click **Preview (dry run)** first to see counts before anything is written. Re-running an import is always safe - anything already brought in is recognised and skipped, never duplicated.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Gazette](Gazette) · [Boards](Boards) · [Reply Catcher](Reply-catcher) · [Configuration reference](Configuration-reference)
