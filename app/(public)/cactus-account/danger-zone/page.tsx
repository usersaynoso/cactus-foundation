import { redirectWhenSinglePage } from '@/lib/members/account-sections'
import DangerZoneSection from '@/components/members/account/DangerZoneSection'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig, isMemberSelfDeletionAllowed } from '@/lib/members/config'

export const dynamic = 'force-dynamic'

export default async function DangerZonePage() {
  await redirectWhenSinglePage('dangerZone')
  // The layout has already turned away anyone without a session, so this only
  // has to answer two questions: is this account the member half of a staff
  // sign-in, which cannot be deleted from in here, and does the site let
  // members close their own accounts at all.
  const [member, config] = await Promise.all([getMemberFromCookie(), getMembersConfig()])
  return <DangerZoneSection linkedToStaff={!!member?.userId} selfDeletionAllowed={isMemberSelfDeletionAllowed(config)} />
}
