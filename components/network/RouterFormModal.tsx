'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useNetworkDeviceTypes } from '@/hooks/useNetworkDeviceTypes'
import { DeviceTypePicker } from '@/components/network/DeviceTypePicker'
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
  port_id?: string | null
}

interface NetworkPortOption {
  id: string
  name: string
}

interface RouterFormModalProps {
  open: boolean
  router?: RouterRecord | null
  ports: NetworkPortOption[]
  defaultPortId?: string | null
  onClose: () => void
  onSuccess: () => void
}

export function RouterFormModal({
  open,
  router,
  ports,
  defaultPortId,
  onClose,
  onSuccess,
}: RouterFormModalProps) {
  const { data: tenant } = useTenant()
  const { data: deviceTypes = [] } = useNetworkDeviceTypes()
  const supabase = createClient()
  const isEdit = !!router

  const [name, setName] = useState('')
  const [model, setModel] = useState('')
  const [macAddress, setMacAddress] = useState('')
  const [ipAddress, setIpAddress] = useState('')
  const [location, setLocation] = useState('')
  const [deviceType, setDeviceType] = useState('')
  const [portId, setPortId] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(router?.name ?? '')
    setModel(router?.model ?? '')
    setMacAddress(router?.mac_address ?? '')
    setIpAddress(router?.ip_address ?? '')
    setLocation(router?.location ?? '')
    setDeviceType(router?.device_type ?? '')
    setPortId(router?.port_id ?? defaultPortId ?? '')
  }, [open, router, defaultPortId])

  async function handleSubmit() {
    if (!tenant?.id) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('SSID مطلوب')
      return
    }
    if (!portId) {
      toast.error('اختر البورت — الراوتر يظهر فقط ضمن البورت المحدد')
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
        port_id: portId,
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
            <Label htmlFor="routerPort">البورت *</Label>
            <select
              id="routerPort"
              value={portId}
              onChange={(e) => setPortId(e.target.value)}
              disabled={loading}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">— اختر البورت —</option>
              {ports.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="routerName">SSID (اسم الشبكة) *</Label>
            <Input
              id="routerName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="FUTUER WAY 1.10"
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
              placeholder="192.168.10.1"
              disabled={loading}
              dir="ltr"
              className="text-right font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="routerModel">الكود</Label>
            <Input
              id="routerModel"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="10.1001"
              disabled={loading}
              dir="ltr"
              className="text-right font-mono text-sm"
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
            <Label htmlFor="routerType">نوع الجهاز</Label>
            <DeviceTypePicker
              value={deviceType}
              options={deviceTypes}
              onChange={setDeviceType}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="routerLocation">الموقع</Label>
            <Input
              id="routerLocation"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="اسم المشترك / العنوان"
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
