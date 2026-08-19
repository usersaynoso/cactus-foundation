// Hand-written types for the prebuild checker, so lib/modules/client-graph.test.ts
// can share its one implementation rather than keeping a second copy in step.
export function findClientGraphLeaks(rootDir: string): string[]
