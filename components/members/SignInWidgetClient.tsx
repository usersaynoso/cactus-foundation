'use client'

import { useState, type CSSProperties } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import MemberAvatar from '@/components/members/MemberAvatar'

// The panel carries the whole sign-in form - passkey, magic link, password,
// two-factor codes, recovery codes - and most visitors never open it, so it is
// fetched on the first click rather than shipped to every page that happens to
// show a sign-in button. `ssr: false` because it only ever exists in response
// to a click, so there is nothing to render on the server.
const SignInModal = dynamic(
  () => import('@/components/members/SignInModal').then((m) => m.SignInModal),
  { ssr: false },
)

// Look/behaviour options for the Members: Sign In widget. The block
// (MembersSignIn in lib/puck/config.tsx) wires these in as plain Puck props;
// every value has a sane default so the widget still renders if handed a
// partial bag.
export type SignInWidgetOptions = {
  icon: 'person' | 'person-circle' | 'lock' | 'key' | 'login' | 'none'
  iconSize: number
  iconColour: string
  label: string
  variant: 'bordered' | 'filled' | 'plain'
  bgColour: string
  borderColour: string
  textColour: string
  borderRadius: number
  // What clicking it does. 'link' goes to the member sign-in page; 'modal'
  // keeps the visitor on the page they were reading and floats the same form
  // over it.
  clickAction: 'link' | 'modal'
  // Where they land after signing in. Blank means the page they were on.
  // Sanitised server-side (MembersSignInRsc) - it becomes a location
  // assignment, so an off-site value here would be an open redirect.
  redirectTo: string
  modalHeading: string
  modalWidth: number
  modalRadius: number
  showRegisterLink: 'yes' | 'no'
  registerLabel: string
  // What the widget becomes once the visitor is signed in. 'hide' is enforced
  // server-side so a signed-in member never gets a flash of it.
  whenSignedIn: 'account' | 'accountSignOut' | 'hide'
  signedInLabel: string
  signOutLabel: string
  showAvatarWhenSignedIn: 'yes' | 'no'
  // Frontend audience. 'everyone' shows the widget to all visitors; 'admin'
  // hides it from the public and only renders it when a site admin is signed
  // in - a way to try the thing out on a live page before letting visitors see
  // it. The gate is enforced server-side (MembersSignInRsc), never here: this
  // island is client-only and its markup is trivially inspectable, so it can't
  // be a security boundary. Carried here purely so the type stays complete.
  // NB: NOT named `visibility` - core injects a responsive-visibility field of
  // that exact name into every Puck block and strips it from render props,
  // which would silently swallow the gate. Same trap as the shop cart widget.
  audience: 'everyone' | 'admin'
}

// Everything the server half works out and the island cannot: whether there is
// a member session, where the member area lives, and whether registration is
// even open. Editor previews pass the signed-out shape.
export type SignInWidgetState = {
  signedIn: boolean
  loginHref: string
  registerHref: string
  accountHref: string
  registerAllowed: boolean
  avatar: {
    memberId: string
    username: string
    displayName: string | null
    avatarChoice: 'UPLOAD' | 'GRAVATAR' | 'GENERATED'
    uploadedUrl: string | null
  } | null
}

export const SIGN_IN_WIDGET_DEFAULTS: SignInWidgetOptions = {
  icon: 'person', iconSize: 20, iconColour: '', label: 'Sign in',
  variant: 'bordered', bgColour: '', borderColour: '', textColour: '', borderRadius: 8,
  clickAction: 'link', redirectTo: '',
  modalHeading: 'Sign in', modalWidth: 420, modalRadius: 12,
  showRegisterLink: 'yes', registerLabel: 'Create an account',
  whenSignedIn: 'account', signedInLabel: 'My account', signOutLabel: 'Sign out',
  showAvatarWhenSignedIn: 'yes',
  audience: 'everyone',
}

const STATE_DEFAULTS: SignInWidgetState = {
  signedIn: false,
  loginHref: '/account/login',
  registerHref: '/account/register',
  accountHref: '/account',
  registerAllowed: true,
  avatar: null,
}

// Stroked line icons (feather / lucide geometry), drawn in currentColor so they
// inherit the widget's text colour unless an explicit icon colour is set.
function SignInIcon({ name, size, colour }: { name: SignInWidgetOptions['icon']; size: number; colour: string }) {
  if (name === 'none') return null
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: colour || 'currentColor', strokeWidth: 2,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
  }
  switch (name) {
    case 'person-circle':
      return (<svg {...common}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="10" r="3" /><path d="M6.2 18.4a6 6 0 0 1 11.6 0" /></svg>)
    case 'lock':
      return (<svg {...common}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>)
    case 'key':
      return (<svg {...common}><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" /></svg>)
    case 'login':
      return (<svg {...common}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" x2="3" y1="12" y2="12" /></svg>)
    case 'person':
    default:
      return (<svg {...common}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>)
  }
}

// An icon-only widget - the shape a site header wants - says nothing about what
// it does until it is clicked, so it gets the same hover/focus tooltip the admin
// side uses (.member-signin-tip in globals.css, visuals shared with
// .theme-toggle-tip). Left off whenever there is a text label, where it would
// only repeat what is already on screen. aria-hidden throughout: the anchor or
// button already carries the same words as its accessible name, and a tooltip
// that also announced them would say everything twice.
function SignInTip({ text }: { text: string }) {
  return <span className="member-signin-tip" aria-hidden="true">{text}</span>
}

const trimSlash = (path: string) => path.replace(/\/+$/, '') || '/'

// Client island for the Members: Sign In widget. The registered Puck block is a
// server component (MembersSignInRsc) that renders this, so Puck's RSC
// <Render> never serialises its renderDropZone function bag into the client.
// In `preview` (the Puck editor) it always draws the signed-out state and the
// controls are inert: the editor runs under an admin session, never a member
// one, so there is no real state to reflect, and a modal portalled to
// document.body would cover the whole canvas rather than the page it belongs to.
export function SignInWidgetClient(
  opts: Partial<SignInWidgetOptions> & Partial<SignInWidgetState> & { preview?: boolean },
) {
  const o = { ...SIGN_IN_WIDGET_DEFAULTS, ...STATE_DEFAULTS, ...opts }
  const preview = opts.preview === true

  const [modalOpen, setModalOpen] = useState(false)
  const [modalRequested, setModalRequested] = useState(false)
  const pathname = usePathname()

  // A sign-in button on the sign-in page is one sign-in too many - the form is
  // already on screen below it. Hidden on that page only; everywhere else keeps
  // its button. The editor always shows it, or the block would vanish out of
  // the header while that header is being designed.
  if (!preview && pathname && trimSlash(pathname) === trimSlash(o.loginHref)) return null

  const padding = o.variant === 'plain' ? '0' : '0.5rem 0.875rem'
  const background = o.variant === 'filled'
    ? (o.bgColour || 'var(--color-surface)')
    : (o.variant === 'bordered' ? (o.bgColour || 'transparent') : 'transparent')
  const border = o.variant === 'bordered' ? `1px solid ${o.borderColour || 'var(--color-border)'}` : 'none'

  const boxStyle: CSSProperties = {
    // Containing block for the tooltip above; harmless on the variants that
    // never show one.
    position: 'relative',
    display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none',
    color: o.textColour || 'var(--color-text)', background, border,
    borderRadius: o.variant === 'plain' ? 0 : o.borderRadius, padding, lineHeight: 1,
    fontSize: '0.875rem', fontWeight: 500,
  }

  // ── Signed in ────────────────────────────────────────────────────────────
  // 'hide' never reaches here: the server half returns nothing at all for it,
  // so there is no markup to flash before the client works it out.
  if (o.signedIn) {
    const showAvatar = o.showAvatarWhenSignedIn !== 'no' && o.avatar !== null
    const accountInner = (
      <>
        {showAvatar && o.avatar
          ? (
            <MemberAvatar
              memberId={o.avatar.memberId}
              username={o.avatar.username}
              displayName={o.avatar.displayName}
              avatarChoice={o.avatar.avatarChoice}
              uploadedUrl={o.avatar.uploadedUrl}
              size={o.iconSize + 8}
              // The field is called "Show their picture instead of the icon",
              // so a member with no picture - no upload, or no Gravatar
              // registered against their address - keeps the icon. Initials in
              // a header are a third thing nobody asked for.
              fallback={<SignInIcon name={o.icon} size={o.iconSize} colour={o.iconColour} />}
            />
          )
          : <SignInIcon name={o.icon} size={o.iconSize} colour={o.iconColour} />}
        {o.signedInLabel && <span>{o.signedInLabel}</span>}
      </>
    )
    const accountName = o.signedInLabel || 'My account'
    return (
      <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
        <a href={o.accountHref} aria-label={accountName} className="member-signin-trigger" style={boxStyle}>
          {accountInner}
          {!o.signedInLabel && <SignInTip text={accountName} />}
        </a>
        {o.whenSignedIn === 'accountSignOut' && (
          <form action="/api/members/auth/logout" method="POST" style={{ margin: 0 }}>
            <button
              type="submit"
              style={{ ...boxStyle, font: 'inherit', fontSize: '0.875rem', fontWeight: 500, cursor: preview ? 'default' : 'pointer', WebkitAppearance: 'none', appearance: 'none' }}
            >
              {o.signOutLabel || 'Sign out'}
            </button>
          </form>
        )}
      </div>
    )
  }

  // ── Signed out ───────────────────────────────────────────────────────────
  const accessibleName = o.label || 'Sign in'
  const inner = (
    <>
      <SignInIcon name={o.icon} size={o.iconSize} colour={o.iconColour} />
      {o.label && <span>{o.label}</span>}
    </>
  )

  // Blank "after sign-in" means the page they were reading, which only the
  // browser knows. Search params are deliberately left off: reading them would
  // force a Suspense boundary around every header this block sits in.
  const redirectTarget = o.redirectTo || pathname || '/'

  if (o.clickAction === 'modal') {
    return (
      <>
        <button
          type="button"
          aria-label={accessibleName}
          aria-haspopup="dialog"
          aria-expanded={modalOpen}
          onClick={() => {
            if (preview) return
            setModalRequested(true)
            setModalOpen(true)
          }}
          className="member-signin-trigger"
          style={{ ...boxStyle, font: 'inherit', fontSize: '0.875rem', fontWeight: 500, cursor: preview ? 'default' : 'pointer', WebkitAppearance: 'none', appearance: 'none' }}
        >
          {inner}
          {!o.label && <SignInTip text={accessibleName} />}
        </button>
        {modalRequested && (
          <SignInModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            heading={o.modalHeading}
            width={o.modalWidth}
            radius={o.modalRadius}
            redirectTo={redirectTarget}
            memberBasePath={o.accountHref}
            registerHref={o.registerHref}
            registerLabel={o.registerLabel}
            showRegister={o.showRegisterLink !== 'no' && o.registerAllowed}
          />
        )}
      </>
    )
  }

  // Link mode. The sign-in page reads ?redirect= and sanitises it itself, so an
  // odd value here can only ever cost the visitor a trip to the account
  // overview - it can never send them off-site.
  const href = redirectTarget && redirectTarget !== '/'
    ? `${o.loginHref}?redirect=${encodeURIComponent(redirectTarget)}`
    : o.loginHref
  return (
    <a href={href} aria-label={accessibleName} className="member-signin-trigger" style={boxStyle}>
      {inner}
      {!o.label && <SignInTip text={accessibleName} />}
    </a>
  )
}
