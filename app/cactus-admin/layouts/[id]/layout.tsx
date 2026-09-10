import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db/prisma'

// The editor is a client component and cannot export metadata, so the name of the
// layout being edited is fetched here - otherwise every open editor tab is called
// the same thing. A failed read degrades to the section name; a browser tab is
// never worth a 500 on the screen behind it.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  try {
    const layout = await prisma.layout.findUnique({ where: { id }, select: { name: true } })
    if (layout?.name) return { title: `Layouts: ${layout.name} — Admin` }
  } catch {
    // fall through
  }
  return { title: 'Layouts — Admin' }
}

export default function LayoutEditorMetadataLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
