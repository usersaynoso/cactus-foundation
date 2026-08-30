# Pay With Atoa

**Pay With Atoa** (module name `pay-with-atoa-for-shop`) adds **pay by bank** to
your checkout, through [Atoa](https://paywithatoa.co.uk). The shopper picks it,
approves the payment in their own banking app, and the money comes to you. No
card, no card fees, nothing stored anywhere.

It is a separate module, so it only exists on your site if somebody installs it.
Once it is on, it joins the list on **Shop → Payments** like every other method,
with a settings page of its own along the top.

> **You choose where the shopper pays.** Either they go off to Atoa's own page
> and come back, which is what happens out of the box and needs nothing setting
> up - or Atoa's payment window opens over your own checkout and they never
> leave your site, which needs your web address whitelisting with Atoa first.
> See [Where the shopper pays](#where-the-shopper-pays).

---

## What you need to do first

Two jobs in your Atoa dashboard. Neither takes long, and the only fiddly part is
that they live on two different pages.

**1. Find your access secret.** In the Atoa dashboard, click the **gear icon**
in the left sidebar, then **Settings** inside the menu it opens, and then
**API Access**. Settings twice over is not a slip of ours: the gear is one
thing and the Settings item inside it is another, and the page sits under both.

That page has a separate Sandbox section and Production section, each with its
own Access ID and Access secret, so take the pair for whichever one you are
setting up. Atoa shows an access ID beside the secret: you do not need that one,
and there is nowhere to put it. The secret on its own is the whole key.

Two other things sit on that page and neither of them is your problem today. The
**Redirect URL (Optional)** box can stay empty, because your site sends Atoa the
right return address with every individual payment rather than relying on one
setting. **Whitelist your domains** is for keeping the payment on your own
checkout page, which is a later release. Leave both alone.

**2. Generate the webhook signing secret.** Same gear icon, same **Settings**
inside it, but **Webhooks** this time rather than API Access. Use the
**Generate a signing key** button. It will ask you to confirm your password.
**Atoa then shows the `whsec_…` value once and never again**, so have the
Cactus settings page open and paste it straight in. If you lose it, generate
another.

This one is not optional. Until you have it, pay by bank stays off your checkout
entirely, because without it there is no way to tell a genuine "the money
arrived" message from one somebody made up, and a payment method that cannot
confirm its own payments has no business being offered.

It is worth saying plainly that **the signing secret is not on the API Access
page**. Plenty of services keep everything together on one page; Atoa does not,
and a good deal of time can go into hunting for it in the wrong place.

While you are in the dashboard, it is worth **picking your brand colour**. Atoa's
payment screens take one colour and have no light and dark pair, so choose one
that still reads properly on a white page and a dark one alike.

You do **not** need to paste a web address anywhere. Registering where Atoa sends
confirmations is a button on your own settings page, and it is covered below.

---

## Sandbox and production, and why it matters

Atoa gives you two completely separate worlds:

- **Sandbox** is for testing. Nothing moves real money, and a real customer
  cannot pay you in it.
- **Production** is real bank payments from real customers into your real
  account.

They have their own secrets, and Cactus holds both sets at once so you never have
to retype anything to switch between them. Which one your shop is actually using
is a dropdown on the settings page.

**This is the setting to get right.** Both worlds use the same web address and
the same-looking screens, so nothing about the page itself tells you which one
you are in. A shop left in sandbox looks like it is trading and is not: shoppers
go through the whole checkout, the money never arrives, and it is entirely
possible not to notice for a while. The settings page therefore says which one
you are in three separate times, in a coloured banner across the top, on the
dropdown itself, and with an **In use** marker beside whichever pair of secrets
is live. It is hard to miss on purpose.

The dropdown saves the moment you change it and takes effect on the very next
payment. There is nothing to deploy and no Save to press for it.

---

## Where the secrets go

Four boxes, two per world, on **Shop → Payments → Pay With Atoa**:

| Box | What goes in it |
|-----|-----------------|
| Access secret (production) | `ATOA_ACCESS_SECRET` |
| Webhook signing secret (production) | `ATOA_WEBHOOK_SIGNING_SECRET` |
| Access secret (sandbox) | `ATOA_SANDBOX_ACCESS_SECRET` |
| Webhook signing secret (sandbox) | `ATOA_SANDBOX_WEBHOOK_SIGNING_SECRET` |

The names in the right-hand column are what they are called behind the scenes,
and they are there for anyone who would rather set them alongside your other
settings than paste them into the panel. Filling in the boxes does the same job.

**Secrets are stored with your hosting, not in your site's database**, which is
deliberate: your database goes into every backup and your secrets should not.
The catch is that a secret you have only just pasted in does not reach the
running site until it redeploys. So a box can quite correctly show *(set)* while
the panel above still says you are not connected. It is not lying to you. Deploy
from the notification on your dashboard and come back, and it will say
connected.

You only ever need the pair for the world you are actually using. The other two
boxes can sit empty until you need them.

---

## Registering where Atoa sends confirmations

Under **Payment confirmations** there is a button marked **Register webhook**.
Press it and your site tells Atoa where to send the news when a payment lands.
That is the whole job: nothing to copy, nothing to paste.

Without it, payments still go through and still confirm themselves when the
shopper comes back to your site. What you lose is the shopper who pays and then
closes the tab before it finishes, and that one has to be confirmed by hand.
Press the button.

Two things worth knowing:

- **Each world needs its own registration.** Registering in sandbox does nothing
  for production. Switch the dropdown and press the button again.
- **Atoa cannot change an address once it is registered.** It has to be removed
  and added again, so make sure you are on your live site and not a preview of
  it when you press it. The address it is going to use is shown on the page, for
  your records.

---

## The settings page

Everything lives on **Shop → Payments → Pay With Atoa**.

**Offer pay by bank at checkout** is the on switch. Nothing appears to shoppers
until it is ticked and the connection above it is working.

**Payment description** is what the shopper sees against the payment in their
banking app. Atoa allows **30 characters** and flatly refuses anything longer, so
your shop name on its own is usually the right answer. The box counts down as you
type and stops you at the limit rather than quietly cutting the end off. Leave it
blank and they see the order number instead.

**How long a payment link lasts**, in minutes. Atoa's own default is three
minutes, which is not enough time to open a banking app, find the password and
approve, so Cactus sends **30** instead. Anything from 5 minutes to 24 hours is
allowed, and 30 suits most shops.

**Where the shopper pays** is the choice between Atoa's page and Atoa's window.
It has a section of its own below.

**Let Atoa offer cards as well as bank payments** is off, and usually wants
leaving off. Bank payments are what this method is for and what makes it cheap;
if you already take cards through another method, turning this on offers the
shopper the same thing twice. Whether Atoa can offer cards at all depends on your
account with them. It also does nothing while Atoa's window is opening on your
own checkout: the card step inside that window belongs to a third company again,
and it is switched off there rather than left to fail in front of a shopper. Send
shoppers to Atoa's page if you want cards as well.

---

## Where the shopper pays

Two choices on the settings page, and they take the payment the same way in the
end - the shopper approves it in their own banking app either way. The difference
is where they start.

**Send them to Atoa's page** is what you get out of the box. The shopper leaves
your checkout, picks their bank on Atoa's own page, approves, and comes back.
Nothing to set up, and it works on any site.

**Open Atoa's window on your checkout** keeps them where they are: they press
**Place order**, Atoa's window opens over your checkout, and they never leave your
site. Fewer people wander off, since there is nothing to wander off to.

### On-page needs your web address whitelisting first

**Do this before you switch it on.** Atoa will not open its window on a site it
has not been told about, and the shopper sees nothing happen at all - no error,
no window, nothing.

In the Atoa dashboard: the **gear icon** in the left sidebar, then **Settings**,
then **API Access** - the same page your access secret came from. **"Whitelist
your domains"** sits at the bottom of it. Add your live web address there.

If you have more than one address that reaches your shop, add each one you
actually want paid on. And if you ever move to a new address, add it there before
the move rather than after.

### Atoa's window comes in Atoa's colours, not yours

Worth knowing before a shopper tells you: **Atoa's window does not follow your
site's light or dark theme.** It has one look - a light one - plus a single brand
colour you set in the Atoa dashboard, and it uses that same colour whichever
theme the shopper is browsing in. There is no dark version of it to switch on,
and nothing on this end can repaint it.

Two things follow from that:

- **Pick a brand colour that reads well on white**, because white is what it will
  be sitting on.
- **On a dark site, expect a bright window.** Cactus adds a line under the
  payment method warning the shopper it opens in its own light colours, so it is
  said rather than sprung on them - the same courtesy as the notice before they
  are sent to Atoa's page.

Everything around the window is yours and does follow your theme properly: the
payment method row, its logo, the wording under it, the error line and the
settings page itself.

---

## What happens when somebody pays

1. The shopper picks **Pay by bank** at your checkout and presses **Place
   order**. If you are sending them to Atoa's page, off they go - and a shopper
   browsing the dark version of your site gets a short notice first, saying where
   they are going, because Atoa's page is white and being handed a screenful of
   white at the moment you approve money is a shock nobody needs. If you have
   chosen Atoa's window instead, it opens over the checkout and they stay put.
2. On Atoa's page or in Atoa's window, they choose their bank and approve the
   payment in their own banking app.
3. They come back to your thank-you page, and Atoa separately tells your site
   that the money is on its way. Either one is enough on its own, so a shopper
   who closes the tab - or closes Atoa's window - still gets their order.

   A shopper who closes the window before their bank has finished is told
   nothing has been taken and their basket is exactly as they left it, which is
   true: no order is written until the money is committed. If the payment then
   goes through anyway, Atoa's message to your site creates the order in the
   usual way.
4. The order sits at **awaiting confirmation** for the minute or two a bank
   payment takes to clear, then turns to **paid**, and everything that normally
   follows a sale follows it: the confirmation email, the stock coming off, the
   receipt.

**Nothing is written down until the money is committed.** A shopper who gets as
far as their banking app and thinks better of it leaves no order behind at all,
so your orders list never fills up with things that look like sales and are not.
The only sign is the occasional gap in your order numbers, which is a fair price.

---

## Refunds

**Pressing Refund records the refund. You send the money yourself.**

It works exactly the way a bank transfer refund works, and for the same reason:
the items come off the order, your books are credited and the customer gets their
credit note, but the money itself goes from your bank to theirs, by whatever
means you normally use.

Nothing leaves your Atoa account when you press that button. Automatic refunds
are a later release, and the refund box on the order says as much so nobody is
caught out by it.

---

## Limits worth knowing

- **Pounds only.** Atoa is a UK service. An order priced in anything else is
  refused outright rather than quietly charged in sterling.
- **£1.00 minimum.** Atoa will not take a payment under a pound.
- **30 characters** for the description the payer sees.
- **Payment links expire**, after however long you set above.

---

## If something is not working

**"Not connected"** with the boxes filled in. Almost always the redeploy: secrets
live with your hosting and do not reach the site until it deploys again. The
panel tells you which secrets are saved-but-not-yet-live separately from the ones
you have not filled in at all.

**Pay by bank is not showing at checkout.** Check, in this order: the **Offer pay
by bank at checkout** switch, whether the panel says connected, and whether you
have generated the webhook signing secret for the world you are in. The last one
catches most people, because it lives on the Webhooks page rather than with the
rest of the credentials on API Access, and is easily missed.

**A payment that never confirmed.** Register the webhook if you have not. If you
have, check you are registered for the world you are actually trading in.

**Atoa's window does not open, and nothing at all happens.** That is the
whitelisting: Atoa refuses to open on an address it has not been given. Add your
web address under **Whitelist your domains** on the API Access page, or switch
back to sending shoppers to Atoa's own page, which needs no whitelisting.

**Everything works but no money arrives.** Check the environment dropdown. If it
says sandbox, that is your answer.

---

## See also

- [Shop](Shop) - the shop itself, and the other payment methods
- [Configuration reference](Configuration-reference) - every setting, listed
