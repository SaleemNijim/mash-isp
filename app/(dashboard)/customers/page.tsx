'use client'

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  Suspense,
} from 'react'
import { useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'
import {
  RefreshCw,
  Search,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  Wifi,
  FileText,
} from 'lucide-react'
import Link from 'next/link'
import { useCustomerHubData } from '@/hooks/useCustomerHubData'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataPanel } from '@/components/shared/DataPanel'
import {
  CustomerFormModal,
  type CustomerRecord,
} from '@/components/customers/CustomerFormModal'
import { formatMoney } from '@/lib/format-money'
import {
  formatHubDate,
  matchesHubFilter,
  subscriptionStatusLabel,
  type HubStatusFilter,
} from '@/lib/subscriptions/customer-hub'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

interface HubRow extends CustomerRecord {
  subscriptionId: string | null
  speed: string | null
  price: number | null
  endDate: string | null
  debtTotal: number
}

function CustomersHubContent() {
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const containerRef = useRef<HTMLDivElement>(null)

  const initialFilter = searchParams.get('filter')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [statusFilter, setStatusFilter] = useState<HubStatusFilter>(() => {
    const valid: HubStatusFilter[] = [
      'all',
      'no_subscription',
      'active',
      'expired',
      'expiring_soon',
      'has_debt',
    ]
    return valid.includes(initialFilter as HubStatusFilter)
      ? (initialFilter as HubStatusFilter)
      : 'all'
  })
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<CustomerRecord | null>(null)

  const { open, target, openModal, closeModal } = useDeleteConfirm()

  const {
    customers,
    subscriptionByCustomer,
    debtByCustomer,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useCustomerHubData(debouncedSearch)

  const hubRows = useMemo<HubRow[]>(() => {
    return customers.map((c) => {
      const sub = subscriptionByCustomer.get(c.id)
      return {
        ...c,
        subscriptionId: sub?.id ?? null,
        speed: sub?.speed ?? null,
        price: sub?.price ?? null,
        endDate: sub?.end_date ?? null,
        debtTotal: debtByCustomer.get(c.id) ?? 0,
      }
    })
  }, [customers, subscriptionByCustomer, debtByCustomer])

  const filtered = useMemo(() => {
    return hubRows.filter((row) =>
      matchesHubFilter(
        statusFilter,
        row.endDate,
        row.subscriptionId !== null,
        row.debtTotal,
      ),
    )
  }, [hubRows, statusFilter])

  const stats = useMemo(() => {
    let active = 0
    let expiring = 0
    let withDebt = 0
    for (const row of hubRows) {
      const st = subscriptionStatusLabel(row.endDate)
      if (st.label === 'نشط') active++
      if (st.label === 'ينتهي قريباً') expiring++
      if (row.debtTotal > 0) withDebt++
    }
    return { active, expiring, withDebt, total: hubRows.length }
  }, [hubRows])

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 56,
    overscan: 12,
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

  const invalidateHub = () => {
    void refetch()
    void queryClient.invalidateQueries({ queryKey: ['hub-subscriptions'] })
    void queryClient.invalidateQueries({ queryKey: ['hub-debts'] })
    void queryClient.invalidateQueries({ queryKey: ['customers'] })
    void queryClient.invalidateQueries({ queryKey: ['customers-select'] })
    void queryClient.invalidateQueries({ queryKey: ['debts'] })
    void queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
  }

  const handleDeleteConfirm = async () => {
    if (!target) return
    const res = await fetch('/api/delete/soft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: target.table, id: target.id }),
    })
    if (!res.ok) throw new Error('delete_failed')
    toast.success('تم الحذف بنجاح')
    invalidateHub()
  }

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0
      ? totalSize - virtualItems[virtualItems.length - 1].end
      : 0

  return (
    <div dir="rtl" className="w-full space-y-4">
      <PageHeader
        title="المشتركون"
        description={`${stats.total.toLocaleString('ar-EG')} مشترك — ${stats.active} نشط — ${stats.expiring} ينتهي قريباً — ${stats.withDebt} عليهم دين`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => invalidateHub()}
              className="gap-1.5"
            >
              <RefreshCw size={14} />
              تحديث
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setEditTarget(null)
                setFormOpen(true)
              }}
            >
              <Plus size={14} />
              إضافة مشترك
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-md">
          <Search
            size={16}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف أو العنوان..."
            className="pr-9"
            dir="rtl"
          />
        </div>

        <FilterGroup
          label="عرض"
          options={[
            ['all', 'الكل'],
            ['active', 'نشط'],
            ['expiring_soon', 'ينتهي قريباً'],
            ['expired', 'منتهي'],
            ['no_subscription', 'بدون اشتراك'],
            ['has_debt', 'عليه دين'],
          ]}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as HubStatusFilter)}
        />
      </div>

      <DataPanel noPadding className="w-full">
        <div
          ref={containerRef}
          className="overflow-auto w-full"
          style={{ height: 'calc(100vh - 300px)', minHeight: 400 }}
        >
          <table className="w-full min-w-[960px] text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm border-b border-border">
              <tr>
                <th className="px-3 py-3 text-right font-semibold">المشترك</th>
                <th className="px-3 py-3 text-right font-semibold">الهاتف</th>
                <th className="px-3 py-3 text-right font-semibold hidden lg:table-cell">
                  العنوان
                </th>
                <th className="px-3 py-3 text-right font-semibold">السرعة</th>
                <th className="px-3 py-3 text-right font-semibold">السعر</th>
                <th className="px-3 py-3 text-right font-semibold">ينتهي</th>
                <th className="px-3 py-3 text-right font-semibold">الحالة</th>
                <th className="px-3 py-3 text-right font-semibold">الدين</th>
                <th className="px-3 py-3 text-center font-semibold w-[220px]">
                  إجراءات
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-muted-foreground">
                    جارٍ التحميل...
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-muted-foreground">
                    لا توجد نتائج — جرّب فلتراً آخر أو أضف مشتركاً
                  </td>
                </tr>
              )}
              {paddingTop > 0 && (
                <tr aria-hidden>
                  <td style={{ height: paddingTop }} colSpan={9} />
                </tr>
              )}
              {virtualItems.map((vItem) => {
                const row = filtered[vItem.index]
                if (!row) return null
                const st = subscriptionStatusLabel(row.endDate)
                return (
                  <tr
                    key={row.id}
                    style={{ height: vItem.size }}
                    className="hover:bg-muted/30 border-b border-border/60 transition-colors"
                  >
                    <td className="px-3 py-2.5 font-medium">
                      <Link
                        href={`/subscriptions/customer/${row.id}`}
                        className="text-foreground hover:text-primary hover:underline"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums font-mono text-xs">
                      {row.phone || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[140px] hidden lg:table-cell">
                      {row.address || '—'}
                    </td>
                    <td className="px-3 py-2.5">{row.speed ?? '—'}</td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {row.price != null ? formatMoney(row.price) : '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {formatHubDate(row.endDate)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {row.debtTotal > 0 ? (
                        <Link
                          href="/debts"
                          className="font-semibold text-destructive hover:underline"
                          title="عرض في سجل الديون"
                        >
                          {formatMoney(row.debtTotal)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          asChild
                          title="سجل الاشتراكات"
                        >
                          <Link href={`/subscriptions/customer/${row.id}`}>
                            <FileText size={12} />
                            سجل
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          asChild
                          title="اشتراك PPP جديد"
                        >
                          <Link href={`/subscriptions/new?customer=${row.id}`}>
                            <Wifi size={12} />
                            اشتراك
                          </Link>
                        </Button>
                        {row.subscriptionId && (
                          <PermissionGuard permission="renew_subscriptions">
                            <Button
                              variant="default"
                              size="sm"
                              className="h-7 px-2 text-xs gap-1"
                              asChild
                              title="تجديد الاشتراك"
                            >
                              <Link href={`/subscriptions/renew/${row.subscriptionId}`}>
                                <RotateCcw size={12} />
                                تجديد
                              </Link>
                            </Button>
                          </PermissionGuard>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            setEditTarget(row)
                            setFormOpen(true)
                          }}
                          title="تعديل بيانات المشترك"
                        >
                          <Pencil size={12} />
                        </Button>
                        <PermissionGuard permission="delete_records">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive"
                            onClick={() =>
                              openModal({
                                id: row.id,
                                table: 'customers',
                                name: row.name,
                                consequences:
                                  'سيتم إخفاء المشترك — الاشتراكات والديون المرتبطة تبقى في السجل.',
                              })
                            }
                            title="حذف المشترك"
                          >
                            <Trash2 size={12} />
                          </Button>
                        </PermissionGuard>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {paddingBottom > 0 && (
                <tr aria-hidden>
                  <td style={{ height: paddingBottom }} colSpan={9} />
                </tr>
              )}
              {isFetchingNextPage && (
                <tr>
                  <td colSpan={9} className="py-3 text-center text-xs text-muted-foreground">
                    جارٍ تحميل المزيد...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DataPanel>

      <CustomerFormModal
        open={formOpen}
        customer={editTarget}
        onClose={() => {
          setFormOpen(false)
          setEditTarget(null)
        }}
        onSuccess={() => {
          invalidateHub()
          setFormOpen(false)
          setEditTarget(null)
        }}
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

export default function CustomersPage() {
  return (
    <Suspense
      fallback={
        <div dir="rtl" className="py-16 text-center text-muted-foreground">
          جارٍ التحميل...
        </div>
      }
    >
      <CustomersHubContent />
    </Suspense>
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
      <span className="text-xs text-muted-foreground ml-1 shrink-0">{label}:</span>
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
