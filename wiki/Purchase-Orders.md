# Purchase Orders

**Purchase Orders** is the buying side of your business, kept on your own site. It holds the list of who you buy from and the terms you buy on, it raises the orders you send them, it can hold the big ones back until somebody has approved them, and it keeps a record of every change that nobody can quietly rewrite afterwards.

It stands on its own. You do not need the Shop module and you do not need UK Bookkeeping. A builder, a workshop or a consultancy with no online shop and no books on the site still buys things, and the module is a complete purchasing system on such a site rather than a stub. Where those modules *are* installed, it makes use of them - see [What it does with your other modules](#what-it-does-with-your-other-modules).

> **One sidebar link.** Everything lives under **Purchasing → Purchase Orders**, with tabs across the top of the page: Orders, Receiving, Bills, Returns, Suppliers, Reorder and Reports.

---

## What is in it

The module is finished: everything below is in it, and the buying side of a business is covered end to end.

- **Suppliers** - who you buy from, how to reach them, and the terms.
- **Purchase orders** - raise, edit, approve, send, acknowledge, hold, close, cancel.
- **The order as a document** - designed by you, in the same editor as everything else, printed as a PDF and emailed to the supplier with that PDF attached.
- **Revisions** - change an order they already have and the copy they were sent is kept exactly as it was, for good.
- **Receiving** - tick off what actually turned up against what you ordered, note what went back and why, and have your stock counts go up on their own if you keep them.
- **Returns** - send goods back to a supplier, print and email them a returns note, and keep track of the credit you are owed until it turns up.
- **Supplier bills** - enter their invoice, attach their PDF, have it checked against what you ordered and what turned up, query it or approve it for payment.
- **A history** on every order, every return and every bill, saying who did what and when.
- **Bills and credits going through to the books** by themselves, where you run UK Bookkeeping.
- **Reordering** - a level per product, and the draft orders that follow when you drop below it, grouped by supplier and mindful of their minimum.
- **Suppliers' price lists** - their own catalogue kept on file, so an order is drafted at what they charge today, and you are told the week a code is renamed or stopped.
- **A link for the supplier** - their own view of their own order, which they can accept, offer a different date on, or tell you something is short - and change nothing at all.
- **Reports** - what you have committed to and not yet had, what is late, goods in without an invoice, invoices in without the goods, and what you spend with whom.
- **Chasing** - a note to a supplier whose order is late, on the schedule you set, or one you send yourself.
- **Four spreadsheets** to take away, and a tile on your dashboard.

---

## Who can do what

Purchasing is a set of permissions on your core roles, set from **Users → Roles**:

- `purchase-orders.access` - see the Purchasing section at all.
- `purchase-orders.create` - raise and edit orders, and manage the supplier list.
- `purchase-orders.approve` - approve an order that is over your threshold, or send it back.
- `purchase-orders.receive` - book deliveries in, and send goods back.
- `purchase-orders.bills` - enter, query and approve supplier invoices, and record a credit when it arrives.
- `purchase-orders.catalogues` - keep suppliers' price lists, and import them.
- `purchase-orders.settings` - change the settings.

Anybody holding any one of the first six can see the section, so somebody whose only job is approving orders is not left staring at a page telling them off.

Administrators hold all seven without being given them, as they do everywhere else.

---

## Suppliers

**Purchasing → Suppliers** is your own list, and it is yours whether or not you sell anything online.

For each one you can record the contact details, the account number you buy under, their VAT number, an address, and the terms you actually buy on:

- **Payment terms**, both as words ("Net 30") and as a number of days, so a later release can work out when a bill is due.
- **Lead time**, in days.
- **Minimum order value** - the order screen tells you when you are under it.
- **Carriage paid over** and **carriage charge**.

**Status** is Enabled, On hold or Disabled. Disabled keeps the record and every order filed against it, and simply drops the name out of the list you pick from. **On hold** does the same, but says why: it is for a supplier you have stopped buying from for now rather than one you have finished with.

Deleting a supplier is refused while there are orders against them. That is deliberate - the alternative is a purchase order that no longer says who it went to.

### Linking to a catalogue supplier

If you have the Shop module, each purchasing supplier can be **linked** to the supplier name your products are filed under. That is what lets the line editor offer their products first when you are raising an order.

The link stores both the id and a copy of the name. If you later rename or delete that supplier in the shop, this record keeps working and simply says the link is no longer there. Your purchase orders are not the sort of thing that should go blank because somebody tidied the catalogue.

---

## Raising a purchase order

**Purchasing → Orders → New purchase order.**

Pick the supplier, add your lines, and say where the goods should go.

**Lines** can be typed in from scratch, or - with the Shop module installed - searched straight out of your catalogue, in which case the name, your own code and the cost price come across with them. Both work on the same order. Not everything a business buys is something it sells, and a module that insisted otherwise would be no use for buying paper.

Each line carries a quantity, a unit ("each", "box", "metre" - it is your word, not ours), a unit cost to four decimal places, an optional discount percentage, and a tax rate.

> **Why four decimal places on the cost.** Supplier costs routinely go below the penny, and the sums are done to the penny only once, at the line. Two hundred and fifty of something at £1.005 is £251.25, and a system that rounded the unit price first would tell you £250 or £252.50 and then disagree with the supplier's invoice.

**Deliver to** is one of three things: your own address (which you set once, in the settings), straight to the customer, or somewhere else entirely. Sites that drop-ship should set the default to the customer and stop thinking about it.

**Notes** come in two kinds, and the labels say which is which: notes for the supplier print on the order, notes for us never leave the building.

The **totals** update as you type. They are worked out again on the server when you save, so what is stored is never whatever the browser happened to think.

---

## Approvals

Off by default. Switch **"Big orders need approving before they go out"** on in the settings and set a threshold, and any order whose total reaches that figure has to be approved by somebody holding `purchase-orders.approve` before it can be sent.

Set the threshold to 0 to have every order approved, which is what a business that wants two pairs of eyes on everything is asking for.

An order that is under the threshold - or a site that leaves approvals off - goes straight out. Nobody is made to approve something the settings say does not need it.

An approver can also **send it back**, with a note, which drops it to draft for whoever raised it.

---

## The life of an order

| Status | What it means |
|---|---|
| Draft | Being written. Freely editable, and the only status that can be deleted outright. |
| Awaiting approval | Over your threshold, waiting for somebody who can approve it. |
| Approved | Cleared to go. |
| Sent | Gone to the supplier. |
| Acknowledged | They have confirmed it. |
| Part received | Some of it has turned up. |
| Received | All of it has. |
| Closed | Finished with. |
| Cancelled | Called off. The record and the number stay. |
| On hold | Paused, deliberately. |

Every one of those changes is written to the order's own **history**, with who did it, when, and any note they left.

A draft is yours to change as you like. **Once an order has gone to the supplier, changing it is an amendment** - see [Changing an order they already have](#changing-an-order-they-already-have).

Only a draft can be deleted. Anything that has been out into the world gets cancelled instead, so the number and the trail survive. Cancel one the supplier has actually been sent and they are emailed about it, because a supplier who never hears is a supplier who delivers it anyway.

---

## Checking goods in

**Purchasing → Receiving.** Two lists: what is still to come, and what has already turned up.

"Still to come" is worked out from the lines rather than from the status, which is the only way it stays honest. An order nobody got round to closing is not on the list if everything on it arrived, and one marked received that later had a delivery removed is back on it.

### Booking a delivery in

Press **Book in** beside an order. You get every line, with what was ordered, what has already been had, and what is still due - and the accepted box already filled in with the balance, because the overwhelmingly common case is "it all came" and typing eleven numbers to say so is how people stop booking deliveries in at all.

- **Accepted** - what you are keeping.
- **Rejected** - what turned up and went straight back. Rejected goods are never counted as received, so the line stays outstanding and the supplier still owes it.
- **A note per line** - condition, batch numbers, or why it went back.
- **Their delivery note, the carrier and the date** - so you can find the delivery again from their paperwork rather than yours.

Save it and the order's status keeps up on its own: **part received** while anything is short, **received** once every line has had what it was owed. An order deliberately put **on hold** stays on hold - that was somebody's decision, and it is not arithmetic's to overrule.

### More than you ordered

Suppliers send full cases. Over-delivery is allowed, always: you tell the module how much of it you will take without comment under **Settings → Purchase Orders → Checking what arrives**, and anything past that is flagged on the screen before you save and recorded in the order's history afterwards. It is never refused - a delivery note that will not match the pallet is worse than useless, and their invoice will have to answer for the difference soon enough.

### When the rest is never coming

Sometimes four of the ten simply are not going to arrive. Open the order and press **Give up on the rest** beside the line: the quantity ordered stays exactly as it was, the shortfall is marked cancelled, and the line stops being outstanding - which lets the order finish instead of sitting open for ever. Nothing is deleted, so what you ordered and what you got both stay readable.

### Stock

If you keep stock counts and you have switched **Add goods to stock when they arrive** on, tick the box when you book a delivery in and the counts go up by what you accepted. Anybody waiting for one of those products to come back is emailed at the same time.

Some things worth knowing:

- **It happens once.** Pressing the button twice, or two people pressing it at the same moment, cannot put the delivery on the shelf twice.
- **Recording a delivery and moving stock are separate.** You can book deliveries in for months with the setting off, switch it on later, and the paperwork is all still there.
- **Products with no count are not a failure.** Plenty of things are made to order or shipped straight to the customer. Those lines simply say there was nothing to change.
- **Half units cannot move a count.** A count holds whole things. Two and a half metres of cable is a perfectly good delivery and the line will say so rather than quietly rounding it.
- **Removing a delivery puts the stock back.** Deleting the paperwork and leaving the shelf figure where it was is how a stock count stops meaning anything.

Deliveries need the `purchase-orders.receive` permission. Everybody with `purchase-orders.access` can see them.

---

## Sending things back

**Purchasing → Returns.** The tab opens with the only figure that really matters: how much money suppliers still owe you on goods that have already gone back. Raising a return is easy and everybody does it; noticing six months later that four of them were never credited is the thing this screen exists to stop.

### Raising one

Open the purchase order and press **Send something back**. You only get the option once something has actually been delivered - nothing can go back that never arrived.

You get every line that has turned up, with what was delivered and what has already gone back. Nothing is filled in for you: the common case is one line out of eight, and a form that starts by proposing to send everything back is a form somebody will one day save by accident.

- **Sending back** - how many. You cannot send back more than turned up; the module will say so rather than letting you claim for twelve when ten were delivered.
- **Came in on** - which delivery they arrived on. It prints on the note, which is what lets the supplier's own goods-in desk find them, and it is what decides whether the goods can come off a stock count.
- **Why they are going back** - the paragraph the supplier actually decides on. Worth writing properly.
- **Notes** - collection arrangements, packaging, anything else.

The credit you are claiming is worked out from the order's own prices, not typed in. It is the same arithmetic the order used, so a claim can never round a penny differently from the order it is claiming against.

### Its life

A return goes **draft → sent → credit promised → credited → closed**, and can be cancelled up until the money arrives.

- Only a **draft** can be edited. Once the supplier is holding a copy, changing it quietly is how they stop trusting your paperwork - cancel it and raise another.
- **The credit has arrived** takes the amount and their credit note number. Leave the amount blank and it credits the whole claim, which is the ordinary case.
- You do not have to say they promised first. Plenty of suppliers simply send the credit note, and clicking "they promised" about money already in the bank is silly.
- Raising, sending and cancelling need `purchase-orders.receive`. Saying the credit has arrived needs `purchase-orders.bills` - it is a bookkeeping fact, not a goods-in one.

### The returns note

Every return has its own document, designed the same way the order is - see [The returns note](#the-returns-note-1) below. **View note** opens it, **Download PDF** saves it, and **Email it to the supplier** sends it with the PDF attached.

### Stock

If you keep stock counts and you have the purchasing stock setting on, **Take these off stock** deducts what is going back.

It is a separate button on purpose. A note can be raised on Monday and the pallet collected on Thursday, and deducting on Monday would show three days of a shortage nobody could explain.

- **Only goods that were put on a count can come off one.** If the delivery those goods arrived on was never added to stock - or nobody said which delivery it was - the line says so rather than inventing a shortage out of paperwork.
- **It happens once.** Two people pressing the button at the same moment cannot deduct the same return twice.
- **Deleting a return puts the stock back**, exactly as deleting a delivery does.

One setting covers both directions. A site where a delivery adds to a count but a return never takes anything off would drift upwards for ever, which is a worse answer than not keeping the count at all.

---

## Supplier bills

**Purchasing → Bills.** What your suppliers say you owe, checked against what you asked for and what actually turned up before anybody agrees to pay it.

The tab opens with the figure that matters: how much is sitting on invoices nobody has agreed to yet, and how many of those have been queried with the supplier. Entering invoices is easy and everybody does it. Noticing that four of them have been queried since March is the thing this screen exists to stop.

### Entering one

Two ways in, because businesses buy things both ways:

- **Against an order.** Open the purchase order and press **Enter a bill**. Every line comes across already filled in with what has been delivered and not yet invoiced, at the price on the order.
- **On its own.** Press **Enter a bill** on the Bills tab and pick the supplier. The electricity does not arrive on a purchase order, and a module that refuses to record it is a module you keep a spreadsheet alongside.

What you type is what is on their paperwork. That is the whole point of the exercise: their figures are allowed to differ from yours, and the module's job is to notice, not to stop you writing down what they actually sent.

- **Their invoice number** is what everybody will quote. One supplier cannot bill you twice under the same number, however they capitalise it - the second attempt is refused, by name.
- **The invoice date** is the date on their paperwork, not today. The due date is worked out from it and the supplier's terms, so an invoice dated the second and opened on the twentieth is due thirty days after the second. Paying it thirty days after the twentieth is how an account goes on stop.
- **VAT** is worked out for you and can be overtyped. Suppliers who round line by line where we round once at the line land a penny or two out on a long invoice, and the figure that matters is the one on the document they would show anybody who asked.
- **A charge that is not on the order** - a pallet fee, a fuel surcharge, a sundry - is added as its own line. It will be flagged, which is the point.
- **Category and VAT treatment** can be set per line. Where you run the UK Bookkeeping module the categories are your own; where you do not, the boxes are simply not offered, and nothing is lost until the release that takes bills through to the books.

### Checking it against the order

Three things get compared, which is why it is called a three-way match: what you **ordered**, what was **delivered**, and what has been **invoiced**. Anything that does not agree is listed in plain words with what it is worth.

- **A price that has drifted** past your tolerance - the order said one figure, the invoice says another.
- **Being billed for more than turned up**, counting anything already invoiced on other bills against the same order.
- **Being billed for something nothing has been delivered against at all.**
- **A charge that is on no order line.**

The tolerances are yours, in **Settings → Purchase Orders**. A price tolerance of 2% is the sensible default - suppliers round, and being told about every three pence would train everybody to stop reading.

**None of it stops you approving the invoice.** Sometimes the supplier is right, the extra two arrived and are being kept. What matters is that the decision is written down rather than living in somebody's head, so the flags stay on the bill afterwards.

A bill with no purchase order behind it says so and nothing more. There is nothing to check it against, and a green tick claiming otherwise would be a lie.

The check is re-run every time you open a bill, so a delivery booked in an hour after the invoice was typed changes the answer straight away. Once somebody has approved it, it stops moving: what was approved is what was true at the time, and a later delivery does not get to tidy it away.

### Their invoice, attached

Drop the supplier's own PDF - or a photograph of it - onto the bill. It is kept in your media library under **Purchasing → Supplier invoices → the year**, so a folder of purchase invoices is something you can browse rather than a heap only this screen can see. PDF, JPEG, PNG or WebP, up to 15 MB.

Files are checked for being what they claim to be. **They are not scanned for viruses** - nothing on this platform is, and saying so plainly beats implying otherwise.

Replacing an attachment leaves the previous file in your library rather than deleting it. It stops being counted as in use, and you decide what happens to it.

### Its life

A bill goes **draft → approved**, with **queried** as the stop on the way and **void** as the exit.

- **Query it with them** keeps the question you asked on the bill, so the next person to look can see what was asked and when.
- **Approve it for payment** is the moment somebody says this is what we owe. The figures are fixed at that point - take the approval back, which is recorded, if it needs changing.
- **Void it** for an invoice that should never have been entered. An approved one is voided rather than deleted, so the record survives.
- Every move needs `purchase-orders.bills`. Agreeing to pay somebody is a different job from raising the order or booking the goods in, which is exactly why it is a permission of its own.

**In the books** is the last stop, and nothing but the books actually taking the entry ever puts a bill there. See below.

### Orders that close themselves

Once an order is fully delivered, every line has been invoiced in full, and no supplier still owes you a credit, approving the last bill closes the order. It saves going round afterwards ticking off orders that finished weeks ago.

It will not close one with a return still waiting on its money. Closing the order would file away the one screen showing that a supplier owes you.

### Straight into the books

Where you run the **UK Bookkeeping** module, approving a supplier's invoice also files it: an expense entry dated to the invoice date, one line per line on the bill, each under the category and VAT treatment you chose, with the supplier's own PDF attached as the evidence behind it. The bill then reads **In the books**, and it only ever says that because a set of books actually took it.

Some things worth knowing about it:

- **Nothing is ever recorded twice.** Press the button again as often as you like - and do, if the entry landed but the PDF did not.
- **The VAT that goes across is the VAT printed on their invoice**, not the VAT our arithmetic would have preferred. Suppliers who round line by line land a penny out on a long invoice, and the figure in your accounts has to be the one on the document.
- **The invoice itself is not copied.** The books point at the same file in your media library, so there is one copy of it, in one place, and tidying up the library will not quietly delete an accountant's evidence.
- **An exchange rate is applied once**, at the rate on the bill, so a euro invoice arrives in your own money.
- **Voiding a bill that is in the books takes it back out again.** If the VAT return it belongs to has already been filed, or a bank line has been matched to it, it stays put and a reversal goes in the open period instead - which is the only correct way to put a filed return right. That is also why an approval cannot simply be taken back once a bill is in the books: void it, and the books are told.
- **If the period is already filed**, the entry is saved as a draft for you to date yourself rather than being lost, and the bill says so.
- **Anything the books refuse** is written on the bill in their own words, with a **Try the books again** button beside it. It never stops you approving an invoice: the paperwork is right either way.

**Supplier credits go the same way.** When a return reaches *the credit has arrived*, the money comes off your expenses and the VAT off your input tax. It is filed against the purchase invoice where there is exactly one on the order and it is already in the books; otherwise it stands on its own, which is perfectly proper - goods often go back long before the invoice turns up. A supplier who credits less than you claimed is recorded at what actually arrived, spread across the lines. Where they credited particular lines instead, correct the return before marking it credited.

**You can switch the whole thing off** - see **Settings → Purchase Orders → Money → Put approved bills straight into the books**. Off is for the owner whose accountant keys purchases in from the bank statement and would rather not have them twice.

---

## Reordering

**Purchasing → Reorder** is the tab that buys things before you run out of them, and it needs the Shop module: it works out what to buy from what you have left, so something has to be keeping count.

### Setting a level

A level is two numbers against one product:

- **Order when it drops to** - how few you are willing to have.
- **Buy this many at a time** - usually however the supplier sells the thing. A box of twelve, a pallet of forty.

You can also say who to buy it from. Leave that alone and whoever your catalogue files the product under is used, matched against your own supplier list by name.

Only products something is keeping a count of can have a level - a level on a product nobody is counting is a level that can never be crossed. Picking a product borrows the low-stock level and the supplier already on it as a starting point, both of which you can change.

### What it does with them

Every time you open the tab, and once a night, the module works out for each level: what is on the shelf, what is already on its way to you, and whether the two together have dropped to the level. If they have, it buys whole lots of your reorder quantity - as many as it takes to get back above the level, so a product that has been under it for a fortnight is put right in one order rather than nudged along night after night.

**What is already on order counts, drafts included.** That is what stops the same order being raised every night until fourteen of them are sitting there. It also means a draft nobody ever sends holds the product back for ever - if a draft is not going to happen, cancel it.

Everything that should be bought is grouped into one draft order per supplier, with their terms applied:

- **Their minimum order value holds the order back** rather than padding it out. An order that is short is shown, with how far short it is, and left to grow. Nothing quietly adds four hundred pounds of something nobody asked for to clear a minimum.
- **Carriage follows their threshold.** Over it, carriage is left off; under it, their carriage charge goes on the draft, because they are going to charge it whether or not the paperwork mentions it.

The price on each line is the supplier's own current price list where you keep one and have switched them on, then whatever **that** supplier last charged you for that product, then the cost price in your catalogue. Two suppliers stocking the same chair at different prices never borrow each other's, at any of the three.

Anything that cannot be ordered is listed under **Waiting on something**, each with its own reason: nobody is set to supply it, the supplier is on hold, nothing is counting it, nobody said how many to buy, or the product has left the catalogue.

### Who actually presses the button

**Nothing is ever sent to a supplier.** Every order this raises is a draft, sitting on the Orders tab exactly as if you had typed it, waiting for somebody to read it, change it and send it. Drafts over your approval threshold still need approving, the same as any other.

**Raising them overnight is off until you switch it on** - Settings → Purchase Orders → Reordering. Off, the tab still works everything out and you press **Raise a draft order** against a supplier yourself; that button ignores the minimum, because you have looked at it and decided. On, the drafts are waiting for you in the morning.

---

## Buying for a customer order

Somebody has bought three chairs and a desk from you and you buy every one of
them in. Open the order under **Shop → Orders** and there is a **Purchasing**
panel on it.

The panel works out, before you touch anything, what would be raised: one draft
purchase order per supplier, what each one comes to, and which lines nobody can
buy and why. Press **Order this from the suppliers** and exactly that is what you
get. Nothing is emailed to anybody - they are drafts, sitting on the Orders tab
for somebody to read and send.

**Everything goes straight to the customer.** Each draft is addressed to the
delivery address off the customer's order rather than to you, copied across
exactly as they typed it. The supplier is buying the parcel a journey, not two.

**Each line names the service that line has to be sent on**, in the words the
customer bought - flat-packed, pre-assembled, and the date they were promised.
What that service costs sits on the order as carriage, which is where this
module has always kept delivery money.

**The price is what the product costs you, never what the customer paid.**
Delivery is bundled into the price on the customer's order, so buying at that
figure would pay the supplier your customer's carriage twice over. A supplier's
own price list is used ahead of your cost price where you keep one - see
[Pricing orders off them](#pricing-orders-off-them).

**Their code, not yours.** Each line goes out under the supplier's own code where
your product records one (**Shop → the product → Product codes → Supplier SKU**),
and under your SKU where it does not, which is what a supplier who has never
given you a code of theirs reads it as anyway.

**Pressing it twice does not order twice.** The panel lists what has already been
raised for that order and says so instead. Cancel those first if you genuinely
want to start again - a cancelled purchase order is a decision to buy it
differently, so it never blocks a second attempt. A customer order that has been
cancelled or refunded is not bought for at all.

Lines that cannot be bought are listed underneath with a sentence each: nothing
says who supplies it, nobody on your supplier list is called that, the supplier
is on hold or switched off, or the product has left the catalogue. Nothing is
dropped in silence, and nothing stops the rest of the order being raised.

Raising them needs `purchase-orders.create`, and the panel is only there at all
for somebody who can see purchasing.

---

## Suppliers' price lists

**Purchasing → Catalogues** is where a supplier's own catalogue lives, so an order can be drafted at what they are charging today rather than at whatever was typed into a product when it was created.

It needs nothing else installed. A supplier publishes a price list whether or not you sell anything online, and the shop only comes into it for two conveniences, both of which say so on the screen when it is not there.

### Putting a list on file

A list belongs to one supplier and has a name - whatever they call it. "Seating 2026", "Trade price list", "Spring". You can also record where it lives, and when it starts applying.

If you have the Shop module, your shop already keeps a list of each supplier's catalogues, and you can simply **pick one of those** rather than typing the address again. Doing that brings the address across and remembers which one it was, so the same link is not kept in two places drifting apart.

Nothing is ever fetched from that address. It is there so whoever goes looking next time knows where to look.

### Importing the prices

Upload the supplier's spreadsheet as a CSV. A column of codes and a column of prices is enough, and the headers can say whatever they already say - "Supplier SKU", "Product code", "Code", "Trade price", "Net price" and a good many others are all understood. Where a list carries both a trade price and a retail one, the trade price is the one taken.

Pack size, minimum order quantity, lead time, discount group and a discontinued column are all read as well, when they are there.

**You are shown what the file would do before anything happens.** How many prices are in it, which column was read as what, and - comparing it against the list already on file - what is new, what has gone, what has moved price, what they have stopped selling, and what has come back under a **new code**. That last one is why the comparison exists: a supplier who reissues the same chair under a new number leaves everything you sell under the old one quietly unbuyable, and nothing else on your site would ever tell you.

Then you press the button, or you do not.

Two things are worth knowing:

- **An import replaces the list.** A price list is a statement about a whole range on the day it was published, so anything on file that is not in the file goes. Merging would keep last year's codes alive for ever, which is the exact thing this is here to prevent.
- **A file that reads as nothing is refused.** Every price a supplier has disappearing because somebody uploaded the wrong sheet is not the sort of thing a confirmation box makes acceptable.

Rows that cannot be read - no code, a price that says "POA", a code in there twice at two different prices - are listed one by one with the row number the spreadsheet shows, and the rest of the file still imports. Nothing is dropped in silence.

### Pricing orders off them

**This is off until you switch it on** - Settings → Purchase Orders → Suppliers' price lists. You can get lists on file and ready either way; nothing is priced off them until you say so.

With it on, an order line for a code one of that supplier's lists names is drafted at **their** price, and the line says which list it came from. Everything else carries on exactly as before: a code no list names is priced at what the product says it costs. That goes for lines you pick yourself, lines the reorder job suggests, and the purchase orders raised straight off a customer order.

Where a supplier has two lists carrying the same code, the one imported most recently wins. That is the list somebody has just been handed.

### Checking your shop against their list

**Check the shop against a supplier's list** takes every product your shop files under that supplier and matches its code against everything on their current lists. It changes nothing at all; it tells you three things, each with a sentence you can act on:

- Codes their list **does not name** - renumbered, or the list needs importing again.
- Codes they have **stopped selling** and you are still selling.
- Prices that have **drifted apart** by more than the difference you have said you can live with on an invoice.

Codes on their lists that you do not sell are counted, not listed. A supplier's range is always bigger than yours, and four thousand lines saying so helps nobody.

---

## Reports

**Purchasing → Reports** answers the five questions a purchasing person actually asks, and it needs nothing else installed to answer them. Everything on it is worked out the moment you open it, so a delivery booked in ten minutes ago has already changed the answer - there is no overnight figure sitting there going stale.

> **One currency.** Every figure on the page is in the currency you keep your books in. An order placed in euros is converted at the rate it was raised at, and a supplier's invoice at the rate on the invoice. So the committed figure is an expectation and the spend figure is what you were actually billed, which is the honest way round.

### Committed and not yet received

What you have promised suppliers and not had, by supplier. **Sent orders only** - an approved order still sitting in the tray is a decision, not a commitment: nobody outside the building knows about it, and nothing would turn up if everybody went home. Anything cancelled or closed is off it, and so is anything you have already had.

### Late

Every order past its date with something still owing, worst first, with what it is worth and how many days it has been. The date it is judged against is the one the supplier gave you, falling back to the date you asked for. An order with neither has no date to be late against, which is a gap in your paperwork rather than a late delivery, and it says so.

Beside each one is what chasing has done about it, or why it has not.

### Arrived, not invoiced - and invoiced, not arrived

The two halves of the same question, and between them the reason a purchasing system is worth keeping.

- **Arrived, not invoiced** is what you are going to be billed for and have not been. Anything you have sent back is taken off first - the supplier is not going to invoice you for that. This is the figure an accountant asks for at a year end.
- **Invoiced, not arrived** is a supplier billing you for something nobody has seen. Worth a telephone call rather than a payment.

Both are worked out from the same quantities the order screen shows, so they can never disagree with it. Both leave cancelled orders out and keep closed ones in: closing an order is somebody saying the goods business is finished, which says nothing at all about whether the invoice ever turned up.

### Spend

Choose a window - the last twelve months to start with - and the module shows what you have spent, three ways: by supplier, month by month, and by expense category.

**Spend is what somebody has agreed to pay**: invoices you have approved, and ones already in your books. A draft nobody has looked at and a queried one nobody has settled are not spend yet, and a void one never was. Credits from returns come off it.

**All of it excludes VAT**, which is the figure worth comparing one supplier against another and the only one the category breakdown can produce. The category breakdown comes off the invoice lines, so carriage - which hangs off the invoice rather than off any line - is not in it; that is why it can come to a little less than the supplier table above it.

Category names come from UK Bookkeeping. Without it the column shows whatever was typed on the lines, and says so.

### Chasing a late supplier

Switch **chasing** on in settings and a supplier whose order is late gets a short note asking where it has got to - once it is however many days late you said, and then on the repeat you said. Set the repeat to zero and they are asked exactly once, which is what most people want and what nobody expects a "repeat every 0 days" box to mean, so it is worth saying out loud.

Nothing is changed by a chase. It is a question: the order keeps its status, its dates and its lines, and all that is written is a line in its history saying somebody asked. If you have the supplier link switched on, the note carries a fresh one, so they can tell you the new date rather than write back.

Some things stop a chase, and each says which:

- The order is not out with a supplier - a draft, or one awaiting approval.
- Everything on it has arrived.
- It is **on hold**. Putting an order on hold is you saying leave it alone, and a job that emails the supplier anyway has ignored the only instruction it was given.
- Nobody put a date on it.
- The supplier has no email address on file.

**You can send one yourself** from this tab whether or not chasing is switched on, and whether or not the repeat interval has run - either **Chase** on a single order, or the button that does everything currently due. The one thing no button can supply is an email address.

A chase is only recorded once it has actually gone. A chase written down for one that bounced is exactly what would stop the next one being sent.

### Taking it away with you

Four spreadsheets, over the same dates as the spend window:

| File | One row per |
|---|---|
| **Orders** | Purchase order, with its totals, dates and terms. |
| **Order lines** | Line, with what was ordered, received, invoiced, returned and still outstanding. |
| **Deliveries** | Line of a delivery: what turned up, what was rejected and why. |
| **Supplier invoices** | Invoice, with its match, its variances and whether their own PDF is attached. |

Amounts go out as plain numbers with the currency in a column of its own, so a spreadsheet adds them up rather than treating them as text. A file stops at twenty thousand rows.

### The tile on your dashboard

Your admin dashboard gains a **Purchasing** tile for anybody with permission to see the section: how many orders are out with suppliers, what they are worth, how many are late, and how many supplier invoices are waiting to be checked. It reads off exactly the same figures as this tab, so the two cannot tell you different things.

---

## The order itself

Every purchase order has a document: the sheet the supplier reads, files and quotes back at you. You design it, once, and every order is printed from it.

**Appearance → Layouts → Purchase Orders → Purchase order document.** Three starting points come with the module:

- **Standard purchase order** - published for you the moment the module is installed, so there is never a moment where an order will not print. Heading, both addresses, where the goods are going, the lines, the money and your terms.
- **Designed purchase order** - the same order laid out properly: a rule in your own colour under the heading, the delivery address in a panel, a banded line table, and the instruction to quote your order number where nobody can miss it.
- **Just the order** - heading, supplier, delivery address, lines. For a business that agrees its terms once and would rather not reprint them on every sheet.

### The blocks

Drag them about, drop the ones you do not want, and every one of them has its own colours, sizes and wording:

| Block | What it prints |
|---|---|
| **Heading** | The word "Purchase order", your order number, the dates, your account number with them, and the revision flag on an amended order. |
| **Who it is between** | Their details and yours, side by side. |
| **From** / **To** | The same two, one at a time, for a layout that wants them in different places or at different sizes. |
| **Deliver to** | Where the goods actually go - which on a drop-shipped order is neither address, and is the single most misread line on a purchase order. |
| **Lines** | What you are buying: description, their code, quantity, unit cost, line total. |
| **Totals** | Goods, discount, carriage, VAT and the order total, with the currency beside it. |
| **Terms** | Your standing terms from settings, plus this order's payment and delivery terms. |
| **Notes** | Whatever was typed on the order *for the supplier*. Notes for you never appear here and cannot be made to. |
| **Authorised by** | Who raised it, who approved it, and a line to sign if you print them out. |
| **Notice panel**, **Document style**, **Divider** | A sentence in a panel, the document's colours and spacing in one place, and a rule. |

The **small print at the foot of every page** is not on this list, deliberately. That comes from the one **Document footer** layout shared by everything your site prints, so your registration line is designed once and appears on the purchase order, the invoice, the credit note and the quote alike. See [Appearance and design](Appearance-and-design).

The notice panel and the terms accept placeholders - `{{ORDER_NUMBER}}`, `{{REQUIRED_BY}}`, `{{TOTAL}}` and a dozen more, listed under the box you type them into. A placeholder with nothing behind it disappears rather than printing itself.

### Paper and margins

With nothing selected in the editor, the left panel shows the **page settings**: the paper size, the margins and the print scale. They are the same settings the invoice and the quote use, so paperwork that ends up in the same folder is set on the same sheet.

---

## Sending it

Open an order and there is a **The document** card:

- **View document** opens the order exactly as it prints.
- **Download PDF** saves it.
- **Email it to the supplier** sends it, with the PDF attached, to the address on the supplier record - copying in whatever else that record lists.

The email goes first and the order is only marked as sent once it actually has. If it will not go you are told why, in the words the mail service gave, and the order stays where it was. An order marked "Sent" that nobody ever received is how a business ends up waiting six weeks for goods it never ordered.

Anything typed into the **Note** box travels with it, and is recorded against the order either way.

If your site has no email set up, or the supplier has no email address on file, you are told so plainly - and the PDF is still there to attach to your own email by hand. Marking an order as sent without emailing it is still there too, under **What next**: plenty of orders go by phone or over a trade counter.

**An order over your approval threshold cannot be emailed until it has been approved.** That holds whichever button you press.

---

## Changing an order they already have

Edit an order that has gone out and Cactus asks one question: **what has changed.** Answer it and:

- The version the supplier is holding is filed as a **revision**, exactly as it was printed, and never changes again.
- The live order moves on to Rev 2, Rev 3 and so on, and the document prints that revision number where nobody can miss it.
- The **Send the amended order** button emails them the replacement, on the amendment wording rather than the original.

Past revisions are listed on the order with who made each change, when, and why.

Amending is possible while the supplier can still act on it - sent, acknowledged, part received, on hold. An order that is finished with - fully received, closed or cancelled - is history, and raising a fresh one is the honest thing to do.

---

## The supplier's own link

Switch **the supplier link** on in settings and every order you email carries a link of its own. It opens that one order, and nothing else on your site.

What the supplier sees is the order exactly as it prints, and under it a short panel where they can:

- **accept it** - "yes, we can supply this";
- **offer a different date**, if what you asked for is not going to happen;
- **say something is short**, line by line, with how many they cannot send;
- **leave a message** about anything else.

**None of it changes your order.** Accepting it marks the order as acknowledged, which is the one thing it does. A date or a shortage is written down against the order for you to act on - your prices, your quantities and your terms are exactly where you left them. A purchase order somebody else can edit is not a purchase order.

### Handling what they say

Open the order and there is a **What the supplier said** card, newest first. Where they have offered a date there is a **Use 2026-05-04** button, which moves the order's expected date and records that you did.

A shortage has no such button, on purpose. Cutting a line down is a change to an order they are holding a copy of, so it goes the proper way round: amend the order and send them the replacement, or use **Give up on the rest** on the line where that is really what has happened.

You are emailed each time a supplier says something, so nothing waits for somebody to happen to open the screen. That email goes to the purchasing address in **Who is buying**, or to your shop's contact address where you have not filled that in.

### Making and stopping links

The **The supplier's link** card on each order lists every link ever made for it: when, by whom, how long it lasts, and how many times it has been opened.

- **Make a link** makes another one, for the day somebody at the supplier cannot find the email. An order has to have been sent first - a link to a draft is a link to prices nobody has agreed yet.
- **Stop it** ends one link. **Stop every link** ends the lot, for the day one is forwarded to the wrong supplier.
- Links expire on their own after however many days you set, sixty by default.

**A link is shown once, at the moment it is made.** It is not kept anywhere afterwards, only a fingerprint of it, so nobody - including us - can look it up again. If it is lost, make another one and stop the old one. That is a small inconvenience in exchange for a stolen backup carrying nothing that opens anything.

Nothing about the supplier's page is guessable, either: the number in the address is no use without the link, and a link made for one order will not open the next one along.

---

## The returns note

The second document the module prints, designed exactly the way the order is: **Appearance → Layouts → Purchase Orders → Returns note**. Two starting points come with it.

- **Standard returns note** - published for you the moment the module is installed, so a return will always print. Heading, both addresses, why the goods are going back, what is in the box and what you expect to be credited.
- **Designed returns note** - the same note in your own accent colour, with the reason in a panel where nobody can miss it and the amount you are owed spelled out at the top.

Its blocks are its own - a heading that always carries the order number, the two addresses, the reason, the lines, the credit due, notes and terms, and a notice panel - but the **Document style** and **Divider** blocks are the same ones the order uses. Design your purchasing paperwork once and you have designed both.

Two small things worth knowing:

- **The order number cannot be hidden.** A return a supplier cannot file against an order is a box on their dock and a mystery.
- **The credit prints as a positive figure** with a label saying what it is. A minus sign under a heading that already says "returns note" only invites the question of which way round it is meant.

---

## Settings

**Settings → Purchase Orders.**

- **Numbering** - the prefix on order, goods-received and returns numbers. Changing a prefix only affects what comes next; everything already raised keeps the number it was given.
- **Approvals** - whether, and over what.
- **Checking what arrives** - how much over-delivery you will accept without a flag, and how far a supplier's invoice may drift from your order on price and on quantity before it is queried. All three are in use.
- **Add goods to stock when they arrive** - off by default, and greyed out entirely on a site with nothing keeping stock counts. It covers both directions: deliveries add, returns take off. See [Checking goods in](#checking-goods-in).
- **Where goods normally go** - your own address, filled in once.
- **Money** - the currency you keep your books in. Suppliers may of course bill you in theirs; each order and each bill carries its own currency and its own exchange rate. Also the expense category a bill line falls back to when nobody picked one, and **Put approved bills straight into the books**, which is on where you run UK Bookkeeping and greyed out where you do not.
- **Who is buying** - your own name, address, contact details, VAT number and company number, as they print at the top of an order. Leave a box empty and, where you run the Shop module, whatever is on your invoices is used instead - there is no need to type your VAT number twice. Also the start of the filename a saved PDF gets.
- **Wording on the order** - the heading, the opening line, your terms, and a footer note. **These are frozen onto an order the first time it is sent**, so re-wording your terms next March does not quietly re-word an order somebody accepted last year.
- **Wording on a returns note** - its own heading, opening line and terms, plus the start of the filename a saved note gets. It has its own wording because "please supply the following" on a note about goods going back is quite the mixed message.
- **Reordering** - whether draft orders are raised overnight from your reorder levels. Off by default, and greyed out on a site with no catalogue. See [Reordering](#reordering).
- **Suppliers' price lists** - whether an order line is priced off a supplier's own list where one names the code. Off by default. You can keep lists on file either way; this is the switch that lets them price anything. See [Suppliers' price lists](#suppliers-price-lists).
- **Chasing and the supplier link** - whether a supplier hears from you when an order is late, how late it has to be, and how often to ask again; and whether every order you send carries a link of its own, and how long those links last. See [Chasing a late supplier](#chasing-a-late-supplier) and [The supplier's own link](#the-suppliers-own-link).

---

## What it does with your other modules

Purchasing works out for itself what else is on the site, and every screen behaves accordingly. Nothing disappears: a tab that cannot do its job says so and names the module that would let it.

**With the Shop module:**
- Order lines can be picked from your catalogue.
- Suppliers can be linked to the supplier names your products are filed under.
- Your trading identity is borrowed from your invoice settings for any box you leave blank in **Who is buying**.
- Goods can be taken into stock as they arrive, if you switch it on - and whoever is waiting for that product to come back is emailed at the same time. Goods sent back come off the count the same way.
- Reordering works at all, since it needs something keeping count to work out what to buy.
- A supplier's price list can be picked from the catalogues your shop already records for them, and your products can be checked against the codes and prices they currently publish.
- A customer's order can be bought in at the press of a button, one draft per supplier, delivered straight to them - see [Buying for a customer order](#buying-for-a-customer-order).

**With the UK Bookkeeping module:**
- Bill lines can be filed under your own expense categories as you type them, and the spend report names those categories rather than only their references.
- Approving a supplier bill files it in the books as an expense, with their own invoice attached as evidence. Voiding it takes it back out. A supplier credit reduces what you spent and the VAT you reclaimed. See [Straight into the books](#straight-into-the-books).

**With neither:**
- Everything above is either typed in by hand (lines, suppliers) or honestly switched off (stock, reordering, the books). Suppliers, orders, approvals, deliveries, returns, bills, chasing, price lists, the exports and every report on the Reports tab work exactly as they do anywhere else. A price list is a purchasing thing: you can keep one, import it and price orders off it with no shop on the site at all. Approved bills simply stop at approved - a purchasing record with the supplier's own invoice attached, rather than a ledger entry.

---

## Emails

Six emails are yours to word, under **Settings → Emails → Purchase Orders**. Five go to the supplier - the order itself, an amended order, a chase when it is late, a cancellation, and a returns note - and none of those can be switched off, because a supplier who never sees your cancellation is a supplier who delivers it anyway. The sixth comes the other way: **a supplier replied through their link**, which lands with whoever is doing the buying.

The order, the amended order and the returns note carry the PDF as an attachment. The chase does not: the supplier already has the order, and sending the same document again reads as a fresh one. If the PDF will not print for some reason, the email still goes with the lines in the body: an order that reaches the supplier beats one that does not because the paperwork sulked.

The order, the amended order and the chase all offer a `{{portalLink}}` tag, which becomes the supplier's own link and disappears entirely when the link is switched off. It is in the wording as it ships. **If you have already reworded one of those emails yourself, your version is the one that sends** - drop `{{portalLink}}` in where you want it and the link starts travelling with them.

---

## Installation

Install the module from **Modules** in your admin, then grant whichever of the seven permissions each of your roles should have. There is nothing to configure before it will work: the settings all have sensible defaults, and the only one most sites will want to change straight away is the address goods should be delivered to.

---

## Who can open the document page

Both documents have an address of their own, and they are deliberately not public. Anybody signed in with `purchase-orders.access` can open them; the thing that prints the PDF gets a signed link that stops working half an hour after it is made; and a supplier holding a live link of their own can open that one order. Nobody else can read one, even knowing the number - and a link made for an order will not open a returns note, or the other way about.

That is on purpose, and it is different from an invoice. An invoice is a customer's own record and they get a permanent link to it. A purchase order is what *you* pay *your* supplier, the numbers run in sequence, and there is nobody outside the building who should be able to count their way through them.

A wrong link, an expired one or a stopped one gets the same "page not found" as a number nobody has used yet. That is deliberate: there is nothing to be gained by telling somebody which of the four it was.
