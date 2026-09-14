export declare const PACKED_CACHE: string
export function packBuildCache(rootDir: string, log?: (line: string) => void): Promise<boolean>
export function restoreBuildCache(rootDir: string, options?: { enabled?: boolean; log?: (line: string) => void }): Promise<boolean>
export function discardBuildCache(rootDir: string): Promise<void>
