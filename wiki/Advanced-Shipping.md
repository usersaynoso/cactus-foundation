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
product for all of this: it uses the same range, category, supplier and any
override, so the basket shows the same delivery choices whichever options were
picked. Its own stock level still decides stock-based dates.

## Service tiers

Service tiers are the delivery-and-assembly options a shopper picks in the
basket - standard, next day, delivered and built, full installation, and so on.
Each tier can bring the date forward or push it back, or set a floor (a full
installation is never sooner than, say, ten working days). Prices are set per
scope, so seating can be priced differently from everything else.

In the basket each option now spells out when it would arrive right there in its
own label - "Standard Delivery by Monday (included)", "Express Delivery by
Monday (+£4.95)" - so a shopper can weigh the dates against the prices without
having to select each one in turn. Anything landing within the week shows just
the weekday ("Monday"); past a week it adds the date ("Monday 3rd") so "Monday"
can never be mistaken for the one three weeks off; past four weeks it adds the
month too ("Monday 3rd Aug").

## Setting it up

Everything lives under **Delivery** in the admin sidebar:

- **Delivery rules** - add a rule per supplier, category, range, or the default.
  A live preview shows the date an order placed right now would land on, so you
  can spot a wrong cut-off before a shopper does.
- **Service tiers** - your delivery-and-assembly options and their prices.
- **Holidays** - import the official bank-holiday calendar for your region
  (England & Wales, Scotland, or Northern Ireland). It refreshes itself weekly.
- **Delivery settings** - which attribute means "range", your holiday region, the
  default service shown before the shopper changes it, and how the basket shows
  the delivery-service picker: a compact **dropdown** (the default) or **radio
  buttons** that lay every option out at once.

There is nothing to configure in your hosting - no keys, no environment
variables. Set your rules, import the holidays, and you are away.

One small note on timing: to keep the storefront quick, the shop keeps a very
short-lived copy of your rules, tiers and prices (about ten seconds). An edit
in the admin can therefore take up to ten seconds to show on product pages and
in the basket - blink and you'll miss it, but it is not a bug.
