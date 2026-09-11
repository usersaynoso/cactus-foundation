import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { absolute: 'Cactus Foundation Setup' },
  robots: { index: false },
}

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="setup-shell">
      {/* The wizard wears the admin design system, so it wants the admin's
          typefaces. It cannot inherit them from the root layout any more - see the
          note there - and it has no site design tokens to read, because the site
          it is setting up does not exist yet. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router: a layout is the correct place for fonts; this rule was written for the Pages Router */}
      <link
        href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wdth,wght@0,75..100,400..700;1,75..100,400..700&display=swap"
        rel="stylesheet"
      />
      {children}
    </div>
  )
}
