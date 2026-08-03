import { notFound } from 'next/navigation'
import { getMembersConfig, isAccountSectionEnabled } from '@/lib/members/config'
import ProfileSection from '@/components/members/account/ProfileSection'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  // Switched off in settings means gone, not merely unlinked. The tab bar and
  // the overview card already hide themselves, but the address is a guessable
  // /profile on the end of the member area and was answering it regardless.
  const config = await getMembersConfig()
  if (!isAccountSectionEnabled(config, 'profile')) notFound()

  return <ProfileSection />
}
