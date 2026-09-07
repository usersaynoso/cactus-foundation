// Server-side resolver for the `core.mobile-bar-items` extension point: the
// cells a MODULE contributes to the Mobile Bar.
//
// Why an extension point rather than a fixed list of kinds in core: a basket
// button has to know how many things are in the basket and what opening it does,
// and a chat button has to know how to open the chat. Neither is core's
// business, and core hardcoding either would put shop and live-chat knowledge in
// a file that ships to every site whether it has them or not.
//
// The owner still decides WHERE each one sits - a contributed cell is picked
// from the Mobile Bar's own item list like any other, so Home / Account /
// Basket / Menu / Chat is five rows in the editor, in that order, and any other
// order is a drag away.
//
// A module knows nothing about the bar's chrome. It renders a button using the
// class names core publishes (see ModuleMobileBarItemProps in lib/puck/mobileBar.ts)
// and core's stylesheet dresses it, so a contributed cell and a core one are the
// same size, the same colour and the same shape without either side coordinating.
import type { ComponentType } from 'react'
import { getInstalledManifests } from '@/lib/modules/live-status'
import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'
import type { ModuleMobileBarItemProps } from '@/lib/puck/mobileBar'
import { MOBILE_BAR_POINT } from '@/lib/puck/mobile-bar-point'

export { MOBILE_BAR_POINT }

type ExtensionPointEntry = { point: string; id: string; label?: string }

/**
 * The contributed cells this site can actually draw, keyed on the manifest id
 * the owner picked in the editor. A module that is in the build but not
 * installed here is absent, and the bar simply skips that cell rather than
 * leaving a gap in the grid.
 */
export async function getModuleMobileBarItems(): Promise<Record<string, ComponentType<ModuleMobileBarItemProps>>> {
  const components = moduleExtensionPointComponents[MOBILE_BAR_POINT] ?? {}
  if (Object.keys(components).length === 0) return {}

  const modules = await getInstalledManifests()

  const out: Record<string, ComponentType<ModuleMobileBarItemProps>> = {}
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    if (!manifest?.extensionPoints) continue
    for (const entry of manifest.extensionPoints) {
      if (entry.point !== MOBILE_BAR_POINT) continue
      const Component = components[entry.id] as ComponentType<ModuleMobileBarItemProps> | undefined
      if (Component) out[entry.id] = Component
    }
  }
  return out
}
