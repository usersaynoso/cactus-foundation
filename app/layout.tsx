import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { resolveBranding, BRANDING_DEFAULTS } from '@/lib/config/branding'
import './globals.css'

type IconEntry = { url: string; type?: string; sizes?: string; media?: string }

// Root-level metadata so the site's icons + app name apply on EVERY route
// (public pages, status/error pages and the admin area alike) - not just the
// public layout. A custom favicon fully replaces the Cactus svg/png/ico set, so
// browsers no longer fall back to the default cactus icon. The web-app manifest
// is generated separately by app/manifest.ts (Next auto-links it).
export async function generateMetadata(): Promise<Metadata> {
  const b = await resolveBranding()

  const icon: IconEntry[] = []
  if (b.faviconUrl) {
    if (b.faviconDarkUrl) {
      // Both scoped by colour scheme so the favicon follows the browser/OS
      // dark setting (favicons can't read the in-site theme toggle).
      icon.push({ url: b.faviconUrl, media: '(prefers-color-scheme: light)' })
      icon.push({ url: b.faviconDarkUrl, media: '(prefers-color-scheme: dark)' })
    } else {
      icon.push({ url: b.faviconUrl })
    }
  } else {
    icon.push({ url: BRANDING_DEFAULTS.faviconSvg, type: 'image/svg+xml' })
    icon.push({ url: BRANDING_DEFAULTS.faviconPng, sizes: '96x96', type: 'image/png' })
  }

  return {
    title: { template: `%s | ${b.name}`, default: b.name },
    description: 'A minimal, extensible CMS',
    icons: {
      icon,
      shortcut: b.faviconUrl ?? BRANDING_DEFAULTS.favIco,
      apple: b.appleTouchUrl ?? BRANDING_DEFAULTS.appleTouch,
    },
    appleWebApp: {
      title: b.shortName,
    },
  }
}

export async function generateViewport(): Promise<Viewport> {
  const b = await resolveBranding()
  return { themeColor: b.themeColor }
}

const flashPreventionScript = `(function(){var t=localStorage.getItem('cactus-theme')||'auto';var d=document.documentElement;if(t==='dark'||(t==='auto'&&window.matchMedia('(prefers-color-scheme:dark)').matches)){d.setAttribute('data-theme','dark');}else{d.setAttribute('data-theme','light');}})();`

// Reads cactus-consent cookie and initialises window.__cactusConsent before any body script runs.
// Non-necessary categories default to false (deny-by-default) until visitor makes a choice.
const consentInitScript = `(function(){var c='';var cs=document.cookie.split(';');for(var i=0;i<cs.length;i++){var s=cs[i].trim();if(s.startsWith('cactus-consent=')){c=s.slice('cactus-consent='.length);break;}}var d={};if(c){try{d=JSON.parse(decodeURIComponent(c)).decision||{};}catch(e){}}window.__cactusConsent=Object.assign({necessary:true},d);window.cactusConsent=window.cactusConsent||{open:function(){},hasConsent:function(k){return!!window.__cactusConsent[k];},onChange:function(){return function(){};}};})();`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router: layout.tsx is the correct place for fonts; this rule was written for Pages Router */}
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wdth,wght@0,75..100,400..700;1,75..100,400..700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: flashPreventionScript }} />
        <Script id="consent-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: consentInitScript }} />
        {children}
        <SpeedInsights />
      </body>
    </html>
  )
}
