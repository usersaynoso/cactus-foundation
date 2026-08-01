# Advanced Shipping

Advanced Shipping replaces vague promises like "within a few working days" with a
concrete delivery date the shopper can actually plan around - shown live on every
product page and every basket line - and lets you sell delivery-and-assembly
services they choose per item.

It needs the **Shop** and **Product Attributes** modules installed.

## What the shopper sees

- On a product page: **"Delivery by Wednesday 29th of July"**, with a gentle countdown -
  "Order within 6 hours and 12 minutes to get it by then." When the cut-off
  passes, the date quietly rolls forward on its own.
- Also on a product page, the **Product: Shipping options** block shows the
  delivery services that product is offered before anything is added to the
  basket - the same ticked bar and switch chips the basket uses, because it is
  literally the same picker, so what each service costs and when each one lands
  is answered on the page the shopper is already reading. It carries a heading
  you can rename or empty, and it follows whichever basket picker style is set in
  Delivery settings. A choice made here is remembered for that product for the
  rest of the visit, moves that product's basket line straight away if it is
  already in the basket, and otherwise rides along onto the line the next
  add-to-cart creates - including when the shopper picks a different variation on
  the way, in which case a service that variation is not offered quietly falls
  back to your default rather than being honoured.
- **On a product with variations**, the block follows whichever combination the
  shopper is building. Before they have settled on one it offers only what every
  variation of that product agrees on, costed and dated at its slowest and
  dearest, so nothing on offer can be taken away or go up once they choose. The
  moment a full combination is picked, it asks again for that exact variation
  and shows its real services and dates. This matters where your delivery
  services are priced by range and the range is set on the variations rather
  than the listing: without it, the listing offers nothing to show at all.
- **A service the chosen variation cannot have is crossed out, not hidden.**
  Under the live chips sits a second row listing every
  other service you sell on that product, struck through, with its price and a
  line saying which choice does carry it: *"Available in 120cm or 140cm"*,
  *"Available With Arms"*. It is the same courtesy the variation choices
  themselves pay a shopper who wants something the current combination cannot
  give them, and it means a two-person delivery you only offer on the wider
  desks is something they can find rather than something that silently is not
  there. Nothing in that row can be clicked - it states what is on offer
  elsewhere in the range, it does not sell it - and where no single choice
  explains it, it simply reads "Not available on this choice". Where a product
  has no services of its own at all, the row still appears on its own, so the
  page is never blank on a listing whose variations agree on nothing.
- In the basket: each line states what it has already chosen - a ticked bar
  reading **"Arrives by Thursday 6th of August"**, the service name beside it and the price
  on the right (**Free**, or what it adds). Every other service for that line
  sits underneath as a one-click chip - "Switch to: Installed by Thursday 13th
  +£25.95" - so the alternatives are visible without the shopper opening
  anything. Picking one updates the price the instant it is clicked - no waiting
  on a spinner - and the promised date follows a beat later once the server has
  confirmed the sums. A service's **description** (what it includes - delivered
  to the room of your choice, built, packaging taken away) appears in smaller
  text beneath the chosen bar, so the shopper knows what they are paying for
  without leaving the basket. A line with only one service simply states what
  happens and offers nothing to switch to.
- On the basket's sticky checkout bar: **"everything by Friday"** beside the
  item count - the last of the basket's own delivery dates, which is when the
  whole order has actually landed. It follows the shopper down a long basket,
  and it disappears when nothing in the basket has a delivery date to promise.
- Also in the basket, the **Delivery: basket cut-off countdown** block gives the
  whole lot one deadline - "Order within 5 hours and 12 minutes to keep these
  delivery dates." - and nothing else. The dates themselves already sit beside
  each line, so it does not repeat them. Drop the block above your basket lines
  to have it read as a heading over the Delivery column.
- That countdown appears only when every item in the basket shares the same
  cut-off. Mixed basket, mixed deadlines, and it stays quiet rather than pick one
  and be wrong about the rest. Items with no cut-off at all (pre-order) count as
  a mismatch, since there is no deadline to keep.
- The **Delivery: whole-order upgrades** block offers the basket things no single
  line can - "Get everything sooner **+£13.90** (2 items) · first arrives Friday
  (was Thursday 6th of August)", or "Built or installed for you **+£66.90**
  (3 items) · everything by Friday 11th Sep (was Friday 4th of September)". One
  click moves every affected line at once. It
  works out the offers from the services your items are actually offered, so
  there is nothing to configure: an upgrade only appears when it applies to at
  least two lines and the shopper is not already on it, and one it cannot put a
  firm price on (a per-person service on an item with no people count) is not
  offered at all rather than guessed at. Drop it under the countdown, above your
  basket lines. A basket with one item in it never shows the row - that item's
  own picker already offers everything this could.
- The **Delivery: basket arrivals summary** block goes underneath the basket
  lines - and if you split the basket into the **Cart items** and **Cart totals**
  blocks, this is the thing to put between them, so the dates are read before the
  money rather than after it - and answers "so when have I actually got everything?" - a heading reading
  **"Everything arrives by Friday 4th of September"**, then one card per arrival date naming
  what turns up on it ("Flat-pack delivery by Thursday 6th of August - Task chair + Desk with
  storage"). It appears only when the basket is waiting on more than one date;
  with everything landing together, each line already says so beside itself. The
  footnote underneath is yours to edit, or to empty if you would rather not
  commit to confirming days by email. **Show each arrival as** picks how a card
  says what is in it: **Item names** writes them out as it always has, and
  **Product photos** shows the pictures instead, with the name and the chosen
  options on hover (or on a tap, on a phone). Photos suit a basket of
  long-winded variation names; a catalogue with no pictures in it is better off
  with the names, since a product without a photo gets a blank tile.
- The date and the chosen service are saved with the order exactly as quoted, so
  there is never any confusion later about what was promised.

Every "arrives by" date is spelled out in full - **"Wednesday 29th of July"** -
because that is the line a shopper reads as a promise and an abbreviation is one
more thing to decode. The tighter spots keep the short form on purpose: a switch
chip and the sticky bar say "by Friday" inside the week, adding the date and then
the month only as the distance makes it necessary.

Every date counts **working days only** - weekends and bank holidays are skipped.

## How a date is worked out

Two ingredients, and that is the whole recipe:

1. **Dispatch clears.** Your shop has one set of dispatch timing (in Delivery
   settings): a daily **cut-off**, the working days it takes to pick and pack,
   and which days the courier collects. Order before the cut-off on a ship day
   and it starts that day; otherwise the next working day. This part is the same
   whichever service the shopper picks.
2. **The service adds its delivery time.** Each delivery service says how many
   working days it takes from dispatch to the door - a plain number, not an
   adjustment on top of something else. Standard might be 5, express 1, full
   installation 10.

Pre-order items dispatch on their pre-order date instead of the cut-off. An item
out of stock and set to block simply makes no promise at all.

A product bought with options chosen (a colour, a headrest) counts as its main
product for all of this: it uses the same category, supplier and ranges, so the
basket shows the same delivery choices whichever options were picked. Its own
stock level still decides stock-based dates.

The one exception is the range. If you have set range up as an option that varies
per variation (rather than one range for the whole product), each variation uses
its own range, and the basket shows the delivery choices for the exact variation
picked. A product with a single range for the whole thing behaves as before.

## Delivery services

Delivery services are the options a shopper picks in the basket - standard,
express, delivered and built, full installation, and so on. Each one carries:

- a **name** and an optional shopper-facing **description**,
- its **delivery time** in working days,
- optionally a **floor** ("never sooner than") for services that need booking -
  a full installation is never sooner than, say, ten working days out however
  fast the van is,
- and its **price rows**.

Prices you type on a service row are recorded the same way your product prices
are, and they are shown to shoppers the same way too: if Shop is set to
[show prices with tax included](Shop#showing-prices-with-or-without-tax), the
"+£4.95" on a delivery upgrade has the tax added on exactly as the item price
beside it does. Nothing about what you charge changes - only what is printed.

A price row says where the service is offered and what it costs there. Rows can
apply to everything, to one supplier, one category, or one range (a product
attribute you nominate, e.g. Hyphen or Aero), and the most specific row that fits
the product wins: range beats category, category beats supplier, supplier beats
the everywhere row. **No matching row means the service simply is not offered on
that product** - which is also how you keep a service to one supplier: give it a
single supplier row and nothing else.

A price row can also carry **different timing for just that scope**: tick
"Different timing here" and fill in only what differs. So one Standard delivery
service can be 5 working days for stocked ranges but 25 for a made-to-order one,
and one Installation service can take ten days for most furniture but thirty for
one awkward range - no second service with the same name, no mental arithmetic.
Anything left blank keeps the service's usual timing, and setting "Never sooner
than" to 0 on a row lifts the service's floor just there.

If a product falls under no service at all, it shows no delivery estimate - by
design, not by accident.

In the basket each option spells out when it would arrive right there in its own
label - "Standard Delivery by Monday (included)", "Express Delivery by Monday
(+£4.95)" - so a shopper can weigh the dates against the prices without having
to select each one in turn. Anything landing within the week shows just the
weekday ("Monday"); past a week it adds the date ("Monday 3rd") so "Monday" can
never be mistaken for the one three weeks off; past four weeks it adds the month
too ("Monday 3rd Aug").

### Pricing per person

Some things are priced by how many people they are for, not by the line: a bench
desk sold as a two, four or six-person unit, where a "delivered and built" price
is really a price per seat. Any service price can be ticked **per person** on the
Delivery services screen. When it is, the price is multiplied by a number read
off one of the product's own attributes - you nominate which attribute carries
that number in Delivery settings (say a "Seats" attribute whose values read "2
People", "4 People", "6 People"). So a £50 build on a six-person desk shows as
"+£300.00" in the basket and is charged, and saved on the order, exactly so.

The number is read from the attribute value's text - the first whole number in it
wins, so "6 People", "6" and "6-seat" all count as six. If a product set to a
per-person service has no such number to read, that line is held back rather than
guessed at: the shopper is asked to choose the number of people before it can be
bought. A flat (not-per-person) service is unaffected and is charged once per
line as before.

## Setting it up

Everything lives on the shop's **Tax & shipping** page (Shop in the admin
sidebar, then **Tax & shipping**). Alongside the shop's own tax and shipping tab
you get three more tabs:

- **Delivery services** - your delivery-and-assembly options: name, description,
  delivery time, floor, and the price rows that say where each is offered.
- **Holidays** - import the official bank-holiday calendar for your region
  (England & Wales, Scotland, or Northern Ireland). It refreshes itself weekly.
- **Delivery settings** - the shop-wide dispatch timing (cut-off, days to
  dispatch, ship days, with a live "an order placed now would dispatch…"
  preview so you can spot a wrong cut-off before a shopper does), which
  attribute means "range", which attribute holds a **person count** for
  per-person pricing, your holiday region, the default service shown before the
  shopper changes it, and how the basket shows the picker: the **chosen service
  with the rest as chips** (the default), a compact **dropdown**, or **radio
  buttons** that list every option at once.

There is nothing to configure in your hosting - no keys, no environment
variables. Set your dispatch timing, add your services, import the holidays, and
you are away.

One small note on timing: to keep the storefront quick, the shop keeps a very
short-lived copy of your services and prices (about ten seconds). An edit in the
admin can therefore take up to ten seconds to show on product pages and in the
basket - blink and you'll miss it, but it is not a bug.

## Changed in 0.1.18

Earlier versions kept **delivery rules** (base timing per range, category or
supplier) as a separate screen, with each service holding day *adjustments* on
top, plus a per-product override tab. In practice that meant reading two screens
and adding them up to know what a shopper would see. The two have been folded
into one: dispatch timing moved to Delivery settings, every service now states
its delivery time as a plain number of working days, and a price row overrides it
outright where a range or category takes longer. Existing numbers were carried
across exactly - what a shopper is promised does not change. The per-product
override tab and the per-service supplier tie went with it (a supplier-scoped
price row does the same job); the odd exception is now a range or category row
rather than a buried per-product patch.
