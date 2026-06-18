'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Wifi,
  Clock,
  DollarSign,
  AlertCircle,
  ClipboardList,
  Users,
  CreditCard,
  Landmark,
  Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { AlertsPanel, type DashboardAlert } from '@/components/dashboard/AlertsPanel'

// ─── Types ────────────────────────────────────────────────────────────────────

interface KpiData {
  activeSubscriptions: number
  expiringIn7Days: number
  todayRevenue: number
  activeDebts: number
  pendingTasks: number
  bbAvailable: number
  cardsUnderLimit: number
  bankTotal: number
}

interface RevenuePoint {
  month: string
  revenue: number
}

interface TopCardPoint {
  name: string
  sold: number
}

interface DashboardData {
  kpis: KpiData
  alerts: DashboardAlert[]
  revenueChart: RevenuePoint[]
  topCardsChart: TopCardPoint[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function startOfTodayISO(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function sixMonthsAgoISO(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 5)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function formatMoney(n: number): string {
  return `${n.toLocaleString('ar-EG')} ج.م`
}

const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

function monthLabel(iso: string): string {
  const d = new Date(iso)
  return `${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function buildRevenueSeries(
  payments: { paid_at: string | null; amount: number; method: string }[],
): RevenuePoint[] {
  const start = new Date(sixMonthsAgoISO())
  const buckets: RevenuePoint[] = []

  for (let i = 0; i < 6; i++) {
    const d = new Date(start)
    d.setMonth(start.getMonth() + i)
    buckets.push({
      month: monthLabel(d.toISOString()),
      revenue: 0,
    })
  }

  payments.forEach((p) => {
    if (!p.paid_at || p.method === 'debt') return
    const paid = new Date(p.paid_at)
    const key = `${AR_MONTHS[paid.getMonth()]} ${paid.getFullYear()}`
    const bucket = buckets.find((b) => b.month === key)
    if (bucket) bucket.revenue += Number(p.amount)
  })

  return buckets
}

function buildTopCardsSeries(
  items: { quantity: number; product_id: string }[],
  products: { id: string; name: string }[],
): TopCardPoint[] {
  const totals = new Map<string, number>()
  items.forEach((item) => {
    totals.set(item.product_id, (totals.get(item.product_id) ?? 0) + item.quantity)
  })

  const nameMap = new Map(products.map((p) => [p.id, p.name]))

  return [...totals.entries()]
    .map(([id, sold]) => ({ name: nameMap.get(id) ?? 'غير معروف', sold }))
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 8)
}

function buildAlerts(
  expiringToday: number,
  overdueTasks: number,
  bbAvailable: number,
  cardsUnderLimit: number,
): DashboardAlert[] {
  const alerts: DashboardAlert[] = []

  if (expiringToday > 0) {
    alerts.push({
      id: 'expiring-today',
      severity: 'critical',
      title: 'اشتراكات تنتهي اليوم',
      description: `${expiringToday} اشتراك${expiringToday === 1 ? '' : 'اً'} ينتهي اليوم`,
      href: '/subscriptions',
    })
  }

  if (overdueTasks > 0) {
    alerts.push({
      id: 'overdue-tasks',
      severity: 'critical',
      title: 'مهام معلقة أكثر من 24 ساعة',
      description: `${overdueTasks} مهمة تحتاج متابعة عاجلة`,
      href: '/pending-tasks',
    })
  }

  if (bbAvailable < 20) {
    alerts.push({
      id: 'bb-low',
      severity: 'warning',
      title: 'يوزرات BB متاحة أقل من 20',
      description: `متبقٍ ${bbAvailable} يوزر فقط — أضف كريدنشالز`,
      href: '/credentials',
    })
  }

  if (cardsUnderLimit > 0) {
    alerts.push({
      id: 'cards-low',
      severity: 'warning',
      title: 'بطاقات تحت الحد الأدنى',
      description: `${cardsUnderLimit} منتج${cardsUnderLimit === 1 ? '' : 'اً'} تحت الحد الأدنى للمخزون`,
      href: '/card-products',
    })
  }

  return alerts
}

async function fetchDashboardData(tenantId: string): Promise<DashboardData> {
  const supabase = createClient()
  const today = todayISO()
  const in7 = addDaysISO(7)
  const todayStart = startOfTodayISO()
  const sixMonthsAgo = sixMonthsAgoISO()
  const overdueCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [
    activeSubsRes,
    expiring7Res,
    expiringTodayRes,
    todayPaymentsRes,
    activeDebtsRes,
    pendingTasksRes,
    overdueTasksRes,
    bbAvailableRes,
    cardsLowRes,
    bankAccountsRes,
    revenuePaymentsRes,
    saleItemsRes,
    productsRes,
  ] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .gte('end_date', today),

    supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .gte('end_date', today)
      .lte('end_date', in7),

    supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .eq('end_date', today),

    supabase
      .from('payments')
      .select('amount, method')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .gte('paid_at', todayStart),

    supabase
      .from('debts')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .in('status', ['active', 'temporary'])
      .gt('remaining_amount', 0),

    supabase
      .from('pending_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .in('status', ['pending', 'reminded']),

    supabase
      .from('pending_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .in('status', ['pending', 'reminded'])
      .lt('created_at', overdueCutoff),

    supabase
      .from('internet_credentials')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .eq('type', 'bb')
      .eq('is_used', false),

    supabase
      .from('card_products')
      .select('quantity_in_stock, min_quantity')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false),

    supabase
      .from('company_bank_accounts')
      .select('current_total')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false),

    supabase
      .from('payments')
      .select('paid_at, amount, method')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .gte('paid_at', sixMonthsAgo),

    supabase
      .from('card_sale_items')
      .select('quantity, product_id')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false),

    supabase
      .from('card_products')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false),
  ])

  const todayRevenue = (todayPaymentsRes.data ?? [])
    .filter((p) => p.method !== 'debt')
    .reduce((sum, p) => sum + Number(p.amount), 0)

  const cardsUnderLimit = (cardsLowRes.data ?? []).filter(
    (p) => p.quantity_in_stock < p.min_quantity,
  ).length

  const bankTotal = (bankAccountsRes.data ?? []).reduce(
    (sum, a) => sum + Number(a.current_total),
    0,
  )

  const bbAvailable = bbAvailableRes.count ?? 0
  const pendingTasks = pendingTasksRes.count ?? 0

  const kpis: KpiData = {
    activeSubscriptions: activeSubsRes.count ?? 0,
    expiringIn7Days: expiring7Res.count ?? 0,
    todayRevenue,
    activeDebts: activeDebtsRes.count ?? 0,
    pendingTasks,
    bbAvailable,
    cardsUnderLimit,
    bankTotal,
  }

  return {
    kpis,
    alerts: buildAlerts(
      expiringTodayRes.count ?? 0,
      overdueTasksRes.count ?? 0,
      bbAvailable,
      cardsUnderLimit,
    ),
    revenueChart: buildRevenueSeries(revenuePaymentsRes.data ?? []),
    topCardsChart: buildTopCardsSeries(saleItemsRes.data ?? [], productsRes.data ?? []),
  }
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  href,
  highlight,
}: {
  label: string
  value: string | number
  icon: React.ComponentType<{ size?: number; className?: string }>
  href?: string
  highlight?: 'warning' | 'danger'
}) {
  const border =
    highlight === 'danger'
      ? 'border-red-200'
      : highlight === 'warning'
        ? 'border-amber-200'
        : 'border-gray-200'

  const inner = (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${border}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <Icon size={16} className="text-blue-600 shrink-0" />
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="block transition-opacity hover:opacity-90">
        {inner}
      </Link>
    )
  }

  return inner
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: tenant } = useTenant()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadMs, setLoadMs] = useState<number | null>(null)
  const [pendingTasks, setPendingTasks] = useState<number | null>(null)

  const reload = useCallback(async () => {
    if (!tenant?.id) return
    setLoading(true)
    setLoadError(null)
    const t0 = performance.now()
    try {
      const result = await fetchDashboardData(tenant.id)
      const elapsed = Math.round(performance.now() - t0)
      setData(result)
      setPendingTasks(result.kpis.pendingTasks)
      setLoadMs(elapsed)
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'فشل تحميل بيانات لوحة القيادة',
      )
    } finally {
      setLoading(false)
    }
  }, [tenant?.id])

  useEffect(() => {
    if (!tenant?.id) return
    void reload()
  }, [tenant?.id, reload])

  // Realtime — تحديث عداد المهام المعلقة فوراً
  useEffect(() => {
    if (!tenant?.id) return
    const supabase = createClient()

    const channel = supabase
      .channel(`dashboard-pending-tasks-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pending_tasks',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        async () => {
          const { count } = await supabase
            .from('pending_tasks')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenant.id)
            .eq('is_deleted', false)
            .in('status', ['pending', 'reminded'])
          setPendingTasks(count ?? 0)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenant?.id])

  if (loadError) {
    return (
      <div dir="rtl" className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <p className="text-sm text-red-600">تعذّر تحميل لوحة القيادة: {loadError}</p>
        <button
          onClick={() => void reload()}
          className="rounded-md border border-mash-border px-4 py-2 text-sm text-mash-text hover:bg-mash-page"
        >
          إعادة المحاولة
        </button>
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div dir="rtl" className="flex items-center justify-center py-24 text-gray-500">
        <Loader2 size={24} className="ml-2 animate-spin" />
        جارٍ تحميل لوحة القيادة...
      </div>
    )
  }

  const kpis = {
    ...data.kpis,
    pendingTasks: pendingTasks ?? data.kpis.pendingTasks,
  }

  return (
    <div dir="rtl" className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">لوحة القيادة</h1>
          <p className="mt-1 text-sm text-gray-500">
            نظرة شاملة على أداء {tenant?.name ?? 'شركتك'}
          </p>
        </div>
        {loadMs !== null && (
          <span className="text-xs text-gray-400">
            KPIs: {loadMs}ms (Promise.all)
          </span>
        )}
      </div>

      {/* KPIs — 8 بطاقات */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="اشتراكات نشطة"
          value={kpis.activeSubscriptions}
          icon={Wifi}
          href="/subscriptions"
        />
        <KpiCard
          label="تنتهي خلال 7 أيام"
          value={kpis.expiringIn7Days}
          icon={Clock}
          href="/subscriptions"
          highlight={kpis.expiringIn7Days > 0 ? 'warning' : undefined}
        />
        <KpiCard
          label="إيرادات اليوم"
          value={formatMoney(kpis.todayRevenue)}
          icon={DollarSign}
          href="/payments"
        />
        <KpiCard
          label="ديون نشطة"
          value={kpis.activeDebts}
          icon={AlertCircle}
          highlight={kpis.activeDebts > 0 ? 'danger' : undefined}
        />
        <KpiCard
          label="مهام معلقة"
          value={kpis.pendingTasks}
          icon={ClipboardList}
          href="/pending-tasks"
          highlight={kpis.pendingTasks > 0 ? 'warning' : undefined}
        />
        <KpiCard
          label="يوزرات BB متاحة"
          value={kpis.bbAvailable}
          icon={Users}
          href="/credentials"
          highlight={kpis.bbAvailable < 20 ? 'warning' : undefined}
        />
        <KpiCard
          label="بطاقات تحت الحد"
          value={kpis.cardsUnderLimit}
          icon={CreditCard}
          href="/card-products"
          highlight={kpis.cardsUnderLimit > 0 ? 'warning' : undefined}
        />
        <KpiCard
          label="إجمالي الحسابات البنكية"
          value={formatMoney(kpis.bankTotal)}
          icon={Landmark}
          href="/bank-accounts"
        />
      </div>

      <AlertsPanel alerts={data.alerts} />

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            إيرادات آخر 6 أشهر
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.revenueChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11 }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value) => [formatMoney(Number(value)), 'الإيرادات']}
                labelStyle={{ direction: 'rtl' }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            أكثر البطاقات مبيعاً
          </h2>
          {data.topCardsChart.length === 0 ? (
            <p className="py-16 text-center text-sm text-gray-500">
              لا توجد مبيعات بطاقات بعد
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.topCardsChart} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={90}
                />
                <Tooltip
                  formatter={(value) => [Number(value), 'مباع']}
                  labelStyle={{ direction: 'rtl' }}
                />
                <Bar dataKey="sold" fill="#2563eb" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>
    </div>
  )
}
