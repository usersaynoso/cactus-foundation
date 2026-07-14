import { moduleLayoutTypeToGroup } from '@/lib/layout/module-layout-types'
import { TYPE_LABELS } from '@/lib/layout/layout-type-tabs'

// One place decides what a layout type is called. There used to be three - the
// tab strip, this file, and the preview page - and they had already drifted
// ("404" in one, "404 Page" in another).

export function getLayoutTypeLabel(type: string | undefined): string {
  if (!type) return 'Layout'
  return TYPE_LABELS[type] ?? moduleLayoutTypeToGroup[type]?.label ?? type
}
