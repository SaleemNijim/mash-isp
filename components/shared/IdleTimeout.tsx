'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const IDLE_MS = 30 * 60 * 1000 // 30 minutes

export function IdleTimeout() {
  const router = useRouter()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()

    async function logout() {
      await supabase.auth.signOut()
      router.push('/login')
    }

    function reset() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(logout, IDLE_MS)
    }

    const events: string[] = [
      'mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click',
    ]
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      events.forEach(e => window.removeEventListener(e, reset))
    }
  }, [router])

  return null
}
