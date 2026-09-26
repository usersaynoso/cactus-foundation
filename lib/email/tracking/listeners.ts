import { getInstalledManifests } from '@/lib/modules/live-status'
// The NARROW map, holding this one point and nothing else - not the server map.
// This is reached from the public open-picture and redirect routes, which run
// every time a customer opens an email, and the server map imports every
// module's server code to answer a question only one or two modules care about.
// See scripts/generate-module-extension-points.mjs.
import { emailTrackingExtensionPointComponents } from '@/lib/modules/extension-points.email-tracking'

// ---------------------------------------------------------------------------
// Telling a module that one of its messages was opened, clicked or bounced.
//
// Core keeps its own record of every tracked send (EmailEvent, against the
// EmailLog row), and that is enough for the site's automatic mail. A module
// that keeps its own record of what it sent - a conversation, with its own
// labels under each reply - wants to hear about it too, so a module may publish
// a listener at this point and is handed every event as it happens.
//
// Every listener, not the first: two modules both wanting to know is not a
// contradiction. Each one decides for itself whether the event is about one of
// its messages - by the module name and its own reference, which it put on the
// send in the first place, or by the EmailLog id, for mail it only kept a copy
// of.
//
// NEVER throws. This runs after the picture or the redirect has already gone
// back to whoever asked, and a listener that fails is logged and stepped over.
// ---------------------------------------------------------------------------

export const EMAIL_TRACKING_EVENT_POINT = 'core.email-tracking-event'

export type EmailTrackingEventKind = 'opened' | 'proxy_open' | 'clicked' | 'bounced'

export type EmailTrackingEvent = {
  /** The EmailLog row of the send this is about. */
  emailLogId: string
  /** The module that sent it, when one did - from the signed token, or from
   *  the log row on a bounce. */
  moduleName: string | null
  /** The sending module's own name for the message, exactly as it passed it to
   *  sendEmail as `tracking.ref`. Null when it passed none. */
  ref: string | null
  kind: EmailTrackingEventKind
  occurredAt: Date
  /** The address followed, on a click. The reason given, on a bounce. */
  detail: string | null
  /** 'hard' | 'soft' on a bounce, null otherwise. */
  bounceKind: 'hard' | 'soft' | null
  ip: string | null
  userAgent: string | null
}

export type EmailTrackingListener = {
  onTrackingEvent(event: EmailTrackingEvent): Promise<void>
}

function isListener(value: unknown): value is EmailTrackingListener {
  return !!value && typeof value === 'object' && typeof (value as EmailTrackingListener).onTrackingEvent === 'function'
}

type ExtensionPointEntry = { point: string; id: string }

/** Whether any installed build carries a listener at all. Free: no database. */
export function hasEmailTrackingListeners(): boolean {
  return Object.keys(emailTrackingExtensionPointComponents[EMAIL_TRACKING_EVENT_POINT] ?? {}).length > 0
}

export async function notifyEmailTrackingListeners(event: EmailTrackingEvent): Promise<void> {
  const components = emailTrackingExtensionPointComponents[EMAIL_TRACKING_EVENT_POINT] ?? {}
  if (Object.keys(components).length === 0) return

  let manifests: { manifest: unknown }[]
  try {
    manifests = await getInstalledManifests()
  } catch (error) {
    console.error('[email] could not list installed modules for a tracking event', error)
    return
  }

  for (const { manifest } of manifests) {
    const entries = (manifest as { extensionPoints?: ExtensionPointEntry[] } | null)?.extensionPoints ?? []
    for (const entry of entries) {
      if (entry.point !== EMAIL_TRACKING_EVENT_POINT) continue
      const listener = components[entry.id]
      if (!isListener(listener)) continue
      try {
        await listener.onTrackingEvent(event)
      } catch (error) {
        console.error(`[email] tracking listener ${entry.id} failed`, error)
      }
    }
  }
}
