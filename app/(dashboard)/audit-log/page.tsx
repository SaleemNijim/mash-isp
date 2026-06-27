'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { usePermissions } from '@/hooks/usePermissions'
import {
  fetchAuditLogEntries,
  fetchPerformerBreakdown,
  fetchSalesActivityLog,
  type ActivityLogEntry,
} from '@/lib/reports/activity-log'
import { dayEndISO, monthStartISO, todayDateStr } from '@/lib/sales/date-range'
import { formatAmount } from '@/lib/format-money'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataPanel } from '@/components/shared/DataPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type TabId = 'sales' | 'audit' | 'performers'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ar-EG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ActivityList({
  entries,
  emptyMessage,
}: {
  entries: ActivityLogEntry[]
  emptyMessage: string
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-10">{emptyMessage}</p>
  }

  return (
    <ul className="divide-y divide-border">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={entry.source === 'sale' ? 'secondary' : 'outline'}>
                {entry.action}
              </Badge>
              <span className="text-sm font-medium">{entry.performerName}</span>
            </div>
            <p className="text-sm text-muted-foreground truncate">{entry.detail}</p>
          </div>
          <div className="text-left shrink-0">
            {entry.amount != null && (
              <p className="text-sm font-medium tabular-nums">{formatAmount(entry.amount)}</p>
            )}
            <p className="text-xs text-muted-foreground">{formatDateTime(entry.performedAt)}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

export default function AuditLogPage() {
  const supabase = createClient()
  const { data: tenant } = useTenant()
  const role = usePermissions((s) => s.role)
  const [tab, setTab] = useState<TabId>('sales')
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [toDate, setToDate] = useState(todayDateStr)

  const rangeStart = useMemo(() => {
    const [y, m, d] = fromDate.split('-').map(Number)
    return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString()
  }, [fromDate])

  const rangeEnd = useMemo(() => dayEndISO(toDate), [toDate])

  const enabled = !!tenant?.id && role === 'admin'

  const { data: salesLog = [], isLoading: salesLoading } = useQuery({
    queryKey: ['audit-sales', tenant?.id, rangeStart, rangeEnd],
    queryFn: () => fetchSalesActivityLog(supabase, tenant!.id, rangeStart, rangeEnd),
    enabled,
  })

  const { data: auditLog = [], isLoading: auditLoading } = useQuery({
    queryKey: ['audit-deletions', tenant?.id, rangeStart, rangeEnd],
    queryFn: () => fetchAuditLogEntries(supabase, tenant!.id, rangeStart, rangeEnd),
    enabled: enabled && tab === 'audit',
  })

  const performers = useMemo(() => fetchPerformerBreakdown(salesLog), [salesLog])

  if (role !== 'admin') {
    return (
      <div dir="rtl" className="py-16 text-center text-muted-foreground">
        <p className="text-lg font-medium">سجل العمليات</p>
        <p className="text-sm mt-2">متاح لمسؤول الشركة فقط.</p>
      </div>
    )
  }

  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader
        title="سجل العمليات"
        description="من باع، من جدّد، ومن نفّذ عمليات الحذف — من بيانات النظام"
      />

      <DataPanel className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="audit-from">من تاريخ</Label>
            <Input
              id="audit-from"
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              dir="ltr"
              className="w-auto"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-to">إلى تاريخ</Label>
            <Input
              id="audit-to"
              type="date"
              value={toDate}
              min={fromDate}
              max={todayDateStr()}
              onChange={(e) => setToDate(e.target.value)}
              dir="ltr"
              className="w-auto"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setFromDate(new Date(monthStartISO()).toISOString().slice(0, 10))
              setToDate(todayDateStr())
            }}
          >
            هذا الشهر
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setFromDate(todayDateStr())
              setToDate(todayDateStr())
            }}
          >
            اليوم
          </Button>
        </div>
      </DataPanel>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['sales', 'عمليات البيع'],
            ['performers', 'حسب الكاشير'],
            ['audit', 'سجل التدقيق'],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            variant={tab === id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === 'sales' && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <ScrollText size={16} />
            عمليات البيع والتجديد
          </h2>
          <DataPanel>
            {salesLoading ? (
              <p className="text-sm text-muted-foreground text-center py-10">جارٍ التحميل...</p>
            ) : (
              <ActivityList entries={salesLog} emptyMessage="لا توجد عمليات في هذه الفترة" />
            )}
          </DataPanel>
        </div>
      )}

      {tab === 'performers' && (
        <DataPanel>
          {salesLoading ? (
            <p className="text-sm text-muted-foreground text-center py-10">جارٍ التحميل...</p>
          ) : performers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              لا توجد عمليات بيع في هذه الفترة
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {performers.map((row) => (
                <li
                  key={row.performerName}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="font-medium">{row.performerName}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {row.count} عملية — {formatAmount(row.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DataPanel>
      )}

      {tab === 'audit' && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">حذف وإخفاء السجلات</h2>
          <DataPanel>
            {auditLoading ? (
              <p className="text-sm text-muted-foreground text-center py-10">جارٍ التحميل...</p>
            ) : (
              <ActivityList entries={auditLog} emptyMessage="لا توجد أحداث تدقيق في هذه الفترة" />
            )}
          </DataPanel>
        </div>
      )}
    </div>
  )
}
