# Contact form

Most sites need one thing above all else: a way for someone to get in touch without having to think about it. The **contact form** module adds a form you can drop onto any page, and an inbox in your admin area where everything that comes through it lands.

Messages stay on your own site rather than scattering into whatever mailbox you happen to use that week. You still get an email telling you something has arrived, but the conversation itself lives somewhere you can find it again.

---

## Adding a form to a page

Edit any page, and add the **Contact Form** block wherever you want it. That is the whole job. The form appears on the live page with the fields you have chosen, and anything submitted goes straight to your inbox.

You can put one on as many pages as you like. They all feed the same inbox.

---

## Choosing which fields to ask for

Nobody enjoys filling in a long form, so only two fields are fixed: **name** and **message**. Everything else is yours to turn on or off:

- **Phone** - show it or not, and if shown, decide whether it is required.
- **Company** - same again.
- **Subject** - same again.

You can also insist on a **first and last name** rather than accepting a single word, which cuts down on "hi" and "asdf" arriving in your inbox at three in the morning.

If you collect consent under GDPR, there is a tick box for that too, which you can switch on and word to suit yourself.

---

## The inbox

Everything that comes in appears under **Inbox** in your admin sidebar. Open a message and you get the full conversation in one place: what they sent, when, and every reply that has gone back.

You can:

- **Reply** directly from the message, without leaving the site.
- **Delete** a message you do not want to keep.
- **Export** your messages, if you want them somewhere else.

Each of those is a separate permission, so you can let someone answer enquiries without also letting them delete the lot. See [Managing users](Managing-users) for how permissions are handed out.

### Your signature

Each person who answers messages can set their own sign-off, so replies go out signed by whoever actually wrote them rather than by the site. It is stored against your own account, and the version used is kept with each reply - so editing your signature later does not quietly rewrite what you sent last month.

---

## Replies, and where they end up

When you reply from the inbox, your visitor gets an ordinary email. If they reply to that, it goes to your real mailbox, not back into Cactus, and the thread splits in half.

The [Reply Catcher](Reply-catcher) add-on solves exactly that. It watches your mailbox and threads the replies back onto the original conversation. It is optional, and the contact form works perfectly well without it.

---

## Keeping the spam down

Two things work away quietly in the background. There is a limit on how many messages can be sent from the same place in a given stretch of time, which stops the obvious flooding. And submissions are treated as untrusted text throughout.

That last point is worth a sentence. When a message is emailed to you, every word the visitor typed is escaped first, so nothing they submit can smuggle formatting, links or anything else into your notification. What you see is what they actually typed, punctuation and all - not something dressed up to look like it came from somewhere else.

---

## Tidying up old messages

Enquiries do not need keeping forever, and under data-protection rules they generally should not be. The module clears out messages older than the age you set, once a day, without you having to remember.

Set it to suit your own retention policy. If you would rather keep everything, you can.

---

## Where to look next

- [Reply Catcher](Reply-catcher) - threading real mailbox replies back into the inbox
- [Managing users](Managing-users) - who is allowed to read, answer and delete
- [Managing pages](Managing-pages) - adding the form block to a page
- [Modules](Modules) - installing and updating add-ons
