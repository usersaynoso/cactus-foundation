# Google Tag

Puts the Google tag on your site so **Google Analytics** and **Google Ads** can tell you what your visitors did - and, when someone buys something, what the order was worth. It is how you find out which adverts pay for themselves rather than guessing.

It works on any site for visitor numbers. Add the [Shop](Shop) module and it counts the sales too.

---

## What you need before you start

Depending on what you want to measure, one or both of:

- **A Google Analytics measurement ID.** In Google Analytics: **Admin → Data streams → your website**. It looks like `G-XXXXXXXXXX`.
- **A Google Ads conversion ID and conversion label.** In Google Ads: **Goals → Conversions → your purchase action**. Google shows them as a pair, like `AW-123456789` and `abcDE_fgHijklMN`. **You need both.** The ID says which account; the label says which conversion. An ID on its own counts nothing.

You can paste the whole thing Google gives you into either box - the two halves are pulled apart for you.

---

## Setting it up

1. Install the module.
2. Go to **Settings → Google Tag**.
3. Paste in whichever IDs you have.
4. Tick **Send measurements to Google**.
5. The **Google Tag** block goes onto your header layout on its own when you install the module. It shows nothing on the page - it just does the counting. Move it or delete it if you would rather, and it stays moved or deleted; nothing puts it back. If you installed the module before this was automatic, add it yourself: **Layouts → your header layout → Google Tag**. Without it, nothing is measured at all.
6. Sort your cookie banner out. See below. The settings page will tell you if something is amiss.

---

## Settings

| Setting | What it does |
|---------|--------------|
| **Send measurements to Google** | The master switch. Off, nothing is sent whatever else is filled in. |
| **Google Analytics measurement ID** | Your `G-…` ID. Leave empty if you only want to measure adverts. |
| **Google Ads conversion ID** | Your `AW-…` ID. Leave empty if you only want visitor numbers. |
| **Google Ads conversion label** | The other half of the pair. Without it, Google Ads will not count your orders. |
| **Count page views as well as orders** | On, Analytics gets every page a visitor looks at. Off, only orders are reported. |
| **Let Google estimate the visitors who said no** | See [Consent](#consent) below. Off by default, which is the cautious setting. |

---

## Consent

Nothing here happens behind your visitors' backs. The tag runs on the same cookie banner as the rest of your site, and a visitor who changes their mind is honoured on the spot - no reload, no waiting.

Two of the standard cookie categories cover it:

| Category | Covers |
|----------|--------|
| **Analytics** | Counting visits and pages. No advertising. |
| **Marketing** | Measuring which advert led to an order, and showing relevant adverts elsewhere. |

Both come with a Cactus cookie banner as standard. If yours is missing one, the module offers it as a **one-click suggestion** on **Settings → Privacy**, with the wording already written - hover it to read the wording, click it to add it, then save.

### The bit worth reading twice

**You can only wait for a switch that exists.** If your banner has no Analytics category, there is nothing for a visitor to agree to - so rather than wait for ever and quietly measure nothing while appearing to be switched on, the tag runs for everybody. Same for Marketing.

That may be exactly what you want, or it may be an oversight. The Google Tag settings page tells you which situation you are in, in plain English, with a link straight to the Privacy settings. It also warns you if your cookie banner is switched off altogether, in which case nobody is asked anything at all.

Getting this right is your responsibility, not the module's. It just refuses to be quiet about it.

### "Let Google estimate the visitors who said no"

Google's consent system has two honest readings, and this switch picks between them.

- **Off** (the default). Nothing Google-related is fetched at all until a visitor agrees. Someone who has not answered your banner, or who said no, has no contact with Google whatsoever. Cleanest to explain; you simply see fewer visitors than you had.
- **On.** Google is loaded straight away but told it may not store anything about the visitor. It sends anonymous, cookieless pings, which it uses to *estimate* the visits it is not allowed to measure properly. Better numbers, rather more to explain if anyone ever asks.

---

## What gets measured

**Page views** (if you have left that on): the page someone landed on, and each page they move to afterwards.

**Orders.** When an order reaches the confirmation page, Google is told the order number, the total, the tax, the delivery, any discount code, and every line on the order.

An order counts when it is **paid**, or when it has been **placed on a manual payment method** - a bank transfer or cash - and is waiting for the money. That second case is deliberate: a good deal of trade ordering works that way, and leaving those out would make your shop look half the size it is. A payment that is still going through, or one that failed, is nobody's sale and is not counted.

An order is only ever counted **once**, however many times the confirmation page is refreshed, revisited or bookmarked and come back to next week.

---

## Things worth knowing

**Ad blockers.** A fair slice of visitors block Google outright - reckon on losing somewhere between a tenth and a third of them. Combined with people declining cookies, the numbers in Google will always read lower than the orders in your admin. Your admin is the truth; Google is the sample.

**Give it a day.** Google Ads conversions can take a few hours to appear, and Analytics reports settle overnight. A quiet first afternoon is not a fault.

**Your web address must match.** If the address registered in Google Ads is not the address your site actually runs on, conversions are recorded against nothing at all, silently. Check it if the orders are not showing up.

**Your site's security policy already allows Google.** Cactus keeps a strict list of which outside companies may run anything on your pages, and this module adds Google's addresses to it when installed. You do not have to do anything - but it does mean the module has to be **installed and deployed** before Google's own "is the tag there?" check can succeed. If that check fails on a site where everything else looks right, an incomplete deployment is the first thing to rule out.

**One block, not two.** Put the Google Tag block on the header layout only. It will not double-count if it ends up in the footer as well, but there is no reason to have two.

---

## Not in this version

- **Leads, quotes and sign-ups.** The plumbing carries them already, but each needs its own conversion action set up in Google Ads first, so nothing is guessed at. A later release.
- **Server-side measurement** (Enhanced Conversions and the like), which is what recovers the visitors ad blockers hide. Also a later release.

---

## Related

- [Configuration reference](Configuration-reference) - the cookie banner settings
- [Shop](Shop) - where the orders come from
- [Modules](Modules) - installing and updating modules
