# Twilio

The Twilio module connects your site to your [Twilio](https://www.twilio.com) account. It forwards calls made to your Twilio phone numbers wherever you like, takes a voicemail when nobody answers (with opening hours per number, if you'd rather your phone didn't ring at midnight), shows each number's call and text message history (with playback of any recordings), lets you make outbound calls that show your Twilio number as caller ID, carries WhatsApp on the same account, and sends sign-in codes by text message instead of email.

> **Where it lives now.** The call and text logs used to have a **Twilio** link in the sidebar. They are now a **Calls & texts** tab inside **Settings → Twilio**, alongside the rest of the phone settings. Old links still work.

If you don't have a Twilio account, none of this page applies - carry on happily without it.

---

## Setting it up

1. Install the module from **Modules** in the admin (repository: `cactus-foundation-modules/twilio`).
2. Go to **Settings → Twilio** and pick your **Twilio account country** first. That's the country your Twilio account itself lives in - it's shown in the region switcher at the top of the Twilio console. Not where you are, and not where your phone numbers are. Get this wrong and Twilio rejects the credentials with an unhelpful "Authenticate", so it's worth the ten seconds.
3. In the Twilio console, open **Account → API keys & tokens** and copy two things into the settings tab:
   - **Account SID** - starts with `AC`, top of the page, the same in every country.
   - **Primary auth token** - under **Auth tokens** on the same page, with the page's region dropdown showing the same country as step 2. Treat it like a password, because it is one.
   API keys (the ones starting `SK`) are a different thing and won't work - the settings tab will say so rather than letting you find out the hard way.
4. Press **Test connection** if you'd like to be sure before committing. It checks whatever you've just typed against Twilio there and then, so a mistyped token is caught in seconds rather than after a deployment. Anything you've left blank is checked against the values already saved.
5. Save. The values take effect after the next deployment - the site will let you know one is needed.

Once connected, the settings tab shows the account it's talking to, so you can tell at a glance whether the credentials work. The set-up instructions fold themselves away at that point, on the grounds that you've read them.

### Finding your way around

The Twilio settings tab is divided into six sections along the top:

- **Account** - the credentials above, your account country, and the Test connection button.
- **Phone numbers** - which of your Twilio numbers this site uses, and which one texts go out from.
- **Call handling** - forwarding, greetings, voicemail and opening hours, one number at a time.
- **Texting** - what texts go out from, and a button to send yourself a test one.
- **Templates** - the wording of every text your site sends.
- **Alerts & data** - email alerts, and how long recordings are kept.

---

## Countries other than the United States

Twilio can handle a number's calls and texts in the **United States** (the default), **Ireland** or **Australia**. That choice is made **per phone number**, down in the Phone numbers section - so one number can run through Ireland while another stays in the States.

If you only ever use the United States, skip this bit entirely and carry on.

To use Ireland or Australia, there's one wrinkle worth knowing about: **Twilio issues a separate auth token for each country, and your main one won't work there.** Nothing to be done about that, it's how Twilio is built. So **Settings → Twilio** has an "Other countries" bit under the main credentials with a box for each:

- **Ireland auth token**
- **Australia auth token**

You'll find them in the Twilio console under **API keys & tokens**, with the country picked in the Region dropdown - the same page as your main token, just a different setting on it. Fill in only the ones you actually use and leave the rest blank. Like the credentials above, they take effect after the next deployment.

Without the right token, a number routed to that country still works perfectly well for callers - it just won't show you any of its calls or texts, because those records live in that country and the site can't reach in to read them. The settings page says so plainly next to any number in that state, rather than leaving you staring at an empty table wondering.

One more console quirk worth knowing: **each country keeps its own copy of a number's call settings.** The site wires everything up in the right country automatically when you save, but if you go inspecting a number in the Twilio console, flip the console's region switcher (top right) to the country the number is handled in first - the same number viewed under the wrong country looks blank or half-configured, which has sent more than one person off hunting a problem that wasn't there.

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

Go to **Settings → Twilio → Call handling**. If you have more than one Twilio number, pick the one you're setting up from the row along the top - you work on one number at a time, which beats scrolling past four of them to reach the fifth. A dot next to a number means it has changes you haven't saved yet; switching between numbers doesn't lose them.

If two of your numbers should behave identically, you don't have to set both up - see [One number that behaves like another](#one-number-that-behaves-like-another) below.

Each number has:

- **Forward calls to** - the number that should ring when someone calls your Twilio number, in international format.
- **If nobody answers, also try** - an optional second number. When the first one rings out, this one gets its turn for the same length of time before voicemail steps in. Useful for the mobile-then-landline arrangement, or for handing calls to whoever's actually in.
- **Forwarding on** - the switch that makes it happen.
- **Ring for (seconds)** - how long each ring lasts before the call moves on. Twenty seconds is about five rings, which is the usual sort of thing; anything from 5 to 120 is allowed, though a caller listening to two minutes of ringing has long since given up. See [Beating the mobile's own voicemail](#beating-the-mobiles-own-voicemail) below, which is the reason you might want this shorter than feels natural. If forwarding is off there's nothing to ring, so this box greys out.
- **Ring each number this many times** - normally once. Set it higher and we hang up when the ringing time is up and ring straight back, up to five times, before the call goes to voicemail. Where you've given a second number, each of them gets the same number of tries. The caller just hears it start ringing again.
- **Greeting played before forwarding** - an optional message read out to the caller before their call is put through, e.g. "Thank you for calling. Calls are recorded." Leave it blank and calls go straight through.
- **Greeting voice** - pick who reads the greeting. The list covers Twilio's basic voices plus a selection of their more natural-sounding ones (British, American and Australian accents). The fancier voices sound better and cost slightly more per call - Twilio bills text-to-speech by the character. One wrinkle: the most natural "Generative" voices only work on numbers handled in the **United States** - Twilio hasn't rolled them out elsewhere yet. On a number handled in Ireland or Australia the picker says so, and if one is somehow already saved, callers hear the closest natural-sounding equivalent instead of the call failing - which is what used to happen, and precisely nobody wants a phone number that hangs up on customers over a voice actor.
- **Record calls** - when ticked, Twilio records the forwarded call from the moment it's answered. Recordings live in your Twilio account (Twilio's usual recording storage charges apply) and can be played back straight from the call log on the **Twilio** page - no console safari required, and from the conversation itself if you have the Unified Inbox.
- **Type up recorded calls** - appears once recording is on. Twilio writes out what was said on a recorded call and files it with the call, so you can read a conversation rather than sit through it. The words turn up a few minutes after the call ends, in the call log and in the inbox. **This one costs money**: unlike the voicemail transcription below, writing out a two-party conversation is a separate Twilio product and it charges by the minute for every recorded call on the number, on top of the call itself. Off on every number until you switch it on, and worth leaving off unless you will genuinely read them. Same caveats as any machine transcription - it is English-first, it does its best, and a name it has never heard will come out as something else entirely.
- **Show this number as caller ID** - normally a forwarded call shows the original caller's number on your phone. Tick this and it shows your Twilio number instead, so you know at a glance the call came through this line - useful if calls to several numbers all land on the same mobile. The trade-off is that you won't see who's actually calling until you answer; the caller's real number is still in your Twilio call logs.
- **Or upload a recording** - rather have a human? Upload an MP3 or WAV (up to 10 MB) and callers hear that instead of the typed message and voice - the recording wins whenever one is set, and a little player appears so you can check what's live. Files are kept in your media library, in a **twilio** folder, on whatever storage your site already uses. Remove the recording and the typed greeting takes over again.
- **Call me to preview** - appears once you've written a greeting. Enter your own number, press the button, and Twilio rings you and reads the greeting in your chosen voice - exactly what callers will hear, because it is what callers will hear. Works before you save, so you can audition voices to your heart's content. Each preview is a normal (short) outbound call at Twilio's usual rates.

Turn forwarding on and calls to that Twilio number are put straight through to your chosen number. Turn it off and, unless voicemail is on, the number goes back to doing whatever it did before. Changes apply as soon as you press Save - no redeploy needed.

**A word on recording law:** many places require you to tell callers they're being recorded, and some require consent. The greeting is the natural place to say so, but what it needs to say is between you and your local regulations - Cactus merely holds the microphone.

### Callers who withhold their number

Underneath the forwarding settings is **Callers who withhold their number**, with three choices:

- **Ring through like anyone else** - what's always happened, and what you get unless you say otherwise.
- **Straight to voicemail** - they can leave a message, your phone stays quiet. (If voicemail is off, they're turned away instead, and the settings page says so.)
- **Reject the call** - the caller gets the engaged tone and you get on with your day.

Worth remembering that plenty of legitimate callers withhold their number without meaning anything by it - hospitals and some office switchboards do it as standard - so rejecting outright is a blunter instrument than it looks.

---

## Missed calls

Nobody answered. Two things can happen automatically, both switched off until you say otherwise.

**Text the caller back** - on the Call handling tab, tick **Text the caller back when nobody answers** and write the message: "Sorry we missed your call, we'll ring you back shortly" and so on. Leave the message blank and a sensible stock line goes instead. The text comes from the number they rang where that number can send texts, otherwise from your usual texting number. Callers who withheld their number can't be texted back, for reasons that hopefully need no explanation. Each text costs a text at Twilio's usual rates.

**Email yourself** - on the **Alerts & data** tab, tick **Email me when a call goes unanswered** and give an address. You get a note saying who rang, what they rang, and a link to the call log. Ideal if you'd rather not keep an eye on the admin all day.

---

## Voicemail

Underneath each number's forwarding settings is **Take a voicemail when nobody answers**. Tick it and callers who don't get through can leave a message instead of hearing the engaged tone.

- **What callers hear before the beep** - your voicemail message. Leave it blank and callers get a stock apology, which does the job but won't win any awards.
- **Voicemail voice** - same choice of readers as the forwarding greeting, and you can pick a different one. **Call me to hear it** rings you and reads it out before you commit. The same country rule as the greeting voice applies: "Generative" voices are United States numbers only, and elsewhere callers get the closest equivalent rather than a dead line.
- **Or upload a recording** - same as the forwarding greeting: an MP3 or WAV plays instead of the text-to-speech whenever one is set, stored in your media library's **twilio** folder.

How long the phone rings first, and how many times, is set under **Forwarding** above - it decides how long a caller waits whether or not there's a voicemail at the end of it. With forwarding off there's nothing to ring at all and callers go straight to the beep.

Voicemail also catches calls where your phone is engaged or the forward fails, not just the ones you don't reach in time. Messages can run to two minutes, then Twilio wraps things up.

### Beating the mobile's own voicemail

Every mobile answers its own calls eventually. Leave it ringing long enough and the handset gives up, its network takes over, and your caller leaves a message in a mailbox on somebody's phone - not on your site, where you'd see it, and not anywhere your colleagues can reach it either. Most networks step in somewhere around twenty to thirty seconds, which is awkwardly close to how long you'd naturally let a phone ring.

The fix is a ring that ends before the network's does: shorten **Ring for (seconds)** to fifteen or so, and the call comes back to us with time to spare. On its own that's a bit brutal - fifteen seconds is three rings and one trip across the office - so **Ring each number this many times** rings straight back instead of giving up. Three tries of fifteen seconds is three-quarters of a minute of a phone ringing, in bursts, and the message still ends up on your site at the end of it.

Worth knowing: the caller hears the ringing restart each time, which sounds like an ordinary unanswered call rather than anything clever, and each burst is a separate forwarded call in your Twilio bill. They're short and unanswered, so they cost next to nothing, but they do appear.

**Where the messages go:** nowhere new. A voicemail turns up in the call log on the **Twilio** page with a **Listen** button, same place and same player as a recorded call, but marked **Voicemail** so you can tell a message somebody left from a conversation somebody had. Twilio's usual recording storage charges apply.

**How you find out about it:** each new message rings the notification bell in the admin bar, with the caller's number in the notice and a link straight to the Twilio page. Withheld numbers say so rather than pretending to be one. Read the notice and it clears itself; the next message raises its own, so a quiet week doesn't bury a busy one. Only messages left from now on are marked and announced - anything recorded before this update stays in the log as an ordinary recording, because Twilio never knew the difference and neither, retrospectively, do we.

If the bell isn't enough, tick **Email me when someone leaves a voicemail** on the **Alerts & data** tab and add an address. You get who called, how long they talked for, and a link to go and listen. The recording itself stays where it is - the email carries a link, not an attachment.

**Type messages up for me:** tick this on a number and Twilio has a go at writing out what the caller said. The words appear in the call log a few minutes after the message, underneath the Listen button - handy for skimming a morning's messages without listening to all of them. It's English-only and it's a machine doing its best, so a mumbled postcode may come out as poetry. Twilio charges a small amount per transcription.

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

### Bank holidays and other days off

A weekly timetable can't say "closed on Boxing Day", so underneath the days is **Closed on these dates**. Pick a date, press **Add date**, and that day is closed all day whatever the weekly hours say. Add as many as you like and remove them with the little cross.

Dates that have been and gone do no harm if you leave them - they simply never come round again - but a tidy list is easier to read next December.

**Importing bank holidays.** Typing out every bank holiday each year is nobody's idea of an afternoon, so press **Import bank holidays**, pick a country, and press **Look up the next 12 months**. Available:

- England and Wales
- Scotland
- Northern Ireland
- Republic of Ireland
- United States

You get every public holiday between today and this time next year - so an import in October reaches next Easter, rather than offering you last January. Everything is ticked apart from dates you already have, so you can untick the ones you actually work and press **Add**. Nothing is added until you say so: plenty of businesses open on the odd bank holiday, and the site is in no position to guess which.

The UK lists come from the government's own bank holiday feed, so they're as official as it gets, including the one-off royal occasions that appear from time to time. Ireland and the United States come from a public holiday service; the American list is the nationwide holidays only, since a holiday observed in one state shouldn't shut a phone line three thousand miles away.

Two things worth knowing: the window rolls forward from whenever you press the button, so coming back in a year picks up the next twelve months from that point, and if a source is having a bad day the import says so and changes nothing - your existing dates are never touched by a failed lookup.

### A different greeting when you're closed

"Sorry, nobody is available to take your call" is fair enough at half past four on a Tuesday. At three in the morning it's rather stating the obvious. So with voicemail and opening hours both switched on, you get a second box: **What callers hear when you're closed**. Fill it in and out-of-hours callers hear that instead - your opening times, when you'll ring back, whatever suits.

- Leave it empty and closed callers simply hear your usual voicemail greeting. Nothing changes.
- A recording can be uploaded here too, and closed callers hear it ahead of anything else. With no closed recording, closed words win over the everyday recording - you wrote them specially, after all - and with nothing closed-specific at all, the everyday recording or greeting carries on as usual.
- Only the words change. The voice, the two-minute limit and where the messages land are all the same as any other voicemail.
- **Call me to hear it** rings you and reads it out, same as the others, so you can check it before anybody else does.
- Calls that come in while you're open and simply ring out still get your usual greeting - the caller heard the phone ring, so telling them you're closed would be a bit rich.

---

## One number that behaves like another

Most businesses that end up with two numbers want them doing the same thing. The text number, the number off the old van, the one on the leaflets from 2019 - they all ring the same phone, take the same messages and close at the same time. Setting them up separately works right up until you change your opening hours and remember one of them a fortnight later.

At the top of each number on **Settings → Twilio → Call handling** is **Call handling**, with two kinds of answer:

- **Set up on its own, below** - the number has its own settings, which is how every number starts.
- **Do exactly what [another number] does** - the number copies that one. Everything: forwarding, the second number to try, greetings and recordings, voicemail, missed-call texts, opening hours, bank holidays, how withheld numbers are treated. Pick this and the settings underneath disappear, because there's nothing left to set.

From then on the two stay in step by themselves. Change the opening hours on your main line and the text number is already closed at the same time - nothing to copy across, nothing to forget.

A few things worth knowing:

- **Callers still ring the number they dialled.** Copying settings doesn't divert anything. Anything sent back to a caller - a missed-call text, say - comes from the number they actually rang, not the one it copies.
- **The number's own settings are kept, not thrown away.** Put it back on its own and everything it had before comes straight back, exactly as it was.
- **Only one step.** A number that's copying another can't be copied itself, and a number other numbers copy can't go off and copy a third. The page says so and won't let you tie a knot in it. This means the answer to "what does this number do?" is always one number away, never four.
- **Set the original up first.** You can only copy a number that's already been given some settings of its own.
- If the number you were copying ever leaves your Twilio account, the copier quietly goes back to its own settings rather than falling over.

---

## Call and message logs

Go to **Twilio** in the admin sidebar. Each phone number on your Twilio account gets its own tab, and each tab shows:

- **Call log** - the number's recent calls, incoming and outgoing, with date, direction, who called whom, how it ended and how long it lasted. **One row per call**, however many phones it rang on the way: a call forwarded to your mobile says *forwarded to* underneath the number it came in on, and a call you placed with **Make a call** says *rang you at* underneath the person you rang. How it ended is what happened between the two of you - a forwarded call nobody picked up says so, rather than counting the greeting as a chat - and the length is the talking, with the whole call's length in the tooltip. Calls that were recorded have a **Listen** button - press it and the recording plays right there in the page. Voicemail messages sit in the same list, next to a **Voicemail** tag so they don't get mistaken for a recorded conversation. Recordings never leave your Twilio account; the site simply plays them to you, and only to admins with permission to manage Twilio. Voicemail messages also have a **Delete** button, which asks first and then removes the message from your Twilio account as well as from this list - the only way it stops costing storage. A recorded call has no Delete, on the grounds that a call you chose to record is a record.
- **Caller** - the last column on each row, for blocking whoever was on the other end. See **Blocking a caller** below.
- **Message log** - the number's recent text messages, both directions, with the full message text.

A **Refresh** button sits at the end of the tab bar for when you're waiting on something. Logs show the most recent 50 entries in each direction - for ancient history, the Twilio console remains the archive.

With [Unified Inbox](Unified-Inbox) installed, the same calls, voicemails and texts also appear there as conversations, one per outside number, beside that person's emails and chats. These logs stay exactly as they are: this page is the number's own record, the hub is the person's. Texts reach the hub on its hourly check rather than the instant they arrive.

**Recordings come with them.** A voicemail and a recorded call both arrive in the inbox with the audio attached, so you can play a message from the conversation you are reading rather than coming back here to find it. It plays for admins who may manage Twilio and nobody else, exactly as it does on this page. And where the words have been written out - a typed-up voicemail, or a recorded call on a number with **Type up recorded calls** switched on - they sit in the conversation as text you can read and search, underneath the line saying the call happened.

Writing out takes a few minutes, and the hub checks on the hour. So a message sometimes reaches the inbox before its words do; the words are added to the same message when they arrive, and the conversation does not jump back to the top of your list for it - nothing new was said, it merely became readable.

---

## Blocking a caller

Somebody who will not take the hint can be shown the door. Press **Block** on their row in the call log, or add their number by hand in the **Blocked callers** card underneath it, with a note to yourself about why if you like.

A blocked caller's call is dropped the moment it arrives, before anything else gets a say. Nobody's phone rings, no greeting is read out, no voicemail is taken, no missed-call text goes back and no email alert goes out - because none of that would be true. There was no missed call; there was a call that was refused. The caller hears whatever their own network plays for a refused call, and they are told nothing about why.

Worth knowing:

- **One list for the whole site.** A blocked number is blocked on every one of your Twilio numbers, not just the one you were looking at when you blocked them. Blocking somebody five times over would only be five ways to describe one thing.
- **It only stops calls.** A blocked number can still send you a text, and that text still turns up in the message log. Twilio charges nothing to receive one and there is nothing to drop.
- **Callers who withhold their number can't be blocked**, because there is nothing to put on the list. What happens to them is set per number under **Call handling**, in **Callers who withhold their number** - see [Callers who withhold their number](#callers-who-withhold-their-number) above.
- **Nothing already logged changes.** Their past calls, messages and recordings stay exactly where they are. Blocking is about the next call, not the last one.
- **Unblocking is one press**, from either the call log or the blocked list, and takes effect immediately.

If [Unified Inbox](Unified-Inbox) is installed, the same **Block** button sits at the top of that person's conversation there, and the two lists are the same list.

---

## Making a call

At the top of each number's tab is **Make a call**. Enter the number you want to ring and your own phone number, press the button, and this happens:

1. Twilio rings *you* first, from the Twilio number whose tab you're on.
2. Answer, and it reads out the number you're about to call. Press any key to connect (or hang up if you've thought better of it).
3. Your call is put through, and the person on the other end sees your **Twilio number** as the caller ID - not your mobile.

Handy for returning customer calls from the business number rather than your personal one. Your own phone number is remembered in your browser so you only type it once. Both legs of the call are billed at Twilio's usual rates, and both show up as the one row in the call log - the person you rang, not your own mobile twice.

**The same call, from wherever you happen to be.** This module also offers the call to the rest of the site, so anything with a customer's number on the screen can ring it without you coming back here first - the Unified Inbox does exactly that, from the small arrow beside its write button. It is the same two-leg call with the same caller-ID checks, billed the same way and logged in the same place; only the button is somewhere else.

---

## Sign-in codes by text message

Normally, signing in with a password sends a 6-digit code to your email. With Twilio connected, you can have those codes texted to your phone instead.

**For admins:** go to your **Account settings** page in the admin (your avatar or Account in the sidebar) and find the **SMS login codes** card. Enter your mobile number, we text you a code, you type it in, done. From then on, your password sign-in codes arrive by text. You can turn it off from the same card. Any admin can set this up for themselves - you don't need permission to manage the Twilio module.

**For members:** members find the same option on their account page under **Text message sign-in codes**. Once verified, their two-step sign-in codes come by text rather than email.

**If the texts ever stop working** - credentials removed, module disabled, Twilio having a bad day - codes quietly go back to email. Nobody gets locked out.

**Checking it works:** the **Texting** tab tells you which number texts go out from, and has a **Send a test text** box. Put your mobile in, press the button, and a message saying it's a test lands a few seconds later. Rather more civilised than signing yourself out to find out.

---

## The wording of your texts

Emails have had an editor for a while - **Settings → Emails** - and texts now have the same thing, on the **Templates** tab. Anything on your site that sends a text message puts its wording here, so it's all in one place rather than scattered about.

With the Shop installed, that's the order updates: confirmed, being processed, on its way, complete, cancelled, part of an order dispatched, and the three about a cancel or return request. Pick one on the left, change the words on the right, save.

- **The bits in curly brackets** - `{{orderNumber}}`, `{{customerName}}` and so on - are filled in when the message goes out. The ones marked with a star have to stay in: a text saying an order is on its way, without saying which order, is a text nobody can do anything with.
- **A link to the order** - `{{orderUrl}}` puts in the same *keep track of your order* link the emails use. It asks whoever clicks it for the delivery postcode, unless they're signed in and the order is theirs, in which case it takes them straight to their own order page. It isn't in any of the wording we ship because it's the best part of ninety characters, which on most of these messages is the difference between paying for one and paying for two - so it's there when you want it rather than there by default. Write it as `{{#if hasOrderUrl}}Track it: {{orderUrl}}{{/if}}` and the whole line disappears by itself on a shop with guest order tracking switched off.
- **Preview** shows the finished message with stand-in details, and tells you how many messages you're paying for. Texts are charged in chunks of 160 characters, and a single curly quote or emoji drops that to 70 - so the counter says which one you've ended up with. Keeping the wording snappy is the whole trick.
- **Send test** puts a copy on your own mobile, marked as a test, before any customer sees it.
- **Send this text** can be unticked to stop one particular message going out at all, whoever asked for texts. The rest carry on.
- **Put the original wording back** does what it says, and only to the wording - your on/off choice stays put.

Customers choose whether they want texts, email, or both, on the page they land on after ordering and on their own account page. They can't turn everything off, mind: an order somebody has paid for is not a mailing list, so we insist on at least one way of reaching them.

There's nothing on this tab until something on your site sends a text - it says as much rather than showing you an empty list.

Editing the wording needs the **Edit text message templates** permission (`sms.templates`), which is separate from the email one on purpose: texts cost money per send, so you may want fewer hands on them.

---

## WhatsApp

The same Twilio account will carry WhatsApp, and the **WhatsApp** tab under **Settings → Twilio** is where you switch it on. Once it is running, WhatsApp conversations turn up in [Unified Inbox](Unified-Inbox) as their own channel beside the emails, chats and calls, and can be answered from there.

### Getting a number people can message

WhatsApp is not like texting: you cannot simply pick one of your numbers and start. Meta has to approve the number first, which is done in the Twilio console under Messaging and takes a few days.

While you are waiting, **Twilio's test number** is offered in the same menu. It works immediately, with one catch: everybody you want to message has to send Twilio a join code from their own phone first. Fine for trying it out with your own mobile, no use for customers.

**Handled in** is the country WhatsApp itself puts your messages through - and it is very often **not** the country that same number's calls and texts go through. WhatsApp approves a sender against your Twilio account rather than against the phone line, so a number whose calls are handled in Ireland can perfectly well have its WhatsApp handled in the United States. Twilio does not warn you about the mismatch; it simply hands back nothing.

You do not have to get this right for messages to appear. The site looks for WhatsApp conversations in every country your account reaches, so a message lands in your inbox wherever WhatsApp filed it, and a reply goes back the same way it came. The setting only decides where the very first message to somebody brand new is sent from - so if a template to a new customer is refused, this is the box to change.

### The 24-hour rule

This is the part that surprises everybody, so it is worth reading twice.

**WhatsApp only lets you write freely for 24 hours after somebody last messaged you.** Outside that window, Meta will not carry an ordinary message. It is their rule, it applies to every business on WhatsApp, and there is no setting anywhere that turns it off.

What you can send outside the window is a **template** - wording Meta has approved in advance. So a delivery update, an appointment reminder or a "your quote is ready" all work perfectly well at any hour; a chatty follow-up two days later does not.

The site treats this as a fact rather than a footnote. Try to send an ordinary message to somebody who wrote three days ago and you are told so, with the reason, and offered a template instead. The alternative - quietly accepting the message and letting Meta bin it - would have you believing you had replied to somebody who never heard from you.

### Templates

Write your templates in the Twilio console, under Content Template Builder, and send them to Meta for approval. Each approved one gets an id starting `HX`. Add it on the **Approved templates** card with:

- **What you call it** - the name your staff will pick from. Twilio's own name for a template is rarely one anybody would say out loud.
- **Twilio id** - the `HX…` id, copied across.
- **Blanks** - how many gaps the template has for you to fill in. A template reading "Your order {{1}} is on its way, {{2}}" has two.

Only templates on this list can be sent from the site. That is deliberate: the id comes from a box somebody types into, and a site that would send any id at all would happily put somebody else's approved wording in front of your customer.

### Sending one, and reading what came back

**Send a message** does both kinds. Choose the person's number, then either write a message (which goes only if the 24-hour window is open) or pick a template and fill in its blanks.

**Recent WhatsApp messages** lists everything to and from your WhatsApp number, newest first, with photographs and files people have sent as links you can open. Anybody whose window has closed is marked *needs a template now*, so you can see at a glance who you can write to freely.

Twilio holds these messages, not the site, so how far back the list goes is up to your Twilio account rather than to us.

### Worth knowing

- **It is its own channel.** In the Unified Inbox, WhatsApp sits separately from **Phone**, because it is a different thing to answer: the calls and texts of the phone channel have no window and no approved wording. You can hide either of them in the inbox's own Settings without stopping either being collected.
- **Messages arrive on the hourly check**, the same as texts, rather than the instant they are sent.
- **Nothing is deleted and nobody is blocked from here.** The block list stops calls, and Twilio's own retention decides how long messages last.
- **Costs.** Twilio and Meta both charge for WhatsApp, and a template sent outside the window costs more than a reply inside it. Cactus adds nothing on top, but the pricing is worth reading before you send a few thousand.

---

## Keeping recordings

Call recordings and voicemails sit in your Twilio account until something removes them, and Twilio charges storage for the privilege. On the **Alerts & data** tab, **Keep recordings for (days)** sets how long they stay: anything older is cleared out overnight, automatically.

- Leave it at **0** and nothing is ever deleted, which is exactly how it has always worked.
- Set it to 90 and you keep a rolling three months.

Deleted recordings are gone for good - there's no bin to fish them back out of, at Twilio's end or ours - so pick a number you can live with. If you've a legal reason to keep recordings for a set period, that period is the one to use, and it's your call rather than ours.

---

## A note on costs

Twilio charges per text and per forwarded minute at their usual rates, plus a little for storing recordings and for typing up voicemails. Cactus adds nothing on top, but do keep an eye on your Twilio balance - a busy site sending many sign-in texts is not free, merely cheap. The things worth watching are the auto-text to missed callers (one text each), a second forwarding number, which rings on for as long as you've told it to, ringing each number more than once - every try is its own short call - and, far and away the priciest of them, **Type up recorded calls**, which bills by the minute of every recorded call on any number you switch it on for.
