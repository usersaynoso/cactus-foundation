// ---------------------------------------------------------------------------
// Conversation providers - the data-shaped half of the Inbox seam.
//
// `core.inbox-tabs` lets a module publish a whole PANEL into the Inbox page, and
// that stays: a module's own inbox is its own screen and nobody else can render
// it as well as it can. But a panel is opaque - core cannot merge two of them,
// count them, search them or put them in one list, because all it holds is a
// React component.
//
// So a module may also publish a `core.conversation-provider`: the same
// messages, normalised, as plain data. Core uses it for the All tab on the Inbox
// page (every channel in one list, newest first), and anything else that wants
// to present several channels together reads the same seam.
//
// The contract deliberately names no module and no consumer. It is the same
// shape as `core.menu-entity-provider` and `smsProviders`: a function export
// resolved from the generated registry, never a component.
//
// Types only in this file - nothing here may import a module, a database client
// or anything else with a runtime cost, because it is imported for its types
// from both halves of the app.
// ---------------------------------------------------------------------------

export type ConversationChannel = 'email' | 'chat' | 'form' | 'phone' | 'sms' | 'whatsapp'

/** The outside party. Every field optional because channels differ: a phone
 *  call has a number and no email, a web form has an email and no number. */
export type ConversationParticipant = {
  name: string | null
  email: string | null
  phone: string | null
}

export type ConversationSummary = {
  /** Unique within the provider. Consumers namespace it with the module name. */
  id: string
  channel: ConversationChannel
  subject: string | null
  /** One line of the latest message, already stripped of markup. */
  preview: string | null
  participant: ConversationParticipant
  lastMessageAt: Date
  unread: boolean
  status: 'open' | 'closed'
  /** Deep link into the owning module's own UI. Admin-root relative (no leading
   *  slash and no admin path), because the admin path is per-site and only the
   *  rendering page knows it: "inbox?tab=contact-form&id=42". */
  href: string
  /** Where the sender addressed this, when the channel let them choose: a
   *  destination id published through `core.message-destinations`. Opaque
   *  everywhere but the module that published it, and absent on every channel
   *  that has nothing to choose between. */
  destinationId?: string | null
  /** What on the site this came from, when the channel has something more
   *  particular to say than its own name - which form, which widget, which
   *  number. A name for a person to read, never an id. */
  sourceLabel?: string | null
}

export type ConversationAttachment = {
  filename: string
  url: string
  contentType: string | null
}

export type ConversationMessage = {
  id: string
  /** `note` is an internal remark by a colleague, never sent to anybody. */
  direction: 'in' | 'out' | 'note'
  authorName: string | null
  text: string
  html: string | null
  sentAt: Date
  attachments: ConversationAttachment[]
}

export type ConversationListOptions = {
  since?: Date
  limit: number
  cursor?: string
}

export type ConversationListPage = {
  items: ConversationSummary[]
  nextCursor?: string
}

export type ConversationThread = {
  summary: ConversationSummary
  messages: ConversationMessage[]
}

/** Who a consumer is asking about, when it wants everything one person has ever
 *  said across every channel. Addresses and numbers are already normalised by
 *  the caller; a provider should still be forgiving about case. */
export type ConversationIdentity = {
  emails: string[]
  phones: string[]
}

/**
 * The inline styles a channel can carry, and what it wraps each one in.
 *
 * A channel that takes plain words - a text message, a call log - declares
 * nothing and gets nothing. A chat channel that has its own way of saying
 * "bold" declares the marker it says it with, and the consumer wraps the words
 * in that: WhatsApp writes bold as `*like this*`, Slack the same, Telegram as
 * `**like this**`.
 *
 * DECLARED BY THE CHANNEL rather than looked up by whoever is sending, and
 * that is the entire point of it being here. A consumer that knew WhatsApp's
 * asterisks would be a consumer that had learned one particular module's wire
 * format, and the next channel along would need it teaching a second. What a
 * channel is offered in the writing box, and what a message is wrapped in on
 * the way out, both come from this and nothing else.
 *
 * A marker is a plain string wrapped round the words on BOTH sides. Nothing
 * here can express a style whose opening and closing markers differ, which is
 * deliberate: no chat channel writes one, and a shape that could would need a
 * parser rather than a wrapper.
 */
export type ConversationTextStyles = {
  bold?: string
  italic?: string
  strikethrough?: string
  monospace?: string
}

export type ConversationProvider = {
  /** Human label for the channel this provider serves, e.g. "Live chat". */
  label: string
  channel: ConversationChannel
  /** What this provider can do beyond listing. A consumer must check these
   *  rather than calling an optional method and catching the failure. */
  capabilities: {
    reply: boolean
    markRead: boolean
    byIdentity: boolean
    delete?: boolean
    /** Whether the other party can be refused outright - a caller blocked, a
     *  sender turned away - by the channel that owns them. */
    block?: boolean
    /** Which inline styles survive the journey, and what this channel writes
     *  each of them as. Absent means the channel takes words and nothing else,
     *  which is the honest default: a consumer offering a Bold button over a
     *  channel that cannot carry one is offering a button that quietly does
     *  nothing. */
    textStyles?: ConversationTextStyles
  }
  list(opts: ConversationListOptions): Promise<ConversationListPage>
  thread(id: string): Promise<ConversationThread | null>
  send?(id: string, body: { text: string; html?: string; authorUserId: string }): Promise<void>
  markRead?(id: string): Promise<void>
  /** Everything this provider holds for one person, for a unified timeline. */
  byIdentity?(identity: ConversationIdentity): Promise<ConversationSummary[]>
  /** Delete a single message.
   *
   *  `true` means it is gone, which INCLUDES a message the provider no longer
   *  holds: a consumer asking to be rid of something must not be told "no"
   *  because the far end got there first, or it is stuck with a row it can
   *  never clear.
   *
   *  `false` means this provider will not delete THIS message - a live call
   *  log it does not own, a text the network keeps - and is the answer a
   *  consumer should turn into "that kind of message cannot be deleted here".
   *  A provider that tried and failed should throw instead, because "it would
   *  not" and "it cannot" are different answers and only one is worth trying
   *  again. */
  deleteMessage?(messageId: string): Promise<boolean>
  /** Refuse the other party on this conversation from here on - the telephony
   *  sense of blocking a caller. What already happened stays where it is;
   *  this is about what happens next. Throws when there is nobody to block,
   *  e.g. a caller who withheld their number. */
  blockParticipant?(conversationId: string): Promise<void>
  /** Let them through again. Unblocking somebody who was never blocked is not
   *  an error - it is the same outcome either way. */
  unblockParticipant?(conversationId: string): Promise<void>
  /** Whether the other party on this conversation is blocked right now, so a
   *  screen can offer the right one of the two rather than guessing. */
  isParticipantBlocked?(conversationId: string): Promise<boolean>
}

/** A provider as core resolved it: the module that published it, the manifest
 *  entry id, and the implementation itself. */
export type ResolvedConversationProvider = {
  moduleName: string
  id: string
  provider: ConversationProvider
}

// ---------------------------------------------------------------------------
// Message destinations - "where should something sent from the public side of
// the site be delivered?"
//
// A public form, a booking request, a callback slip: each of them collects
// something from a stranger and has to put it somewhere. On a site with no
// mailbox module there is one answer and it needs no field. On a site that
// keeps several addresses, the owner wants THIS form to land in sales@ and THAT
// one in accounts@, and the collecting module has no business knowing what an
// address is, who owns it or which module holds them.
//
// So a module publishes `core.message-destinations`: a list of places, each
// with an id it made up and a name a person would recognise. A collecting
// module offers that list, stores the id it was given and hands it back
// untouched (see `ConversationSummary.destinationId`); nothing between the two
// ever looks inside it. Core learns no module name at either end.
//
// Types only, like everything else in this file - the resolver lives in
// lib/conversations/destinations.ts, because it reads the database.
// ---------------------------------------------------------------------------

export const MESSAGE_DESTINATION_POINT = 'core.message-destinations'

/** One place something can be delivered. The id is the publishing module's own
 *  and means nothing anywhere else; the label is what a person picks from. */
export type MessageDestination = {
  id: string
  label: string
  /** One line under the name - an address, a department - or null. */
  detail?: string | null
}

/** What one module offers, kept as a group so a picker can say where each
 *  choice comes from when a site has two modules publishing destinations. */
export type MessageDestinationGroup = {
  moduleName: string
  /** What this module calls the set: "Inboxes", "Teams". */
  label: string
  destinations: MessageDestination[]
}

/** What a module publishes at `core.message-destinations`. Server-only by
 *  nature: it reads that module's own tables. */
export type MessageDestinationProvider = {
  label: string
  list(): Promise<MessageDestination[]>
}
