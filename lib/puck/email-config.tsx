import React from 'react'
import {
  EMAIL_BLOCK_HTML,
  EMAIL_ROOT_DEFAULTS,
  emailPatternStyle,
  resolveEmailFont,
  resolveColour,
  type EmailBlockName,
  type EmailBlockProps,
  type EmailRenderContext,
  type EmailRootProps,
} from '@/lib/email/blocks'

// Puck config for the `emailWrapper` layout type.
//
// Every block renders by dropping the *same* toHtml() output the send-time
// renderer uses (lib/email/blocks.ts) through dangerouslySetInnerHTML. That is
// not laziness: it is the only way to guarantee the editor canvas and the inbox
// agree, given email markup is inline-styled tables that no amount of shared
// React components would keep in step on its own.
//
// None of the site's Puck blocks are offered here. They are built on classes and
// CSS custom properties, neither of which survives an email client.

// ---------------------------------------------------------------------------
// Editor-side render context
// ---------------------------------------------------------------------------

// The canvas needs the same palette the renderer resolves server-side. The
// editor pushes it in once the appearance tokens have loaded; until then the
// blocks fall back to their own hardcoded defaults, which is what an unstyled
// first paint should look like anyway.
let editorPalette: { colours: Record<string, string>; fonts: Record<string, string> } = { colours: {}, fonts: {} }

export function setEmailEditorPalette(palette: { colours: Record<string, string>; fonts: Record<string, string> }) {
  editorPalette = palette
}

// The blocks resolve their font from the layout's root props, and a Puck block
// render is handed only its own. The root render below is their parent on the
// canvas, so it publishes them through context - the palette above can be a
// module global because it is the same for the whole editor, but this changes as
// the owner edits it.
const EmailRootContext = React.createContext<EmailRootProps>(EMAIL_ROOT_DEFAULTS)

const PREVIEW_VARS: Record<string, string> = {
  siteName: 'Your site',
  siteUrl: 'https://example.com',
  logoUrl: '',
  year: String(new Date().getFullYear()),
}

const PREVIEW_BODY =
  '<p>This is where the message goes. Each email brings its own words - a sign-in link, an order confirmation, a welcome note - and they all land here, inside whatever you build around them.</p><p><a href="https://example.com">A link, for illustration</a></p>'

function editorContext(root: EmailRootProps): EmailRenderContext {
  return {
    bodyHtml: PREVIEW_BODY,
    vars: PREVIEW_VARS,
    colours: editorPalette.colours,
    fontFamily: resolveEmailFont(root, editorPalette.fonts),
  }
}

/** One render function per block, all of them the same three lines. */
function blockRender(name: EmailBlockName) {
  return function EmailBlockPreview(props: EmailBlockProps & { puck?: unknown }) {
    const { puck: _puck, ...rest } = props
    const root = React.useContext(EmailRootContext)
    const html = EMAIL_BLOCK_HTML[name](rest, editorContext(root))
    if (!html) {
      return (
        <div style={{ padding: '12px 24px', color: 'var(--color-text-muted)', fontSize: '0.8125rem', fontStyle: 'italic' }}>
          Nothing to show yet - fill this block in on the right.
        </div>
      )
    }
    return <div dangerouslySetInnerHTML={{ __html: html }} />
  }
}

// ---------------------------------------------------------------------------
// Shared field shapes
// ---------------------------------------------------------------------------

const alignField = {
  type: 'select' as const,
  label: 'Alignment',
  options: [
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Centre' },
    { value: 'right', label: 'Right' },
  ],
}

// A plain text field rather than the site colour picker: the value that leaves
// here has to be something an email client can read, so it holds either a design
// token id (resolved to that token's light value at send time) or a literal hex.
const colourField = (label: string) => ({
  type: 'text' as const,
  label,
})

const paddingFields = {
  paddingY: { type: 'number' as const, label: 'Space above and below (px)', min: 0, max: 120 },
  paddingX: { type: 'number' as const, label: 'Space left and right (px)', min: 0, max: 80 },
}

const paddingDefaults = { paddingY: 12, paddingX: 24 }

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

const components = {
  EmailBodySlot: {
    label: 'Message',
    fields: {
      textColour: colourField('Text colour (token id or hex)'),
      fontSize: { type: 'number' as const, label: 'Text size (px)', min: 10, max: 24 },
      ...paddingFields,
    },
    defaultProps: { textColour: '', fontSize: 16, paddingY: 8, paddingX: 24 },
    render: blockRender('EmailBodySlot'),
  },
  EmailLogo: {
    label: 'Logo',
    fields: {
      src: { type: 'text' as const, label: 'Logo image URL (leave blank for the site logo)' },
      href: { type: 'text' as const, label: 'Links to' },
      alt: { type: 'text' as const, label: 'Alt text' },
      width: { type: 'number' as const, label: 'Width (px)', min: 40, max: 600 },
      align: alignField,
      textColour: colourField('Fallback text colour (token id or hex)'),
      ...paddingFields,
    },
    defaultProps: { src: '', href: '{{siteUrl}}', alt: '', width: 160, align: 'center', textColour: '', paddingY: 24, paddingX: 24 },
    render: blockRender('EmailLogo'),
  },
  EmailHeading: {
    label: 'Heading',
    fields: {
      text: { type: 'text' as const, label: 'Heading' },
      level: {
        type: 'select' as const,
        label: 'Size',
        options: [
          { value: 'h1', label: 'Large' },
          { value: 'h2', label: 'Medium' },
          { value: 'h3', label: 'Small' },
        ],
      },
      fontSize: { type: 'number' as const, label: 'Text size (px)', min: 12, max: 48 },
      textColour: colourField('Text colour (token id or hex)'),
      align: alignField,
      ...paddingFields,
    },
    defaultProps: { text: '', level: 'h2', fontSize: 22, textColour: '', align: 'left', ...paddingDefaults },
    render: blockRender('EmailHeading'),
  },
  EmailText: {
    label: 'Text',
    fields: {
      html: { type: 'textarea' as const, label: 'Text (HTML allowed)' },
      fontSize: { type: 'number' as const, label: 'Text size (px)', min: 10, max: 24 },
      textColour: colourField('Text colour (token id or hex)'),
      align: alignField,
      ...paddingFields,
    },
    defaultProps: { html: '', fontSize: 16, textColour: '', align: 'left', ...paddingDefaults },
    render: blockRender('EmailText'),
  },
  EmailButton: {
    label: 'Button',
    fields: {
      label: { type: 'text' as const, label: 'Button text' },
      href: { type: 'text' as const, label: 'Links to' },
      background: colourField('Background (token id or hex)'),
      textColour: colourField('Text colour (token id or hex)'),
      radius: { type: 'number' as const, label: 'Corner rounding (px)', min: 0, max: 40 },
      fontSize: { type: 'number' as const, label: 'Text size (px)', min: 10, max: 24 },
      align: alignField,
      ...paddingFields,
    },
    defaultProps: { label: '', href: '', background: 'primary', textColour: '#ffffff', radius: 6, fontSize: 16, align: 'center', paddingY: 16, paddingX: 24 },
    render: blockRender('EmailButton'),
  },
  EmailImage: {
    label: 'Image',
    fields: {
      src: { type: 'text' as const, label: 'Image URL' },
      href: { type: 'text' as const, label: 'Links to' },
      alt: { type: 'text' as const, label: 'Alt text' },
      width: { type: 'number' as const, label: 'Width (px)', min: 40, max: 800 },
      radius: { type: 'number' as const, label: 'Corner rounding (px)', min: 0, max: 40 },
      align: alignField,
      ...paddingFields,
    },
    defaultProps: { src: '', href: '', alt: '', width: 520, radius: 0, align: 'center', ...paddingDefaults },
    render: blockRender('EmailImage'),
  },
  EmailDivider: {
    label: 'Divider',
    fields: {
      colour: colourField('Line colour (token id or hex)'),
      thickness: { type: 'number' as const, label: 'Thickness (px)', min: 1, max: 8 },
      ...paddingFields,
    },
    defaultProps: { colour: '', thickness: 1, ...paddingDefaults },
    render: blockRender('EmailDivider'),
  },
  EmailSpacer: {
    label: 'Space',
    fields: {
      height: { type: 'number' as const, label: 'Height (px)', min: 4, max: 120 },
    },
    defaultProps: { height: 24 },
    render: blockRender('EmailSpacer'),
  },
  EmailTwoColumn: {
    label: 'Two columns',
    fields: {
      leftHtml: { type: 'textarea' as const, label: 'Left column (HTML allowed)' },
      rightHtml: { type: 'textarea' as const, label: 'Right column (HTML allowed)' },
      gap: { type: 'number' as const, label: 'Gap between columns (px)', min: 0, max: 64 },
      fontSize: { type: 'number' as const, label: 'Text size (px)', min: 10, max: 24 },
      textColour: colourField('Text colour (token id or hex)'),
      ...paddingFields,
    },
    defaultProps: { leftHtml: '', rightHtml: '', gap: 16, fontSize: 15, textColour: '', ...paddingDefaults },
    render: blockRender('EmailTwoColumn'),
  },
  EmailSocialRow: {
    label: 'Social links',
    fields: {
      links: {
        type: 'array' as const,
        label: 'Links',
        arrayFields: {
          label: { type: 'text' as const, label: 'Label' },
          href: { type: 'text' as const, label: 'URL' },
        },
        getItemSummary: (item: { label?: string }) => item?.label || 'Link',
      },
      fontSize: { type: 'number' as const, label: 'Text size (px)', min: 10, max: 20 },
      textColour: colourField('Text colour (token id or hex)'),
      align: alignField,
      ...paddingFields,
    },
    defaultProps: { links: [], fontSize: 14, textColour: '', align: 'center', ...paddingDefaults },
    render: blockRender('EmailSocialRow'),
  },
  EmailFooterText: {
    label: 'Small print',
    fields: {
      html: { type: 'textarea' as const, label: 'Text (HTML allowed)' },
      fontSize: { type: 'number' as const, label: 'Text size (px)', min: 8, max: 18 },
      textColour: colourField('Text colour (token id or hex)'),
      align: alignField,
      ...paddingFields,
    },
    defaultProps: { html: '&copy; {{year}} {{siteName}}', fontSize: 12, textColour: '', align: 'center', paddingY: 16, paddingX: 24 },
    render: blockRender('EmailFooterText'),
  },
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

// Visual twin of emailShell() in lib/email/blocks.ts. It has to be a React tree
// rather than that function's HTML string because Puck's canvas drops the block
// list in as children - so the values are read from the same props and kept in
// step by hand. Block markup, which is the part that actually has to survive an
// inbox, still comes from one place.
// `background-image:url(x);background-repeat:repeat;` -> { backgroundImage: …,
// backgroundRepeat: … }. Only ever fed the output of emailPatternStyle, which is
// a fixed handful of declarations with no nested semicolons.
function styleObject(css: string): React.CSSProperties {
  const out: Record<string, string> = {}
  for (const decl of css.split(';')) {
    const i = decl.indexOf(':')
    if (i < 1) continue
    const prop = decl.slice(0, i).trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    out[prop] = decl.slice(i + 1).trim()
  }
  return out as React.CSSProperties
}

function EmailRoot({ children, ...props }: EmailRootProps & { children?: React.ReactNode }) {
  const root: EmailRootProps = { ...EMAIL_ROOT_DEFAULTS, ...props }
  const ctx = editorContext(root)
  const pageBg = resolveColour(typeof root.pageBackground === 'string' ? root.pageBackground : '', ctx, '#f4f4f5')
  const cardBg = resolveColour(typeof root.cardBackground === 'string' ? root.cardBackground : '', ctx, '#ffffff')
  const borderColour = resolveColour(typeof root.cardBorderColour === 'string' ? root.cardBorderColour : '', ctx, '')
  const width = Number(root.contentWidth) || 600
  const radius = Number(root.cardRadius) || 0
  const outerPad = Number(root.outerPadding) || 0

  // The pattern's inline declarations come from the same function the sent email
  // uses, parsed back into React's style object so the canvas cannot drift from
  // the inbox. Light arm only: the canvas is not a mail client, and the dark one
  // is a media query the sent document carries in its own <style>.
  const patternStyle = styleObject(emailPatternStyle(root))

  return (
    <EmailRootContext.Provider value={root}>
      <div style={{ background: pageBg, ...patternStyle, padding: `${outerPad}px 12px`, minHeight: '100%' }}>
        <div
          style={{
            maxWidth: width,
            margin: '0 auto',
            background: cardBg,
            borderRadius: radius || undefined,
            border: borderColour ? `1px solid ${borderColour}` : undefined,
            overflow: 'hidden',
          }}
        >
          {children}
        </div>
      </div>
    </EmailRootContext.Provider>
  )
}

export const emailPuckConfig = {
  categories: {
    message: { title: 'Message', components: ['EmailBodySlot'], defaultExpanded: true },
    content: { title: 'Content', components: ['EmailHeading', 'EmailText', 'EmailButton', 'EmailImage', 'EmailTwoColumn'], defaultExpanded: true },
    chrome: { title: 'Header and footer', components: ['EmailLogo', 'EmailSocialRow', 'EmailFooterText'], defaultExpanded: true },
    spacing: { title: 'Spacing', components: ['EmailDivider', 'EmailSpacer'], defaultExpanded: false },
  },
  root: {
    fields: {
      preheader: { type: 'text' as const, label: 'Preview line (shown next to the subject in the inbox)' },
      pageBackground: colourField('Page background (token id or hex)'),
      // Swapped for the media library picker by withImagePickerFields, same as
      // the site's blocks. The URL an email carries has to be absolute, which is
      // exactly what the picker stores, and a hand-typed relative path is
      // refused at render rather than sent as a broken image.
      patternImage: { type: 'text' as const, label: 'Background pattern (image or SVG)' },
      patternImageDark: { type: 'text' as const, label: 'Background pattern in dark mode (Apple Mail and Outlook for Mac only)' },
      patternSize: { type: 'number' as const, label: 'Pattern size (px, blank for the image\u2019s own size)', min: 0, max: 2000 },
      patternSizeDark: { type: 'number' as const, label: 'Pattern size in dark mode (px, blank = same as light)', min: 0, max: 2000 },
      cardBackground: colourField('Card background (token id or hex)'),
      cardBorderColour: colourField('Card border (token id or hex, blank for none)'),
      contentWidth: { type: 'number' as const, label: 'Card width (px)', min: 320, max: 800 },
      cardRadius: { type: 'number' as const, label: 'Card corner rounding (px)', min: 0, max: 40 },
      outerPadding: { type: 'number' as const, label: 'Space around the card (px)', min: 0, max: 80 },
      fontFamily: { type: 'text' as const, label: 'Font (token id, or a full font stack)' },
    },
    defaultProps: { ...EMAIL_ROOT_DEFAULTS, preheader: '' },
    render: EmailRoot,
  },
  components,
}

export type EmailPuckConfig = typeof emailPuckConfig
