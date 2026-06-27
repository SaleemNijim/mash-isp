'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { BarChart3, CalendarRange, ShoppingBag } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { usePermissions } from '@/hooks/usePermissions'
import { fetchSalesInRange, summarizeSales } from '@/lib/sales/fetch-sales'
import {
  dayEndISO,
  formatMonthLabel,
  monthEndISO,
  monthStartISO,
  todayDateStr,
  todayStartISO,
} from '@/lib/sales/date-range'
import { formatAmount } from '@/lib/format-money'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataPanel } from '@/components/shared/DataPanel'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/navigation'

function SummaryCard({
  title,
  summary,
  subtitle,
}: {
  title: string
  summary: ReturnType<typeof summarizeSales>
  subtitle: string
}) {
  return (
    <DataPanel className="p-5 h-full">
      <div className="flex items-center gap-2 mb-4">
        <ShoppingBag size={18} className="text-primary" />
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <p className="text-3xl font-bold tabular-nums text-primary">
        {formatAmount(summary.total)}
      </p>
      <p className="text-sm text-muted-foreground mt-1">{summary.count} عملية</p>

      <div className="mt-5 grid gap-2 text-sm">
        <Row label="بطاقات تجزئة" value={summary.retail} />
        <Row label="بيع موزعين" value={summary.distributor} />
        <Row label="اشتراكات PPP" value={summary.subscriptions} />
        <div className="mr-4 grid gap-1 text-xs text-muted-foreground">
          <span>تجديد: {summary.renewals.count} — {formatAmount(summary.renewals.total)}</span>
          <span>
            اشتراك جديد: {summary.newSubscriptions.count} —{' '}
            {formatAmount(summary.newSubscriptions.total)}
          </span>
        </div>
      </div>
    </DataPanel>
  )
}

function Row({ label, value }: { label: string; value: { total: number; count: number } }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium">
        {value.count} — {formatAmount(value.total)}
      </span>
    </div>
  )
}

export default function ReportsPage() {
  const supabase = createClient()
  const { data: tenant } = useTenant()
  const role = usePermissions((s) => s.role)

  const todayStart = todayStartISO()
  const todayEnd = dayEndISO(todayDateStr())
  const monthStart = monthStartISO()
  const monthEnd = monthEndISO()

  const { data: todaySales = [], isLoading: todayLoading } = useQuery({
    queryKey: ['reports-today', tenant?.id, todayStart],
    queryFn: () => fetchSalesInRange(supabase, tenant!.id, todayStart, todayEnd),
    enabled: !!tenant?.id && role === 'admin',
  })

  const { data: monthSales = [], isLoading: monthLoading } = useQuery({
    queryKey: ['reports-month', tenant?.id, monthStart],
    queryFn: () => fetchSalesInRange(supabase, tenant!.id, monthStart, monthEnd),
    enabled: !!tenant?.id && role === 'admin',
  })

  const todaySummary = useMemo(() => summarizeSales(todaySales), [todaySales])
  const monthSummary = useMemo(() => summarizeSales(monthSales), [monthSales])

  if (role !== 'admin') {
    return (
      <div dir="rtl" className="py-16 text-center text-muted-foreground">
        <p className="text-lg font-medium">التقارير</p>
        <p className="text-sm mt-2">متاحة لمسؤول الشركة فقط.</p>
      </div>
    )
  }

  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader
        title="التقارير"
        description="موجز المبيعات والاشتراكات من بيانات النظام الفعلية"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={ROUTES.auditLog}>سجل العمليات</Link>
          </Button>
        }
      />

      {(todayLoading || monthLoading) && (
        <p className="text-sm text-muted-foreground text-center py-6">جارٍ التحميل...</p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <SummaryCard
          title="مبيعات اليوم"
          summary={todaySummary}
          subtitle={todayDateStr()}
        />
        <SummaryCard
          title="مبيعات الشهر"
          summary={monthSummary}
          subtitle={formatMonthLabel()}
        />
      </div>

      <DataPanel className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={18} className="text-primary" />
          <h2 className="font-semibold">ملاحظات</h2>
        </div>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
          <li>الأرقام تشمل: بطاقات التجزئة، مبيعات الموزعين، وتحصيلات PPP (نقد + تطبيق).</li>
          <li>لمعرفة من نفّذ كل عملية عند وجود أكثر من كاشير، راجع سجل العمليات.</li>
          <li>عند انتهاء الشهر يُحدَّث موجز «مبيعات الشهر» تلقائياً للشهر الجاري.</li>
        </ul>
        <div className="mt-4 flex items-center gap-2 text-sm">
          <CalendarRange size={16} className="text-muted-foreground" />
          <Link href={ROUTES.auditLog} className="text-primary font-medium hover:underline">
            فتح سجل العمليات والتدقيق
          </Link>
        </div>
      </DataPanel>
    </div>
  )
}
