# Unified Inbox

Every conversation with every customer and supplier in one place: email, live chat, contact form enquiries, phone calls, voicemail and text messages, with your own records sitting beside them. One screen instead of five, and a shared history instead of whatever happens to be on somebody's phone.

It is not a CRM. There are no pipelines, no deals and no lead scoring. People exist here for one reason only: so two emails, a live chat and a phone call from the same human collapse into one story.

You will find it under **Inbox** in the admin sidebar, as a tab called **Unified Inbox**. Its settings live under **Settings → Unified Inbox**, split across a row of tabs so that changing a folder name no longer means scrolling past a retention policy.

---

## Before you start

- Your site needs its email set up already (**Settings → Email**), because that is what sends your replies. See the [configuration reference](Configuration-reference).
- You need the app password for whichever mailbox you want to read. Most providers call it an "app password" and make you generate one; searching for "[your provider] app password" gets you there. iCloud's is at appleid.apple.com.
- If you already run [Reply Catcher](Reply-catcher), read the section at the bottom of this page first. The two must never be pointed at the same mailbox.

---

## Where everything lives

**Settings → Unified Inbox** opens on a row of tabs, one job each. Whichever you are on is remembered in the address bar, so a refresh or a bookmark comes back to it rather than dropping you at the beginning.

| Tab | What is on it |
| --- | --- |
| **Overview** | Whether it is working, how much has been collected, and a short list of anything wanting your attention - with a button beside each one that takes you to where it is fixed. On a site with nothing set up yet it is a three-step start instead. |
| **Mail accounts** | The mailboxes it reads. Test connection, Check now, and how far the first collection has got. |
| **Inboxes** | The addresses people write to: where each is collected from, how its replies go out, what they are signed with, and who may read them. |
| **Collecting** | How far back to go, how long to keep things, attachments, and which way round a conversation reads. |
| **Sent replies** | Whether to find out what became of a reply after it left. |
| **People** | Telling colleagues from customers, and the shape of your order and quote numbers. |
| **Other apps** | Telling something else on the internet when the post arrives. |

Start a form on one tab, wander off to another and come back, and what you had typed is still there. Nothing is saved until you press the Save button on that tab, mind.

---

## Mail accounts and inboxes are two different things

This is the one idea worth getting straight, because everything else follows from it.

A **mail account** is a connection to a real mailbox: a server, a username and an app password. It is the thing that does the collecting.

An **inbox** is an address people write to: `hi@yourcompany.co.uk`, `accounts@yourcompany.co.uk`, `marcus@yourcompany.co.uk`. It is the thing conversations get filed into, and it carries its own name on replies, its own signature, and its own list of who may read it.

One mail account can feed several inboxes. That is the normal case: a single mailbox collecting several addresses at your domain, with the enquiries and the invoices kept apart from each other once they land. You can also run several mail accounts if you genuinely have several mailboxes, and an inbox can exist with no mail account at all for an address you only ever send from.

---

## Setting up a mail account

**Settings → Unified Inbox → Mail accounts → Add a mail account.**

1. Give it a name you will recognise (**What to call it**).
2. Fill in the **Mail server**, your **Username** (usually the full email address) and the app password.
3. Save, then press **Test connection**. It either lists the folders it can see or tells you in plain English what went wrong.

The folders it finds are remembered against the account, so the folder boxes on your addresses become menus rather than something to type from memory. They are only ever refreshed when you ask - by **Test connection** here, or by **Update folders** on an address.

### What gets read, and what does not

It reads the main inbox, your Sent folders, your Archive folders, and anything else you name under **Other folders to read**.

Reading Sent matters more than it sounds. If you answer a customer from your phone, that reply is in your Sent folder and nowhere else, and without it the conversation here would show your customer talking to themselves.

**Junk, Trash and Drafts are never read.** Spam would mint a conversation and a person out of every message in it, and a draft is not a message.

Nothing in your mailbox is ever changed by the collecting: nothing is marked read, moved or deleted. The single exception is the Sent-folder copy described below, which you switch on yourself.

### Using an account that is not only the site's

The rules above assume the mail account exists to serve the site. Plenty do not. If you have pointed this at the account you already had, where the shop's post is filed into one folder and the main inbox is your own bank, your doctor and your online shopping, then reading the main inbox is the last thing you want. Left alone, all of it ends up in here, where your staff can read it.

Two tick boxes on the mail account deal with that. Both are off to begin with, so an account you set up before they existed carries on exactly as it did.

- **Read only the folders named here and on the addresses below.** The main inbox, the Archive and the Sent folder stop being read automatically. What gets read is what you have actually named: the folders under **Other folders to read**, plus the **Folder to read** on each of the addresses this account collects. Name your Sent folder yourself if you want your phone replies, as described above.
- **Ignore mail that is not addressed to one of your addresses.** Normally that post is kept out of the way under **Not filed**, in case somebody writes to an address you have not set up yet. Tick this and it is not kept at all - it is passed over and never stored. Replies to conversations already here still arrive either way, so nobody's thread stops halfway through because their reply happened to be addressed to somebody else.

The pair go together on a personal account: the first stops it reading your private folders, the second catches anything of yours that has been filed into the shop's folder by mistake.

---

## Adding an inbox

**Settings → Unified Inbox → Inboxes → Add an inbox.** The form asks for a lot at once, so it is grouped: the address itself, where it is collected from, how its replies go out, its signature, and who may read it.

- **Address** is what people write to. Post arriving for that address is filed here.
- **Mail account** is which connection collects it. Leave it as "not collected from a mailbox" for a send-only address.
- **Folder to read** is normally the main inbox. Once the mail account has been tested, this is a menu of the folders that account actually has, spelled the way the mail server spells them - which saves guessing between "Sent", "Sent Items" and "Sent Messages". **Update folders** beside it asks the mail server again, for a folder you have made since. Made one this minute and would rather not wait? Choose **Type a folder name myself** and write it in.
- **Sent folder** is the same menu, and optional: left as "work it out from the mail account", the server is asked which folder it treats as Sent.
- **Everything in that folder belongs to this address**: for a folder you fill yourself rather than one the mail server sorts. With it on, anything sitting in the folder above is collected and filed here, even when it was sent to an old address of yours that this site has never heard of - drag it in and it turns up. Post that names one of your other addresses on its To or Cc line still goes to that address; this only settles what would otherwise have been filed under Not filed. Two addresses cannot both own the same folder: point two at one folder with this on and neither claims it, and filing goes back to the addresses.
- **Catch-all**: one inbox can be nominated to take anything that arrives at the mail account but matches no address you have listed. Without one, that post is filed under **Not filed**, which only an administrator can see, and the settings page tells you how much is sitting there.
- **Name on replies** and **Signature** are what your customer sees when you answer. Signatures have a section of their own below.
- **Who can read this inbox** is covered under "Who can see what" below.

Post is filed by the address it was delivered to, then by the To line, then by Cc, then by the folder it was found in where that folder has been told it owns its post, then by the catch-all. There are no rules for sender or subject in this version.

**Mail between two of your own addresses lands in both of them.** Write from `chris@` to `marcus@` and there are two conversations afterwards: one in Marcus's inbox, unread, where he can answer it exactly as he would a customer's, and one in yours, showing as something you sent. His reply joins both of them. Each side is a conversation in its own right - mark one done, snooze it or hand it to somebody, and the other is left alone, because the two of you are not finished with it at the same moment.

Copy a third address in and it gets a conversation too. Nobody has to go looking through a colleague's tab for a message that was addressed to them.

This is not how it used to behave. Until this update a colleague email was filed once, on whichever of the two addresses the site happened to read first, and a reply followed it there - so answering a colleague could put your answer somewhere they could not see it. Conversations already collected are put right on the update: the site reads that mail again the next time it checks, and fills in the sides that were missing. Nothing is collected twice.

### Signatures

Each inbox has one signature, and it goes below a dividing line at the foot of every reply sent from that address, whoever sent it. That is deliberate: `accounts@` signs off as the accounts department whether it was you or your bookkeeper typing.

There are three ways to write one, and they are the same three the contact form offers, so you only ever learn this once:

- **Rich text** - type it, with buttons for bold, links and lists. Right for four lines and a name.
- **HTML** - paste the signature your organisation already uses, tables, logo and all. It comes through as written; anything that runs on its own is removed when you save, because this markup ends up in a customer's inbox.
- **Page builder** - build it out of the same blocks your site's emails are built from, with your own colours and fonts already in the list.

All three are kept, so trying the builder out never loses the one you typed first. Switching back is a matter of pressing the other button.

Pasted and block-built signatures can carry fill-in tags, so one design works for every address: `{{FROM_NAME}}` becomes the name replies go out under, `{{INBOX_NAME}}` what the inbox is called, and `{{EMAIL}}` its address. A tag with nothing behind it becomes nothing at all rather than a pair of curly brackets in front of a customer.

**Show me how it will look** renders the signature exactly as the email will, before you save it, which is a cheaper way to discover that the logo is enormous.

**One exception, and it is a useful one.** If somebody has been given an inbox of their own (see [Giving somebody an inbox of their own](#giving-somebody-an-inbox-of-their-own)), the signature they wrote there is the one that goes out on their replies wherever they send from - so a purchasing manager answering out of `sales@` still signs off in their own name. If their own address has no signature, the address the reply is leaving from provides it, exactly as before.

If you already had a signature before this arrived, it is still there and still goes out unchanged, sitting under **HTML**.

---

## Sending, and the bit Brevo needs from you

Replies go out through your site's usual email service, **as the inbox they belong to**. A customer who wrote to `hi@` is answered by `hi@`, and a supplier who wrote to `marcus@` is answered by `marcus@`. That is rather the point of having more than one inbox.

Your email service has to be willing to send as each of those addresses. With Brevo that means the address, or the whole domain, has to be authenticated in your Brevo account. **Cactus checks when you save an inbox** and puts a line on the settings page if Brevo will not have it, so you find out with five minutes' work in front of you rather than when a colleague is trying to answer somebody.

If one address needs to go out through a different account altogether, **How replies are sent** lets that inbox carry its own Brevo key or its own outgoing mail server. Most sites will never need it.

### Writing a new one

Not everything starts with somebody writing to you. **Write a message** sits at the right-hand end of the row with the search box, just past it, and opens a blank message in a box over the top of the list: who it is going to, a Cc if you want one, a subject, what you want to say, and anything from your media library attached to it - or dragged straight onto the box.

**The To and Cc lines suggest people for you.** Click into either one before typing a word and the addresses that inbox has been dealing with are already listed, most recent first, with the name and company where the site knows them. Type and the list narrows. Arrow keys move through it, Return or Tab takes the highlighted one, Escape puts the list away without closing the message. Pick somebody and only the part you were typing is replaced, so a line that already has two people on it keeps them.

The suggestions are that address's own correspondents rather than everybody the site has ever met, which is usually the shorter and better list. Your own addresses are never suggested, and neither is anybody already on the line. Nobody is offered an address out of an inbox they are not allowed to read. The conversations stay where they were underneath, and closing the box - the cross, **Cancel**, or the Escape key - puts you straight back to them.

**It goes out as whichever inbox you were looking at.** Standing in `accounts@` and pressing Write means writing as `accounts@`, which is almost always what you meant. The **From** menu at the top of the message is there for the times it is not: pick any of your addresses and the message leaves as that one instead, with that inbox's name on replies and its signature, and the answer comes back to that inbox. Only addresses you are allowed to send from appear in the menu, so nothing on it can turn round and refuse you.

Once it has gone, you are standing in the new conversation, which behaves exactly like one somebody started for you: it can be assigned, snoozed, noted on and replied to, and their answer joins it rather than arriving as something unrelated.

If you are looking at **All**, at **Not filed**, or at one of the other channels, the menu opens on your first address rather than guessing. And if none of your addresses is one you may write from, the button is not there at all, rather than there and disappointing.

### Drafts

The phone goes halfway through a reply, and until now that cost you the reply. **Save as a draft** puts the whole box down as it stands, and it waits under **Drafts** in the list of addresses until you come back to it.

**Drafts is a tab of its own**, because it is not one address - it is everything half-written, across every address you can read. The number beside it is how many are waiting.

**A draft on a shared address can be read by whoever shares it**, the same as every other message on that address. A colleague who is off sick does not take the supplier's half-answered question with them: their unfinished reply is there under Drafts, with their name on the row, and you can open it and read it.

**Anyone who can send as the address can finish the draft.** If you are allowed to send as accounts@, you can open a draft sitting on accounts@, change it, send it or throw it away, whoever started it. The reply leaves as the address rather than as the person who typed it, so the name at the bottom is the same either way - and a draft only its author can finish is a draft that waits for ever when that person is on leave. Reading is wider than sending: somebody who can read the address but not send as it sees the draft and cannot touch it.

A draft on a live chat, an enquiry or a phone conversation has no address on it to share, so that one stays private to whoever wrote it - there is no guest list to let anybody else in.

Opening a conversation shows the draft on it that you may finish: your own first if you have one, otherwise a colleague's. Whoever started it keeps their name on it - taking one over does not sign it over to you.

Picking one back up depends on what it is. A saved reply lives under its conversation, so clicking it opens the conversation with your words still in the box, the customer's message above them, and Reply, Reply to all or Forward set to whichever you had chosen. A message you had not finished starting opens the writing box again exactly as you left it - recipients, subject, attachments and all. There is one draft per conversation per person, which is the box, put down; saving again writes over it rather than leaving you to choose between two halves of the same sentence. Two people can each have one on the same conversation, and the reply box shows you yours.

**Sending clears it away.** The draft goes at the moment the message actually leaves, so nothing is left sitting in the list to be sent again next week. **Throw the draft away** does the same thing without sending anything.

What is saved is what you typed, line breaks and all, along with who it is going to, the subject and anything you attached. Attachments are still only pointed at rather than copied, so a draft carrying three quotes costs nothing until you press Send.

### Sending it later

Some replies are written at half past eleven at night and would land better at nine in the morning. Under the writing box, next to **Save as a draft**, is **Send it later**: pick the day and the time, press **Schedule it**, and the message waits until then and goes out on its own. You do not have to be there, or even have the site open.

**A scheduled message is a draft with a time on it**, so it sits under **Drafts** like anything else you have not sent, with **Goes out tomorrow at 09:00** on the row. Open it and you can move it to another time, or press **Cancel the timer** and have an ordinary draft back.

**While it is waiting, Send and Save as a draft are not there.** The message has been decided about: one of those would post it this minute and the other looks like the way to keep it, which it is not. Cancel the timer and both come straight back.

**It goes at that time or shortly after, never before it.** The site checks its own list on a schedule, so a message set for 09:30 leaves at 09:30 or a little after depending on how your site is set up. Anyone pressing the refresh button in the inbox sends whatever is due at that moment too, which in practice means a message due while somebody is at their desk goes almost at once.

**Times are your site's times.** Nine o'clock means nine o'clock as the site tells the time, whatever clock the computer you typed it on is keeping.

**If it cannot go, it stays here and says so.** An address that has been taken off you between writing the message and its time coming, a mail server having a bad morning, a conversation that has since been deleted - whatever the reason, the writing is kept exactly as it was with the reason beside it on the row, and nothing is quietly thrown away. Fix it and send it, or set another time.

A message set to go out on a shared address is visible to whoever shares it, and anyone who can send as that address can change its time or cancel it - the same rule drafts already follow.

### Chasing it up

Next to the day and the time is **Bring it back if nobody replies**, and it offers exactly what **Remind me later** offers on a conversation: **In three hours**, **Tomorrow morning**, **Next week**, or a day and a time of your own. Set one and, once the message has actually gone, the conversation goes quiet until then - and comes straight back to you if nobody has answered.

**The answers are counted from when the message goes out**, not from when you are sitting there setting them. "Tomorrow morning" on something leaving on Friday night means Saturday morning, which is what anybody would expect it to mean.

**It comes back to whoever wrote the message.** On a shared address a colleague can finish and send something you started, and the person waiting on an answer is the one who asked the question - so the conversation is handed to whoever wrote it when it comes back, not to whoever pressed Send. Sending it by hand before its time does the same: the follow-up was written into the message, not into the timer.

**It disappears the moment they reply.** A reply already wakes a snoozed conversation, and that is all this is: the conversation is put to sleep for as long as you said, and their answer wakes it. So you only ever see the chase if there was nothing to chase.

**It rides with the time.** Cancel the timer and the follow-up goes with it, because a message that is not going anywhere has nothing to be chased about. Set another time and pick the follow-up again alongside it.

### When they write first

A message set for Monday morning was written without Monday's post in front of you, and sending it anyway is how you ask a question that has already been answered.

**So mail from the person it is addressed to holds it.** If they write to you before your message leaves, the timer comes off it, nothing is sent, and the writing stays exactly as it was. Their message opens with **A message to them was waiting to go out** across the top of it, saying what yours was about and when it was going to go, with a link straight to it - read what they said, then send yours as it stands, change it, or throw it away.

**Nothing is lost and nothing is sent twice.** The message sits under **Drafts** with **Held - they wrote first** on the row. Put a time back on it and it is queued again as normal.

**A message already going out is left alone.** If their mail arrives in the minute yours is being sent, yours has gone: the site will not pretend otherwise.

Only the **To** line counts - somebody merely copied in writing to you does not hold anything - and only a real message does. An out-of-office or a bounce is the mail system talking, not an answer, and holds nothing.

### Sent

**Sent** is a tab beside Drafts, and it is one row per message that has left, newest first, across every address you are allowed to read. Not one row per conversation: a thread you have answered four times is four things you sent, and "did that quote actually go, and when" is a question about the message rather than about the conversation it sits in.

Each row says who it went to, what it was about, which of your addresses it left as and who here wrote it. Where the site is watching for it, what became of it is on the row too - on its way, opened, or never arrived (see [Finding out what happened after you pressed Send](#finding-out-what-happened-after-you-pressed-send)). Clicking one opens the conversation it belongs to, which is where the answer to it will turn up.

Replies sent from here, messages written from here, and your other modules' automatic post that goes out as one of your inboxes all appear. So does anything you sent to a colleague at another of your own addresses, even though it is sitting in their inbox as post for them. Internal notes do not: nobody was sent one.

### Copying replies to your Sent folder

Off by default. With it on, every reply you send from here is also filed in the mailbox's own Sent folder, so the Mail app on your phone agrees with the site. With it off, your replies live here and your phone's Sent folder stays empty.

If the copy fails, your email has still gone. The message will say the copy did not file, which is a tidiness problem rather than a delivery one.

### Finding out what happened after you pressed Send

**Sent** means the email service took the message. It does not mean it arrived, and it certainly does not mean anybody read it. Two switches on **Settings → Unified Inbox → Sent replies**, both **off until you turn them on**, fill that gap.

**Tell me when a reply is delivered, opened or bounces.** Brevo tells the site what became of each message and the answer appears under the reply itself: *Delivered 09:14*, *Opened 11:32*, or *It did not arrive* with the reason behind it. Useful when you are deciding whether it is worth chasing somebody, and rather more useful than guessing.

Two honest limits. An open is worked out from a tiny invisible picture in the message, and some email programs - Apple Mail and Gmail among them - fetch that picture themselves before anybody has looked at a word. When that is what happened you are told **their email app fetched it** rather than told a fib about somebody reading it. And it only works for inboxes sending through Brevo: an inbox on its own outgoing mail server carries on saying nothing but *Sent*.

**Ask the person's own email program for a read receipt.** The old-fashioned kind, from the days of office memos. Most programs ignore the request and the rest ask the reader whether to answer it, so expect a reply perhaps one time in ten - mostly from people in offices. When one does come back it lands on the message it belongs to rather than turning up in the conversation as a mysterious email titled *Read: your quote*, which is what happens everywhere else.

Both of these amount to keeping a note of what somebody did with an email you sent them. That is yours to decide, but **if your privacy notice does not mention it, add a line before you switch them on**. Nothing is recorded for any message sent before you did.

### Attachments

You can attach anything from your media library. There is a ceiling of about nine megabytes for everything on one message, which is what the email services themselves allow, and **an attachment that will not fit is refused before you send** rather than quietly dropped on the way out.

You can also **drag a file straight onto the message** - onto the reply box under a conversation, or anywhere on the box where you are writing a new one. Drag several at once and they all go on. The box says "Drop to attach" while the file is over it, the files appear as tags underneath as they arrive, and a cross takes one back off. Nothing is sent until you press Send, as ever.

Files dropped this way have to be **under four megabytes each**, which is the hosting platform's limit on what one upload may carry rather than ours. Something bigger has to go into your media library first, which has a route for large files this one does not, and then on with **Attach a file**.

A few things are refused, and each says why: a folder (drop the files inside it instead), and anything that is a program or a script rather than a document, because the email services will not deliver one of those anyway and finding that out at Send is finding it out too late. If you need to send one, put it in a zip.

A dropped file goes into your site's storage, not into your media library: it is a customer's paperwork, and it has no more business in the picker you build pages from than an invoice that arrived in `accounts@`. A file you drop on and then think better of - never sent, never saved as a draft - is cleared away by the site a week later. A draft holding one keeps it for as long as the draft lives.

---

## Sending your other modules' post from an inbox

Your site sends plenty of email nobody types: an order confirmation, a purchase order to a supplier, a note that goods are on their way. All of it has always gone out as the one address on **Settings → Emails**, which is fine until somebody replies to it - and then a delivery question and a supplier's proforma are both sitting in the site's general post, waiting for whoever reads that to work out who they belong to.

So two of the modules that send the most now carry a box of their own:

- **Settings → Purchase Orders → Which inbox this comes from** - the address your purchase orders, chases, cancellations and returns notes leave as.
- **Settings → Shop → Notifications → Which inbox this comes from** - the address your order confirmations, despatch notes and the rest of your customer post leave as.

Pick one of your inboxes and that mail goes out as that address, under the name it answers on, and replies come home to it. A supplier answering a purchase order lands in the inbox the people chasing that order are already reading. Each box saves the moment you choose - there is no separate Save to press.

**The message itself is filed too.** Sending a purchase order to a supplier starts a conversation in that inbox, holding exactly what went to them - the wording, who it went to, who was copied in, and the document that travelled with it. When the supplier answers, their reply lands underneath it, so whoever picks it up is reading both halves rather than an answer to a question nobody can see. It arrives already read, because you sent it: it does not mark the inbox unread or count as something waiting for you.

Leave both as **the site's usual address** and nothing whatsoever changes. That is what they are set to, and a site that never opens them sends exactly what it sent before.

Three things worth knowing:

- The box only appears if you may manage this module's settings. Somebody who runs the shop but has no business repointing the site's mail does not see it.
- **Only the modules you have pointed at an inbox are filed.** Everything else carries on exactly as it did, and nothing core sends on its own account - a password reset, a sign-in code - is ever filed as a conversation. Those are not conversations, and they have no business sitting in a shared inbox.
- **The document is kept only if your site has file storage set up.** Without it the message is still filed, in full, with no paperclip - rather than a paperclip that opens onto an error.
- Delete an inbox and any module pointed at it quietly goes back to the site's usual address. Nothing stops sending.

---

## How often it checks

Automatically, **once an hour on a paid hosting plan and once a day on the free one**. That is the hosting plan's limit rather than a choice.

For when you are waiting on something, there is a **refresh button at the top left of the inbox itself** - the circular arrow just to the left of the **All** tab. Press it and the site goes and fetches your post there and then, from every mail account at once, and tells you what it found. A mailbox opened seconds ago is left alone rather than opened again, so that your mail provider does not take it personally - press anyway and the list still refreshes, and it tells you how recently your mail was looked at rather than refusing you. The same thing per account still lives on the settings page as **Check now**.

The refresh button only appears if you look after the inbox and there is a mail account for it to check - there is no sense offering a button whose only possible answer is no.

If you would rather not keep pressing it, **Settings → Unified Inbox → Collecting → Check for new mail while the inbox is open** does the pressing for you: pick a wait - a minute, two, five, ten, or half an hour - and the inbox goes and looks that often on its own while you have it open. It only runs on a tab you are actually looking at, it stops the moment that tab goes behind something else or you close the page, and it says nothing at all - new post simply appears in the list, in bold, where post has always appeared. A banner across the top announcing mail that is already on the screen underneath it is one thing to read too many. Only people who look after the mail accounts get it, for the same reason the button is only theirs. Off to begin with, and worth picking the longest wait you can live with: every check is a bit more work for your hosting.

The first collection does not fetch everything at once. New post is picked up straight away, and the history is walked backwards a batch at a time over the following checks until it reaches as far back as you asked for under **Collecting → How far back to go** (twelve months to begin with). A mailbox with years in it takes a while to fill in, and the settings page shows the progress while it does.

---

## The screen

Along the top is a row of tabs: your own address first if you have been given one, then **All**, then each of your addresses with its unread count, then the chat, form and phone conversations, then **Sent** (everything that has left - see [Sent](#sent) above), **Drafts** (your own half-written messages) and, for whoever looks after the site, **Not filed**. The refresh button sits at the start of that row, before **All** (see [How often it checks](#how-often-it-checks)). **Write a message** sits a row below, at the right-hand end of the status tabs, just past the search box - except on **Drafts** and **Sent**, which have no status tabs, where it goes back to the end of the address row.

Opening a conversation, searching, writing a message and every other button on this screen now change only the part of the screen that changed. They used to fetch the whole page again, sidebar and all, which is why the inbox had a habit of blinking at you between clicks. The address in your browser still says exactly what you are looking at, so a view can still be sent to a colleague and the back button still behaves.

Underneath is a second row for where a conversation stands - **Open**, **Snoozed**, **Done**, **Everything** - each with the number behind it, and the search box at the end. Under that sit the narrower cuts: unread only, the ones assigned to you, or the ones assigned to a particular colleague.

Then the conversations. With nothing open the list has the whole width and reads across in one line, the way a mail program does. Open one and the screen splits: the list becomes a column on the left, the conversation fills the middle, and on a wide screen what the rest of your site knows about that person sits on the right. On a phone you see one at a time, with **Back to the list** to return.

**Closing one again.** At the top left of any open conversation there is a **× Close**, which shuts it and hands the whole width back to the list. On a phone the same link reads **Back to the list**, because there the list is not on the screen at all. The same goes for a person's page.

**Working through several at once.** Every row has a tick box, and above the list there is one that ticks the lot. Tick a few and a bar appears offering the four things you would otherwise open each of them to do: **Mark as done**, **Mark as read**, **Mark as unread** and **Open again**. Six mailing lists on a Monday morning is now two presses rather than twenty-four. Anything that will not change says so and the rest still go through.

In a conversation you can reply, reply to everybody, forward, or leave an **internal note**. The writing box is not sitting open under every conversation any more - **Reply**, **Forward** and **Internal note** are buttons in the row of actions at the top, and the box appears when you press one. Press the same one again to put it away. If you left a draft on that conversation it opens with the box already up, so nothing half-written is out of sight. The row of actions stays pinned to the top of the conversation as you scroll, so Reply is one press away however long the thread is. (Starting one from scratch is **Write a message**, above.) A note is not sent to anybody, says so on its face, and deliberately does not bump the conversation or mark it unread: us talking among ourselves should not look like the customer writing again. Mentioning a colleague in a note raises a notification for them, but only if they could open that conversation anyway.

You can assign a conversation to somebody, mark it done, and reopen it. Every one of those is recorded, so "who marked this done" has an answer.

**Remind me later** puts a conversation to sleep and brings it back when you asked for it. Three ready-made answers - in three hours, tomorrow morning, next week - cover most of it, and under them there is a day-and-time box for the rest: the morning somebody said they would ring back, the day after a delivery is due. It will not accept a time that has already been.

**A reply cancels it, and the same goes for done.** Setting a conversation to come back on Thursday is a bet that nothing will happen before Thursday. Marking one done is the same bet with no end date: nothing more will happen at all. Either way, somebody writing on it settles the bet, so the conversation goes straight back under **Open**, unread, where you would have seen it anyway.

That covers the customer answering, and it covers a colleague answering them from their own phone or from Outlook rather than from here. Either way somebody is dealing with it now, and it should not be hidden.

**Done is the half that matters more**, which is not obvious. A snoozed conversation comes back on its own on Thursday whatever happens. A finished one never does - and the unread count on your address tabs deliberately skips conversations you have marked done, because otherwise every tidy-up would leave a badge behind. So before this, a customer replying to something you had finished with landed unread at the top of the **Done** tab, with no number anywhere to tell you, and stayed there. It is now back in Open with the rest of your morning.

Three things deliberately leave a conversation where it is. An out-of-office and a bounce, because that is the mail system talking rather than a person - which is also what stops a mailing list nobody has unsubscribed from dragging a finished conversation back into Open every week. An internal note, for the same reason it does not bump the conversation or mark it unread: us talking among ourselves is not the customer writing back. And your own reply sent from here, because you already knew you were answering.

When one comes back this way it says so in **What has been done to this** at the foot of the conversation, with the time, and it says which it was - stopped being snoozed, or opened again. A conversation turning up in Open on Tuesday when you asked for Thursday, or one you were sure you had finished with, is explained rather than mysterious.

**Search** covers subjects, senders and the text of messages, and it only ever searches the inboxes you are allowed to read.

### Which way round a conversation reads

By default a conversation reads the way it happened: the first message at the top, the latest at the bottom, and the writing box - once you have asked for it - under the lot.

Tick **Show the newest message at the top of a conversation** on **Settings → Unified Inbox → Collecting** and it turns round - the latest message is the first thing you see when you open one, and the writing box moves up with it so the reply sits beside the thing you are replying to. Handy on a long back and forth where the only part anybody needs is the end of it.

It is a site setting rather than a personal one, so everybody reads the same way round.

### Putting the addresses in your own order

Most sites end up with one inbox they live in and two or three they glance at, and alphabetical order has no opinion about which is which. **Drag an address left or right along the row of tabs and it stays there.** It saves as you drop it - there is nothing to press afterwards.

If you would rather not use a mouse for it, put the keyboard focus on an address, hold **Alt** and press the left or right arrow keys.

The order belongs to the site rather than to you, so everybody who opens the inbox sees the same one - which means only people who can manage inboxes can change it. If you can read the inbox but not manage it, the addresses simply sit where whoever looks after the site has put them, and nothing drags.

### Giving somebody an inbox of their own

Most people on a site live in one address. Somebody who does purchasing wants `purchasing@` in front of them the moment they open the inbox, not a list of everything the company has ever been sent.

**Settings → Unified Inbox → Inboxes → Edit an inbox → Who can read it.** Beside each name there is **Their own inbox**. Tick it and, for that person only:

- the address sits first along the row of tabs, ahead of **All**;
- it is what they land on when they open the inbox, instead of **All**;
- its signature goes at the foot of their replies, whichever address they are answering from.

**All** does not go anywhere - it moves along one, to second - and the rest of the addresses follow in the usual order. Everybody else's row is exactly as it was: this is one person's arrangement, not the site's, so it does not shuffle the tabs for anybody else and it does not affect the order you have dragged the addresses into.

**One address each.** Ticking the box on a second inbox moves the person there rather than giving them two; the screen says whose address it currently is before you do it. Untick it and they go back to opening on **All**, which is where everybody starts.

You can only give somebody an address they can actually read, so if the inbox has a guest list, they need to be on it. Take them off it later and they quietly go back to **All** rather than landing on a tab that will not open.

### Reading email safely

A message someone else wrote is shown inside its own sealed frame, on a light background in both light and dark mode. It takes up as much room as the message actually needs - a two-line reply is two lines, a long one is as long as it is - and a message that will not say how big it is gets a generous height rather than the letterbox it used to get. The sender chose their colours assuming a white page, and repainting the background dark while leaving their text alone is how a message ends up black on black. The rest of the screen follows your theme as usual.

**Pictures hosted elsewhere are not loaded until you ask.** Press **Show pictures** and they are fetched by the site rather than by your browser, so a marketing email learns nothing about you, your location or when you opened it. Links open in a new tab.

**Attachments are fetched when somebody opens one**, not while collecting, and they are kept where only this module can reach them. They never appear in your media library or in the picker when you are building a page, which is deliberate: an invoice pulled out of `accounts@` has no business turning up in front of everybody who can edit a page.

There is a setting called **Fetch everything as it arrives**. It currently behaves the same as fetching one when somebody opens it. Pulling every attachment on a busy account through the hourly check needs a budget and a storage conversation of its own, so it is honestly a setting that does not do anything yet rather than one that does it badly.

---

## The other channels

Install the [live chat](Live-Chat), [contact form](Contact-form) or [Twilio](Twilio) modules alongside this one and their conversations appear here too, under **Other channels**.

When Unified Inbox is installed, **this is where those messages are answered**. The contact form's own inbox tab and the live chat's own inbox tab stand down, because having two places to answer the same enquiry is how one of them stops being read. Each module keeps everything else it does: the chat widget, the form block, the phone numbers, its own settings. Uninstall Unified Inbox and their tabs come straight back, with nothing lost.

A colleague who is allowed to see the contact form but not this hub keeps their own tab. Nobody is locked out of their own messages.

Three things worth knowing:

- **Replying to a chat uses your own chat account.** If you have not connected yours yet, the reply is refused with a line telling you so and where to fix it, rather than going out under somebody else's name.
- **A phone conversation is one outside number**, not one call. Every call, voicemail and text with that number is one story, which is the whole point. Calls that were forwarded to somebody's mobile, and calls placed with **Make a call**, count as one call apiece and belong to the customer - your own mobile never turns up in the list as though it were a customer of yours.
- **Text messages appear when the hourly check runs**, not the instant they arrive. There is no live feed of incoming texts in this version.
- **A voicemail message can be thrown away** from the conversation it sits in: a **Delete** button under the message, which asks first and then removes it from the phone system as well as from here. Only the messages people leave - the log of a call, and a text, are kept by the phone system itself and this will say so rather than pretending.
- **A caller can be blocked** from the top of their conversation, if the channel they came in on can do it. On the phone that means their next call is dropped the moment it arrives: nobody's phone rings, no message is taken and no alert goes out. It does not delete anything they have already said - that is a separate decision, taken message by message - and **Unblock** is one press away. See [Blocking a caller](Twilio#blocking-a-caller).

---

## People, and how conversations collapse

An address, a phone number or a chat account belongs to a person, and a person can have several of each. Somebody who emailed in March and rang in April is one person with one history rather than two strangers.

Organisations are guessed from the email domain, with the usual free providers left well alone: nobody's gmail.com address turns Gmail into one of your customers.

Some things worth saying plainly:

- **A role address is one person.** `accounts@supplier.com` might be four people in real life, and here it is one. That is by design; splitting it would mean guessing.
- **Your own people never become customers.** Your inboxes, your staff's own addresses and anything at your own domains are excluded. If it guesses your domains wrongly, set them yourself under **People → Your own domains**.
- **There is no directory of everyone who has ever emailed you**, on purpose. That is where a conversation hub turns into a CRM by accident.
- People can be **merged** when the same human turns up twice, and a merge can be put back afterwards. A person can be **split** apart again if two people got folded into one.

---

## What sits beside a conversation

When a person's address matches something else on your site, it appears in the panel on the right: their orders, their purchase orders, their unpaid bills, their quotes, their member account. Each one is a link through to the real record. Nothing is ever written to those records from here, only read, and a module you have not installed simply shows nothing.

When somebody quotes an order number, a purchase order number or a quote reference in a message, it is attached to the conversation automatically. **Nothing is attached until the number is checked and found to exist**, anything attached that way says it was found automatically, and it comes off in one click. If your reference numbers are an unusual shape, the three boxes under **People → Spotting references** take your own pattern.

### Attaching an order or a purchase order yourself

Most people do not quote their order number, and a supplier answering a purchase order almost never does. **Attach something**, under the list of what is already attached, opens a list of your records to pick from rather than a box demanding a number.

It opens on whichever kind suits the address you are reading. If purchasing sends its emails as this address, it opens on purchase orders; if the shop sends as it, it opens on orders. Which address each of them sends as is the **Sending address** panel on that module's own settings - **Settings → Purchase Orders**, and the Notifications section of **Settings → Shop**. If you have not chosen one, the list simply starts on the first kind of record you have.

The records belonging to whoever you are talking to come first, so a supplier's own open orders are usually the first thing in the list and attaching one is a single click. Typing narrows it, by number, by the name on the record or by the address it was placed with. You can still attach something by its number alone: type the number and press **Attach**, and it goes on if a record with that number exists.

You only see records from parts of the site you are allowed into. Somebody who reads the inbox but has no business in the shop is not offered a list of your customers' orders, and if the site keeps no records of that sort at all, there is no attach button to press.

### Automated email

Order confirmations, purchase order emails and the like are sent by your email service and never touch your mailbox, so no mail client can be asked about them. They appear on a person's timeline anyway, from the site's own record of what it sent: what went, when, and whether it failed. **There is no copy of what it said**, because that record is a delivery ledger rather than an archive, and the page says so where it shows them.

One honest limitation: your site's own notification emails, such as "somebody has filled in your contact form", no longer clutter the inbox as unread conversations. They are recognised and kept quiet. They are **not yet folded onto the enquiry they are about**, so a form submission can still show up twice: once as the enquiry, and once as the site's own note to you about it.

---

## Who can see what

Three permissions, handed out through [Managing users](Managing-users) as usual:

| Permission | What it allows |
|---|---|
| `unifiedinbox.view` | Read conversations |
| `unifiedinbox.reply` | Reply, forward, note, assign, snooze, mark done |
| `unifiedinbox.manage` | Settings, mail accounts, inboxes, merging people, export and erase |

Giving somebody an inbox of their own is a convenience, not a permission: it decides what they open on and what they sign off as, and nothing about what they are allowed to read.

On top of that, **each inbox has its own list of who may read it**. Leave the list empty and anybody with the view permission can read that inbox. Name anybody at all and it is those people and nobody else. A shop assistant does not need `accounts@`.

That applies to searching and to the **All** view as well, not only to opening a conversation: a snippet from an inbox you cannot open never appears in your results at all. Administrators are the exception, on the grounds that whoever edits the guest lists could add themselves to one in two clicks anyway.

---

## Keeping it tidy, and the law

### The retention window

**Collecting → Delete conversations older than** is blank to begin with, which means nothing is ever removed. Set a number of months and a daily tidy-up removes conversations whose last message is older than that, along with any files attached to them. **There is no way to get them back afterwards.**

The whole conversation goes, never half of it. Deleting the old half of a thread and keeping the recent half leaves something that reads as though your customer opened with a reply.

**Keep a conversation for ever if it has an order, a purchase order or a quote attached** is on by default, and is what stops a window aimed at old mailing lists quietly taking the correspondence behind a disputed invoice with it. The settings page tells you both numbers before anything happens: how many the next tidy-up would remove, and how many are old enough but are being kept because something is attached to them.

### Exporting and erasing one person

On a person's page, an administrator can download everything held about them as a file, or erase them.

**Erase covers this hub and nothing else.** The dialog counts up what will go before you press anything, and says in the same breath what will not:

- their conversations, messages, attached files, addresses and phone numbers, and everything worked out about them: **removed**;
- their orders, invoices, quotes, purchase orders and member account: **untouched**, and named by module so you know where to go next;
- your site's record that automated emails were sent to them, which holds their address and the subject lines: **untouched**.

That last one is deliberate rather than forgotten. It is a core record rather than one of this module's, and under-deleting where you can see it is safer than over-deleting where you cannot.

The export file carries the same three sentences at the top, because whoever opens it next may be a solicitor rather than the person who exported it.

---

## Telling something else when the post arrives

Under **Settings → Unified Inbox → Other apps** you can have an inbox notify a
web address every time a message arrives. Nothing about the inbox itself changes,
and switching it all off breaks nothing.

Each one has:

- **A web address to tell.** Has to start with `https`, and has to be somewhere on
  the open internet - an address pointing back at the site's own server, or at
  something on its private network, is refused when you save it and again before
  every note goes out.
- **Which inbox.** One of them, or every inbox including any you add later.
- **What to send.** Either the details of the message that arrived - who it was
  from, the subject, which inbox, which conversation - or the same fixed message
  every time, which is what an address expecting its own wording needs.
- **Whether to include what the message actually said.** Off by default, and worth
  leaving off unless the other end genuinely needs it. Switching it on sends a
  copy of your post to that address every time one arrives.
- **A signing password.** If the other end expects one, every note is stamped with
  it so it can tell the message really came from your site.
- **Extra headers**, written one per line as `Name: value`. This is where a key
  goes if the address you are telling asks for one.

### One password and one set of headers for the lot

At the top of the page sit a **signing password** and a set of **extra headers**
shared by every subscription. Most sites tell one thing about their post - a
workflow tool, an ops channel - from several inboxes, and typing the same key
into five places means changing it in five places on the day it is rotated. Set
it once here and every subscription set to "shared" follows on its next send.

Each subscription then chooses, for the password and for the headers separately:
**use the shared one**, **give this one its own**, or **neither**. Anything set
up before this carries on exactly as it was - a subscription that had its own
keeps using it, and one that had none stays unsigned until you say otherwise.

Neither the shared password nor the shared headers are ever shown again once
saved: the boxes replace them rather than edit them, and there is a **Remove it**
beside each when one is set. The list says which of the two each subscription is
actually using, so "shared, but nothing shared is set" cannot quietly look like
"signed".

Notes go out on the mail check's schedule rather than the moment a message lands,
so an address that is slow or switched off can never hold up your mail. One that
does not answer is tried again after a minute, then five, fifteen, an hour, three
hours and twelve - and after twenty failures in a row it switches itself off and
says so on the screen. Editing it starts it again.

**Send a test** fires a made-up message at the address there and then, and tells
you what came back. Nobody's real post is used to prove a web address works.
**History** shows the last twenty notes and what happened to each.

## Reply Catcher

[Reply Catcher](Reply-catcher) does a small part of what this does: it catches replies to contact form messages in your real mailbox and threads them back onto the enquiry. Unified Inbox does the whole job, for every address rather than for the contact form alone.

**If you have both, do not point them at the same mailbox.** Two things reading one mailbox files everything twice, in two places, and unpicking that is an afternoon nobody enjoys.

Cactus will not let it happen quietly. If Reply Catcher is configured against the same mailbox as one of your mail accounts here, **that account is not collected** and the settings page says so, naming the account and what to do about it. Reply Catcher was there first and is filing into a screen somebody is already using, so it wins until you decide otherwise. Mail left sitting in a mailbox is not lost; mail filed twice is a mess.

The tidy ending is to turn Reply Catcher's mailbox connection off, or uninstall it, once you are happy here.

**Replies Reply Catcher has already caught are not imported.** They stay where they are, on the contact form enquiries they belong to, and are perfectly readable there. Anything still sitting in the mailbox gets collected here in the ordinary way.

---

## If you uninstall it

Choosing "remove code and data" takes every conversation, message and person with it. **The attachment files in your media storage are not taken**, because they live outside the database. They stop being claimed by anything, so the media library's **Unused** count picks them up and offers them for deletion. It is one more step rather than a hidden leak, but it is a step somebody has to take.

---

## Not in this version

Said out loud rather than left to be discovered:

- **Two people replying at the same time** is not handled. Nothing warns you that a colleague is typing an answer to the same conversation.
- **Labels** of your own. Status, assignee and the inbox itself are what there is.
- **Rules for filing by sender or subject.** Filing is by the address post was delivered to, plus the whole-folder option and a catch-all.
- **Live incoming text messages.** Texts appear on the hourly check.
- **Suggested replies.** Nothing here writes anything for you.

---

**Wiki:** [Home](Home) · [Modules](Modules) · [Contact form](Contact-form) · [Live Chat](Live-Chat) · [Twilio](Twilio) · [Reply Catcher](Reply-catcher) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Configuration reference](Configuration-reference)
