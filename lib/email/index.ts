import { isEmailConfigured } from '@/lib/config/env'

/** A file travelling with the email. `content` is the raw bytes - base64 is done
 *  here, once, rather than at every call site, because Brevo wants base64 and
 *  nodemailer wants the buffer and a caller should not have to know which
 *  transport the site is on. */
export type EmailAttachment = {
  filename: string
  content: Buffer | Uint8Array
  /** Defaults to application/pdf, which is what every attachment sent so far
   *  is. SMTP reads it; Brevo works it out from the filename either way. */
  contentType?: string
}

export type EmailPayload = {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
  cc?: string[]
  attachments?: EmailAttachment[]
  /** Extra RFC 5322 headers, passed through to whichever transport is in use.
   *  The one that matters is `Message-ID`: a sender that sets its own can match
   *  a reply arriving weeks later back to the message that prompted it, which is
   *  the whole basis of threading a conversation. Header names are the caller's
   *  business - nothing here inspects them beyond the Message-ID it logs. */
  headers?: Record<string, string>
  /** Who the message is from, when it should not be the site's own address.
   *  Left unset - which is nearly always - the sender is whatever Settings ›
   *  Emails says, and no existing caller has to think about it. Set, it is for
   *  a site that answers on behalf of more than one address and needs the
   *  reply to look like it came from the right one. Whichever service is
   *  sending still has to be willing to send as that address. */
  from?: EmailSender
  /** The account to send this particular message through, when it should not
   *  be the site's own. Left unset, the environment decides exactly as before. */
  transport?: EmailTransport
  /** Registry key when this came from a template, for the email log. Set
   *  automatically by sendTemplateEmail; ad-hoc sends leave it unset. */
  templateKey?: string
  /** Which module asked for this email, for the email log. Core leaves it unset. */
  moduleName?: string
}

export type EmailSender = {
  name?: string
  address: string
}

/** One send's transport, overriding the environment for that send only.
 *  Nothing is stored and nothing is remembered between calls. */
export type EmailTransport =
  | { provider: 'brevo'; apiKey: string }
  | { provider: 'smtp'; host: string; port?: string; user?: string; pass?: string }

// Brevo's API caps a whole message at 10MB including its attachments, and an
// oversized one is refused outright - which would take the email down with it.
// A document that will not fit is dropped and the email goes without it: the
// link in the body still reaches it, and a customer with no email at all is a
// worse outcome than a customer with no attachment.
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024

function usableAttachments(attachments: EmailAttachment[] | undefined): EmailAttachment[] {
  if (!attachments?.length) return []
  return attachments.filter((file) => {
    if (file.content.byteLength <= MAX_ATTACHMENT_BYTES) return true
    console.error(`[email] attachment "${file.filename}" is too big to send (${file.content.byteLength} bytes) - sending without it.`)
    return false
  })
}

// The Message-ID we put on the way out, whatever case the caller wrote the
// header in. Stored on the log row because it is the only handle a later reply
// gives us back.
function outgoingMessageId(payload: EmailPayload): string | undefined {
  const entry = Object.entries(payload.headers ?? {}).find(
    ([name]) => name.toLowerCase() === 'message-id',
  )
  return entry?.[1]
}

/**
 * The payload with whatever a module has decided about its own sender folded in
 * (see lib/email/identity.ts), or the payload untouched - which is what every
 * site with no identity provider installed gets, without a database read.
 *
 * A payload that already names its own sender, reply-to or account is left
 * alone in that respect: the caller was specific, and a provider guessing over
 * the top of it would be worse than useless.
 */
async function withOutboundIdentity(payload: EmailPayload): Promise<EmailPayload> {
  if (!payload.moduleName || payload.from) return payload
  try {
    const { resolveOutboundEmailIdentity } = await import('@/lib/email/identity')
    const identity = await resolveOutboundEmailIdentity(payload.moduleName)
    if (!identity) return payload
    return {
      ...payload,
      from: identity.from,
      ...(payload.replyTo || !identity.replyTo ? {} : { replyTo: identity.replyTo }),
      ...(payload.transport || !identity.transport ? {} : { transport: identity.transport }),
    }
  } catch (error) {
    // Never fatal. The email still has a perfectly good sender to fall back on.
    console.error('[email] could not resolve a sender for', payload.moduleName, error)
    return payload
  }
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const message = await withOutboundIdentity(payload)

  // A payload carrying its own account IS configured, by definition - which is
  // the case when somebody is testing credentials they have typed in but not
  // saved yet, on a site that has none set up at all.
  if (!message.transport && !isEmailConfigured()) {
    throw new Error('Email is not configured. Add BREVO_API_KEY or SMTP credentials.')
  }

  const { recordEmailSend } = await import('@/lib/email/log')
  const messageId = outgoingMessageId(payload)

  try {
    const providerId = await dispatch(message)
    await recordEmailSend({
      toAddress: payload.to,
      ccAddresses: payload.cc,
      subject: payload.subject,
      templateKey: payload.templateKey,
      moduleName: payload.moduleName,
      status: 'sent',
      messageId,
      providerId,
    })
  } catch (err) {
    // Logged and then rethrown: the caller's own error handling is unchanged,
    // and the ledger is the only place a failed send is visible afterwards.
    await recordEmailSend({
      toAddress: payload.to,
      ccAddresses: payload.cc,
      subject: payload.subject,
      templateKey: payload.templateKey,
      moduleName: payload.moduleName,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      messageId,
    })
    throw err
  }
}

/**
 * Which transport carries this message.
 *
 * A payload that names one wins; otherwise it is whatever the environment is
 * set up for, which is what every existing caller gets and always got.
 */
async function dispatch(payload: EmailPayload): Promise<string | undefined> {
  if (payload.transport?.provider === 'brevo') {
    return await sendViaBrevo(payload, payload.transport.apiKey)
  }
  if (payload.transport?.provider === 'smtp') {
    const { host, port, user, pass } = payload.transport
    return await sendViaSmtp(payload, { host, port, user, pass })
  }
  return process.env.BREVO_API_KEY ? await sendViaBrevo(payload) : await sendViaSmtp(payload)
}

/** Returns the provider's own id for the message, when it gives one. */
async function sendViaBrevo(payload: EmailPayload, apiKey?: string): Promise<string | undefined> {
  const sender = await resolveSender(payload)
  const files = usableAttachments(payload.attachments)
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey ?? process.env.BREVO_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: sender.fromName, email: sender.fromAddress },
      to: [{ email: payload.to }],
      ...(payload.cc?.length ? { cc: payload.cc.map((e) => ({ email: e })) } : {}),
      ...(payload.replyTo ? { replyTo: { email: payload.replyTo } } : {}),
      ...(payload.headers && Object.keys(payload.headers).length ? { headers: payload.headers } : {}),
      subject: payload.subject,
      htmlContent: payload.html,
      textContent: payload.text,
      ...(files.length
        ? {
            attachment: files.map((file) => ({
              name: file.filename,
              content: Buffer.from(file.content).toString('base64'),
            })),
          }
        : {}),
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Brevo email failed: ${res.status} ${body}`)
  }
  // Brevo answers with { messageId }. A body that will not parse is not worth an
  // exception - the email went, and the id is only ever used for tracing.
  try {
    const body = (await res.json()) as { messageId?: unknown }
    return typeof body.messageId === 'string' ? body.messageId : undefined
  } catch {
    return undefined
  }
}

type SmtpOverrides = { host?: string; port?: string; user?: string; pass?: string }

async function sendViaSmtp(payload: EmailPayload, overrides?: SmtpOverrides): Promise<string | undefined> {
  const { createTransport } = await import('nodemailer')
  const sender = await resolveSender(payload)
  const transporter = createTransport({
    host: overrides?.host ?? process.env.SMTP_HOST,
    port: parseInt(overrides?.port ?? process.env.SMTP_PORT ?? '587', 10),
    auth: {
      user: overrides?.user ?? process.env.SMTP_USER,
      pass: overrides?.pass ?? process.env.SMTP_PASS,
    },
  })
  const info = await transporter.sendMail({
    from: `"${sender.fromName}" <${sender.fromAddress}>`,
    to: payload.to,
    ...(payload.cc?.length ? { cc: payload.cc.join(', ') } : {}),
    ...(payload.replyTo ? { replyTo: payload.replyTo } : {}),
    ...(payload.headers && Object.keys(payload.headers).length ? { headers: payload.headers } : {}),
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    ...(usableAttachments(payload.attachments).length
      ? {
          attachments: usableAttachments(payload.attachments).map((file) => ({
            filename: file.filename,
            content: Buffer.from(file.content),
            contentType: file.contentType ?? 'application/pdf',
          })),
        }
      : {}),
  })
  return typeof info?.messageId === 'string' ? info.messageId : undefined
}

/**
 * The From line for one message: the payload's own sender when it has one,
 * the site's otherwise.
 *
 * A payload that gives an address but no display name keeps the site's name,
 * because an email with a bare address in the From line looks like spam to
 * both a person and a filter.
 */
async function resolveSender(payload: EmailPayload): Promise<{ fromName: string; fromAddress: string }> {
  const config = await getEmailConfig()
  if (!payload.from?.address) return config
  return {
    fromName: payload.from.name?.trim() || config.fromName,
    fromAddress: payload.from.address,
  }
}

async function getEmailConfig() {
  const { prisma } = await import('@/lib/db/prisma')
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { emailFromName: true, emailFromAddress: true, siteName: true },
  })

  let fromAddress = config?.emailFromAddress
  if (!fromAddress) {
    const admin = await prisma.user.findFirst({
      where: { role: { isProtected: true } },
      orderBy: { createdAt: 'asc' },
      select: { email: true },
    })
    fromAddress = admin?.email ?? 'noreply@example.com'
  }

  return {
    fromName: config?.emailFromName ?? config?.siteName ?? 'Cactus Foundation',
    fromAddress,
  }
}

// ---------------------------------------------------------------------------
// Template-driven sending
// ---------------------------------------------------------------------------

// Everything below goes through the registry in lib/email/registry.ts, so every
// one of these is editable in Settings › Emails and arrives inside whatever
// wrapper design the site has. The helpers keep their original signatures -
// their callers neither know nor care that the copy moved.
//
// Returns false when the template is switched off (non-transactional only), so
// a caller that wants to log "sent" can tell the difference between sent and
// deliberately skipped.
export async function sendTemplateEmail(
  to: string,
  key: string,
  vars: Record<string, string> = {},
  opts?: { replyTo?: string; cc?: string[]; headers?: Record<string, string> },
): Promise<boolean> {
  const { renderEmailTemplate } = await import('@/lib/email/render')
  const rendered = await renderEmailTemplate(key, vars)
  if (!rendered) return false
  // The registry key is namespaced with the owning module's name, so the log
  // gets both from the one field with nothing for a caller to remember.
  const moduleName = key.includes('.') ? key.split('.')[0] : undefined
  await sendEmail({
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    templateKey: key,
    ...(moduleName && !['auth', 'system', 'member'].includes(moduleName) ? { moduleName } : {}),
    ...opts,
  })
  return true
}

export async function sendLoginOtp(to: string, code: string, siteName: string) {
  await sendTemplateEmail(to, 'auth.login-code', { code, siteName })
}

export async function sendEmailVerification(
  to: string,
  code: string,
  siteName: string
) {
  await sendTemplateEmail(to, 'auth.verify-email', { code, siteName })
}

// Sent to the address the account is being moved TO. Until this code comes back,
// the account keeps its old address, so a typo here costs nothing.
export async function sendEmailChangeCode(
  to: string,
  code: string,
  siteName: string
) {
  await sendTemplateEmail(to, 'auth.email-change-code', { code, siteName })
}

// Sent to the address the account is moving AWAY from, so an owner whose session
// has been hijacked finds out while they can still do something about it.
export async function sendEmailChangeNotice(
  to: string,
  newEmail: string,
  siteName: string
) {
  await sendTemplateEmail(to, 'auth.email-change-notice', { newEmail, siteName })
}

export async function sendRecoveryLink(
  to: string,
  recoveryUrl: string,
  siteName: string
) {
  await sendTemplateEmail(to, 'auth.recovery-link', { recoveryUrl, siteName })
}

export async function sendRecoveryNotification(to: string, siteName: string) {
  await sendTemplateEmail(to, 'auth.recovery-completed', { siteName })
}

export async function sendPasswordChangedNotification(
  to: string,
  siteName: string
) {
  await sendTemplateEmail(to, 'auth.password-changed', { siteName })
}

async function testEmailPayload(to: string, siteName: string): Promise<EmailPayload> {
  const { renderEmailTemplate } = await import('@/lib/email/render')
  const rendered = await renderEmailTemplate('system.test-email', { siteName })
  // system.test-email is transactional, so renderEmailTemplate cannot return
  // null here; the fallback exists only so a future edit to that flag can't
  // turn "test your email settings" into a silent no-op.
  if (!rendered) throw new Error('The test email template is switched off.')
  return { to, subject: rendered.subject, html: rendered.html, text: rendered.text }
}

export async function sendTestEmail(to: string, siteName: string) {
  await sendEmail(await testEmailPayload(to, siteName))
}

export type TestEmailCredentials = {
  provider: 'brevo' | 'smtp'
  brevoApiKey?: string
  smtpHost?: string
  smtpPort?: string
  smtpUser?: string
  smtpPass?: string
}

// Sends a test email using credentials supplied by the caller (typed into the
// admin settings form but not yet saved/redeployed). Any field left blank
// falls back to the value in the current server environment, so a partial
// update (e.g. new password, same host) still tests the combined result.
//
// It goes through sendEmail like everything else, which it did not always do.
// It used to call the transports directly, and so it was the one send on the
// whole site that left no trace in the email log - the send somebody is most
// likely to be looking for afterwards, because it is the one they make when
// something is already wrong.
export async function sendTestEmailWithCredentials(
  to: string,
  siteName: string,
  creds: TestEmailCredentials
) {
  const payload = await testEmailPayload(to, siteName)
  if (creds.provider === 'brevo') {
    const apiKey = creds.brevoApiKey || process.env.BREVO_API_KEY
    if (!apiKey) throw new Error('Enter a Brevo API key first.')
    await sendEmail({ ...payload, templateKey: 'system.test-email', transport: { provider: 'brevo', apiKey } })
  } else {
    const host = creds.smtpHost || process.env.SMTP_HOST
    if (!host) throw new Error('Enter an SMTP host first.')
    await sendEmail({
      ...payload,
      templateKey: 'system.test-email',
      transport: {
        provider: 'smtp',
        host,
        ...(creds.smtpPort ? { port: creds.smtpPort } : {}),
        ...(creds.smtpUser ? { user: creds.smtpUser } : {}),
        ...(creds.smtpPass ? { pass: creds.smtpPass } : {}),
      },
    })
  }
}

export async function sendRecoveryRequestNotification(
  to: string,
  siteName: string
) {
  await sendTemplateEmail(to, 'auth.recovery-requested', { siteName })
}
