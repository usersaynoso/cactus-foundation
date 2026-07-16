# Twilio

The Twilio module connects your site to your [Twilio](https://www.twilio.com) account. It forwards calls made to your Twilio phone numbers wherever you like, takes a voicemail when nobody answers (with opening hours per number, if you'd rather your phone didn't ring at midnight), shows each number's call and text message history (with playback of any recordings), lets you make outbound calls that show your Twilio number as caller ID, and sends sign-in codes by text message instead of email.

If you don't have a Twilio account, none of this page applies - carry on happily without it.

---

## Setting it up

1. Install the module from **Modules** in the admin (repository: `cactus-foundation-modules/twilio`).
2. Go to **Settings → Twilio** and enter two things from your Twilio console:
   - **Account SID** - starts with `AC`, sits on the console dashboard.
   - **Auth token** - right next to the Account SID. Treat it like a password, because it is one.
3. Save. The values take effect after the next deployment - the site will let you know one is needed.

Once connected, the settings tab shows the account it's talking to, so you can tell at a glance whether the credentials work.

---

## Countries other than the United States

Twilio can handle a number's calls and texts in the **United States** (the default), **Ireland** or **Australia**. That choice is made **per phone number**, down in the Phone numbers section - so one number can run through Ireland while another stays in the States.

If you only ever use the United States, skip this bit entirely and carry on.

To use Ireland or Australia, there's one wrinkle worth knowing about: **Twilio issues a separate auth token for each country, and your main one won't work there.** Nothing to be done about that, it's how Twilio is built. So **Settings → Twilio** has an "Other countries" bit under the main credentials with a box for each:

- **Ireland auth token**
- **Australia auth token**

You'll find them in the Twilio console under **API keys & tokens**, with the country picked in the Region dropdown - the same page as your main token, just a different setting on it. Fill in only the ones you actually use and leave the rest blank. Like the credentials above, they take effect after the next deployment.

Without the right token, a number routed to that country still works perfectly well for callers - it just won't show you any of its calls or texts, because those records live in that country and the site can't reach in to read them. The settings page says so plainly next to any number in that state, rather than leaving you staring at an empty table wondering.

---

## Phone numbers

Once connected, a **Phone numbers** section appears on the same settings tab, listing every number on your Twilio account. No typing numbers in by hand - the site fetches them for you, along with whether each one can send text messages.

- **Add to site** - puts a number to work on this site. Add as many as you like; remove them just as easily.
- **Country** - where Twilio handles and stores that number's calls, texts and recordings: United States, Ireland or Australia. Each number gets its own, so you can mix and match. See the section above before you pick anything other than the United States, because each country needs its own token. Twilio takes up to five minutes to apply the change, and it only affects things from that point on - whatever's already been logged stays in the country it happened in.
- **Send texts from this number** - each text-capable number you've added offers this choice, and exactly one holds it at a time. Sign-in codes go out from whichever number you've picked. The first text-capable number you add is chosen automatically, so most people never need to think about it.
- Numbers that can't send texts are labelled **No texts** and can still be added for call forwarding - they just aren't offered for texting. The site will never try to send a text from a number that can't, which saves a certain amount of head-scratching.

Until a text-capable number is added, sign-in codes carry on arriving by email as usual. Number changes apply immediately - no redeploy needed, apart from the country tokens above.

---

## Call forwarding

Go to **Settings → Twilio** and scroll past the credentials - the **Call forwarding** section appears once the account is connected. Every phone number on your Twilio account is listed, each with:

- **Forward calls to** - the number that should ring when someone calls your Twilio number, in international format.
- **Forwarding on** - the switch that makes it happen.
- **Greeting played before forwarding** - an optional message read out to the caller before their call is put through, e.g. "Thank you for calling. Calls are recorded." Leave it blank and calls go straight through.
- **Greeting voice** - pick who reads the greeting. The list covers Twilio's basic voices plus a selection of their more natural-sounding ones (British, American and Australian accents). The fancier voices sound better and cost slightly more per call - Twilio bills text-to-speech by the character.
- **Record calls** - when ticked, Twilio records the forwarded call from the moment it's answered. Recordings live in your Twilio account (Twilio's usual recording storage charges apply) and can be played back straight from the call log on the **Twilio** page - no console safari required.
- **Show this number as caller ID** - normally a forwarded call shows the original caller's number on your phone. Tick this and it shows your Twilio number instead, so you know at a glance the call came through this line - useful if calls to several numbers all land on the same mobile. The trade-off is that you won't see who's actually calling until you answer; the caller's real number is still in your Twilio call logs.
- **Call me to preview** - appears once you've written a greeting. Enter your own number, press the button, and Twilio rings you and reads the greeting in your chosen voice - exactly what callers will hear, because it is what callers will hear. Works before you save, so you can audition voices to your heart's content. Each preview is a normal (short) outbound call at Twilio's usual rates.

Turn forwarding on and calls to that Twilio number are put straight through to your chosen number. Turn it off and, unless voicemail is on, the number goes back to doing whatever it did before. Changes apply as soon as you press Save - no redeploy needed.

**A word on recording law:** many places require you to tell callers they're being recorded, and some require consent. The greeting is the natural place to say so, but what it needs to say is between you and your local regulations - Cactus merely holds the microphone.

---

## Voicemail

Underneath each number's forwarding settings is **Take a voicemail when nobody answers**. Tick it and callers who don't get through can leave a message instead of hearing the engaged tone.

- **Ring for (seconds) before voicemail** - how long your phone rings before voicemail steps in. Twenty seconds is about five rings, which is the usual sort of thing. Anything from 5 to 120 seconds is allowed, though a caller listening to two minutes of ringing has long since given up. If forwarding is off there's nothing to ring, so this box greys out and callers go straight to voicemail.
- **What callers hear before the beep** - your voicemail message. Leave it blank and callers get a stock apology, which does the job but won't win any awards.
- **Voicemail voice** - same choice of readers as the forwarding greeting, and you can pick a different one. **Call me to hear it** rings you and reads it out before you commit.

Voicemail also catches calls where your phone is engaged or the forward fails, not just the ones you don't reach in time. Messages can run to two minutes, then Twilio wraps things up.

**Where the messages go:** nowhere new. A voicemail turns up in the call log on the **Twilio** page with a **Listen** button, same place and same player as a recorded call, but marked **Voicemail** so you can tell a message somebody left from a conversation somebody had. Twilio's usual recording storage charges apply.

**How you find out about it:** each new message rings the notification bell in the admin bar, with the caller's number in the notice and a link straight to the Twilio page. Withheld numbers say so rather than pretending to be one. Read the notice and it clears itself; the next message raises its own, so a quiet week doesn't bury a busy one. Only messages left from now on are marked and announced - anything recorded before this update stays in the log as an ordinary recording, because Twilio never knew the difference and neither, retrospectively, do we.

**Callers who don't say anything:** plenty of people hear the greeting, think better of it and hang up at the beep. Twilio still files a recording of the silence, but a message under two seconds long isn't a message, so it gets no badge and no notification. The recording stays in the call log if you're curious about what nobody said.

---

## Opening hours

Tick **Only ring during opening hours** on a number and you get a row per day: an **Open** switch and a from/to time. Outside those hours the phone doesn't ring at all - callers go straight to voicemail if you've switched it on, and are politely turned away if you haven't. Which is worth a moment's thought before you tick the box.

A few things worth knowing:

- Times follow your site's timezone, the one on **Settings → General**. Change that and your opening hours move with it.
- Closing time is the moment the phone stops ringing. Set 09:00 to 17:00 and a call at 17:00 exactly goes to voicemail.
- A closing time earlier than the opening one runs through midnight, so 18:00 to 02:00 covers the evening and the small hours after it. Handy for anyone whose phone rings when the pubs shut.
- Untick **Open** for a day off. Don't set a day's hours to 09:00 to 09:00 and expect anything to happen - that's a window with no time in it.
- Leave the box unticked and the number behaves as it always has: available at any hour.

Opening hours only decide whether the phone rings. Everything else - your greeting, recording, caller ID - carries on as configured.

---

## Call and message logs

Go to **Twilio** in the admin sidebar. Each phone number on your Twilio account gets its own tab, and each tab shows:

- **Call log** - the number's recent calls, incoming and outgoing, with date, direction, who called whom, how it ended and how long it lasted. Calls that were recorded have a **Listen** button - press it and the recording plays right there in the page. Voicemail messages sit in the same list, next to a **Voicemail** tag so they don't get mistaken for a recorded conversation. Recordings never leave your Twilio account; the site simply plays them to you, and only to admins with permission to manage Twilio.
- **Message log** - the number's recent text messages, both directions, with the full message text.

A **Refresh** button sits at the end of the tab bar for when you're waiting on something. Logs show the most recent 50 entries in each direction - for ancient history, the Twilio console remains the archive.

---

## Making a call

At the top of each number's tab is **Make a call**. Enter the number you want to ring and your own phone number, press the button, and this happens:

1. Twilio rings *you* first, from the Twilio number whose tab you're on.
2. Answer, and it reads out the number you're about to call. Press any key to connect (or hang up if you've thought better of it).
3. Your call is put through, and the person on the other end sees your **Twilio number** as the caller ID - not your mobile.

Handy for returning customer calls from the business number rather than your personal one. Your own phone number is remembered in your browser so you only type it once. Both legs of the call are billed at Twilio's usual rates.

---

## Sign-in codes by text message

Normally, signing in with a password sends a 6-digit code to your email. With Twilio connected, you can have those codes texted to your phone instead.

**For admins:** go to your **Account settings** page in the admin (your avatar or Account in the sidebar) and find the **SMS login codes** card. Enter your mobile number, we text you a code, you type it in, done. From then on, your password sign-in codes arrive by text. You can turn it off from the same card. Any admin can set this up for themselves - you don't need permission to manage the Twilio module.

**For members:** members find the same option on their account page under **Text message sign-in codes**. Once verified, their two-step sign-in codes come by text rather than email.

**If the texts ever stop working** - credentials removed, module disabled, Twilio having a bad day - codes quietly go back to email. Nobody gets locked out.

---

## A note on costs

Twilio charges per text and per forwarded minute at their usual rates. Cactus adds nothing on top, but do keep an eye on your Twilio balance - a busy site sending many sign-in texts is not free, merely cheap.
