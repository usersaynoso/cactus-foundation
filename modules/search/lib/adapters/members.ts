import { prisma } from '@/lib/db/prisma'
import { getMembersConfig } from '@/lib/members/config'
import { makeExcerpt } from '../extract'
import type { SearchDocument } from '../types'
import type { SearchAdapter } from './types'

// Member profiles (core, not a module). Only indexed when the member directory
// is switched on and profiles are not hidden site-wide; the site-wide
// profileVisibility decides the tier (PUBLIC -> public, MEMBERS_ONLY ->
// members). Per-member MemberProfileVisibility.showBio/showWebsite toggles
// decide what text is indexed. Source of truth: lib/members/config.ts and the
// /members pages.
export const memberAdapter: SearchAdapter = {
  source: 'member',
  label: 'Members',

  async isAvailable() {
    const config = await getMembersConfig()
    return config.directoryEnabled && config.profileVisibility !== 'HIDDEN'
  },

  async listIds() {
    const rows = await prisma.member.findMany({ where: { status: 'ACTIVE' }, select: { id: true } })
    return rows.map((r) => r.id)
  },

  async listChangedSince(since) {
    const rows = await prisma.member.findMany({
      where: since ? { updatedAt: { gt: since } } : { status: 'ACTIVE' },
      select: { id: true },
    })
    return rows.map((r) => r.id)
  },

  async fetchDocuments(ids, opts) {
    const config = await getMembersConfig()
    if (!config.directoryEnabled || config.profileVisibility === 'HIDDEN') return []
    const tier = config.profileVisibility === 'MEMBERS_ONLY' ? 'members' : 'public'
    const members = await prisma.member.findMany({
      where: { id: { in: ids }, status: 'ACTIVE' },
      include: { profileVisibility: true },
    })
    return members.map((m): SearchDocument => {
      const showBio = m.profileVisibility?.showBio !== false
      const body = [
        m.displayName ?? '',
        m.username,
        showBio ? (m.bio ?? '') : '',
      ].filter(Boolean).join(' ')
      return {
        source: 'member',
        entityId: m.id,
        title: m.displayName?.trim() || m.username,
        excerpt: showBio ? makeExcerpt(m.bio, opts.excerptLength) : null,
        body,
        url: `/members/${m.username}`,
        imageUrl: null,
        extra: { username: m.username },
        tier,
        sourceUpdatedAt: m.updatedAt,
      }
    })
  },
}
