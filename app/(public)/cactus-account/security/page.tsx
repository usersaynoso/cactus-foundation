import { redirectWhenSinglePage } from '@/lib/members/account-sections'
import SecuritySection from '@/components/members/account/SecuritySection'

export const dynamic = 'force-dynamic'

export default async function SecurityPage() {
  await redirectWhenSinglePage('security')
  return <SecuritySection />
}
