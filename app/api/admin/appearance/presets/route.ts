import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { COLOUR_PRESETS } from '@/lib/design/tokens'
import { isValidPresetTokens } from '@/lib/design/preset-validation'

export async function GET() {
  try {
    const user = await getSessionFromCookie()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const presets = await prisma.userColourPreset.findMany({ orderBy: { createdAt: 'asc' } })
    return NextResponse.json(presets)
  } catch {
    return NextResponse.json({ error: 'Failed to load presets' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionFromCookie()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const ok = await hasPermission(user, 'appearance.manage')
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { name, tokens } = await req.json()
    const trimmedName = typeof name === 'string' ? name.trim() : ''
    if (!trimmedName) return NextResponse.json({ error: 'Name required' }, { status: 400 })
    if (!isValidPresetTokens(tokens)) return NextResponse.json({ error: 'Invalid preset colours' }, { status: 400 })

    const lower = trimmedName.toLowerCase()
    if (COLOUR_PRESETS.some(p => p.name.toLowerCase() === lower)) {
      return NextResponse.json({ error: 'A default preset already uses that name' }, { status: 409 })
    }
    const existing = await prisma.userColourPreset.findMany({ select: { name: true } })
    if (existing.some(p => p.name.toLowerCase() === lower)) {
      return NextResponse.json({ error: 'A preset with that name already exists' }, { status: 409 })
    }

    const preset = await prisma.userColourPreset.create({ data: { name: trimmedName, tokens } })
    return NextResponse.json(preset, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to save preset' }, { status: 500 })
  }
}
