import { isEmailConfigured } from '@/lib/config/env'

export type EmailPayload = {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
  cc?: string[]
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
// Typed email helpers
// ---------------------------------------------------------------------------

export async function sendLoginOtp(to: string, code: string, siteName: string) {
  await sendEmail({
    to,
    subject: `Your ${siteName} login code: ${code}`,
    html: `<p>Your one-time login code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`,
    text: `Your one-time login code is: ${code}\n\nThis code expires in 10 minutes.`,
  })
}

export async function sendEmailVerification(
  to: string,
  code: string,
  siteName: string
) {
  await sendEmail({
    to,
    subject: `Verify your ${siteName} email address`,
    html: `<p>Your email verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`,
    text: `Your email verification code is: ${code}\n\nThis code expires in 10 minutes.`,
  })
}

// Sent to the address the account is being moved TO. Until this code comes back,
// the account keeps its old address, so a typo here costs nothing.
export async function sendEmailChangeCode(
  to: string,
  code: string,
  siteName: string
) {
  await sendEmail({
    to,
    subject: `Confirm your new ${siteName} email address`,
    html: `<p>Your confirmation code is: <strong>${code}</strong></p><p>Enter it on the account page to finish moving your ${siteName} sign-in to this address.</p><p>This code expires in 10 minutes. If you were not expecting this, you can ignore it - nothing has changed yet.</p>`,
    text: `Your confirmation code is: ${code}\n\nEnter it on the account page to finish moving your ${siteName} sign-in to this address.\n\nThis code expires in 10 minutes. If you were not expecting this, you can ignore it - nothing has changed yet.`,
  })
}

// Sent to the address the account is moving AWAY from, so an owner whose session
// has been hijacked finds out while they can still do something about it.
export async function sendEmailChangeNotice(
  to: string,
  newEmail: string,
  siteName: string
) {
  await sendEmail({
    to,
    subject: `Someone asked to change your ${siteName} email address`,
    html: `<p>A request was made to move your ${siteName} sign-in to <strong>${newEmail}</strong>.</p><p>It will not take effect until that address is confirmed.</p><p>If this was not you, sign in and change your password now - whoever asked for this has access to your account.</p>`,
    text: `A request was made to move your ${siteName} sign-in to ${newEmail}.\n\nIt will not take effect until that address is confirmed.\n\nIf this was not you, sign in and change your password now - whoever asked for this has access to your account.`,
  })
}

export async function sendRecoveryLink(
  to: string,
  recoveryUrl: string,
  siteName: string
) {
  await sendEmail({
    to,
    subject: `${siteName} account recovery`,
    html: `<p>You requested account recovery. Use the link below to regain access:</p><p><a href="${recoveryUrl}">${recoveryUrl}</a></p><p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>`,
    text: `You requested account recovery.\n\nVisit this link to regain access:\n${recoveryUrl}\n\nThis link expires in 30 minutes. If you did not request this, you can ignore this email.`,
  })
}

export async function sendRecoveryNotification(to: string, siteName: string) {
  await sendEmail({
    to,
    subject: `${siteName} account recovery completed`,
    html: `<p>A recovery action was just completed on your account. If this was not you, please contact support immediately.</p>`,
    text: `A recovery action was just completed on your account. If this was not you, please contact support immediately.`,
  })
}

export async function sendPasswordChangedNotification(
  to: string,
  siteName: string
) {
  await sendEmail({
    to,
    subject: `${siteName} password changed`,
    html: `<p>The password on your account was just added or changed. If this was you, no further action is needed.</p><p>If this was not you, please secure your account and contact support straight away.</p>`,
    text: `The password on your account was just added or changed. If this was you, no further action is needed.\n\nIf this was not you, please secure your account and contact support straight away.`,
  })
}

function testEmailPayload(to: string, siteName: string): EmailPayload {
  return {
    to,
    subject: `${siteName} test email`,
    html: `<p>This is a test email from your ${siteName} admin settings. If you received this, outgoing email is working.</p>`,
    text: `This is a test email from your ${siteName} admin settings. If you received this, outgoing email is working.`,
  }
}

export async function sendTestEmail(to: string, siteName: string) {
  await sendEmail(testEmailPayload(to, siteName))
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
  const payload = testEmailPayload(to, siteName)
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
  await sendEmail({
    to,
    subject: `${siteName} account recovery requested`,
    html: `<p>A recovery link was just requested for your account. If this was not you, you can safely ignore this email — no changes have been made.</p>`,
    text: `A recovery link was just requested for your account. If this was not you, you can safely ignore this email — no changes have been made.`,
  })
}
