# Quotes

Not every shop sells off the shelf. Some price every job on its own merits, some quote trade against list, and plenty simply have customers who want twelve of something and a figure in writing before they commit. A basket and a card machine are no use to any of them.

> **Where it lives now.** Quotes used to have a sidebar link of its own. It is now a **Quotes** tab on **Shop → Trading**, beside orders and returns. Old links still work.

This module gives you quotes. You pick one of two ways to work, and you can change your mind whenever you like.

Requires the **Shop** module.

---

## The two ways to work

Both live in **Settings → Shop → Quotes**, under **How this shop sells**.

### Normal shop, plus save-a-basket (the default)

Nothing about your checkout changes. Shoppers can still buy exactly as they always could. What they gain is a **Save basket as a quote** button on the basket page: it hands them a short code, shows them their quote on screen, and lets them download it as a PDF. Any time later they type the code into **Retrieve quote** and their basket comes back.

This is the gentler of the two, and it is what you get on installing the module. It is worth having on a perfectly ordinary shop: people building a big order over several evenings stop losing it, and people who need somebody else's approval have something to show them.

Nothing in this mode asks a shopper to request a price - there is a checkout, and that is what it is for. That now holds everywhere, including the Space Planner, which used to put an **Ask for a quote** button on every layout no matter how the shop sold. Its own switch under **Shop settings → Space Planner** still decides whether you want the button; this setting decides whether it is offered at all.

### Quotes only

No checkout at all. Every **Add to basket** becomes **Add to quote**, the basket leads to your quote request page instead of the till, and `/shop/checkout` stops serving. Shoppers build a list, send it over, and you come back with a price.

You can also **withhold prices entirely** in this mode, so the shop shows your stand-in wording (**POA** unless you change it) everywhere a figure would have been - product pages, cards, the basket and the quote itself. Nothing is quoted until you have quoted it.

> **Worth reading twice:** while quotes-only is switched on, nobody can pay you through the website. That is the whole point of it, but it is not a small change, so the settings screen says so plainly before you choose it.

---

## What the shopper does

**Saving a basket.** They press the button, optionally give a name and an email, and get a code like `ACDE-FGHJ`. Their quote opens in a panel over the page - your own design, not ours - with a **Download as PDF** button pinned to the bottom of it. If they gave an email, the code and a link arrive there too.

**Getting it back.** The **Retrieve quote** button sits beside the "Your basket" heading. They type the code in, and their basket is put back as it was.

Their basket is **replaced**, not added to, and they are told so before they press it - adding an old basket on top of a new one produces something that is neither.

Prices are **today's**, and anything that has moved since they saved is spelled out: "Oak desk 1600mm is now £269.00 each (was £249.00)", "Task chair - out of stock, so it is not in your basket". A quote is a photograph of a moment, not a promise, and finding that out at the till is no way to learn it.

**Asking for a price.** In quotes-only mode the basket leads to your quote request page, where they check their list, adjust quantities, and send it with their name, email and anything they want to tell you. They get a reference, a code and a link to their own copy.

---

## What you do

Everything arrives under **Shop → Quotes**.

The list shows saved baskets and quote requests together - they are the same thing at different stages, and you want one answer to "what is outstanding?", not two lists to reconcile. Filter by status (New, Sent, Won, Lost, Expired) or by kind, and search by number, code, name, email, company or their own reference. A code is found with or without its dash, so pasting one out of a link works. Past twenty-five, the list pages.

Open one and you can:

- **Price it.** Change any quantity or unit price. On a shop that withholds prices, this is where the figures come from in the first place.
- **Add or remove lines.** For everything the customer could not put in the basket themselves - installation, a delivery charge, a bespoke item - and for the one they have thought better of. The running total under the table shows the subtotal, the VAT and what they will actually pay as you type.
- **Correct the customer's details.** Name, company, their own reference, email, telephone. Somebody who parked a basket without leaving an email and then rang up is the whole reason this is here.
- **Change how long it stands.** The "valid until" date is yours to move - extending a quote by a month is the commonest thing anybody ever asks of one. Clear the date entirely for a quote that never lapses.
- **Write a reply.** It goes on the quote document and in the email. The customer reads this one.
- **Make internal notes.** The customer never sees these.
- **Send it.** Saves what you have typed, then emails the customer their priced quote and a link to it. If the email cannot be sent you are told why, rather than being shown a tick and left to wonder.
- **Set where it got to.** New, Sent, Won, Lost.
- **Turn it into an order.** Creates a real, unpaid order in **Shop → Trading**, which then behaves like any other order you have ever had - statuses, dispatch emails, refunds, the lot. Everything listed under a line on the quote - the chosen finish, the delivery service - goes across with it, so whoever picks it knows what they are picking.

You can also see whether the customer has actually opened their quote, and when.

> Nothing is saved until you press Save. If you wander off with prices half typed, your browser will ask whether you meant to.

### Turning a quote into an order

Two things a quote genuinely does not know, and both are handled honestly rather than guessed at:

- **There is no delivery address**, because nobody was asked for one. The order is created with the customer's name and empty address lines, and carries an internal note telling whoever picks it up to collect an address before dispatch.
- **There is no payment.** The order is created unpaid, set to bank transfer, which is how most quoted work is settled. Change it on the order if that is not you.

Their own reference goes across with it. If the shop asks for one - **Settings → Shop → Checkout → Their own order reference** - the box appears on the quote request form and on the quote screen, and whatever is in it lands on the order, and from there on the invoice. Nobody gets asked for the same number twice, which is one fewer place for it to be mistyped. It is always optional on a quote, whatever the checkout insists on, for the sensible reason that a purchase order is usually raised *after* a price has been agreed - demanding one up front would be asking for a number that does not exist yet.

---

## Designing the quote itself

Under **Appearance → Layouts → Quotes** you get two designable layouts.

**Quote document** is the quote: what the shopper sees in the panel, what they see at their own web address, and what comes out of the PDF - all three from the one layout, so they can never disagree with each other. Ten blocks to arrange as you like:

| Block | What it puts on the page |
|---|---|
| Quote: Document style | Nothing of its own. Sets the colours, the spacing and the rule thickness for every other block at once |
| Site Logo | Your letterhead. This one is not the quote module's block but the site's own, the same one your header uses |
| Quote: Heading | The heading, the quote number, the code, the date and the expiry |
| Quote: Prepared for | Who it is for, and whatever they wrote when they asked |
| Quote: Who it is between | The same, with your own trading address and details beside theirs |
| Quote: From | Your own trading name, address and details on their own, to place where you like |
| Quote: To | Who it is for on its own, with whatever they wrote |
| Quote: Notice panel | A sentence of your own before the figures - how long the price holds, and what to do about it |
| Quote: Items | The list, with optional pictures and product codes |
| Quote: Totals | Subtotal, any delivery or service charges, tax, total |
| Quote: Notes and terms | Your reply, the validity line, an optional delivery column and your terms |
| Quote: Footer | The line at the foot of company paperwork: where to find you, your company number and your VAT number |
| Quote: Divider | A rule, for the gaps the blocks either side of it do not rule themselves |

Four starters come with it: **Standard quote** (published for you, so the feature works the moment you install it), **Designed quote** with all the above in place, **With pictures**, and **Just the list** for shops that would rather not print a total they have not agreed to.

### Making it look like your paperwork

**Start with Quote: Document style.** Drop it in once, anywhere, and it sets the accent colour used by the rule under the heading, the rule above the total, the bar down the side of the notice panel and the contact line in the footer - along with the shading behind the item table's column headings, how thick the accent rules are, whether corners are square or rounded, and how roomy the whole thing is. One field instead of the same field on five blocks. Leave any of them blank and that part keeps the look it had.

Then the blocks take the details: how big the heading is and which side it sits on, whether the rule underneath is a hairline or thick in your colour, whether the dates read as two ruled columns or one line each ("Issued 6 April 2026"), whether the quote number sits in that list or on its own above it, whether the table headings sit on a shaded band, whether the total is simply bold or set large above an accent rule, and whether your delivery wording and your terms stack or sit side by side. Every label is a text box.

**Your own address on a quote.** **Quote: Prepared for** names the customer and stops there, which is fine for a quote read on screen. **Quote: Who it is between** puts your own trading name, address and contact details beside theirs, which is what a quote wants once it is going to be printed, forwarded round somebody's office and put in a folder. Those details are the ones you already gave under **Settings → Shop → Invoices** - a quote becomes an order becomes an invoice, and it would be worse than useless for the three to disagree about who is selling. Fill that form in and the column appears; leave it and the column stays off rather than printing blanks.

**Placeholders.** The Notice panel and the Footer are sentences you write, and they take placeholders in double braces so one wording covers every quote: `{{QUOTE_NUMBER}}`, `{{QUOTE_CODE}}`, `{{QUOTE_DATE}}`, `{{VALID_UNTIL}}`, `{{QUOTE_URL}}`, `{{TOTAL}}`, `{{CUSTOMER_NAME}}`, `{{CUSTOMER_COMPANY}}`, `{{BUSINESS_NAME}}`, `{{BUSINESS_EMAIL}}`, `{{BUSINESS_PHONE}}`, `{{BUSINESS_ADDRESS}}`, `{{VAT_NUMBER}}`, `{{COMPANY_NUMBER}}` and `{{SITE_URL}}`. A placeholder with nothing behind it disappears and takes its stray comma or full stop with it - a quote with no expiry date does not go out saying "This quote holds until ." One you have mistyped stays on the page instead, so you can see it on the sample quote in the builder and fix it before anybody gets one.

**The tax row can name the rate.** **Quote: Totals** has a box for it: type `20` and the row reads "VAT at 20%". Left empty it just says VAT, which is what it has always said. A quote does not carry a rate breakdown of its own the way an invoice does, which is why this is typed rather than worked out.

**From and To as separate blocks.** **Quote: Who it is between** draws both columns together and still does. **Quote: From** and **Quote: To** are the same two columns as two blocks, so you can put your own details up under the letterhead and the customer's down beside the dates, size them differently, or drop either into a column block with something else. Your telephone number is a switch on both.

**Sizes are menus now.** Every run of text on the document still has a size setting beside it; they are menus of pixel sizes rather than boxes you type points into, which is the unit everything else in the admin uses. Leave one on **Default** and that text keeps the size it has always had. A size you set before the change is still exactly the size it was, and the menu offers it back to you as its own option.

**Rounded column headings, and the room round them.** With the item table's headings on a shaded band, **Quote: Items** lets you round the corners to any radius you like, put those corners on the outer ends of the band or on every heading cell, set the space above, below and either side of them, choose how wide the item column is, and have the headings read as you typed them rather than IN SMALL CAPITALS. All of it starts on Default, which is the look you already have.

**Rows that have nothing to say are no longer printed.** A quote with no expiry date used to leave a gap in the heading where the "Valid until" line would have been. It does not any more, and the Date and Valid until rows have Show/Hide switches of their own.

**Page settings: paper, margins and scale.** Open the quote layout and click nothing, and the panel on the right is the sheet itself: paper size, portrait or landscape, a margin for each of the four edges, the scale everything prints at, and whether backgrounds and shading print at all. These apply to the PDF and to printing the page from your own browser, so the two finally agree. Deliberately the same settings the shop's invoice uses - a quote and the invoice it becomes end up in the same folder on somebody's desk.

**A footer on every page, not just the last one.** The Footer block on the document prints once, after the last line - fine on a one-page quote and no use on a five-page one. The repeating footer for this isn't a quote setting at all: it's the one shared by everything your site prints, at **Appearance → Layouts → Document Footer**. Design it once and it covers invoices, credit notes, proformas and quotes together, so the quote that turns into an order carries the same footer the invoice does rather than a second one you'd have to keep in step. If you designed one under Shop's older **PDF footer** tab, it has moved here, name and blocks intact - that tab has gone, and there is nothing for you to redo. If you design a tall one, the quote's bottom margin is opened up to fit it, so the small print no longer lands on top of your last few lines. Nothing is published for you: no footer layout means the PDF looks exactly as it did.

**Quote request page** is where the checkout used to be. Two blocks - the shopper's list and the form - with a one-column and a two-column starter.

The wording that fills these in (heading, introduction, validity line, terms) lives in **Settings → Shop → Quotes**, so you are not editing a layout to change a sentence.

### Choosing the type

Every block has a **Font** box. Leave it empty and that part of the quote uses the typefaces you set under **Appearance → Styles** - headings in your heading font, everything else in your body font. Fill it in and that block uses whatever you pick instead, whether that is one of your own named fonts or anything from the Google catalogue.

### Your logo

Your logo is its own block. It used to be a switch on **Quote: Heading**; it is now the site's own **Site Logo**, dropped above the heading, which means it can be moved, resized, nudged, given a different picture for this document, or left off altogether without touching anything else. It takes the logo from **Settings → Identity**, the same one your site header uses, so the two can never drift apart. With no logo uploaded it prints your shop's name instead.

**If you designed your quote before this changed**, your published layout has a Heading block that no longer prints a logo, and no Site Logo block yet. Open the layout, drag **Site Logo** in above the heading, and publish. Nothing else moves.

### Sizes in points

Every run of text on the quote has a size box beside it, measured in points the way printed paperwork is: the heading, the quote number, the dates, the customer's name and their message, the addresses, the registration lines, the table's column headings, the item rows, the product codes, the detail under a line, the totals, the total itself, the delivery note, your reply, the validity line, the terms, the notice panel and both lines of the footer. Leave a box empty and that text keeps the size it has always had, so a quote you were happy with stays exactly as it was. Typing 9 into the small print and 11 into the item rows is how you get a long list onto one page.

### Pictures, and how big

**Quote: Items** can show a thumbnail against each line, at **Small**, **Medium** or **Large**. Medium is what it has always been. Large is worth it for furniture and worth avoiding for a list of forty items, unless you are fond of paper.

### Delivery: a date, or a number of days

If your delivery services work out an arrival date, **Quote: Items** can print that date against each line, or print how long it takes instead - "10 working days from order". The second is usually the honest one on a quote: a quote sits in somebody's inbox for a fortnight, and a date worked out the afternoon it was written is in the past by the time they open it. The wording after the number is yours to change, so "from receipt of order" or "from when your order lands" are both fine.

Lines your delivery services never dated print exactly as they were quoted, and so do quotes saved before this existed - nothing is guessed at after the fact.

### The line under the totals

**Quote: Totals** has a **Delivery note under the totals** box, holding "Delivery is worked out once we have a delivery address." by default. Change it to whatever you would rather say, or empty it completely and nothing is printed there at all - which is the right answer if your prices already include delivery.

---

## VAT on a quote

A quote shows VAT worked out against your default delivery area - the same figure your basket shows a shopper before they have typed an address, and for the same reason: you have to state a price long before you know where the parcel is going. The checkout works the real area out from the delivery postcode and charges from that.

If your prices already include VAT, the row reads "VAT (included)" and the total does not move. If they do not, the VAT is added and the total says so.

> Quotes made before this was fixed showed no VAT row at all, because a quote with no delivery address was treated as a quote with no tax. They were saved that way and they stay that way - a quote is a photograph of a day. Save the basket again for a quote with the row on it.

---

## Where the buttons go

By default, **Save basket as a quote** and **Retrieve quote** both sit on the basket page's heading row, to the right of "Your basket". They are there without you doing anything, because a button nobody can find is a button nobody presses.

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
