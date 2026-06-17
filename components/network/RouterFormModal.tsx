'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface RouterRecord {
  id: string
  name: string
  model: string | null
  mac_address: string | null
  ip_address: string | null
  location: string | null
  device_type: string | null
}

interface RouterFormModalProps {
  open: boolean
  router?: RouterRecord | null
  onClose: () => void
  onSuccess: () => void
}

export function RouterFormModal({
  open,
  router,
  onClose,
  onSuccess,
}: RouterFormModalProps) {
  const { data: tenant } = useTenant()
  const supabase = createClient()
  const isEdit = !!router

  const [name, setName] = useState('')
  const [model, setModel] = useState('')
  const [macAddress, setMacAddress] = useState('')
  const [ipAddress, setIpAddress] = useState('')
  const [location, setLocation] = useState('')
  const [deviceType, setDeviceType] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(router?.name ?? '')
    setModel(router?.model ?? '')
    setMacAddress(router?.mac_address ?? '')
    setIpAddress(router?.ip_address ?? '')
    setLocation(router?.location ?? '')
    setDeviceType(router?.device_type ?? '')
  }, [open, router])

  async function handleSubmit() {
    if (!tenant?.id) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('اسم الجهاز مطلوب')
      return
    }

    setLoading(true)
    try {
      const payload = {
        tenant_id: tenant.id,
        name: trimmedName,
        model: model.trim() || null,
        mac_address: macAddress.trim() || null,
        ip_address: ipAddress.trim() || null,
        location: location.trim() || null,
        device_type: deviceType.trim() || null,
      }

      if (isEdit && router) {
        const { error } = await supabase
          .from('network_routers')
          .update(payload)
          .eq('id', router.id)
        if (error) throw error
        toast.success('تم تحديث الجهاز')
      } else {
        const { error } = await supabase.from('network_routers').insert(payload)
        if (error) throw error
        toast.success('تم إضافة الجهاز')
      }

      onSuccess()
      onClose()
    } catch {
      toast.error('فشلت العملية')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'تعديل جهاز شبكة' : 'إضافة جهاز شبكة'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="routerName">الاسم *</Label>
            <Input
              id="routerName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Router-Main-01"
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="routerType">النوع</Label>
            <Input
              id="routerType"
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value)}
              placeholder="Router / AP"
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="routerModel">الموديل</Label>
            <Input
              id="routerModel"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="MikroTik hAP"
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="routerMac">MAC</Label>
            <Input
              id="routerMac"
              value={macAddress}
              onChange={(e) => setMacAddress(e.target.value)}
              placeholder="AA:BB:CC:DD:EE:FF"
              disabled={loading}
              dir="ltr"
              className="text-right font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="routerIp">IP</Label>
            <Input
              id="routerIp"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              placeholder="192.168.1.1"
              disabled={loading}
              dir="ltr"
              className="text-right font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="routerLocation">الموقع</Label>
            <Input
              id="routerLocation"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="البرج / الطابق"
              disabled={loading}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={loading}>
            {loading ? 'جارٍ الحفظ...' : isEdit ? 'حفظ' : 'إضافة'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
