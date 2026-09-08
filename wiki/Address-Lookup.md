# Address Lookup

**Address Lookup** (module name `address-lookup-for-shop`) helps shoppers through the dullest part of checkout: typing their address. They start typing the first line into the ordinary **Address line 1** field, matching addresses appear underneath as they type, and picking one fills in the whole thing - first line, second line, town, county and postcode - in one go. Anyone who would rather type it all out can simply carry on; the fields behave exactly as they do without the module.

The same suggestions appear anywhere else the Shop asks for an address: a signed-in customer adding or editing one on their **Addresses & Phone Numbers** page gets them too, in the same field, on the same terms.

Requires the [Shop](Shop) module (0.1.163 or later).

## Choosing who does the looking up

You pick one of two services, and you bring your own account either way.

|  | Ideal Postcodes | Google |
| --- | --- | --- |
| Where it works | United Kingdom only | Everywhere, narrowed to the countries you name |
| How good it is on flats | Reads Royal Mail's own address file, so flat and unit numbers are as good as they come | Good on houses, less reliable on flats and sub-buildings |
| What it costs | Typing costs nothing at all. You are charged a small amount only when a shopper actually picks an address | Free up to a monthly allowance a shop of ordinary size will not get near, then a small amount per thousand |
| Anything else | Nothing | Google asks for a small "Powered by Google" credit under the suggestions, which the field puts there by itself |

If your shop only delivers within the UK and you would rather have the best possible flat numbers, choose Ideal Postcodes. If you ship abroad, or you would rather not have a per-lookup bill at all, choose Google.

Switching between them is a radio button, and both keys are kept, so you can try the other one and switch back without pasting anything again.

## What it needs

1. Sign up with whichever service you have chosen and create a key. Ideal Postcodes keys come from ideal-postcodes.co.uk. Google keys come from the Google Cloud console, with the Places API switched on.
2. In your admin, go to **Shop → Settings → Address lookup**, choose the service, and paste the key into that service's box.

3. Press **Test the lookup**. It looks one address up there and then, and tells you in plain words whether the service accepted your key. Worth doing: a rejected key looks exactly like a working one from the settings screen, and the difference only shows up at somebody's checkout.

Keys stay on your server - shoppers' browsers never see them, and the settings screen only ever shows you the last four characters of each. If your site's environment already carries a key as `IDEAL_POSTCODES_KEY` or `GOOGLE_PLACES_API_KEY`, that works as a fallback and you needn't paste anything.

### If you are using Google, two things catch people out

Your site asks Google from the server, not from the shopper's browser, and Google treats those two quite differently:

- **The key must be allowed to use Places API (New).** If the key has a list of permitted APIs on it, Places API (New) has to be on that list, and the API itself has to be switched on for the project. A key that is otherwise perfectly good but not allowed this one comes back refused, and the test above will say so.
- **A key locked to your website address will never work here.** Google calls that a website restriction, and it only applies to requests made by a browser. Since your site asks from the server, use a key with no application restriction, or one restricted by server address instead. The simplest thing is a second key kept for this and nothing else, rather than reusing the one your site already uses for maps or tags.

## Settings

Under **Shop → Settings → Address lookup**:

- **Suggest addresses as shoppers type** - the master switch. Turned off, checkout shows the ordinary address fields, nothing is looked up, and nothing is billed. If the service you have chosen has no key, the switch says so rather than pretending.
- **Who does the looking up** - Ideal Postcodes or Google.
- **Ideal Postcodes API key** and **Google API key** - paste a new key to save it, or remove a saved one to fall back to the environment's key (if there is one). The one not currently in use is marked as such, so you can set it up before you switch.
- **Countries to suggest addresses in** - two-letter country codes for Google, separated by commas, fifteen at most. Leave it at `gb` for a UK-only shop. Ideal Postcodes is UK-only anyway and takes no notice of this.

### Places with names, not just numbers

Google knows a great many places by name rather than by street: a marina, an office block, a business park, a pub. Pick one of those and the name goes on the first line with the street underneath, which is how the Royal Mail writes the same address and how a driver reads it - **Blackwall Basin Moorings** on line one, **1 Myers Walk** on line two.

One thing Google cannot help with: if you live at number 22 of a named place, Google generally knows the place but not your number within it. The name and street arrive filled in and the number is yours to add. Ideal Postcodes, reading the Royal Mail file, does know those numbers, which is the main reason to prefer it for a UK-only shop.

## Keeping the bill sensible

Whichever service you use, the module is careful with lookups:

- Nothing is looked up until the shopper has typed at least three characters, and a pause in typing is waited for before asking.
- Only actual typing counts. If the shopper lets their browser fill the address in for them - Safari's AutoFill, a password manager, a saved address - the whole form arrives at once, already correct, so no suggestions appear and nothing is billed. Any suggestions already showing are cleared away.
- Lookups are rate-limited per visitor, so a stuck key or a script can't run up a bill.
- If no key is set or lookups are switched off, the checkout makes no requests at all.
- On Google, a run of typing and the address the shopper finally picks are counted together rather than one at a time, which is how Google prefers to be asked and is the cheaper way round.

## When things go wrong

If the key is missing, the service is having a bad day, or the shopper's connection drops, the suggestions simply stop appearing and the field carries on as a perfectly ordinary text box. Checkout never breaks because lookup couldn't help.

That is deliberate, but it does mean a broken key is quiet. If suggestions have stopped appearing, go to **Shop → Settings → Address lookup** and press **Test the lookup** - it repeats the service's own explanation back to you rather than leaving you guessing.
