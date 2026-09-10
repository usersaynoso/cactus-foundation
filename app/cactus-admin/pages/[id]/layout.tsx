import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db/prisma'

// Client editor: the page's own title has to be resolved here, or a browser full
// of half-edited pages shows one indistinguishable entry per tab.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  try {
    const page = await prisma.infoPage.findUnique({ where: { id }, select: { title: true } })
    if (page?.title) return { title: `Pages: ${page.title} — Admin` }
  } catch {
    // fall through
  }
  return { title: 'Pages — Admin' }
}

export default function PageEditorMetadataLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
