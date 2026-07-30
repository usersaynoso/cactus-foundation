# Google Reviews

A new shop has the review problem the wrong way round: nobody writes a review until other people have, and other people will not until somebody does. Meanwhile, on Google Shopping, there may well be a pile of reviews about the very things you sell.

This module goes and gets them, and puts them in your own Reviews list where you decide what happens next.

Requires the **Shop** module and the **[Reviews](Reviews)** module. It leans on Reviews entirely - the reviews it brings back are ordinary reviews in your ordinary list, published, answered and binned exactly as before.

---

## The awkward bit, up front

Google does not hand its reviews out. Since the start of 2025 it has only shown its results to a real browser, and asks anything else to prove it is not a robot. There are companies who sell a way round that, and you can use one if you like - but you do not have to, because this module comes with a small helper that does the job on a machine of your own.

That helper is the only setting-up there is, and it is four commands. There is no account to open and no monthly bill.

**Where you run it matters more than anything else here.** On an ordinary broadband connection - an office machine, a mini PC in a cupboard, the Mac that is on anyway - Google is generally happy to answer it. On a rented machine in a data centre it will often be shown the robot check instead. When that happens the module tells you so in plain English rather than letting you believe your products have no reviews, and picks up where it left off next time.

## Setting it up

1. Copy the `renderer` folder out of the module and onto whichever machine will do the looking.
2. Run the four commands in its own instructions. The last one prints a long random key - keep it.
3. In **Settings > Shop > Google Reviews**, switch the module on, paste that key in, and check the address matches where the helper is running (`http://localhost:8791` if it is on the same machine as your site).
4. Press **Check my key**. It will tell you straight away whether the two are talking.

If your site and the helper are on different machines, the address has to be a secure one - the key travels with every request, and it would be a shame to shout it across the room.

## Getting the reviews

Two ways, and you will probably use both.

**The whole catalogue.** In **Settings > Shop > Google Reviews**, press **Get Reviews**. It works through your products, oldest-looked-at first, showing you what it is doing as it goes. You can close the tab: it stops where it is and offers to carry on when you come back. Turn on the nightly check and it does the same thing quietly overnight.

**One product, or a handful.** A **Google Reviews** tab now sits beside Products in the admin. Every product is listed with what Google made of it, how many reviews have come in and when it was last looked at. Press **Scan** on a row, or tick several and press **Scan selected**. The ticks survive turning the page, so you can gather a couple from here and a couple from there and do the lot in one go.

The per-product tab is the one to use just after you have added something. It is also the only way to scan a draft, or one of the hidden rows behind a product's variations - the nightly check leaves those alone, quite sensibly, since they have no page of their own.

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
| Most searches one run may use | A hard stop. A run that reaches it finishes early and says so, and the next one carries on from there. |
| Only products that are on sale | Skips drafts and the hidden rows behind variations. |

## Who can do what

One permission: **Manage Google reviews**. It covers the settings tab, the products tab and pressing any of the buttons.

It is deliberately separate from your shop and reviews permissions. Being allowed to edit the catalogue does not automatically mean being allowed to put a stranger's words on a product page, and being allowed to moderate reviews does not automatically mean being allowed to spend money on searches. If you want one person doing all three, give them all three keys - as a decision rather than by accident.

## What it does not do

- **It does not get past the robot check.** No puzzle-solving, no rented home broadband lines, no pretending to be a person. When Google says no, the module says so.
- **It does not bring in review photographs.** Words and a rating only.
- **It cannot promise to keep working forever.** Google rearranges its pages, and one day it will rearrange them enough to need a fix here. The module is built to survive the ordinary reshuffles - it recognises a review by its shape rather than by anything Google can rename - but this is the honest reason companies charge money for the same job.
- **It does not touch your existing reviews.** Remove the module and everything it imported stays exactly where it is, as ordinary reviews in your ordinary list.
