import Nav from './Nav'
import Footer from './Footer'
import type { PublicMenuItem } from '@/lib/menu/resolve'

type Props = {
  children: React.ReactNode
  siteName?: string
  privacyPolicySlug?: string | null
  termsSlug?: string | null
  mainMenu?: PublicMenuItem[]
}

export default function PricklyLayout({
  children,
  siteName = 'Cactus',
  privacyPolicySlug,
  termsSlug,
  mainMenu = [],
}: Props) {
  return (
    <div className="prickly-shell">
      <Nav siteName={siteName} mainMenu={mainMenu} />
      <main className="prickly-main">{children}</main>
      <Footer
        siteName={siteName}
        privacyPolicySlug={privacyPolicySlug}
        termsSlug={termsSlug}
      />
    </div>
  )
}
