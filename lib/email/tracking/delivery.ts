// ---------------------------------------------------------------------------
// What can honestly be said about a message sent over ordinary SMTP.
//
// A mail service like Brevo is told by the far end when a message is delivered
// and passes that on. Plain SMTP - somebody's own mail account - is not: the
// mail server takes the message, says "accepted", and that is the last word
// unless something goes wrong, in which case a bounce comes back to the sending
// mailbox as an email of its own.
//
// So the only positive fact is "accepted by the mail server". A bounce, when it
// comes, usually comes within minutes and occasionally takes a day or two while
// the far end retries. Once that window has passed with nothing back, the
// message almost certainly arrived - but "almost certainly" is what the screen
// says, never "delivered", because nobody told us that.
//
// Pure, and safe to import from a browser: the labels under a sent message are
// drawn by a client component.
// ---------------------------------------------------------------------------

/** How long a bounce is waited for before a message is taken to have arrived.
 *  Most mail servers give up on a message they cannot deliver, and say so, well
 *  inside two days. */
export const BOUNCE_WINDOW_MS = 48 * 60 * 60 * 1000

export type SmtpDeliveryVerdict =
  /** Taken by the mail server; too soon to say more. */
  | 'accepted'
  /** Taken, and nothing has come back in the window. Treated as delivered, and
   *  described as exactly that. */
  | 'no-bounce'
  /** A delivery report came back: it did not arrive. */
  | 'bounced'
  /** A delivery report says the far end is still trying. */
  | 'delayed'

export function smtpDeliveryVerdict(input: {
  sentAt: Date | string
  bouncedAt: Date | string | null
  deferredAt?: Date | string | null
  now?: Date
}): SmtpDeliveryVerdict {
  if (input.bouncedAt) return 'bounced'
  const sent = new Date(input.sentAt).getTime()
  const now = (input.now ?? new Date()).getTime()
  if (Number.isNaN(sent)) return 'accepted'
  if (now - sent >= BOUNCE_WINDOW_MS) return 'no-bounce'
  if (input.deferredAt) return 'delayed'
  return 'accepted'
}

/** The words for each verdict, the same wherever a sent message is shown. */
export const SMTP_VERDICT_LABELS: Record<SmtpDeliveryVerdict, string> = {
  accepted: 'Accepted by the mail server',
  'no-bounce': 'Accepted, nothing bounced back',
  bounced: 'It did not arrive',
  delayed: 'Held up on the way',
}

export const SMTP_VERDICT_EXPLAINED: Record<SmtpDeliveryVerdict, string> = {
  accepted:
    'The mail server it went out through has taken it. That is as far as anybody can see with an ordinary mail '
    + 'account - if it cannot be delivered, a bounce usually comes back within minutes, occasionally a day or two.',
  'no-bounce':
    'The mail server took it and nothing has bounced back in the two days since, so it almost certainly arrived. '
    + 'Only the mail server at their end could say for sure, and it does not tell anybody.',
  bounced:
    'A delivery report came back saying it could not be delivered. It is worth checking the address is spelt right, '
    + 'or reaching them another way.',
  delayed:
    'A delivery report came back saying the far end is still trying. It may yet get through on its own.',
}

/** The caveat that belongs beside every open count, wherever one is shown. */
export const OPEN_CAVEAT =
  'Opens are a rough guide. Apple Mail downloads pictures on its own the moment a message arrives, which can look '
  + 'like an open nobody made, and Outlook often blocks pictures, which hides opens that did happen. A followed link '
  + 'is the signal worth trusting.'
