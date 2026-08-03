'use client'

// The sign-in panel the Members: Sign In block floats over the page when it is
// set to open a modal rather than link to the sign-in page. It hosts the very
// same LoginForm the /login page does, so passkeys, sign-in links, passwords,
// two-factor codes and recovery codes all behave exactly as they do there -
// there is no second implementation of any of it to drift.
//
// Rendered into document.body through a portal: this block very often lives in
// the site header, which is just as often a positioned or overflow-clipped
// stacking context of its own, and a panel that has to cover the whole viewport
// cannot be born inside one.

import { useEffect, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import LoginForm from '@/components/members/LoginForm'

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

// Keeps Tab inside the open panel. A modal that lets focus wander onto the page
// behind it is a modal in looks only - a keyboard visitor tabs straight out of
// the form and cannot tell where they are.
function trapTab(panel: HTMLElement, e: KeyboardEvent) {
  if (e.key !== 'Tab') return
  const focusable = panel.querySelectorAll<HTMLElement>(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
  )
  const items = Array.from(focusable).filter((el) => el.offsetParent !== null || el === document.activeElement)
  if (items.length === 0) return
  const first = items[0]!
  const last = items[items.length - 1]!
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

export type SignInModalProps = {
  open: boolean
  onClose: () => void
  heading: string
  width: number
  radius: number
  redirectTo: string
  // Where the member area lives, so the form's own detours (verify your email,
  // add a mobile number) resolve against it rather than against whatever page
  // this panel happens to be floating over.
  memberBasePath: string
  registerHref: string
  registerLabel: string
  showRegister: boolean
}

export function SignInModal({
  open, onClose, heading, width, radius, redirectTo, memberBasePath, registerHref, registerLabel, showRegister,
}: SignInModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // The portal target. Safe to read while rendering because this component is
  // only ever reached through a client-side dynamic import with ssr:false (see
  // SignInWidgetClient) - it never renders on the server, so there is no markup
  // for this to disagree with.
  const host = typeof document === 'undefined' ? null : document.body

  // Escape closes, Tab stays inside, and the page behind stops scrolling while
  // the panel is up.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (panel) trapTab(panel, e)
    }
    document.addEventListener('keydown', onKeyDown, true)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  // Focus lands on the close button as the panel opens, so a keyboard or screen
  // reader user is inside the dialog rather than still back on the trigger.
  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])

  if (!host) return null

  const backdropStyle: CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'var(--color-overlay)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: '1.5rem', overflowY: 'auto',
    opacity: open ? 1 : 0,
    // visibility (not display) so the shut panel keeps its place in the DOM to
    // animate from, while staying out of the tab order and off screen readers.
    visibility: open ? 'visible' : 'hidden',
    transition: 'opacity 0.2s ease, visibility 0.2s ease',
  }

  const panelStyle: CSSProperties = {
    position: 'relative', width: '100%', maxWidth: width, margin: 'auto',
    background: 'var(--color-surface)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    borderRadius: radius,
    padding: '1.5rem',
    boxShadow: 'var(--shadow-xl)',
    transform: open ? 'translateY(0)' : 'translateY(-8px)',
    transition: 'transform 0.2s ease',
  }

  return createPortal(
    // Clicking the page behind the panel shuts it, the way a visitor expects of
    // anything floating over what they were reading. The panel stops the click
    // travelling so a click inside it never counts as a click outside.
    <div style={backdropStyle} onClick={onClose} aria-hidden={!open}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={heading || 'Sign in'}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: 'var(--space-4)' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text)' }}>
            {heading || 'Sign in'}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close sign-in"
            style={{ background: 'none', border: 'none', padding: 4, margin: -4, cursor: 'pointer', color: 'var(--color-text-muted)', lineHeight: 0 }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* The form draws its own "Sign in" heading on the sign-in page; here
            the dialog already carries one, so it is asked to leave it out
            rather than have the panel say it twice. */}
        <LoginForm redirectTo={redirectTo} basePath={memberBasePath} showHeading={false} />

        {showRegister && (
          <p style={{ margin: 'var(--space-4) 0 0', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            <a href={registerHref}>{registerLabel || 'Create an account'}</a>
          </p>
        )}
      </div>
    </div>,
    host,
  )
}
