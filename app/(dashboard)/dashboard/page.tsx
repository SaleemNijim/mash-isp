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
import { countPendingInbox } from '@/lib/pending-tasks/inbox'
import { fetchSalesInRange, summarizeSales, type SaleRow } from '@/lib/sales/fetch-sales'
import { dayEndISO, monthStartISO, todayDateStr, todayStartISO } from '@/lib/sales/date-range'
import { formatAmount } from '@/lib/format-money'

// ─── Types ────────────────────────────────────────────────────────────────────

interface KpiData {
  activeSubscriptions: number
  expiringIn7Days: number
  todayRevenue: number
  activeDebts: number
  pendingTasks: number
  bbAvailable: number
  pppPlansUnderMin: number
  cardsUnderLimit: number
  bankTotal: number
}

interface PppPlanLowRow {
  id: string
  name: string
  min_available_usernames: number
  available: number
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
  return todayDateStr()
}

function addDaysISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function startOfTodayISO(): string {
  return todayStartISO()
}

function monthBucketKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}`
}

function buildRevenueSeriesFromSales(
  sales: SaleRow[],
  tenantCreatedAt: string,
): RevenuePoint[] {
  const start = new Date(tenantCreatedAt)
  const now = new Date()
  const buckets: RevenuePoint[] = []
  const keyToBucket = new Map<string, RevenuePoint>()

  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth(), 1)

  while (cursor <= end) {
    const point: RevenuePoint = {
      month: cursor.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' }),
      revenue: 0,
    }
    buckets.push(point)
    keyToBucket.set(monthBucketKey(cursor), point)
    cursor.setMonth(cursor.getMonth() + 1)
  }

  for (const sale of sales) {
    const paid = new Date(sale.created_at)
    const bucket = keyToBucket.get(monthBucketKey(paid))
    if (bucket) bucket.revenue += sale.amount
  }

  return buckets
}

function buildTopCardsSeries(
  items: {
    quantity: number
    product_id: string
    card_products: { name?: string } | { name?: string }[] | null
  }[],
): TopCardPoint[] {
  const totals = new Map<string, { name: string; sold: number }>()

  for (const item of items) {
    const productRaw = item.card_products
    const product = Array.isArray(productRaw) ? productRaw[0] : productRaw
    const name = product?.name?.trim() || 'منتج محذوف'
    const prev = totals.get(item.product_id)
    totals.set(item.product_id, {
      name,
      sold: (prev?.sold ?? 0) + (Number(item.quantity) || 0),
    })
  }

  return [...totals.values()]
    .filter((p) => p.sold > 0)
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 8)
}

function formatMoney(n: number): string {
  return formatAmount(n)
}

function buildAlerts(
  expiringToday: number,
  overdueTasks: number,
  pppLowPlans: PppPlanLowRow[],
  cardsUnderLimit: number,
  pendingFollowup: number,
): DashboardAlert[] {
  const alerts: DashboardAlert[] = []

  if (expiringToday > 0) {
    alerts.push({
      id: 'expiring-today',
      severity: 'critical',
      title: 'اشتراكات تنتهي اليوم',
      description: `${expiringToday} اشتراك${expiringToday === 1 ? '' : 'اً'} ينتهي اليوم`,
      href: '/customers?filter=expiring_soon',
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

  if (pendingFollowup > 0) {
    alerts.push({
      id: 'pending-followup',
      severity: 'warning',
      title: 'عناصر بانتظار المتابعة',
      description: `${pendingFollowup} عنصر${pendingFollowup === 1 ? '' : 'اً'} (مهام/ديون/تحويلات) بانتظار المتابعة`,
      href: '/pending-tasks',
    })
  }

  for (const plan of pppLowPlans) {
    alerts.push({
      id: `ppp-low-${plan.id}`,
      severity: 'warning',
      title: `PPP: ${plan.name} تحت الحد الأدنى`,
      description: `متبقٍ ${plan.available} username متاح (الحد ${plan.min_available_usernames})`,
      href: '/credentials',
    })
  }

  if (cardsUnderLimit > 0) {
    alerts.push({
      id: 'cards-low',
      severity: 'warning',
      title: 'بطاقات تحت الحد الأدنى',
      description: `${cardsUnderLimit} منتج${cardsUnderLimit === 1 ? '' : 'اً'} تحت الحد الأدنى للمخزون`,
      href: '/card-inventory',
    })
  }

  return alerts
}

async function fetchDashboardData(
  tenantId: string,
  tenantCreatedAt: string,
): Promise<DashboardData> {
  const supabase = createClient()
  const today = todayISO()
  const in7 = addDaysISO(7)
  const todayStart = startOfTodayISO()
  const todayEnd = dayEndISO(today)
  const subscriptionRangeStart = monthStartISO(new Date(tenantCreatedAt))
  const subscriptionRangeEnd = dayEndISO(today)
  const overdueCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [
    activeSubsRes,
    expiring7Res,
    expiringTodayRes,
    todayPaymentsRes,
    activeDebtsRes,
    overdueTasksRes,
    bbAvailableRes,
    pppPlansRes,
    pppAvailableRowsRes,
    cardsLowRes,
    bankAccountsRes,
    saleItemsRes,
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
      .from('ppp_plans')
      .select('id, name, min_available_usernames')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false),

    supabase
      .from('internet_credentials')
      .select('plan_id')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .eq('type', 'bb')
      .eq('is_used', false)
      .not('plan_id', 'is', null),

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
      .from('card_sale_items')
      .select('quantity, product_id, card_products(name)')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false),
  ])

  const [pendingInboxCount, subscriptionSalesRows] = await Promise.all([
    countPendingInbox(supabase, tenantId),
    fetchSalesInRange(supabase, tenantId, subscriptionRangeStart, subscriptionRangeEnd),
  ])

  const todaySalesRows = subscriptionSalesRows.filter(
    (row) => row.created_at >= todayStart && row.created_at <= todayEnd,
  )

  const todaySalesTotal = summarizeSales(todaySalesRows).total

  const todayRevenue = todaySalesTotal > 0
    ? todaySalesTotal
    : (todayPaymentsRes.data ?? [])
        .filter((p) => p.method !== 'debt')
        .reduce((sum, p) => sum + Number(p.amount), 0)

  const cardsUnderLimit = (cardsLowRes.data ?? []).filter(
    (p) => p.quantity_in_stock < p.min_quantity,
  ).length

  const bankTotal = (bankAccountsRes.data ?? []).reduce(
    (sum, a) => sum + (Number(a.current_total) || 0),
    0,
  )

  const bbAvailable = bbAvailableRes.count ?? 0
  const pendingTasks = pendingInboxCount

  const availableByPlan: Record<string, number> = {}
  for (const row of pppAvailableRowsRes.data ?? []) {
    const pid = row.plan_id as string
    availableByPlan[pid] = (availableByPlan[pid] ?? 0) + 1
  }

  const pppLowPlans: PppPlanLowRow[] = (pppPlansRes.data ?? [])
    .filter(
      (p) =>
        p.min_available_usernames > 0 &&
        (availableByPlan[p.id] ?? 0) < p.min_available_usernames,
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      min_available_usernames: p.min_available_usernames,
      available: availableByPlan[p.id] ?? 0,
    }))

  const pppPlansUnderMin = pppLowPlans.length

  const kpis: KpiData = {
    activeSubscriptions: activeSubsRes.count ?? 0,
    expiringIn7Days: expiring7Res.count ?? 0,
    todayRevenue,
    activeDebts: activeDebtsRes.count ?? 0,
    pendingTasks,
    bbAvailable,
    pppPlansUnderMin,
    cardsUnderLimit,
    bankTotal,
  }

  return {
    kpis,
    alerts: buildAlerts(
      expiringTodayRes.count ?? 0,
      overdueTasksRes.count ?? 0,
      pppLowPlans,
      cardsUnderLimit,
      pendingInboxCount,
    ),
    revenueChart: buildRevenueSeriesFromSales(subscriptionSalesRows, tenantCreatedAt),
    topCardsChart: buildTopCardsSeries(saleItemsRes.data ?? []),
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
      ? 'border-[#FCEBEB] bg-[#FFFBFB]'
      : highlight === 'warning'
        ? 'border-[#FAEEDA] bg-[#FFFDF8]'
        : 'border-[#D1E8E2]'

  const inner = (
    <div className={`mash-kpi-card ${border}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[#4A6B60]">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-xl bg-[#E8F5F1]">
          <Icon size={15} className="text-[#0F6E56] shrink-0" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold text-[#0D1F1A]">{value}</p>
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
    if (!tenant?.id || !tenant.created_at) return
    setLoading(true)
    setLoadError(null)
    const t0 = performance.now()
    try {
      const result = await fetchDashboardData(tenant.id, tenant.created_at)
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
  }, [tenant?.id, tenant?.created_at])

  useEffect(() => {
    if (!tenant?.id || !tenant.created_at) return
    void reload()
  }, [tenant?.id, tenant?.created_at, reload])

  // Realtime — تحديث عداد صندوق المهام المعلقة (مهام + ديون + تحويلات)
  useEffect(() => {
    if (!tenant?.id) return
    const supabase = createClient()

    const refreshPendingCount = () => {
      void countPendingInbox(supabase, tenant.id).then(setPendingTasks)
    }

    const tables = ['pending_tasks', 'debts', 'payments', 'payment_proofs'] as const
    const channel = supabase.channel(`dashboard-pending-inbox-${tenant.id}`)

    for (const table of tables) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `tenant_id=eq.${tenant.id}`,
        },
        refreshPendingCount,
      )
    }

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenant?.id])

  if (loadError) {
    return (
      <div dir="rtl" className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <p className="text-sm text-destructive">تعذّر تحميل لوحة القيادة: {loadError}</p>
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
      <div dir="rtl" className="flex items-center justify-center py-24 text-muted-foreground">
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
          <h1 className="mash-page-title">لوحة القيادة</h1>
          <p className="mash-page-description">
            نظرة شاملة على أداء {tenant?.name ?? 'شركتك'}
          </p>
        </div>
        {loadMs !== null && (
          <span className="text-xs text-muted-foreground">
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
          href="/customers?filter=active"
        />
        <KpiCard
          label="تنتهي خلال 7 أيام"
          value={kpis.expiringIn7Days}
          icon={Clock}
          href="/customers?filter=expiring_soon"
          highlight={kpis.expiringIn7Days > 0 ? 'warning' : undefined}
        />
        <KpiCard
          label="مبيعات اليوم"
          value={formatMoney(kpis.todayRevenue)}
          icon={DollarSign}
          href="/reports"
        />
        <KpiCard
          label="ديون نشطة"
          value={kpis.activeDebts}
          icon={AlertCircle}
          highlight={kpis.activeDebts > 0 ? 'danger' : undefined}
        />
        <KpiCard
          label="بانتظار المتابعة"
          value={kpis.pendingTasks}
          icon={ClipboardList}
          href="/pending-tasks"
          highlight={kpis.pendingTasks > 0 ? 'warning' : undefined}
        />
        <KpiCard
          label="باقات PPP تحت الحد"
          value={kpis.pppPlansUnderMin}
          icon={Users}
          href="/credentials"
          highlight={kpis.pppPlansUnderMin > 0 ? 'warning' : undefined}
        />
        <KpiCard
          label="بطاقات تحت الحد"
          value={kpis.cardsUnderLimit}
          icon={CreditCard}
          href="/card-inventory"
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
        <section className="mash-section">
          <h2 className="mb-4 text-base font-bold text-[#0D1F1A]">
            إيرادات شهرية منذ الاشتراك
          </h2>
          {data.revenueChart.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              لا توجد إيرادات مسجّلة بعد
            </p>
          ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.revenueChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
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
                formatter={(value) => [formatMoney(Number(value) || 0), 'الإيرادات']}
                labelStyle={{ direction: 'rtl' }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#0F6E56"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
          )}
        </section>

        <section className="mash-section">
          <h2 className="mb-4 text-base font-bold text-[#0D1F1A]">
            أكثر البطاقات مبيعاً
          </h2>
          {data.topCardsChart.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              لا توجد مبيعات بطاقات بعد
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.topCardsChart} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={90}
                />
                <Tooltip
                  formatter={(value) => [Number(value) || 0, 'مباع']}
                  labelStyle={{ direction: 'rtl' }}
                />
                <Bar dataKey="sold" fill="#0F6E56" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>
    </div>
  )
}
