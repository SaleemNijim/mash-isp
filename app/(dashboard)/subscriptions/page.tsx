'use client'

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'
import { RefreshCw, Search, Trash2, RotateCcw, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useInfiniteVirtualData } from '@/hooks/useInfiniteVirtualData'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import {
  RenewalModal,
  type RenewalSubscription,
} from '@/components/subscriptions/RenewalModal'
import { CreateSubscriptionModal } from '@/components/subscriptions/CreateSubscriptionModal'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataPanel } from '@/components/shared/DataPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubscriptionRow {
  id: string
  tenant_id: string
  customer_id: string
  type: 'bb' | 'we'
  speed: string | null
  price: number | null
  start_date: string | null
  end_date: string | null
  status: string | null
}

interface CustomerRow {
  id: string
  name: string
  phone: string | null
}

type StatusFilter = 'all' | 'active' | 'expired' | 'expiring_soon'
type TypeFilter = 'all' | 'bb' | 'we'

interface EnrichedSubscription extends SubscriptionRow {
  customer_name: string
  phone: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function subscriptionStatus(endDate: string | null): {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
} {
  if (!endDate) return { label: 'غير محدد', variant: 'outline' }
  const today = todayISO()
  if (endDate < today) return { label: 'منتهي', variant: 'destructive' }
  if (endDate <= addDaysISO(7)) return { label: 'ينتهي قريباً', variant: 'secondary' }
  return { label: 'نشط', variant: 'default' }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SubscriptionsPage() {
  return <SubscriptionsContent />
}

function SubscriptionsContent() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [renewTarget, setRenewTarget] = useState<EnrichedSubscription | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const { open, target, openModal, closeModal } = useDeleteConfirm()

  const {
    allItems,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteVirtualData(
    'subscriptions',
    ['customer_name', 'phone'],
    // جدول subscriptions لا يحمل customer_name/phone — البحث عبر join العملاء أدناه
    '',
  )

  const subscriptions = allItems as SubscriptionRow[]

  const customerIds = useMemo(
    () => [...new Set(subscriptions.map((s) => s.customer_id))],
    [subscriptions],
  )

  const { data: customers = [] } = useQuery<CustomerRow[]>({
    queryKey: ['subscription-customers', customerIds.join(',')],
    queryFn: async () => {
      if (customerIds.length === 0) return []
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone')
        .in('id', customerIds)
        .eq('is_deleted', false)
      if (error) throw error
      return data ?? []
    },
    enabled: customerIds.length > 0,
  })

  const customerMap = useMemo(() => {
    const m = new Map<string, CustomerRow>()
    for (const c of customers) m.set(c.id, c)
    return m
  }, [customers])

  const enriched = useMemo<EnrichedSubscription[]>(() => {
    return subscriptions.map((s) => {
      const c = customerMap.get(s.customer_id)
      return {
        ...s,
        customer_name: c?.name ?? '—',
        phone: c?.phone ?? '',
      }
    })
  }, [subscriptions, customerMap])

  const filtered = useMemo(() => {
    let rows = enriched

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase()
      rows = rows.filter(
        (r) =>
          r.customer_name.toLowerCase().includes(q) ||
          r.phone.includes(q),
      )
    }

    const today = todayISO()
    const weekEnd = addDaysISO(7)

    if (statusFilter === 'active') {
      rows = rows.filter((r) => r.end_date && r.end_date >= today)
    } else if (statusFilter === 'expired') {
      rows = rows.filter((r) => r.end_date && r.end_date < today)
    } else if (statusFilter === 'expiring_soon') {
      rows = rows.filter(
        (r) =>
          r.end_date &&
          r.end_date >= today &&
          r.end_date <= weekEnd,
      )
    }

    if (typeFilter === 'bb') rows = rows.filter((r) => r.type === 'bb')
    if (typeFilter === 'we') rows = rows.filter((r) => r.type === 'we')

    return rows
  }, [enriched, debouncedSearch, statusFilter, typeFilter])

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 52,
    overscan: 10,
  })

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el || !hasNextPage || isFetchingNextPage) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200
    if (nearBottom) void fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  const handleDeleteConfirm = async () => {
    if (!target) return
    const res = await fetch('/api/delete/soft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: target.table, id: target.id }),
    })
    if (!res.ok) throw new Error('delete_failed')
    toast.success('تم الحذف بنجاح')
    void refetch()
    void queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
  }

  const handleRenewSuccess = () => {
    void refetch()
    void queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
    void queryClient.invalidateQueries({ queryKey: ['bb-credentials-unused'] })
    void queryClient.invalidateQueries({ queryKey: ['pending-tasks-count'] })
  }

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0
      ? totalSize - virtualItems[virtualItems.length - 1].end
      : 0

  return (
    <div dir="rtl" className="space-y-4">
      <PageHeader
        title="الاشتراكات"
        description={`${filtered.length.toLocaleString('ar-EG')} اشتراك${hasNextPage ? ' (المزيد متاح)' : ''}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
              <RefreshCw size={14} />
              تحديث
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus size={14} />
              اشتراك جديد
            </Button>
          </>
        }
      />

      {/* Search */}
      <div className="relative max-w-md">
        <Search
          size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الهاتف…"
          className="pr-9"
          dir="rtl"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <FilterGroup
          label="الحالة"
          options={[
            ['all', 'الكل'],
            ['active', 'نشط'],
            ['expired', 'منتهي'],
            ['expiring_soon', 'ينتهي خلال 7 أيام'],
          ]}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
        />
        <FilterGroup
          label="النوع"
          options={[
            ['all', 'الكل'],
            ['bb', 'BB'],
            ['we', 'WE'],
          ]}
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as TypeFilter)}
        />
      </div>

      {/* Virtual list */}
      <DataPanel noPadding>
      <div
        ref={containerRef}
        className="overflow-auto"
        style={{ height: 'calc(100vh - 320px)', minHeight: 360 }}
      >
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur-sm border-b border-border">
            <tr>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                المشترك
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                الهاتف
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                النوع
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                السرعة
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                السعر
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                ينتهي
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                الحالة
              </th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-700 border-b w-36">
                إجراءات
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-muted-foreground">
                  جارٍ التحميل…
                </td>
              </tr>
            )}

            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-muted-foreground">
                  لا توجد اشتراكات مطابقة
                </td>
              </tr>
            )}

            {paddingTop > 0 && (
              <tr aria-hidden>
                <td style={{ height: paddingTop }} colSpan={8} />
              </tr>
            )}

            {virtualItems.map((vItem) => {
              const row = filtered[vItem.index]
              if (!row) return null
              const st = subscriptionStatus(row.end_date)
              return (
                <tr
                  key={row.id}
                  style={{ height: vItem.size }}
                  className="hover:bg-muted/30 border-b border-border/60"
                >
                  <td className="px-3 py-2 font-medium">{row.customer_name}</td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">
                    {row.phone || '—'}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{row.type.toUpperCase()}</Badge>
                  </td>
                  <td className="px-3 py-2">{row.speed ?? '—'}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.price != null
                      ? `${Number(row.price).toLocaleString('ar-EG')} ج.م`
                      : '—'}
                  </td>
                  <td className="px-3 py-2">{formatDate(row.end_date)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <PermissionGuard permission="renew_subscriptions">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => setRenewTarget(row)}
                        >
                          <RotateCcw size={12} />
                          تجديد
                        </Button>
                      </PermissionGuard>
                      <PermissionGuard permission="delete_records">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive gap-1"
                          onClick={() =>
                            openModal({
                              id: row.id,
                              table: 'subscriptions',
                              name: row.customer_name,
                              consequences:
                                'سيتم إخفاء الاشتراك — المدفوعات المرتبطة تبقى في السجل.',
                            })
                          }
                        >
                          <Trash2 size={12} />
                          حذف
                        </Button>
                      </PermissionGuard>
                    </div>
                  </td>
                </tr>
              )
            })}

            {paddingBottom > 0 && (
              <tr aria-hidden>
                <td style={{ height: paddingBottom }} colSpan={8} />
              </tr>
            )}

            {isFetchingNextPage && (
              <tr>
                <td colSpan={8} className="py-3 text-center text-xs text-muted-foreground">
                  جارٍ تحميل المزيد…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </DataPanel>

      <CreateSubscriptionModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={handleRenewSuccess}
      />

      <RenewalModal
        open={!!renewTarget}
        subscription={renewTarget as RenewalSubscription | null}
        onClose={() => setRenewTarget(null)}
        onSuccess={handleRenewSuccess}
      />

      <DeleteConfirmModal
        open={open}
        onClose={closeModal}
        onConfirm={handleDeleteConfirm}
        recordName={target?.name ?? ''}
        consequences={target?.consequences}
      />
    </div>
  )
}

// ─── Filter chips ─────────────────────────────────────────────────────────────

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: [string, string][]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-muted-foreground ml-1">{label}:</span>
      {options.map(([val, text]) => (
        <Button
          key={val}
          type="button"
          size="sm"
          variant={value === val ? 'default' : 'outline'}
          className="h-7 text-xs"
          onClick={() => onChange(val)}
        >
          {text}
        </Button>
      ))}
    </div>
  )
}
