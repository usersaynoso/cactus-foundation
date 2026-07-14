'use client'

import { createContext, useContext } from 'react'
import type { ModuleLayoutTypeGroup } from '@/lib/layout/module-layout-types'

// The module layout groups this site actually has installed, resolved on the
// server (app/cactus-admin/layouts/layout.tsx) and handed to the client screens.
// They must not read the generated build-time list directly: it holds every
// module the build cloned, installed or not.
const ModuleLayoutGroupsContext = createContext<ModuleLayoutTypeGroup[]>([])
export const ModuleLayoutGroupsProvider = ModuleLayoutGroupsContext.Provider
export function useModuleLayoutGroups() { return useContext(ModuleLayoutGroupsContext) }
