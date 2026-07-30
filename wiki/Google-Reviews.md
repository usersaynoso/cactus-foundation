# Google Reviews

A new shop has the review problem the wrong way round: nobody writes a review until other people have, and other people will not until somebody does. Meanwhile, on Google Shopping, there may well be a pile of reviews about the very things you sell.

This module goes and gets them, and puts them in your own Reviews list where you decide what happens next.

Requires the **Shop** module and the **[Reviews](Reviews)** module. It leans on Reviews entirely - the reviews it brings back are ordinary reviews in your ordinary list, published, answered and binned exactly as before.

---

## The awkward bit, up front

Google does not hand its reviews out. Since the start of 2025 it has only shown its results to a real browser, and asks anything else to prove it is not a robot.

So this module keeps a real browser: a small machine of your own at [Fly.io](https://fly.io), which the module sets up for you from one pasted token. It wakes when a scan needs it, reads the page the way you would, and puts itself away five minutes after the last scan so it only costs anything while it is actually looking. What makes it worth having is its **fixed address**: the machine talks to Google from the same address every time, which is the difference between being asked "are you a person?" constantly and being asked occasionally.

The costs, plainly: the fixed address is **$3.60 a month**, and the machine itself is a few pennies while scans run and nothing when idle. That is the entire bill, and it goes to Fly.io, not to us.

**Sometimes Google will still ask whether it is talking to a person.** When it happens, a box opens on whichever screen you were on - and as of this version you can actually answer it. Press **Answer it now** and the box becomes a live window onto the machine's own browser, with Google's question in it. Tick the box, pick the pictures, do whatever it asks - your clicks go straight through, and so does the way your mouse got there, which matters more than you would think: Google watches how a pointer arrives at a checkbox as closely as it watches the checkbox. The moment Google moves on, the window closes itself and the machine remembers what it was granted, so this should be an occasional interruption rather than a daily chore. If it ever becomes relentless, **Forget what Google told us** on the same screen wipes the slate and starts fresh, which sometimes helps.

Every click you make is sent, even if the picture is mid-refresh when you make it - the picture waits its turn behind you rather than the other way round, and the window says so when clicks are queued up. If you have used an earlier version and found that answering a check never actually worked no matter how carefully you answered it, that is fixed: the machine's browser used to introduce itself to Google under a name that Google will not accept an answer from, so it kept asking the same question forever. It now runs an ordinary browser window, on a screen nobody is looking at, and gives its ordinary name.

## Setting it up

1. Make a free account at [fly.io](https://fly.io) and add a payment card (Fly needs one for the address rental).
2. In Fly's dashboard, create an **organisation token** (Dashboard > Tokens - or `fly tokens create org` if you use their command line).
3. Go to **Settings > Shop > Google Reviews**, paste the token into **The browser machine**, pick where the machine should live (London, unless your shoppers are elsewhere), and press **Connect**. The module builds everything else itself and shows you the machine's fixed address when it is done.
4. Turn **Use Google reviews on this shop** on.
5. Press **Save settings**.

The place you pick decides the machine's address, so it cannot be changed later without disconnecting and starting afresh - and a fresh address means Google getting to know you all over again, so pick once and leave it.

## Getting the reviews

**One product, or a hundred.** A **Google Reviews** tab now sits beside Products in the admin. Every product is listed with what Google made of it, how many reviews have come in and when it was last looked at. Press **Scan** on a row, or tick several and press **Scan selected**. The ticks survive turning the page, so you can gather a couple from here and a couple from there and do the lot in one go.

The first scan after a quiet spell takes a little longer while the machine wakes up - the progress line says so - and the rest fly along once it is warm.

If Google asks its question part way through a batch, the batch stops - every scan goes out from the machine's one address, so the next product would only be asked the same thing. The question is already on screen by then: answer it, press **Scan selected** again, and your ticks are exactly where you left them.

There is one way in and it is that tab. The settings screen has no **Get Reviews** button of its own any more - two buttons doing nearly the same job, one of which could not tell you which products it meant, was one button too many. Settings are settings; the fetching happens where the products are.

**There is no nightly run either**, deliberately. Something sweeping your catalogue at four in the morning mostly earns a note saying Google asked whether it was talking to a person, with nobody up to read it. Reviews come in when you ask for them.

## Deciding what goes up

By default, everything imported waits for you in **Shop > Reviews** alongside anything your own customers have written. You publish what you want and bin the rest.

If you would rather not read them all first, one setting sends them straight up. There is also a third choice - "do whatever my Reviews settings say" - so the two screens cannot end up contradicting each other.

Whichever you choose, imported reviews behave like any other from then on: you can reply underneath them, take them down, or delete them. **Delete one and it stays deleted.** It will not quietly reappear next time the module runs, however many times that is.

## Saying where they came from

Every imported review is labelled against the reviewer's name - "Jane B (via Google)" by default. You can change the wording.

You can also empty it, and this is the one place in this documentation where we would rather you did not. A review written about a product somewhere else, sitting unlabelled next to reviews from your own customers, tells your shoppers something untrue about who is recommending you. In the UK that is the sort of thing the Competition and Markets Authority takes an interest in, and the fine is considerably more than the review is worth.

## Finding the right product

Getting the wrong product's reviews would be worse than getting none, so the module is fussy about this.

**By barcode**, where you have one. A barcode identifies exactly one product in the world, so this is the accurate way round, and it is worth adding barcodes to your products for this reason alone.

**By name**, where you have not. This is a guess, so it is scored out of a hundred and has to clear a threshold before anything is imported. Sixty is a sensible starting point. Numbers in a name count double, because "Desk 1200" and "Desk 1600" share every word except the one that matters.

Products Google has never heard of are listed as exactly that, on both screens. That is a useful list rather than a failure - it is usually a missing barcode.

## Keeping it sensible

| Setting | What it is for |
| --- | --- |
| Lowest rating to bring in | You are allowed to import only the good ones. A page of nothing but five stars is the least convincing thing on the internet. |
| Shortest review worth having | Keeps "good" off your product pages. |
| Most reviews per product | Counts the ones still on the product, so binning a few lets the next run top it back up. |
| Leave a product alone for N days | Reviews do not appear by the hour. A week is plenty. |
| Most pages one scan may load | A hard stop for a single product, so one unusually chatty listing cannot swallow an afternoon. |
| Only products that are on sale | Skips drafts and the hidden rows behind variations. |

## Who can do what

One permission: **Manage Google reviews**. It covers the settings tab, the products tab and pressing any of the buttons.

It is deliberately separate from your shop and reviews permissions. Being allowed to edit the catalogue does not automatically mean being allowed to put a stranger's words on a product page, and being allowed to moderate reviews does not automatically mean being allowed to set your site off trawling Google. If you want one person doing all three, give them all three keys - as a decision rather than by accident.

## What it does not do

- **It does not get past the robot check by itself.** No puzzle-solving by machine, no rented home broadband lines, no paying a service to answer on your behalf. When Google asks, a person answers - you, live, on the machine's own browser, which is the one place Google accepts an answer. When Google says no, the module says so rather than quietly returning nothing.
- **It does not run for free any more.** The old arrangement cost nothing and did not work: hosted sites ask Google from shared addresses that get challenged morning, noon and night, and an answered challenge counted for nothing a moment later. $3.60 a month buys the fixed address that makes the whole thing viable. We looked for a cheaper honest way and there is not one.
- **It does not bring in review photographs.** Words and a rating only.
- **It cannot promise to keep working forever.** Google rearranges its pages, and one day it will rearrange them enough to need a fix here. The module is built to survive the ordinary reshuffles - it recognises a review by its shape rather than by anything Google can rename - but this is the honest reason companies charge money for the same job.
- **It does not go quickly.** A page every few seconds, deliberately. Hurrying is the surest way to be shown the door, so a big catalogue is a thing to set going and leave alone rather than sit and watch.
- **It does not touch your existing reviews.** Remove the module and everything it imported stays exactly where it is, as ordinary reviews in your ordinary list.
