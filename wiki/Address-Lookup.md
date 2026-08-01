# Address Lookup

**Address Lookup** (module name `address-lookup-for-shop`) helps shoppers through the dullest part of checkout: typing their address. They start typing the first line into the ordinary **Address line 1** field, matching addresses appear underneath as they type, and picking one fills in the whole thing - first line, second line, town, county and postcode - in one go. Anyone who would rather type it all out can simply carry on; the fields behave exactly as they do without the module.

Requires the [Shop](Shop) module (0.1.163 or later).

## What it needs

The looking-up is done by [Ideal Postcodes](https://ideal-postcodes.co.uk), who charge a small amount per lookup, so you bring your own API key:

1. Sign up at ideal-postcodes.co.uk and create an API key.
2. In your admin, go to **Shop → Settings → Address lookup** and paste it in.

That's it. The key stays on your server - shoppers' browsers never see it, and the settings screen only ever shows you its last four characters. If your site's environment already carries the key as `IDEAL_POSTCODES_KEY`, that works as a fallback and you needn't paste anything.

## Settings

Under **Shop → Settings → Address lookup**:

- **Suggest addresses as shoppers type** - the master switch. Turned off, checkout shows the ordinary address fields, nothing is looked up, and nothing is billed.
- **Ideal Postcodes API key** - paste a new key to save it, or remove the saved one to fall back to the environment's key (if there is one).

## Keeping the bill sensible

Ideal Postcodes bills per lookup, so the module is careful with them:

- Nothing is looked up until the shopper has typed at least three characters, and a pause in typing is waited for before asking.
- Lookups are rate-limited per visitor, so a stuck key or a script can't run up a bill.
- If no key is set or lookups are switched off, the checkout makes no requests at all.

## When things go wrong

If the key is missing, Ideal Postcodes is having a bad day, or the shopper's connection drops, the suggestions simply stop appearing and the field carries on as a perfectly ordinary text box. Checkout never breaks because lookup couldn't help.
