'use client'

import { useState } from 'react'
import GeneratedAvatar from '@/components/members/GeneratedAvatar'

type Props = {
  memberId: string
  username: string
  displayName?: string | null
  avatarChoice: 'UPLOAD' | 'GRAVATAR' | 'GENERATED'
  uploadedUrl?: string | null
  size?: number
}

// Single renderer for all three avatar choices - one place any page/component
// picks to always get the right one, so no page has to re-implement the
// upload/gravatar/generated switch itself.
export default function MemberAvatar({ memberId, username, displayName, avatarChoice, uploadedUrl, size = 40 }: Props) {
  const [gravatarFailed, setGravatarFailed] = useState(false)
  const label = displayName || username

  if (avatarChoice === 'UPLOAD' && uploadedUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- externally/Worker-served avatar URL, not a local asset next/image can optimise
      <img
        src={uploadedUrl}
        alt={label}
        width={size}
        height={size}
        style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }

  if (avatarChoice === 'GRAVATAR' && !gravatarFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- proxied avatar (server resolves the Gravatar hash), not a local asset
      <img
        src={`/api/members/avatar-proxy/${memberId}`}
        alt={label}
        width={size}
        height={size}
        style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        onError={() => setGravatarFailed(true)}
      />
    )
  }

  return <GeneratedAvatar label={label} size={size} />
}
