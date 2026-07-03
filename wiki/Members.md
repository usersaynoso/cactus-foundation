# Members

The **Members** system gives your visitors their own accounts, separate from the admin Users who manage your site. Members can sign in, keep a profile, and (if you want) be the only people who can see certain parts of your site.

This is a different system from admin **Users** (see [Managing users](Managing-users)) - members never have access to your admin area, and admins never appear in the members directory. Under the hood the two never mix; in the admin, though, members and staff are listed together in one combined Users table for convenience (see [Admin tools](#admin-tools) below).

---

## Turning it on

Go to **Settings → Users** in the admin and tick **Members system enabled** (the checkbox sits above the Registration/Avatars/Usernames/Account sections/Access control tabs - it's visible no matter which one you're on). Nothing changes for visitors until you do this.

Once it's on, your site gets:

- A registration page and a sign-in page, both under a web address you choose (see [Member area address](#member-area-address) below).
- A public profile page for every member, at `/members/<their-username>`.
- Member management tools on the **Users** page and **Settings** page in your admin (see [Admin tools](#admin-tools) below).

---

## How people sign in

Members can sign in three ways, and you choose which are switched on (**Settings → Users → Access control**):

- **Passkey** - fingerprint, face unlock, or a security key. The quickest and most secure option, and switched on by default.
- **Magic link** - a one-time sign-in link emailed to them. No password to remember. Switched on by default alongside passkeys, and it's what a brand-new member uses the very first time, before they've set anything else up.
- **Password** - the traditional option, switched off by default. If you turn it on, members must also set up a second sign-in step (an email code or an authenticator app) - a password alone is never enough.

Members can add a passkey, set a password, or turn on the extra sign-in step for themselves from their own account's **Security** page - you don't need to do anything per-member.

---

## Registration modes

**Settings → Users → Registration** controls who can sign up:

- **Open** - anyone can register.
- **Invite only** - people need an invite link, which you generate from **Users → Invites**. Each invite can be used once and expires after however many days you set.
- **Approval required** - anyone can register, but their account waits in a queue (**Users → Pending Approval**) until an admin approves it.

You can also require email verification before an account becomes active (on by default), and restrict registration to specific email domains or block specific ones.

---

## The member account area

Once signed in, members manage their own account from a few sections you can individually switch on or off (**Settings → Users → Account sections**):

- **Profile** - display name, bio, website, avatar (uploaded photo, Gravatar, or automatically generated initials), and which of these show up on their public profile.
- **Security** - passkeys, password, two-factor authentication, active sessions, and trusted browsers.
- **Notifications** - email preferences for anything your installed modules notify members about.
- **Activity** - a simple history of their sign-ins and other account activity.
- **Danger Zone** - requesting a copy of their data, or deleting their account.

### Data export and account deletion

Members can request a copy of all their data at any time - it's bundled up and available to download for 48 hours. If they delete their account, it's not removed immediately: there's a grace period (you choose how long, default 14 days) during which they can change their mind, before it's permanently deleted.

---

## Public profiles and directory

Every member gets a profile page at `/members/<username>`. You control who can see it (**Settings → Users → Account sections → Public profile visibility**):

- **Public** - anyone, including visitors who aren't signed in.
- **Members only** - only people signed in as a member.
- **Hidden** - profiles are switched off entirely.

There's also an optional **member directory** (a page listing everyone), which you can switch on separately.

---

## Admin tools

Member management lives alongside your ordinary admin Users, rather than in a section of its own:

- At-a-glance member counts appear on your admin **Dashboard**, alongside your page/user/media counts.
- Members show up right in the main **Users** list, alongside admin staff - see [Managing users](Managing-users) for how that combined list works. Every member is automatically given a system **Members** role the moment they register, so they carry a role badge in that list the same way staff do (it's just for show - it doesn't grant any admin permissions, since members never touch the admin area).
- The **Users** page keeps two extra tabs when Members is switched on:
  - **Pending Approval** - the queue when registration mode is set to Approval required.
  - **Invites** - generate and revoke invite links.
- A **member detail page** for each person (click their row in Users) - edit their profile, suspend or approve them, mark them as trusted, revoke their sign-in sessions, reset their password and two-factor setup, trigger a data export on their behalf, leave internal notes, and see a full history of admin actions taken on their account. This is also where you suspend/approve/trust/delete an individual member - the old bulk multi-select list is gone now that Members lives inside the combined Users table.
- Your **Settings** page gains:
  - A **GDPR & Legal** section covering consent records, data export requests, and pending deletions, all in one place.
  - A **Users** tab holding **Registration**, **Avatars**, **Usernames**, **Account sections** and **Access control** (all the member settings covered on this page), plus **Roles** (who can do what - see [Managing users](Managing-users)) and **Email templates** - customise the wording of every email members receive (welcome, verification, security alerts, and so on), with a merge-tag list and a test-send button. Reset any template back to the default whenever you like.

---

## Making the whole site members-only

**Settings → Users → Access control → Site-wide members-only mode** locks your entire public site behind sign-in - visitors must be a member to see anything. You can list specific pages as exceptions (for example, your homepage or a "why join" page), and admins always get through regardless.

If you'd rather show a locked-down preview to guests instead of blocking them outright, turn on **Guest preview** as well.

Individual modules can also mark specific pages as members-only (or "trusted members only") independently of this site-wide switch - check that module's own wiki page for details.

---

## Member area address

By default, members reach their account area at `/account` (e.g. `yoursite.com/account/login`). You can change this to something else via the `MEMBER_AREA_PATH` environment variable - see [Configuration reference](Configuration-reference). Like the admin path, this is set at deploy time, not from within the admin, and changing it requires a redeploy.

---

**Wiki:** [Home](Home) · [Managing users](Managing-users) · [Managing pages](Managing-pages) · [Configuration reference](Configuration-reference) · [Architecture overview](Architecture-overview)
