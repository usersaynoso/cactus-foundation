# Twilio

The Twilio module connects your site to your [Twilio](https://www.twilio.com) account. It does two things: forwards calls made to your Twilio phone numbers wherever you like, and sends sign-in codes by text message instead of email.

If you don't have a Twilio account, none of this page applies - carry on happily without it.

---

## Setting it up

1. Install the module from **Modules** in the admin (repository: `cactus-foundation-modules/twilio`).
2. Go to **Settings → Twilio** and enter three things from your Twilio console:
   - **Account SID** - starts with `AC`, sits on the console dashboard.
   - **Auth token** - right next to the Account SID. Treat it like a password, because it is one.
   - **From number** - the Twilio number your text messages should be sent from, in international format (e.g. `+447700900123`).
3. Save. The values take effect after the next deployment - the site will let you know one is needed.

Once connected, the settings tab shows the account it's talking to, so you can tell at a glance whether the credentials work.

---

## Call forwarding

Go to **Twilio** in the admin sidebar. Every phone number on your Twilio account is listed, each with:

- **Forward calls to** - the number that should ring when someone calls your Twilio number, in international format.
- **Forwarding on** - the switch that makes it happen.
- **Greeting played before forwarding** - an optional message read out to the caller before their call is put through, e.g. "Thank you for calling. Calls are recorded." Leave it blank and calls go straight through.
- **Greeting voice** - pick who reads the greeting. The list covers Twilio's basic voices plus a selection of their more natural-sounding ones (British, American and Australian accents). The fancier voices sound better and cost slightly more per call - Twilio bills text-to-speech by the character.
- **Record calls** - when ticked, Twilio records the forwarded call from the moment it's answered. Recordings live in your Twilio console (under Monitor → Recordings), not on your site, and Twilio's usual recording storage charges apply.
- **Call me to preview** - appears once you've written a greeting. Enter your own number, press the button, and Twilio rings you and reads the greeting in your chosen voice - exactly what callers will hear, because it is what callers will hear. Works before you save, so you can audition voices to your heart's content. Each preview is a normal (short) outbound call at Twilio's usual rates.

Turn forwarding on and calls to that Twilio number are put straight through to your chosen number. Turn it off and the number goes back to doing whatever it did before. Changes apply as soon as you press Save - no redeploy needed.

**A word on recording law:** many places require you to tell callers they're being recorded, and some require consent. The greeting is the natural place to say so, but what it needs to say is between you and your local regulations - Cactus merely holds the microphone.

---

## Sign-in codes by text message

Normally, signing in with a password sends a 6-digit code to your email. With Twilio connected, you can have those codes texted to your phone instead.

**For admins:** go to your **Account settings** page in the admin (your avatar or Account in the sidebar) and find the **SMS login codes** card. Enter your mobile number, we text you a code, you type it in, done. From then on, your password sign-in codes arrive by text. You can turn it off from the same card. Any admin can set this up for themselves - you don't need permission to manage the Twilio module.

**For members:** members find the same option on their account page under **Text message sign-in codes**. Once verified, their two-step sign-in codes come by text rather than email.

**If the texts ever stop working** - credentials removed, module disabled, Twilio having a bad day - codes quietly go back to email. Nobody gets locked out.

---

## A note on costs

Twilio charges per text and per forwarded minute at their usual rates. Cactus adds nothing on top, but do keep an eye on your Twilio balance - a busy site sending many sign-in texts is not free, merely cheap.
