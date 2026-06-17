'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface CustomerOption {
  id: string
  name: string
  phone: string | null
}

interface CreateSubscriptionModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  preselectedCustomerId?: string | null
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function addMonthISO(from: string): string {
  const d = new Date(from)
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

export function CreateSubscriptionModal({
  open,
  onClose,
  onSuccess,
  preselectedCustomerId,
}: CreateSubscriptionModalProps) {
  const { data: tenant } = useTenant()
  const supabase = createClient()

  const [customerId, setCustomerId] = useState('')
  const [type, setType] = useState<'bb' | 'we'>('bb')
  const [speed, setSpeed] = useState('')
  const [price, setPrice] = useState('')
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState(addMonthISO(todayISO()))
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setCustomerId(preselectedCustomerId ?? '')
    setType('bb')
    setSpeed('')
    setPrice('')
    const start = todayISO()
    setStartDate(start)
    setEndDate(addMonthISO(start))
  }, [open, preselectedCustomerId])

  const { data: customers = [] } = useQuery<CustomerOption[]>({
    queryKey: ['customers-select', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone')
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .order('name')
        .limit(500)
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!tenant?.id,
  })

  async function handleSubmit() {
    if (!tenant?.id) return
    if (!customerId) {
      toast.error('اختر المشترك')
      return
    }
    if (!startDate || !endDate) {
      toast.error('تواريخ البداية والنهاية مطلوبة')
      return
    }

    const priceNum = price.trim() ? Number(price) : null
    if (price.trim() && (!Number.isFinite(priceNum) || priceNum! < 0)) {
      toast.error('السعر غير صالح')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.from('subscriptions').insert({
        tenant_id: tenant.id,
        customer_id: customerId,
        type,
        speed: speed.trim() || null,
        price: priceNum,
        start_date: startDate,
        end_date: endDate,
        status: 'active',
      })
      if (error) throw error

      toast.success('تم إنشاء الاشتراك بنجاح')
      onSuccess()
      onClose()
    } catch {
      toast.error('فشل إنشاء الاشتراك')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>اشتراك جديد</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>المشترك *</Label>
            <Select value={customerId} onValueChange={setCustomerId} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="اختر مشتركاً" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` — ${c.phone}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>نوع الاشتراك</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as 'bb' | 'we')}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bb">BB (Palestine BB)</SelectItem>
                <SelectItem value="we">WE (Wireless)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="subSpeed">السرعة</Label>
              <Input
                id="subSpeed"
                value={speed}
                onChange={(e) => setSpeed(e.target.value)}
                placeholder="4M / 8M"
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subPrice">السعر الشهري (ج.م)</Label>
              <Input
                id="subPrice"
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="150"
                disabled={loading}
                dir="ltr"
                className="text-right"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="subStart">تاريخ البداية</Label>
              <Input
                id="subStart"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setEndDate(addMonthISO(e.target.value))
                }}
                disabled={loading}
                dir="ltr"
                className="text-right"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subEnd">تاريخ الانتهاء</Label>
              <Input
                id="subEnd"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={loading}
                dir="ltr"
                className="text-right"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={loading}>
            {loading ? 'جارٍ الإنشاء...' : 'إنشاء اشتراك'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
