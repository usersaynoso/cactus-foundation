# AI Agent for Live Chat

AI Agent for Live Chat puts a digital assistant on your [Live Chat](Chat). It answers visitors under a name you choose (Deskwell's is Charlie), first or only when nobody is in, as you prefer, and steps aside the moment one of you replies. It only ever calls itself a digital assistant, never a person, and each of its messages carries a small **Digital assistant** badge.

- Settings: **Settings > AI Agent for Live Chat**, with sub-tabs **Assistant**, **Unanswered** and **Callbacks**.
- Needs the **Live Chat**, **Shop** and **Unified Inbox** modules, and an OpenAI API key.
- Module repository: [AI-Agent-for-Live-Chat](https://github.com/cactus-foundation-modules/AI-Agent-for-Live-Chat).

## Who answers a chat

Three modes, on the Assistant tab:

- **Off** - Live Chat exactly as it was.
- **Staff only** - it answers only a signed-in colleague's own test chats. On the site, press the eye in the Live Chat bubble to see the chat as a visitor does, and write in. Visitors see no change.
- **On** - it answers visitors by the rules below.

With the mode on:

| Situation | Who answers |
| --- | --- |
| Online switch off | The assistant answers every chat |
| Online, **"<name> first" on** | The assistant answers first and fetches a colleague when it should |
| Online, "<name> first" off | You do. Each chat has a **Hand to <name>** button |
| A colleague goes offline mid-chat | The assistant picks the chat up on the visitor's next message, having read it all |
| A colleague replies in a chat the assistant has | The chat is theirs at once. **Hand back to <name>** returns it |

The **"<name> first"** switch sits beside Live Chat's Online switch, in the admin chat window and the bubble on the site. It is one switch for the whole site, and anybody who answers chats can flip it.

## Fetching a colleague

When a visitor asks for a person, or needs something the assistant cannot do, it says it is fetching a colleague. The chat rises in the list, the bell lights and desktop alerts go off, and the visitor's messages go to you. If nobody replies within the **hand-over wait** (three minutes unless you change it) the assistant comes back, apologises and takes a name and email for a callback. The same happens straight away if everybody goes offline. The chat's header shows how long it has been waiting.

It does not fetch a colleague because a visitor is cross about an answer it gave: it checks again and puts the answer right. When nobody is in, it offers once to have someone get back to the visitor by email, and saves a callback only when the visitor asked for one or said yes in their own words. Turn it down and it is not offered again in that chat.

## Time-wasters

The same message three or more times, keyboard-mashing, a pile of links, messages faster than anybody could type, abuse, or attempts to talk it out of its instructions: the assistant says it is passing the chat to a colleague and asks for a name and email, up to three times. Then it goes quiet and the chat is flagged for you, details or not. The wording is fixed, so this costs nothing.

## What it can do

- **Products** - sizes, options, price, stock, specifications, delivery dates option by option, accessories and your FAQs. Products it recommends appear as cards with **Add to basket**, **Add all** and **Choose options**. Nothing goes in the basket without the visitor's click.
- **Finding the right product** - a colour finds every product sold in it (the search reads each product's colours and sizes, as your own colour filter does) and shows the matching colour's own card. "The cheapest" means the cheapest that fits and can be ordered today: anything out of stock is left out unless the visitor asks about it by name. A visitor can paste a link to one of your category pages, filters and all, or to a product page, and it uses it. Options are matched the way people write them ("no mod panel" for "Without Modesty Panel"), and the choices made earlier in a chat are kept.
- **Orders** - a signed-in customer can ask about the orders on their own account with nothing more to prove. Anybody else gives the delivery postcode plus the order number, the email on the order or the company name. Three wrong tries in a chat (or six an hour from one visitor) and it stops. It only talks about the order asked about, and never shows an email address, phone number or street address.
- **Delivery choices travel with the product** - when a visitor picks a delivery service (pre-assembled, installed, express), the product's card in the chat shows it with the shop's price, Add to basket adds it with that service chosen, and an emailed note, a text or a saved quote carries it too. Only services the shop offers for that product are accepted.
- **Cancellations, returns and damage reports** on a checked order, through the shop's own rules, once it has written back what it will raise and the visitor has said yes. Photos sent in the chat go straight into a damage report.
- **Pictures and PDFs** the visitor sends are read: a photo of the damage, a screenshot, a floor plan.
- **Paying and paperwork**, read live from the shop's Payments and Invoices tabs, your bank transfer wording included.
- **Emails, when asked** - the order's link (only ever to the address on the order) or a note of the chat, from the address you choose on the Assistant tab. Editable under **Settings > Emails > Chat assistant**. A quote too, where the Quotes module is installed. The note always lists the products talked about, with pictures and links, even if the assistant forgets to name them, and greets the visitor by their name with a capital letter however they typed it. A note of the chat lists the products the visitor was shown and chose, each opening with the options they picked, and leaves out ones they turned down.
- **Texts, when asked** - the order's link or a note of the chat with links, where the site has text messages set up (the Twilio module). Only to a UK mobile the visitor typed in the chat or gave in the chat's contact box, or the one on an order they proved (an order link only ever to that order's own mobile). It never writes the number back, needs their yes, and sends at most three a chat. Each link goes with the product's name above it, and the text signs off with your web address ("Deskwell.co.uk").
- **Pages, articles and reviews**, and "can you get it to me by Friday?" from the checkout's own delivery zones.
- **Earlier contact** - once a visitor has proved an order or is signed in, it can see their earlier chats, calls and emails.
- **Callbacks** are listed on the Callbacks tab, with a notification each time. **Questions it could not answer** are listed on the Unanswered tab, with a notification each Monday.

## Notes on each chat

**Notes** in a chat's header opens a short written overview of the chat (what they wanted, what was checked, how it ended, any callback) and then each step the assistant took.

## Setting it up

1. Install the module.
2. **Assistant** tab: paste an OpenAI key (or set `OPENAI_API_KEY` on the site's hosting), choose the name, business name, language and any extra instructions. The box warns about instructions that clash with the built-in rules. A site with the AI Call Answering module can press **Copy from phone assistant** to bring its business name, instructions, key and sending address across once; after that the two are independent.
3. Choose who its emails come from.
4. Set the mode to **Staff only**, try it, then **On**.

## Environment variables

| Name | Required | What for |
| --- | --- | --- |
| `ENCRYPTION_KEY` | yes | Keeps a pasted OpenAI key encrypted |
| `OPENAI_API_KEY` | no | The OpenAI key instead of pasting one; wins over a pasted key |
| `CRON_SECRET` | no | Protects the two-minute hand-over sweep and the Monday unanswered notice |

## For developers

- Answers through Live Chat's `chat.responder` extension point (server only) and draws its controls in Live Chat's `chat.admin-toolbar`, `chat.conversation-actions` and `chat.product-actions` slots. Live Chat holds no code of this module; the seams are generic and documented in the [Live Chat](Chat) page.
- Who answers is decided in `lib/routing.ts`. Each chat's state (`auto`, `assistant`, `colleague`, `waiting`, `not_genuine`, `quiet`) lives in `aichat_conversations`.
- Turns run one at a time per chat through the OpenAI Responses API, with the instructions built from settings alone so the prompt cache serves them.
- The shop tools are a copy of the AI Call Answering module's, adapted for writing. A change to either assistant's tools or rules should be weighed for the other.
- Tables: `aichat_settings`, `aichat_conversations`, `aichat_callbacks`, `aichat_unanswered`, `aichat_rate_events`. Crons: `cron/handover` every two minutes, `cron/unanswered` on Mondays at 07:00.
