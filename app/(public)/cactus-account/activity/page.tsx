import { redirectWhenSinglePage } from '@/lib/members/account-sections'
import ActivitySection from '@/components/members/account/ActivitySection'

export const dynamic = 'force-dynamic'

export default async function ActivityPage() {
  await redirectWhenSinglePage('activity')
  return <ActivitySection />
}
