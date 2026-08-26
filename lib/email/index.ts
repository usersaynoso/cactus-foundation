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

export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error('Email is not configured. Add BREVO_API_KEY or SMTP credentials.')
  }

  if (process.env.BREVO_API_KEY) {
    await sendViaBrevo(payload)
  } else {
    await sendViaSmtp(payload)
  }
}

async function sendViaBrevo(payload: EmailPayload, apiKey?: string): Promise<void> {
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
}

type SmtpOverrides = { host?: string; port?: string; user?: string; pass?: string }

async function sendViaSmtp(payload: EmailPayload, overrides?: SmtpOverrides): Promise<void> {
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
  await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromAddress}>`,
    to: payload.to,
    ...(payload.cc?.length ? { cc: payload.cc.join(', ') } : {}),
    ...(payload.replyTo ? { replyTo: payload.replyTo } : {}),
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
  opts?: { replyTo?: string; cc?: string[] },
): Promise<boolean> {
  const { renderEmailTemplate } = await import('@/lib/email/render')
  const rendered = await renderEmailTemplate(key, vars)
  if (!rendered) return false
  await sendEmail({ to, subject: rendered.subject, html: rendered.html, text: rendered.text, ...opts })
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
