'use client'

import SiteLogoClient from '@/lib/puck/components/SiteLogoClient'
import { useSiteBranding } from '@/lib/puck/useSiteBranding'

type Props = {
  homeUrl?: string
  logoHeight?: number
  showTextWithLogo?: string
  showIcon?: string
  textColor?: string
}

// SiteLogo's own Puck fields never include logoUrl/logoUrlDark/siteName - those
// come from the site's real branding (Styles > Branding), injected server-side
// at live-render time by resolveTemplateData.ts. The editor canvas has no
// server context to do that, so without this it always falls back to the
// default Cactus placeholder logo.
export default function SiteLogoEditorPreview(props: Props) {
  const { logoUrl, logoDarkUrl, siteName } = useSiteBranding()
  return <SiteLogoClient {...props} logoUrl={logoUrl} logoUrlDark={logoDarkUrl} siteName={siteName} />
}
