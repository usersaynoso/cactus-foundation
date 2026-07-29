# Advanced Shipping

Advanced Shipping replaces vague promises like "within a few working days" with a
concrete delivery date the shopper can actually plan around - shown live on every
product page and every basket line - and lets you sell delivery-and-assembly
services they choose per item.

It needs the **Shop** and **Product Attributes** modules installed.

## What the shopper sees

- On a product page: **"Delivery by Tue 29 Jul"**, with a gentle countdown -
  "Order within 6 hours and 12 minutes to get it by then." When the cut-off
  passes, the date quietly rolls forward on its own.
- In the basket: each line states what it has already chosen - a ticked bar
  reading **"Arrives by Thu 6 Aug"**, the service name beside it and the price
  on the right (**Free**, or what it adds). Every other service for that line
  sits underneath as a one-click chip - "Switch to: Installed by Thu 13 Aug
  +£25.95" - so the alternatives are visible without the shopper opening
  anything. Picking one updates the price the instant it is clicked - no waiting
  on a spinner - and the promised date follows a beat later once the server has
  confirmed the sums. A service's **description** (what it includes - delivered
  to the room of your choice, built, packaging taken away) appears in smaller
  text beneath the chosen bar, so the shopper knows what they are paying for
  without leaving the basket. A line with only one service says so quietly
  ("Only option") rather than pretending there is a choice.
- On the basket's sticky checkout bar: **"everything by Fri 4 Sep"** beside the
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
- The date and the chosen service are saved with the order exactly as quoted, so
  there is never any confusion later about what was promised.

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
