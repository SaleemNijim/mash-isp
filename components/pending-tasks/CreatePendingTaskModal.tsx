'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Bell, User, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type TaskMode = 'reminder' | 'contact' | 'subscriber'

interface CustomerOption {
  id: string
  name: string
  phone: string | null
}

interface CreatePendingTaskModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

const MODE_OPTIONS: {
  id: TaskMode
  label: string
  hint: string
  icon: typeof Bell
}[] = [
  {
    id: 'reminder',
    label: 'تذكير',
    hint: 'مهمة شخصية أو متابعة داخلية',
    icon: Bell,
  },
  {
    id: 'contact',
    label: 'جهة / زبون',
    hint: 'زبون يومي أو طرف خارج القائمة',
    icon: User,
  },
  {
    id: 'subscriber',
    label: 'مشترك',
    hint: 'متابعة دفع أو إشعار لمشترك PPP',
    icon: Users,
  },
]

function defaultDueAtLocal(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function parseOptionalAmount(raw: string): number | null {
  if (!raw.trim()) return null
  const n = Number(raw)
  if (Number.isNaN(n) || n <= 0) return null
  return n
}

export function CreatePendingTaskModal({
  open,
  onClose,
  onSuccess,
}: CreatePendingTaskModalProps) {
  const supabase = createClient()
  const { data: tenant } = useTenant()

  const [mode, setMode] = useState<TaskMode>('reminder')
  const [title, setTitle] = useState('')
  const [contactLabel, setContactLabel] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [dueAt, setDueAt] = useState(defaultDueAtLocal)
  const [saving, setSaving] = useState(false)

  const { data: customers = [], isLoading: customersLoading } = useQuery<CustomerOption[]>({
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
    enabled: open && !!tenant?.id && mode === 'subscriber',
  })

  useEffect(() => {
    if (!open) return
    setMode('reminder')
    setTitle('')
    setContactLabel('')
    setContactPhone('')
    setCustomerId('')
    setAmount('')
    setNotes('')
    setDueAt(defaultDueAtLocal())
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tenant?.id) return

    if (!dueAt) {
      toast.error('موعد المتابعة مطلوب')
      return
    }

    const parsedAmount = parseOptionalAmount(amount)
    if (amount.trim() && parsedAmount == null) {
      toast.error('المبلغ غير صالح')
      return
    }

    const row: Record<string, unknown> = {
      tenant_id: tenant.id,
      due_at: new Date(dueAt).toISOString(),
      status: 'pending',
      amount: parsedAmount,
      notes: notes.trim() || null,
      title: null,
      contact_label: null,
      contact_phone: null,
      customer_id: null,
    }

    if (mode === 'reminder') {
      if (!title.trim()) {
        toast.error('عنوان التذكير مطلوب')
        return
      }
      row.title = title.trim()
    } else if (mode === 'contact') {
      if (!contactLabel.trim()) {
        toast.error('اسم الجهة مطلوب')
        return
      }
      row.contact_label = contactLabel.trim()
      row.contact_phone = contactPhone.trim() || null
      row.title = title.trim() || null
    } else {
      if (!customerId) {
        toast.error('اختر المشترك')
        return
      }
      row.customer_id = customerId
    }

    setSaving(true)
    try {
      const { error } = await supabase.from('pending_tasks').insert(row)
      if (error) throw error

      toast.success('تمت إضافة المهمة')
      onSuccess()
      onClose()
    } catch {
      toast.error('فشلت إضافة المهمة. يرجى المحاولة مرة أخرى.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إضافة مهمة</DialogTitle>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {MODE_OPTIONS.map(({ id, label, hint, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                disabled={saving}
                className={`rounded-lg border p-2.5 text-right transition-colors ${
                  mode === id
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border hover:bg-muted/40'
                }`}
              >
                <Icon size={16} className="mb-1 text-primary" />
                <p className="text-xs font-semibold">{label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{hint}</p>
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            {mode === 'reminder' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="task-title">عنوان التذكير *</Label>
                  <Input
                    id="task-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثال: مراجعة فاتورة الكهرباء"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task-notes">تفاصيل</Label>
                  <textarea
                    id="task-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="ملاحظات إضافية…"
                    disabled={saving}
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </>
            )}

            {mode === 'contact' && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-label">اسم الجهة *</Label>
                    <Input
                      id="contact-label"
                      value={contactLabel}
                      onChange={(e) => setContactLabel(e.target.value)}
                      placeholder="زبون يومي، موزع…"
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-phone">هاتف</Label>
                    <Input
                      id="contact-phone"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      disabled={saving}
                      dir="ltr"
                      className="text-left tabular-nums"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-subject">موضوع المتابعة</Label>
                  <Input
                    id="contact-subject"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثال: تحصيل قيمة بطاقات"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-notes">تفاصيل</Label>
                  <textarea
                    id="contact-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={saving}
                    rows={2}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </>
            )}

            {mode === 'subscriber' && (
              <>
                <div className="space-y-1.5">
                  <Label>المشترك *</Label>
                  <Select
                    value={customerId || undefined}
                    onValueChange={setCustomerId}
                    disabled={saving || customersLoading}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={customersLoading ? 'جارٍ التحميل…' : 'اختر مشتركاً'}
                      />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
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
                  <Label htmlFor="sub-notes">ملاحظات</Label>
                  <Input
                    id="sub-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="سبب المتابعة…"
                    disabled={saving}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  إذا أدخلت مبلغاً، ستُعامل المهمة كمتابعة دفع وتتطلب إثباتاً عند التأكيد.
                </p>
              </>
            )}

            <div className="grid gap-3 sm:grid-cols-2 pt-1 border-t border-border/60">
              <div className="space-y-1.5">
                <Label htmlFor="task-amount">
                  {mode === 'subscriber' ? 'المبلغ (ج.م)' : 'مبلغ متوقع (اختياري)'}
                </Label>
                <Input
                  id="task-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={saving}
                  dir="ltr"
                  className="text-left tabular-nums"
                  placeholder="—"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-due">موعد المتابعة *</Label>
                <Input
                  id="task-due"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  disabled={saving}
                  dir="ltr"
                  className="text-left"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              إلغاء
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'جارٍ الحفظ…' : 'حفظ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
