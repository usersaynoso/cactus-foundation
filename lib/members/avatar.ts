import type { MembersConfig } from '@/lib/members/config'
import type { AvatarChoice } from '@prisma/client'

// Toggling avatarUploadsEnabled/gravatarEnabled off must be honoured
// immediately for every member, not just for future choices - this downgrades
// whatever raw AvatarChoice a member has stored to whichever choice is
// actually still permitted, without touching the stored value itself (so an
// admin re-enabling the toggle later restores the original choice with no
// further action needed from the member).
export function resolveEffectiveAvatarChoice(
  avatarChoice: AvatarChoice,
  config: Pick<MembersConfig, 'avatarUploadsEnabled' | 'gravatarEnabled'>
): AvatarChoice {
  if (avatarChoice === 'UPLOAD' && !config.avatarUploadsEnabled) {
    return config.gravatarEnabled ? 'GRAVATAR' : 'GENERATED'
  }
  if (avatarChoice === 'GRAVATAR' && !config.gravatarEnabled) {
    return 'GENERATED'
  }
  return avatarChoice
}
