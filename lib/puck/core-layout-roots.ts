import { documentFooterPageSettings, DOCUMENT_FOOTER_LAYOUT_TYPE } from '@/lib/documents/page-settings'
import type { ModuleLayoutRoot } from '@/lib/puck/module-layout-roots'

// Page settings ("the fields shown with nothing selected") for the layout types
// CORE owns but which are built the way a module's are: a picker of just the
// blocks declared for that type, plus the shared core ones.
//
// Its module-declared twin is lib/puck/module-layout-roots.ts, which is
// generated from every manifest's `pageSettings`. This one is written by hand
// because nothing generates core, and it is a separate file for the same reason
// the generated one must never be edited: the generator rewrites that file on
// every build.
//
// Client-safe, by the same contract: read from both lib/puck/config.tsx (the
// editor) and lib/puck/config.rsc.tsx (the published render).

export const coreLayoutRoots: Record<string, ModuleLayoutRoot> = {
  [DOCUMENT_FOOTER_LAYOUT_TYPE]: documentFooterPageSettings,
}

/** A core layout type that is edited through the module-layout config rather
 *  than through one of the big page configs. The editor and the preview page
 *  both branch on it. */
export function isCoreModuleStyleLayoutType(type: string | undefined): boolean {
  return Boolean(type && type in coreLayoutRoots)
}
