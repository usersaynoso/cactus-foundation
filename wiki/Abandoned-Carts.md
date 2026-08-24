# Abandoned Carts

Shows you the baskets nobody finished, and what the shopper had typed into the checkout before they went.

Every unfinished basket lands on a tab in **Trading**, with what was in it, roughly what it was worth, and whatever they got as far as filling in: name, email, phone, delivery address, discount code, chosen payment method. Optional reminder emails go to the ones who left an address, and the list says of each basket whether one went, when, and if not, why not.

The whole thing waits on your cookie banner. No agreement, nothing recorded.

- **Module:** `abandoned-carts-for-shop` ([repository](https://github.com/cactus-foundation-modules/abandoned-carts-for-shop))
- **Needs:** Cactus 0.5.1234 or newer, and the Shop module 0.1.300 or newer
- **Tables:** `abc_carts`, `abc_suppressions`, `abc_settings`, `abc_reminder_log`, `abc_job_runs`

---

## What you get

### The list

**Trading › Abandoned baskets**, alongside Orders and (if you have it) Quotes. One row per shopper, newest activity first.

| Column | What it tells you |
| --- | --- |
| Shopper | Their name, their email and their phone number, or "Nothing typed yet" |
| Stage | Basket only, Checkout started, Abandoned, or Came back (with a link to the order) |
| Items | How many things were in it |
| Worth | Roughly what it would have been, at today's prices |
| Reminder | Whether one has been sent, when, and if not, why not |
| Last seen | How long ago they touched it, and when that was |

Open a row and it unfolds into four columns: what they typed, what was in the basket, what happened to it, and every reminder ever tried on it.

### The figures across the top

Five of them, covering the whole shop rather than whatever the list is currently filtered to - so they are numbers you can quote in a meeting rather than numbers that change when somebody searches for a customer.

| Tile | What it counts |
| --- | --- |
| Left behind | What all the unfinished baskets are worth, and how many there are |
| Got as far as checkout | The ones where somebody started filling the checkout in. Click it to see only those |
| Came back | The share of the last month's baskets that ended in an order, and what those were worth |
| Reminders, 30 days | How many went out |
| Would not send | How many failed. Click it to see them |

Under the tiles is one line saying when the hourly tidy-up last ran and what it did. It is there because a job that has quietly stopped running looks exactly like a shop where nothing happens to be due, and an owner can otherwise wait a fortnight for emails that were never going to go. If it says the job has not run yet and it is still saying that tomorrow, something is stopping it.

### Finding the one you want

Search covers name, email, phone, postcode, company, discount code and order number. Underneath it you can narrow by:

- **When** it was last touched - the last day, week, month or three months, or between two dates of your choosing.
- **Whether they left an email address**, which is the difference between a basket you can do something about and one you can only count.
- **Whether they have been reminded** - never, already, a reminder that would not send, or the ones that can never be emailed at all because they unsubscribed, ticked the box or never typed an address.
- **How the payment ended** - sent off to pay and never came back, or refused.
- **What it was worth**, from a figure you type.

Sort by newest, oldest, worth or number of items, either from the menu or by clicking the column heading. Every combination of all of that is in the address bar, so a filtered list is a link you can send somebody, and the back button behaves.

**Export CSV** hands you exactly what the screen is showing, filters and all, up to 5,000 baskets - and if there were more than that, the file says so on the last line rather than pretending. It carries a **may_we_email** column spelling out, in words, whether each person on it can be written to. That column is the point of the file: the most likely thing anybody does with a spreadsheet of email addresses is paste them into something that sends emails.

### Doing something about one

- **Remind** sends that shopper their reminder now, rather than in four hours. It is for the basket worth chasing today. It refuses exactly what the automatic run refuses - an unsubscribe, a ticked permission box, no address, an empty basket, or a shopper who has already ordered - and it tells you which. It will go past your "reminders per basket" setting if you insist, because that cap is there to stop a machine pestering somebody unattended, but it stops dead at five.
- **Write to them yourself** opens your own mail program with their address in it, for when a reminder is not the right letter.
- **Delete** removes the basket and everything the shopper typed, along with the record of anything sent about it. Tick several and delete the lot in one go.

There is deliberately no "remind all of these". Emailing forty strangers at once from a button nobody had to think about is how a shop ends up on a blocklist.

### Who has asked you to stop

The **Unsubscribes** button at the top lists every address that has used the link at the bottom of a reminder, and when. Nothing goes to any of them again, whatever baskets they leave in future.

You can put an address back on the list, for the shopper who writes in asking or the test address you unsubscribed while setting the thing up. It does not undo a "don't email me" ticked in the checkout - that was the shopper's own answer to a question you asked them, and it is not yours to reverse.

### Reminders

Off until you switch them on. When you do, an hourly job looks for baskets that have been sitting untouched for longer than the wait you set, where the shopper left an email address.

It will not email somebody who has since ordered - the order list gets the final word on that, not the browser. It will not email somebody who has asked you to stop, ever again, even after the basket itself has been deleted. And it will not send more reminders per basket than you allow, which is capped at three whatever you type.

The wording lives with every other email on the site, under **Settings › Emails › Abandoned baskets**. Change it as you like, but the unsubscribe link is a required part of it and saving without it is refused.

#### Whether it actually went

Every attempt is written down, sent or not, and shown in the **Reminder** column:

| It says | It means |
| --- | --- |
| **Sent** | It went, on the date shown. A second line says how many have gone in all, and who sent one by hand if anybody did |
| **Did not send** | We tried and it would not go, with the reason - usually no email provider set up, or no web address for the site |
| **Will not be sent** | Deliberate. They unsubscribed, ticked the box, left no address, or the basket is empty |
| **Due** | Nothing yet, and the next one is owed at the time shown |
| **Not needed** | They came back and ordered |
| **Not sent** | The reminders are switched off |

Open a basket and the **Reminders** column lists the lot in order, with the subject line each one carried and who sent it. That history is deleted along with the basket when retention comes round, because it holds the same email address.

#### When they actually go out

The waiting time you set is the earliest a reminder may go, not the moment it goes. Reminders are sent by a check that runs **once an hour, on the hour** - so the real wait is your number plus up to an hour on top. Set fifteen minutes and a basket abandoned at 09:10 is emailed at 10:00; set four hours and the same basket is emailed at 14:00. Anything under an hour behaves much like an hour.

The settings page says this in plain terms, and works the example out from whatever number you have actually typed rather than leaving you to do the arithmetic.

On a basic hosting plan the check runs once a day instead of once an hour, and reminders land on the next day's check.

**Before the first check has ever run**, the settings page says so outright rather than describing a schedule that is not yet happening - a site whose check has never fired looks exactly like a site where nothing was ever due, and the difference matters. It reads the same record as the line under the baskets list, so the two screens never disagree.

### The permission box in the checkout

Switch the reminders on and you are offered one more thing: a tickbox in your checkout, so a shopper can say no before you have emailed them at all.

It sits directly under the email box on the contact step, which is the only place it reads as a question rather than as small print, and it appears once the shopper has typed an address - asking whether somebody minds being emailed is unanswerable before there is somebody to email. It is never compulsory and never holds an order up. It reads **"Don't email me about offers and similar products."** until you word it differently. Tick it and no reminder goes out on that basket; untick it and the basket is back where it was. A basket somebody has ticked it on says "No emails, please" in the list, so you are not left guessing why one was never chased.

The box is drawn by the add-on, not by the shop, so a shop without this module installed has exactly the checkout it always had - and removing the module takes the box with it.

Switching the reminders off, or the module off, takes the box out of the checkout too: a permission question about emails nobody is sending is just another line in somebody's checkout.

### Why the basket stopped

Card and bank payments on a Cactus shop write no order at all until the money is committed - which is right, and which used to leave this list unable to tell a refused card from somebody who closed the tab in the aisle. It can now, because the checkout says both out loud as they happen:

- **"Tried to pay, refused"** - they pressed *Place order* and the payment came back refused. The refusal is kept in the words the shopper was shown, so you are reading what they read rather than a code. These are the baskets most worth a reminder: they wanted it enough to reach for a card.
- **"Sent to pay, never came back"** - they pressed *Place order*, were handed over to their bank or a card page, and that was the last of them. Nothing failed as far as anybody knows; they simply never finished.
- Neither line means anybody was charged. If the money had moved there would be an order, and the basket would read "Came back" instead.

Open a basket and the history spells it out with the time on it. A shopper who tries again after a refusal replaces the refusal with the new attempt, which is what actually happened.

### Deleting itself

Everything older than your retention setting is deleted by the same hourly job - reminded, recovered or neither. This runs whether or not the reminders are switched on. You can also delete any single basket from the list.

---

## Consent

This module holds a name, an address and a phone number belonging to somebody who never placed an order. It is therefore built to record nothing until it is allowed to.

**It uses the standard Marketing category.** Not one of its own: keeping an unfinished basket in order to chase it is marketing on any reading of it, and a site with a cookie banner already has that switch. The module offers the category as a one-click suggestion on **Settings › Privacy**.

**Nothing happens before consent.** No cookie, no basket, no typed details. A shopper who has not answered the banner counts as not having agreed - the same as a refusal.

**Withdrawal means deletion.** A shopper who turns Marketing off has every row of theirs deleted and the cookie identifying their browser cleared, immediately, without waiting for a job to run.

**The gate is enforced twice.** Once in the browser, and again on the server, where a request written by hand cannot slip past it.

**No banner means nothing recorded.** If your cookie banner is switched off, or carries no Marketing category, there is nothing for a shopper to agree to - so nothing is recorded at all. The module sits there switched on and idle, and the settings panel tells you exactly which switch is missing and where to find it. It does not fall back to recording everybody: a shopper who was never asked has not agreed, and what would be stored is a name, an address and a phone number belonging to somebody who never placed an order.

**Every reminder carries a way out.** The unsubscribe link opens a page with a button on it rather than unsubscribing on the spot - mail scanners follow every link in an email, and one that acts on being fetched unsubscribes people who never asked. The suppression outlives the basket.

**Subject access requests are covered.** A signed-in member's unfinished baskets are included in their own data export.

### The one cookie

`cactus_ac_visitor` - a random id, set only after consent, readable only by the server, kept for 30 days. Nothing in it is derived from the shopper: no fingerprint, no address, no hashed email. Clear it and you are a new visitor with no way back to the old one.

---

## Settings

**Settings › Shop › Abandoned baskets.**

| Setting | Default | What it does |
| --- | --- | --- |
| Keep unfinished baskets | On | The master switch. Off records nothing and sends nothing. |
| Include baskets that never reached the checkout | On | Off keeps only the ones where somebody started filling the checkout in - far fewer, and every one with a name on it. |
| Counts as abandoned after | 60 minutes | Minutes of nothing happening. Drives the "Abandoned" badge and the earliest a reminder may go. |
| Delete baskets after | 90 days | Retention, 1 to 365. |
| Email a reminder | Off | The reminders. |
| Wait before the reminder | 240 minutes | Since they last touched the basket. |
| Reminders per basket | 1 | Capped at 3. |
| Add an email permission box to the checkout | Off | Only offered once the reminders are on. Adds the tickbox described above, under the email box. |
| What the box says | "Don't email me about offers and similar products." | Up to 200 characters. Blank restores the wording we ship with. |

## Permissions

| Key | Grants |
| --- | --- |
| `abandonedcarts.access` | Seeing the list and opening a basket |
| `abandonedcarts.manage` | Changing the settings, sending a reminder by hand, deleting baskets, putting an address back on the list |

Shop's own permissions grant neither. Whoever may edit the catalogue is not automatically somebody who should be reading every shopper's address; an owner who wants both grants both keys.

---

## How it works

### The tracker block

Installing the module drops an invisible **Abandoned basket tracker** block onto your header layout. It draws nothing. It watches the basket and the checkout boxes, and reports them on a short delay, plus once more as the page is being closed - which is the report that matters, since somebody shutting a tab mid-checkout is the definition of the thing.

If you delete the block, capture stops. Add it back from the block list on any header or footer layout. Two copies do no harm; only one of them does the work.

### Why a block rather than a hook in the shop

The shop's basket lives in the browser and nowhere else until an order is placed, so there is no moment on the server to hook into. The alternative was asking the Shop module to grow a reporting seam - new code and a slightly heavier checkout on every site running the shop, including the many that will never install this. So this module reads what the shop already publishes to the page and asks the shop for nothing. A site running the shop without this installed has exactly the shop it had before.

The trade-off, stated plainly: it reads two of the shop's own browser storage keys, and a future shop release could rename them. Everything is written so that an unreadable value reads as "nothing in the basket" - capture stops, the shopper's checkout carries on working. Written against shop 0.1.305.

### What counts as what

A basket becomes a **checkout** the moment anything is typed into a checkout box - email, name, phone, or an address line. It never goes back: somebody who reached the checkout and then wandered off for one more item is still a checkout abandonment.

Details are kept rather than overwritten with blanks. A shopper who steps back to the basket page has an empty checkout form for a moment, and losing the email they typed two minutes earlier over a page they walked past would defeat the object.

### When a basket is "recovered"

Two things close a row, and it takes only one of them:

1. The confirmation page announces the sale, and the browser that left the basket says so.
2. The reminder job checks the order list before writing to anybody, and finds an order under that address since the basket was left.

The second exists because the first depends on the shopper still being in the browser that left the basket, and a payment finished on a phone or a tab closed on the redirect back is neither rare nor their fault.

### The hourly job

`/api/m/abandoned-carts-for-shop/cron/reminders`, registered automatically. It purges first, then sends at most 200 reminders per run. On Vercel's Hobby plan crons run once a day whatever the schedule says, which still purges and still reminds - just later.

Each run is written down - when it went, how long it took, what it purged, sent, skipped and failed - and the last hundred are kept. That is what the line under the figures reads from. A run that did nothing because the reminders are switched off is still recorded, on purpose: an owner needs to be able to tell "nothing was due" apart from "nothing is running".

---

## Troubleshooting

**The list is empty.** Either your banner has no Marketing switch for anyone to agree to, or nobody has agreed to it yet, or the tracker block has been deleted from the header layout, or the master switch is off. The settings panel tells you about all of those except the layout, and the layout editor tells you about that one.

**No reminders are going out.** Start with the **Reminder** column, which now says why for each basket, and the line under the figures, which says whether the job that sends them is running at all. If it is running and the column says "Did not send", the reason is on the row. If nothing is running, check that the site has been live for more than an hour and that its scheduled jobs are set up. Otherwise, in order: reminders switched on, an email provider configured on the site, `SITE_URL` set, the wait elapsed, and the basket having an email address on it at all. A basket whose every product has since been deleted is skipped rather than sent as an empty list.

**The permission box is not in my checkout.** Check three things: the reminders are switched on, the box itself is switched on under them, and the shop is on **0.1.309** or newer - the box is mounted on a fitting the shop only grew in that version, so an older shop simply has nowhere to put it. The box also stays hidden until the shopper has typed an email address.

**Why can I not email this person?** Open the basket. The Reminders column says which of the four it is: they unsubscribed, they ticked the box in the checkout, they never typed an address, or the basket has nothing left in it. The **Cannot be emailed** filter shows you all of them at once.

**Somebody unsubscribed - what happened?** The link in the email does two things at once: it stops that address getting basket reminders for good, and it marks their baskets the same way ticking the permission box in the checkout would. So the list says "No emails, please" against them, rather than leaving you wondering why the second reminder never went.

**Someone says they unsubscribed and still got one.** They cannot have, from this: suppression is by address and is checked in the query that picks what to send. Check whether the email they received was an order confirmation, which is not a reminder and cannot be unsubscribed from.

**The figures do not match takings.** They are not meant to. The "Worth" column is today's catalogue price times quantity, with no delivery, tax or discount in it - the only honest total for an order nobody placed is a rough one.
