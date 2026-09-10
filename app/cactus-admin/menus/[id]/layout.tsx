import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db/prisma'

// Client editor, same as the layouts one: the menu's name has to be resolved here
// or every open menu reads "Menus" in the browser's history.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  try {
    const menu = await prisma.menu.findUnique({ where: { id }, select: { name: true } })
    if (menu?.name) return { title: `Menus: ${menu.name} — Admin` }
  } catch {
    // fall through
  }
  return { title: 'Menus — Admin' }
}

export default function MenuEditorMetadataLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
