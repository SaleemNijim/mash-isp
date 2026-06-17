'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  PlanEditorCard,
  type SubscriptionPlanRow,
} from '@/components/super-admin/PlanEditorCard'

const PLAN_SLUGS = [
  'free_trial',
  'pro_monthly',
  'pro_annual',
  'enterprise',
] as const

export default function SuperAdminPlansPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const { data: plans = [], isLoading, refetch } = useQuery<
    SubscriptionPlanRow[]
  >({
    queryKey: ['super-admin-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .in('slug', [...PLAN_SLUGS])
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as SubscriptionPlanRow[]
    },
  })

  function handlePlanUpdated() {
    void queryClient.invalidateQueries({ queryKey: ['super-admin-plans'] })
  }

  const orderedPlans = PLAN_SLUGS.map(
    (slug) => plans.find((p) => p.slug === slug),
  ).filter((p): p is SubscriptionPlanRow => p != null)

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">إدارة خطط الاشتراك</h1>
          <p className="text-sm text-muted-foreground mt-1">
            §3.4 — المكان الوحيد لتعديل الأسعار — كل التغييرات فورية على
            /pricing
          </p>
        </div>
        <Button variant="outline" onClick={() => void refetch()}>
          <RefreshCw className="size-4" />
          تحديث
        </Button>
      </div>

      {isLoading && (
        <p className="text-center text-muted-foreground py-12">
          جاري تحميل الخطط...
        </p>
      )}

      {!isLoading && orderedPlans.length === 0 && (
        <p className="text-center text-muted-foreground py-12">
          لا توجد خطط في قاعدة البيانات
        </p>
      )}

      {!isLoading && orderedPlans.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {orderedPlans.map((plan) => (
            <PlanEditorCard
              key={plan.id}
              plan={plan}
              onUpdated={handlePlanUpdated}
            />
          ))}
        </div>
      )}
    </div>
  )
}
