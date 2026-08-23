# Abandoned Carts

Shows you the baskets nobody finished, and what the shopper had typed into the checkout before they went.

Every unfinished basket lands on a tab in **Trading**, with what was in it, roughly what it was worth, and whatever they got as far as filling in: name, email, phone, delivery address, discount code, chosen payment method. Optional reminder emails go to the ones who left an address.

The whole thing waits on your cookie banner. No agreement, nothing recorded.

- **Module:** `abandoned-carts-for-shop` ([repository](https://github.com/cactus-foundation-modules/abandoned-carts-for-shop))
- **Needs:** Cactus 0.5.1234 or newer, and the Shop module 0.1.300 or newer
- **Tables:** `abc_carts`, `abc_suppressions`, `abc_settings`

---

## What you get

### The list

**Trading › Abandoned baskets**, alongside Orders and (if you have it) Quotes. One row per shopper, newest activity first.

| Column | What it tells you |
| --- | --- |
| Shopper | Their name, or their email, or "Nothing typed yet" |
| Stage | Basket only, Checkout started, or Came back (with the order number) |
| Items | How many things were in it |
| Worth | Roughly what it would have been, at today's prices |
| Last seen | How long ago they touched it, and when that was |

Open a row and it unfolds into three columns: what they typed, what was in the basket, and the history of it - first seen, reached checkout, last reminded, ordered.

The filter above the table narrows to baskets that never reached the checkout, checkouts somebody started, or the ones that came back. "Came back" is the number worth watching: it is the module telling you what it is actually worth.

### Reminders

Off until you switch them on. When you do, an hourly job looks for baskets that have been sitting untouched for longer than the wait you set, where the shopper left an email address.

It will not email somebody who has since ordered - the order list gets the final word on that, not the browser. It will not email somebody who has asked you to stop, ever again, even after the basket itself has been deleted. And it will not send more reminders per basket than you allow, which is capped at three whatever you type.

The wording lives with every other email on the site, under **Settings › Emails › Abandoned baskets**. Change it as you like, but the unsubscribe link is a required part of it and saving without it is refused.

### The permission box in the checkout

Switch the reminders on and you are offered one more thing: a tickbox in your checkout, so a shopper can say no before you have emailed them at all.

It sits under the boxes a shopper has to tick, it is never compulsory, and it never holds an order up. It reads **"Don't email me about offers and similar products."** until you word it differently. Tick it and no reminder goes out on that basket; untick it and the basket is back where it was. A basket somebody has ticked it on says "No emails, please" in the list, so you are not left guessing why one was never chased.

The box is one of the shop's own checkout tickboxes rather than anything new: the shop already lets you add, word and delete those, so switching this on writes the box into that list and switching it off takes it out again. Two consequences worth knowing:

- It appears on **Settings › Shop › Checkout** alongside your own tickboxes. Re-word it there or here, as you prefer, and delete it there if you would rather not have it - the panel here will then tell you the box is missing rather than letting you believe shoppers are being asked.
- Removing the module drops its own tables but cannot reach into the shop's settings, so the tickbox stays behind until you delete it there.

Switching the reminders off, or the module off, takes the box out of the checkout with them: a permission question about emails nobody is sending is just another line in somebody's checkout.

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

**No banner means no gate.** If your cookie banner is switched off, or carries no Marketing category, there is nothing for a shopper to agree to, and capture runs for everybody. The settings panel says so in red. That is your decision to make, and your exposure if you make it carelessly.

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
| Add an email permission box to the checkout | Off | Only offered once the reminders are on. Adds the tickbox described above. |
| What the box says | "Don't email me about offers and similar products." | Up to 200 characters. Blank restores the wording we ship with. |

## Permissions

| Key | Grants |
| --- | --- |
| `abandonedcarts.access` | Seeing the list and opening a basket |
| `abandonedcarts.manage` | Changing the settings and deleting a basket |

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

---

## Troubleshooting

**The list is empty.** Either nobody has agreed to Marketing cookies, or the tracker block has been deleted from the header layout, or the master switch is off. The settings panel tells you which of the first and third applies; the layout editor tells you about the second.

**No reminders are going out.** Check in this order: reminders switched on, an email provider configured on the site, `SITE_URL` set, the wait elapsed, and the basket having an email address on it at all. A basket whose every product has since been deleted is skipped rather than sent as an empty list.

**The permission box is not in my checkout.** It is on the shop's own tickbox list, and anything on that list can be deleted there. Open **Settings › Shop › Abandoned baskets** and save the page again to put it back. The panel warns you about this on its own, so you should not have to go looking.

**Somebody unsubscribed - what happened?** The link in the email does two things at once: it stops that address getting basket reminders for good, and it marks their baskets the same way ticking the permission box in the checkout would. So the list says "No emails, please" against them, rather than leaving you wondering why the second reminder never went.

**Someone says they unsubscribed and still got one.** They cannot have, from this: suppression is by address and is checked in the query that picks what to send. Check whether the email they received was an order confirmation, which is not a reminder and cannot be unsubscribed from.

**The figures do not match takings.** They are not meant to. The "Worth" column is today's catalogue price times quantity, with no delivery, tax or discount in it - the only honest total for an order nobody placed is a rough one.
