# Unified Inbox

Every conversation with every customer and supplier in one place: email, live chat, contact form enquiries, phone calls, voicemail, text messages and WhatsApp, with your own records sitting beside them. One screen instead of five, and a shared history instead of whatever happens to be on somebody's phone.

It is not a CRM. There are no pipelines, no deals and no lead scoring. People exist here so that two emails, a live chat and a phone call from the same human collapse into one story - and, since the [Contacts](#contacts) tab arrived, so that you have somewhere to write down their mobile number and where to post things. That is an address book. It stops there.

You will find it under **Inbox** in the admin sidebar, as a tab called **Unified Inbox**. Opening it folds the admin sidebar down to its icon rail, because a mail program wants the width more than it wants a list of links, and leaving the Inbox unfolds it again. If you would rather keep the sidebar out, click the `‹` / `›` toggle while you are in there and it stays put. Its settings live under **Settings → Unified Inbox**, split across a row of tabs so that changing a folder name no longer means scrolling past a retention policy.

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
| **People** | Telling colleagues from customers, whether to show people's own pictures, the categories you file contacts under, and the shape of your order and quote numbers. |
| **Campaigns** | Your business name and address for the unsubscribe footer, how long to leave between writing to the same person twice, and how long a finished campaign's log is kept. |
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
- **Kind of inbox** is the one answer on this form you cannot take back by reading it, so it is asked early. See "Shared and individual inboxes" just below.
- **Mail account** is which connection collects it. Leave it as "not collected from a mailbox" for a send-only address.
- **Folder to read** is normally the main inbox. Once the mail account has been tested, this is a menu of the folders that account actually has, spelled the way the mail server spells them - which saves guessing between "Sent", "Sent Items" and "Sent Messages". **Update folders** beside it asks the mail server again, for a folder you have made since. Made one this minute and would rather not wait? Choose **Type a folder name myself** and write it in.
- **Sent folder** is the same menu, and optional: left as "work it out from the mail account", the server is asked which folder it treats as Sent.
- **Everything in that folder belongs to this address**: for a folder you fill yourself rather than one the mail server sorts. With it on, anything sitting in the folder above is collected and filed here, even when it was sent to an old address of yours that this site has never heard of - drag it in and it turns up. Post that names one of your other addresses on its To or Cc line still goes to that address; this only settles what would otherwise have been filed under Not filed. Two addresses cannot both own the same folder: point two at one folder with this on and neither claims it, and filing goes back to the addresses.
- **Catch-all**: one **shared** inbox can be nominated to take anything that arrives at the mail account but matches no address you have listed. An individual inbox is not offered it, because post nobody could place is everybody's problem and filing it into one colleague's private mailbox puts it where the person who has to sort it out cannot see it. Without one, that post is filed under **Not filed**, which only an administrator can see, and the settings page tells you how much is sitting there.
- **Name on replies** and **Signature** are what your customer sees when you answer. Signatures have a section of their own below.
- **Who can read this inbox** is covered under "Who can see what" below.

Post is filed by the address it was delivered to, then by the To line, then by Cc, then by the folder it was found in where that folder has been told it owns its post, then by the catch-all. There are no rules for sender or subject in this version.

### Shared and individual inboxes

Every address is one of two things, and you choose which when you add it.

**Shared** is the business's: `sales@`, `accounts@`, `hello@`. Your team reads it between them, conversations get handed round, and the guest list under **Who can read it** says who is on it - empty meaning everybody who can see the hub at all. This is what every address was before the two kinds existed, and every address you already have is one.

**Individual** is one colleague's own post at work: `marcus@`, `chris@`. It belongs to the person you name, and **nobody else opens it - not their colleagues, and not whoever looks after the site - unless somebody is deliberately named on it** under **Who else can read it**. Leave that empty, which is how every one of them starts, and it is theirs alone.

That last part is worth being plain about, because it is the only place on the whole site where being an administrator does not get you in:

- Whoever looks after the site can rename an individual inbox, change which mailbox it is collected from, hand it to somebody else or delete it altogether. That is the configuration, and it stays with the administrator, where it belongs.
- They cannot read a word of what is in it unless they put themselves on its list, which is a deliberate act that shows on the form for anyone to see afterwards. Not by opening it, not through **All**, and not through search - a snippet from somebody's individual inbox never appears in the results of anybody who is not on it.
- A promise of privacy that the site owner can quietly read anyway is not a promise, it is a label. So this one is real: the only way in is a name on a list, and there is no way to be on that list by accident.

**Sharing one, for when somebody is away.** Tick a colleague under **Who else can read it** and that address joins their inbox under **Team inboxes** - see [Covering somebody's post](#covering-somebodys-post). It is meant for the ordinary reasons: covering the post while its owner is on leave, or an assistant who works somebody's diary. Tick **Can reply as this address** beside their name as well and they can answer from it; leave it off and they can read and nothing more. The owner is always on their own list and always able to answer - it is their post - so they do not appear among the tick boxes.

A few consequences worth knowing:

- **Nobody has one until you say so.** Every address on an existing site is shared, and updating does not change a single one of them. Turning one into somebody's own is a deliberate act, because it takes an address away from people who can read it today.
- **A conversation in an individual inbox can only be handed to somebody who can open it** - its owner, and anybody named under **Who else can read it**.
- **It becomes the address that person opens on**, and its signature goes on their replies, exactly as ticking **Their own inbox** on a shared address does. Naming somebody who already had an address of their own moves them here.
- **Post at it is handed to them, both ways.** Anything that lands at somebody's own address is put on that person's desk as it arrives, and so is any conversation they start from it - so it stops sitting in the "nobody has picked this up" pile, which nobody else could have picked up anyway. It never takes a conversation off somebody who already has it, it never touches shared addresses like `sales@`, and it is a tick you can turn off: **Settings → Unified Inbox → Collecting → Who gets it**.
- **If their staff account is deleted, the post is not.** The address stops belonging to anybody and falls back to whoever looks after the site, the same answer this module gives for mail it could not place. Nothing is lost, and nobody is locked out of it for good.
- **A suspended account cannot be given one**, since that would leave an address only a suspended person may read, which is an address nobody may read.

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

Not everything starts with somebody writing to you. **Write a message** sits at the right-hand end of the row with the search box, just past it, and opens a blank message in a box over the top of the list: who it is going to, a Cc or a Bcc if you want one, a subject, what you want to say, and anything from your media library attached to it - or dragged straight onto the box.

**Cc and Bcc are links at the end of the To line**, and each opens a line of its own when you press it. A Bcc goes to somebody without anybody else on the message being told - that is the whole of what it is for, and it is why it is a separate line rather than more names in the Cc box. An empty line has a **Remove** beside it to put it away again; a line with somebody on it has not, because a button that quietly dropped a recipient would be worse than one more click.

**The To and Cc lines suggest people for you.** Click into either one before typing a word and the addresses that inbox has been dealing with are already listed, most recent first, with the name and company where the site knows them. Type and the list narrows. Arrow keys move through it, Return or Tab takes the highlighted one, Escape puts the list away without closing the message. Pick somebody and only the part you were typing is replaced, so a line that already has two people on it keeps them.

The suggestions are that address's own correspondents rather than everybody the site has ever met, which is usually the shorter and better list. Your own addresses are never suggested, and neither is anybody already on the line. Nobody is offered an address out of an inbox they are not allowed to read. The conversations stay where they were underneath, and closing the box - the cross at the top right, or the Escape key - puts you straight back to them, offering to keep what you had written as a draft on the way. There is no Cancel button any more: a button whose whole job was to lose a screenful of typing was not worth the row it sat on.

**It goes out as whichever inbox you were looking at.** Standing in `accounts@` and pressing Write means writing as `accounts@`, which is almost always what you meant. The **From** menu at the top of the message is there for the times it is not: pick any of your addresses and the message leaves as that one instead, with that inbox's name on replies and its signature, and the answer comes back to that inbox. Only addresses you are allowed to send from appear in the menu, so nothing on it can turn round and refuse you.

Once it has gone, you are standing in the new conversation, which behaves exactly like one somebody started for you: it can be assigned, snoozed, noted on and replied to, and their answer joins it rather than arriving as something unrelated.

If you are looking at **All**, at **Not filed**, or at one of the other channels, the menu opens on your first address rather than guessing. And if none of your addresses is one you may write from, the button is not there at all, rather than there and disappointing.

### Not everything is an email

There is a small arrow beside the write button. It opens three other things you might have meant.

**Discussion** is a conversation with your colleagues that no customer ever sees. The box opens with the cursor already in the To line, because who it is to is the first thing about it: start typing a name, pick them off the list, and each one sits there as a tag you can take off again. Give it a subject, say your piece, and it appears alongside the real post - except that nothing on it is ever sent anywhere.

It lands in your inbox **and** in the inbox of everybody you put it to. One conversation, not a copy each, so a reply on it is a reply the others see rather than three half-conversations that never meet. Anybody you put it to who has not been given an address of their own still gets it on their **Asked me** list, which is how they were reached before. In the list it reads as your name, then theirs, the way every other conversation reads as who it is with. You are not asked which address to start it in: it starts in your own, or, if nobody has given you one, in whichever address you happen to be looking at. There is no reply arrow on a discussion, only the note line at the foot of it and, behind the dots on any message, the full note box for one with a file on it - because there is nobody outside it to reply to.

It is the same internal note the inbox has always had, with one thing added: somewhere to put the first one. "A word about the Henderson order" no longer has to wait for the Hendersons to write in.

**Call** rings somebody. Your phone rings first, from whichever of your numbers you picked, tells you who is about to be rung, and puts you through when you press a key - so you are never listening to a phone ringing in an empty room. The number you dial from is the one they see, and the one they ring back, which is why it is a menu rather than a fixed value. The call turns up afterwards in the phone conversation with that number, filed by the part of the site that placed it.

**You can type a name instead of a number.** Start writing one into the **Ring** box and the contacts who have a number on them appear underneath, with the number beside each so you can see which one you are about to dial. Click one, or pick it with the arrow keys and Return, and the number goes into the box. Nobody remembers a phone number; they remember whose it is, and it is already written down here from the last time that person got in touch. Typing an actual number still works exactly as it did - the list only appears once there is a letter in the box.

**Call me at** is filled in from your own account, so you are not typing your mobile in from memory every time. Put your number on it once - **Your account** > **Profile** > **Your phone number** - and it is there whenever you place a call. It is still a box rather than a fixed setting, because the day you are sitting at a customer's desk you want the call to reach you there instead, and changing it here changes it for that call only.

**Numbers are typed the way you would say them.** 020 8138 0512 is a whole number, and so is 07700 900123, and so is 2081380512 - all three reach the same place. Anything without a country code is taken as your site's, which is **+44** unless somebody has changed it in **Settings** > **General** > **Dialling code**. Type a number from anywhere else in full, with its + and country code, and it is left exactly as it is.

**SMS** sends a text. A number, a message, Send. The **To** box behaves exactly like **Ring** does: type a name and the contacts who have a number on them appear underneath to be clicked, and a number typed the way you would say it - 07700 900123, or 7445164234 - is taken as your site's country unless you write one in full with its + and country code. It goes out through whatever the site sends its texts with, and lands in the same phone conversation the calls do. The line under the box counts what it will cost you: 160 characters is one text, and a single curly quote or emoji - the sort of thing a word processor puts in without asking - drops the whole message to 70 characters a text for the rest of its length.

**The menu only offers what your site can actually do.** No texts without something to send them with, no calls without something to place them with, and no arrow at all when it can do neither - in which case the button is exactly what it always was. Both of those come from the Twilio module today; the inbox knows nothing about it beyond "there is something here that makes calls".

### Which message you are answering

**The arrow you press is the message you answer.** Press Reply on the fourth message of a long conversation and that fourth message is what gets quoted underneath, folded away under **Show the earlier messages** the way every mail program does it. It used to quote whatever was at the bottom of the conversation instead, so an answer to something said on Tuesday went out with Friday's message tucked under it - confusing for the customer and no help to you either.

The same goes for **Reply to all** and **Forward** on that message's own dots, and for the copy filed alongside: the reply is threaded against the message you answered, so it lands in the right place in the customer's own mail program rather than at the end.

**Nothing changes for the ordinary case.** A reply started from the conversation itself, rather than from a particular message, still answers the newest one - which is what you want nine times out of ten and what the box has always done.

**You can see what will be quoted before you send it.** Under the writing box there is a **Show the earlier messages** line - the same words the conversation above uses. Open it and the message you are answering is there in full, earlier messages and all, exactly as it will appear beneath your reply. On a forward it says **Show what you are forwarding** and shows the From, Date, Subject and To lines that go with it. It is there to be read rather than edited: what gets quoted is decided by the arrow you pressed, so changing your mind means pressing a different one. Nothing is fetched until you open it.

**A saved reply remembers which message it was answering**, so one finished tomorrow morning, or set to go out on Monday, still quotes the message you wrote it against. If that message has been deleted in the meantime, the reply still goes: it simply quotes the newest one instead, because losing what you wrote would be the worse of the two.

### Who a reply goes to

**The To line on a reply is a box you can type in.** Cactus still works out who a plain reply goes to and fills it in for you - the sender, or whoever their Reply-To names - and that is what you will send nine times out of ten. But it is now the answer in a box rather than a sentence, so the one address that wants taking off, or the colleague who wants adding, is a click rather than a change of plan.

Switching between **Reply** and **Reply to all** on the message's own menu refills the line, which is exactly what those two mean. Once you have edited it yourself, your answer stands and nothing rewrites it again.

**The box no longer wears a title strip.** It used to spend a whole row along the top saying *Reply* - naming the button you had just pressed, on the screen where you are trying to read a customer's message. Which one you are writing is decided on the message itself, with the arrow or the dots beside it, and changing your mind means pressing one of those rather than anything in here.

**Cc, Bcc and Subject are links at the end of the To line.** None of them takes up a line until you ask for it, because most replies want none of the three. Press **Subject** and the line opens on what the subject would have been - **Re: whatever it was** - so you can change it rather than start it. Leave it alone and nothing changes.

**The two ways out of the box sit at the right-hand end of that same line**, where the strip along the top used to carry them. The arrow **opens the reply in a window of its own**, over the whole screen, for the reply that turns out to be a letter. It is the same box either way - nothing you have typed is lost going out or coming back - and the arrow in the corner of that window, or the Escape key, puts it back under the conversation. On an internal note, which has no To line, the pair sit at the end of the sentence saying nobody outside can see it.

**The cross beside it closes the reply**, and it is the one place the draft is asked about: **Save it as a draft**, **Throw it away**, or **Keep writing** - the same three answers the new-message box gives. It asks whether you have just typed something or came back to a draft you saved yesterday; only a genuinely empty box shuts without a word. There used to be a **Throw the draft away** button on the strip along the bottom as well, which put a destructive press a thumb away from Send and asked the same question in a second place. See [Drafts](#drafts).

### Making it look like something

Both writing boxes carry seven buttons on the strip along the bottom, next to the paperclip: **bold**, *italic*, ~~strikethrough~~, a colour, a link, a bullet list and a numbered list. Select some words and press one, or press it and carry on typing. **Ctrl+B** and **Ctrl+I** work as they always have. They used to sit in a band of their own above the words; everything you can do to a message is on the one strip now.

That is the whole list, and it is short deliberately. Typefaces, sizes and alignment are the things that make an email look assembled rather than written, and half of them are rendered differently by every inbox they land in.

**The colour is behind the palette.** Press it and seven colours appear beside it; press one and it is applied and they fold away again, which is what a colour menu does everywhere else.

**The link button opens a line rather than a browser box**, so it can tell you when what you typed is not an address. Type `example.com/prices` and it works out the rest. Select some words first and they become the link; select nothing and the address itself is what appears.

**Pasting brings the words, not the wallpaper.** Paste from a web page or another email and you get the text: the fonts, the layout and the tracking pixels that came with it are left behind, which is what you wanted and is a good deal safer besides.

### Drafts

The phone goes halfway through a reply, and until now that cost you the reply. Nothing you half-write is thrown away any more, and **there is no Save as a draft button to remember to press**: the box puts itself down and waits under **Drafts** in the list of addresses until you come back to it.

**A reply saves itself the moment you go somewhere else.** Click another conversation, another address, another tab - anything that takes the screen off the reply - and what you had written is put down as a draft on the way past, with no question asked. The only time you hear about it is when the save itself fails, in which case the screen stays where it is and says so rather than losing the words.

**Closing one asks.** The cross at the top right of the reply box - and of the popped-out window, and of the new-message box - offers three answers: **Save it as a draft**, **Throw it away**, or **Keep writing**. Nothing is thrown away without you saying the words. A box you have not typed in simply closes.

**Drafts is a tab of its own**, because it is not one address - it is everything you have half-written, across every address you write from. The number beside it is how many of yours are waiting. A message you have set to go out at a particular time is not one of them: it moves next door to **Scheduled** (see [Sending it later](#sending-it-later)), and comes back here if its timer is cancelled or its send is refused.

**It is only there while there is something in it.** Nothing half-written, no Drafts row: an empty folder is a place you can only ever go and be disappointed by, and being able to write from an address is not a reason to be shown one. It appears the moment a box puts itself down and goes again once the last one has been sent or thrown away - except while you are standing in it, so emptying the folder does not pull the list out from under you.

**Your drafts are yours on a shared address.** Sharing accounts@ shares what has been sent from it and what has arrived at it; it does not share the sentence somebody is halfway through typing. A price you have not checked yet, or an apology you have not decided to make, is not something the rest of the team finds in a list.

**The one exception is somebody's own address, and only for the people covering it.** If Sam's address has been shared with you by name, Sam's unfinished replies show under **Sam Blake → Drafts** on the rail. That is a deliberate choice and worth being plain about: you are already reading every message that arrives at Sam's address and every message that leaves it, and the one thing you could not see was the answer Sam started on Tuesday and did not finish - which is exactly how the same customer ends up written to twice, once by Sam on Friday and once by you this morning. Nobody who has not been put on that address sees any of it.

**Reading is the whole of it.** You cannot finish somebody else's draft, send it, change it or throw it away, from that folder or anywhere else, and there is no button offering to. The cost of that is honest and worth saying: a half-written message belonging to somebody on leave waits for them. If it needs to go out, write it yourself and send it - now knowing what they had already said.

**Opening one shows the message rather than a writing box**: who it is to, what it is about, what is attached, when it is set to go out if it is, and the words. If it is an answer to a conversation, there is a link across to that conversation. At the foot it says whose writing it is and that only they can finish it, so there is no hunting for a Send button that was never going to be there.

Opening a conversation shows your own draft on it, if you left one. There is one draft per conversation per person, which is the box, put down; saving again writes over it rather than leaving you to choose between two halves of the same sentence. Two people can each have one on the same conversation, and each sees only their own.

Picking one back up depends on what it is. A saved reply lives under its conversation, so clicking it opens the conversation with your words still in the box, the customer's message above them, and set to whichever of Reply, Reply to all and Forward you had chosen. A message you had not finished starting opens the writing box again exactly as you left it - recipients, subject, attachments and all.

**Walking away is instant.** Clicking a tab, another conversation or anything else while you are half way through a reply takes you there straight away, and the draft is put down behind you. It used to wait for the save to finish before the screen moved, which on a slow line looked like a click the site had ignored. If putting it down somehow fails, it tries once more on its own.

**Sending clears it away.** The draft goes at the moment the message actually leaves, so nothing is left sitting in the list to be sent again next week. To be rid of one without sending it, close the reply with the cross and answer **Throw it away**. On the new-message box that is still a **Throw the draft away** button on the strip along the bottom as well.

What is saved is what you typed, line breaks and all, along with who it is going to, the subject and anything you attached. Attachments are still only pointed at rather than copied, so a draft carrying three quotes costs nothing until you press Send.

### Sending it later

Some replies are written at half past eleven at night and would land better at nine in the morning. The **alarm clock**, sitting with the send buttons at the right-hand end of the strip along the bottom, opens the same short menu the clock at the top of a conversation opens - **In three hours**, **Tomorrow morning**, **Next week**, or **Day & Time** for a month to pick from - each with the day and time it actually lands on written beside it. It sits there rather than over with the paperclip because choosing a time changes what the buttons beside it do, and a control a foot away from the thing it changes is a control nobody connects to it.

Picking a time sends nothing on the spot. It puts the time on the line above the buttons - **Set to go out tomorrow at 09:00** - and the two send buttons change to say what they would now do. **Send now** becomes **Send later**, and **Send & snooze** becomes **Send later & snooze**. Both stay where they are: choosing to send later used to take **Send & snooze** away and leave a chase in its place, so deciding to send in the morning quietly cost you the ability to put the conversation to bed. There is no third button either - there used to be a **Save it for then** beside them, which meant three ways to send on one strip with two of them a thumb apart. **Cancel send later** takes the time back off and everything reads as it did.

**The time you picked is not lost if you wander off.** Click onto another conversation, or close the box, and the time goes down with the writing - the message is set going and waits under **Scheduled**, rather than becoming an ordinary draft with nothing to show for the time you chose. Closing says so in as many words - **Set it going? ... it goes out tomorrow at 09:00 on its own** - so nothing is queued behind your back. It used to be thrown away without a word, which is how a message somebody believed was going out at nine turned out to be sitting in Drafts.

Once it is set the message waits until then and goes out on its own; you do not have to be there, or even have the site open.

**Putting the conversation to sleep can be part of the same press.** **Send later & snooze** sets the departure and puts the conversation to sleep behind it, so you see it again when you said and not when the message happens to leave. Or do the two separately: set the message for Monday morning, then use the clock at the top of the conversation to put it to sleep until Friday, and Friday is when it comes back - the message going out on Monday does not wake it up. Where both have been said, whichever of the two is later wins.

**It waits under Scheduled, not under Drafts.** **Scheduled** is its own row on the rail, next to **Drafts**, holding everything you have set going and nothing else, soonest first, with **Goes out tomorrow at 09:00** on each row. Drafts is what you have not finished; Scheduled is what is going out without you, and a list that mixed the two made the Drafts number read as work outstanding when half of it was work already done. Like Drafts, the row is only there while there is something in it.

**You can still change your mind about all of it, right up until it goes.** Open it and:

- **Change the writing** - correct a price, add a line - and press **Save changes**. What it says changes; when it leaves does not.
- **Move it** to another time from the same alarm clock. The new time shows as **Move it to Friday at 09:00** above the buttons, and **Send later** commits it. **Keep the time it has** drops the new time and leaves the old one alone.
- **Send it now** after all. The button is there the whole time it is waiting.
- **Cancel the timer** on the alarm clock menu, which hands you back an ordinary draft under **Drafts** with everything you wrote still in it.

**The one thing it will not do is send twice.** If you press **Send now** in the same few seconds the site is already posting it, you are told it is on its way and to look in **Sent**, rather than the customer getting it twice.

**It goes at that time or shortly after, never before it.** The site checks its own list on a schedule, so a message set for 09:30 leaves at 09:30 or a little after depending on how your site is set up. Anyone pressing the refresh button in the inbox sends whatever is due at that moment too, which in practice means a message due while somebody is at their desk goes almost at once.

**Times are your site's times.** Nine o'clock means nine o'clock as the site tells the time, whatever clock the computer you typed it on is keeping.

**If it cannot go, it goes back to Drafts and says so.** An address that has been taken off you between writing the message and its time coming, a mail server having a bad morning, a conversation that has since been deleted - whatever the reason, the writing is kept exactly as it was with **Did not go out** and the reason on the row, and nothing is quietly thrown away. It sits under **Drafts** rather than **Scheduled**, because it is not going anywhere on its own any more and it wants somebody to look at it. Fix it and send it, or set another time.

A message set to go out is still a draft underneath - it is simply one with a departure time - so it follows the same rule as one: it is yours, only you can see it, and only you can change it, move it, cancel it or throw it away, however many people share the address it would leave as.

### Send it and put it to bed

Some replies end the matter for a fortnight: the answer is sent, and there is nothing more to do until the supplier gets back to you. **Send & snooze** sits next to **Send now** and does both in one press - it opens the same short menu the clock at the top of the conversation opens, sends the message, and puts the conversation to sleep until whenever you said. Pick a departure time first and it becomes **Send later & snooze**, which sets the message going and puts the conversation to sleep without sending anything now.

It is on the new-message box as well, where it puts the conversation you have just started to sleep. Set a departure time there too and the sleep is kept with the message: the conversation is made when the message actually goes out, days later with nobody watching, and it arrives asleep rather than sitting at the top of the list wanting attention. The notice on the message says so while it waits - **This conversation stays asleep until Friday morning, unless they write back first**.

Their reply wakes it either way, as a reply always does, so you only see it again at the time you picked if nobody has answered by then.

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

**Tell me when a reply is delivered, opened, clicked or bounces.** Brevo tells the site what became of each message and the answer appears under the reply itself: *Delivered 09:14*, *Opened 11:32*, *Followed a link 11:33*, or *It did not arrive* with the reason behind it. Useful when you are deciding whether it is worth chasing somebody, and rather more useful than guessing.

Two honest limits. An open is worked out from a tiny invisible picture in the message, and some email programs - Apple Mail and Gmail among them - fetch that picture themselves before anybody has looked at a word. When that is what happened you are told **their email app fetched it** rather than told a fib about somebody reading it. And it only works for inboxes sending through Brevo: an inbox on its own outgoing mail server carries on saying nothing but *Sent*.

**Followed a link** sits beside the open rather than instead of it, and answers a different question: not whether they looked at your email, but whether they looked at the quote in it. A message can easily have one without the other, since plenty of email programs never load the picture an open depends on. It needs one thing switched on at the other end - **link tracking in your Brevo account**, which is what puts Brevo in the middle of the links in your messages so it can see one being used. If nothing ever says *Followed a link*, that setting is the first place to look, and switching it on costs nothing here: the site is already listening, and it reminds the email service what to tell it once a night in case anything has drifted.

One caveat, and it is the same sort of caveat as the invisible picture. Plenty of offices run every arriving email past a security system that opens every link in it to check where they go, and it does the lot within seconds of the message landing. Several clicks all at once, a minute after delivery, is more likely to be that than a person - which is why the site counts each address separately and shows you the time, rather than handing you a single number with no working.

**Ask the person's own email program for a read receipt.** The old-fashioned kind, from the days of office memos. Most programs ignore the request and the rest ask the reader whether to answer it, so expect a reply perhaps one time in ten - mostly from people in offices. When one does come back it lands on the message it belongs to rather than turning up in the conversation as a mysterious email titled *Read: your quote*, which is what happens everywhere else.

All of this amounts to keeping a note of what somebody did with an email you sent them. That is yours to decide, but **if your privacy notice does not mention it, add a line before you switch them on**. Nothing is recorded for any message sent before you did.

### Attachments

You can attach anything from your media library. There is a ceiling of about nine megabytes for everything on one message, which is what the email services themselves allow, and **an attachment that will not fit is refused before you send** rather than quietly dropped on the way out.

**Attach a file** is the paperclip at the left-hand end of the strip along the bottom, beside the price tag and the formatting buttons, with the ways to send it at the other end. On a narrow window the strip wraps and the send buttons stay hard right.

Pressing it opens a box of its own, and the box is mostly one big rectangle: **drag your files onto it, or press Choose files and pick them off your computer**. Take as many as you like, in as many goes as you like - the box stays open until you press Done, so attaching six things is one errand rather than six trips. Above the rectangle there is a search over your media library, for the other case: type a name and the results stand where the rectangle was, empty the box and the rectangle comes back. Anything already on the message is shown greyed out there, so nothing gets attached twice.

**What you have put on is listed underneath, a file to a line**, with its size beside it and a cross on the end. Attach the wrong one and you can take it straight back off without closing the box.

You can also **drag a file straight onto the message** without opening anything - onto the reply box under a conversation, or anywhere on the box where you are writing a new one. Drag several at once and they all go on. The box says "Drop to attach" while the file is over it, and either way the files appear as tags on their own line just above the buttons as they arrive, with a cross to take one back off. Nothing is sent until you press Send, as ever.

Files brought in this way - dropped, or chosen off your computer - have to be **under four megabytes each**, which is the hosting platform's limit on what one upload may carry rather than ours. Something bigger has to go into your media library first, which has a route for large files this one does not, and then onto the message with the search box.

There is no sensible limit on **how many** files one message may carry. The nine megabytes above is the real ceiling and it is the one you will meet: forty delivery notes are fine, four photographs straight off a phone are not, and either way you are told before anything is sent rather than after.

A few things are refused, and each says why: a folder (drop the files inside it instead), and anything that is a program or a script rather than a document, because the email services will not deliver one of those anyway and finding that out at Send is finding it out too late. If you need to send one, put it in a zip.

A dropped file goes into your site's storage, not into your media library: it is a customer's paperwork, and it has no more business in the picker you build pages from than an invoice that arrived in `accounts@`. A file you drop on and then think better of - never sent, never saved as a draft - is cleared away by the site a week later. A draft holding one keeps it for as long as the draft lives.

### Putting what you sell on a message

Half the questions a shop gets are answered with a product. **The price tag beside the paperclip** opens your catalogue, and what you pick is printed in your message the way the lines of an order confirmation are printed: the photograph, the name, and the price, each one linking to its own page.

**The catalogue opens over the screen rather than inside the message.** It used to unfold underneath what you were writing, which pushed the message itself off the bottom of the pane the moment you went looking for a chair - and a catalogue is a thing you rummage in, so it is the wrong thing to put in the middle of a sentence. Close it and the message is exactly where you left it.

Three things can go on, and the difference is worth knowing:

- **A product**, for something that comes one way only.
- **A listing that has variations** - the chair that comes in eight colours. It goes on quoted from its cheapest ("From £419.00") and links to the page where the customer picks, which is usually what you want when somebody has asked what a range costs.
- **One exact variation**, when they have asked about the black one with the high back. **Choose one of eight** under the listing opens the ones that can actually be bought, and the options that make each one are printed under its name in the message.

**A long range is narrowed rather than scrolled.** Open a listing that comes in six hundred combinations and you get a short row of menus above the list - one for each thing that actually varies: **Width**, **Storage**, **Finish**, **Leg Finish**. Choose the ones you have been asked about and the list comes down to what is left; **Show them all** puts it back. Anything that is the same across the whole range gets no menu, because choosing it would rule nothing out.

**Prices carry "+ VAT" where the tax genuinely applies and your shop quotes its prices without it.** Nothing is added where the price on your site already includes the tax, or where the product is not taxed at all - and if your shop calls its tax something other than VAT, the message calls it that too.

There is no heading row and no quantity: this is you showing somebody two chairs, not sending them a receipt for something they have not bought. Delivery times are left off for the same reason - what a thing costs and what it looks like is the answer to "which one did you mean", and how long it takes to arrive depends on where it is going.

**It goes where your cursor is.** Picking a chair drops it into the message at the point you had reached, and you carry on typing underneath it - so "this one is the cheapest", the chair, "and this one is what you actually asked for", the second chair, reads in that order when it arrives. Move the cursor, pick another, and that one lands there instead. They used to all pile up under the writing in the order you picked them, whatever the message said, which is the wrong way round for the commonest thing anybody writes.

**You see it as they will see it.** Each one is drawn in the message laid out the way it will arrive - photograph, name, options, price. A cross on the corner of it takes it back off, Backspace does the same, and the catalogue stays open while you add several.

**You can always write above and below one.** There is a line either side of every product - above the first one even when it is the very first thing in an empty reply, and between two of them that you added one after the other - so nothing you have put in ever leaves you with nowhere to type.

Prices and names are read **at the moment you press Send**, not when you picked - so a quote you saved on Friday and sent on Monday goes out at Monday's prices, and anything withdrawn in between is simply left off rather than quoted at a price you no longer sell it for. That is also why the block in your writing stays on a white background whatever theme you are using: it is a picture of what leaves the building, not part of the screen you are looking at.

The picker is only there if your site has a shop and you are allowed to see it.

**Internal notes carry products too, and a discussion is nothing but notes.** Asking a colleague "is this the one they mean?" is the shortest errand in the building, and it used to be the one thing the catalogue would not do: the price tag was hidden the moment you switched to a note, and a discussion opens on the note box and stays there, so the one conversation whose whole purpose is *look at this one* was the one that could not. Pick a product in a note and it is written out under your words - name, the options it comes in, the price and the address to look at it - and it joins the conversation's context line like anything else. Nothing is sent to anybody: a note is still only ever seen by your colleagues.

Text messages and calls are still the exception, notes included: the catalogue is kept off those two conversations altogether.

**Answering an enquiry, a chat or a WhatsApp message?** The catalogue is there too. Those channels go back out through the module that owns them and carry words rather than a laid-out table, so what arrives is the same lines the plain-text half of every email carries: the name, the options it comes in, the price, and the address to look at it - each one where you put it. Text messages are the exception, and not because of the pictures: a text is billed by the character, and three chairs quietly trebling the cost of one is not a decision to make on your behalf from a button with a price tag on it.

---

## Sending your other modules' post from an inbox

Your site sends plenty of email nobody types: an order confirmation, a purchase order to a supplier, a note that goods are on their way. All of it has always gone out as the one address on **Settings → Emails**, which is fine until somebody replies to it - and then a delivery question and a supplier's proforma are both sitting in the site's general post, waiting for whoever reads that to work out who they belong to.

Worse, none of it is anywhere you can read it afterwards. Email your site sends for you goes straight out through your sending service; it never passes through a mail folder, so it never appears in one. The order log says a despatch note went. It does not show you what the customer was told.

So two of the modules that send the most carry a box of their own, under **Where this email goes**, with a question apiece:

- **Settings → Purchase Orders → Where this email goes** - for your purchase orders, chases, cancellations and returns notes.
- **Settings → Shop → Notifications → Where this email goes** - for your order confirmations, despatch notes and the rest of your customer post.

**Send these from.** Pick one of your inboxes and that mail goes out as that address, under the name it answers on, and replies come home to it. A supplier answering a purchase order lands in the inbox the people chasing that order are already reading.

**Keep a copy of these in.** Pick one of your inboxes and every one of those emails turns up there as a conversation of its own, holding exactly what went out - the wording, who it went to, who was copied in, and any document that travelled with it. When the customer or the supplier answers, their reply lands underneath it, so whoever picks it up is reading both halves rather than an answer to a question nobody can see. It arrives already read, because you sent it: it does not mark the inbox unread or count as something waiting for you.

These copies carry the same **Delivered**, **Opened** and **Followed a link** labels a reply you typed does, so a confirmation nobody ever opened looks different from one where the customer went straight to their order - which is usually the question being asked about an order email. For a long while they carried none of that: the emails were sent by the shop or by purchase orders and the copy was filed here afterwards, and the labels only knew about mail written in the inbox itself. That is fixed, and it fixed itself - nothing to switch on, and nothing to press. It still needs **Tell me when a reply is delivered, opened, clicked or bounces** switched on further up this page, and *Followed a link* still needs link tracking on your Brevo account.

**The two are separate on purpose.** Keeping copies is the one most sites want, and it changes nothing a customer sees - so you can switch it on without touching the address your confirmations arrive from. Equally you can change that address and keep no copies. Either box works perfectly well on its own, and each saves the moment you choose - there is no separate Save to press.

Leave both as they come - **the site's usual address**, and **do not keep a copy** - and nothing whatsoever changes.

Four things worth knowing:

- The box only appears if you may manage this module's settings. Somebody who runs the shop but has no business repointing the site's mail does not see it.
- **Only the modules you have asked for copies of are filed.** Everything else carries on exactly as it did, and nothing core sends on its own account - a password reset, a sign-in code - is ever filed as a conversation. Those are not conversations, and they have no business sitting in a shared inbox.
- **The document is kept only if your site has file storage set up.** Without it the message is still filed, in full, with no paperclip - rather than a paperclip that opens onto an error.
- **Deleting an inbox no longer takes the setting with it.** A module pointed at an address you retire falls back to the site's usual one for sending, and keeps filing wherever you told it to file - rather than quietly forgetting both.
- Delete an inbox and any module pointed at it quietly goes back to the site's usual address. Nothing stops sending.

---

## How often it checks

Automatically, **once an hour on a paid hosting plan and once a day on the free one**. That is the hosting plan's limit rather than a choice.

For when you are waiting on something, there is a **refresh button in a box stuck to the foot of the rail**, down the left of the inbox. The box stays where it is however far you scroll, and beside the button it says **Updated** and the time the post last arrived, so "has anything come in" is answered before you press anything. Press it and the site goes and fetches your post there and then, from every mail account at once, and tells you what it found in a blue line above the button. The line reads for three seconds and then fades away on its own, because it is an answer to a press rather than something to be dismissed. Something that went wrong stays up until you press again. A mailbox opened seconds ago is left alone rather than opened again, so that your mail provider does not take it personally - press anyway and the list still refreshes, and it tells you how recently your mail was looked at rather than refusing you. The same thing per account still lives on the settings page as **Check now**.

The refresh button only appears if you look after the inbox and there is a mail account for it to check - there is no sense offering a button whose only possible answer is no.

If you would rather not keep pressing it, **Settings → Unified Inbox → Collecting → Check for new mail while the inbox is open** does the pressing for you: pick a wait - a minute, two, five, ten, or half an hour - and the inbox goes and looks that often on its own while you have it open. It only runs on a tab you are actually looking at, it stops the moment that tab goes behind something else or you close the page, and it says nothing at all - the time beside **Updated** moves on, new post simply appears in the list, in bold, where post has always appeared, and nothing else happens. A banner across the top announcing mail that is already on the screen underneath it is one thing to read too many. Only people who look after the mail accounts get it, for the same reason the button is only theirs. Off to begin with, and worth picking the longest wait you can live with: every check is a bit more work for your hosting.

The first collection does not fetch everything at once. New post is picked up straight away, and the history is walked backwards a batch at a time over the following checks until it reaches as far back as you asked for under **Collecting → How far back to go** (twelve months to begin with). A mailbox with years in it takes a while to fill in, and the settings page shows the progress while it does.

---

## Being told when post arrives

The first time you open the inbox, a small card appears above the **bell** at the foot of the rail and asks whether you would like a nudge when something new lands. Say yes and your browser asks you to allow it, in its own words, once. From then on, post arriving in your address pops up in the corner of the screen the way a message from any other program does, and clicking it opens that conversation.

Say **No thanks** and you are not asked again. The bell is still there if you change your mind later, and pressing it turns nudges on and off whenever you like.

A few things worth knowing, because they are the questions everybody asks:

- **It watches your own address**, the one pinned to the top of your rail. If you have not been given one, it watches everything you can read instead, which for you amounts to the same thing.
- **Nothing pops up while you are looking at the inbox.** The list in front of you already shows what has arrived, in bold, where post has always appeared. Nudges are for when you are in a spreadsheet, or in another window, or on a different tab.
- **The inbox has to be open somewhere.** This is the browser's own notification, not an app on your phone, so it needs a tab of the site left open in the background. Close every tab and the nudges stop until you open one again.
- **It is per browser, per person.** Saying yes on the office machine does not say yes on your laptop, and the answer is kept against your own account, so two people sharing a computer get their own.
- **A busy morning is one nudge, not forty.** Several arriving together come through as a count with the names underneath, and each new nudge replaces the last rather than stacking up.
- **Been away a while?** Coming back to a tab you left open a few hours ago will not empty the whole morning onto your screen at once. It only ever looks back over the last twenty minutes.

If nothing happens after you have said yes, it is almost always the browser rather than the site: notifications can be switched off for the whole browser, or for this site, in its own settings, and a page cannot undo that from the inside. Windows also has a Focus assist setting, and macOS a Do Not Disturb, either of which will hold everything back quietly. When your browser has blocked us outright the bell is greyed out and says so if you hover over it.

---

## The screen

The inbox is laid out the way a mail program is: one box the height of the window, split into columns, each scrolling on its own. Nothing on it scrolls the page.

**Down the left is the rail** - everywhere you can go, in a list rather than a row of tabs. Your own name and picture sit at the top of it, with two buttons beside them: a magnifier that searches everything, and the pen that starts a new message. Under that, five groups:

| Group | What is in it |
| --- | --- |
| **Yours** | Your own address if you have been given one, then **All**, **Mentioned**, **Drafts**, **Scheduled**, **Sent** and **Spam**. The handful of places one person opens all day, in whatever order you drag them into. **Drafts** and **Scheduled** are only there while there is something in them. |
| **Shared inboxes** | The addresses the business owns, each with a coloured dot and the number of open conversations beside it. |
| **Team inboxes** | Colleagues whose own post you have been let in to, named after the person rather than the address. Put the pointer on one and its coloured dot becomes a **&rsaquo;** you can press to open their folders - their **Drafts**, **Sent**, **Mentioned** and **Spam**. Only there if somebody has shared one with you. |
| **Channels** | The chat, form and phone conversations, where another part of the site owns them. |
| **Everything else** | **Contacts** (the address book), **Campaigns** if you are allowed them, and, for whoever looks after the site, **Not filed**. |

**The number beside an address is what is still open on it.** Not what has arrived unread: a conversation you have looked at, thought about and left is still a job, and a badge that emptied itself the moment you glanced at the list said nothing about the work in front of you. It is the same number the list shows when you click the address, because clicking one lands you on **Open** - so the rail and the head of the list agree. Something snoozed until Thursday is not in it, having been decided about, and neither is anything marked done. **Spam is the exception**: that number is unread junk, because a bin nobody empties would otherwise sit at a permanent 47 and stop meaning anything.

The refresh button sits in a box stuck to the foot of the rail, with **Updated** and the time your post last arrived beside it (see [How often it checks](#how-often-it-checks)), and beside them the **bell** that turns browser nudges on and off (see [Being told when post arrives](#being-told-when-post-arrives)). The box does not scroll away with the list.

**The coloured dots** are worked out from the address itself, so a site with six inboxes gets six different colours without anybody being asked to pick them, and the same address is the same colour on every screen and for every colleague. There is nothing to set and nothing to keep in step. Your own address is the exception: it wears a small figure rather than a colour, because there is only ever one of it and saying "this one is you" is more use than saying which of five colours it happens to have landed on.

**Opening the hub takes you to your own inbox.** Not to All, not to wherever you were last: `/hq/inbox` with nothing after it is your own address, every time.

**What has been handed to you is in that inbox too.** A conversation in `accounts@` that somebody puts on your desk shows in your own inbox beside the post that arrived there, and its number goes up to match. There is no separate "assigned to me" list any more, and there was one - it went because a list you have to remember to check is a list that goes unchecked. Nothing is moved or taken away from anybody: the conversation is still in `accounts@`, still in the list and the count there, for everybody who reads it.

**The order of the Yours group is yours.** Drag any of those entries up or down - or hold Alt and press the arrow keys - and they stay where you put them. Unlike the shared addresses and the channels below, this needs no permission and changes nothing on anybody else's screen, because it is a fact about how you work rather than about the site.

**Mentioned** answers the other half of the same question. Being handed a conversation and being asked about one are two different things: the first puts the whole thing on your desk, the second asks you about a bit of it. Everything a colleague has tagged you in gathers here, with its own **To do**, **Later** and **Done** across the top - see [Asking a colleague to look at something](#asking-a-colleague-to-look-at-something).

### On a phone or a tablet

The same mail program, one pane at a time. Below about 1200px there is no room for a column of places down the left, so **the rail becomes a bar along the top** saying where you are - the inbox's coloured dot, its name and what is still open in it - with the magnifier and the pen beside it. **Press the name and the whole rail slides in from the left** as a drawer: the same five groups, the same headings, the same order, your name and picture at the top of it and the refresh button and bell at the foot. Pick a place and it slides away again; the cross at the top, the dimmed page behind it or the Escape key put it away without choosing. It used to be one strip that scrolled sideways, with half the addresses off the edge of the screen and nothing to say so.

**On a tablet** (roughly 900px and up) the list stays beside what you have opened, exactly as on a desktop. **On a phone** you see the list, or the thing you opened from it, never both: a **&lsaquo;** at the start of the subject line takes you back to the list, and the box fills the screen edge to edge under the admin's own bar rather than sitting in a frame. Every pane scrolls its own contents, so the conversation's subject and its buttons stay at the top while you read, and the note bar stays at the bottom. The buttons on the subject line run sideways under your thumb rather than piling up in rows.

**Dialogs and menus come up from the bottom edge** on a phone - the new-message box, the search, the file and catalogue pickers take the whole screen, and every short menu (assign, snooze, the dots on a message, the pen's arrow) is a sheet along the bottom rather than a small panel pinned to the button that opened it. Anything pressed with a finger, anywhere the screen is a touchscreen, is given a target a finger can hit.

### Covering somebody's post

An individual address is one colleague's own and nobody else's, until somebody is deliberately named on it - which is the whole point of it, and no use at all when that person is on a fortnight's leave and their suppliers are still writing in.

So an individual address can be **shared with named colleagues**. Whoever looks after the site does it on **Settings → Unified Inbox → Inboxes**, editing the address and ticking a name under **Who else can read it**. Nothing else opens one: not being an administrator, not being on some other address's list.

Once somebody is on it, that address appears in their rail under **Team inboxes**, named after the colleague rather than after the address - **Sam Blake**, not `sam@`, because that is how anybody covering Sam's post thinks of it. It sits flush with every other name on the rail; there is no arrow in front of it and no indent. Put the pointer on the row and the coloured dot turns into a **&rsaquo;** - press that and their folders open out underneath:

| Folder | What is in it |
| --- | --- |
| **Drafts** | What **they** have started on that address and not sent. Read only - see below. |
| **Sent** | Everything that has left that address. |
| **Mentioned** | Conversations on that address that its owner has been tagged in. |
| **Spam** | What has been thrown away out of their post, including anything you binned while covering. |

**All four are theirs, and Drafts is the one worth pausing on.** Covering somebody's post means knowing what they have half-answered as well as what they have answered; not knowing is how a customer gets two replies from two people. So the folder holds Sam's unfinished writing, and it is there whether or not there is anything in it, exactly like the three beside it. It is **read only** - opening one shows the message and says so at the foot. Only Sam can finish, send, change or throw away one of Sam's drafts, and no button here offers otherwise. Your own half-written writing, wherever you left it, stays under **Drafts** in **Yours**.

The list is headed with the colleague's name in front of the folder - **Sam Blake · Drafts** - the same way their Sent, Spam and Mentioned lists are.

The name itself is their inbox, exactly as a shared address's name is. Press the **&rsaquo;** again and the folders fold away. On a phone or a tablet, where there is no pointer to hover with, the arrow is simply always there.

**What being on the list does and does not give you:**

- You read that address, and you answer from it only if **Can reply as this address** was ticked beside your name. Reading and answering are two separate grants everywhere in this hub, and this is no exception.
- Their conversations join your **All** view and your search results, because you can genuinely open them. Nobody else's do.
- **Their Mentioned folder is read-only to you.** You can see what colleagues have asked them about, which is exactly the point when you are covering for them; you cannot mark it done or put it off until Thursday. Somebody else's list of jobs is theirs to work through.
- **Their Drafts folder is read-only to you too**, and for the same reason it is there at all: knowing what they have already half-answered is how you avoid answering it a second time. You can read the words; you cannot finish, change, send or throw away one of their drafts.
- It is one address, not a person. Being let into `sam@` does not let you into anything else of Sam's, and it does not follow them if the address is later handed to somebody else.
- **Untick the name and it is gone again**, immediately and completely - out of the rail, out of **All**, out of search.

Your own address never appears here. It is under **Yours**, at the top, where it always was.

**Next to it is the list**, with its own head: the search box first, then where a conversation stands - **Open**, **Snoozed**, **Done**, **All** - each with the number behind it and the total at the end of the row, then the narrower cuts behind the **filter button** beside the search box: unread only, ticked on and off, and the ones assigned to a particular colleague, on a list of their own with a box to find a name in. **In your own inbox that button is not a menu at all** - it is a switch: press it for the things you have not read, press it again for the lot. There is no assignee list there because the answer would be the same all the way down. Whatever you switch on gets a small tag under the tabs with a cross on it, so a filter you set last Tuesday is never quietly still on. All of that stays put while the conversations scroll underneath it, which it did not before.

**On a shared address there is one more tab, in front of the rest: Unassigned.** It is the open conversations nobody has picked up yet, with its own number beside it, and it empties as the morning is worked through - take one and it leaves the tab. It is deliberately only on addresses the team shares. Your own inbox is on your desk by definition, and across every address at once "has anybody taken this?" is a question with no one team behind it, so the tab is not offered in either place. Picking a colleague from the filter button while you are standing in the queue steps back out to **Open** rather than asking for two contradictory things at once and showing you nothing.

**Newest or oldest first.** The button beside the search box turns the list round. Newest first is the ordinary way to read an inbox; oldest first is how you clear a backlog, because working from the bottom means the top does not keep moving while you do it. It is remembered in the address like everything else here, so it can be sent to a colleague, and it goes back to normal on its own the next time you open the inbox fresh.

Each conversation is three lines - who it is from and whose desk it is on, what it is about, and how it begins - with the date at the top right. Unread ones are in bold with a dot beside the name. Two more things ride on a row: a **turned arrow** on the last line when the last word was yours, which answers "am I waiting on them, or are they waiting on me" without opening anything, and a **number** on the right when there is more than one message in it.

Opening a conversation, searching, writing a message and every other button on this screen now change only the part of the screen that changed. They used to fetch the whole page again, sidebar and all, which is why the inbox had a habit of blinking at you between clicks. The address in your browser still says exactly what you are looking at, so a view can still be sent to a colleague and the back button still behaves.

**To the right of the list is the reading pane**, where whatever you open lands: a conversation, somebody's page, a contact's card. It is always there, saying **Nothing open** until you pick something, rather than appearing and shoving the rest of the screen sideways. On a wide screen a fourth column joins it, carrying what the rest of your site knows about the person you are reading - their orders, their quotes, their invoices.

On a phone you see one at a time: the list, or the thing you opened from it, with **Back to the list** to return.

**The columns are yours to set.** Point at the line between the rail and the list, or between the list and the reading pane, and drag it. How wide a list wants to be is a question about the person reading it rather than about the screen: somebody working through a hundred a day wants a wide list and a narrow rail, and somebody reading long threads wants the opposite. Double-click a line to put it back where it started. You can also do it from the keyboard - tab to a line and use the arrow keys, with Shift for bigger steps and Home to reset it.

Your widths are remembered in your own browser, so they are yours rather than the site's and nobody else's screen changes. The reading pane always keeps enough room to read in, so the other two stop rather than squeezing it out. On a narrower window, where the rail has already lain down into a strip along the top, there are only two columns and no lines to drag.

**Closing one again.** There is a **×** at the top right of anything open, level with its title, which shuts it and gives the width back. On a phone the same link reads **Back to the list**, because there the list is not on the screen at all. The same goes for a person's page.

Junk is part of covering somebody too: what you throw away out of their inbox goes into their spam folder rather than yours, and their **Spam** folder sits under their name beside **Sent** and **Mentioned**. See [Junk, and turning a sender away](#junk-and-turning-a-sender-away).

### People's own pictures

By default everybody appears as a circle with their initials in it.

Plenty of people have published a picture of themselves against their email address at **Gravatar** or **Libravatar** - two long-standing services that do nothing else. Tick **Show people's own pictures beside their messages** on **Settings → Unified Inbox → People** and those pictures appear in place of the initials, on the list, on a contact's row, beside each message, and against your own name at the top of the rail. Nobody is asked to sign up for anything, and nothing changes for anyone who has not.

**It is off until you turn it on, and here is the trade.** To find out whether somebody has a picture, your site has to ask those two services about their address - so those services learn that you hold it. Three things are done to keep that as small as it can be:

- The address itself is never sent. Only a one-way scramble of it goes, which cannot be turned back into the address.
- The asking is done by your site, not by your browser. Gravatar and Libravatar never learn who on your team is reading their mail, or from where.
- The picture is then served from your own site, so nothing on the page points at anybody else.

Even so, it is somebody else being told something about your customer, which is why it is your decision rather than one that arrives with an update. If your customers' company runs its own picture service, that is asked first and the two big ones are never troubled at all.

Turn it off again and everybody is back to initials immediately, including on a page somebody left open.

**Working through several at once.** Rows are picked the way a mail program has picked them for thirty years: a plain click opens a conversation, cmd-click (ctrl on Windows) adds or removes one on its own, and shift-click picks everything between the last one and this one. Space and shift-space do the same for anybody on the keyboard. Pick a few and a bar appears above the list offering the things you would otherwise open each of them to do: **Mark as done**, **Mark as read**, **Mark as unread**, **Open again** and **Mark as spam**. Six mailing lists on a Monday morning is now two presses rather than twenty-four. Anything that will not change says so and the rest still go through.

Only the buttons that would actually change something are drawn. Pick six conversations you have already read and there is no **Mark as read** to press; pick six that are all open and there is no **Open again**. One out of six is enough to bring a button back, since that is exactly when you want it.

**Mark as spam** asks before it does anything. It tells you the lot are about to go into a spam folder - yours, or a colleague's where the address is their own rather than the team's - and asks whether you would also like to turn those senders away in future, listing them so you can see who. **No, just move them** does the move and leaves the front door alone. **Block them all** does both. **Cancel**, the cross in the corner and Escape all leave every one of them exactly where it is, which is what you want the moment a finger lands on the wrong button in a toolbar. Blocking means nothing further from them reaches an inbox on this site, shared or personal - it goes straight in the spam folder instead, so you can still see what they sent. Nothing already here is touched, and you can let anybody back in from the Spam folder or the inbox settings. The blocking half only appears for somebody allowed to answer messages, since shutting the front door changes what everybody on the site receives - and where there is nobody in the pile to turn away, or you are not the one who may, it asks the shorter question instead: move them, or cancel.

**Answering is on the message, not on the conversation.** Every message has a **reply arrow** at the right-hand end of its own header, beside the name and the time, and the writing box opens under it when you press it. Beside the arrow are three dots holding the rarer three: **Reply all**, **Forward** and **Mark as unread**. This is worth the change on a long thread: a single Reply button above nine messages could never say which of them you meant, and now the one you are looking at is the one you are answering. Press the arrow again to put the box away. If you left a draft on that conversation it opens with the box already up, so nothing half-written is out of sight. (Starting one from scratch is **Write a message**, above.)

**Internal notes have their own line at the bottom.** One box, always there as you scroll, in the same amber the notes themselves wear, saying on its face that nobody outside sees it. Type and press Enter. A note is not sent to anybody and deliberately does not bump the conversation or mark it unread: us talking among ourselves should not look like the customer writing again. **Type @ to ask a colleague.** The names open in a short menu above the line, one under another; the arrow keys move through it and Return or Tab takes one. You can also simply write the name out - **@Emma can you look at this** - and pressing Enter asks Emma, whether or not you went near the menu. The only thing it will not do is guess: a half-written name, or a name two of you share, is left for the menu to settle. See [Asking a colleague to look at something](#asking-a-colleague-to-look-at-something). For a longer note - something with a file on it - press a reply arrow and switch the box to **Internal note**, which still does everything it always did.

**Assign** sits on the subject's own line, between the alarm clock and the button saying where the conversation stands, and opens the list of colleagues to hand it to. Once it is with somebody it says so - *With Marcus* - and pressing it again hands it on or takes it back to nobody.

### Asking a colleague to look at something

**Type an @ in the note line**, pick the colleague out of the names that appear under it - keep typing to narrow them, or use the arrow keys and Return - write the rest of the sentence, and leave the note. Name as many as you like. That is the whole of it, and it is what everybody was doing anyway before anything was listening.

The name has to be **picked from the list** rather than merely typed: a Sam Smith and a Sam Smyth are not something the site should be guessing between when the answer hands somebody a job. Delete a name back out of the sentence before you leave the note and that colleague is not told.

What it does is worth knowing, because it is more than a nudge.

**It goes on their list, not yours.** The conversation appears under **Mentioned** for everybody you named. Each of them can set it aside until a day and time that suits, mark it done, and open it again later - and that is **theirs alone**. It does not touch where the conversation itself stands, which is deliberate: the conversation has one status shared by everybody who can read it, so if marking your own bit done also marked the conversation done, three people asked about one order would close it from under each other.

Something set aside comes back on its own when the time you picked arrives, exactly as a snoozed conversation does.

**It also lets them in.** Whoever you tag can read that conversation whether or not the address it sits in has ever been shared with them - so you can ask the warehouse about an invoice in `accounts@` without putting the warehouse on `accounts@`. Three things keep that narrow, and they are worth saying plainly:

- it is **that one conversation**, never the address it arrived at. Nothing else in that inbox opens;
- only somebody who could **already** open the conversation can hand it over, so nobody can let themselves into something by tagging a friend;
- it lets them **read and work through it**, not answer it. Sending as `accounts@` still needs permission to send from `accounts@`.

They do need permission to use the inbox screen at all. Tagging somebody who has never been given it tells them nothing, because there is nowhere for it to land.

**Asked twice is one job.** If somebody tags you again about a conversation you already have - a fortnight later, chasing - the one you already have comes back to the top with the new note against it, rather than a second copy appearing beside the first. Something you had already marked done reopens, which is rather the point of asking again.

Every ask is written into the conversation's own log, naming who was asked, so "who did we hand this to" has an answer a fortnight later.

**Where it stands is a button, not an instruction.** On the subject's own line, hard against the cross that shuts the conversation, there is one button reading **Open**, **Snoozed** or **Done** - whichever it actually is - with an arrow beside it. Press it and the other answers are there to pick. It used to say "Mark as done", which told you what pressing it would do but never told you where the conversation stood without reading the tag on the line above. Every change is recorded, so "who marked this done" has an answer.

**Marking one done offers to take it back.** For five seconds afterwards a small **Undo** sits at the bottom of the screen, and pressing it puts the conversation back exactly where it stood - open if it was open, and still asleep until Monday if that is what it was. Leave it alone and it fades away by itself. It is there because done takes the conversation off the list you were looking at, and finding one again meant knowing that **All** exists and which of the forty rows in it was yours.

**The alarm clock** - first of the three, at the far left of them - is the reminder. Three ready-made answers - in three hours, tomorrow morning, next week - each with the day and the time it actually lands on written beside it, so a promise is not something you have to make and then undo to check. The last entry, **Day & Time**, opens a month you can walk back and forth through with a date and a time under it: the morning somebody said they would ring back, the day after a delivery is due. It will not accept a time that has already been, and the times it means are your site's, not your laptop's - so nine o'clock booked from a hotel in Spain still means nine o'clock at the office.

**A reply cancels it, and the same goes for done.** Setting a conversation to come back on Thursday is a bet that nothing will happen before Thursday. Marking one done is the same bet with no end date: nothing more will happen at all. Either way, somebody writing on it settles the bet, so the conversation goes straight back under **Open**, unread, where you would have seen it anyway.

That covers the customer answering, and it covers a colleague answering them from their own phone or from Outlook rather than from here. Either way somebody is dealing with it now, and it should not be hidden.

**Done is the half that matters more**, which is not obvious. A snoozed conversation comes back on its own on Thursday whatever happens. A finished one never does - and the number on your address tabs counts open conversations, so a finished one is not in it. So before this, a customer replying to something you had finished with landed at the top of the **Done** tab, with no number anywhere to tell you, and stayed there. It is now back in Open with the rest of your morning.

Three things deliberately leave a conversation where it is. An out-of-office and a bounce, because that is the mail system talking rather than a person - which is also what stops a mailing list nobody has unsubscribed from dragging a finished conversation back into Open every week. An internal note, for the same reason it does not bump the conversation or mark it unread: us talking among ourselves is not the customer writing back. And your own reply sent from here, because you already knew you were answering.

When one comes back this way it says so in **What has been done to this** at the foot of the conversation, with the time, and it says which it was - stopped being snoozed, or opened again. A conversation turning up in Open on Tuesday when you asked for Thursday, or one you were sure you had finished with, is explained rather than mysterious.

### Finding something

There are two search boxes, and they are for two different jobs.

**The one in the head of the list** narrows what is in front of you. Type into it and the list you are looking at gets shorter. It is the right thing when you know roughly where the message is.

**The magnifier at the top of the rail**, beside the pen, is for when you do not. It opens over the whole inbox, and it starts by looking **everywhere you can read, at any status** - so something dealt with and filed three weeks ago in an address you never open is found rather than missed. Open it again while you are looking at the results and it keeps whatever you chose last time, so narrowing a search down takes one press rather than three. **Ctrl K** opens it from anywhere in the inbox, or **Cmd K** on a Mac.

Under the box are the narrower cuts, which are the ones a mail program has always had:

| Cut | What it does |
| --- | --- |
| **Where to look** | Everywhere you can see, one address, one channel, or the mail that landed nowhere. |
| **Where it stands** | Any status, or only the open, set-aside or dealt-with ones. |
| **From** | Part of a name or an address the message came from. |
| **To** | Anybody it was sent to - or copied to, which is usually the point. |
| **Subject** | Words in the subject line. |
| **Since** and **Up to and including** | Two dates. Both days count, in your site's own time. |
| **Has something attached** | Only the conversations carrying a file. |
| **Nobody has read it** | Only the unread ones. |

You can also search **Contacts** from the same box, which looks through the address book instead. That one takes the words and nothing else - who a message came from, and when, are questions about post.

**Press Search and it lands on a screen of its own.** The same box sits across the top of the results and whatever you open from them, with all of the cuts above laid out under it, so what you asked for is in front of you rather than behind a magnifier you have to open again to remember it by. Change any of them there: the menus and the tickboxes take effect as you pick them, and words wait for Enter. The button beside the box turns the results round, newest first or oldest first, and the cross at the end leaves the search and puts you back on the list with nothing narrowing it.

While a search is up, the list underneath is the results and nothing else - the ordinary search box and the Open, Snoozed, Done and All tabs come off, because everything they do is in the head above. Anything the search was handed to a particular colleague by is let go of as well: **Assigned to me** is a place in the rail rather than a cut a search can make, and one quietly still on would be narrowing your results with nothing saying so.

The address in your browser holds the lot, so a search can be sent to a colleague and the back button behaves - including back out of the search itself.

Search covers subjects, senders and the text of messages, and it only ever searches the inboxes you are allowed to read.

### Merging conversations into one

Sometimes one conversation arrives as two. Somebody writes from their work address on Monday and their phone on Thursday. A supplier changes the subject line and their mail program forgets what it was replying to. A colleague forwards something in and now there are three of it. And an email between two of your own addresses is deliberately kept as two conversations - one for each of you, each with its own unread mark and its own snooze - which is right until the day you decide that this particular back and forth is one story with four people in it.

**Pick the conversations and press Merge.** Hold cmd (ctrl on Windows) and click to pick more than one, or click the first and shift-click the last, then press **Merge** in the bar that appears at the top of the list. It is there for anybody who can manage inboxes.

The conversation you already have open counts as one of them. Reading something and ctrl-clicking a second conversation gives you two picked, not one, which is what the highlight on the open row has always suggested - so the pair you are looking at is a merge without any further ceremony. Ctrl-click the open one again if you did not mean to include it.

Everything folds into **the conversation that started it** - the oldest of the ones you picked. It keeps that one's subject and its place in the list, and every message from the others joins it in date order, so the merged conversation reads as the one story it always was.

A few things worth knowing before you press it:

- **Nothing is thrown away, and you can put it back.** Open the merged conversation, open **What has been done to this** at the foot of it, and the line recording the merge - *Chris merged it with another*, with the date - has **Unmerge** on the end of it. Anything that arrived *after* the merge stays where it is, because it arrived on the merged conversation rather than on the old one. It used to be a panel across the top of every merged conversation for ever, saying the same thing to everybody who opened it.
- **A merged conversation is still unanswered if any half of it was.** Merging something you had marked done into something you had not does not quietly mark the lot done, and an unread half stays unread. Better to be shown something twice than to lose it off the list.
- **Merging across two of your addresses lets both of them read it.** This is the point of merging marcus@ and hi@ together, and it is also the thing to think about first: everybody who can read either address can then read the whole of the merged conversation, including the half that arrived on the other one. The confirmation says so, and names the addresses, before anything happens. See [Who can see what](#who-can-see-what).
- **It shows in both addresses' tabs afterwards**, with the second address named in the line under the subject, and it stays merged when somebody replies. Without that last part the two sides would come apart again on the very next email.
- **You cannot merge into something that has itself been merged away.** Undo that one first, or merge into the conversation it became.

Merging *conversations* and merging *people* are two different jobs. If the same human has turned up twice in the address book, that is a merge on their card - see [People, and how conversations collapse](#people-and-how-conversations-collapse).

### Junk, and turning a sender away

Every conversation has a **waste basket** at the top of it, on the left of the little alarm clock. Press it and you are asked before anything moves; answer, and the conversation goes into a **Spam** folder - whose, depending on where it came from.

**On a shared address, it goes in yours.** Nobody else's screen changes at all. What one person files as junk is the supplier newsletter a colleague reads every Tuesday, and on an address like `sales@` there are several people with several opinions - so the button records yours and leaves everybody else's list exactly as it was.

**On a colleague's own address, it goes in theirs.** If you have been let in to somebody's own inbox to cover their post while they are away, junk you clear out of it lands in **their** spam folder rather than yours. That is the honest answer twice over: it is their post, and your own spam folder has no business filling up with a fortnight of somebody else's rubbish. The button says so before you press it, and the question that follows says it again - "it will go into Sam's spam folder".

It also leaves *your* view of their inbox, which is rather the point of covering somebody: you are trying to see what they would see, and post they have already binned is post you should not be working through.

You can look in their bin, and take something back out of it, under their name on the rail - **Spam** sits there beside their **Sent** and **Mentioned**. So a mis-click while covering is a mis-click you can fix.

**Nothing is deleted.** The conversation keeps every message in it. Open the spam folder, press the same button again, and it goes straight back where it was.

**The press asks before it moves anything.** Where there is a sender who could be turned away, pressing the basket puts up a second question - **would you like to block them as well?** - and nothing has happened yet when it appears. There are three answers:

- **No, just move it** is the ordinary one. The conversation goes into the spam folder and the front door stays open.
- **Block them** does the move *and* shuts the site's front door on that address. Nothing further from them reaches *any* inbox on this site - the shared ones, every colleague's own, and the ones nobody has opened in months. It is one list for the whole site, because a block that only covered the address you happened to be standing in is no block at all: they would simply write to `hello@` instead and turn up in somebody else's list an hour later.
- **Cancel**, the cross in the top corner, Escape and a click on the background all mean the same thing: you did not mean to press it. Nothing moves and nobody is blocked.

The two decisions are deliberately kept apart. Throwing one message away is a small decision about your own screen; refusing somebody in future is a decision about the whole business, and it should not happen by accident on the way past. The cross is there for the same reason in the other direction - the junk button sits next to the buttons you press all day, and a mis-press should cost you one click rather than a hunt through the bin.

Where there is nobody to block - a conversation between colleagues, a caller who withheld their number, a sender already turned away, or you not being allowed to shut the front door - the question is a shorter one: **Move it to the spam folder?**, with **Move it to spam** and **Cancel**. The way out is there either way, because that is the half of it a mis-press needs.

#### Where blocked post goes

**Straight into the Spam folder, and nowhere else.** Post from a blocked address is still collected - it is just dropped in the bin the moment it arrives, **marked as dealt with** so it is out of everybody's way, and left **unread** so the folder can tell you how much of it there is. It never appears in an inbox, never adds to an address's number, never nudges anybody's browser and is never handed to a colleague as a job.

It is in the bin for **everybody**, which is the one thing on this screen that is not a matter of opinion. Junk you mark yourself is your own view of one conversation; a block is a decision about the site, so the post it turns away is out of everybody's lists and in everybody's Spam folder.

**Why collect it at all?** Because "did they ever actually write?" is a question somebody asks eventually, usually the week a customer rings up cross about being ignored - and until now the only way to answer it was to go and log into the mailbox yourself. A nuisance is a nuisance either way and you never have to look; somebody blocked in a temper turns out to have written four times, and now you can see that.

**Blocking never deletes anything either.** Their old conversations stay exactly where they are - often that history is the whole reason you want them stopped.

**If one of them turns out to be real**, open it in the Spam folder and press the same junk button at the top of it. That takes the conversation out of the bin for everybody and puts it back in the ordinary lists. The sender stays blocked: letting one conversation through and opening the front door again are two different decisions, and they are two different buttons.

#### Who is blocked, and letting them back in

There are two ways to the list, and it is the same list either way:

- **The Spam folder itself.** In the head of the list, between the search box and the filters, there is a button that opens **Blocked addresses**. Newest block first, since the one you are hunting for is nearly always the one somebody made this week.
- **Settings → Unified Inbox → Collecting**, under **Blocked senders** - the way to it that does not need the inbox open at all.

Both list every address the site refuses, who blocked it and when. Press **Let them through** and their post arrives normally again from the next round onwards. What was collected while the door was shut stays in the Spam folder until somebody takes it out, one conversation at a time.

You need permission to reply in order to block somebody or to let them back in, since it changes what everybody receives. Seeing the list needs the same permission as the rest of the inbox settings, so the button in the Spam folder only appears for somebody who has that. Marking something as junk yourself only needs permission to read, because it only changes your own screen.

### The order the list is in

Newest at the top, as you would expect. What counts as newest is **the later of when the message was written and when it reached you** - and those are not always the same day.

Move an email into one of the folders the site watches and it is dated whenever the sender wrote it, which may have been last Tuesday. It is collected on the next check, lands in the right conversation, and would otherwise sit exactly where last Tuesday puts it - halfway down the list, under a subject line about something else, with nothing on the screen moving. Conversations that get post this way come to the top instead, where you can see them.

Nothing else moves. A conversation that has never had anything filed into it by hand sits where the date on its newest message puts it, exactly as it always did, and once a genuinely newer message arrives the conversation goes back to being ordered on that.

### Which way round a conversation reads

By default a conversation reads the way it happened: the first message at the top, the latest at the bottom, and the writing box - once you have asked for it - under the lot.

Reading that way round, opening a conversation takes you straight to the part worth reading rather than to the beginning of it: the message that came in while it was still unread, or - if you had already read the lot - whatever was said last, an internal note included. A thread with forty messages in it therefore opens on the one that has just arrived, not four thousand pixels above it. Scroll and it leaves you where you put it.

Tick **Show the newest message at the top of a conversation** on **Settings → Unified Inbox → Collecting** and it turns round - the latest message is the first thing you see when you open one, and the writing box moves up with it so the reply sits beside the thing you are replying to. Handy on a long back and forth where the only part anybody needs is the end of it.

It is a site setting rather than a personal one, so everybody reads the same way round.

### Putting the rail in your own order

Most sites end up with one inbox they live in and two or three they glance at, and alphabetical order has no opinion about which is which. **Drag a row up or down and it stays there.** It saves as you drop it - there is nothing to press afterwards.

All four groups can be rearranged: **Yours**, **Shared inboxes**, **Team inboxes** and **Channels**. Each keeps to itself, because an order only means anything against the other things in the same list - a live chat sitting in the middle of your email addresses would be nobody's idea of tidy.

Nothing announces any of this while you are simply running your eye down the rail. It is a list of places to go and it behaves like one; take hold of a row and the pointer closes into a hand, which is the moment it starts mattering.

If you would rather not use a mouse for it, put the keyboard focus on a row, hold **Alt** and press the up or down arrow keys.

**Yours is yours, and the other three are the site's.** The order of **Yours** - your own address, **All**, **Mentioned**, **Drafts**, **Scheduled**, **Sent**, **Spam** - is saved against you and seen by nobody else, so it needs no permission at all: somebody who lives in **Sent** can put it second, and everybody else's rail carries on exactly as it was. The other three are one arrangement that everybody who opens the inbox sees, which is why only people who can manage inboxes can change them. If you can read the inbox but not manage it, those three sit where whoever looks after the site has put them and do not drag; **Yours** still does.

One quiet detail about the channels: you can only rearrange the ones you can see, and what somebody may see is decided by the module each channel belongs to. Move the two you have and the ones you do not stay exactly where they were for the colleagues who do.

### Giving somebody an inbox of their own

Most people on a site live in one address. Somebody who does purchasing wants `purchasing@` in front of them the moment they open the inbox, not a list of everything the company has ever been sent.

This is about a **shared** address you want somebody to open on. An individual inbox is already theirs and does all of the below on its own - see "Shared and individual inboxes" above.

**Settings → Unified Inbox → Inboxes → Edit an inbox → Who can read it.** Beside each name there is **Their own inbox**. Tick it and, for that person only:

- the address sits at the top of the rail under **Yours**, ahead of **All**, and comes out of **Team inboxes**;
- it is what they land on when they open the inbox, instead of **All**;
- everything handed to them shows in it, wherever it was filed - see "The screen" above;
- its signature goes at the foot of their replies, whichever address they are answering from.

**All** does not go anywhere - it moves down one, to second - and the rest of the addresses follow in the usual order. Everybody else's rail is exactly as it was: this is one person's arrangement, not the site's, so it does not shuffle the rail for anybody else and it does not affect the order you have dragged the addresses into.

**One address each.** Ticking the box on a second inbox moves the person there rather than giving them two; the screen says whose address it currently is before you do it. Untick it and they go back to opening on **All**, which is where everybody starts.

You can only give somebody an address they can actually read, so if the inbox has a guest list, they need to be on it. Take them off it later and they quietly go back to **All** rather than landing on a tab that will not open.

### Reading email safely

A message someone else wrote is shown inside its own sealed frame, on a light background in both light and dark mode. It takes up as much room as the message actually needs - a two-line reply is two lines, a long newsletter is as long as it is, and neither has a scrollbar of its own inside the page's. Messages that kept one anyway were losing a fraction of a pixel in the measuring: a message a hair over five hundred pixels tall was given exactly five hundred, and the hair left over was a scrollbar over the whole thing. The frame is now measured to the fraction, rounded up rather than down, and given a couple of pixels of room to spare. A message written wider than the column you are reading it in is shrunk until the whole of it fits, the way a phone shows a desktop-width email, rather than being given a scrollbar along the bottom that hides half of it. The whole message is on the page and the page scrolls it, which is rather the point. A message that will not say how big it is gets a generous height rather than the letterbox it used to get. The sender chose their colours assuming a white page, and repainting the background dark while leaving their text alone is how a message ends up black on black. The rest of the screen follows your theme as usual. Marketing email is nearly always built out of tables, and a table gives each column the width its contents insist on. The frame used to tell every message that a word could break anywhere it liked, which quietly told those columns that nothing insisted on anything - so in Safari a button could come out at a quarter of its proper width with its own label running off the side in white on a white page, reading "View" where it should have said "View in WhatsApp Manager". Nothing looked broken, it just said the wrong thing. That is sorted, and a long unbroken web address still wraps rather than sticking out. Sites sat behind a content network need one extra thing from it: Cloudflare will happily rewrite the frame on its way out, swapping every address in a message for the words "[email protected]" and shuffling the frame's own script into something no browser will run, which left messages stuck at their opening size with the layout cut about. The frame now tells Cloudflare to leave it alone, and it clips nothing at all until it has actually scaled a message to fit - so if anything ever does stop that script, the message spills over and can still be read rather than quietly losing its right-hand side.

**Pictures hosted elsewhere are not loaded until you ask.** Press **Show pictures** and they are fetched by the site rather than by your browser, so a marketing email learns nothing about you, your location or when you opened it. Links open in a new tab.

**Pictures that came inside the message are simply shown.** A signature logo written in Outlook, a screenshot pasted into the middle of a sentence, the artwork on a quote: none of those are kept on a website anywhere, they arrive as part of the message itself. They now appear as the sender meant them to, with no button to press - nothing is fetched from anybody's server to show one, so there is nothing to be careful about. They used to come out as empty boxes, under a note cheerfully explaining that anything carried inside the message was already there. It was not.

Post that arrived before this was fixed is included as far as it can be. Older messages were filed without the name the picture is referred to by, so those are matched on the filename instead - which is what Outlook and Apple Mail use anyway, so most of them come back. A few will keep their empty space, and nothing short of collecting the message again would fill it.

**Your own post is never held back.** Anything you sent, an internal note, and anything arriving from one of your own addresses, a colleague, or your own domain opens with its pictures already there. The warning is about what a stranger learns when your browser fetches their tracking pixel, and there is no stranger in your own signature - being asked about it on every reply you ever sent only taught people to press the button without reading it.

**Reading your own Sent post no longer counts as the customer reading it.** Brevo adds an invisible counter to every message it sends for you, and the copy that comes back into your Sent folder still has it in. Because your own post opens with its pictures already showing, glancing at what you sent on Tuesday used to fetch that counter - and *Opened 11:32* would appear under your own message, with the open count in Brevo's reports going up to match. The customer had not touched it. You had. That one picture is now left alone, wherever it turns up and whoever asks: it is a transparent dot nobody can see, so nothing on the screen changes and the figures are finally about the person you sent it to.

Once you have pressed it for a message, that message keeps its pictures. Go off to something else, come back to it a fortnight later, and it opens with them already there rather than asking again - the sender found out the first time, and there is nothing left to protect by making you click twice. It is remembered by the browser you pressed it in, so a different computer starts the message the careful way round. The five hundred most recent are held; older ones quietly drop off the end.

**Attachments are fetched when somebody opens one**, not while collecting, and they are kept where only this module can reach them. They never appear in your media library or in the picker when you are building a page, which is deliberate: an invoice pulled out of `accounts@` has no business turning up in front of everybody who can edit a page.

There is a setting called **Fetch everything as it arrives**. It currently behaves the same as fetching one when somebody opens it. Pulling every attachment on a busy account through the hourly check needs a budget and a storage conversation of its own, so it is honestly a setting that does not do anything yet rather than one that does it badly.

---

## The other channels

Install the [live chat](Live-Chat), [contact form](Contact-form) or [Twilio](Twilio) modules alongside this one and their conversations appear here too, under **Other channels**.

One module can bring more than one channel. Twilio brings two: **Phone** for calls, voicemail and texts, and **WhatsApp** on its own. They are separate because they are separate things to answer - WhatsApp will only carry an ordinary message for 24 hours after somebody last wrote, and the phone has no such rule - and each has its own switch under **Channels**.

**A conversation that changes after it arrives.** Most messages are said once and never altered. A few are not: a voicemail, or a recorded call on a Twilio number set to type up its calls, reaches the hub as a message with a Listen button and no words, because the writing out takes a few minutes and the check runs on the hour. When the words do arrive they are added to that same message rather than filed as a new one, and the conversation stays where it is in your list - nothing new was said, it merely became readable. So a call you looked at this morning may have words under it this afternoon.

When Unified Inbox is installed, **this is where those messages are answered**. The contact form's own inbox tab and the live chat's own inbox tab stand down, because having two places to answer the same enquiry is how one of them stops being read. Each module keeps everything else it does: the chat widget, the form block, the phone numbers, its own settings. Uninstall Unified Inbox and their tabs come straight back, with nothing lost.

A colleague who is allowed to see the contact form but not this hub keeps their own tab. Nobody is locked out of their own messages.

### Sending a form's enquiries to one of your inboxes

A contact form can name the inbox its enquiries belong in. Edit the page, open the **Contact Form** block, and pick one under **Deliver enquiries to**.

From then on an enquiry from that form is ordinary post in that inbox. It sits in the list with the emails, it counts towards that inbox's number, and whoever is allowed to read that inbox is allowed to read it - which is worth reading twice, because it is the whole rule. Point a form at an inbox only two people can open, and only those two see what comes in on it.

It also stops appearing under **Other channels**, because it is in an inbox now and one thing should be in one place. Enquiries from forms that name no inbox stay where they always were.

Whichever inbox it lands in, the conversation says which form it came from - the form's own title, on the line under the buttons where attached orders and quotes sit. It is not something anybody attached, so it does not open anything and it cannot be taken off: it is what the conversation is.

**Once you have read one, it stays read.** Reading an enquiry here now tells the contact form so, which is what stops the next collection finding an enquiry the form still thinks nobody has looked at and turning it bold again. If a channel cannot be told - or will not listen - it no longer matters: nothing goes back to unread unless a genuinely newer message has arrived on it. Somebody writing again still does exactly what it always did.

Moving one afterwards is allowed and it stays moved. Nothing drags it back to where the form says it should be.

### Switching a channel off

**Settings → Unified Inbox → Channels** lists the channels this site has, with a switch each. Turn one off and it stops appearing down the left, stops being counted and stops turning up in **All**.

It is worth having once your forms are pointed at real inboxes: a **Contact form** heading listing the same enquiries a second time is a second place to look for the same thing. Nothing is thrown away - the conversations are still collected, so switching it back on brings back everything that arrived in the meantime.

The one catch, and it is on the screen too: an enquiry from a form that names no inbox has nowhere else to be seen, so it will not be shown at all while its channel is off.

An enquiry that does name an inbox carries on as normal in that inbox, and you answer it there exactly as you would with the channel switched on - the reply still goes back out through the form, with your signature on it. Switching a channel off tidies the left-hand side; it never takes the Reply button off a conversation you can still see.

Three things worth knowing:

- **A reply on one of these goes back the way it came**, so the writing box asks nothing about where it is going: instead of the To, Cc, Bcc and Subject lines an email opens with, one line above the words says who is about to receive it and on which channel. There is nothing to type there because there is nothing to choose - a WhatsApp message goes back to the number it came from, an enquiry to the address on the enquiry. The box also drops what the channel cannot carry: no paperclip, and no **Forward**, because there is nowhere to forward one to. Email is untouched and keeps the whole box.
- **You still get the formatting the channel actually has.** WhatsApp has bold, italic and strikethrough - it writes them with a marker either side of the words rather than with a typeface - so a WhatsApp reply gets those three of the seven, and what you type in bold arrives in bold. What it does not get is the four that mean nothing at the far end: colour, a link with its own wording, and the two kinds of list. A channel with no formatting of its own, like a text message, gets no buttons at all rather than a row of them whose work would be thrown away between here and the customer.
- **Replying to a chat uses your own chat account.** If you have not connected yours yet, the reply is refused with a line telling you so and where to fix it, rather than going out under somebody else's name.
- **A phone conversation is one outside number**, not one call. Every call, voicemail and text with that number is one story, which is the whole point. Calls that were forwarded to somebody's mobile, and calls placed with **Make a call**, count as one call apiece and belong to the customer - your own mobile never turns up in the list as though it were a customer of yours.
- **Text messages appear when the hourly check runs**, not the instant they arrive. There is no live feed of incoming texts in this version.
- **A voicemail message can be thrown away** from the conversation it sits in: a **Delete** button under the message, which asks first and then removes it from the phone system as well as from here. Only the messages people leave - the log of a call, and a text, are kept by the phone system itself and this will say so rather than pretending.
- **A WhatsApp reply has a clock on it.** WhatsApp only lets a business write freely for 24 hours after the customer's last message; after that Meta takes nothing but wording it has approved in advance. Reply here after the window has closed and you are told so plainly, rather than being shown a sent message the customer never gets. The approved wording is sent from **Settings → Twilio → WhatsApp**, which is also where you add it. See [WhatsApp](Twilio#whatsapp).
- **A caller can be blocked** from the top of their conversation, if the channel they came in on can do it. On the phone that means their next call is dropped the moment it arrives: nobody's phone rings, no message is taken and no alert goes out. It does not delete anything they have already said - that is a separate decision, taken message by message - and **Unblock** is one press away. See [Blocking a caller](Twilio#blocking-a-caller).

---

## People, and how conversations collapse

An address, a phone number or a chat account belongs to a person, and a person can have several of each. Somebody who emailed in March and rang in April is one person with one history rather than two strangers.

Organisations are guessed from the email domain, with the usual free providers left well alone: nobody's gmail.com address turns Gmail into one of your customers.

Some things worth saying plainly:

- **A role address is one person.** `accounts@supplier.com` might be four people in real life, and here it is one. That is by design; splitting it would mean guessing.
- **Your own people never become customers.** Your inboxes, your staff's own addresses and anything at your own domains are excluded. If it guesses your domains wrongly, set them yourself under **People → Your own domains**.
- **There is a directory now**, under the **Contacts** tab, and it was left out of earlier versions on purpose - an address book is where a conversation hub turns into a CRM by accident. What it holds is names, numbers and where to post something. There is no stage, no value, no next action and no forecast, and there is not going to be. See [Contacts](#contacts) below.
- People can be **merged** when the same human turns up twice, and a merge can be put back afterwards. A person can be **split** apart again if two people got folded into one.
- **Conversations** can be merged too, which is a different job from merging people: one is "these two threads are the same story", the other is "these two cards are the same human". See [Merging conversations into one](#merging-conversations-into-one).

---

## Contacts

The **Contacts** tab is the address book. It is the same people the section above describes, listed instead of waited for.

Everybody who writes in is already in it. What is new is that you can now write things down about them, and add somebody who has never written at all.

### What a contact holds

A first name and a last name, separately, so the list sorts by surname the way an address book does. Then a job title, the organisation they work for, any number of [categories](#categories), as many email addresses and phone numbers as they actually use, a website, a postal address in the usual British parts - address, town, county, postcode, country - and a note.

Somebody the post introduced us to may only ever have had one name, read off the From line. Opening their card splits it into the two boxes for you, so **Jane Smith** arrives as Jane and Smith and you can correct it if the guess was wrong.

**Phone numbers are not just text.** A number typed onto a card is a number the site recognises: when that person telephones, the call lands on their record rather than starting a stranger.

**One address belongs to one person.** If you type in an address that somebody else here already has, it stays with them and the card tells you so, rather than quietly moving it. Two people holding one mailbox is a merge for you to decide on - see the section above.

### Organisations

The second half of the tab. Most appear on their own, one per company that writes in from its own domain. Each has a card with a name, a mail domain, an address, a phone number, a website and a note, and says how many contacts are in it - which is what makes **Acme Ltd** with fourteen contacts and **Acme Limited** with one obvious enough to tidy up.

You can add one yourself, which is the only way the haulier who only ever telephones is going to be in there. Leave the mail domain blank for a company that never emails; fill it in and the next person who writes in from that domain joins them automatically.

**Removing an organisation keeps everybody in it.** They keep their own records and simply stop showing the name. A contact is not the company they work for, and no conversation, order or invoice is touched.

### Categories

The labels you file contacts under: **Supplier**, **Trade customer**, **Haulier**, **Do not ring** - whatever suits how you actually work. A row of them sits above the list, and pressing one narrows the list to it. Pressing it again takes the filter off.

A contact can be in several at once, on purpose. Somebody can genuinely be a supplier and a customer, and a field that only allows one would have you picking which of two true things to record.

**You make a category by using it.** Open a contact, press **Edit their details**, and the Categories line offers everything the site already has as ticks, plus **New category** for one that does not exist yet. Nothing is saved until you save the card, so a label typed onto a contact you then abandon does not leave a category behind.

**Renaming and removing** them is under **Settings → Unified Inbox → People**, along with the order they appear in and how many contacts are in each - which is what makes an empty one worth removing and a typo worth renaming. **Removing a category keeps everybody who was in it.** They keep their records and simply stop showing the label.

One thing said plainly, because it is the line this feature must not cross: **a category is not a stage.** Nothing moves between them on its own, nothing else on the site reads them, and there is no order to them beyond the one you drag them into. It is the label on the drawer, not a sales process.

### Adding one by hand

**New contact**, at the right-hand end of the Contacts row. Fill in what you know - a phone number on its own is a perfectly good contact - and save. Anybody who can reply to the post can do this; you do not have to look after the site.

### Bringing an address book in from a file

**Import a file**, beside it. This one is for whoever looks after the site: two thousand contacts in one press is a wider thing than correcting one of them.

Three steps.

1. **Choose the file.** A CSV, saved out of a spreadsheet or exported from wherever your contacts are now. There is a blank one to download if you would rather start from ours.
2. **Match the columns.** Every column in your file is listed with its best guess at what it is - and it has seen what Outlook, Google Contacts and most accounts packages call things, so an ordinary export usually needs nothing changed. Change anything that looks wrong, and set anything you do not want to **Leave this column out**. A single **Name** column is understood and split into first and last, and a **Category**, **Group**, **Type** or **Tags** column is understood as categories - several to a cell if they are separated by commas, semicolons or pipes.
3. **Check and bring them in.** The first five rows are shown as they would actually be saved, so a column in the wrong place is visible before rather than after. There is also a **Category** box here for putting *everybody* in the file into one, for when what four hundred contacts have in common is the file rather than anything written in it - it goes on top of whatever a category column says, never instead of it. Then press the button.

Three things it does that are worth knowing:

- **Somebody already here is left exactly as they are**, unless you tick **Fill in contacts already here**. Off is the safe answer: a file with half its columns blank would otherwise blank those fields for everybody in it. Running the same import twice with it off changes nothing the second time.
- **One company named a thousand times is one organisation.** Names are matched however they are typed, so `Acme Ltd` and `acme ltd` do not become two.
- **An import only ever adds a category, never takes one off.** A sheet saying "Supplier" is telling you one thing about somebody, not the whole of what they are, so anybody already labelled keeps what they had. And "Supplier" and "supplier" are one category rather than two.
- **A row that will not go in is reported by its row number**, the same number your spreadsheet shows down the left, along with what was wrong with it. The rest still go in.

- **A big file goes up in pieces**, a few hundred rows at a time, and the button counts them off as it goes. That is why a long import no longer stops halfway with a message about the file being unreadable: it never was, there was simply too much of it to send in one go. If something does stop it partway, the contacts already brought in stay in - bring the rest in on their own rather than running the whole file again.
- **If a row is refused, it says which row and which column** - "row 414, column H" - rather than telling you the file could not be read and leaving you to find it.

Five thousand rows at a time is the limit. Split a bigger file and bring it in in two goes.

**The file never leaves your computer.** It is read in your browser so the matching step has something to show you, and only the rows you can see are sent to the site. There is no copy of your address book sitting in storage afterwards, which is rather the point.

---

## Links in a message

Pressing a link in somebody's email does not follow it. It opens a small panel first, showing where that link actually goes: the site it lands on, the whole address written out, and - when the two are not the same thing - what the link said versus where it points.

That gap is the entire mechanism of every phishing email ever sent. "View your invoice" over an address in another country looks exactly like "View your invoice", and a mail program that follows the press without showing you where you are going is helping. From the panel you can **open it in a new tab**, **copy the address** to paste somewhere that checks it, or **close** and go no further. Nothing loads until you choose.

Addresses in plain-text messages are links now too - they used to be text you could not press at all. Anything that is not an ordinary web or email address is shown and refused: the panel tells you what it is, and will not open it.

The panel also says when an address is not the real one. With link tracking switched on, Brevo replaces every link in what you send with one that goes to Brevo first, writes down that it was followed, and then passes you on - so opening one out of your own Sent folder is recorded as the person you wrote to having clicked it. The panel now says so before you press anything. It still opens if you want it to; you simply know what it costs.

Holding cmd (or ctrl) while you press still opens a link straight away in a new tab, the way it does everywhere else.

## Campaigns

The same email to a great many people, one at a time, slowly, from an address that is already a real mailbox on this site.

That last part is the whole idea. This is not a newsletter service and it is not trying to be one: no template gallery, no rented sending domain, no branded footer with a picture in it. It is the same composer you already use, pointed at a list from your address book, with a clock in front of it - one message every ninety seconds inside working hours, so two thousand emails leave looking like two thousand emails a person sent rather than one burst a filtering service is paid to notice.

You will find it as **Campaigns** in the rail down the left of the hub, under **Everything else**, next to Contacts. It has its own permission, so somebody who can answer the post is not automatically somebody who can write to five thousand customers.

### The screen

It is laid out exactly like your post: every campaign down the middle column with its own progress stripe, and the one you have opened in the pane beside it. Picking another is one press and you keep your place, so glancing at what a second campaign is doing no longer costs you the one you were writing. The edges between the three columns drag, and they are the same edges you have already dragged in the inbox.

On a phone there is only room for one at a time, so you get the list, and then the campaign you opened from it with **All campaigns** to get back - the same as opening a conversation.

### Writing one

One page, top to bottom, in the order you would think about it, with **one Save button** at the bottom of the pane. It stays put as you scroll and it saves the whole thing, so there is never a question about which button saved which half. The name is at the top, typed where you read it.

**Nothing you type is thrown away by something else happening.** Topping the list up, pausing it, stopping it, pressing Send now beside somebody, or a colleague saving the same campaign from another tab used to empty every box back to the last saved version - half-written follow-ups included. Now what you have typed stays where it is, a line appears saying the campaign has changed underneath you, and Save keeps your version. Two things do snap back to the saved copy, and only if the campaign STARTS while you are typing: who it goes to, and the wording of the first message. Those are locked from that moment, so keeping your edit would leave you with a form that could not be saved and a greyed-out box you could not put back. If you try to leave a campaign with something unsaved in it - clicking another campaign, the Do-not-email list, or closing the tab - you are asked first.

**Save is there on every campaign, finished ones included.** Two things lock once the first message has gone - who it goes to, and the wording of that first message, because some people have already had it and two versions of one mailshot with no way to tell who got which helps nobody. Everything else stays yours to change: the name, the follow-ups, the clock. (Previously a finished campaign had no Save button at all, while its boxes still let you type - so the changes went nowhere.)

**Who it goes to** - the address it comes from, and which of your contacts get it. Pick one or more of the labels from your address book, or none of them for everybody. It counts them for you as you go, and it tells you who is being left out and why: people who have unsubscribed, addresses that have bounced, colleagues at your own domain, anybody another campaign wrote to in the last week, two contacts sharing one address. **Saving is what writes the list down** - there is no second button to press - and once it is written it is fixed, because a list that changes every time somebody imports a spreadsheet is a list whose finish date moves. **Top up** later adds anybody who has appeared since and leaves everybody already on it alone.

**What it says** - the subject and the message. Write it as you would write an email, because it is one. Somebody's name goes in with `{{first_name|there}}` - the bit after the bar is what anybody with no first name on their record gets, so nobody receives "Hello ,". There are five of these: first name, surname, whole name, company and their email address, and there is a row of buttons that types them for you. It will show you how the message reads for three real people off your own list, chosen so that the one with no first name is first. You can turn the signature off for this campaign, and you can send yourself a test - which you have to, before it will start.

**When it goes** - the clock, and it is two things rather than fifteen. First, when not to begin before, if you care. Then **one sentence telling you what the pace actually comes to**: *"About 320 a day, at any hour, any day of the week, 90 seconds apart"*, with roughly when it will finish underneath. That sentence is the answer, so most people read it and move on.

Everything behind it is under **Change the pace, the hours or the days**: sending hours, weekdays only, days to sit out entirely - weekdays-only still sends on Christmas Day - the gap between messages, how much to vary it, a daily ceiling, and a warm-up that starts small and doubles, worth switching on if this mailbox normally sends a handful a day and is about to send three hundred. **Every box in there can be left empty, and each one tells you what empty means.** No hours set means any hour of the day and night. Nothing is filled in for you, because a time you did not type is a decision somebody else made on your behalf.

**Before it can go** - the checklist, underneath the form. Anything with a cross by it stops the campaign; anything with an exclamation mark is a warning you can read and press past. **Start sending appears once there is nothing left to fix**, and if you have typed something since your last save it saves that first - one press, not two. It used to disappear the moment you touched anything, which is exactly when you had just finished writing. Leaving the sending hours empty is one of those warnings: perfectly reasonable for a reminder, less so for a mailshot that lands at three in the morning on a Sunday.

**Where everybody has got to** - at the foot of the same page, as soon as there is a list to look at: everybody on the campaign and where they have got to, filterable. Who has had it, who replied, who bounced, who unsubscribed, and who was left out with the reason written beside them. Anybody still waiting has a **Send now** beside them, for when you do not want to wait for the clock - it skips the hours and the gap, not the checks, and it will not go out of a campaign that has never been started. (This used to be a separate screen behind a **Progress** button, which meant reading what went out and reading what it said were two places with a toggle between them. It is one page now, so the button and its **Back to the wording** twin are both gone.)

### Follow-ups

A campaign can carry up to three follow-ups, each with its own wait and its own wording. They only go to people who have said nothing: a reply from any address you hold for that person stands the chase down, and so does a bounce or an unsubscribe. An out-of-office does not - a fortnight in Spain is not an answer.

A follow-up with no subject of its own goes out as a reply to the first message, so it lands in the same conversation in their mail program rather than arriving as a stranger asking whether they saw the last one. That is usually what you want.

**Taking a follow-up out of a campaign that has already started leaves a gap in the numbering, on purpose.** Everybody still waiting is waiting for a follow-up *by number*: shuffle the rest up and the people queued for the second one quietly receive the third instead. So the ones after it keep their numbers, anybody who was waiting for the one you removed is simply finished, and nobody gets the wrong email. On a campaign that has not started yet they are renumbered as you would expect, because nobody is waiting for anything.

### What it does on its own

Three things stop a campaign without being asked, and all three exist because nobody watches a screen for a fortnight.

- **Too many bad addresses.** If more than five in a hundred come straight back, it stops and says so. A list full of dead addresses is how a domain ends up in a filter, and stopping at forty is a great deal cheaper than stopping at four hundred.
- **The mail service saying no.** An unverified sending address or a rejected key would fail the same way for every message behind it, so it stops rather than failing nine hundred times.
- **The address disappearing.** Delete the inbox it sends from and it stops, with everything it has already sent kept exactly as it was.

**Pause** and **Resume** are yours to press, on the bar at the foot of the campaign - they used to be on its row in the list as well, which put three buttons under the thumb of anybody scrolling past. Pausing takes effect at the next gap: whatever was going out at the time finishes. **Stop for good** ends it, follow-ups included.

### Sending the whole thing again

A finished campaign carries **Send it all again** on the bar at the bottom. It is mostly for the campaign you fire at a test mailbox twenty times while you get the wording right, and for the reminder that goes to the same list every September.

It is behind a warning, and the warning is the honest bit rather than the polite bit:

- **Everybody on the list gets it a second time**, the people who have already had it included. A customer who receives the same email twice unsubscribes, and they are right to.
- **The record of the last run goes.** Who opened it, what bounced, who replied - the progress table starts again from nothing, and there is no getting it back.
- **Unsubscribes and dead addresses are kept.** Anybody who opted out stays out, and so does every address that bounced. That much survives whatever else this does.
- **It comes back as a draft.** Nothing leaves until you press Start sending, and the checks run again first.

A campaign marks itself **finished** the moment the last person on it has been dealt with. Adding people to a finished campaign with **Top up** sets it going again, because adding somebody to a finished campaign is somebody saying it is not finished. Paused and stopped are left where they are: both of those were a decision, and a top-up is not a way to overturn one.

### Unsubscribing, and the law

Every campaign message carries a footer with your business name and address and a link to stop receiving them. Somebody who uses it is off the list within the second - not just that campaign but every campaign this site will ever send, because "unsubscribe" means from you rather than from one mailshot. It works without a login, it keeps working long after that campaign has been deleted, and mail programs that offer their own unsubscribe button will show one.

You can switch the footer off per campaign. Before you do: marketing email in the UK is expected to carry a way to opt out, and without one people press the spam button instead - which does far more damage to whether your ordinary email arrives than an unsubscribe ever could. The screen says so, once, and then it is your call.

The **Do-not-email list** - the button above the campaign list - holds everybody who is off the list, and why. You can add an address by hand - somebody who asked you at a trade show - and take one off, for the address that bounced during an outage and works again on Thursday. It stops campaigns only: replies, order confirmations and anything somebody has specifically asked you for still go out, which is right and is what the law expects.

Your business name and address for that footer go in **Settings → Unified Inbox → Campaigns**, along with how many days must pass before any campaign may write to the same person again. Seven is the default and it is a guard rather than a preference: two campaigns should not both land on the same customer on the same morning.

### What keeps it moving

This is worth two minutes of your attention, because it decides whether a campaign keeps to the pace you set.

While the Campaigns screen is open in front of you, it sends on time. When nobody is looking, it relies on your site's own scheduled round, which on most hosting comes past about once an hour - so an unattended campaign creeps along rather than keeping to your ninety seconds.

If you want it to keep proper time with nobody watching, the When section shows an address you can point any free website-pinger at, once a minute. Treat it like a password: anybody who has it can nudge your campaigns along. Asking it too often is harmless - the gap is kept on our side, and a request that arrives early sends nothing at all.

### What it deliberately does not do

- **No attachments.** A mailshot with a PDF on it goes to the junk folder, and a few thousand copies through your own mailbox is a bad afternoon for everybody. Link to it instead.
- **No click tracking.** Rewriting every link in an email is what marketing mail does, and it is one of the things filters look for.
- **No conversation per send, unless you ask for one.** Five thousand of them would bury your actual correspondence, so nothing a campaign sends appears in your post by itself. A **reply** makes a conversation, on the next check, exactly as any other email does - which is the only part you wanted in the inbox anyway. If you do switch on *Also file every one in the mailbox's Sent folder*, those copies come back on the next check and each one opens **its own conversation, with the person it was sent to** - not one conversation with two hundred messages in it. (It used to be exactly that. Two mailshots with the same subject looked like one conversation because they had your own address in common, which is true of everything you have ever sent and tells nobody anything.)
- **No A/B subject lines**, no scores, no funnels. It is still an inbox.

---

## Context - what the conversation is about

One line sits directly under the buttons at the top of a conversation and stays there while you scroll: the conversation's **context** - "Purchase order PO-0023, Order DW0234".

It used to be called attachments, which was asking for trouble: a message carries a file, and a conversation is about an order, and one word for both meant nobody could tell from it which was meant. Files on a message are still attachments. The records a conversation is about are its context.

Who you are talking to is not repeated there. Every message in the conversation carries the sender's name and their company at the head of it, and the row in the list beside it says the same again.

**Every name on that line is a link, and it opens in a new tab.** Following an order out of a conversation is almost always reading the order *while* answering the message, so the conversation - and the half-written reply under it - stays where it was.

If that line has more on it than will fit, it stops with an ellipsis rather than pushing the message down the screen. The arrow at the end of it opens the full list, which is also where anything is added or taken off.

**Taking something off works from that list.** The cross beside a record asks first, and answering **Take it off** used to close the list without doing anything - the question was drawn over the top of the page rather than inside the list, so answering it read as a click somewhere else and the list shut before the answer landed. The record itself is never touched either way, and you can add it again afterwards.

**A conversation with nothing on it yet has no line at all.** It used to get one anyway, reading "No context yet" - a whole row of a pinned header spent saying there was nothing to say. The arrow moves up instead, onto the end of the line that already reads *Email - General Enquiries - 1 message - last message 20:32*, where it costs nothing and is still exactly where you would go to attach the first one.

**Anything you put on a message out of your catalogue joins that line once the message has gone**, beside the orders and the purchase orders, and clicking it opens the product in a new tab. So a conversation that started "have you got that in oak" says what it was about a fortnight later, without anybody reading back through it. Quote the same chair twice and it appears once. This happens whichever channel the reply went out on - an enquiry answered with two chairs says so on the line as plainly as an email does.

### "Existing customer"

If whoever is writing has bought from the shop before, **Existing customer** sits on that same context line. It is not a record and nobody put it there - it is simply the one fact about a message from an unfamiliar name that changes how it gets answered, and otherwise you have to go and look for it.

Click it and the orders list opens in a new tab, already narrowed to that person. Which order they mean is usually the reason for the trip, so it opens the list rather than picking one for you.

**Attach the actual order and it goes away.** At that point the line says which order, which is the better answer to the same question, and having both on it was the vague version elbowing the precise one. Take the order off again and it comes back.

You only see it if you are allowed into the shop in the first place. On a site with no shop it never appears.

## What the rest of the site knows about them

When a person's address matches something else on your site - their orders, their quotes, their unpaid invoices, their member account - it appears on **their own page**, reached by clicking their name anywhere in the inbox. Each one is a link through to the real record. Nothing is ever written to those records from here, only read, and a module you have not installed simply shows nothing.

**It is no longer stacked under the conversation.** It used to be a fourth column beside the messages on a very wide window - and on anything narrower, a run of headings *underneath* the note line at the bottom of the conversation, which is to say below however many thousand pixels of quoted email the thread happened to hold. Nobody ever scrolled to it, and putting it there cost the site a question to every record-keeping module every time anybody opened a conversation. What is worth knowing beside a conversation is what the conversation is *about*, and that is the one line in the header above. The rest is one click away, on the page it belongs on.

When somebody quotes an order number, a purchase order number or a quote reference in a message, it becomes context on the conversation automatically. **Nothing is added until the number is checked and found to exist**, anything added that way says it was found automatically, and it comes off in one click. If your reference numbers are an unusual shape, the three boxes under **People → Spotting references** take your own pattern.

### Adding an order or a purchase order yourself

Most people do not quote their order number, and a supplier answering a purchase order almost never does. **Add context**, at the foot of the list behind that arrow, opens a list of your records to pick from rather than a box demanding a number.

It opens on whichever kind suits the address you are reading. If purchasing sends its emails as this address, it opens on purchase orders; if the shop sends as it, it opens on orders. Which address each of them sends as is the **Sending address** panel on that module's own settings - **Settings → Purchase Orders**, and the Notifications section of **Settings → Shop**. If you have not chosen one, the list simply starts on the first kind of record you have.

**The records belonging to whoever is on the conversation come first**, newest first among them, so a supplier's own open orders are usually the first thing in the list and adding one is a single click. Typing narrows it, by number, by the name on the record or by the address it was placed with. You can still add something by its number alone: type the number and press **Add**, and it goes on if a record with that number exists.

"Whoever is on the conversation" means everybody on it, not only the name at the top: whoever wrote, whoever it was written to, and anybody copied in - your own addresses, your colleagues and your own domains taken out, since none of those is the customer. Orders are matched on the address itself. **Purchase orders are matched on the domain**, because a supplier writes from whichever desk happens to be answering: an email from anybody at `dynamicos.co.uk` opens on Dynamic Office Solutions' own purchase orders, newest first, whether or not that particular person is the address the order was sent to.

On a discussion between colleagues there is nobody outside the building to rank by, so the list simply opens on your newest records. It used to open on nothing at all - the list came back empty for orders, quotes and purchase orders alike, however long you left it. That is fixed.

You only see records from parts of the site you are allowed into. Somebody who reads the inbox but has no business in the shop is not offered a list of your customers' orders, and if the site keeps no records of that sort at all, there is no button to press.

### Automated email

Order confirmations, purchase order emails and the like are sent by your email service and never touch your mailbox, so no mail client can be asked about them. They appear on a person's timeline anyway, from the site's own record of what it sent: what went, when, and whether it failed. **There is no copy of what it said**, because that record is a delivery ledger rather than an archive, and the page says so where it shows them.

One honest limitation: your site's own notification emails, such as "somebody has filled in your contact form", no longer clutter the inbox as unread conversations. They are recognised and kept quiet. They are **not yet folded onto the enquiry they are about**, so a form submission can still show up twice: once as the enquiry, and once as the site's own note to you about it.

---

## Who can see what

Four permissions, handed out through [Managing users](Managing-users) as usual:

| Permission | What it allows |
|---|---|
| `unifiedinbox.view` | Read conversations, mark them as junk in your own spam folder, and read the address book |
| `unifiedinbox.reply` | Reply, forward, note, assign, snooze, mark done, block a sender, add and correct a contact, make a category |
| `unifiedinbox.manage` | Settings, mail accounts, inboxes, the list of blocked senders and letting one back in, merging conversations, merging people, export and erase, importing an address book, removing an organisation, renaming or removing a category |
| `unifiedinbox.campaigns` | Write, start, pause and stop campaigns, and manage the do-not-email list |

**Campaigns is its own permission on purpose.** Renaming a folder and emailing five thousand customers are not the same act, and a site that has given somebody the first has not thereby given them the second. Sending a campaign from an address still needs permission to reply from that address as well - a campaign is a great many replies, and it is not a way round the guest list.

Giving somebody an inbox of their own is a convenience, not a permission: it decides what they open on and what they sign off as, and nothing about what they are allowed to read.

On top of that, **each shared inbox has its own list of who may read it**. Leave the list empty and anybody with the view permission can read that inbox. Name anybody at all and it is those people and nobody else. A shop assistant does not need `accounts@`.

That applies to searching and to the **All** view as well, not only to opening a conversation: a snippet from an inbox you cannot open never appears in your results at all. Administrators are the exception, on the grounds that whoever edits the guest lists could add themselves to one in two clicks anyway.

**Being tagged in a note is the one way past a guest list.** A colleague who could already open a conversation can ask somebody else to look at it, and that person can then read that conversation and work through their own copy of the ask - but nothing else in the inbox opens to them, and answering still needs permission to send from the address. See [Asking a colleague to look at something](#asking-a-colleague-to-look-at-something).

**Merging two conversations across two addresses opens both halves to both address's readers.** That is what merging them means - a conversation half the people on it cannot open is not one conversation - but it does widen who can read something, and it is worth a thought before you do it rather than afterwards. The confirmation names every address involved. It can be put back: separating the conversations out again takes the reading back with them. See [Merging conversations into one](#merging-conversations-into-one).

**An individual inbox is the one exception to that exception.** It has no guest list to add yourself to, and being an administrator does not open it - see "Shared and individual inboxes" above. Administrators keep the configuration and lose the reading, which is the honest half of the bargain.

---

## Keeping it tidy, and the law

### The retention window

**Collecting → Delete conversations older than** is blank to begin with, which means nothing is ever removed. Set a number of months and a daily tidy-up removes conversations whose last message is older than that, along with any files attached to them. **There is no way to get them back afterwards.**

The whole conversation goes, never half of it. Deleting the old half of a thread and keeping the recent half leaves something that reads as though your customer opened with a reply.

**Keep a conversation for ever if it has an order, a purchase order or a quote attached** is on by default, and is what stops a window aimed at old mailing lists quietly taking the correspondence behind a disputed invoice with it. The settings page tells you both numbers before anything happens: how many the next tidy-up would remove, and how many are old enough but are being kept because something is attached to them.

### Exporting and erasing one person

On a person's page, an administrator can download everything held about them as a file, or erase them.

**Erase covers this hub and nothing else.** The dialog counts up what will go before you press anything, and says in the same breath what will not:

- their conversations, messages, attached files, addresses and phone numbers, everything worked out about them, and every campaign row holding their name: **removed**;
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

Choosing "remove code and data" takes every conversation, message, person and campaign with it - the do-not-email list included, so be sure before you do it on a site that has ever sent one. **The attachment files in your media storage are not taken**, because they live outside the database. They stop being claimed by anything, so the media library's **Unused** count picks them up and offers them for deletion. It is one more step rather than a hidden leak, but it is a step somebody has to take.

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
