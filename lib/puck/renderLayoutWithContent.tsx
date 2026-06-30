import React from 'react'
import { Render } from '@puckeditor/core/rsc'
import { layoutPuckRscConfig } from './config'
import type { Data, Config } from '@puckeditor/core'

export function renderLayoutWithContent(
  layoutData: Data,
  pageContent: React.ReactNode,
): React.ReactNode {
  const config: Config = {
    ...(layoutPuckRscConfig as Config),
    components: {
      ...(layoutPuckRscConfig as Config).components,
      ContentSlot: {
        render: () => <>{pageContent}</>,
      },
    },
  }
   
  return <Render config={config as any} data={layoutData} />
}
