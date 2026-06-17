'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Plan {
  id: string
  slug: string
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
  const [selected, setSelected] = useState<string>('pro_annual')
  const [loading, setLoading] = useState(false)
  const { data: tenant } = useTenant()
  const supabase = createClient()

  useEffect(() => {
    if (!open) return
    supabase
      .from('subscription_plans')
      .select('id,slug,name,billing_cycle,price_monthly,price_annual,discount_percent')
      .in('billing_cycle', ['monthly', 'annual'])
      .eq('is_active', true)
      .then(({ data }) => setPlans(data ?? []))
  }, [open])

  const monthlyPlan = plans.find(p => p.billing_cycle === 'monthly')
  const annualPlan  = plans.find(p => p.billing_cycle === 'annual')

  async function handleUpgrade(slug: string) {
    if (!tenant) return
    const plan = plans.find(p => p.slug === slug)
    if (!plan) return

    setLoading(true)
    try {
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
        <h2 className="text-xl font-bold mb-4">اختر خطة الاشتراك</h2>

        {/* Pro Monthly */}
        {monthlyPlan && (
          <label
            className={`flex items-center gap-3 border-2 rounded-xl p-4 cursor-pointer ${
              selected === 'pro_monthly' ? 'border-blue-600' : 'border-gray-200'
            }`}
          >
            <input
              type="radio"
              name="plan"
              value="pro_monthly"
              checked={selected === 'pro_monthly'}
              onChange={() => setSelected('pro_monthly')}
            />
            <div>
              <div className="font-bold">شهري</div>
              <div className="text-2xl font-bold text-blue-700">
                ${monthlyPlan.price_monthly}
                <span className="text-sm font-normal text-gray-500">/شهر</span>
              </div>
            </div>
          </label>
        )}

        {/* Pro Annual — يعرض التوفير */}
        {annualPlan && (
          <label
            className={`flex items-center gap-3 border-2 rounded-xl p-4 cursor-pointer relative mt-3 ${
              selected === 'pro_annual' ? 'border-blue-600' : 'border-gray-200'
            }`}
          >
            {annualPlan.discount_percent && (
              <span className="absolute -top-3 right-4 bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                وفِّر {annualPlan.discount_percent}%
              </span>
            )}
            <input
              type="radio"
              name="plan"
              value="pro_annual"
              checked={selected === 'pro_annual'}
              onChange={() => setSelected('pro_annual')}
            />
            <div>
              <div className="font-bold">سنوي</div>
              <div className="text-2xl font-bold text-blue-700">
                ${annualPlan.price_annual}
                <span className="text-sm font-normal text-gray-500">/سنة</span>
              </div>
              {annualPlan.discount_percent && (
                <div className="text-xs text-green-600 mt-1">
                  تدفع ${annualPlan.price_annual} بدلاً من $
                  {((annualPlan.price_monthly ?? 0) * 12).toFixed(0)} سنوياً
                </div>
              )}
            </div>
          </label>
        )}

        <Button
          className="w-full mt-4"
          disabled={loading}
          onClick={() => handleUpgrade(selected)}
        >
          {loading ? 'جاري المعالجة...' : 'اشترك الآن'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
