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

export interface CustomerRecord {
  id: string
  name: string
  phone: string | null
  address: string | null
  notes: string | null
}

interface CustomerFormModalProps {
  open: boolean
  customer?: CustomerRecord | null
  onClose: () => void
  onSuccess: () => void
}

export function CustomerFormModal({
  open,
  customer,
  onClose,
  onSuccess,
}: CustomerFormModalProps) {
  const { data: tenant } = useTenant()
  const supabase = createClient()
  const isEdit = !!customer

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(customer?.name ?? '')
    setPhone(customer?.phone ?? '')
    setAddress(customer?.address ?? '')
    setNotes(customer?.notes ?? '')
  }, [open, customer])

  async function handleSubmit() {
    if (!tenant?.id) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('اسم المشترك مطلوب')
      return
    }

    setLoading(true)
    try {
      const payload = {
        tenant_id: tenant.id,
        name: trimmedName,
        phone: phone.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      }

      if (isEdit && customer) {
        const { error } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', customer.id)
        if (error) throw error
        toast.success('تم تحديث بيانات المشترك')
      } else {
        const { error } = await supabase.from('customers').insert(payload)
        if (error) throw error
        toast.success('تم إضافة المشترك بنجاح')
      }

      onSuccess()
      onClose()
    } catch {
      toast.error('فشلت العملية. يرجى المحاولة مرة أخرى.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'تعديل مشترك' : 'إضافة مشترك جديد'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="custName">الاسم *</Label>
            <Input
              id="custName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسم المشترك"
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custPhone">الهاتف</Label>
            <Input
              id="custPhone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0599XXXXXX"
              disabled={loading}
              dir="ltr"
              className="text-right"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custAddress">العنوان</Label>
            <Input
              id="custAddress"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="الحي / الشارع"
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custNotes">ملاحظات</Label>
            <Input
              id="custNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="اختياري"
              disabled={loading}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={loading}>
            {loading ? 'جارٍ الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
