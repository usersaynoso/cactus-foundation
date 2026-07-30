# Reviews

Shoppers trust other shoppers considerably more than they trust you, which is deflating but useful. This module lets your customers rate a product out of five and say why, puts those ratings on the product page, and gives you a single screen where you decide what goes up.

Requires the **Shop** module.

---

## Getting reviews on the page

Install the module and there is nothing to build. Every product page gains a **Reviews** tab, beside Description and Specification, holding the star rating, the reviews themselves and the form for writing one. It is dressed by whatever layout your shop uses, so it looks like part of the page rather than a bolted-on box.

If you would rather put reviews somewhere specific, three blocks are available in the page builder:

| Block | Where it goes | What it draws |
|---|---|---|
| **Product: Reviews** | A Product Detail layout | The whole thing: stars, the reviews, the form |
| **Product: Rating summary** | A Product Detail layout | One line - the stars, the score and the review count. Good under the title or beside the price |
| **Shop: Reviews wall** | Any page | Your latest reviews across every product. A home page's best friend |

**One warning.** If you place the **Product: Reviews** block yourself, set **Where reviews appear** to *Nowhere* in the settings, or the same reviews will be on the page twice and shoppers will assume you have been at the keyboard after lunch.

A product with no reviews yet keeps its tab, because the tab is also the only place someone can leave the first one. The rating summary block, by contrast, draws nothing at all until there is something to summarise - "no reviews yet" under every title in a new shop is worse than silence.

---

## Deciding what goes up

**Shop → Reviews.** Everything that has ever been written lands here, filtered by:

- **Waiting for you** - written, not published. The number on this chip is why you opened the page.
- **On the site** - live on the product page.
- **Turned down** - kept, never shown.
- **Everything**.

For each review you can **Publish**, **Take down**, **Turn down**, **Reply** or **Delete**. Tick several and the same actions apply to the lot, because publishing forty held reviews one button at a time is how moderation quietly stops happening.

**Turn down rather than delete** where you can. A turned-down review is kept out of sight, which means the same person cannot resubmit the same words and find them live, and you can see what you decided against. Delete is for spam.

### Replying

Your reply appears directly under the review, labelled as yours. It is the single most useful thing on this screen: the best answer to a three-star review is almost always a good-natured reply beneath it, and everyone reading can see you turned up. Editing or clearing a reply later is a click.

---

## Settings

**Shop settings → Reviews.**

### Before they appear

- **Publish new reviews straight away.** Off by default - every review waits for you. Turn it on and reviews go live as they are written, which is faster and rather more exciting.
- **Who may leave a review.** Anyone who can see the product, signed-in members only, or customers who bought it. Customers are matched on the email address they ordered with.
- **Shortest review you will accept.** In characters. Stops "ok" counting as a review. Set it to 0 to accept anything.
- **One review per product per email address.** Keeps one very keen customer from filling a product page on their own.

### On the shop

- **Where reviews appear.** The Reviews tab, or nowhere because you are placing the block by hand.
- **Show a Verified purchase badge.** See below.
- **Ask for a headline.** A one-line summary above the review. Optional for the shopper either way.
- **Reviews shown before "Show more".**

### What the shopper is told

Two thank-you messages, in your own words: one for a review that went straight up, one for a review that is waiting for you. Having a single message for both means telling somebody their review is live when it is not, which they will notice.

### Emails

- **Tell this address when a review arrives.** Leave it blank for none. Nothing is sent if your site has no email set up.
- **Ask past customers for a review.** Off by default. See below.
- **How long after the order to ask.** Two weeks is a fair default.

---

## The reviews spreadsheet

**Shop → Reviews → Import / export.**

### Taking them out

**Download reviews spreadsheet** gives you the lot: one line per review, with the product it is about, who wrote it, the stars, the words, your reply and the dates.

It also gives you a line for **every product nobody has reviewed yet**, saying `No reviews yet` where the review would be. That half is usually the more interesting one - a list of your reviews tells you how you are doing, and a list of the products with none tells you what to do next.

Product options are left out. A review belongs to the desk, not to the 1600mm oak one with the black frame, so you get one line per product rather than one per combination. Drafts and archived products are in there too, since "has anyone said anything about this" is a fair question to ask about something not on sale yet.

### Putting them back

Upload the same spreadsheet and the reviews in it are saved. Type them into the empty rows, or paste in a list you have been keeping somewhere else since before you had a shop that could hold them.

- **Rows keep their review id**, so a review already on the site is updated rather than added a second time. Clear that cell and the row goes in as a brand new review.
- **Sending the same file twice is safe.** A row with no id is skipped if the same person has already said the same words about the same product.
- **Which product** is matched on the slug (the bit of the web address), falling back to the SKU. The product name is there for you to read, not to match on - two things can share a name, and renaming one should not move its reviews.
- **Reviews with no status of their own** go up straight away or wait for you, whichever you pick before choosing the file.
- **Anything it cannot use is listed back at you** by row number, and everything else still goes in. A single mistyped rating does not throw out the other four hundred.
- **Dates** are kept, so a review you collected two years ago does not claim to be from this morning.

Keep files to 5,000 rows. Above that a single upload has more to do than one request is given time for, so split it in half - the second half will pick up exactly where the first left off.

---

## Verified purchases

A review whose email address matches a paid order containing that product is badged **Verified purchase**.

Refunded orders still count. The customer had the thing, formed a view of it and sent it back, which is arguably the most honest review on the page.

What it does **not** mean is that the reviewer proved who they are - anybody can type a customer's email address. The badge is there to keep a product page honest, not to guard anything, and nothing about it grants access to anything.

The match is recorded whether or not you show the badge, so switching the badge on next year labels the reviews you have already collected rather than only the new ones.

If your shop uses product options (the Shop Variations module), a customer who bought the blue one has bought the product, and their review lands on the product's page along with everyone else's. Three variants of one desk are one review page, not three.

---

## Asking past customers

Switched off until you switch it on, because installing a module should never start writing to your customer list on its own.

Turn it on and once a night, a while after an order has gone out, the customer gets **one** email asking how they got on with what they bought, linking to each product. Not one email per item - one per order, however many things were in it.

Nobody is asked twice about the same order, and nobody is asked about something they have already reviewed off their own bat. The first run on a shop with years of history writes to at most forty orders, and the rest go out on following nights, so your sending reputation survives the enthusiasm.

The email is deliberately plain and says it would rather have the truth than the compliment. Reviews you fished for read like reviews you fished for.

---

## Who can do what

Two permissions, under **Users → Roles**:

- **`reviews.access`** - see the reviews list. This includes reviewers' email addresses, so it is not nothing.
- **`reviews.manage`** - publish, hold, turn down, reply, delete, and change these settings.

Your shop permissions do not carry over. Somebody allowed to edit the catalogue is not automatically allowed to read every reviewer's email address or to write a public reply in your shop's name. If you want one person doing both, give their role both keys - which is then a decision rather than an accident.

---

## What it does not do

- **Photographs with reviews.** Not yet. Shoppers' photos need a moderation flow of their own, and half-built it is worse than absent.
- **Stars on the product cards in a grid.** The reviews live on the product page for now.
- **A link straight into the Reviews tab.** The invitation emails land on the product page, and the shopper clicks Reviews. If you have placed the Reviews block on the page instead, the link lands right on it.
