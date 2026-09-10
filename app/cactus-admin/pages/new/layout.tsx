import type { ReactNode } from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Pages: New — Admin' }

export default function NewPageLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
