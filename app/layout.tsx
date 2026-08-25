import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { resolveBranding, BRANDING_DEFAULTS } from '@/lib/config/branding'
import { isSpeedInsightsEnabled } from '@/lib/config/site'
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
    // Addresses on THIS origin, not the media host the icon actually lives on.
    // /favicon.ico proxies the bytes (see app/api/branding/favicon/route.ts):
    // browsers fetch a tab icon last and at the lowest priority going, so
    // pointing them at a third-party host put it behind every product image on
    // that host, and a single dropped fetch left that page's tab blank until
    // the browser's favicon cache aged out.
    if (b.faviconDarkUrl) {
      // Both scoped by colour scheme so the favicon follows the browser/OS
      // dark setting (favicons can't read the in-site theme toggle).
      icon.push({ url: BRANDING_DEFAULTS.favIco, media: '(prefers-color-scheme: light)' })
      icon.push({ url: BRANDING_DEFAULTS.favIcoDark, media: '(prefers-color-scheme: dark)' })
    } else {
      icon.push({ url: BRANDING_DEFAULTS.favIco })
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
      shortcut: BRANDING_DEFAULTS.favIco,
      // Always this origin's address, custom icon or not: the route behind it
      // resolves the branding and proxies the bytes. Pointing straight at the
      // media host put Safari's icon fetch at the back of a queue several
      // hundred product images long on a busy category page.
      apple: BRANDING_DEFAULTS.appleTouch,
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Settings > General switch. Off means the script never reaches the page at
  // all, rather than loading and being told to keep quiet.
  const speedInsights = await isSpeedInsightsEnabled()

  // Safari 26 ignores <meta name="theme-color"> and works its browser-UI tint
  // out from the page instead. Publishing the Theme colour as a variable lets
  // globals.css and the header render hand Safari that value without changing a
  // rendered pixel. resolveBranding is cache()d, so this shares the query
  // generateMetadata already made.
  const branding = await resolveBranding()

  return (
    <html
      lang="en"
      suppressHydrationWarning
      style={{ '--cactus-theme-color': branding.themeColor } as React.CSSProperties}
    >
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
        {speedInsights && <SpeedInsights />}
      </body>
    </html>
  )
}
