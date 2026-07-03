import { prisma } from '@/lib/db/prisma'

// Maps each installed module's declared publicBasePath (if any) to its module name.
// Used to keep InfoPage slugs from colliding with a module's public URL segment.
export async function getInstalledPublicBasePaths(): Promise<Map<string, string>> {
  const modules = await prisma.module.findMany({
    select: { name: true, manifest: true },
  })

  const bases = new Map<string, string>()
  for (const mod of modules) {
    const manifest = mod.manifest as { publicBasePath?: string } | null
    if (manifest?.publicBasePath) {
      bases.set(manifest.publicBasePath, mod.name)
    }
  }
  return bases
}
