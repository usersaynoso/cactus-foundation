import type { ReactNode } from 'react'

// The shapes a host module receives when other modules contribute settings panels
// to one of its named slots. A module declares a hosted panel by setting `host` on
// its manifest `settingsTabs` entry; the config page resolves and renders it, then
// hands it to whichever module's settings tab publishes that slot name.
//
// Two shapes, because hosts want one of two things:
//
// - `HostedSettingsSlots` - the panels for a slot, already merged into one node.
//   For a host that just drops them into an existing section of its own UI and
//   needs nothing else about them (they sit beneath a heading the host wrote).
//
// - `HostedSettingsPanels` - the same panels, still separate, each with the `id`
//   and `label` from its manifest entry. For a host that has to say something
//   ABOUT each panel before rendering it - which in practice means giving each one
//   its own tab, since a tab strip needs the labels up front and cannot recover
//   them from a merged node.
//
// Hosts should take the merged shape unless they need the labels. Both are always
// passed, so a host can change its mind without a core change.

/** One contributed panel: the manifest entry's `id` and `label`, plus the rendered component. */
export type HostedSettingsPanel = { id: string; label: string; node: ReactNode }

/** Panels contributed to each slot, keyed by slot name, in module-load order. */
export type HostedSettingsPanels = Record<string, HostedSettingsPanel[]>

/** Panels contributed to each slot, keyed by slot name, merged into a single node per slot. */
export type HostedSettingsSlots = Record<string, ReactNode>

/** Props every module settings tab component is rendered with. */
export type ModuleSettingsTabProps = {
  hostedSettingsSlots?: HostedSettingsSlots
  hostedSettingsPanels?: HostedSettingsPanels
}
