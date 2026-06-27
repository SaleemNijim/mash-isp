'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Plan {
  id: string
  name: string
  billing_cycle: string
  price_monthly: number | null
  price_annual: number | null
  discount_percent: number | null
}

interface Props {
  open: boolean
  onClose: () => void
}

export function UpgradeModal({ open, onClose }: Props) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const { data: tenant } = useTenant()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const supabase = createClient()
    supabase
      .from('subscription_plans')
      .select('id,name,billing_cycle,price_monthly,price_annual,discount_percent')
      .in('billing_cycle', ['monthly', 'annual'])
      .eq('is_active', true)
      .then(({ data }) => {
        if (cancelled) return
        const nextPlans = data ?? []
        setPlans(nextPlans)
        setSelectedPlanId((current) => {
          if (current && nextPlans.some((plan) => plan.id === current)) return current
          return nextPlans.find((plan) => plan.billing_cycle === 'annual')?.id ?? nextPlans[0]?.id ?? ''
        })
      })

    return () => {
      cancelled = true
    }
  }, [open])

  const monthlyPlan = plans.find(p => p.billing_cycle === 'monthly')
  const annualPlan  = plans.find(p => p.billing_cycle === 'annual')

  async function handleUpgrade(planId: string) {
    if (!tenant) return
    const plan = plans.find(p => p.id === planId)
    if (!plan) return

    setLoading(true)
    try {
      const supabase = createClient()
      const amount =
        plan.billing_cycle === 'annual'
          ? (plan.price_annual ?? 0)
          : (plan.price_monthly ?? 0)

      const today = new Date()
      const periodEnd = new Date(today)
      if (plan.billing_cycle === 'annual') {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1)
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1)
      }

      const { error } = await supabase.from('mash_invoices').insert({
        tenant_id:     tenant.id,
        plan_id:       plan.id,
        billing_cycle: plan.billing_cycle,
        amount,
        period_start:  today.toISOString().split('T')[0],
        period_end:    periodEnd.toISOString().split('T')[0],
        status:        'pending',
      })

      if (error) throw error

      toast.success('بانتظار تأكيد الإدارة')
      onClose()
    } catch {
      toast.error('حدث خطأ، حاول مرة أخرى')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl">
        <h2 className="text-xl font-bold text-foreground mb-4">اختر خطة الاشتراك</h2>

        {/* Pro Monthly */}
        {monthlyPlan && (
          <label
            className={`flex items-center gap-3 border-2 rounded-xl p-4 cursor-pointer transition-colors ${
              selectedPlanId === monthlyPlan.id ? 'border-primary bg-primary-50' : 'border-border bg-card hover:border-primary-400'
            }`}
          >
            <input
              type="radio"
              name="plan"
              value={monthlyPlan.id}
              checked={selectedPlanId === monthlyPlan.id}
              onChange={() => setSelectedPlanId(monthlyPlan.id)}
            />
            <div>
              <div className="font-bold text-foreground">{monthlyPlan.name}</div>
              <div className="text-2xl font-bold text-primary-600">
                {monthlyPlan.price_monthly} ₪
                <span className="text-sm font-normal text-muted-foreground">/شهر</span>
              </div>
            </div>
          </label>
        )}

        {/* Pro Annual — يعرض التوفير */}
        {annualPlan && (
          <label
            className={`flex items-center gap-3 border-2 rounded-xl p-4 cursor-pointer relative mt-3 transition-colors ${
              selectedPlanId === annualPlan.id ? 'border-primary bg-primary-50' : 'border-border bg-card hover:border-primary-400'
            }`}
          >
            {annualPlan.discount_percent && (
              <span className="absolute -top-3 right-4 bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                وفِّر {annualPlan.discount_percent}%
              </span>
            )}
            <input
              type="radio"
              name="plan"
              value={annualPlan.id}
              checked={selectedPlanId === annualPlan.id}
              onChange={() => setSelectedPlanId(annualPlan.id)}
            />
            <div>
              <div className="font-bold text-foreground">{annualPlan.name}</div>
              <div className="text-2xl font-bold text-primary-600">
                {annualPlan.price_annual} ₪
                <span className="text-sm font-normal text-muted-foreground">/سنة</span>
              </div>
              {annualPlan.discount_percent && (
                <div className="text-xs text-mash-success-text mt-1">
                  تدفع {annualPlan.price_annual} ₪ بدلاً من{' '}
                  {((annualPlan.price_monthly ?? 0) * 12).toFixed(0)} ₪ سنوياً
                </div>
              )}
            </div>
          </label>
        )}

        <Button
          className="w-full mt-4 min-h-11"
          disabled={loading || !selectedPlanId}
          onClick={() => handleUpgrade(selectedPlanId)}
        >
          {loading ? 'جاري المعالجة...' : 'اشترك الآن'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
