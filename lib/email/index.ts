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
  /** Registry key when this came from a template, for the email log. Set
   *  automatically by sendTemplateEmail; ad-hoc sends leave it unset. */
  templateKey?: string
  /** Which module asked for this email, for the email log. Core leaves it unset. */
  moduleName?: string
}

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

export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error('Email is not configured. Add BREVO_API_KEY or SMTP credentials.')
  }

  const { recordEmailSend } = await import('@/lib/email/log')
  const messageId = outgoingMessageId(payload)

  try {
    const providerId = process.env.BREVO_API_KEY
      ? await sendViaBrevo(payload)
      : await sendViaSmtp(payload)
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

/** Returns the provider's own id for the message, when it gives one. */
async function sendViaBrevo(payload: EmailPayload, apiKey?: string): Promise<string | undefined> {
  const config = await getEmailConfig()
  const files = usableAttachments(payload.attachments)
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey ?? process.env.BREVO_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: config.fromName, email: config.fromAddress },
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
  const config = await getEmailConfig()
  const transporter = createTransport({
    host: overrides?.host ?? process.env.SMTP_HOST,
    port: parseInt(overrides?.port ?? process.env.SMTP_PORT ?? '587', 10),
    auth: {
      user: overrides?.user ?? process.env.SMTP_USER,
      pass: overrides?.pass ?? process.env.SMTP_PASS,
    },
  })
  const info = await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromAddress}>`,
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
export async function sendTestEmailWithCredentials(
  to: string,
  siteName: string,
  creds: TestEmailCredentials
) {
  const payload = await testEmailPayload(to, siteName)
  if (creds.provider === 'brevo') {
    const apiKey = creds.brevoApiKey || process.env.BREVO_API_KEY
    if (!apiKey) throw new Error('Enter a Brevo API key first.')
    await sendViaBrevo(payload, apiKey)
  } else {
    const host = creds.smtpHost || process.env.SMTP_HOST
    if (!host) throw new Error('Enter an SMTP host first.')
    await sendViaSmtp(payload, {
      host,
      port: creds.smtpPort || undefined,
      user: creds.smtpUser || undefined,
      pass: creds.smtpPass || undefined,
    })
  }
}

export async function sendRecoveryRequestNotification(
  to: string,
  siteName: string
) {
  await sendTemplateEmail(to, 'auth.recovery-requested', { siteName })
}
