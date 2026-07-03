# Reply Catcher

If you reply to a contact form message from the Cactus admin inbox, your visitor's reply-to lands wherever your own mailbox happens to live - Gmail, Outlook, iCloud, whatever you use day to day. Cactus never sees it, and the conversation splits in two: half in your admin inbox, half in your actual email.

**Reply Catcher** is an add-on for the [contact form module](Modules) that fixes this. Point it at your real mailbox once, and it quietly checks for replies (and for anything you sent by hand from your own email client) and matches them up to the right conversation.

It never changes anything in your mailbox - nothing gets marked read, moved, or deleted. It only reads. And it never changes anything about the contact form module itself - it keeps its own records alongside, so sites that don't install it carry none of this.

Because of that separation, matched replies are Reply Catcher's own records - but they still show up right where you'd expect: inline on the original conversation in the contact form's own inbox, tagged "Caught" so you know it came from your mailbox rather than Cactus. There's also a dedicated **Caught Replies** list - reachable via the button on the Contact Inbox page, next to "Edit My Signature" - for a quick scan of every conversation Reply Catcher has picked something up on.

---

## Before you start

Reply Catcher needs the contact form module installed first. If you try to install Reply Catcher without it, Cactus will tell you and stop.

---

## Setting it up

Go to **Settings → Reply Catcher** (a tab alongside your other site settings) once it's installed, and choose how it connects to your mailbox.

### Option A: IMAP with an app password (most providers, including iCloud)

Works with almost any mail provider - iCloud, Fastmail, most business hosting, and plenty more.

1. Generate an "app password" from your mail provider (search "[your provider] app password" if you're not sure where - Apple, for instance, has you do this at appleid.apple.com).
2. In Reply Catcher's settings, choose **IMAP + app password**.
3. Fill in your mailbox's IMAP host (your provider will list this - iCloud's is `imap.mail.me.com`), your email address, and the app password you just generated.
4. Save. Click **Check now** to confirm it connects.

### Option B: Outlook (OAuth)

Google's Gmail requires a lengthy, paid security review process to connect this way, so Gmail isn't supported yet. Outlook doesn't have that requirement, but it does ask you to register a small app of your own in Microsoft's Azure Portal - a one-off, five-minute job:

1. In Reply Catcher's settings, choose **Outlook (OAuth)** - you'll see a link straight to the right page in the Azure Portal.
2. Register a new app there, giving it the `IMAP.AccessAsUser.All` and `offline_access` permissions.
3. Copy the app's client ID and client secret back into Reply Catcher's settings, along with your Outlook mailbox address, and save.
4. Click **Connect Outlook** and sign in when prompted.

---

## Checking for replies

Reply Catcher checks your mailbox automatically once a day - that's a limit of the hosting plan Cactus runs on, not something we can speed up. If you don't want to wait, click **Check now** on the settings page for an on-the-spot check. To keep things polite to your mail provider, **Check now** has a one-minute cooldown between clicks.

The settings page always shows when it last checked and whether that went smoothly.

---

## What it catches (and what it doesn't)

Reply Catcher matches mail to a conversation by sender's email address and by comparing subject lines - it doesn't (and, by design, can't) reach into the contact form module to read its private threading details, so it's a best-effort match rather than a guarantee:

- A reply your visitor sends, from an address that matches a recent submission, with a subject that still resembles the original: caught, tagged "Caught" on the original conversation.
- A reply you send by hand, from your own mail app, to your visitor: also caught the same way, so nothing gets lost even if you didn't reply from the admin panel.
- A visitor who submits the contact form more than once in a short space of time, or who wildly changes the subject line before replying, may occasionally get matched to the wrong (or no) conversation. Check the matched thread looks right before treating it as gospel.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Configuration reference](Configuration-reference)
