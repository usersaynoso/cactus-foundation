// RSC-only Puck config variants, split out of lib/puck/config.tsx. These pull
// in next/headers transitively (getSessionFromCookie, getMemberFromCookie via
// MembersBlocksRsc.tsx and module Puck blocks like BoardHeaderBlock.rsc.tsx),
// which Next.js rejects the moment it's reachable from a client bundle.
// config.tsx is imported directly by the client Puck editors (PuckEditor.tsx,
// LayoutPuckEditor.tsx), so none of that can live there — only here, where
// every consumer is a Server Component.

import React, { cache } from 'react'
import {
  puckConfig,
  footerPuckConfig,
  layoutPuckConfig,
  headerPuckConfig,
  getModuleLayoutSharedParts,
  getModuleLayoutEditorPreview,
  wrapResponsiveRender,
  richTextContentToHtml,
  richTextColourCss,
  richTextFontSize,
  richTextSpacingStyle,
  getPaddingClasses,
  getAosProps,
  getStickyStyle,
  SiteLogoRsc,
  withoutVerticalSpaceComponents,
} from '@/lib/puck/config.core'
// config.core, NOT config: the wrapper in config.tsx imports the module block
// CLIENT map, and importing it from here would put all 118 of those components
// into the browser bundle of every public page - which is exactly what this
// split exists to stop. Nothing here needs them: every module block's RSC half
// is spread over the core config below. Guarded by config.core.test.ts.
import { sanitizeRichText, sanitizeAndObfuscateRichText } from '@/lib/sanitize'
import { getSiteConfig } from '@/lib/config/site'
import { prisma } from '@/lib/db/prisma'
import { moduleRscComponents, moduleRscComponentsByLayoutType } from '@/lib/puck/module-rsc-components'
// Page settings a module declares for its own layout types. Client-safe by
// contract (see the generator), so importing it here costs nothing on either side.
import { moduleLayoutRoots } from '@/lib/puck/module-layout-roots'
// And the hand-written map for the layout types core itself owns - the shared
// document footer. Client-safe by the same contract.
import { coreLayoutRoots } from '@/lib/puck/core-layout-roots'
import { LayoutEmbedRsc } from '@/lib/puck/components/LayoutEmbedRsc'
import { IconLinkRsc } from '@/lib/puck/components/IconLinkRsc'
import { ThemeToggleRsc } from '@/lib/puck/components/ThemeToggleRsc'
import {
  MembersLoginRsc,
  MembersRegisterRsc,
  MembersAccountLinkRsc,
  MembersSignInRsc,
  MemberGateRsc,
  TrustedMemberGateRsc,
  MembersProfileRsc,
} from '@/lib/puck/components/MembersBlocksRsc'

// Module RSC components arrive as raw {render} defs from the generated
// module-rsc-components.ts, replacing the editor defs that config.tsx already
// wrapped with the responsive-visibility handling. Re-wrap them here the same
// way the explicit SiteLogo/Members*/LayoutEmbed overrides below are wrapped,
// otherwise a module block's "hide on mobile/tablet/desktop" setting works in
// the editor but is silently ignored on the published site.
function wrapModuleRsc(components: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(components).map(([name, def]) => [name, { ...def, render: wrapResponsiveRender(def.render) }]),
  )
}
// RichText on a published page. Same markup and classes as the editor's version
// in config.tsx - the only difference is that the HTML is run through the
// DOMPurify allow-list on the way out.
//
// It has to happen here rather than in config.tsx: the block's content is either
// a raw HTML string or TipTap JSON, both fed straight to dangerouslySetInnerHTML,
// and nothing upstream escapes them. config.tsx is imported by the client Puck
// editors, so it cannot import the sanitiser (jsdom would follow it into the
// browser bundle) - but every published render path goes through this file.
function RichTextBlockRsc(props: { id?: string; content?: unknown; padding?: any; textColor?: string; linkColor?: string; linkHoverColor?: string; bulletIcon?: string; bulletColor?: string; fontSize?: string; spaceAbove?: string; spaceBelow?: string; spaceAbovePx?: string; spaceBelowPx?: string; paraSpace?: string; sticky?: string; stickyOffset?: string; animationType?: string; animationDuration?: string; animationDelay?: string; puck?: { isEditing?: boolean } }) {
  const { id, content, padding, textColor, linkColor, linkHoverColor, bulletIcon, bulletColor, fontSize, sticky, stickyOffset, animationType, animationDuration, animationDelay, puck } = props
  if (!content) {
    return (
      <div className={getPaddingClasses(padding)} style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>
        Rich text — edit in the panel
      </div>
    )
  }
  // Sanitise first, obfuscate after (sanitizeAndObfuscateRichText). Passing
  // obfuscate=true into richTextContentToHtml here was the bug: DOMPurify's
  // re-serialisation decoded the obfuscator's entity-encoded addresses, so the
  // plain address was served in view-source on every published RichText.
  const raw = richTextContentToHtml(content, false)
  const html = puck?.isEditing ? sanitizeRichText(raw) : sanitizeAndObfuscateRichText(raw)
  // Mirrors the editor render in config.tsx: the block's "Text colour" is a
  // scoped stylesheet rule (richTextColourCss), not an inline style, because the
  // globals.css `.puck-richtext …` rules set explicit colours a wrapper style
  // couldn't cascade past. Same helper, so editor and published markup agree.
  // Sticky and scroll-animation attrs come from the same shared helpers too.
  const colourCss = richTextColourCss(id, { textColor, linkColor, linkHoverColor, bulletIcon, bulletColor })
  // Same helper as the editor render, for the same reason the colour CSS is:
  // editor DOM and published DOM must agree, and a size applied here but not
  // there is a footer that looks right in the builder and wrong in the PDF.
  const style = { ...getStickyStyle(sticky, stickyOffset), ...(richTextFontSize(fontSize) ?? {}), ...richTextSpacingStyle(props) }
  return (
    <div className={`puck-richtext ${getPaddingClasses(padding)}`} data-richtext-id={id} {...getAosProps(animationType ?? 'none', animationDuration ?? 'normal', animationDelay ?? 'none')} style={style}>
      {colourCss && <style>{colourCss}</style>}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

// Every published config variant renders RichText the same sanitised way. Also
// swaps the editor's richtext field for a plain textarea, as this file already
// did - the RSC configs are never handed to the editor, and the richtext field
// type drags the TipTap editor in with it.
function withSafeRichText(components: Record<string, any>): Record<string, any> {
  const base = components.RichTextBlock
  if (!base) return components
  return {
    ...components,
    RichTextBlock: {
      ...base,
      fields: { ...base.fields, content: { type: 'textarea' as const, label: 'Content (HTML)' } },
      render: wrapResponsiveRender(RichTextBlockRsc),
    },
  }
}

const moduleRscComponentsWrapped = wrapModuleRsc(moduleRscComponents)
const moduleRscByLayoutTypeWrapped = Object.fromEntries(
  Object.entries(moduleRscComponentsByLayoutType).map(([type, comps]) => [type, wrapModuleRsc(comps as Record<string, any>)]),
) as Record<string, Record<string, any>>

const rscComponents = withSafeRichText({
  ...puckConfig.components,
  SiteLogo: { ...puckConfig.components.SiteLogo, render: wrapResponsiveRender(SiteLogoRsc) },
  MembersLogin: { ...puckConfig.components.MembersLogin, render: wrapResponsiveRender(MembersLoginRsc) },
  MembersRegister: { ...puckConfig.components.MembersRegister, render: wrapResponsiveRender(MembersRegisterRsc) },
  MembersAccountLink: { ...puckConfig.components.MembersAccountLink, render: wrapResponsiveRender(MembersAccountLinkRsc) },
  MembersSignIn: { ...puckConfig.components.MembersSignIn, render: wrapResponsiveRender(MembersSignInRsc) },
  MemberGate: { ...puckConfig.components.MemberGate, render: wrapResponsiveRender(MemberGateRsc) },
  TrustedMemberGate: { ...puckConfig.components.TrustedMemberGate, render: wrapResponsiveRender(TrustedMemberGateRsc) },
  MembersProfile: { ...puckConfig.components.MembersProfile, render: wrapResponsiveRender(MembersProfileRsc) },
  LayoutEmbed: { ...puckConfig.components.LayoutEmbed, render: wrapResponsiveRender(LayoutEmbedRsc) },
  // Published render carries the 'Admins only' audience gate (session cookie
  // read), which the editor-safe render in config.tsx cannot.
  IconLink: { ...puckConfig.components.IconLink, render: wrapResponsiveRender(IconLinkRsc) },
  ThemeToggle: { ...puckConfig.components.ThemeToggle, render: wrapResponsiveRender(ThemeToggleRsc) },
  ...moduleRscComponentsWrapped,
})

export const puckRscConfig = { ...puckConfig, components: rscComponents }

export const footerPuckRscConfig = {
  ...footerPuckConfig,
  components: withSafeRichText({
    ...footerPuckConfig.components,
    SiteLogo: { ...footerPuckConfig.components.SiteLogo, render: wrapResponsiveRender(SiteLogoRsc) },
    IconLink: { ...footerPuckConfig.components.IconLink, render: wrapResponsiveRender(IconLinkRsc) },
    // RSC render halves for any module blocks that opted into the footer
    // (layoutTypes: ["footer"]) — same mechanism the header has below.
    ...(moduleRscByLayoutTypeWrapped['footer'] ?? {}),
  }),
}

export const layoutPuckRscConfig = {
  ...layoutPuckConfig,
  components: withSafeRichText({
    ...layoutPuckConfig.components,
    SiteLogo: { ...layoutPuckConfig.components.SiteLogo, render: wrapResponsiveRender(SiteLogoRsc) },
    MembersLogin: { ...layoutPuckConfig.components.MembersLogin, render: wrapResponsiveRender(MembersLoginRsc) },
    MembersRegister: { ...layoutPuckConfig.components.MembersRegister, render: wrapResponsiveRender(MembersRegisterRsc) },
    MembersAccountLink: { ...layoutPuckConfig.components.MembersAccountLink, render: wrapResponsiveRender(MembersAccountLinkRsc) },
    MembersSignIn: { ...layoutPuckConfig.components.MembersSignIn, render: wrapResponsiveRender(MembersSignInRsc) },
    MemberGate: { ...layoutPuckConfig.components.MemberGate, render: wrapResponsiveRender(MemberGateRsc) },
    TrustedMemberGate: { ...layoutPuckConfig.components.TrustedMemberGate, render: wrapResponsiveRender(TrustedMemberGateRsc) },
    MembersProfile: { ...layoutPuckConfig.components.MembersProfile, render: wrapResponsiveRender(MembersProfileRsc) },
    IconLink: { ...layoutPuckConfig.components.IconLink, render: wrapResponsiveRender(IconLinkRsc) },
    ThemeToggle: { ...layoutPuckConfig.components.ThemeToggle, render: wrapResponsiveRender(ThemeToggleRsc) },
    ...moduleRscComponentsWrapped,
  }),
}

export const headerPuckRscConfig = {
  ...headerPuckConfig,
  components: withSafeRichText({
    ...headerPuckConfig.components,
    SiteLogo: { ...headerPuckConfig.components.SiteLogo, render: wrapResponsiveRender(SiteLogoRsc) },
    MembersAccountLink: { ...headerPuckConfig.components.MembersAccountLink, render: wrapResponsiveRender(MembersAccountLinkRsc) },
    MembersSignIn: { ...headerPuckConfig.components.MembersSignIn, render: wrapResponsiveRender(MembersSignInRsc) },
    IconLink: { ...headerPuckConfig.components.IconLink, render: wrapResponsiveRender(IconLinkRsc) },
    ThemeToggle: { ...headerPuckConfig.components.ThemeToggle, render: wrapResponsiveRender(ThemeToggleRsc) },
    // RSC render halves for any module blocks that opted into the header
    // (layoutTypes: ["header"]) — override the editor-safe client placeholders.
    ...(moduleRscByLayoutTypeWrapped['header'] ?? {}),
  }),
}

export const fullPagePuckRscConfig = puckRscConfig

// Here root children is a Fragment of the parts (ServerRender's DropZoneRender
// builds no element of its own), so this wrapper IS their direct parent - no
// cloning needed, unlike the editor's live DropZone. See config.tsx.
function BareLayoutRoot({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function moduleLayoutStandaloneRoot(layoutType: string, before?: (props: any) => any, standalone?: boolean) {
  const preview = standalone ? getModuleLayoutEditorPreview(layoutType) : undefined
  return function ModuleLayoutStandaloneRoot({ children, ...rest }: { children: React.ReactNode } & Record<string, any>) {
    const chrome = before ? React.createElement(before, rest) : null
    if (!preview) return <>{chrome}{children}</>
    return (
      <>
      {chrome}
      <div className={preview.className} style={preview.maxWidth ? { maxWidth: preview.maxWidth } : undefined}>
        {children}
      </div>
      </>
    )
  }
}

// ---------------------------------------------------------------------------
// SiteLogo on a module layout
// ---------------------------------------------------------------------------
//
// Everywhere else, the site-wide logo is put onto every SiteLogo block by
// resolveTemplateData before the layout is handed to <Render> - the header, the
// footer, the status pages and the 404 all do that. Module layouts have no such
// step: each is rendered by whatever module owns it (the invoice document, the
// quote document, a stamped product card), and every one of those would have to
// learn to fill in a core block's props - one more thing to get wrong, in a
// module pinned separately from the core that defines the block.
//
// So the block fetches its own. getSiteConfig is React cache()d and the media
// row is looked up through the same per-request cache, so a page rendering the
// block twenty times still costs two queries.
const moduleLayoutSiteBranding = cache(async (): Promise<{ logoUrl: string | null; logoDarkUrl: string | null; siteName: string }> => {
  const config = await getSiteConfig().catch(() => null)
  const lookup = (id: string | null | undefined) =>
    id ? prisma.media.findUnique({ where: { id }, select: { url: true } }).catch(() => null) : Promise.resolve(null)
  const [light, dark] = await Promise.all([lookup(config?.logoMediaId), lookup(config?.logoDarkMediaId)])
  return { logoUrl: light?.url ?? null, logoDarkUrl: dark?.url ?? null, siteName: config?.siteName ?? '' }
})

async function SiteLogoWithSiteBranding(props: any) {
  const { logoUrl, logoDarkUrl, siteName } = await moduleLayoutSiteBranding()
  return <SiteLogoRsc {...props} logoUrl={logoUrl} logoUrlDark={logoDarkUrl} siteName={siteName} />
}

// Rendered as an element rather than called, so wrapResponsiveRender - which
// invokes the render function directly - still gets a plain React element back
// and the awaiting happens where React expects it, inside the async component.
function SiteLogoModuleLayoutRsc(props: any) {
  return <SiteLogoWithSiteBranding {...props} />
}

// `standalone: true` means this layout is being rendered on its own rather than
// stamped into a host surface's container - the layout preview page is the only
// such caller. It then draws the container the layout type declares, so the
// preview matches the storefront.
//
// Every other caller here IS the host surface and supplies its own container:
// shop's renderCards wraps each stamped card in `<a class="shop-card">`, and
// product-attributes' filter grid mirrors it. Wrapping by default would nest a
// second `.shop-card` inside each of those, so it stays opt-in.
export function getModuleLayoutPuckRscConfig(layoutType: string, opts?: { standalone?: boolean }) {
  const modBlocks = moduleRscByLayoutTypeWrapped[layoutType] ?? {}
  const { sharedCategories, sharedComponents } = getModuleLayoutSharedParts()
  // The page settings the layout type's own module declared, if any. `fields`
  // and `defaultProps` matter to the editor rather than to this path, but they
  // are carried anyway so a published render reads the same root config the
  // editor wrote - `defaultProps` in particular is what a layout saved before a
  // field existed falls back to.
  const pageRoot = moduleLayoutRoots[layoutType] ?? coreLayoutRoots[layoutType]
  return {
    categories: {
      blocks: { title: 'Blocks', components: Object.keys(modBlocks), defaultExpanded: true },
      ...sharedCategories,
    },
    root: {
      ...(pageRoot?.fields ? { fields: pageRoot.fields } : {}),
      ...(pageRoot?.defaultProps ? { defaultProps: pageRoot.defaultProps } : {}),
      render: opts?.standalone || pageRoot?.before
        ? moduleLayoutStandaloneRoot(layoutType, pageRoot?.before, opts?.standalone)
        : BareLayoutRoot,
    },
    // The footer strip closes its blocks up (see withoutVerticalSpaceComponents):
    // applied OUTSIDE withSafeRichText so it wraps the RSC render that is
    // actually used, and applied here as well as in the editor config so the
    // builder and the printed page agree on the same footer.
    components: withoutVerticalSpaceComponents(withSafeRichText({
      ...sharedComponents,
      // The shared 'actions' set includes IconLink; its audience gate has to
      // hold here too, not just on the page/header/footer configs.
      ...(sharedComponents.IconLink
        ? { IconLink: { ...sharedComponents.IconLink, render: wrapResponsiveRender(IconLinkRsc) } }
        : {}),
      // The shared set also includes SiteLogo, whose editor half is a client
      // component. Published pages get the RSC one, with the site's own logo
      // read for it - see SiteLogoWithSiteBranding above.
      ...(sharedComponents.SiteLogo
        ? { SiteLogo: { ...sharedComponents.SiteLogo, render: wrapResponsiveRender(SiteLogoModuleLayoutRsc) } }
        : {}),
      ...modBlocks,
    }), layoutType),
  }
}
