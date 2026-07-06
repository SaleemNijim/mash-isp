'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { defaultActivatePlanSlug } from '@/lib/saas/subscription-expiry'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface ActivateSubscriptionTenant {
  id: string
  name: string
  is_active: boolean
  is_trial: boolean
  trial_ends_at: string | null
  subscription_end: string | null
}

interface SubscriptionPlan {
  id: string
  slug: 'pro_monthly' | 'pro_annual'
  name: string
  billing_cycle: 'monthly' | 'annual'
  price_monthly: number | null
  price_annual: number | null
}

interface ActivateSubscriptionDialogProps {
  tenant: ActivateSubscriptionTenant | null
  onClose: () => void
  onSuccess?: () => void
}

export function ActivateSubscriptionDialog({
  tenant,
  onClose,
  onSuccess,
}: ActivateSubscriptionDialogProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [selectedSlug, setSelectedSlug] = useState<'pro_monthly' | 'pro_annual'>(
    'pro_monthly',
  )
  const [activating, setActivating] = useState(false)

  const { data: proPlans = [] } = useQuery<SubscriptionPlan[]>({
    queryKey: ['super-admin-pro-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('id,slug,name,billing_cycle,price_monthly,price_annual')
        .in('slug', ['pro_monthly', 'pro_annual'])
        .eq('is_active', true)
      if (error) throw error
      return (data ?? []) as SubscriptionPlan[]
    },
  })

  useEffect(() => {
    if (!tenant) return
    setSelectedSlug(defaultActivatePlanSlug(tenant))
  }, [tenant])

  const monthlyPlan = proPlans.find((p) => p.slug === 'pro_monthly')
  const annualPlan = proPlans.find((p) => p.slug === 'pro_annual')
  const selectedPlan = proPlans.find((p) => p.slug === selectedSlug)

  async function handleActivate() {
    if (!tenant || !selectedPlan) return

    setActivating(true)
    try {
      const { error } = await supabase.rpc('activate_tenant_subscription', {
        p_tenant_id: tenant.id,
        p_plan_id: selectedPlan.id,
      })
      if (error) throw error

      toast.success(`تم تفعيل ${selectedPlan.name} لـ «${tenant.name}»`)
      void queryClient.invalidateQueries({ queryKey: ['super-admin-tenants'] })
      void queryClient.invalidateQueries({ queryKey: ['super-admin-invoices'] })
      void queryClient.invalidateQueries({ queryKey: ['super-admin-tenant'] })
      onSuccess?.()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ'
      toast.error('فشل التفعيل: ' + msg)
    } finally {
      setActivating(false)
    }
  }

  return (
    <Dialog open={!!tenant} onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تفعيل اشتراك — {tenant?.name}</DialogTitle>
        </DialogHeader>

        {tenant?.is_trial && (
          <p className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-xs text-primary-900">
            الشركة في التجربة المجانية — التفعيل الآن يُفعّل المزامنة على Drive وباقي ميزات الاشتراك المدفوع فوراً.
          </p>
        )}

        {tenant && !tenant.is_active && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            هذه الشركة معطّلة حالياً — سيُعاد تفعيلها تلقائياً مع تمديد الاشتراك.
          </p>
        )}

        <div className="space-y-3">
          {monthlyPlan && (
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 ${
                selectedSlug === 'pro_monthly'
                  ? 'border-primary bg-primary-50'
                  : 'border-border bg-card'
              }`}
            >
              <input
                type="radio"
                name="activate-plan"
                checked={selectedSlug === 'pro_monthly'}
                onChange={() => setSelectedSlug('pro_monthly')}
              />
              <div>
                <div className="font-bold">{monthlyPlan.name}</div>
                <div className="text-lg font-bold text-primary-600">
                  {monthlyPlan.price_monthly} ₪
                  <span className="text-sm font-normal text-muted-foreground">/شهر</span>
                </div>
              </div>
            </label>
          )}

          {annualPlan && (
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 ${
                selectedSlug === 'pro_annual'
                  ? 'border-primary bg-primary-50'
                  : 'border-border bg-card'
              }`}
            >
              <input
                type="radio"
                name="activate-plan"
                checked={selectedSlug === 'pro_annual'}
                onChange={() => setSelectedSlug('pro_annual')}
              />
              <div>
                <div className="font-bold">{annualPlan.name}</div>
                <div className="text-lg font-bold text-primary-600">
                  {annualPlan.price_annual} ₪
                  <span className="text-sm font-normal text-muted-foreground">/سنة</span>
                </div>
              </div>
            </label>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button onClick={() => void handleActivate()} disabled={activating || !selectedPlan}>
            {activating ? 'جاري التفعيل...' : 'تأكيد التفعيل'}
          </Button>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
