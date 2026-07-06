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
  SiteLogoRsc,
} from '@/lib/puck/config'
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

const rscComponents = {
  ...puckConfig.components,
  RichTextBlock: { ...puckConfig.components.RichTextBlock, fields: { ...puckConfig.components.RichTextBlock.fields, content: { type: 'textarea' as const, label: 'Content (HTML)' } } },
  SiteLogo: { ...puckConfig.components.SiteLogo, render: wrapResponsiveRender(SiteLogoRsc) },
  MembersLogin: { ...puckConfig.components.MembersLogin, render: wrapResponsiveRender(MembersLoginRsc) },
  MembersRegister: { ...puckConfig.components.MembersRegister, render: wrapResponsiveRender(MembersRegisterRsc) },
  MembersAccountLink: { ...puckConfig.components.MembersAccountLink, render: wrapResponsiveRender(MembersAccountLinkRsc) },
  MemberGate: { ...puckConfig.components.MemberGate, render: wrapResponsiveRender(MemberGateRsc) },
  TrustedMemberGate: { ...puckConfig.components.TrustedMemberGate, render: wrapResponsiveRender(TrustedMemberGateRsc) },
  MembersProfile: { ...puckConfig.components.MembersProfile, render: wrapResponsiveRender(MembersProfileRsc) },
  LayoutEmbed: { ...puckConfig.components.LayoutEmbed, render: wrapResponsiveRender(LayoutEmbedRsc) },
  ...moduleRscComponents,
}

export const puckRscConfig = { ...puckConfig, components: rscComponents }

export const footerPuckRscConfig = {
  ...footerPuckConfig,
  components: {
    ...footerPuckConfig.components,
    SiteLogo: { ...footerPuckConfig.components.SiteLogo, render: wrapResponsiveRender(SiteLogoRsc) },
    RichTextBlock: { ...footerPuckConfig.components.RichTextBlock, fields: { ...footerPuckConfig.components.RichTextBlock.fields, content: { type: 'textarea' as const, label: 'Content (HTML)' } } },
  },
}

export const layoutPuckRscConfig = {
  ...layoutPuckConfig,
  components: {
    ...layoutPuckConfig.components,
    RichTextBlock: { ...layoutPuckConfig.components.RichTextBlock, fields: { ...layoutPuckConfig.components.RichTextBlock.fields, content: { type: 'textarea' as const, label: 'Content (HTML)' } } },
    SiteLogo: { ...layoutPuckConfig.components.SiteLogo, render: wrapResponsiveRender(SiteLogoRsc) },
    MembersLogin: { ...layoutPuckConfig.components.MembersLogin, render: wrapResponsiveRender(MembersLoginRsc) },
    MembersRegister: { ...layoutPuckConfig.components.MembersRegister, render: wrapResponsiveRender(MembersRegisterRsc) },
    MembersAccountLink: { ...layoutPuckConfig.components.MembersAccountLink, render: wrapResponsiveRender(MembersAccountLinkRsc) },
    MemberGate: { ...layoutPuckConfig.components.MemberGate, render: wrapResponsiveRender(MemberGateRsc) },
    TrustedMemberGate: { ...layoutPuckConfig.components.TrustedMemberGate, render: wrapResponsiveRender(TrustedMemberGateRsc) },
    MembersProfile: { ...layoutPuckConfig.components.MembersProfile, render: wrapResponsiveRender(MembersProfileRsc) },
    ...moduleRscComponents,
  },
}

export const headerPuckRscConfig = {
  ...headerPuckConfig,
  components: {
    ...headerPuckConfig.components,
    SiteLogo: { ...headerPuckConfig.components.SiteLogo, render: wrapResponsiveRender(SiteLogoRsc) },
    MembersAccountLink: { ...headerPuckConfig.components.MembersAccountLink, render: wrapResponsiveRender(MembersAccountLinkRsc) },
    // RSC render halves for any module blocks that opted into the header
    // (layoutTypes: ["header"]) — override the editor-safe client placeholders.
    ...(moduleRscComponentsByLayoutType['header'] ?? {}),
  },
}

export const fullPagePuckRscConfig = puckRscConfig

export function getModuleLayoutPuckRscConfig(layoutType: string) {
  const modBlocks = moduleRscComponentsByLayoutType[layoutType] ?? {}
  const { sharedCategories, sharedComponents } = getModuleLayoutSharedParts()
  return {
    categories: {
      blocks: { title: 'Blocks', components: Object.keys(modBlocks), defaultExpanded: true },
      ...sharedCategories,
    },
    root: {
      render: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    },
    components: { ...sharedComponents, ...modBlocks },
  }
}
