import DangerZoneSection from '@/components/members/account/DangerZoneSection'
import { getMemberFromCookie } from '@/lib/members/session'

export const dynamic = 'force-dynamic'

export default async function DangerZonePage() {
  // The layout has already turned away anyone without a session, so this only
  // has to answer one question: is this account the member half of a staff
  // sign-in, which cannot be deleted from in here.
  const member = await getMemberFromCookie()
  return <DangerZoneSection linkedToStaff={!!member?.userId} />
}
