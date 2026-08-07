# Stock Imports

The **Stock Imports for Shop** module (`stock-import-for-shop`) keeps your shop's stock
counts in step with a supplier's stock file. You give it a web address, you say how
often to look, and from then on every product whose code appears in that file has its
stock count kept up to date without anyone typing a number.

Requires the [Shop](Shop) module.

Nothing else about a product is touched. Not the price, not the name, not the
description, not the photographs. Stock counts, and that is all.

## The idea

Most suppliers publish a stock file somewhere - a plain CSV at a fixed address, updated
overnight or every few hours, listing every product code they carry and how many are
free to sell. It is the least glamorous file in the business and the one that decides
whether your shop takes an order it cannot fulfil.

Reading it by hand is a job nobody does twice. This module does it on a timer.

## Setting it up

Everything lives in **Settings → Shop → Stock**.

### 1. The address

Paste the direct link to your supplier's CSV. If clicking that link in your browser
starts a download, it will work here.

It has to be a public web address - `https://` or `http://`. An address that points back
at your own site is refused, which is not a judgement on your typing so much as a
sensible thing for a server to be firm about.

### 2. The two columns that matter

Stock files carry all sorts: descriptions, due dates, lead times, prices you are not
supposed to see. Two columns are actually needed.

- **Column with the product code.** Matched against each product's SKU. Default
  `ProductCode`.
- **Column with the number in stock.** Default `FreeStock`.

Capital letters, spaces, underscores and hyphens are all ignored when matching the
heading, so `FreeStock`, `Free Stock` and `free_stock` all find the same column. Where
the column *sits* is not used at all, so a supplier slipping a new column in at the
front cannot quietly make you start importing lead times as stock levels.

If your file offers both `Quantity` and `FreeStock`, pick the one that means "available
to sell right now". `Quantity` is usually everything on the shelf including the stock
already promised to somebody else.

### 3. Press Test this file

This is the bit worth not skipping.

**Test this file** fetches the file, reads it against your catalogue, and tells you:

- how many rows it found, and how big the file was
- whether both columns you named are actually there
- **how many of the codes in the file match a product in your shop**
- how many of your products the file never mentions (and there is a section further down
  that names them - see [Which products the file is not covering](#which-products-the-file-is-not-covering))
- any stock figures it could not read, with examples
- the first few rows, laid out as the reader sees them

It changes nothing. It is purely a "would this work" button.

The match count is the one to look at. A file can be perfectly valid, download cleanly,
parse beautifully, and share not one single code with your catalogue - because the codes
in it are the supplier's own rather than the ones you sell under. That looks exactly
like success until somebody notices, six weeks later, that nothing has ever changed.

### 4. How often to check

From **every hour** through to **once a week**, or **only when I press the button** if
you would rather do it by hand entirely.

Under the last-checked line there is a reminder that a **Fetch Latest Stock** button is
waiting on your Products page, for the days when "in an hour" is not soon enough.

### 5. What to do with the figures

**Products your supplier's file does not mention.** Two choices:

- *Leave their stock alone* (the default). Right whenever the file covers one supplier's
  range and your shop sells other things too.
- *Treat them as out of stock*. Right only when that one file is your entire catalogue.
  Choose it wrongly and you will empty the shelves of everything the file does not
  happen to list, which is a memorable afternoon.

**Actually hold shoppers to these numbers.** A tickbox. On, the shop switches inventory
tracking on for the products this updates, so it stops selling something once it has run
out. Off, the numbers are recorded and shown but never enforced.

Recording a figure and refusing an order on the strength of it are two different
decisions, which is why they are two different settings.

### 6. If the file needs a login

Most supplier feeds are open to anyone with the link. If yours asks for a username and
password, there are two boxes for them at the bottom. The password is encrypted before
it is stored and is never sent back to your browser afterwards - the box shows dots and
an option to forget it.

## The Fetch Latest Stock button

On **Products**, beside the other buttons at the top. It appears once a stock file
address has been saved, and not before - a button that can only fail is not a hint.

Press it and it fetches, reads and applies, showing a progress bar as it goes. On a big
catalogue the first run has a lot to write, so it works through it a batch at a time; the
button keeps going until it is finished rather than stopping at some arbitrary point and
leaving you to guess.

When it finishes it says what happened: how many products changed, how many codes
matched, how many of your products the file did not mention.

If the schedule happens to be running one when you arrive, it says so rather than
starting a second.

## Which products the file is not covering

Underneath the Save button, a section called **Products not in your supplier's file**.
Press **Show me which ones** and it fetches the file, compares it against everything in
your shop that carries a code, and lists what is left over.

A count on its own has never been much use. "412 of your products are not in the file"
could be a range the supplier has quietly dropped, a batch that went in under the wrong
codes, or four hundred variations of one chair, and no amount of looking at the number
will tell you which. So the list gives you, for each one:

| Column | What it tells you |
| --- | --- |
| Code | The SKU the shop has, which is what the file was searched for |
| Product | Its name, linking straight to the product so you can go and look |
| Part of | The listing a variation belongs to, linking to that. A product that is a listing in its own right says so |
| Status | Live, draft or archived. An archived product missing from a supplier's file is usually not news |
| Stock now | The count it is still sitting on, untouched, and whether the shop is actually enforcing it |

There is a search box for narrowing it by code, name or listing, and a **Download the
full list** button that hands you a spreadsheet - which is generally what you want, since
the next step is usually an email to the supplier asking why half a range has vanished
from their file.

It reads the file you have **saved**, not whatever is typed in the box above it, and it
changes nothing at all. On a very long list the screen shows the first two thousand and
says so; the download has the lot.

A note on what counts as missing: exactly what the run log means by it. If a product has
no code at all it is not in this list, because there was never anything to match it on.

## Recent checks

Underneath that, the last twenty runs: when, whether it was the schedule or a
person, whether it worked, and the counts. If a supplier quietly stops publishing the
file, this table is where you will see it first - which is rather the point of keeping
one.

## What actually gets written

Only products whose stock count is genuinely different. A file that has not changed since
this morning produces no writes at all, which keeps the site quick and your product
"last edited" dates honest.

A product's count is matched by SKU, ignoring capitals and surrounding spaces. If a
product listing has variations, each variation carries its own SKU and each is matched
and updated in its own right - a chair whose black version is in stock and whose grey
version is not ends up saying exactly that.

## How the figures are read

Suppliers export these files from whatever runs their warehouse, so the reader is
deliberately forgiving. It copes with commas, semicolons, tabs or pipes between the
columns, Windows or Mac line endings, quoted text containing commas, and the invisible
marker Excel likes to put on the front of a file.

Stock figures are read as whole units:

| In the file | Read as | Why |
| --- | --- | --- |
| `360` | 360 | |
| `360.00` | 360 | |
| `12.9` | 12 | Rounded down, never up. Better to under-promise. |
| `1,250` | 1250 | |
| `-4` or `(5)` | 0 | "How many can be sold" cannot be minus four. |
| *(blank)* | left alone | Saying nothing is not the same as saying none. |
| `In stock` | left alone, and reported | Guessing a number here is how a shop refuses orders it could have taken. |

That last row is the important one. A cell it cannot read never becomes a zero. It leaves
the product exactly as it was and tells you about it, both in the Test report and in the
run log.

## Requirements

- The **Shop** module.
- Your site needs `CRON_SECRET` set so the scheduled check can prove it is the schedule.
  Every Cactus site on Vercel has this already.
- `ENCRYPTION_KEY`, only if your feed needs a username and password. Every Cactus site
  has this already too.
- A hosting plan that allows an hourly scheduled task. On Vercel that means Pro or above;
  the free Hobby plan only allows one scheduled task a day, which would leave "every
  hour" and "every six hours" as decorative options.

## Who can do what

- Changing the settings, and listing the products the file does not cover, needs the
  **shop.manage** permission.
- Pressing **Fetch Latest Stock** needs **shop.products**.

## If something goes wrong

**"None of the codes in this file match a product in your shop."** The product code
column is almost certainly the wrong one, or the supplier lists their own codes rather
than yours. Open the sample rows in the Test report and see which column looks like the
SKUs you use.

**"That address returned a web page rather than a stock file."** The link needs a login,
or has expired, and the supplier's site has answered with a sign-in page instead. Try the
username and password boxes.

**"Your supplier refused the request."** Same again - the file is protected.

**"Your supplier did not answer within thirty seconds."** Their server is slow or down.
The next scheduled check will try again; nothing has been changed in the meantime.

**Everything works but one product never updates.** Its SKU does not match what the
supplier calls it. Stock matching is by code alone - it does not guess from names.

---

**Wiki:** [Home](Home) · [Shop](Shop) · [Shop Variations](Shop-variations) · [Google Sheet Products](Google-Sheet-Products) · [Modules](Modules) · [Configuration reference](Configuration-reference)
