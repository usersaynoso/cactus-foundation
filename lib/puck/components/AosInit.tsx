'use client'

import { useEffect } from 'react'
import 'aos/dist/aos.css'

// AOS used to be a static import, so its library landed in the first-load bundle of
// every public page whether or not a single block on the site animated. It is loaded
// on demand here instead, and only once we can see a block that actually asked for a
// scroll animation - so a site that uses none never downloads it at all. The
// stylesheet stays static: it is small, and CSS chunks want to be in the entry.
export default function AosInit() {
  useEffect(() => {
    if (!document.querySelector('[data-aos]')) return

    let cancelled = false
    void import('aos').then(({ default: AOS }) => {
      if (cancelled) return
      AOS.init({ once: false, duration: 600 })
    })

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
