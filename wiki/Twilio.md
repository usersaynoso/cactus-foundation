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

Turn forwarding on and calls to that Twilio number are put straight through to your chosen number. Turn it off and the number goes back to doing whatever it did before. Changes apply as soon as you press Save - no redeploy needed.

---

## Sign-in codes by text message

Normally, signing in with a password sends a 6-digit code to your email. With Twilio connected, you can have those codes texted to your phone instead.

**For admins:** on the **Twilio** admin page, find the **SMS login codes** card. Enter your mobile number, we text you a code, you type it in, done. From then on, your password sign-in codes arrive by text. You can turn it off from the same card.

**For members:** members find the same option on their account page under **Text message sign-in codes**. Once verified, their two-step sign-in codes come by text rather than email.

**If the texts ever stop working** - credentials removed, module disabled, Twilio having a bad day - codes quietly go back to email. Nobody gets locked out.

---

## A note on costs

Twilio charges per text and per forwarded minute at their usual rates. Cactus adds nothing on top, but do keep an eye on your Twilio balance - a busy site sending many sign-in texts is not free, merely cheap.
