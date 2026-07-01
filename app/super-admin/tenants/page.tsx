'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { RefreshCw, Ban, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DisableTenantConfirmModal } from '@/components/super-admin/DisableTenantConfirmModal'
import { EnableTenantConfirmModal } from '@/components/super-admin/EnableTenantConfirmModal'
import { shouldShowActivateSubscription } from '@/lib/saas/subscription-expiry'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface TenantRow {
  id: string
  name: string
  phone: string | null
  is_active: boolean
  is_trial: boolean
  trial_ends_at: string | null
  subscription_end: string | null
  billing_cycle: 'monthly' | 'annual' | null
  plan_id: string | null
}

interface SubscriptionPlan {
  id: string
  slug: string
  name: string
  billing_cycle: 'monthly' | 'annual'
  price_monthly: number | null
  price_annual: number | null
}

type DerivedStatus = 'disabled' | 'trial' | 'active' | 'expired'

function deriveStatus(tenant: TenantRow): DerivedStatus {
  if (!tenant.is_active) return 'disabled'

  const now = new Date()
  if (
    tenant.is_trial &&
    tenant.trial_ends_at &&
    new Date(tenant.trial_ends_at) > now
  ) {
    return 'trial'
  }
  if (tenant.subscription_end && new Date(tenant.subscription_end) > now) {
    return 'active'
  }
  return 'expired'
}

const STATUS_LABELS: Record<DerivedStatus, string> = {
  disabled: 'معطّلة',
  trial: 'تجربة',
  active: 'نشط',
  expired: 'منتهي',
}

const STATUS_VARIANT: Record<
  DerivedStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  disabled: 'destructive',
  trial: 'secondary',
  active: 'default',
  expired: 'destructive',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function planAmount(plan: SubscriptionPlan): number {
  return plan.billing_cycle === 'annual'
    ? (plan.price_annual ?? 0)
    : (plan.price_monthly ?? 0)
}

function extendSubscriptionEnd(
  currentEnd: string | null,
  billingCycle: 'monthly' | 'annual',
): string {
  const base =
    currentEnd && new Date(currentEnd) > new Date()
      ? new Date(currentEnd)
      : new Date()
  const result = new Date(base)
  if (billingCycle === 'annual') {
    result.setFullYear(result.getFullYear() + 1)
  } else {
    result.setMonth(result.getMonth() + 1)
  }
  return result.toISOString()
}

function invoicePeriod(billingCycle: 'monthly' | 'annual') {
  const start = new Date()
  const end = new Date(start)
  if (billingCycle === 'annual') {
    end.setFullYear(end.getFullYear() + 1)
  } else {
    end.setMonth(end.getMonth() + 1)
  }
  return {
    period_start: start.toISOString().split('T')[0],
    period_end: end.toISOString().split('T')[0],
  }
}

export default function SuperAdminTenantsPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [activateTarget, setActivateTarget] = useState<TenantRow | null>(null)
  const [selectedSlug, setSelectedSlug] = useState<'pro_monthly' | 'pro_annual'>(
    'pro_annual',
  )
  const [activating, setActivating] = useState(false)
  const [disabling, setDisabling] = useState<string | null>(null)
  const [enabling, setEnabling] = useState<string | null>(null)
  const [disableTarget, setDisableTarget] = useState<TenantRow | null>(null)
  const [enableTarget, setEnableTarget] = useState<TenantRow | null>(null)

  const { data: tenants = [], isLoading, refetch } = useQuery<TenantRow[]>({
    queryKey: ['super-admin-tenants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select(
          'id,name,phone,is_active,is_trial,trial_ends_at,subscription_end,billing_cycle,plan_id',
        )
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })

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

  const monthlyPlan = proPlans.find((p) => p.slug === 'pro_monthly')
  const annualPlan = proPlans.find((p) => p.slug === 'pro_annual')
  const selectedPlan = proPlans.find((p) => p.slug === selectedSlug)

  async function handleActivate() {
    if (!activateTarget || !selectedPlan) return

    setActivating(true)
    try {
      const amount = planAmount(selectedPlan)
      const { period_start, period_end } = invoicePeriod(
        selectedPlan.billing_cycle,
      )
      const newSubscriptionEnd = extendSubscriptionEnd(
        activateTarget.subscription_end,
        selectedPlan.billing_cycle,
      )

      const { error: invoiceError } = await supabase
        .from('mash_invoices')
        .insert({
          tenant_id: activateTarget.id,
          plan_id: selectedPlan.id,
          billing_cycle: selectedPlan.billing_cycle,
          amount,
          period_start,
          period_end,
          status: 'paid',
          paid_at: new Date().toISOString(),
        })

      if (invoiceError) throw invoiceError

      const { data: updatedTenant, error: tenantError } = await supabase
        .from('tenants')
        .update({
          subscription_end: newSubscriptionEnd,
          is_trial: false,
          is_active: true,
          billing_cycle: selectedPlan.billing_cycle,
          plan_id: selectedPlan.id,
        })
        .eq('id', activateTarget.id)
        .select('id')
        .single()

      if (tenantError) throw tenantError
      if (!updatedTenant) {
        throw new Error('لم يتم تحديث الشركة — تحقق من صلاحيات Super Admin')
      }

      toast.success(`تم تفعيل ${selectedPlan.name} لـ «${activateTarget.name}»`)
      setActivateTarget(null)
      void queryClient.invalidateQueries({ queryKey: ['super-admin-tenants'] })
      void queryClient.invalidateQueries({ queryKey: ['super-admin-invoices'] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ'
      toast.error('فشل التفعيل: ' + msg)
    } finally {
      setActivating(false)
    }
  }

  async function confirmDisable(): Promise<boolean> {
    if (!disableTarget) return false

    setDisabling(disableTarget.id)
    const { data: updatedTenant, error } = await supabase
      .from('tenants')
      .update({ is_active: false })
      .eq('id', disableTarget.id)
      .select('id')
      .single()

    if (error || !updatedTenant) {
      toast.error('فشل التعطيل: ' + (error?.message ?? 'لم يتم التحديث'))
      setDisabling(null)
      return false
    }

    toast.success(`تم تعطيل «${disableTarget.name}»`)
    void queryClient.invalidateQueries({ queryKey: ['super-admin-tenants'] })
    setDisabling(null)
    setDisableTarget(null)
    return true
  }

  async function confirmEnable(): Promise<boolean> {
    if (!enableTarget) return false

    setEnabling(enableTarget.id)
    const { data: updatedTenant, error } = await supabase
      .from('tenants')
      .update({ is_active: true })
      .eq('id', enableTarget.id)
      .select('id')
      .single()

    if (error || !updatedTenant) {
      toast.error('فشل إعادة التفعيل: ' + (error?.message ?? 'لم يتم التحديث'))
      setEnabling(null)
      return false
    }

    toast.success(`تم إعادة تفعيل «${enableTarget.name}»`)
    void queryClient.invalidateQueries({ queryKey: ['super-admin-tenants'] })
    setEnabling(null)
    setEnableTarget(null)
    return true
  }

  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">الشركات</h1>
          <p className="text-sm text-muted-foreground">
            إدارة المستأجرين وحالة الاشتراك
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="size-4" />
          تحديث
        </Button>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الشركة</TableHead>
              <TableHead className="text-right">الجوال</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">انتهاء التجربة</TableHead>
              <TableHead className="text-right">انتهاء الاشتراك</TableHead>
              <TableHead className="text-right">نشطة</TableHead>
              <TableHead className="text-right">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  جاري التحميل...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && tenants.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  لا توجد شركات
                </TableCell>
              </TableRow>
            )}
            {tenants.map((tenant) => {
              const status = deriveStatus(tenant)
              const showActivate = shouldShowActivateSubscription(tenant)
              return (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/super-admin/tenants/${tenant.id}`}
                      className="text-primary-800 hover:underline"
                    >
                      {tenant.name}
                    </Link>
                  </TableCell>
                  <TableCell dir="ltr" className="text-right tabular-nums">
                    {tenant.phone ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[status]}>
                      {STATUS_LABELS[status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(tenant.trial_ends_at)}</TableCell>
                  <TableCell>{formatDate(tenant.subscription_end)}</TableCell>
                  <TableCell>
                    <Badge variant={tenant.is_active ? 'default' : 'destructive'}>
                      {tenant.is_active ? 'نعم' : 'معطّلة'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {showActivate && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedSlug('pro_annual')
                            setActivateTarget(tenant)
                          }}
                        >
                          <Zap className="size-3.5" />
                          تفعيل اشتراك
                        </Button>
                      )}
                      {!tenant.is_active ? (
                        <Button
                          size="sm"
                          disabled={enabling === tenant.id}
                          onClick={() => setEnableTarget(tenant)}
                        >
                          <Zap className="size-3.5" />
                          {enabling === tenant.id ? 'جاري...' : 'إعادة تفعيل'}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={disabling === tenant.id}
                          onClick={() => setDisableTarget(tenant)}
                        >
                          <Ban className="size-3.5" />
                          {disabling === tenant.id ? 'جاري...' : 'تعطيل'}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={!!activateTarget}
        onOpenChange={(open) => !open && setActivateTarget(null)}
      >
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              تفعيل اشتراك — {activateTarget?.name}
            </DialogTitle>
          </DialogHeader>

          {activateTarget && !activateTarget.is_active && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30">
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
                    <span className="text-sm font-normal text-muted-foreground">
                      /شهر
                    </span>
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
                    <span className="text-sm font-normal text-muted-foreground">
                      /سنة
                    </span>
                  </div>
                </div>
              </label>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              onClick={() => void handleActivate()}
              disabled={activating || !selectedPlan}
            >
              {activating ? 'جاري التفعيل...' : 'تأكيد التفعيل'}
            </Button>
            <Button variant="outline" onClick={() => setActivateTarget(null)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DisableTenantConfirmModal
        open={disableTarget !== null}
        tenantName={disableTarget?.name ?? null}
        onClose={() => {
          if (!disabling) setDisableTarget(null)
        }}
        onConfirm={confirmDisable}
      />

      <EnableTenantConfirmModal
        open={enableTarget !== null}
        tenantName={enableTarget?.name ?? null}
        onClose={() => {
          if (!enabling) setEnableTarget(null)
        }}
        onConfirm={confirmEnable}
      />
    </div>
  )
}
