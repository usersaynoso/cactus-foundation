# Contact form

Most sites need one thing above all else: a way for someone to get in touch without having to think about it. The **contact form** module adds a form you can drop onto any page, and an inbox in your admin area where everything that comes through it lands.

> **Where it lives now.** Enquiries used to have an **Inbox** link of their own in the sidebar. They now sit on the shared **Inbox** screen, on a **Contact form** tab beside live chat if you have it. Old links still work - they just carry you to the tab.

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

## What visitors see when they get it wrong

The form no longer saves up its complaints until someone presses Send.

- **Email address** - if what they have typed is not a valid address, they are told as soon as they move on to the next field, rather than after they have finished the whole form.
- **Message** - a quiet grey note in the bottom corner of the message box counts them up to the ten characters the form asks for, and disappears once they get there. It is a nudge, not a telling-off. The proper warning in red only appears if they leave the message box still short, or press Send.

An empty field they have not touched yet says nothing at all. Tabbing straight through a blank form does not turn it red - that is what Send is for.

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

Under **Contact form > My Signature** you choose how you would like to write it. All three are kept side by side, so trying one and going back to another loses nothing.

**Rich text.** Type it. Bold, links, lists, and nothing to think about. This is what signatures have always been here, and it is still the right answer for most people.

**HTML.** Paste in the signature your organisation already uses - the one with the logo, the ruled line and the small print about the company number. Tables, inline styles, images and links all come through as written.

Two things are worth knowing. Anything that runs on its own is removed when you save: scripts, and image fallbacks written as `onerror`. That is not fussiness - this markup ends up in a customer's inbox rather than in your admin, and a signature has no business running anything. And any image has to be at a full web address, because an inbox has nowhere to look up a file sitting on your own machine.

**Page builder.** Build it out of the same blocks the email designs use - logo, text, two columns, a dividing line, social links. Handy if you want something smarter than plain text but would rather not write markup, and it picks up your site's own colours and font as it goes.

### Filling in your own details

Whichever kind you pick, your **Name**, **Job title** and **Phone number** live on the same screen, and they matter most for the HTML and page-builder kinds: an owner can hand the same signature design to everybody and let each person's own details drop into it. Write these placeholders where the details should go:

| Placeholder | What it becomes |
| --- | --- |
| `{{FULL_NAME}}` | Your name (or your account's display name, if you leave it blank) |
| `{{JOB_TITLE}}` | Your job title |
| `{{EMAIL}}` | Your email address, straight off your account |
| `{{PHONE_DISPLAY}}` | Your phone number as you would write it - `020 7946 0123` |
| `{{PHONE_E164}}` | The same number in the form a phone can dial - `+442079460123` |

The last two are a pair: use the tidy one where the number is read, and the dialling one behind a `tel:` link, so tapping it on a phone actually rings you.

A placeholder you have not filled in simply disappears rather than turning up in somebody's inbox as a set of curly brackets. There is a **Save and preview** button on the page that shows exactly what will be sent, with your details filled in.

---

## Replies, and where they end up

When you reply from the inbox, your visitor gets an ordinary email. If they reply to that, it goes to your real mailbox, not back into Cactus, and the thread splits in half.

### They look like the rest of your email now

The reply you type, and the automatic "thanks for getting in touch" if you have one switched on, both go out in your site's email design - the same logo, colours and footer as your other email. Nothing to set up: they use your site's default [email wrapper design](Configuration-reference#email-wrapper-designs), which is whichever published one sits highest in the priority order under **Layouts → Email Wrapper**. Change your mind later and your replies follow along. If you have not made one at all, they arrive as a tidy centred card rather than as bare text.

There is no picker for this on the contact form, and that is on purpose. The form's settings live on the block, so a picker there would let one form on one page disagree with another about what your email looks like. If you want replies to look different from your order emails, publish a second design and promote it - the same lever you already use everywhere else.

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
