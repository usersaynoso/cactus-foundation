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

async function sendViaBrevo(payload: EmailPayload): Promise<void> {
  const config = await getEmailConfig()
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY!,
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

async function sendViaSmtp(payload: EmailPayload): Promise<void> {
  const { createTransport } = await import('nodemailer')
  const config = await getEmailConfig()
  const transporter = createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
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
  return {
    fromName: config?.emailFromName ?? config?.siteName ?? 'Cactus Foundation',
    fromAddress: config?.emailFromAddress ?? 'noreply@example.com',
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
