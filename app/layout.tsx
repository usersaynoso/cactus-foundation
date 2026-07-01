import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: {
    template: '%s | Cactus Foundation',
    default: 'Cactus Foundation',
  },
  description: 'A minimal, extensible CMS',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
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
      </body>
    </html>
  )
}
