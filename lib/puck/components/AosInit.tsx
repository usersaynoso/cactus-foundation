'use client'

import { useEffect } from 'react'
import AOS from 'aos'
import 'aos/dist/aos.css'

export default function AosInit() {
  useEffect(() => {
    AOS.init({ once: false, duration: 600 })
  }, [])
  return null
}
