# Advanced Shipping

Advanced Shipping replaces vague promises like "within a few working days" with a
concrete delivery date the shopper can actually plan around - shown live on every
product page and every basket line - and lets you sell delivery-and-assembly
options they choose per item.

It needs the **Shop** and **Product Attributes** modules installed.

## What the shopper sees

- On a product page: **"Delivery by Tue 29 Jul"**, with a gentle countdown -
  "Order within 6h 12m to get it by then." When the cut-off passes, the date
  quietly rolls forward on its own.
- In the basket: each line shows its own delivery date and a picker for the
  delivery service. Choosing, say, full installation updates the price the
  instant it is picked - no waiting on a spinner - and the promised date
  follows a beat later once the server has confirmed the sums.
- The date and the chosen service are saved with the order exactly as quoted, so
  there is never any confusion later about what was promised.

Every date counts **working days only** - weekends and bank holidays are skipped.

## How a date is worked out

You set up **delivery rules**, and each product uses the most specific rule that
fits it:

1. Its **range** (a product attribute you nominate, e.g. Hyphen or Aero), then
2. Its **category**, then
3. Its **supplier**, and finally
4. The shop-wide **default**.

A rule can work two ways:

- **Stocked** - it dispatches from stock. Order before the daily **cut-off** on a
  shipping day and it goes out that day; otherwise the next working day. Then add
  the time to pack and the time in transit.
- **Made to order** - there is no cut-off; it takes a set number of working days
  to make, then the transit time on top.

Out-of-stock items on backorder add their restock time, and pre-order items use
their pre-order date. Any single product can have its own **override** on the
Delivery tab of its editor, for the odd exception.

A product bought with options chosen (a colour, a headrest) counts as its main
product for all of this: it uses the same category, supplier and any override, so
the basket shows the same delivery choices whichever options were picked. Its own
stock level still decides stock-based dates.

The one exception is the range. If you have set range up as an option that varies
per variation (rather than one range for the whole product), each variation uses
its own range, and the basket shows the delivery choices for the exact variation
picked. A product with a single range for the whole thing behaves as before.

## Service tiers

Service tiers are the delivery-and-assembly options a shopper picks in the
basket - standard, next day, delivered and built, full installation, and so on.
Each tier can bring the date forward or push it back, or set a floor (a full
installation is never sooner than, say, ten working days). Prices are set per
scope, so seating can be priced differently from everything else.

The timing can vary per scope too. Each price row can tick **Different timing
here** and fill in only what differs - a longer transit for one range, a lifted
minimum for another - and anything left blank keeps the tier's usual timing. So
one "Installation" tier can take ten working days for most furniture but thirty
for one awkward range, without setting up a second tier with the same name. (If
you have ever ended up with two tiers both called "Installation", this is the
cure: fold the odd one out into a per-range timing on the original, then delete
the spare.) Setting "Never sooner than" to 0 on a row lifts the tier's minimum
just there.

Each tier can also be tied to a single **supplier** when you add it, or left as
**Any supplier**. A supplier-specific tier is only ever offered on products from
that supplier, so you can run several tiers that share a name - a "Full
installation" from one supplier and another from a second, each with its own
timing and price - and a shopper only sees the one that fits the item in their
basket. Leave the supplier as Any and the tier is offered on everything, exactly
as before. Because a tier now carries its own supplier, the price list beneath it
scopes by category, range, or the default only.

In the basket each option now spells out when it would arrive right there in its
own label - "Standard Delivery by Monday (included)", "Express Delivery by
Monday (+£4.95)" - so a shopper can weigh the dates against the prices without
having to select each one in turn. Anything landing within the week shows just
the weekday ("Monday"); past a week it adds the date ("Monday 3rd") so "Monday"
can never be mistaken for the one three weeks off; past four weeks it adds the
month too ("Monday 3rd Aug").

### Pricing per person

Some things are priced by how many people they are for, not by the line: a bench
desk sold as a two, four or six-person unit, where a "delivered and built" price
is really a price per seat. Any tier price can be ticked **per person** on the
Service tiers screen. When it is, the price is multiplied by a number read off
one of the product's own attributes - you nominate which attribute carries that
number in Delivery settings (say a "Seats" attribute whose values read "2
People", "4 People", "6 People"). So a £50 build on a six-person desk shows as
"+£300.00" in the basket and is charged, and saved on the order, exactly so.

The number is read from the attribute value's text - the first whole number in it
wins, so "6 People", "6" and "6-seat" all count as six. If a product set to a
per-person tier has no such number to read, that line is held back rather than
guessed at: the shopper is asked to choose the number of people before it can be
bought. A flat (not-per-person) tier is unaffected and is charged once per line
as before.

## Setting it up

Everything lives on the shop's **Tax & shipping** page (Shop in the admin
sidebar, then **Tax & shipping**). Alongside the shop's own tax and shipping tab
you get four more tabs:

- **Delivery rules** - add a rule per supplier, category, range, or the default.
  A live preview shows the date an order placed right now would land on, so you
  can spot a wrong cut-off before a shopper does.
- **Service tiers** - your delivery-and-assembly options and their prices.
- **Holidays** - import the official bank-holiday calendar for your region
  (England & Wales, Scotland, or Northern Ireland). It refreshes itself weekly.
- **Delivery settings** - which attribute means "range", which attribute holds a
  **person count** for per-person pricing, your holiday region, the default
  service shown before the shopper changes it, and how the basket shows the
  delivery-service picker: a compact **dropdown** (the default) or **radio
  buttons** that lay every option out at once.

There is nothing to configure in your hosting - no keys, no environment
variables. Set your rules, import the holidays, and you are away.

One small note on timing: to keep the storefront quick, the shop keeps a very
short-lived copy of your rules, tiers and prices (about ten seconds). An edit
in the admin can therefore take up to ten seconds to show on product pages and
in the basket - blink and you'll miss it, but it is not a bug.
