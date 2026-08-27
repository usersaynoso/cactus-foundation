# UK Bookkeeping

Keep your books on your own site, file your VAT return straight to HMRC from the
same place you keep the receipts, and get a proper set of accounts and a
corporation tax computation out of the same records at the end of the year.

---

## 1. What this does, and what it does not

**It does:** records what you spend and what you take, keeps the receipt with the
entry, works out your VAT return from those records, and files it with HMRC. It
takes receipts and invoices the day they arrive, before there is an entry to
attach them to, reads what it can off them, and offers them back to you against
the right payment when your statement comes in. It reads a bank statement - CSV
or PDF - and ties it back to what you have already recorded, so you can see
whether the two agree. Behind all that it keeps one
proper set of double-entry books, which is what lets it give you a profit and
loss account, a balance sheet that adds up, a trial balance, and the full history
of any single account down to the receipt. It keeps a register of your equipment
and spreads the cost over the years you use it. It closes the year off when you
are ready, and then works out your corporation tax and hands you every box number
for the company tax return. It keeps journals for the things that are not money
moving, and a director's loan account for money you put in and take out. It keeps
a frozen copy of every return you file, and it locks the entries behind a filed
return so nobody can quietly change history.

**It does not:** run payroll, track stock, or send invoices to your customers. It
does not handle the Flat Rate Scheme, partial exemption, margin schemes or bad
debt relief. It is not Making Tax Digital for Income Tax. It handles one VAT
registration per site. It does not work out anybody's personal tax, including on
a director's loan - it shows you the position and points you at your accountant.

**And it does not file your corporation tax return.** That is not an oversight.
HMRC has an interface software can use to file a VAT return; it does not have one
a small company can use to file its company tax return. So the module does all
the working out and gives you every figure with the box number beside it, and the
last step is copying those into HMRC's own online service, or handing the page to
whoever does that for you.

The important bit: **you never type a VAT box figure.** Every one of the nine
boxes is worked out from your entries, and there is no box on any screen you can
type into. That is what HMRC means by digital links, and it is the whole reason
this exists in the shape it does. The corporation tax computation follows the
same rule: every figure on it comes from something you can go and look at. What
you type there is a judgement - "£340 of that lunch was entertaining a client" -
never an answer.

---

## 2. Before you start

You will want:

- Your VAT number.
- To know whether you are on the standard scheme (VAT counts when you invoice) or
  cash accounting (VAT counts when the money moves).
- To know how often you file - usually every three months.
- A Government Gateway login for the business, if you want to file from here.

---

## 3. Getting started without HMRC

You do not need HMRC to start, and it is worth not bothering with them until you
have seen this working.

Go to **Settings → Bookkeeping** and fill in your business name, VAT number,
scheme and how often you file, plus the dates your first VAT period starts *and
ends* - both are on your HMRC registration letter and in your VAT account.

The end date matters more than it looks. HMRC ends every return period on the
last day of a calendar month (quarterly filers sit in one of three "stagger
groups": periods ending Mar/Jun/Sep/Dec, Apr/Jul/Oct/Jan or May/Aug/Nov/Feb),
so the first period runs from the day your registration took effect to the end
of your first stagger month, and is rarely a neat three months. Registering on
10 July with periods ending in October gives a first period of 10 July to
31 October; every period after that follows calendar months. If you leave the
end date empty we assume the nearest month end, which is right for most people
but can be a month out either way - HMRC's letter settles it.

Each period is laid out with its due date: one calendar month and 7 days after
the period ends (the 31 October period is due 7 December), which is also the
day the payment must have cleared. Annual accounting differs - two months after
the period ends - and any period matched to a real HMRC obligation shows HMRC's
own due date instead.

Changed the dates after periods were already laid out? Press **Lay out periods
from my settings** on the VAT returns screen: untouched periods (open, nothing
finalised or filed against them) are re-laid to match; anything with history is
left exactly where it is.

Then open **Bookkeeping** in the sidebar and start recording.

The first tab is an **Overview**: where the VAT stands so far this period, when
the next return is due and how many days you have, this month's money in and
out, anything still waiting for review, and your latest entries. Every figure on
it links to the screen where you can act on it.

From here everything works except the actual filing: entries, receipts, the nine
boxes, reports, exports, and marking a return as filed once you have sent it some
other way. Most people run it like this for a few weeks first, and some people
run it like this forever.

### Recording entries

The entry form suggests names you have dealt with before as you type, and when
you pick one it pre-fills the category their entries usually go under - a
suggestion only, and it never overrides a category you have already chosen.
Pressing Enter saves.

**"What it was for" is asked on each line, not once at the top.** The top of the
form is who it was with, when, and their invoice number; underneath, "What it was
made up of" is where you say what you actually bought or sold. One line is
usually plenty, but a receipt with a tank of fuel and a sandwich on it is two
things, taxed differently, and one box at the top could only ever hold one of
them. The entries list shows the lines folded into one line of text, so a receipt
for three things reads as all three rather than the first one.

Entries recorded before this changed keep their wording: the text that sat at the
top is handed down to the lines the first time you open one to edit it.

**"Date it was paid" starts empty, and empty means not paid yet.** Fill it in
when the money actually moves. Until you do, the entry counts as outstanding: it
sits under **Who owes what**, aged from the invoice date, and it shows in what
you are owed or what you owe on the balance sheet. Filling it in is what settles
the entry and moves the money through a bank account.

It used to arrive pre-filled with today's date, which meant a bill typed in on
the day it landed recorded itself as already paid unless you noticed and cleared
the box. If you have entries from before this changed that you have not actually
paid, open them and clear the date - they will move onto **Who owes what** where
they belong, and the bank figure they were wrongly taken out of goes back up.

**"Paid from" says which account the money moved through.** It only appears once
you have set up an account under **Settings → Bookkeeping → Bank accounts**, and
a new entry starts on the first account in that list. Change it when the money
came from somewhere else: the card, the petty cash tin, or a balance you hold
with a supplier. On a sale it reads "Paid into" and means the same thing the
other way round.

Getting this right is what keeps the bank column honest. An invoice paid out of
a prepaid balance never touched the bank, and saying so is the difference
between a bank figure that matches your statement and one that quietly does
not.

The box used to start on "Main current account", which sounds like one of yours
and is not: it is a built-in account that exists so entries have somewhere to
settle before you have set any accounts up. Leaving the box alone therefore put
the payment somewhere you never reconcile, and the balance sheet grew a **Bank
current account** line for money that had actually left your real account. If
you have entries from before this changed, the reports page now names them - it
says how many there are and what they add up to - and the fix is to open each
one and set the account it was paid from or into. An older entry keeps whatever
it was saved with until you do; nothing is moved behind your back.

**Changing the VAT rate re-splits the figure you typed.** Type a total and put
the line on 20%, and the VAT comes out of that total: £20.00 becomes £16.67 plus
£3.33, and the total stays £20.00. Type the net figure instead, off an invoice
that shows the two separately, and the VAT goes on top of it. Whichever box you
last typed in is the one that holds still, which matters most on an entry brought
in from a bank statement: the total there is the money that actually left the
account, and it should not move because you told the entry what rate it was at.

**"No receipt needed for this one" is a tickbox at the bottom of the top card.**
Some entries are never going to have a receipt: money put onto a balance held
with a supplier, a bank charge, a payment on account. Tick it and the entry stops
counting as paperwork still owed - it drops off the "waiting for a receipt"
figure on the overview, the nag on the entry goes, and the entries list shows a
grey cross in the evidence column rather than a blank, so "dealt with" reads
differently from "nobody has looked at this yet". Nothing else changes, and you
can still attach something later if it turns up. Nothing ticks it for you: a
receipt that is genuinely missing and one that is never coming look identical
from here, and only you know which is which.

The **Evidence** filter on the entries list now offers **Still needs one**, which
means no receipt and not ticked, and **None needed** for the ticked ones.

**Buying something that lasts: tick the box on that line.** When you pick a
capital category - "Equipment and other capital purchases" - a tickbox appears on
that line saying **Put this one on the asset register**, ticked already. Leave it
ticked and the purchase starts an entry under **Bookkeeping - Assets** for you to
finish off later. Untick it if the line is a deposit or a part payment towards
something that is already on the register.

The tick is on the **line**, not on the entry, and each ticked line starts its
own asset. A receipt with a desk and a chair on it is two things that wear out at
their own pace, so it becomes two entries in the register, not one. The box of
pens on the same receipt is not ticked and stays an ordinary cost.

This matters more than it looks. A capital purchase that never reaches the asset
register claims no capital allowances, so your corporation tax bill is bigger
than it needs to be by roughly the cost of the thing - and nothing anywhere else
on the site would ever have mentioned it.

### Categories

Categories are the choices in the "Category" box on every line of an entry, and
twenty-odd of them arrive ready made, covering every box of the
self-assessment pages. Most people never touch them.

Add one when a cost is big enough, or regular enough, that you would rather see
it on its own line in the reports than lumped in with everything else. Hosting
and domain names are the usual example: they land in "Phone, stationery and
office costs" by default, alongside the phone bill and the printer paper, which
is correct but tells you nothing.

**Settings → Bookkeeping → Categories** is where you do it. A new category needs
three things, and has a fourth you can usually ignore:

- **Name.** What you want to see in the list when you record something.
- **Money in or money out.** Or either way, for the handful of things that go
  both directions.
- **Where it belongs on the accounts.** Which box of the tax return it counts
  towards, in HMRC's own wording. Pick the one it would have gone in if you had
  not given it a category of its own.
- **Which account it posts to.** Leave this on "Make one for it". An account is
  set up behind the scenes, filed exactly where you said above, and you need
  never think about it again. The one time to change it is when what you are
  recording is not a cost at all, which is covered in the next section.

Every category has an account behind it, and each row says which one under the
category's name. That is the wiring rather than decoration: it is how a recorded
entry becomes a debit and a credit on your books. Categories added on older
versions of the module had none, and picked up an account the first time the
site updated after this was fixed. If one of them landed somewhere daft,
**Change** now lets you move it.

That last one is the one that matters. A category is a way of seeing your own
figures, not a way of changing them: splitting hosting out of office costs shows
you what the site costs to run, and still adds up to exactly the same box 24
total on the return. If you are not sure which to pick, pick the one the cost is
sitting in today.

New categories arrive at the bottom of their list. The arrows move one up or
down, and the order you put them in is the order they appear in on every entry
form, so it is worth putting a new one next to the thing it was split out of.

**Change** renames a category, or moves one you made yourself to a different box
if you filed it wrong to begin with. Renaming is safe at any time, on any
category: entries already recorded follow the new name rather than keeping the
old one.

The ready-made ones keep the box they came with, and the dropdown is not offered
for them. If yours needs to count somewhere else, put the ready-made one away and
add your own filed where you want it. That is the better answer anyway: it leaves
everything you have already recorded pointing at a category that still says what
it always said, which is rather the point of keeping records for six years.

**Put away** takes a category off the list without touching anything filed under
it, which is what you want when a category has had its day. **Show the put-away
ones** brings them back into view, with a button to put them back on the list.
**Remove** only genuinely removes a category that nothing has ever been filed
under and that did not arrive ready made. Anything else is put away instead,
whatever the button says, because a return from six years ago can only explain
itself if the categories it points at are still there.

### Money you have paid a supplier in advance

Some suppliers want paying before they will sell you anything. You put twenty
pounds on the account, they email a statement saying so, and then each month
they bill you for what you actually used and take it off the balance. Phone and
messaging services do it, so do postage accounts and some advertising.

The twenty pounds is not a cost. It is still your money, sitting with somebody
else, and the statement they sent is not a VAT invoice and does not let you
claim any VAT back. The cost, and the VAT with it, arrives later on each monthly
invoice.

Set it up once:

1. **Settings → Bookkeeping → Bank accounts**, add one. Name it after the
   supplier, something like "Acme prepaid balance", and set its type to **Cash**.
   It is an account of yours that happens to be held by somebody else.
2. **Settings → Bookkeeping → Categories**, add one. Call it something like
   "Money on account with Acme", money out, filed wherever the supplier's bills
   normally go. Then set **Which account it posts to** to the balance you just
   made, rather than leaving it on "Make one for it".

Then, from now on:

- **When you top the balance up**, record it as an entry for the supplier on the
  date the money left the bank, paid from your current account, using the
  category you made. Put the VAT rate to **Outside the scope of VAT**, because
  nothing has been sold to you yet. Attach the statement they sent. It reconciles
  against the bank line like anything else, and it never reaches your VAT return
  or your profit and loss account.
- **When the monthly invoice arrives**, record it as an ordinary entry for the
  supplier, with the real VAT on it and the category the cost actually belongs
  to, and set **Paid from** to the prepaid balance. Attach the invoice. That is
  the entry that puts the cost in your accounts and the VAT in box 4.

The balance drains down as the invoices land, and the reports show what is left
sitting with them under "Debtors and prepayments". If it ever goes below zero,
either a top-up has not been recorded or an invoice has been billed to the wrong
place.

### When your supplier charges no VAT and you account for it yourself

Some suppliers do not charge you UK VAT at all. An overseas one selling you
software or advertising, and a UK builder working under the construction rules,
both print **reverse charge** on the invoice and leave the VAT off it. That does
not mean there is no VAT on the purchase. It means **you** account for it, on
both sides of your own return: it goes in box 1 as owed and in box 4 as
reclaimed, so it costs you nothing and the two cancel out.

Pick the right one under **VAT treatment** on the entry - *Services bought from
overseas (reverse charge)* or *UK reverse charge* - and three things follow on
their own:

- **The VAT box goes to nothing and stays there.** Nothing is what your supplier
  charged you, so nothing is what the entry records. Your supplier is shown owed
  what they actually invoiced, and the entry matches the payment on your bank
  statement, which means it reconciles like any other.
- **The total is what you paid.** Not what you paid plus VAT that never changed
  hands.
- **The rate still matters.** Set it to the rate the purchase *would* have been
  at in the UK, which is nearly always the standard rate. Your return is worked
  out from that, so a wrong rate here is a wrong figure in boxes 1 and 4.

A receipt dropped on the **Receipts** tab is read for this too: an invoice
carrying the words "reverse charge", the EU wording, or the construction wording
is spotted and comes back with the treatment already set and the rate set to
standard. As with everything else it reads, you can change it before it becomes
an entry.

### Looking at a receipt you have attached

Click the file's name and it opens in a new tab: PDFs and photographs are shown
in the browser rather than saved to your computer first, which is rather the
point of attaching them. There is a **Download** link beside each one when you do
want the file itself.

Anything that is not a PDF or an ordinary photograph is still sent as a download
whichever link you click. That is deliberate and is not going to change: some
file types can carry instructions of their own, and a file the browser is willing
to run has no business being opened inside the admin.

### Receipts, before you have typed anything

Paperwork does not arrive in the order the books want it. The invoice comes by
email on the day, the bank statement turns up three weeks later, and the entry
gets typed at the weekend. So you do not have to have an entry before you can
keep a receipt.

**Bookkeeping → Receipts** is a pile of everything you have uploaded and not yet
filed against anything. Drop invoices and receipts on it the moment they land -
one at a time or forty at once - and forget about them.

**What it makes of a PDF.** As each one arrives it is read: who it is from, their
invoice number, the invoice date, the total, whether there was VAT on it and how
much, and - where the invoice says so - whether it is one of the ones where your
supplier charges nothing and you account for the VAT yourself. Everything it works out is shown on the card, and everything is a
guess you can change. **Fix details** opens the lot for editing.

Putting a name right is worth the ten seconds. It is not a chore because the
software failed - it is how it learns. Your bank prints `SQ *THE COFFEE SHOP
1234` and the invoice says "The Coffee Shop Limited", and nothing on earth
connects those two except somebody saying so once. Say it once, and every later
invoice from them, and every later statement line, knows.

**Photographs are kept but not read.** A photo of a till receipt has no text in
it, only a picture of some, and reading that needs a different kind of machinery
altogether - somebody else's service, an account, and a bill for every receipt.
So a photo uploads, files and counts as evidence exactly like a PDF; it simply
arrives with nothing filled in, and says so. Type the supplier in once and it is
remembered.

**Two ways to use the pile.**

- **From the receipt.** Press **Record an entry** on any card and the entry form
  opens with the supplier, the date, the invoice number and the amounts already
  in it. Check them, say what it was for, save. The receipt is attached on the
  way through.
- **From the entry.** Recording an entry the ordinary way shows a **Receipts
  already uploaded** panel above the form. Pick one and it fills the form in the
  same way. The same panel is on an entry you have already saved, where it
  attaches straight away.

Nothing in the pile is nagging you. A receipt can sit there for as long as you
like, and it is still safely stored and still in your media library the whole
time.

**Read again** re-reads a PDF. Worth it once you have dealt with a supplier a
few times: a name it could not place on their first invoice is one it knows by
their third. It leaves anything you have corrected by hand alone unless you ask
it twice.

**Throw away** removes the receipt from the pile, and asks one more question
before it does: whether to delete the file itself as well.

Left unticked - which is how it starts - only the receipt leaves the list, and
the file stays in your media library exactly where it was. Tick it and the file
goes from the library and from storage for good, which is not something that can
be undone, so the box says so.

Two things will stop it even when you have ticked the box, and it tells you
which: the same file being evidence on another entry as well, and anything else
on your site still pointing at it. In both cases the receipt still leaves the
list and only the file is spared. Deleting from the media library also needs
permission to do that - if you have not got it, you are told before anything is
removed rather than afterwards.

### Sales handed over by your shop

If this site also runs the Shop module and you have switched invoicing on there,
every invoice the shop raises arrives here on its own, as income, itemised.
Nobody types a sale in twice, and the figures are the ones the shop actually
charged rather than ones worked out again afterwards.

**Itemised means itemised.** The entry lists what was on the invoice - each
product with its quantity and stock code, and delivery as a line of its own -
each one with its own "what it was for" and its own VAT rate, exactly as if you
had typed it. An entry always comes to the penny what the invoice came to; where
the shop cannot break something down that far, that part is filed by VAT rate
instead. Older shops that do not send the detail yet are filed by VAT rate
throughout, which is what everything did before, and nothing is lost by it.

**Settings → Bookkeeping → Sales from elsewhere on this site** is where you say
what happens to them:

- **Take sales handed over automatically.** On to start with. Switch it off if
  you also bring the same money in from a bank statement, because counting a
  sale twice makes a wrong return rather than an untidy one.
- **File them under.** Sales and turnover unless you say otherwise. Any income
  category you have made will do.
- **Record them as.** Records straight away, or drafts for somebody to look at
  before they count towards a return.

Each sale is recorded once and once only, against its invoice number, so the
shop can hand the same invoice over twice without it landing twice.

**The invoice comes with it.** The shop's own PDF is filed against the entry as
evidence, in Media under Bookkeeping with the rest of your receipts, so the
document behind a sale is a click away when somebody asks. If it could not be
printed at the time, the shop's order screen says so and its "send to the books
again" button files it later.

**A voided invoice takes its sale back out.** When the shop withdraws an
invoice, the entry here goes with it - removed outright if the VAT return it
belongs to is still open, since it was never a sale. If that return has already
been filed, or the money has been matched to a bank line, the entry stays where
it is and a reversing entry is recorded in the open period instead: that is a
credit note, and it is the only way a filed return is ever put right. Nothing is
quietly rewritten either way, and both are in the audit trail.

**A refund credits part of it back.** When the shop refunds something it raises a
credit note, and that arrives here too. It is not treated as a void: the sale
stood, most of it still stands, and nothing about it was wrong - what has changed
is that some of the money has gone back, so that part is no longer turnover and
the VAT inside it is no longer owed. The original entry stays exactly where it
is and the credit is recorded against it, dated the day the money went back
rather than the day of the sale, so a return you have already filed is never
reopened. The rates are the ones the shop charged on the lines that were
refunded, which on a mixed basket is not a proportion of anything - handing back
the zero-rated half of an order and the standard-rated half are the same money
and completely different VAT.

A credit note is itemised the same way the sale is: the entry names the things
that were handed back, each as a negative line, rather than one lump per rate.

The credit note's own PDF is filed against it as evidence, and each one is
recorded once and once only against its credit note number.

The one thing this refuses is crediting an invoice that was never handed over -
if the sale is not here, there is nothing to correct, and filing the credit on
its own would push turnover below what was actually sold. The shop's order
screen says so and points you at its own "send to the books again" button for
the invoice first.

Two things worth knowing. A sale dated inside a VAT period you have already
filed cannot be posted - it would sit in a return nobody recomputes - so it is
saved as a draft instead and left for you to put right as a correction in the
open period. And a zero-rated sale is filed as zero-rated rather than exempt or
outside the scope of VAT: all three carry no VAT, but only the shop's own tax
table knows which it meant, and it only records the rate. If you sell something
genuinely outside the scope, record that one by hand.

### Purchases from elsewhere on this site

The same arrangement in the other direction. If this site also runs the
**Purchase Orders** module, approving a supplier's invoice there files it here
as an expense on its own - one line per line on their invoice, each under the
category and VAT treatment somebody chose while checking it against the
delivery. Nobody keys a purchase in twice.

There is nothing to switch on and nothing to set up. It appears when both
modules are installed and does nothing at all when they are not, and the switch
that governs it - **Put approved bills straight into the books** - lives with
the rest of the purchasing settings, since that is where the person doing the
buying looks.

**The invoice comes with it**, as a link to the file already in your media
library rather than a second copy of it. One document, in one place, and the
purchasing module's own housekeeping knows it is spoken for.

**The VAT is the VAT on their invoice.** A supplier who rounds line by line
where the software rounds once lands a penny or two out on a long invoice, and
the figure in your accounts has to be the one on the document anybody would be
shown. Where an invoice says reverse charge applies, no VAT goes on the line at
all: the rate is carried across and the return works the notional figure out
from it, which is what puts the same amount in box 1 and box 4.

**Withdrawing a bill takes the purchase back out.** Exactly as a voided sale
does: removed outright while the return it belongs to is still open, and
reversed in the open period once that return has been filed or the money has
been matched to a bank line.

**A supplier credit reduces what you spent.** When goods go back and the credit
arrives, the expense and the input VAT come off, dated the day the credit
arrived. Unlike a sales credit note, this does not insist the purchase is
already here - goods often go back long before the invoice turns up, and the
credit is real either way. Where the purchasing module can point at exactly one
posted invoice for that order, the entry corrects it; otherwise it stands on its
own.

Each bill and each credit is recorded once and once only, and anything refused
here comes back in plain words on the bill itself, with a button to try again.

### Importing a bank statement

First, tell it where your money sits. **Settings → Bookkeeping → Bank accounts**
is where you add your current account, your card, or petty cash. A statement is
imported *against* an account, so there has to be one before anything can come
in.

Then **Bookkeeping → Import**. Drop a statement anywhere on the card, or choose
it.

**A PDF works as well as a CSV.** Download the statement from your online
banking as either and it will be read: the table is found by looking at where
the columns sit on the page, the same way you would, so a bank we have never
seen still works. What will not work is a photograph or a scan of a paper
statement - there is no text in one of those to read, and it will say so rather
than guessing. Password-protected PDFs are refused too; save an unprotected copy
and import that.

Where the statement prints its own totals, they are checked against what was
read and shown back to you before anything is written: if the statement says
£261.95 went out and we only found £185.46, a line was missed and you will see
that on the screen rather than at the year end. The running balance down the
right-hand side is checked line by line for the same reason.

Then you look at what was read and bring it in. **You are not asked what any of
it was for at this point.** Saying that about two hundred lines, in one sitting,
before a single one of them is saved, is the job nobody finishes - and an import
abandoned halfway has kept nothing at all. So importing keeps the bank's lines,
exactly as the bank wrote them, and hands over to **Reconcile**, where they can
be explained a few at a time, in any order, and in bulk where they are alike.

Anything already brought in from an earlier statement is recognised and left
alone, so importing an overlapping range does not create January twice. The
screen says how many that is before you commit to anything.

### Reconciling

**Bookkeeping → Reconcile** is the question "does what the bank says match what
the books say", and it is worth asking every month rather than every year.

The statement lines are kept exactly as the bank wrote them - that is the point,
because once the bank's version has been thrown away the question cannot be
answered. Each one is either ticked off against the entries that explain it, or
still open. A line is only ticked off when the entries matched to it account for
**all** of it, to the penny; a line that is half explained stays open and says
so, because "£2 of this is unexplained" has a habit of turning out to be a
£2,000 typo.

Each line can go three ways, and every one of the three works on one line or on
a whole selection at once:

- **Tick it off against an entry you already have.** Most lines on most
  statements are things already recorded - a supplier invoice, a sale - and
  entering them again is the commonest way a set of books goes wrong. Where
  something in your books matches on amount to the penny, and on date and name
  closely enough to be sure, it is offered with the reason it was offered, so you
  can disagree. Where two entries are equally plausible, nothing is offered at
  all: a wrong match looks explained, so nobody ever looks at it again.
- **Say which invoice it was.** If the receipt is already sitting in
  **Receipts**, it is offered here with a paperclip beside it, and why it was
  offered. Press **That is the invoice** and the entry is written for you: the
  amount and the date paid from the bank, and the supplier, the invoice number,
  the invoice date and the VAT from the invoice itself. The VAT is taken exactly
  as your supplier printed it rather than worked out again from a rate - their
  rounding is the record, and they have already told us. The receipt ends up
  attached to the entry it paid for. You still say what it was for, because that
  is the one thing neither the bank nor the invoice knows. If the right receipt
  is in the pile but was not offered - a part payment, a photograph, an invoice
  dated months from the payment - **Pick a receipt** shows you the whole pile to
  choose from.
- **Record it as a new entry.** The date, the name, the reference and the amount
  come straight off the bank's own line, so the only thing to supply is what it
  was for. The category comes pre-picked from what you filed that name under last
  time. Entries are recorded properly unless you tick **Leave them for review**,
  in which case they go in as drafts and reach no VAT return until you post them.
- **Set it aside.** For the lines that genuinely need no entry - a transfer
  between two accounts you own, where the other side is already recorded - with a
  note saying why, because "why is this one ignored" is the question somebody
  will ask in a year.

**An invoice is only offered where it means something.** Its total has to be
this payment to the penny, or the name has to be an unmistakable match, and
never neither - the same rule as for entries, and for the same reason. A
suggestion that is wrong and plausible is worse than none at all, because it
looks explained and nobody looks again. A photograph nothing could be read off
is therefore not offered against anything until you have told it who it is from.

**Ticking a line off fills in two things on the entries behind it.** The date it
was paid, and which account it was paid from - both taken from the bank's own
line, and both only where the entry does not already say. A date you typed
yourself is never overwritten. This matters because an entry with no paid date
still shows as owed to the supplier however green the statement line looks, and
on cash accounting its VAT stays out of your return until it says it was paid.

**Deleting an entry puts its statement line back on the pile.** The line goes
back to unexplained rather than staying ticked off against something that no
longer exists. If you need to undo a match without deleting anything, open the
line and use **Not that one** beside the entry.

### When the amount does not match: card payouts

A card processor does not pay you what you invoiced. GoCardless and Square batch
a day's takings into one payout, take their cut out of the middle of it, and net
off any refunds as well. So a single line of £201.85 is two invoices worth
£215.00, less a £10.00 refund, less £3.15 of fees - and it matches nothing, to
the penny, because there is nothing to match.

Nothing is offered for a line like that, on purpose. Press **It paid several
invoices** on the line and pick the ones it covers. A running total sits
underneath: what you have picked, what actually arrived, and the difference
between them. Say what the difference was - **Bank and card charges**, already
chosen for you - and settle it.

What that does is record the fee as the expense it actually is: on the right
category, deductible, and visible in your accounts, rather than quietly lost by
matching an invoice at the wrong amount. Merchant fees are exempt from VAT rather
than zero rated, so that is what is filled in.

Refunds netted off a payout come out as a **minus** in the list, because that is
how the bank saw it. Tick one and it pulls the total down.

Nothing is guessed about which invoices make up a payout. Working that out from
the total is the kind of arithmetic a machine is confidently wrong at, and a
confidently wrong reconciliation is worse than none. If the picked entries and
the difference do not add up to the line exactly, nothing at all is written - you
get told, and the line is left as it was.

**Doing a lot of them at once.** This is the point of the **Find** box. Type part
of what the bank prints on your director's loan payments, tick the ones that come
back (or tick the box in the table header to take the lot), choose the category
once, and record them all in one go. The same works for a year of the same
subscription, or a run of internal transfers to set aside together.

If one line in a selection will not take what you chose - it is money in and the
category is for money out, or its date falls inside a VAT return you have already
filed - it comes back named, with the reason, beside the count of the ones that
went through. One awkward line never strands the other thirty-nine, and it is
never quietly skipped either.

The top of the screen shows where you stand: what the bank last said the account
held, how many lines nobody has explained, and how much they come to. It also
tells you the other way round: entries in your books with no statement line
behind them at all, which usually means the statement they belong to has not
been imported yet.

### Journals

**Bookkeeping → Journals** is for the entries that are not money moving.
Depreciation. A cost that belongs in this year but will not be billed until
next. A bill paid in advance, part of which belongs to next year. Something
posted against the wrong thing. Money a director put in or took out other than
through the bank.

A journal has two sides and they have to add up - the database refuses a posted
one that does not, and says how many pounds apart the two sides are. There are
starting points for the handful most small companies actually need, which fill
in the wording and the two accounts and leave the amounts and the date to you.

**A journal never touches a VAT return.** Nothing posted here reaches any of the
nine boxes, under either scheme. Anything with VAT on it is a purchase or a sale
and belongs under Entries, where the VAT return can see it. That is not a gap to
be filled in later: "you never type a VAT box figure" is the promise the whole
thing rests on, and a journal that could reach box 1 would be exactly such a
figure.

Once posted, a journal is put right by reversing it rather than by editing it -
the same lines the other way round, on a date you choose. Both stay on the
record, which is what an accountant expects to see.

### The director's loan account

**Bookkeeping → Director's loan** keeps track of money you have put into the
company and money you have taken out that is not wages and not a dividend.

Two things move it, and both show on the one statement: transfers between you
and the company on a bank statement, coded to the director's loan category, and
journals posted to the loan account.

It is stated in words rather than in plus and minus signs, because which way
round it is matters rather a lot:

- **The company owes you.** The harmless direction. It can pay you back whenever
  it has the money, and there is no tax on doing so.
- **You owe the company.** The direction worth watching. If you still owe it at
  the company's year end and have not repaid it within nine months and a day, the
  company pays tax on it under section 455 and only gets that back once the loan
  is repaid. Owing more than £10,000 at any point in the year can also be a
  benefit in kind.

The screen shows where the account stood at your last year end and what the
dates mean, so it is a question you get asked in good time rather than one your
accountant raises when it is too late to do anything. It is a summary of your
position and not tax advice - check it with your accountant, whose job that is.

Set your year end under **Settings → Bookkeeping**, since that is what the
year-end position is worked out against.

### Reports

**Bookkeeping → Reports** has six tabs sharing one set of dates at the top, so
you can move between them without losing your place.

- **Profit and loss.** What you took, what it cost, and what was left, in the
  order a set of company accounts puts them: turnover less cost of sales gives
  gross profit, less the overheads gives operating profit, then the bits that
  are not trading, then the tax. The same period a year earlier sits in the
  column beside it, because "is that good?" is a question about last year.
- **Balance sheet.** What the business owns, what it owes, and what is left over
  as at the end of your dates. If it ever does not balance it says so, in red,
  and tells you by how much - both sides come from the same entries, so that can
  only happen if something has been changed in the database directly.
- **Trial balance.** Every account with anything in it, debits one side, credits
  the other, and the two totals that should agree. Mostly of interest to your
  accountant, and the first thing they will ask for.
- **Account history.** Every single thing that went to one account, oldest
  first, with a running balance. You can get here by clicking any figure on the
  profit and loss account, the balance sheet or the trial balance, which is
  usually how the question "why is that number that?" gets answered.
- **Who owes what.** Customers who have not paid you and suppliers you have not
  paid, in age brackets, oldest at the top. Anything with no paid date against
  it counts as outstanding.
- **Take a copy.** Spreadsheet files of everything, one per kind of record.

All of it is worked out from your entries and journals together, so a
depreciation charge or a year-end adjustment shows up in exactly the same place
a receipt does.

### Equipment and other things you own

**Bookkeeping → Assets** is for anything the business bought that it will still
have next year: a van, computers, machinery, furniture. Two entirely separate
things follow from owning one, and this screen handles both from a single entry.

**For your accounts**, the cost gets spread over the years you use the thing
for, which is called depreciation. You choose whether that is the same amount
every year or a percentage of what is left, and at what rate - a quarter a year
over four years is the usual sort of answer for equipment. Then run the
depreciation for a period and it posts the lot as one journal. It only charges
for the days you actually owned the thing, so a van bought in the last week of
the year gets a week's worth rather than a year's, and it will not charge the
same period twice.

**For your tax**, the taxman ignores depreciation completely and gives capital
allowances instead, on his own rules - which in the first year are usually a
good deal more generous. What you have to tell it is which sort of allowance the
thing qualifies for. The six choices are spelled out on the screen with the case
for picking each one, rather than hidden in a dropdown of phrases you would have
to already understand: pick one, and only one. If you are not sure, the annual
investment allowance is the right answer for most things most of the time. Cars
are the big exception: they always go in the special rate pool, whatever they
cost.

**Purchases waiting to be finished off.** Anything you ticked as an asset when
you recorded it appears in a panel at the top of this screen, with what it cost
and who you bought it from already filled in from the receipt. All that is left
is how to spread the cost and which allowances it qualifies for. Until you do
that it sits there doing nothing at all: it is not depreciated and it claims
nothing, because both of those are your judgement to make and the site will not
make one up on your behalf. The count also shows on the overview page under
"Waiting on you", which is the bit people actually look at. If you ticked
something by mistake, "Not an asset after all" removes it and leaves the entry
itself untouched.

When you sell something, say so on this screen. That takes it out of the
allowances pool, which is what the tax computation needs to know. The money
coming in is an ordinary entry and should be recorded as one as well.

### Closing the year off

**Bookkeeping → Year end** is where you tell it what your financial years are.
A financial year is not the same thing as a VAT quarter and does not have to line
up with one: the VAT quarter decides what goes on a return, the financial year
decides what goes on a set of accounts and on your company tax return.

Add a year and it fills the dates in for you from the year end in your settings
and the last year on the books. Pick one and you get the profit it made, the
balance sheet at the end of it, and exactly what closing it would post, before
you close anything.

**Closing a year** does two things. It moves every income and cost balance into
retained profit, so the new year starts from zero and last year's profit shows on
the balance sheet where it belongs. And it freezes the year: nothing dated inside
it can be added, changed or removed.

That freeze is not the same as the one on a filed VAT return. A filed return is
something you have told HMRC and its entries are locked permanently. A closed
year is a decision you made and can unmake - your accountant finding something in
March that belongs to the year to December is completely ordinary, and the answer
is to reopen the year, post it, and close it again. Reopening takes the closing
journal back out with it.

Years close oldest first, for the sensible reason that the profit carried forward
into a later year depends on the earlier one being right.

### Corporation tax

**Bookkeeping → Corporation tax** works out what your company owes and gives you
every figure the company tax return asks for, with the box number beside it.

Start a computation for a financial year and it works down the page the way an
accountant would:

1. **The profit in your accounts**, before tax.
2. **Things added back.** Depreciation comes back on in full, because capital
   allowances replace it. So does client entertaining, because it is simply not
   allowed. Both of those happen on their own from what your accounts already
   say. Anything else - a fine, a bit of a bill that was really personal - you
   add as a named adjustment with a reason, and it appears on the computation
   under that name.
3. **Things taken out of the trade.** Bank interest and rent are taxed under
   their own headings rather than as part of your trade, so they come out here
   and go back in further down.
4. **Capital allowances**, worked out from your asset register: the annual
   investment allowance, full expensing, and what is written down off each pool.
5. **Losses** brought forward from earlier years, used against this year's
   profit.
6. **The rates.** Under £50,000 of profit you pay 19%. Over £250,000 you pay
   25%. Between the two you pay 25% less marginal relief, which works out
   somewhere in between. If your financial year straddles the 1st of April the
   two halves are worked out separately at their own rates, and both are shown.

**The one thing worth being careful about is associated companies.** If the same
people control another company - even a dormant one that has never traded - those
two thresholds are shared between you, so £50,000 becomes £25,000 and tax starts
biting a good deal sooner. The module cannot know about the other company, so it
asks. Getting it wrong is the single most common way a small company's
corporation tax comes out wrong.

A period of account longer than twelve months is two tax periods, not one, and
the module splits it for you. That happens to most companies in their first year
and to anyone who has moved their year end. It means two returns, and missing the
second one is how a penalty turns up for a return nobody knew about.

Expand **the boxes to copy onto the return** at the bottom for the list, box
number by box number. Mark the computation finished when you are happy with it
and the workings freeze, so a computation you printed in June still reads the
same in November.

**It does not file it**, and it says so on the screen. The last step is yours or
your accountant's.

Some things are deliberately left out rather than half done: research and
development relief, patent box, group relief, ring fence trades, Northern Ireland
rates, loans to participators, structures and buildings allowance. Each of those
is a specialism with its own extra pages, and a half-answer would look like an
answer. You can still put any of them on the computation as a named adjustment,
which records the figure with your reason beside it and leaves the working out to
whoever knows it. As with everything else here, this is a computation and not tax
advice - check it with your accountant, whose job that is.

---

## 4. Why you need your own HMRC credentials

Short and honest: Cactus is open source and you host it yourself, so we cannot
ship a shared key. HMRC issues credentials to the business that runs the
software, and that is you rather than us.

It is about ten minutes of forms, then a wait. Do it well before a return is due.

---

## 5. Creating a Developer Hub account

Register at HMRC's developer portal. You will get a confirmation email; click the
link in it, set a password, and you land on an applications list which is empty.

---

## 6. Creating a sandbox application

Create an application and name it after your site. Subscribe it to **VAT (MTD)**,
version 1.0, and to **Test Fraud Prevention Headers** - the first is the API this
module files through, the second is what lets the settings tab ask HMRC to check
the details we send before you apply for production access.

You will be given a **Client ID** and a **Client Secret**. The secret is shown
once. Copy it somewhere safe before you leave the page; if you lose it you can
issue a new one, but you cannot see the old one again.

---

## 7. The redirect URI

HMRC needs to know exactly where to send people back to after they sign in.
Register this, exactly:

```
https://<your-domain>/api/m/uk-bookkeeping/hmrc/callback
```

The settings tab prints the correct one for your site with a copy button next to
it. Use that rather than typing it: a trailing slash, or `www.` where you have
none, is enough for HMRC to refuse the connection with a message that will not
tell you why.

It does not contain your admin address, on purpose. Rename that whenever you like
and this keeps working.

---

## 8. Putting the credentials on your site

Paste the client ID and client secret into **Settings → Bookkeeping**, in the
HMRC card - the same numbered steps are printed there, with links to the
Developer Hub pages they happen on. Saving stores them with the site's other
credentials (they are environment variables, `HMRC_CLIENT_ID` and
`HMRC_CLIENT_SECRET`, managed exactly like the rest); they take hold on the
next deployment, which the site will prompt you for. Storing them needs a site
administrator - the form saves through the same door as every other credential.

Running locally, environment variables come from `.env.local` instead: set the
two names above and restart the dev server.

Never paste them into a page, an email or a support ticket. They are not stored in
your site's database and they are never shown back to you anywhere in the admin.
If a secret leaks, revoke it on the Developer Hub and issue a new one.

---

## 9. Testing against the practice service

HMRC runs a practice service - a complete copy of the real thing that files
nothing. Create a **test user** on the Developer Hub and it hands you a fake
Government Gateway login and a fake VAT number.

Leave the environment set to the practice service in Settings, connect, fetch
your obligations, and file a test return. An amber banner sits across every
bookkeeping page while you are in practice mode, and it will not go away until you
switch. That is deliberate: the one genuinely dangerous thing this software could
let you do is believe you have filed when you have filed against a test service.

---

## 10. Applying for production access

Once you are happy, apply for production credentials on the Developer Hub. They
will ask what your software does, want a demonstration, and want evidence that you
send fraud prevention headers correctly - which this module does on every single
call, and keeps a record of.

**HMRC take up to ten working days**, and they do come back with questions. Do not
leave this to the week your return is due.

Before you apply, use **Have HMRC check the details we send** in Settings →
Bookkeeping. HMRC run a checker for exactly this, and it answers in seconds
rather than in ten working days. It only works against the practice service,
which is where you should be at this point anyway. A clean result is worth
screenshotting for the application.

### Checking it end to end

Once your sandbox credentials are in and you have a test user, work through this
in order. Each step proves the one after it is worth attempting.

1. **Connect.** Settings → Bookkeeping → Connect to HMRC. Sign in as your test
   user. You should land back on the settings page with the connection showing
   as live and the test user's VAT number beside it.
2. **Check the details we send.** The button described above. Aim for no errors;
   warnings about values a website cannot see are expected and fine.
3. **Fetch your obligations.** Bookkeeping → VAT returns → Refresh from HMRC.
   Periods should appear with real due dates. If nothing arrives, the VAT number
   is the first thing to check.
4. **Record something** in the earliest open period, with a receipt attached.
5. **Finalise it** and look at the nine boxes. Expand a couple and check the
   entries listed are the ones you expect.
6. **File it.** You should get a reference number back and an email receipt.
7. **Try to edit the entry you just filed.** It should refuse, and offer you a
   correction instead. If it lets you, stop and report it - that is the one
   thing this software must never do.
8. **Post that correction** and confirm it lands on the *next* period rather
   than the one you just filed.

Steps 1, 3, 6 and 7 are the ones worth repeating after any update.

---

## 11. Going live

Add the production Client ID and Secret to your hosting environment variables and
redeploy. Switch the environment setting to the real service, then **reconnect** -
production credentials mean a fresh sign-in, the practice connection does not
carry over.

Check the amber banner has gone, and that the VAT number and the obligations you
can see are your real ones.

---

## 12. Filing a return

Open **Bookkeeping → VAT returns** and pick a period. You will see all nine boxes,
and you can expand any of them to see exactly which entries made that number and
click through to each one.

1. **Finalise.** This freezes the figures and takes a copy of the workings. You
   can still reopen it.
2. **Send it to HMRC.** You will be shown HMRC's declaration - that the
   information is true and complete - and asked to agree before anything moves.
   Then the figures are worked out again and compared with what you froze. Any
   difference at all stops the submission and tells you which figures moved - so
   what goes to HMRC is provably what you approved.
3. **Keep the receipt.** HMRC give you a reference number, which is stored on the
   period, and we email you a copy.

The VAT returns page can also show **Money with HMRC**: what HMRC says is owed
and the payments it has received over the last year. Their figures, shown beside
yours for comparison - never merged with them.

That email is worth keeping. As well as the figures, it carries a **records
fingerprint** - a short code worked out from every entry behind the return. It
only stays the same for as long as those entries do. Sitting in your inbox, where
this software cannot reach it, it is what would catch anyone quietly rewriting
your history later.

**Filed it somewhere else?** Use "I filed this somewhere else" instead. It records
the fact and locks the entries exactly as if it had gone from here, which keeps
your books honest even if production access never arrives.

---

## 13. Fixing a mistake

Once a return is filed, everything on it locks and stays locked. There is no undo,
by design, and it is enforced deep enough that no amount of clicking will get
round it.

Corrections are new entries in your current period. Open the locked entry, press
**Post a correction**, and record what should have happened; it lands on the
current return and is linked back to the original.

HMRC let you put a mistake right on your next return when the net value of your
errors is £10,000 or less, or is between £10,000 and £50,000 and no more than 1%
of your box 6 sales figure. Above that they want telling separately, through their
online error correction service. The VAT returns page keeps a running total of
your corrections and tells you which side of the line you are on. Those thresholds
are settings rather than fixed numbers, so if HMRC change them it is a quick edit
rather than waiting for an update.

---

## 14. Keeping your records

HMRC expect six years. Two things follow.

**Your receipts are never tidied away.** The media clean-up that offers to remove
unused files knows these are in use and leaves them alone. It also does not matter
if somebody deletes one from the media library by hand - the download still works.

**Take copies.** Under **Reports** there are spreadsheet exports of everything:
entries, their lines, the evidence list, your journals and their lines, the
ledger accounts, the bank statement lines as the bank wrote them, what each one
was matched to, VAT periods, the frozen figures and workings of every filed
return, the log of every call made to HMRC, and the full history log. Worth
doing at year end, and the thing to do before you ever remove this module from
your site - removing it takes its tables with it.

Reports also show a **month-by-month** view of the range - money in, money out,
profit and the VAT position for each month - alongside the profit and loss.

---

## 15. When something goes wrong

**"Your HMRC connection has expired."** Connections last around eighteen months
and then need renewing. Go to Settings → Bookkeeping and press Reconnect.
Everything except filing carries on working meanwhile. You will also see this
straight after restoring a backup onto a different site, which is expected -
reconnect and carry on.

**No obligations come back.** Either HMRC genuinely has nothing outstanding for
that VAT number, or the VAT number is wrong, or the Government Gateway account you
connected is not the one authorised for it. Check the number first.

**HMRC refused the return.** Their own message is shown, along with a reference
number they will ask for if you ring them. The period stays finalised and nothing
has been filed, so nothing is lost - fix what they are complaining about and try
again.

**"HMRC says this period has already been filed."** Usually an earlier attempt
reached them and the answer never got back to us. Press **Check with HMRC**: it
asks what they are holding, and if it matches your figures exactly it tidies the
record up here without sending anything again. If it does not match, it says so
and changes nothing - that one needs a phone call rather than another button.

**"Your records are not being protected."** A red banner meaning the safeguards
that stop a filed return being edited are missing or switched off in your
database. Redeploying your site puts them back. Until then, treat anything filed
as unprotected, and if you did not switch them off yourself, find out who did.

**"There is no readable text in that PDF."** The statement is a scan or a
photograph of a paper one rather than a file downloaded from your online
banking. There is nothing in it to read, so it is refused rather than guessed at.
Download the statement itself from your bank, as a PDF or a CSV, and import that.

**"That PDF is password protected."** Some banks send statements locked. Open it,
save an unprotected copy, and import the copy.

**"We could not find a table of transactions in that PDF."** Usually the file is
a summary, a certificate of balance, or an annual statement of interest rather
than the statement itself. If it genuinely is a statement, import the CSV
version instead and say so - an unusual layout is worth knowing about.

**The statement totals do not agree with what was read.** The import says so
before writing anything. Check the lines on the screen against the PDF: it means
a line was missed or a column was read wrongly. Importing the CSV from the same
bank is the quick way past it.

**"3 lines were left alone" after coding a batch.** Every line that would not
take what you chose is named underneath, with the reason. Usually one of three
things: it is money in and the category is for money out (or the other way
round), its date falls inside a VAT return you have already filed, or it was
already explained. Deal with those few by hand; the rest went through.

**A card payout matches nothing at all.** Expected: it is several invoices less
the processor's cut, so it equals none of them. Use **It paid several invoices**
on the line - see the section above.

**"Those entries and that difference do not add up to this line."** The picked
entries plus the difference did not come to what arrived, so nothing was written.
Usually one of the entries is already partly matched to something else. Open it
and look at what is already tied to it.

**"Nothing in the books is a sure enough match for this one."** Either there is
genuinely nothing recorded for that amount, or there are two entries that fit
equally well and guessing between them would do damage. Pick the right one
yourself from the list on the line, or record a new entry from it.

**"This journal does not balance."** The two sides have to add up to the same
figure, and the message says how far apart they are. Save it as a draft if it is
half typed - a draft can sit unbalanced for as long as you like.

**A journal will not let you edit it.** Once posted it is put right by reversing
it, not by editing it, so both what was posted and what took it back stay on the
record. The Reverse button does the whole thing for you.

**A receipt will not upload.** PDFs, JPEGs, PNGs and WebP up to 15 MB. iPhone
photos in HEIC format are refused with instructions - share the photo as a JPEG,
or set Camera to Most Compatible. Files are checked against their actual contents
rather than their name, so something renamed to `.pdf` is turned away.

**"That date falls in a VAT period already filed."** Exactly what it says. Record
it in the current period as a correction instead; the button to do that is right
there. On cash accounting the same applies to the date the money moved, not just
the invoice date - a payment cannot land inside a return that has already gone.

**"The scheme cannot simply be flipped."** Changing between standard and cash
accounting is refused while an open VAT period already holds entries, because the
changeover affects which return those entries land on. File the open period
first, then change the scheme; periods that are still empty follow the new
setting on their own.

**The connection drops mid-filing.** If the line goes down while HMRC is being
called, the page says so plainly and offers **Check with HMRC** - which asks what
they are holding without sending anything again. Use that rather than pressing
submit twice.
