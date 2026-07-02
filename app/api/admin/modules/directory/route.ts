import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getGithubClient } from '@/lib/github/client'
import { isLocalMode } from '@/lib/config/env'
import type { ModuleStatus } from '@prisma/client'

const MODULE_ORG = 'cactus-foundation-modules'
const CACHE_TTL = 300_000 // 5 minutes

type DirectoryEntry = {
  repoUrl: string
  repoName: string
  description: string
  installed: boolean
  installedId?: string
  installedVersion?: string
  status?: ModuleStatus
  updateAvailable?: string | null
  updateNotes?: string | null
  lastError?: string | null
  hasTeardown?: boolean
  updateChannel?: 'public' | 'beta'
  hasPublicRelease?: boolean
}

let cachedDir: DirectoryEntry[] | null = null
let cachedAt = 0

export async function GET(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'modules.manage')) return errorResponse('Forbidden', 403)

  const refresh = request.nextUrl.searchParams.get('refresh') === 'true'
  const localMode = isLocalMode()

  const installedModules = await prisma.module.findMany({ orderBy: { installedAt: 'asc' } })

  const now = Date.now()
  if (!refresh && cachedDir && now - cachedAt < CACHE_TTL) {
    return NextResponse.json({ modules: mergeWithInstalled(cachedDir, installedModules), localMode })
  }

  let orgRepos: Array<{ name: string; html_url: string; description: string | null }>
  const octokit = await getGithubClient()
  try {
    const { data } = await octokit.rest.repos.listForOrg({
      org: MODULE_ORG,
      type: 'public',
      per_page: 100,
    })
    orgRepos = data.map((r) => ({
      name: r.name,
      html_url: r.html_url,
      description: r.description ?? '',
    }))
  } catch {
    // GitHub unavailable - return installed modules only with a flag
    return NextResponse.json({
      modules: installedModules.map((m) => buildInstalledEntry(m)),
      directoryUnavailable: true,
      localMode,
    })
  }

  const hasPublicReleaseByRepo = await Promise.all(
    orgRepos.map(async (r) => {
      try {
        await octokit.rest.repos.getLatestRelease({ owner: MODULE_ORG, repo: r.name })
        return true
      } catch (err: unknown) {
        if ((err as { status?: number }).status === 404) return false
        return true // unexpected error - don't block install on an unrelated failure
      }
    })
  )

  cachedDir = orgRepos.map((r, i) => ({
    repoUrl: r.html_url,
    repoName: r.name,
    description: r.description ?? '',
    installed: false,
    hasPublicRelease: hasPublicReleaseByRepo[i],
  }))
  cachedAt = now

  return NextResponse.json({ modules: mergeWithInstalled(cachedDir, installedModules), localMode })
}

function normaliseUrl(url: string) {
  return url.toLowerCase().replace(/\.git$/, '').replace(/\/$/, '')
}

type InstalledModule = {
  id: string
  name: string
  repoUrl: string
  version: string
  status: ModuleStatus
  updateAvailable: string | null
  updateNotes: string | null
  lastError: string | null
  manifest: unknown
  updateChannel: string
}

function buildInstalledEntry(m: InstalledModule): DirectoryEntry {
  const manifest = m.manifest as { teardown?: string[] } | null
  return {
    repoUrl: m.repoUrl,
    repoName: m.name,
    description: '',
    installed: true,
    installedId: m.id,
    installedVersion: m.version,
    status: m.status,
    updateAvailable: m.updateAvailable,
    updateNotes: m.updateNotes,
    lastError: m.lastError,
    hasTeardown: Array.isArray(manifest?.teardown) && manifest.teardown.length > 0,
    updateChannel: m.updateChannel as 'public' | 'beta',
  }
}

function mergeWithInstalled(dir: DirectoryEntry[], installed: InstalledModule[]): DirectoryEntry[] {
  const result: DirectoryEntry[] = dir.map((entry) => {
    const match = installed.find(
      (m) => normaliseUrl(m.repoUrl) === normaliseUrl(entry.repoUrl)
    )
    if (!match) return entry

    const manifest = match.manifest as { teardown?: string[] } | null
    return {
      ...entry,
      installed: true,
      installedId: match.id,
      installedVersion: match.version,
      status: match.status,
      updateAvailable: match.updateAvailable,
      updateNotes: match.updateNotes,
      lastError: match.lastError,
      hasTeardown: Array.isArray(manifest?.teardown) && manifest.teardown.length > 0,
      updateChannel: match.updateChannel as 'public' | 'beta',
    }
  })

  // Include installed modules whose repoUrl doesn't match any org repo in the directory
  for (const m of installed) {
    const alreadyIncluded = dir.some(
      (e) => normaliseUrl(e.repoUrl) === normaliseUrl(m.repoUrl)
    )
    if (!alreadyIncluded) {
      result.unshift(buildInstalledEntry(m))
    }
  }

  return result
}
