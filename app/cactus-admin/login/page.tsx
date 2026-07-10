import { resolveBranding } from '@/lib/config/branding'
import LoginForm from './LoginForm'

export default async function LoginPage() {
  const branding = await resolveBranding()

  return (
    <LoginForm
      siteName={branding.name}
      faviconUrl={branding.faviconUrl}
      faviconDarkUrl={branding.faviconDarkUrl}
    />
  )
}
