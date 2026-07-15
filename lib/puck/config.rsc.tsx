// RSC-only Puck config variants, split out of lib/puck/config.tsx. These pull
// in next/headers transitively (getSessionFromCookie, getMemberFromCookie via
// MembersBlocksRsc.tsx and module Puck blocks like BoardHeaderBlock.rsc.tsx),
// which Next.js rejects the moment it's reachable from a client bundle.
// config.tsx is imported directly by the client Puck editors (PuckEditor.tsx,
// LayoutPuckEditor.tsx), so none of that can live there — only here, where
// every consumer is a Server Component.

import React from 'react'
import {
  puckConfig,
  footerPuckConfig,
  layoutPuckConfig,
  headerPuckConfig,
  getModuleLayoutSharedParts,
  wrapResponsiveRender,
  richTextContentToHtml,
  richTextColourCss,
  getPaddingClasses,
  getAosProps,
  getStickyStyle,
  SiteLogoRsc,
} from '@/lib/puck/config'
import { sanitizeRichText } from '@/lib/sanitize'
import { moduleRscComponents, moduleRscComponentsByLayoutType } from '@/lib/puck/module-rsc-components'
import { LayoutEmbedRsc } from '@/lib/puck/components/LayoutEmbedRsc'
import {
  MembersLoginRsc,
  MembersRegisterRsc,
  MembersAccountLinkRsc,
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
function RichTextBlockRsc(props: { id?: string; content?: unknown; padding?: any; textColor?: string; linkColor?: string; linkHoverColor?: string; bulletIcon?: string; bulletColor?: string; sticky?: string; stickyOffset?: string; animationType?: string; animationDuration?: string; animationDelay?: string; puck?: { isEditing?: boolean } }) {
  const { id, content, padding, textColor, linkColor, linkHoverColor, bulletIcon, bulletColor, sticky, stickyOffset, animationType, animationDuration, animationDelay, puck } = props
  if (!content) {
    return (
      <div className={getPaddingClasses(padding)} style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>
        Rich text — edit in the panel
      </div>
    )
  }
  const html = sanitizeRichText(richTextContentToHtml(content, !puck?.isEditing))
  // Mirrors the editor render in config.tsx: the block's "Text colour" is a
  // scoped stylesheet rule (richTextColourCss), not an inline style, because the
  // globals.css `.puck-richtext …` rules set explicit colours a wrapper style
  // couldn't cascade past. Same helper, so editor and published markup agree.
  // Sticky and scroll-animation attrs come from the same shared helpers too.
  const colourCss = richTextColourCss(id, { textColor, linkColor, linkHoverColor, bulletIcon, bulletColor })
  return (
    <div className={`puck-richtext ${getPaddingClasses(padding)}`} data-richtext-id={id} {...getAosProps(animationType ?? 'none', animationDuration ?? 'normal', animationDelay ?? 'none')} style={getStickyStyle(sticky, stickyOffset)}>
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
  MemberGate: { ...puckConfig.components.MemberGate, render: wrapResponsiveRender(MemberGateRsc) },
  TrustedMemberGate: { ...puckConfig.components.TrustedMemberGate, render: wrapResponsiveRender(TrustedMemberGateRsc) },
  MembersProfile: { ...puckConfig.components.MembersProfile, render: wrapResponsiveRender(MembersProfileRsc) },
  LayoutEmbed: { ...puckConfig.components.LayoutEmbed, render: wrapResponsiveRender(LayoutEmbedRsc) },
  ...moduleRscComponentsWrapped,
})

export const puckRscConfig = { ...puckConfig, components: rscComponents }

export const footerPuckRscConfig = {
  ...footerPuckConfig,
  components: withSafeRichText({
    ...footerPuckConfig.components,
    SiteLogo: { ...footerPuckConfig.components.SiteLogo, render: wrapResponsiveRender(SiteLogoRsc) },
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
    MemberGate: { ...layoutPuckConfig.components.MemberGate, render: wrapResponsiveRender(MemberGateRsc) },
    TrustedMemberGate: { ...layoutPuckConfig.components.TrustedMemberGate, render: wrapResponsiveRender(TrustedMemberGateRsc) },
    MembersProfile: { ...layoutPuckConfig.components.MembersProfile, render: wrapResponsiveRender(MembersProfileRsc) },
    ...moduleRscComponentsWrapped,
  }),
}

export const headerPuckRscConfig = {
  ...headerPuckConfig,
  components: withSafeRichText({
    ...headerPuckConfig.components,
    SiteLogo: { ...headerPuckConfig.components.SiteLogo, render: wrapResponsiveRender(SiteLogoRsc) },
    MembersAccountLink: { ...headerPuckConfig.components.MembersAccountLink, render: wrapResponsiveRender(MembersAccountLinkRsc) },
    // RSC render halves for any module blocks that opted into the header
    // (layoutTypes: ["header"]) — override the editor-safe client placeholders.
    ...(moduleRscByLayoutTypeWrapped['header'] ?? {}),
  }),
}

export const fullPagePuckRscConfig = puckRscConfig

export function getModuleLayoutPuckRscConfig(layoutType: string) {
  const modBlocks = moduleRscByLayoutTypeWrapped[layoutType] ?? {}
  const { sharedCategories, sharedComponents } = getModuleLayoutSharedParts()
  return {
    categories: {
      blocks: { title: 'Blocks', components: Object.keys(modBlocks), defaultExpanded: true },
      ...sharedCategories,
    },
    root: {
      render: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    },
    components: withSafeRichText({ ...sharedComponents, ...modBlocks }),
  }
}
