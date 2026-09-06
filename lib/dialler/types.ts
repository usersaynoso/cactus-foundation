// ---------------------------------------------------------------------------
// Diallers - the "ring somebody" half of the telephony seam.
//
// `core.conversation-provider` already lets a telephony module publish what has
// been said: calls, voicemail, texts, as data anything can list. It has no way
// to START one, and there is a real difference between a screen that shows you
// a customer's number and a screen that rings it.
//
// So a module may also publish a `core.dialler`: the site's own numbers to call
// out from, and one method that places the call. Core dials nothing itself and
// names no provider - the same arrangement as `smsProviders`, one door down.
//
// TWO-LEG BY DESIGN, and that is why `callMeAt` is in the request rather than
// implied. Nothing here dials the customer and hopes somebody is holding the
// phone: the site rings the person making the call first, tells them who is
// about to be rung, and connects the two once they answer. A provider that
// worked any other way would be placing calls into an empty room.
//
// Types only in this file. It is imported for its types from both halves of the
// app, so nothing here may reach a database, a credential or an SDK.
// ---------------------------------------------------------------------------

/** One of the site's own numbers, offered as the caller ID a call goes out as. */
export type DiallerNumber = {
  /** E.164, because it is the only shape every provider agrees on. */
  number: string
  /** What to call it in a menu: a name the owner gave it, or the number again. */
  label: string
}

export type DialRequest = {
  /** Who is being rung, as typed. The provider normalises and refuses. */
  to: string
  /** Which of the site's numbers the call goes out as. */
  from: string
  /** Where to ring the person placing it, first. */
  callMeAt: string
}

/** Never a thrown error for a refusal: "that number is not on the account" is a
 *  sentence for the person at the keyboard, not a stack trace. A provider still
 *  throws for the genuinely exceptional - the network being down. */
export type DialResult = { ok: true } | { ok: false; reason: string }

export type Dialler = {
  /** Human label for the service placing the call, e.g. "Twilio". */
  label: string
  /** Whether it could place a call right now: installed is not configured, and
   *  a menu offering a call the site cannot make is worse than no menu. */
  isConfigured(): Promise<boolean>
  /** The site's own numbers, for the caller-ID menu. Empty is a legitimate
   *  answer and means the same as "not configured" to a consumer. */
  numbers(): Promise<DiallerNumber[]>
  dial(request: DialRequest): Promise<DialResult>
}

/** A dialler as core resolved it: the module that published it, the manifest
 *  entry id, and the implementation itself. */
export type ResolvedDialler = {
  moduleName: string
  id: string
  dialler: Dialler
}
