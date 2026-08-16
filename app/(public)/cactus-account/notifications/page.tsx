import { redirectWhenSinglePage } from '@/lib/members/account-sections'
import NotificationsSection from '@/components/members/account/NotificationsSection'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  await redirectWhenSinglePage('notifications')
  return <NotificationsSection />
}
