import type { ReactNode } from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Layouts: New — Admin' }

export default function NewLayoutLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
