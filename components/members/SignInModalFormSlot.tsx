'use client'

// What lands in the Content Slot of an "Account Login Modal" layout: the real
// sign-in form, the very same one the /login page and the plain modal use.
//
// It is a component rather than the form itself because the form needs two
// things the layout cannot carry. The first is where to send the visitor after
// they sign in, which - when the block leaves "after sign-in" blank - is the
// page they were reading, and only the browser knows that. The second is that
// the layout is rendered on the server, inside a block that may sit in a header
// on every page of the site: importing the form there would put the whole of it
// (passkeys, two-factor, recovery codes) in every page's bundle for the sake of
// a panel most visitors never open. Loading it here, on render, keeps that where
// it was - the layout only renders once the panel is actually opened.

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'

const LoginForm = dynamic(() => import('@/components/members/LoginForm'), { ssr: false })

type Props = {
  // The block's sanitised "after sign-in" destination. Blank means the current
  // page.
  redirectTo: string
  // Where the member area lives ("/account"), so the form's own detours (verify
  // your email, add a mobile number) resolve against it rather than against
  // whatever page the panel is floating over.
  basePath: string
}

export default function SignInModalFormSlot({ redirectTo, basePath }: Props) {
  const pathname = usePathname()
  return (
    <LoginForm
      redirectTo={redirectTo || pathname || '/'}
      basePath={basePath}
      // The panel draws its own heading, or the layout does. Either way the form
      // saying "Sign in" a second time is one too many.
      showHeading={false}
    />
  )
}
