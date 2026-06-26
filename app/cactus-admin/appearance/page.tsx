import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export default async function AppearancePage() {
  const headersList = await headers()
  const adminPath = headersList.get('x-cactus-admin-path') ?? 'cactus-admin'
  redirect(`/${adminPath}/appearance/header`)
}
