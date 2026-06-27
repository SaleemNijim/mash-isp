'use client'

import { useEffect, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
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
  emptyPppPlanForm,
  parsePppPlanForm,
  pppPlanFormFromRow,
  type PppPlanRow,
  type PppPlanFormState,
} from '@/lib/ppp/types'

interface PppPlanFormModalProps {
  open: boolean
  mode: 'add' | 'edit'
  plan?: PppPlanRow | null
  onClose: () => void
  onSuccess: () => void
}

export function PppPlanFormModal({
  open,
  mode,
  plan,
  onClose,
  onSuccess,
}: PppPlanFormModalProps) {
  const supabase = createClient()
  const { data: tenant } = useTenant()
  const [form, setForm] = useState<PppPlanFormState>(emptyPppPlanForm())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(mode === 'edit' && plan ? pppPlanFormFromRow(plan) : emptyPppPlanForm())
  }, [open, mode, plan])

  async function handleSave() {
    if (!tenant?.id) return
    const parsed = parsePppPlanForm(form)
    if (!parsed.name || !parsed.speed) {
      toast.error('الاسم والسرعة مطلوبان')
      return
    }
    if (!Number.isFinite(parsed.price) || parsed.price < 0) {
      toast.error('السعر غير صالح')
      return
    }
    if (!Number.isFinite(parsed.min_available_usernames) || parsed.min_available_usernames < 0) {
      toast.error('الحد الأدنى غير صالح')
      return
    }

    setSaving(true)
    try {
      if (mode === 'add') {
        const { error } = await supabase.from('ppp_plans').insert({
          tenant_id: tenant.id,
          name: parsed.name,
          speed: parsed.speed,
          price: parsed.price,
          min_available_usernames: Math.floor(parsed.min_available_usernames),
        })
        if (error) throw error
        toast.success('تمت إضافة الفئة')
      } else if (plan) {
        const { error } = await supabase
          .from('ppp_plans')
          .update({
            name: parsed.name,
            speed: parsed.speed,
            price: parsed.price,
            min_available_usernames: Math.floor(parsed.min_available_usernames),
          })
          .eq('id', plan.id)
        if (error) throw error
        toast.success('تم تحديث الفئة')
      }
      onSuccess()
      onClose()
    } catch (err) {
      const pg = err as PostgrestError
      if (pg.code === '23505') {
        toast.error(`الفئة «${parsed.name}» موجودة مسبقاً`)
      } else {
        toast.error('فشل الحفظ')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? 'إضافة فئة PPP' : 'تعديل الفئة'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ppp-cat-name">الاسم *</Label>
            <Input
              id="ppp-cat-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="إشتراك 4M"
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ppp-cat-speed">السرعة *</Label>
            <Input
              id="ppp-cat-speed"
              value={form.speed}
              onChange={(e) => setForm((f) => ({ ...f, speed: e.target.value }))}
              placeholder="4M"
              dir="ltr"
              className="text-left font-mono"
              disabled={saving}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ppp-cat-price">السعر (ش)</Label>
              <Input
                id="ppp-cat-price"
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                dir="ltr"
                className="text-right tabular-nums"
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ppp-cat-min">حد أدنى (متاح)</Label>
              <Input
                id="ppp-cat-min"
                type="number"
                min={0}
                value={form.min_available}
                onChange={(e) => setForm((f) => ({ ...f, min_available: e.target.value }))}
                dir="ltr"
                className="text-right tabular-nums"
                disabled={saving}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'جارٍ الحفظ…' : 'حفظ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
