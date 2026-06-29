'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Cloud, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

type DriveStatusResponse = {
  eligible: boolean
  sync: {
    is_connected: boolean
    last_success_at: string | null
  } | null
}

export function GoogleDriveSyncButton() {
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/google-drive/status')
      if (!response.ok) {
        setVisible(false)
        return
      }
      const data = (await response.json()) as DriveStatusResponse
      const show = data.eligible && data.sync?.is_connected === true
      setVisible(show)
      setLastSuccessAt(data.sync?.last_success_at ?? null)
    } catch {
      setVisible(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  async function syncNow() {
    setBusy(true)
    try {
      const response = await fetch('/api/google-drive/sync', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'فشلت المزامنة')
      toast.success('تمت مزامنة ملفات Google Drive')
      await loadStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشلت المزامنة')
    } finally {
      setBusy(false)
    }
  }

  if (!visible) return null

  const lastSyncLabel = lastSuccessAt
    ? new Intl.DateTimeFormat('ar', { dateStyle: 'short', timeStyle: 'short' }).format(
        new Date(lastSuccessAt),
      )
    : null

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() => void syncNow()}
      className="gap-1.5 shrink-0"
      title={lastSyncLabel ? `آخر مزامنة: ${lastSyncLabel}` : 'مزامنة Google Drive'}
    >
      {busy ? <RefreshCw size={14} className="animate-spin" /> : <Cloud size={14} />}
      <span className="hidden sm:inline">مزامنة Drive</span>
    </Button>
  )
}
