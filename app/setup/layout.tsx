import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { absolute: 'Cactus Setup' },
  robots: { index: false },
}

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <div className="setup-shell">{children}</div>
}
