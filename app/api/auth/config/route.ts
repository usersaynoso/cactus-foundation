import { NextResponse } from 'next/server'
import { isEmailConfigured, isTurnstileConfigured } from '@/lib/config/env'

// Public endpoint — returns which auth features are available.
// Used by the login page to conditionally show password login.
export async function GET() {
  return NextResponse.json({
    emailConfigured: isEmailConfigured(),
    turnstileConfigured: isTurnstileConfigured(),
    turnstileSiteKey: isTurnstileConfigured() ? process.env.TURNSTILE_SITE_KEY : null,
    neonProjectId: process.env.NEON_PROJECT_ID ?? null,
  })
}
