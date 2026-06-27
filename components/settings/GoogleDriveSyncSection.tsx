'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Cloud, RefreshCw, Unlink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataPanel } from '@/components/shared/DataPanel'

type DriveStatus = {
  eligible: boolean
  reason: 'paid_plan' | 'trial' | 'inactive' | 'expired' | 'missing_plan'
  tenantName: string
  googleConfigured: boolean
  sync: {
    google_email: string | null
    drive_folder_name: string | null
    is_connected: boolean
    last_success_at: string | null
    last_error_at: string | null
    last_error_message: string | null
  } | null
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'لم تتم المزامنة بعد'
  return new Intl.DateTimeFormat('ar', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function ineligibleMessage(reason: DriveStatus['reason']): string {
  if (reason === 'trial') return 'المزامنة متاحة للشركات المشتركة فقط، وليست للتجربة المجانية.'
  if (reason === 'expired') return 'انتهى اشتراك الشركة. جدّد الباقة لتفعيل Google Drive.'
  if (reason === 'inactive') return 'الشركة غير مفعّلة حالياً.'
  if (reason === 'missing_plan') return 'لا توجد باقة مدفوعة مرتبطة بالشركة.'
  return ''
}

export function GoogleDriveSyncSection() {
  const [status, setStatus] = useState<DriveStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/google-drive/status')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'فشل تحميل حالة Google Drive')
      setStatus(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل تحميل حالة Google Drive')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  useEffect(() => {
    const driveStatus = new URLSearchParams(window.location.search).get('drive')
    if (!driveStatus) return
    if (driveStatus === 'connected') toast.success('تم ربط Google Drive ومزامنة الملفات')
    if (driveStatus === 'not-eligible') toast.error('الميزة متاحة للباقات المدفوعة فقط')
    if (driveStatus === 'missing_google_credentials') {
      toast.error('إعداد Google Drive غير مكتمل. أضف GOOGLE_DRIVE_CLIENT_ID و GOOGLE_DRIVE_CLIENT_SECRET في .env.local')
    }
    if (driveStatus === 'error') toast.error('تعذر ربط Google Drive')
    if (driveStatus === 'oauth-error') toast.error('تم إلغاء ربط Google من نافذة الموافقة')
  }, [])

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

  async function disconnect() {
    setBusy(true)
    try {
      const response = await fetch('/api/google-drive/disconnect', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'فشل فصل الربط')
      toast.success('تم فصل Google Drive')
      await loadStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل فصل الربط')
    } finally {
      setBusy(false)
    }
  }

  const connected = status?.sync?.is_connected

  return (
    <DataPanel className="p-5 h-full">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Cloud size={18} className="text-primary" />
          <div>
            <h2 className="font-semibold text-lg">مزامنة Google Drive</h2>
            <p className="text-xs text-muted-foreground mt-1">
              كل شركة تربط إيميل Google الخاص بها. الملفات تُرفع إلى Drive حساب الشركة، وليس حساب MASH.
            </p>
          </div>
        </div>
        <Badge variant={connected ? 'default' : 'outline'}>
          {connected ? 'مربوط' : 'غير مربوط'}
        </Badge>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">جارٍ تحميل حالة الربط…</p>
      ) : status && !status.eligible ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {ineligibleMessage(status.reason)}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-mash-surface p-3 text-sm space-y-1.5">
            {!status?.googleConfigured && (
              <div className="text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 space-y-1.5">
                <p className="font-medium">إعداد المنصة (مرة واحدة — مطوّر MASH)</p>
                <p className="text-xs leading-relaxed">
                  أضف <code className="text-xs">GOOGLE_DRIVE_CLIENT_ID</code> و{' '}
                  <code className="text-xs">GOOGLE_DRIVE_CLIENT_SECRET</code> في{' '}
                  <code className="text-xs">.env.local</code> ثم أعد تشغيل التطبيق.
                  هذا ليس إيميل الشركة — هو تطبيق OAuth الخاص بـ MASH ISP.
                </p>
              </div>
            )}
            {status?.googleConfigured && !connected && (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2 leading-relaxed">
                اضغط «ربط Google Drive» وسجّل الدخول بحساب Gmail أو Google Workspace الخاص بالشركة.
                سيُحفظ الإيميل هنا تلقائياً لكل شركة على حدة.
              </p>
            )}
            <p>
              <span className="text-muted-foreground">المجلد: </span>
              {status?.sync?.drive_folder_name ?? `MASH ISP — ${status?.tenantName ?? 'الشركة'}`}
            </p>
            <p>
              <span className="text-muted-foreground">حساب Google: </span>
              {status?.sync?.google_email ?? 'لم يتم الربط بعد'}
            </p>
            <p>
              <span className="text-muted-foreground">آخر مزامنة ناجحة: </span>
              {formatDate(status?.sync?.last_success_at)}
            </p>
            {status?.sync?.last_error_message && (
              <p className="text-destructive">
                آخر خطأ: {status.sync.last_error_message}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {!connected ? (
              <Button asChild disabled={busy || !status?.googleConfigured}>
                <a href="/api/google-drive/connect">ربط Google Drive</a>
              </Button>
            ) : (
              <>
                <Button type="button" onClick={() => void syncNow()} disabled={busy} className="gap-1.5">
                  <RefreshCw size={14} />
                  مزامنة الآن
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void disconnect()}
                  disabled={busy}
                  className="gap-1.5"
                >
                  <Unlink size={14} />
                  فصل الربط
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </DataPanel>
  )
}
