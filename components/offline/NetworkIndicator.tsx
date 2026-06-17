'use client'

import { useEffect, useRef, useState } from 'react'
import { WifiOff, CheckCircle2 } from 'lucide-react'

type BannerMode = 'hidden' | 'offline' | 'synced'

/**
 * شريط حالة الاتصال — §9.11 + D18
 * يظهر عند فقدان الاتصال، ثم إشعار نجاح مؤقت (3 ثوانٍ) بعد العودة.
 */
export function NetworkIndicator() {
  const [mode, setMode] = useState<BannerMode>('hidden')
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const clearSyncTimer = () => {
      if (syncTimer.current) {
        clearTimeout(syncTimer.current)
        syncTimer.current = null
      }
    }

    const goOffline = () => {
      clearSyncTimer()
      setMode('offline')
    }

    const goOnline = () => {
      clearSyncTimer()
      setMode('synced')
      syncTimer.current = setTimeout(() => setMode('hidden'), 3000)
    }

    if (!navigator.onLine) {
      setMode('offline')
    }

    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)

    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
      clearSyncTimer()
    }
  }, [])

  if (mode === 'hidden') return null

  if (mode === 'synced') {
    return (
      <div
        role="status"
        aria-live="polite"
        dir="rtl"
        className="w-full text-sm font-medium text-center py-2 px-4 flex items-center justify-center gap-2"
        style={{ backgroundColor: '#EAF3DE', color: '#27500A' }}
      >
        <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
        تمت المزامنة — أنت متصل الآن
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      dir="rtl"
      className="w-full text-sm font-medium text-center py-2 px-4 flex items-center justify-center gap-2"
      style={{ backgroundColor: '#FAEEDA', color: '#633806' }}
    >
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden />
      أنت تعمل دون اتصال — التغييرات ستُزامَن عند الاتصال
    </div>
  )
}
