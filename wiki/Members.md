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

Members can sign in three ways, and each one has its own setting (**Settings → Users → Access control**):

- **Passkey** - fingerprint, face unlock, or a security key. The quickest and most secure option. **Optional** by default.
- **Email sign-in link** - a one-time link emailed to them. No password to remember. **Optional** by default, and it's what a brand-new member uses the very first time, before they've set anything else up.
- **Password** - the traditional option, **off** by default. If you turn it on, members must also set up a second sign-in step (an email code or an authenticator app) - a password alone is never enough.

### Off, Optional, Required

Each method is one of three things:

- **Off** - never offered to anybody.
- **Optional** - offered, and members set it up if they fancy it. This is how the site has always behaved.
- **Required** - every member must have it. They're walked through setting it up on their way in, and nothing else in their account opens until they have.

The email sign-in link has no **Required** option, and that's deliberate rather than an oversight: there's nothing for a member to set up. Their inbox is the credential, and they proved they have it when they verified their address.

Setting **Password** to Required also puts a password box on the sign-up form, so new members choose one as they join. The second step can't be done until they're actually signed in, so they're asked for that the first time they arrive.

With **Password** set to Optional the sign-up form offers a password box too, which you can turn off with **Ask new members to set a password** under [Registration](#shortening-the-sign-up-form). Passwords stay available either way - members just add one from their own Security page rather than being asked for one before they've so much as looked round.

Members can still add a passkey, set a password, or turn on the extra sign-in step for themselves from their own account's **Security** page - you don't need to do anything per-member. What they can't do is remove something you've marked Required; the site says so plainly rather than letting them delete it and immediately asking for it back.

### A word of caution about the sign-in link

Turning the **email sign-in link** off is the one setting that can strand people. Passkeys and passwords are both set up from inside an account, and a member who has only just registered can't get inside one yet - so with the link off, a brand-new member has nothing they can use. Existing members with a passkey or a password carry on perfectly happily. The settings page says as much when you switch it off, and refuses outright to save with all three methods off, which would lock the doors on everybody.

### What the sign-in form actually shows

It asks for the email address first, and nothing else. Once they press **Continue**, it offers only the ways that particular account can sign in:

- Added a passkey? They get the passkey button, offered first.
- Set a password? They get the password button.
- Done neither - which is everyone on day one - the sign-in link is simply sent there and then, and they're told to check their inbox. No second button to press, because there was only ever one thing they could have pressed.

The sign-in link is offered to everybody, since it's the one method that always works. Nobody is shown a button that could only ever fail, and nobody has to remember which of three things they set up last spring. There's a "use a different email address" link underneath - on the choice of methods and on the "check your inbox" message alike - for the inevitable typo.

If the site can't reach its own settings for a moment - a wobbly connection at their end - the form quietly offers every method you've switched on rather than hiding one, so a passkey holder is never stuck looking at a form that won't take their passkey.

### Sign-in codes by text message

If a text-message module (such as [Twilio](Twilio)) is installed and configured, members using a password can have their sign-in codes texted to a mobile number instead of emailed. **Settings → Users → Access control → Mobile number for sign-in codes** controls whether that's their choice:

- **Optional** (the default) - members may add a mobile number from their account page if they fancy it.
- **Required** - members with a password must add one. Anyone who hasn't yet is still let in with an email code (nobody gets locked out), but they're taken straight to the add-your-number card after signing in and reminded on every account page until it's done.

Without a text-message module installed, the setting quietly does nothing - there's no way to send the texts.

### Putting a sign-in button on your site

Knowing how people sign in is no use if they can't find where. The **Members: Sign In** block is the one control you drop into a header, a footer bar, or any page, and it looks after the rest.

Find it in the page builder under **Members**, or in the header editor under **Site**. It's built to sit happily next to a shop basket icon, so a header with both doesn't look like two people designed it.

**What it looks like**

- **Icon** - a person, a person in a circle, a padlock, a key, an arrow through a door, or no icon at all.
- **Text label** - "Sign in" by default. Clear the box and you get a bare icon, the way the basket does it.
- **Style** - a bordered pill, a filled block, or plain text with no box, plus colours and corner rounding to match your header.

**What happens when someone clicks it**

- **Go to the sign-in page** - the ordinary route. They're brought back to the page they were reading once they're in.
- **Open a sign-in panel over the page** - the form floats over whatever they were looking at, so they never lose their place. It's the same sign-in form as the real page, so passkeys, sign-in links, passwords and codes all behave identically. You can set the panel's heading, its width, its corner rounding, and whether it offers a "create an account" link underneath. That link stays hidden if you've set registration to invite-only, since there'd be nothing behind it.

You can also name a specific page to send people to after they sign in. Leave it blank and they simply carry on from where they were.

**Once they're signed in**

The block doesn't just sit there saying "Sign in" at someone who already has. Choose whether it becomes an account link, an account link with a sign-out button beside it, or nothing at all. It can show the member's own picture in place of the icon, and it takes itself off the sign-in page entirely, on the grounds that the form is already right there.

**Trying it out first**

Set **Who can see this** to **Admins only** and the block appears for you and nobody else while you're signed into the admin. Handy for having a look at it on the real site before your visitors do. Set it back to **Everyone** when you're happy.

The block only appears on your site at all when members are switched on. Turn members off and it politely vanishes rather than offering a door to nowhere.

---

## Registration modes

**Settings → Users → Registration** controls who can sign up:

- **Open** - anyone can register.
- **Invite only** - people need an invite link, which you generate from **Users → Invites**. Each invite can be used once and expires after however many days you set.
- **Approval required** - anyone can register, but their account waits in a queue (**Users → Pending Approval**) until an admin approves it.

You can also require email verification before an account becomes active (on by default), and restrict registration to specific email domains or block specific ones.

### Shortening the sign-up form

The sign-up form asks for an email address, a username and an optional display name, plus a password if you offer them. All but the email address can go:

- **Ask new members to choose a username** - turn it off and the box disappears. Cactus makes one up from their email address instead, with a few random digits after it, so `chris@example.com` becomes something like `chris4821`. They can still change it later if you allow username changes.
- **Ask new members for a display name** - turn it off and the optional display-name box disappears too.
- **Ask new members to set a password** - turn it off and signing up asks for nothing to remember. This one only appears while passwords are set to optional: with passwords off there is nothing to ask about, and with them required the form has to ask.

Turning the password box off doesn't take passwords away. Members can add one whenever they like from **Security** in their account, which is where they'd set up the short code that goes with it anyway. It's often the kinder order of events: signing up takes one box and a click on an emailed link, and the password conversation waits until they've decided they're staying.

Hiding a box genuinely removes it rather than tucking it out of sight, so nobody can fill it in by being clever with the form.

### When the verification email doesn't send

If your site's outgoing email is misconfigured, the account is still created, and the person signing up is told plainly that the email couldn't be sent rather than being parked on a page waiting for a link that will never arrive. The reason lands in your deployment logs. The quickest way to see it for yourself is **Settings → Configuration → Email → Send test email**, which reports whatever your mail provider said back. A common culprit is a **from** address your mail provider doesn't consider yours: most of them, iCloud especially, refuse to send on behalf of an address that isn't the account you're signing in as or one of its verified aliases.

A registration link can arrive with the email address already filled in - add `?email=someone@example.com` to the sign-up link and the box starts with it typed. It's a convenience, nothing more: the address is still theirs to change, and it still has to be verified. The [Shop](Shop)'s post-purchase "create an account" prompt does the same thing without the link: it puts the sign-up form on the order confirmation itself, already holding the address they ordered with, so the order they just placed joins the new account.

### The "check your inbox" page

Once they've signed up, people wait on a page that names the address the link went to and offers a **Send it again** button, limited to one send a minute so your mail provider stays friendly.

That minute is counted from the moment they arrive, because the link they're waiting for has only just gone out. Offering the button straight away was worse than useless: the site quietly declines to send a second link within a minute of the first, so an eager click reported success and did nothing at all - which looks exactly like email being broken when it isn't.

It shows that address as plain text rather than in an editable box. Re-sending is the only thing the page can do, so a box invited people to "correct" a typo there, and the correction would have gone quietly nowhere while still looking like it had worked.

For a genuine typo the page offers a **sign up again** link instead, which is the only real fix - the half-finished account left behind stays unverified and out of everyone's way. That link is hidden on invite-only sites, where signing up again would need an invite they haven't got.

Someone arriving at that page cold, from a bookmark or a link they dug up weeks later, is asked for their address instead, since nothing in the link says whose account it is.

### When they click the link in the email

Clicking the link verifies the address and takes them straight on to their account area, rather than leaving them on a page whose entire remaining purpose was to be left. If they aren't signed in yet, that's the sign-in page, which is the next thing they need.

The good news travels with them: **Your email is verified. You can now sign in.** appears as a small pill at the top of the page they land on, and takes itself away after a few seconds. On sites where new accounts wait for approval it says so instead, so nobody stands at a sign-in form wondering why their new password isn't working yet.

A link that has expired, or has already been used, still says so on the verification page itself, with the **Send it again** button underneath - that's a page with something left to do on it.

---

## The member account area

Once signed in, members land on an **overview** page that tries to answer the obvious questions before they have to go looking: who they're signed in as, when they joined, whether their email address still needs confirming (with a button to send the link again), how their sign-in is set up, what's still blank on their profile, and the last few things that happened on their account. Everything else lives behind the tabs above it, which you can individually switch on or off (**Settings → Users → Account sections**):

- **Profile** - display name, bio, website, avatar (uploaded photo, Gravatar, or automatically generated initials), and which of these show up on their public profile. The website box only accepts an ordinary web address beginning `http://` or `https://`, since that box becomes a real link on a public page and anything else there is either a mistake or somebody being clever. The same applies when an admin edits a member's website on their behalf, and an address saved before that rule existed simply stops being rendered as a link.
- **Security** - passkeys, password, two-factor authentication, active sessions, and trusted browsers.
- **Notifications** - email preferences for anything your installed modules notify members about.
- **Activity** - a simple history of their sign-ins and other account activity.
- **Danger Zone** - requesting a copy of their data, or deleting their account.

Installed modules can add tabs of their own here. With the Shop installed, members get **Orders** and **Addresses** alongside the built-in ones, and those pages sit inside the account with the same tabs across the top rather than dumping people on a bare page with no way back - see [Shop](Shop#customer-accounts).

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
  - A **Users** tab holding **Registration**, **Avatars**, **Usernames**, **Account sections** and **Access control** (all the member settings covered on this page), plus **Roles** (who can do what - see [Managing users](Managing-users)). The wording of member emails is no longer edited here: it lives on **Settings → Email → Templates** with every other email the site sends - see [Configuration reference](Configuration-reference#templates).

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
