# Product Discovery

The **Product Discovery Tool** module (`product-discovery-tool`) puts a guided buying
flow on your shop: a few plain questions that end with the right products on screen.

Requires the [Shop](Shop) and [Shop Filters](Shop-filters) modules. Filters is a hard
requirement rather than a nicety - its groups, filters and rules *are* the vocabulary
the last step asks in, and all the matching is its code. There is no second set of
filters to keep in step.

## The idea

A filter panel assumes the shopper already knows what they want. Plenty do not. Somebody
buying a desk for the first time does not know a cantilever frame from a panel end, has
no opinion about wave tops, and will not form one by staring at nine tick boxes.

So this walks them through it instead:

1. **What are you looking for?** Desks, chairs, storage, whatever your first level says.
2. **Which sort?** Rectangular, corner, height adjustable.
3. **What matters to you?** The products are already on screen; the questions narrow
   them as they are answered.

The difference from an ordinary filter panel is that **every option says what it means**.
"Cantilever" gets a sentence, "best for" and "worth knowing" sit under it, and a
**Compare these** control puts the options side by side with your own words in the table.

## What a shopper gets

- **Live counts** on every card, so nobody picks a route with nothing down it.
- **A running summary** of every answer, each one removable. Removing an early answer
  clears the later ones, because they were chosen against something that no longer
  applies.
- **"Not sure yet"**, which skips a step over the products reached so far rather than
  guessing on their behalf. You can turn it off per flow.
- **An option that would leave nothing is shown greyed with the reason**, never quietly
  dropped. A guided flow is meant to teach, and a vanishing option teaches nothing.
- **Never a dead end.** If a combination reaches zero anyway - a shared link, or an
  answer that was fine until an earlier one was removed - the nearest sets are offered:
  "6 without *Glass top*". Configurable off.
- **Products opened with the right options already chosen**, so nobody answers the same
  question twice.
- **Two or three results side by side**, with the features the flow asked about as the
  rows.
- **The whole state in the address**, so back and forward work and a result set can be
  shared or linked to from a blog post or an email.

On a phone it is one step per screen, with the questions behind a sticky
"See 24 products" bar and the back control within reach of a thumb.

## Setting one up

Everything lives on **Shop → Products → Product Discovery**. Name a flow, and four tabs
appear.

### Flow

The tree builder, and the flow's own settings.

Each choice gets a label, a picture (or an emoji), a one-line blurb, the long
explanation behind "What is this?", and its **best for** / **worth knowing** lines - which
are also what the comparison table is built from.

**What a choice selects** is the interesting part, and it is deliberately not a mirror of
your category tree:

| Setting | What it means |
|---|---|
| The same products as the step above | Narrows nothing itself; useful as a purely descriptive branch |
| A category | Only that shop category's products (its sub-categories too, if the category rolls up) |
| A collection | Only that collection |
| A tag | Only that tag |
| Filters only | No shelf at all - just the filters ticked below |

And a choice can do both: narrow to *Desks* **and** arrive with *Height adjustable*
ticked. That is why "Height adjustable" can be a *type* here even though it is a filter
in the shop.

Filters a choice turns on are what the choice **is**, so the features step never asks
about them again. Picking "Height adjustable" as a type does not then ask "Height
adjustable?" as a feature.

**A live product count sits beside every choice as you build**, so a choice that catches
nothing is obvious straight away rather than after it ships. A choice pointing at a
category that has since been deleted says so in its own words - a count of zero can mean
an empty shelf, and you need to know which of the two you are looking at.

Branches can be different depths, and that is correct rather than a bug: if Accessories
has no sub-types, its route is two steps and says so, while Desks is three.

The flow's own settings sit at the top of this tab: its name and address, its heading and
the line under it, which products it can reach at all, how many results a page, and
whether "Not sure yet" is offered.

**The button at the end is optional and blank by default.** Fill in a label *and* an
address and a button appears under the results; leave either blank and the products are
the end of the flow, which is what most shops want. Nothing is ever filled in for you
from whatever modules happen to be installed.

### Questions

Which of your filter groups the last step asks, in what order, worded how.

**Every group is asked already**, whether you touch this screen or not - in the filters
module's own order, under its own name, after any you have curated. This screen is where
you improve that, never where you make it work at all. Per group you can:

- ask it in your own words ("How much height do you need?" rather than "Height");
- write a line explaining what the feature is, before the options;
- put it up front or under "More options";
- allow one answer or several;
- not ask it at all.

By default the wording applies everywhere in the flow. You can also set it for one choice
only, for the cases where the same word means something different on a chair than on a
desk.

### Guidance

The coverage screen: every option in your whole filter vocabulary, with a tick for the
ones you have explained, and a filter for showing only the ones with nothing written.

Copy is the real work here. The code took a week; a hundred honest explanations of what a
cantilever frame is are the actual job. This screen exists so the missing copy is visible
rather than a flow shipping half-explained.

Per option you write:

- **What it is** - the full explanation, behind "More about…"
- **Best for** - the line shown under the option itself
- **Worth knowing** - the caveat
- optionally a picture and a "read more" address

All three feed the side-by-side comparison, so the table and the option cards cannot
drift apart.

This tab is also where a whole flow is **downloaded as a file and uploaded again** - see
below.

### Insights

Counts, and only counts: how often each step was reached, which options get picked, which
never do, which answers keep leading to dead ends, and what people gave up when offered a
way out of one.

There is **no cookie, no identifier and no visitor record** behind any of it - a count per
flow, per day, per step, per choice, and nothing else. Nothing here could identify
anybody, so there is nothing to add to your cookie banner.

## Settings

**Shop → Settings → Product Discovery** carries the behaviour switches, which apply to
every flow:

| Setting | Default | What it does |
|---|---|---|
| Show how many products are behind each answer | On | "Height adjustable - 34 desks" |
| Offer the side-by-side comparisons | On | The Compare controls, on options and on results |
| Never end on "nothing matches" | On | Offers the nearest sets instead of an empty list |
| Show the matching version's photo on the results | On | With Oak chosen, oak products show their oak photo |
| Open products with the chosen options already set | On | No answering the same question twice |

## Where a flow appears

Each flow answers at **its own bare address** - `/find-your-desk` - with its own page
title, description, share image and "keep this out of search results" switch. Only that
address goes in your sitemap: the steps live in the query string precisely so the tool
never mints thousands of near-identical pages.

The page itself is designed under **Design → Layouts → Product Discovery**, one template
stamped for every flow. A starter layout is published for you on install, so a flow works
the day it is created. Two blocks are available there:

- **Discovery: Heading** - the flow's heading, its standfirst and its designed intro.
- **Discovery: Guided Flow** - the wizard itself.

There is also **Discovery: Launcher**, droppable on any page: a card that drops a shopper
into the middle of a flow. Point it at a flow address and, optionally, a starting choice
(`desks/height-adjustable`) and somebody clicking it on your Desks category page lands on
step two with Desks already answered. A launcher pointing at a flow that has been deleted
or unpublished renders nothing rather than a dead call to action.

Flows can be linked from your site menu like any other page.

If two things want the same address, the flow is refused at save time with a sentence
rather than quietly taking a product's page over.

## Moving a flow between sites

The **Guidance** tab downloads a whole flow as a file and uploads one back. Everything in
it is referenced by slug - a filter is `colour/oak`, a choice is its path
`desks/height-adjustable` - so the file is readable by a person and applies to another
shop with the same vocabulary.

Uploading is two steps on purpose:

1. **Check it.** Every reference is resolved and the report tells you exactly what the
   file names that your shop has not got, plus how many of your existing choices the file
   would remove. Nothing is written.
2. **Apply it.** Refused outright if the check would have reported anything - the good
   half is never applied on its own. The whole flow lands in one go or not at all.

A re-import of an edited file is the truth, not a suggestion: choices the file no longer
names are removed, along with their questions. Explanations are the exception - they are
shared by every flow on the site, so a file that happens not to mention one leaves it
alone.

There is a command-line twin for the same job, running the same code:

```bash
node scripts/import-flow.mjs my-flow.json --dry-run
```

It needs `DATABASE_URL` pointing at the site being configured. Read the dry run first.

## Limitations worth knowing

- **A product with no variations** is reachable only through spec-based and price-based
  questions, because the option matcher works through variations. Same as the filter grid.
- **A shop with no filter groups yet** still gets a working flow: the browse steps work,
  the last step simply shows the products with nothing to ask, and the Questions tab says
  why.
- **Renaming a filter group's slug** changes the deep links into a flow, exactly as it
  does for filter pages.
- **Deleting a shop category** a choice points at leaves that choice finding nothing: the
  card disappears for shoppers and the Flow tab shows a warning. Shop is not constrained
  by a module that depends on it.
