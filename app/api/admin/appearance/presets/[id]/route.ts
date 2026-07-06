import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { isValidPresetTokens } from '@/lib/design/preset-validation'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  try {
    const user = await getSessionFromCookie()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const ok = await hasPermission(user, 'appearance.manage')
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const existingRow = await prisma.userColourPreset.findUnique({ where: { id } })
    if (!existingRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { tokens } = await req.json()
    if (!isValidPresetTokens(tokens)) return NextResponse.json({ error: 'Invalid preset colours' }, { status: 400 })

    const preset = await prisma.userColourPreset.update({ where: { id }, data: { tokens } })
    return NextResponse.json(preset)
  } catch {
    return NextResponse.json({ error: 'Failed to update preset' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params
  try {
    const user = await getSessionFromCookie()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const ok = await hasPermission(user, 'appearance.manage')
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const existingRow = await prisma.userColourPreset.findUnique({ where: { id }, select: { id: true } })
    if (!existingRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.userColourPreset.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete preset' }, { status: 500 })
  }
}
