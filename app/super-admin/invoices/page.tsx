'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { RefreshCw, Plus, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmInvoicePaymentModal } from '@/components/super-admin/ConfirmInvoicePaymentModal'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface TenantOption {
  id: string
  name: string
  is_active: boolean
  subscription_end: string | null
}

interface SubscriptionPlan {
  id: string
  slug: string
  name: string
  billing_cycle: 'monthly' | 'annual'
  price_monthly: number | null
  price_annual: number | null
}

interface InvoiceRow {
  id: string
  tenant_id: string
  plan_id: string
  billing_cycle: 'monthly' | 'annual'
  amount: number
  period_start: string
  period_end: string
  status: 'pending' | 'paid' | 'overdue' | 'cancelled'
  paid_at: string | null
  created_at: string
  tenants: { name: string } | null
  subscription_plans: { name: string; slug: string } | null
}

type StatusFilter = 'all' | InvoiceRow['status']

const STATUS_LABELS: Record<InvoiceRow['status'], string> = {
  pending: 'معلّقة',
  paid: 'مدفوعة',
  overdue: 'متأخرة',
  cancelled: 'ملغاة',
}

const STATUS_VARIANT: Record<
  InvoiceRow['status'],
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'secondary',
  paid: 'default',
  overdue: 'destructive',
  cancelled: 'outline',
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

export default function SuperAdminInvoicesPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [paymentConfirmTarget, setPaymentConfirmTarget] = useState<InvoiceRow | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const [selectedTenantId, setSelectedTenantId] = useState('')
  const [selectedPlanSlug, setSelectedPlanSlug] = useState<
    'pro_monthly' | 'pro_annual'
  >('pro_monthly')
  const [manualAmount, setManualAmount] = useState('')
  const [amountTouched, setAmountTouched] = useState(false)

  const { data: invoices = [], isLoading, refetch } = useQuery<InvoiceRow[]>({
    queryKey: ['super-admin-invoices', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('mash_invoices')
        .select(
          `
          id,tenant_id,plan_id,billing_cycle,amount,
          period_start,period_end,status,paid_at,created_at,
          tenants(name),
          subscription_plans(name,slug)
        `,
        )
        .order('created_at', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []).map((row): InvoiceRow => {
        const tenants = row.tenants as { name: string } | { name: string }[] | null
        const plans = row.subscription_plans as
          | { name: string; slug: string }
          | { name: string; slug: string }[]
          | null
        return {
          id: row.id,
          tenant_id: row.tenant_id,
          plan_id: row.plan_id,
          billing_cycle: row.billing_cycle,
          amount: row.amount,
          period_start: row.period_start,
          period_end: row.period_end,
          status: row.status,
          paid_at: row.paid_at,
          created_at: row.created_at,
          tenants: Array.isArray(tenants) ? tenants[0] ?? null : tenants,
          subscription_plans: Array.isArray(plans) ? plans[0] ?? null : plans,
        }
      })
    },
  })

  const { data: tenants = [] } = useQuery<TenantOption[]>({
    queryKey: ['super-admin-tenant-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id,name,is_active,subscription_end')
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

  const selectedPlan = proPlans.find((p) => p.slug === selectedPlanSlug)

  function openCreateDialog() {
    const defaultPlan = proPlans.find((p) => p.slug === 'pro_monthly')
    setAmountTouched(false)
    setSelectedTenantId('')
    setSelectedPlanSlug('pro_monthly')
    setManualAmount(defaultPlan ? String(planAmount(defaultPlan)) : '')
    setCreateOpen(true)
  }

  function closeCreateDialog() {
    setCreateOpen(false)
    setAmountTouched(false)
    setSelectedTenantId('')
    setSelectedPlanSlug('pro_monthly')
    setManualAmount('')
  }

  function handlePlanChange(slug: 'pro_monthly' | 'pro_annual') {
    setSelectedPlanSlug(slug)
    if (amountTouched) return
    const plan = proPlans.find((p) => p.slug === slug)
    if (plan) setManualAmount(String(planAmount(plan)))
  }

  async function confirmPayment(): Promise<boolean> {
    const invoice = paymentConfirmTarget
    if (!invoice || invoice.status === 'paid' || invoice.status === 'cancelled') {
      return false
    }

    setConfirming(invoice.id)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('غير مسجّل الدخول')

      const paidAt = new Date().toISOString()

      const { error: invoiceError } = await supabase
        .from('mash_invoices')
        .update({ status: 'paid', paid_at: paidAt })
        .eq('id', invoice.id)

      if (invoiceError) throw invoiceError

      const { error: paymentError } = await supabase
        .from('mash_payments')
        .insert({
          invoice_id: invoice.id,
          amount: invoice.amount,
          payment_method: 'manual',
          confirmed_by: user.id,
          confirmed_at: paidAt,
        })

      if (paymentError) throw paymentError

      const { data: tenant, error: tenantFetchError } = await supabase
        .from('tenants')
        .select('subscription_end')
        .eq('id', invoice.tenant_id)
        .single()

      if (tenantFetchError) throw tenantFetchError

      const newSubscriptionEnd = extendSubscriptionEnd(
        tenant.subscription_end,
        invoice.billing_cycle,
      )

      const { data: updatedTenant, error: tenantError } = await supabase
        .from('tenants')
        .update({
          subscription_end: newSubscriptionEnd,
          is_trial: false,
          is_active: true,
          billing_cycle: invoice.billing_cycle,
          plan_id: invoice.plan_id,
        })
        .eq('id', invoice.tenant_id)
        .select('id')
        .single()

      if (tenantError) throw tenantError
      if (!updatedTenant) {
        throw new Error('لم يتم تحديث الشركة — تحقق من صلاحيات Super Admin')
      }

      toast.success('تم تأكيد الدفع وتمديد الاشتراك')
      void queryClient.invalidateQueries({ queryKey: ['super-admin-invoices'] })
      void queryClient.invalidateQueries({ queryKey: ['super-admin-tenants'] })
      setPaymentConfirmTarget(null)
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ'
      toast.error('فشل تأكيد الدفع: ' + msg)
      return false
    } finally {
      setConfirming(null)
    }
  }

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedTenantId || !selectedPlan) {
      toast.error('اختر الشركة والخطة')
      return
    }

    const amount = parseFloat(manualAmount)
    if (Number.isNaN(amount) || amount < 0) {
      toast.error('المبلغ غير صالح')
      return
    }

    setCreating(true)
    try {
      const { period_start, period_end } = invoicePeriod(
        selectedPlan.billing_cycle,
      )

      const { error } = await supabase.from('mash_invoices').insert({
        tenant_id: selectedTenantId,
        plan_id: selectedPlan.id,
        billing_cycle: selectedPlan.billing_cycle,
        amount,
        period_start,
        period_end,
        status: 'pending',
      })

      if (error) throw error

      toast.success('تم إنشاء الفاتورة')
      closeCreateDialog()
      void queryClient.invalidateQueries({ queryKey: ['super-admin-invoices'] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ'
      toast.error('فشل إنشاء الفاتورة: ' + msg)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">فواتير MASH</h1>
          <p className="text-sm text-muted-foreground">
            تأكيد المدفوعات وإنشاء فواتير يدوية
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCw className="size-4" />
            تحديث
          </Button>
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="size-4" />
            إنشاء فاتورة يدوية
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', 'الكل'],
            ['pending', 'معلّقة'],
            ['paid', 'مدفوعة'],
            ['overdue', 'متأخرة'],
            ['cancelled', 'ملغاة'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={statusFilter === value ? 'default' : 'outline'}
            onClick={() => setStatusFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الشركة</TableHead>
              <TableHead className="text-right">الخطة</TableHead>
              <TableHead className="text-right">الدورة</TableHead>
              <TableHead className="text-right">المبلغ</TableHead>
              <TableHead className="text-right">الفترة</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  جاري التحميل...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && invoices.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  لا توجد فواتير
                </TableCell>
              </TableRow>
            )}
            {invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium">
                  {invoice.tenants?.name ?? '—'}
                </TableCell>
                <TableCell>
                  {invoice.subscription_plans?.name ?? '—'}
                </TableCell>
                <TableCell>
                  {invoice.billing_cycle === 'annual' ? 'سنوي' : 'شهري'}
                </TableCell>
                <TableCell>${invoice.amount}</TableCell>
                <TableCell className="text-xs">
                  {formatDate(invoice.period_start)} —{' '}
                  {formatDate(invoice.period_end)}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[invoice.status]}>
                    {STATUS_LABELS[invoice.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {(invoice.status === 'pending' ||
                    invoice.status === 'overdue') && (
                    <Button
                      size="sm"
                      disabled={confirming === invoice.id}
                      onClick={() => setPaymentConfirmTarget(invoice)}
                    >
                      <CheckCircle className="size-3.5" />
                      {confirming === invoice.id
                        ? 'جاري...'
                        : 'تأكيد الدفع'}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) closeCreateDialog()
        }}
      >
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إنشاء فاتورة يدوية</DialogTitle>
          </DialogHeader>

          <form onSubmit={(e) => void handleCreateInvoice(e)} className="space-y-4">
            <div className="space-y-2">
              <Label>الشركة</Label>
              <Select
                value={selectedTenantId}
                onValueChange={setSelectedTenantId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر شركة" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      {!t.is_active ? ' (معطّلة)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>الخطة</Label>
              <Select
                value={selectedPlanSlug}
                onValueChange={(v) =>
                  handlePlanChange(v as 'pro_monthly' | 'pro_annual')
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر خطة" />
                </SelectTrigger>
                <SelectContent>
                  {proPlans.map((p) => (
                    <SelectItem key={p.id} value={p.slug}>
                      {p.name} — $
                      {p.billing_cycle === 'annual'
                        ? p.price_annual
                        : p.price_monthly}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-amount">
                المبلغ (يُملأ من DB — قابل للتعديل)
              </Label>
              <Input
                id="manual-amount"
                type="number"
                step="0.01"
                min="0"
                value={manualAmount}
                onChange={(e) => {
                  setAmountTouched(true)
                  setManualAmount(e.target.value)
                }}
                required
              />
            </div>

            {selectedPlan && (
              <p className="text-xs text-muted-foreground">
                دورة الفوترة:{' '}
                {selectedPlan.billing_cycle === 'annual' ? 'سنوي' : 'شهري'}
              </p>
            )}

            <DialogFooter className="gap-2 sm:justify-start">
              <Button type="submit" disabled={creating}>
                {creating ? 'جاري الإنشاء...' : 'إنشاء'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={closeCreateDialog}
              >
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmInvoicePaymentModal
        open={paymentConfirmTarget !== null}
        tenantName={paymentConfirmTarget?.tenants?.name ?? null}
        amount={paymentConfirmTarget?.amount ?? null}
        onClose={() => {
          if (!confirming) setPaymentConfirmTarget(null)
        }}
        onConfirm={confirmPayment}
      />
    </div>
  )
}
