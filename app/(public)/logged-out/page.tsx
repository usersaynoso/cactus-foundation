'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoggedOutPage() {
  const router = useRouter()
  const [seconds, setSeconds] = useState(3)

  useEffect(() => {
    if (seconds <= 0) {
      router.push('/')
      return
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [seconds, router])

  return (
    <div style={{ maxWidth: 480, margin: '6rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👋</div>
      <h1 style={{ marginBottom: '0.5rem' }}>Logged out successfully</h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
        Redirecting to the homepage in {seconds} second{seconds !== 1 ? 's' : ''}…
      </p>
      <Link href="/" style={{ color: 'inherit', textDecoration: 'underline', fontSize: '0.9375rem' }}>
        Go now
      </Link>
    </div>
  )
}
