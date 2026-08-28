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

export type ConversationChannel = 'email' | 'chat' | 'form' | 'phone' | 'sms'

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
  }
  list(opts: ConversationListOptions): Promise<ConversationListPage>
  thread(id: string): Promise<ConversationThread | null>
  send?(id: string, body: { text: string; html?: string; authorUserId: string }): Promise<void>
  markRead?(id: string): Promise<void>
  /** Everything this provider holds for one person, for a unified timeline. */
  byIdentity?(identity: ConversationIdentity): Promise<ConversationSummary[]>
}

/** A provider as core resolved it: the module that published it, the manifest
 *  entry id, and the implementation itself. */
export type ResolvedConversationProvider = {
  moduleName: string
  id: string
  provider: ConversationProvider
}
