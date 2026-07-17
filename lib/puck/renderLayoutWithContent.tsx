import React from 'react'
import { Render } from '@puckeditor/core/rsc'
import { layoutPuckRscConfig } from './config.rsc'
import type { PuckRenderMetadata } from './renderMetadata'
import type { Data, Config } from '@puckeditor/core'

export function renderLayoutWithContent(
  layoutData: Data,
  pageContent: React.ReactNode,
  metadata?: PuckRenderMetadata,
): React.ReactNode {
  // Members blocks' RSC render functions are async Server Components (see
  // MEMBERS_SPEC.md Phase 7) - Puck's Config type models render() as
  // synchronous, so the direct cast below needs to go through `unknown`
  // first; this is a type-modeling gap only, Next.js renders async Server
  // Components from RSC-composed JSX like this just fine at runtime.
  const config: Config = {
    ...(layoutPuckRscConfig as unknown as Config),
    components: {
      ...(layoutPuckRscConfig as unknown as Config).components,
      ContentSlot: {
        render: () => <>{pageContent}</>,
      },
    },
  }
   
  return <Render config={config as any} data={layoutData} metadata={metadata} />
}
