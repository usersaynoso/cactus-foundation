import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { getMemberAreaPath } from '@/lib/members/paths'
import { getMemberAccountNavExtras, type MemberAccountNavContext } from '@/lib/members/account-nav'
import { hasModuleNotificationCategories } from '@/lib/modules/member-extensions'
import AccountNav from '@/components/members/account/AccountNav'
import AccountFlash from '@/components/members/account/AccountFlash'
import DeletionBanner from '@/components/members/account/DeletionBanner'

// The chrome every member-area page wears: the container, the flash pill, the
// deletion banner and the tab bar.
//
// It exists because a module's member pages are not under app/(public)/
// cactus-account and so never see that route group's layout. Shop's order
// history was the proof: a member clicked "Order history" and landed on a bare
// page with no tabs and no way back to their account. A module wraps its member
// pages in this and they look like part of the account, because they are.
//
// The caller does its own session gate - a module knows where to send a signed
// out visitor back to, and core does not. Passing `member` avoids a second
// session lookup when the page has already done one.

/** One width for every page in the member area, core tab or module tab alike.
 * Shop's order history set its own and the account visibly changed size between
 * tabs; the widest page is the one that has to fit, so it sets the number. */
export const ACCOUNT_MAX_WIDTH = 880

type ShellMember = MemberAccountNavContext & { deletionScheduledAt?: Date | null }

type Props = {
  children: React.ReactNode
  /** The signed-in member, when the caller already has the record. */
  member?: ShellMember
  /** Rendered between the banner and the tab bar, for a page-level notice. */
  notice?: React.ReactNode
  /** Only override this for a page that genuinely cannot live at the shared
   * width - the tab bar sits inside it, so a different number makes the whole
   * account jump sideways when a member changes tab. */
  maxWidth?: number
}

export default async function MemberAccountShell({ children, member, notice, maxWidth = ACCOUNT_MAX_WIDTH }: Props) {
  const current: ShellMember | null = member ?? (await getMemberFromCookie())
  // No session is the caller's business, not ours: render the page as it is
  // rather than dressing it in an account nav nobody can use.
  if (!current) return <>{children}</>

  const [config, extras, notificationsAvailable] = await Promise.all([
    getMembersConfig(),
    getMemberAccountNavExtras({
      id: current.id,
      email: current.email,
      emailVerified: current.emailVerified,
    }),
    hasModuleNotificationCategories(),
  ])

  return (
    <div style={{ maxWidth, margin: '3rem auto', padding: '0 1.5rem' }}>
      <AccountFlash />
      {current.deletionScheduledAt && (
        <DeletionBanner scheduledAt={current.deletionScheduledAt.toISOString()} />
      )}
      {notice}
      <AccountNav
        basePath={`/${getMemberAreaPath()}`}
        sections={config.accountSectionsEnabled}
        extras={extras}
        notificationsAvailable={notificationsAvailable}
        singlePage={config.accountSinglePage}
      />
      {children}
    </div>
  )
}
