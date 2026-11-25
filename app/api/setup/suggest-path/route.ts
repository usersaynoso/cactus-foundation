import { NextResponse } from 'next/server'
import { setupClosedResponse } from '@/lib/setup/setup-gate'
import { generateSuggestedAdminPath } from '@/lib/config/site'

export async function GET() {
  const closed = await setupClosedResponse()
  if (closed) return closed
  return NextResponse.json({ path: generateSuggestedAdminPath() })
}
