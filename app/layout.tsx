import type { Metadata, Viewport } from 'next'
import { mediaPublicOrigin } from '@/lib/media/public-origin'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { resolveBranding } from '@/lib/config/branding'
import { iconLinksFor } from '@/lib/config/favicon-variants'
import { isSpeedInsightsEnabled } from '@/lib/config/site'
import { detectHostingProvider } from '@/lib/hosting/provider'
import { resolveSiteUrl } from '@/lib/seo/site-url'
import './globals.css'

// Root-level metadata so the site's icons + app name apply on EVERY route
// (public pages, status/error pages and the admin area alike) - not just the
// public layout. The web-app manifest is generated separately by app/manifest.ts
// (Next auto-links it).
//
// The icon links are decided by iconLinksFor() in lib/config/favicon-variants.ts,
// which is where the rules live and are tested. The short version: a branded site
// links only its own addresses (each drawn by the icon route in exactly the
// format it is labelled with), and a failed branding read links those same
// addresses rather than the Cactus files - pages are held by Next and the CDN,
// so whatever this writes during a database blip is what visitors see for hours.
export async function generateMetadata(): Promise<Metadata> {
  const b = await resolveBranding()
  const links = iconLinksFor({ known: b.state !== 'unavailable', icons: b.icons, version: b.iconVersion })

  // Every relative URL in page metadata - og:image, the canonical link - is
  // resolved against this. Without it Next resolves them against localhost and
  // warns at build, so a shared link advertised a social image nobody outside
  // the build machine could fetch.
  const siteUrl = resolveSiteUrl()

  // The same rule for the site's NAME as for its icon: a failed read must not
  // write "Cactus Foundation" into a page title that Next and the CDN then hold.
  // With nothing known, page titles stand alone and the default is the site's
  // own address.
  const known = b.state !== 'unavailable'
  const fallbackName = siteUrl ? new URL(siteUrl).hostname.replace(/^www\./, '') : ''
  const title = known
    ? { template: `%s | ${b.name}`, default: b.name }
    : { template: '%s', default: fallbackName }

  return {
    ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
    title,
    description: 'A minimal, extensible CMS',
    icons: {
      icon: links.icon,
      shortcut: links.shortcut,
      // Always this origin's address, never the media host's: pointing straight
      // at the media host put Safari's icon fetch at the back of a queue several
      // hundred product images long on a busy category page.
      apple: links.apple,
    },
    ...(known ? { appleWebApp: { title: b.shortName } } : {}),
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
  // all, rather than loading and being told to keep quiet. Speed Insights is a
  // Vercel service, so anywhere else (Netlify, a server) it stays off whatever the
  // switch says - the script would only ask for an endpoint that is not there.
  // Local development keeps the switch, as it always has.
  const host = detectHostingProvider()
  const speedInsights = (host === 'vercel' || host === null) && (await isSpeedInsightsEnabled())

  // Safari 26 ignores <meta name="theme-color"> and works its browser-UI tint
  // out from the page instead. Publishing the Theme colour as a variable lets
  // globals.css and the header render hand Safari that value without changing a
  // rendered pixel. resolveBranding is cache()d, so this shares the query
  // generateMetadata already made.
  const branding = await resolveBranding()

  // The host this install's photography is served from, named early so the
  // connection to it is open by the time the first <img> is parsed. Null on an
  // install with no separate media host - see lib/media/public-origin.ts.
  const mediaOrigin = mediaPublicOrigin()

  return (
    <html
      lang="en"
      suppressHydrationWarning
      style={{ '--cactus-theme-color': branding.themeColor } as React.CSSProperties}
    >
      <head>
        {/* Plain inline scripts, first thing in the head, and deliberately not
            next/script. In the App Router `strategy="beforeInteractive"` does not
            run a script before anything: it queues it on self.__next_s for Next's
            runtime to run once its main chunk has downloaded, measured on
            deskwell.co.uk in September 2026. So data-theme was set after the page
            had painted, and a visitor whose saved theme differed from their
            device's setting saw the wrong one first. The CSS's own
            prefers-color-scheme fallback hid that from everyone on "auto".
            A parser-blocking inline script here costs a few hundred bytes and runs
            before the body exists, which is the whole point of both of them. The
            site's CSP already allows inline scripts. */}
        <script id="theme-init" dangerouslySetInnerHTML={{ __html: flashPreventionScript }} />
        <script id="consent-init" dangerouslySetInnerHTML={{ __html: consentInitScript }} />
        {/* No crossOrigin, unlike the font one below: pictures are fetched in
            no-cors mode, and a connection opened in CORS mode is a different
            pool the <img> requests would not reuse - the tag would look right
            and buy nothing. */}
        {mediaOrigin && <link rel="preconnect" href={mediaOrigin} />}
        {/* No font-host preconnects, and no hardcoded font request either.
            Both used to be here and both were costing every page on every install.

            The hardcoded pair was Instrument Sans and JetBrains Mono - the ADMIN's
            typefaces - on a layout that wraps the whole site, so a shopper paid a
            render-blocking third-party round trip for two faces the storefront
            never draws a character in. They load from the admin layout now.

            The preconnects went with them because a public page no longer asks
            Google for anything: its stylesheet and its font files both come from
            this site's own origin (app/api/fonts/**, see lib/design/font-proxy.ts).
            Naming a host nothing connects to only costs a speculative handshake.
            The admin and setup layouts, which DO still ask Google directly, carry
            their own preconnects. */}
      </head>
      <body>
        {children}
        {speedInsights && <SpeedInsights />}
      </body>
    </html>
  )
}
