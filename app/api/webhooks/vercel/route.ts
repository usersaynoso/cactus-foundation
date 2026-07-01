// Vercel deployment webhook handler.
// Verifies the x-vercel-signature header, then updates the Module/Theme status
// in the database when a deployment succeeds or fails.
// Pro/Enterprise only — on Hobby this endpoint is never called, and the app
// falls back to lazy polling on the Modules/Themes page.
import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { prisma } from '@/lib/db/prisma'
import { invalidateSiteConfigCache } from '@/lib/config/site'
import { markModulesDeploySucceeded, markModulesDeployFailed } from '@/lib/deploy/reconcile'
import { safeCompare } from '@/lib/auth/session'

type VercelEvent = {
  type: 'deployment.succeeded' | 'deployment.error' | 'deployment.canceled' | string
  payload?: {
    deployment?: { id: string; meta?: Record<string, string> }
  }
}

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha1', secret).update(body).digest('hex')
  return safeCompare(signature, expected)
}

export async function POST(request: NextRequest) {
  const secret = process.env.VERCEL_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 400 })
  }

  const body = await request.text()
  const sig = request.headers.get('x-vercel-signature') ?? ''

  if (!verifySignature(body, sig, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: VercelEvent
  try {
    event = JSON.parse(body) as VercelEvent
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const deploymentId = event.payload?.deployment?.id

  // Reconcile any modules left in 'deploying' against the deployment outcome.
  if (event.type === 'deployment.succeeded') {
    // Only reconcile when this event is about the deployment we're actually
    // tracking - a webhook for some unrelated deployment on the same Vercel
    // project (e.g. a manual redeploy) must not promote pendingVersion or
    // release the gate early. While the tracked marker is still the 'pending'
    // sentinel (real id not resolved yet), fall back to reconciling anyway -
    // that's the only signal we have at that point.
    const cfg = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { pendingRedeployId: true },
    })
    const tracked = cfg?.pendingRedeployId
    const isTrackedDeployment = tracked === 'pending' || (!!deploymentId && deploymentId === tracked)

    if (isTrackedDeployment) {
      await markModulesDeploySucceeded()
      // Release the deploy lock
      await prisma.deployLock.deleteMany({})
      // Deployment is live - release the redeploy gate for any non-null marker.
      await prisma.siteConfig.updateMany({
        where: { id: 'singleton', NOT: { pendingRedeployId: null } },
        data: { pendingRedeployId: null, pendingRedeployAt: null },
      })
      invalidateSiteConfigCache()
    }
  } else if (event.type === 'deployment.error' || event.type === 'deployment.canceled') {
    await markModulesDeployFailed(`Deployment ${event.type}`)
    await prisma.deployLock.deleteMany({})
    // Resolve 'pending' to the real deployment ID so the redeploying page can show failure state
    if (deploymentId) {
      await prisma.siteConfig.updateMany({
        where: { id: 'singleton', pendingRedeployId: 'pending' },
        data: { pendingRedeployId: deploymentId },
      })
      invalidateSiteConfigCache()
    }
  }

  return NextResponse.json({ ok: true })
}
