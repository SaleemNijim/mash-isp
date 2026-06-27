'use client'

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import type { PostgrestError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { usePppPlans } from '@/hooks/usePppPlans'
import { usePppPlanInventory } from '@/hooks/usePppPlanInventory'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { formatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { isPppPlanBelowMin } from '@/lib/ppp/plans'

interface PppPlansPanelProps {
  selectedPlanId: string | null
  onSelectPlan: (planId: string) => void
}

export function PppPlansPanel({ selectedPlanId, onSelectPlan }: PppPlansPanelProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { data: tenant } = useTenant()

  const [deletePlanOpen, setDeletePlanOpen] = useState(false)
  const [planToDelete, setPlanToDelete] = useState<{ id: string; name: string } | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [speed, setSpeed] = useState('')
  const [price, setPrice] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [minAvailable, setMinAvailable] = useState('0')
  const [saving, setSaving] = useState(false)
  const [editMin, setEditMin] = useState('')
  const [savingMin, setSavingMin] = useState(false)

  const { data: plans = [], isLoading } = usePppPlans()
  const { availableByPlan, totalByPlan, lowPlans } = usePppPlanInventory()

  const selectedPlan = selectedPlanId
    ? plans.find((p) => p.id === selectedPlanId) ?? null
    : null

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['ppp-plans'] })
    void queryClient.invalidateQueries({ queryKey: ['ppp-plan-inventory'] })
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenant?.id) return
    const n = name.trim()
    const sp = speed.trim()
    const pr = Number(price)
    const minVal = Number(minAvailable)
    if (!n || !sp) {
      toast.error('الاسم والسرعة مطلوبان')
      return
    }
    if (!Number.isFinite(pr) || pr < 0) {
      toast.error('السعر غير صالح')
      return
    }
    if (!Number.isFinite(minVal) || minVal < 0) {
      toast.error('الحد الأدنى غير صالح')
      return
    }

    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('ppp_plans')
        .insert({
          tenant_id: tenant.id,
          name: n,
          speed: sp,
          price: pr,
          batch_number: batchNumber.trim() || null,
          min_available_usernames: Math.floor(minVal),
        })
        .select('id')
        .single()
      if (error) throw error
      toast.success('تمت إضافة الباقة')
      setName('')
      setSpeed('')
      setPrice('')
      setBatchNumber('')
      setMinAvailable('0')
      setShowForm(false)
      invalidate()
      if (data?.id) onSelectPlan(data.id as string)
    } catch (err) {
      const pg = err as PostgrestError
      if (pg.code === '23505') {
        toast.error('اسم الباقة مسجّل مسبقاً — كل باقة يجب أن يكون لها اسم فريد')
      } else {
        toast.error('فشلت الإضافة')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleSaveMin = async () => {
    if (!selectedPlan) return
    const minVal = Number(editMin)
    if (!Number.isFinite(minVal) || minVal < 0) {
      toast.error('الحد الأدنى غير صالح')
      return
    }
    setSavingMin(true)
    try {
      const { error } = await supabase
        .from('ppp_plans')
        .update({ min_available_usernames: Math.floor(minVal) })
        .eq('id', selectedPlan.id)
        .eq('tenant_id', tenant!.id)
      if (error) throw error
      toast.success('تم تحديث الحد الأدنى')
      invalidate()
    } catch {
      toast.error('فشل التحديث')
    } finally {
      setSavingMin(false)
    }
  }

  const handleDeletePlan = async () => {
    if (!planToDelete) return
    const res = await fetch('/api/delete/soft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: 'ppp_plans', id: planToDelete.id }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error ?? 'delete_failed')
    }
    toast.success('تم إخفاء الباقة')
    invalidate()
    if (selectedPlanId === planToDelete.id) {
      const remaining = plans.filter((p) => p.id !== planToDelete.id)
      if (remaining[0]) onSelectPlan(remaining[0].id)
    }
  }

  const selectedAvailable = selectedPlan ? (availableByPlan[selectedPlan.id] ?? 0) : 0
  const selectedBelowMin = selectedPlan
    ? isPppPlanBelowMin(selectedAvailable, selectedPlan.min_available_usernames)
    : false

  useEffect(() => {
    if (selectedPlan) {
      setEditMin(String(selectedPlan.min_available_usernames))
    }
  }, [selectedPlan?.id, selectedPlan?.min_available_usernames])

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">باقات PPP</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            كل باقة مخزون معزول — تنبيه عند انخفاض usernames المتاحة عن الحد الأدنى
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus size={14} />
          باقة جديدة
        </Button>
      </div>

      {lowPlans.length > 0 && (
        <Alert variant="destructive" className="bg-amber-50 border-amber-200 text-amber-900">
          <AlertTriangle className="text-amber-600" />
          <AlertTitle className="text-amber-900">باقات تحت الحد الأدنى</AlertTitle>
          <AlertDescription className="text-amber-800">
            {lowPlans.map((p) => {
              const avail = availableByPlan[p.id] ?? 0
              return `${p.name}: ${avail} متاح (الحد ${p.min_available_usernames})`
            }).join(' · ')}
          </AlertDescription>
        </Alert>
      )}

      {showForm && (
        <form
          onSubmit={(e) => void handleAdd(e)}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end border border-border rounded-md p-3 bg-muted/20"
        >
          <div className="space-y-1.5">
            <Label htmlFor="plan-name">الاسم *</Label>
            <Input
              id="plan-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="إشتراك 4M"
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-speed">السرعة *</Label>
            <Input
              id="plan-speed"
              value={speed}
              onChange={(e) => setSpeed(e.target.value)}
              placeholder="4M"
              disabled={saving}
              dir="ltr"
              className="text-left font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-price">السعر (ش)</Label>
            <Input
              id="plan-price"
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={saving}
              dir="ltr"
              className="text-right tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-min">حد أدنى (متاح)</Label>
            <Input
              id="plan-min"
              type="number"
              min={0}
              value={minAvailable}
              onChange={(e) => setMinAvailable(e.target.value)}
              placeholder="0 = بدون تنبيه"
              disabled={saving}
              dir="ltr"
              className="text-right tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-batch">رقم الدفعة</Label>
            <Input
              id="plan-batch"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              placeholder="اختياري"
              disabled={saving}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? '…' : 'حفظ'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowForm(false)}
              disabled={saving}
            >
              إلغاء
            </Button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        {isLoading && (
          <span className="text-xs text-muted-foreground py-1">جارٍ التحميل…</span>
        )}
        {plans.map((plan) => {
          const active = selectedPlanId === plan.id
          const available = availableByPlan[plan.id] ?? 0
          const total = totalByPlan[plan.id] ?? 0
          const belowMin = isPppPlanBelowMin(available, plan.min_available_usernames)
          return (
            <div key={plan.id} className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => {
                  onSelectPlan(plan.id)
                  setEditMin(String(plan.min_available_usernames))
                }}
                className={cn(
                  'rounded-lg px-3 py-2 text-xs border text-right transition-colors min-w-[130px]',
                  belowMin && !active && 'border-amber-400 bg-amber-50',
                  belowMin && active && 'border-amber-300',
                  active
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background border-border hover:bg-muted',
                )}
              >
                <span className="font-semibold block flex items-center gap-1">
                  {belowMin && (
                    <AlertTriangle
                      size={12}
                      className={active ? 'text-primary-foreground' : 'text-amber-600'}
                    />
                  )}
                  {plan.name}
                </span>
                <span className={cn('block mt-0.5', active ? 'opacity-90' : 'text-muted-foreground')}>
                  {plan.speed} · {formatMoney(plan.price)}
                </span>
                <span className={cn('block mt-0.5', belowMin && !active && 'text-amber-700 font-medium')}>
                  متاح {available}
                  {plan.min_available_usernames > 0 ? ` / حد ${plan.min_available_usernames}` : ''}
                  {' · '}إجمالي {total}
                </span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-destructive shrink-0"
                onClick={() => {
                  setPlanToDelete({ id: plan.id, name: plan.name })
                  setDeletePlanOpen(true)
                }}
              >
                <Trash2 size={12} />
              </Button>
            </div>
          )
        })}
        {!isLoading && plans.length === 0 && (
          <span className="text-xs text-amber-700">
            أنشئ باقة أولاً — لا يمكن إضافة usernames BB بدون باقة
          </span>
        )}
      </div>

      {selectedPlan && (
        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-plan-min">الحد الأدنى — {selectedPlan.name}</Label>
            <Input
              id="edit-plan-min"
              type="number"
              min={0}
              value={editMin || String(selectedPlan.min_available_usernames)}
              onChange={(e) => setEditMin(e.target.value)}
              disabled={savingMin}
              dir="ltr"
              className="w-28 text-right tabular-nums"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={savingMin}
            onClick={() => void handleSaveMin()}
          >
            {savingMin ? '…' : 'حفظ الحد'}
          </Button>
          {selectedBelowMin && (
            <p className="text-xs text-amber-700 flex items-center gap-1">
              <AlertTriangle size={12} />
              متبقٍ {selectedAvailable} username متاح — أقل من الحد ({selectedPlan.min_available_usernames})
            </p>
          )}
        </div>
      )}

      <DeleteConfirmModal
        open={deletePlanOpen}
        onClose={() => {
          setDeletePlanOpen(false)
          setPlanToDelete(null)
        }}
        onConfirm={handleDeletePlan}
        title="إخفاء الباقة"
        recordName={planToDelete?.name ?? ''}
        consequences="ستُخفى الباقة من القائمة. usernames المرتبطة تبقى في النظام — يمكن نقلها لباقة أخرى لاحقاً."
        confirmLabel="تأكيد الإخفاء"
        isPermanent={false}
      />
    </div>
  )
}

export { usePppPlans } from '@/hooks/usePppPlans'
