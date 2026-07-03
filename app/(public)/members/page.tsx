import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/db/prisma'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberFromCookie } from '@/lib/members/session'
import MemberAvatar from '@/components/members/MemberAvatar'
import { resolveEffectiveAvatarChoice } from '@/lib/members/avatar'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 24

type Props = { searchParams: Promise<{ page?: string }> }

export default async function MembersDirectoryPage({ searchParams }: Props) {
  const config = await getMembersConfig()
  if (!config.enabled || !config.directoryEnabled || config.profileVisibility === 'HIDDEN') notFound()

  if (config.profileVisibility === 'MEMBERS_ONLY') {
    const viewer = await getMemberFromCookie()
    if (!viewer) notFound()
  }

  const { page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)

  const [members, total] = await Promise.all([
    prisma.member.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, username: true, displayName: true, avatarChoice: true, avatarMediaId: true },
    }),
    prisma.member.count({ where: { status: 'ACTIVE' } }),
  ])

  const mediaIds = members.map((m) => m.avatarMediaId).filter((id): id is string => !!id)
  const mediaRows = mediaIds.length
    ? await prisma.media.findMany({ where: { id: { in: mediaIds } }, select: { id: true, url: true } })
    : []
  const mediaById = new Map(mediaRows.map((m) => [m.id, m.url]))
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div style={{ maxWidth: 720, margin: '3rem auto', padding: '0 1.5rem' }}>
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-5)', color: 'var(--color-text)' }}>
        Members
      </h1>

      {members.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No members yet.</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 'var(--space-4)' }}>
        {members.map((m) => (
          <Link
            key={m.id}
            href={`/members/${m.username}`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', textDecoration: 'none', color: 'var(--color-text)' }}
          >
            <MemberAvatar
              memberId={m.id}
              username={m.username}
              displayName={m.displayName}
              avatarChoice={resolveEffectiveAvatarChoice(m.avatarChoice, config)}
              uploadedUrl={m.avatarMediaId ? mediaById.get(m.avatarMediaId) ?? null : null}
              size={64}
            />
            <span style={{ fontSize: 'var(--text-sm)', textAlign: 'center' }}>{m.displayName || m.username}</span>
          </Link>
        ))}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)', justifyContent: 'center', alignItems: 'center' }}>
          {page > 1 && <Link className="btn btn-secondary btn-sm" href={`/members?page=${page - 1}`}>Previous</Link>}
          <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Page {page} of {totalPages}</span>
          {page < totalPages && <Link className="btn btn-secondary btn-sm" href={`/members?page=${page + 1}`}>Next</Link>}
        </div>
      )}
    </div>
  )
}
