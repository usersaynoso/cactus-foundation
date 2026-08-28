'use client'

import { useCallback, useState, type ReactNode } from 'react'
import GeneratedAvatar from '@/components/members/GeneratedAvatar'

type Props = {
  memberId: string
  username: string
  displayName?: string | null
  avatarChoice: 'UPLOAD' | 'GRAVATAR' | 'GENERATED'
  uploadedUrl?: string | null
  size?: number
  // What to draw when there is no actual picture - no upload, or a Gravatar
  // the member hasn't got. Defaults to the initials avatar, which is right for
  // a profile page. Somewhere that already has an icon standing in for the
  // member (the sign-in widget) passes that icon instead, so a member with no
  // picture keeps the icon rather than being given initials they never chose.
  fallback?: ReactNode
}

// Single renderer for all three avatar choices - one place any page/component
// picks to always get the right one, so no page has to re-implement the
// upload/gravatar/generated switch itself.
export default function MemberAvatar({ memberId, username, displayName, avatarChoice, uploadedUrl, size = 40, fallback }: Props) {
  const [gravatarState, setGravatarState] = useState<'pending' | 'loaded' | 'failed'>('pending')
  const label = displayName || username

  // A Gravatar already in the browser cache can finish before React attaches
  // onLoad, which would otherwise leave a picture that loaded perfectly well
  // hidden behind the placeholder for good - so settle the state off the
  // element itself the moment it mounts. complete + no natural width is the
  // failed case; the proxy 404s for every member without a Gravatar, which is
  // most of them.
  const gravatarRef = useCallback((node: HTMLImageElement | null) => {
    if (!node?.complete) return
    setGravatarState(node.naturalWidth > 0 ? 'loaded' : 'failed')
  }, [])

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

  if (avatarChoice === 'GRAVATAR' && gravatarState !== 'failed') {
    return (
      <>
        {/* The placeholder holds the space until the Gravatar has actually
            decoded, rather than waiting on onError. Rendering the <img> on its
            own leaves a member who hasn't got a Gravatar - the default choice,
            so most of them - staring at the browser's broken-image box for the
            length of the round trip, and only on the second visit, once the
            404 is cached and fails instantly, do they get their initials. */}
        {gravatarState !== 'loaded' && (fallback ?? <GeneratedAvatar label={label} size={size} />)}
        {/* eslint-disable-next-line @next/next/no-img-element -- proxied avatar (server resolves the Gravatar hash), not a local asset */}
        <img
          ref={gravatarRef}
          src={`/api/members/avatar-proxy/${memberId}`}
          alt={label}
          width={size}
          height={size}
          style={{
            borderRadius: '50%',
            objectFit: 'cover',
            flexShrink: 0,
            display: gravatarState === 'loaded' ? 'block' : 'none',
          }}
          onLoad={() => setGravatarState('loaded')}
          onError={() => setGravatarState('failed')}
        />
      </>
    )
  }

  return <>{fallback ?? <GeneratedAvatar label={label} size={size} />}</>
}
