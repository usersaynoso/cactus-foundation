# Quotes

Not every shop sells off the shelf. Some price every job on its own merits, some quote trade against list, and plenty simply have customers who want twelve of something and a figure in writing before they commit. A basket and a card machine are no use to any of them.

This module gives you quotes. You pick one of two ways to work, and you can change your mind whenever you like.

Requires the **Shop** module.

---

## The two ways to work

Both live in **Settings → Shop → Quotes**, under **How this shop sells**.

### Normal shop, plus save-a-basket (the default)

Nothing about your checkout changes. Shoppers can still buy exactly as they always could. What they gain is a **Save cart as a quote** button on the basket page: it hands them a short code, shows them their quote on screen, and lets them download it as a PDF. Any time later they type the code into **Retrieve quote** and their basket comes back.

This is the gentler of the two, and it is what you get on installing the module. It is worth having on a perfectly ordinary shop: people building a big order over several evenings stop losing it, and people who need somebody else's approval have something to show them.

### Quotes only

No checkout at all. Every **Add to basket** becomes **Add to quote**, the basket leads to your quote request page instead of the till, and `/shop/checkout` stops serving. Shoppers build a list, send it over, and you come back with a price.

You can also **withhold prices entirely** in this mode, so the shop shows your stand-in wording (**POA** unless you change it) everywhere a figure would have been - product pages, cards, the basket and the quote itself. Nothing is quoted until you have quoted it.

> **Worth reading twice:** while quotes-only is switched on, nobody can pay you through the website. That is the whole point of it, but it is not a small change, so the settings screen says so plainly before you choose it.

---

## What the shopper does

**Saving a basket.** They press the button, optionally give a name and an email, and get a code like `ACDE-FGHJ`. Their quote opens in a panel over the page - your own design, not ours - with a **Download as PDF** button pinned to the bottom of it. If they gave an email, the code and a link arrive there too.

**Getting it back.** The **Retrieve quote** button sits beside the "Your cart" heading. They type the code in, and their basket is put back as it was.

Their basket is **replaced**, not added to, and they are told so before they press it - adding an old basket on top of a new one produces something that is neither.

Prices are **today's**, and anything that has moved since they saved is spelled out: "Oak desk 1600mm is now £269.00 each (was £249.00)", "Task chair - out of stock, so it is not in your basket". A quote is a photograph of a moment, not a promise, and finding that out at the till is no way to learn it.

**Asking for a price.** In quotes-only mode the basket leads to your quote request page, where they check their list, adjust quantities, and send it with their name, email and anything they want to tell you. They get a reference, a code and a link to their own copy.

---

## What you do

Everything arrives under **Shop → Quotes**.

The list shows saved baskets and quote requests together - they are the same thing at different stages, and you want one answer to "what is outstanding?", not two lists to reconcile. Filter by status (New, Sent, Won, Lost, Expired) or by kind, and search by number, code, name, email or company.

Open one and you can:

- **Price it.** Change any quantity or unit price. On a shop that withholds prices, this is where the figures come from in the first place.
- **Write a reply.** It goes on the quote document and in the email. The customer reads this one.
- **Make internal notes.** The customer never sees these.
- **Send it.** Emails the customer their priced quote and a link to it. If the email cannot be sent you are told why, rather than being shown a tick and left to wonder.
- **Set where it got to.** New, Sent, Won, Lost.
- **Turn it into an order.** Creates a real, unpaid order in **Shop → Orders**, which then behaves like any other order you have ever had - statuses, dispatch emails, refunds, the lot.

You can also see whether the customer has actually opened their quote, and when.

### Turning a quote into an order

Two things a quote genuinely does not know, and both are handled honestly rather than guessed at:

- **There is no delivery address**, because nobody was asked for one. The order is created with the customer's name and empty address lines, and carries an internal note telling whoever picks it up to collect an address before dispatch.
- **There is no payment.** The order is created unpaid, set to bank transfer, which is how most quoted work is settled. Change it on the order if that is not you.

---

## Designing the quote itself

Under **Appearance → Layouts → Quotes** you get two designable layouts.

**Quote document** is the quote: what the shopper sees in the panel, what they see at their own web address, and what comes out of the PDF - all three from the one layout, so they can never disagree with each other. Five blocks to arrange as you like:

| Block | What it puts on the page |
|---|---|
| Quote: Heading | Your logo and name, the quote number, the code, the date and the expiry |
| Quote: Prepared for | Who it is for, and whatever they wrote when they asked |
| Quote: Items | The list, with optional pictures and product codes |
| Quote: Totals | Subtotal, any delivery or service charges, tax, total |
| Quote: Notes and terms | Your reply, the validity line and your terms |

Three starters come with it: **Standard quote** (published for you, so the feature works the moment you install it), **With pictures**, and **Just the list** for shops that would rather not print a total they have not agreed to.

**Quote request page** is where the checkout used to be. Two blocks - the shopper's list and the form - with a one-column and a two-column starter.

The wording that fills these in (heading, introduction, validity line, terms) lives in **Settings → Shop → Quotes**, so you are not editing a layout to change a sentence.

---

## Where the buttons go

By default, **Save cart as a quote** and **Retrieve quote** both sit on the basket page's heading row, to the right of "Your cart". They are there without you doing anything, because a button nobody can find is a button nobody presses.

If you would rather place them yourself - in the totals column, next to the checkout button, wherever - both are also page-builder blocks for the basket layout. Drop them where you want them and turn the automatic ones off in **Settings → Shop → Quotes**.

---

## Settings worth knowing about

| Setting | What it does |
|---|---|
| **How this shop sells** | Normal shop plus save-a-basket, or quotes only |
| **Withhold prices** | Quotes-only shops: show your stand-in wording instead of every figure |
| **A saved quote lasts this many days** | 90 by default; 0 means for ever. A lapsed quote still comes back when somebody types the code - the prices are today's either way - it is simply marked Expired on your list so you can see what is live |
| **Insist on an email address** | Off by default. The code is on screen with a copy button, so a shopper who would rather not hand over an address is not turned away |
| **Tell these addresses** | Who gets an email when a quote comes in. Blank uses the address your shop already alerts for orders |
| **Offer the quote as a PDF** | On by default. See below if your host cannot manage it |
| **Quote number prefix** | `QUO-` unless you would rather something else |

---

## The PDF, and when it will not work

The PDF is made by quietly opening your own quote page in a browser on the server and printing it. That is deliberate: it means the PDF is the layout you designed, so moving a block moves it on the paper too, and you never have two documents drifting apart.

It needs a browser available on the server. On a normal deployment one ships with the site and there is nothing to do. Two situations where it will not work:

- **Running the site on your own machine for development** - it uses whatever Chrome you already have installed, and says so plainly if you have none.
- **A site still behind a preview password** - the printer cannot get at your own pages either.

If the PDF cannot be made, the shopper is told the on-screen quote is still there, and nothing else breaks. You can also turn the button off entirely and let people print the page themselves.

---

## The code, and how private a quote is

The code is eight characters long and deliberately leaves out every character people mistake for another - no O or 0, no I, L or 1, no S or 5, no B or 8, no Z or 2. It survives being read off a phone, written on an envelope and dictated down a telephone.

The code **is** the key to that quote. It has to be: somebody who saved a basket without giving an email has no account to sign in to. So the codes are randomly generated, guessing at them is rate-limited, and quote pages are never indexed by search engines. All the same, a quote is somebody's name, list and prices, and the code is what stands between the two - treat it the way you would treat any other reference number you would rather not read out in a crowded room.

---

## What it never does

- **It never invents a price.** Every figure on a quote comes from your own catalogue and your own settings, through the same code that runs your checkout.
- **It never quietly honours a stale one.** Retrieving a basket reprices it and tells the shopper what has moved.
- **It never promises delivery or tax it cannot know.** Both depend on an address nobody has given, so the document says so in words rather than printing a zero and correcting it later.
- **It never deletes a quote.** Expiry is a label on your list, not a bin.
