// Hand-written types for the gate's registry planner, so its test can share the
// one implementation rather than keeping a second copy in step.
export interface GateRegistryEntry {
  name: string
  repoUrl: string
  version?: string
}
export function planModuleRegistry(args: {
  manifest: { name?: string; requiresModules?: string[] }
  coreRegistry: { modules?: GateRegistryEntry[] }
  candidateRepoUrl?: string
}): { modules: GateRegistryEntry[] }
