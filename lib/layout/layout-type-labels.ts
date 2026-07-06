import { moduleLayoutTypeToGroup } from '@/lib/layout/module-layout-types'

export const FIXED_LAYOUT_TYPE_LABELS: Record<string, string> = {
  header: 'Header', footer: 'Footer', infoPage: 'Page Layout',
  notFound: '404', statusPage: 'Status Page',
}

export function getLayoutTypeLabel(type: string | undefined): string {
  if (!type) return 'Layout'
  return FIXED_LAYOUT_TYPE_LABELS[type] ?? moduleLayoutTypeToGroup[type]?.label ?? type
}
