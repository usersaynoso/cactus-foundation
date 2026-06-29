import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    template: '%s | Cactus CMS',
    default: 'Cactus CMS',
  },
  description: 'A minimal, extensible CMS',
}

const flashPreventionScript = `(function(){var t=localStorage.getItem('cactus-theme')||'auto';var d=document.documentElement;if(t==='dark'||(t==='auto'&&window.matchMedia('(prefers-color-scheme:dark)').matches)){d.setAttribute('data-theme','dark');}else{d.setAttribute('data-theme','light');}})();`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: flashPreventionScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wdth,wght@0,75..100,400..700;1,75..100,400..700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}
