'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface PortFormModalProps {
  open: boolean
  onClose: () => void
  onSuccess: (port: { id: string; name: string }) => void
}

export function PortFormModal({ open, onClose, onSuccess }: PortFormModalProps) {
  const { data: tenant } = useTenant()
  const supabase = createClient()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) setName('')
  }, [open])

  async function handleSubmit() {
    if (!tenant?.id) return
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('اسم البورت مطلوب')
      return
    }

    setLoading(true)
    try {
      const { data: existing } = await supabase
        .from('network_ports')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('name', trimmed)
        .eq('is_deleted', false)
        .maybeSingle()

      if (existing?.id) {
        toast.error('يوجد بورت بنفس الاسم')
        return
      }

      const { data, error } = await supabase
        .from('network_ports')
        .insert({ tenant_id: tenant.id, name: trimmed, is_deleted: false })
        .select('id, name')
        .single()

      if (error) throw error
      toast.success(`تم إنشاء ${trimmed}`)
      onSuccess({ id: data.id as string, name: data.name as string })
      onClose()
    } catch {
      toast.error('فشل إنشاء البورت')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>إضافة Port</DialogTitle>
          <DialogDescription>
            مثال: Port 2 أو Port 8 — بعد الإنشاء ارفع ملف Excel لراوترات هذا البورت فقط.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="portName">اسم البورت *</Label>
          <Input
            id="portName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Port 2"
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSubmit()
            }}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={loading}>
            {loading ? 'جارٍ الإنشاء…' : 'إنشاء'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
