'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { shouldShowActivateSubscription } from '@/lib/saas/subscription-expiry'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface TenantDetail {
  id: string
  name: string
  phone: string | null
  logo_url: string | null
  primary_color: string | null
  is_active: boolean
  is_trial: boolean
  trial_ends_at: string | null
  subscription_end: string | null
  billing_cycle: 'monthly' | 'annual' | null
  plan_id: string | null
  created_at: string
  subscription_plans: {
    name: string
    slug: string
  } | null
}

interface TenantUser {
  id: string
  name: string
  role: string
  is_active: boolean
  created_at: string
}

interface TenantInvoice {
  id: string
  billing_cycle: 'monthly' | 'annual'
  amount: number
  period_start: string
  period_end: string
  status: 'pending' | 'paid' | 'overdue' | 'cancelled'
  paid_at: string | null
  created_at: string
  subscription_plans: { name: string; slug: string } | null
}

type DerivedStatus = 'disabled' | 'trial' | 'active' | 'expired'

function deriveStatus(tenant: {
  is_active: boolean
  is_trial: boolean
  trial_ends_at: string | null
  subscription_end: string | null
}): DerivedStatus {
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

const INVOICE_STATUS_LABELS: Record<TenantInvoice['status'], string> = {
  pending: 'معلّقة',
  paid: 'مدفوعة',
  overdue: 'متأخرة',
  cancelled: 'ملغاة',
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'مسؤول',
  employee: 'موظف',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function billingCycleLabel(cycle: 'monthly' | 'annual' | null): string {
  if (cycle === 'monthly') return 'شهري'
  if (cycle === 'annual') return 'سنوي'
  return '—'
}

export default function SuperAdminTenantDetailPage() {
  const params = useParams()
  const tenantId = typeof params.id === 'string' ? params.id : ''
  const supabase = createClient()

  const {
    data: tenant,
    isLoading: tenantLoading,
    refetch: refetchTenant,
  } = useQuery<TenantDetail | null>({
    queryKey: ['super-admin-tenant', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select(
          'id,name,phone,logo_url,primary_color,is_active,is_trial,trial_ends_at,subscription_end,billing_cycle,plan_id,created_at,subscription_plans(name,slug)',
        )
        .eq('id', tenantId)
        .maybeSingle()
      if (error) throw error
      return data as TenantDetail | null
    },
  })

  const { data: users = [], isLoading: usersLoading } = useQuery<TenantUser[]>({
    queryKey: ['super-admin-tenant-users', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id,name,role,is_active,created_at')
        .eq('tenant_id', tenantId)
        .order('created_at')
      if (error) throw error
      return data ?? []
    },
  })

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<
    TenantInvoice[]
  >({
    queryKey: ['super-admin-tenant-invoices', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mash_invoices')
        .select(
          'id,billing_cycle,amount,period_start,period_end,status,paid_at,created_at,subscription_plans(name,slug)',
        )
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as TenantInvoice[]
    },
  })

  const { data: stats } = useQuery({
    queryKey: ['super-admin-tenant-stats', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const [customersRes, credentialsRes] = await Promise.all([
        supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('is_deleted', false),
        supabase
          .from('internet_credentials')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('is_deleted', false),
      ])

      return {
        customers: customersRes.count ?? 0,
        credentials: credentialsRes.count ?? 0,
      }
    },
  })

  const isLoading = tenantLoading
  const status = tenant ? deriveStatus(tenant) : null

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/super-admin/tenants">
              <ArrowRight className="size-4" />
              العودة للشركات
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {tenant?.name ?? 'تفاصيل الشركة'}
            </h1>
            {tenant && status && (
              <div className="mt-1 flex items-center gap-2">
                <Badge variant={STATUS_VARIANT[status]}>
                  {STATUS_LABELS[status]}
                </Badge>
                {shouldShowActivateSubscription(tenant) && (
                  <Badge variant="outline">يحتاج تفعيل اشتراك</Badge>
                )}
              </div>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetchTenant()}
        >
          <RefreshCw className="size-4" />
          تحديث
        </Button>
      </div>

      {isLoading && (
        <p className="text-center text-muted-foreground py-12">جاري التحميل...</p>
      )}

      {!isLoading && !tenant && (
        <p className="text-center text-muted-foreground py-12">
          الشركة غير موجودة
        </p>
      )}

      {tenant && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">العملاء</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {stats?.customers ?? '—'}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">اشتراكات الإنترنت</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {stats?.credentials ?? '—'}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">المستخدمون</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {users.length}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">الفواتير</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {invoices.length}
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border bg-card p-5 space-y-4">
              <h2 className="font-bold text-lg">بيانات الشركة</h2>
              <dl className="grid gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">الاسم</dt>
                  <dd className="font-medium">{tenant.name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">رقم الجوال</dt>
                  <dd className="font-medium tabular-nums" dir="ltr">
                    {tenant.phone ?? '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">تاريخ التسجيل</dt>
                  <dd>{formatDateTime(tenant.created_at)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">الحالة</dt>
                  <dd>
                    <Badge variant={tenant.is_active ? 'default' : 'destructive'}>
                      {tenant.is_active ? 'نشطة' : 'معطّلة'}
                    </Badge>
                  </dd>
                </div>
                {tenant.logo_url && (
                  <div className="flex justify-between gap-4 items-center">
                    <dt className="text-muted-foreground">الشعار</dt>
                    <dd>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={tenant.logo_url}
                        alt=""
                        className="h-10 w-10 rounded-lg object-cover border"
                      />
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="rounded-xl border bg-card p-5 space-y-4">
              <h2 className="font-bold text-lg">الاشتراك</h2>
              <dl className="grid gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">الخطة الحالية</dt>
                  <dd className="font-medium">
                    {tenant.subscription_plans?.name ?? '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">دورة الفوترة</dt>
                  <dd>{billingCycleLabel(tenant.billing_cycle)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">تجربة مجانية</dt>
                  <dd>{tenant.is_trial ? 'نعم' : 'لا'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">انتهاء التجربة</dt>
                  <dd>{formatDate(tenant.trial_ends_at)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">انتهاء الاشتراك</dt>
                  <dd>{formatDate(tenant.subscription_end)}</dd>
                </div>
              </dl>
            </section>
          </div>

          <section className="rounded-xl border bg-card">
            <div className="border-b px-5 py-4">
              <h2 className="font-bold text-lg">المستخدمون</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الاسم</TableHead>
                  <TableHead className="text-right">الدور</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">تاريخ الإضافة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      جاري التحميل...
                    </TableCell>
                  </TableRow>
                )}
                {!usersLoading && users.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      لا يوجد مستخدمون
                    </TableCell>
                  </TableRow>
                )}
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>
                      {ROLE_LABELS[user.role] ?? user.role}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.is_active ? 'default' : 'destructive'}>
                        {user.is_active ? 'نشط' : 'معطّل'}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(user.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <section className="rounded-xl border bg-card">
            <div className="border-b px-5 py-4">
              <h2 className="font-bold text-lg">سجل الفواتير</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الخطة</TableHead>
                  <TableHead className="text-right">الدورة</TableHead>
                  <TableHead className="text-right">المبلغ</TableHead>
                  <TableHead className="text-right">الفترة</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">تاريخ الدفع</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoicesLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-muted-foreground"
                    >
                      جاري التحميل...
                    </TableCell>
                  </TableRow>
                )}
                {!invoicesLoading && invoices.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-muted-foreground"
                    >
                      لا توجد فواتير
                    </TableCell>
                  </TableRow>
                )}
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      {invoice.subscription_plans?.name ?? '—'}
                    </TableCell>
                    <TableCell>
                      {billingCycleLabel(invoice.billing_cycle)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {invoice.amount} ₪
                    </TableCell>
                    <TableCell>
                      {formatDate(invoice.period_start)} —{' '}
                      {formatDate(invoice.period_end)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {INVOICE_STATUS_LABELS[invoice.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(invoice.paid_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </>
      )}
    </div>
  )
}
