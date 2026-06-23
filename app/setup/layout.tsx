import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Setup — Cactus CMS',
  robots: { index: false },
}

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <div className="setup-shell">{children}</div>
}
