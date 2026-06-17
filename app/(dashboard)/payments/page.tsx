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
import { RefreshCw, Search, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useInfiniteVirtualData } from '@/hooks/useInfiniteVirtualData'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface PaymentRow {
  id: string
  tenant_id: string
  customer_id: string
  subscription_id: string | null
  amount: number
  method: 'cash' | 'debt' | 'reflect' | 'jawwal_pay' | 'bank'
  bank_account_id: string | null
  paid_at: string | null
  notes: string | null
}

interface CustomerRow {
  id: string
  name: string
  phone: string | null
}

type MethodFilter = 'all' | PaymentRow['method']

const METHOD_LABELS: Record<PaymentRow['method'], string> = {
  cash: 'نقداً',
  debt: 'دين',
  reflect: 'Reflect',
  jawwal_pay: 'Jawwal Pay',
  bank: 'بنك',
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

interface EnrichedPayment extends PaymentRow {
  customer_name: string
  phone: string
}

export default function PaymentsPage() {
  return <PaymentsContent />
}

function PaymentsContent() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { open, target, openModal, closeModal } = useDeleteConfirm()

  const {
    allItems,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteVirtualData('payments', ['notes'], '')

  const payments = allItems as PaymentRow[]

  const customerIds = useMemo(
    () => [...new Set(payments.map((p) => p.customer_id))],
    [payments],
  )

  const { data: customers = [] } = useQuery<CustomerRow[]>({
    queryKey: ['payment-customers', customerIds.join(',')],
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

  const enriched = useMemo<EnrichedPayment[]>(() => {
    return payments.map((p) => {
      const c = customerMap.get(p.customer_id)
      return {
        ...p,
        customer_name: c?.name ?? '—',
        phone: c?.phone ?? '',
      }
    })
  }, [payments, customerMap])

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

    if (methodFilter !== 'all') {
      rows = rows.filter((r) => r.method === methodFilter)
    }

    if (dateFrom) {
      const from = new Date(dateFrom).toISOString()
      rows = rows.filter((r) => r.paid_at && r.paid_at >= from)
    }

    if (dateTo) {
      const toEnd = new Date(dateTo)
      toEnd.setHours(23, 59, 59, 999)
      rows = rows.filter((r) => r.paid_at && r.paid_at <= toEnd.toISOString())
    }

    return rows
  }, [enriched, debouncedSearch, methodFilter, dateFrom, dateTo])

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
    void queryClient.invalidateQueries({ queryKey: ['payments'] })
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المدفوعات</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filtered.length.toLocaleString('ar-EG')} دفعة
            {hasNextPage ? ' (المزيد متاح)' : ''}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          className="gap-1.5"
        >
          <RefreshCw size={14} />
          تحديث
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search
          size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالعميل أو الهاتف…"
          className="pr-9"
          dir="rtl"
        />
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <FilterGroup
          label="طريقة الدفع"
          options={[
            ['all', 'الكل'],
            ['cash', 'نقداً'],
            ['debt', 'دين'],
            ['bank', 'بنك'],
            ['reflect', 'Reflect'],
            ['jawwal_pay', 'Jawwal Pay'],
          ]}
          value={methodFilter}
          onChange={(v) => setMethodFilter(v as MethodFilter)}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">التاريخ:</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 w-36 text-xs"
            dir="ltr"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 w-36 text-xs"
            dir="ltr"
          />
          {(dateFrom || dateTo) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setDateFrom('')
                setDateTo('')
              }}
            >
              مسح
            </Button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className="overflow-auto border border-gray-200 rounded-lg bg-white"
        style={{ height: 'calc(100vh - 360px)', minHeight: 360 }}
      >
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
            <tr>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                العميل
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                الهاتف
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                المبلغ
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                الطريقة
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                تاريخ الدفع
              </th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-700 border-b w-24">
                إجراءات
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted-foreground">
                  جارٍ التحميل…
                </td>
              </tr>
            )}

            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted-foreground">
                  لا توجد مدفوعات مطابقة
                </td>
              </tr>
            )}

            {paddingTop > 0 && (
              <tr aria-hidden>
                <td style={{ height: paddingTop }} colSpan={6} />
              </tr>
            )}

            {virtualItems.map((vItem) => {
              const row = filtered[vItem.index]
              if (!row) return null
              return (
                <tr
                  key={row.id}
                  style={{ height: vItem.size }}
                  className="hover:bg-mash-page border-b border-gray-100"
                >
                  <td className="px-3 py-2 font-medium">{row.customer_name}</td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">
                    {row.phone || '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {Number(row.amount).toLocaleString('ar-EG')} ج.م
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{METHOD_LABELS[row.method]}</Badge>
                  </td>
                  <td className="px-3 py-2">{formatDate(row.paid_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center">
                      <PermissionGuard permission="delete_records">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive gap-1"
                          onClick={() =>
                            openModal({
                              id: row.id,
                              table: 'payments',
                              name: `${row.customer_name} — ${Number(row.amount).toLocaleString('ar-EG')} ج.م`,
                              consequences:
                                'سيتم إخفاء الدفعة — الديون المرتبطة قد تتأثر.',
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
                <td style={{ height: paddingBottom }} colSpan={6} />
              </tr>
            )}

            {isFetchingNextPage && (
              <tr>
                <td colSpan={6} className="py-3 text-center text-xs text-muted-foreground">
                  جارٍ تحميل المزيد…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
