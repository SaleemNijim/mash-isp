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
  Download,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useCustomerHubData } from '@/hooks/useCustomerHubData'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { RecordDeleteOptionsModal } from '@/components/shared/RecordDeleteOptionsModal'
import { deleteRecordWithMode } from '@/lib/delete/record-delete'
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
import { exportCustomersToExcel } from '@/lib/excel/export-customers'

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
  const supabase = createClient()
  const { data: tenant } = useTenant()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const containerRef = useRef<HTMLDivElement>(null)

  const initialFilter = searchParams.get('filter')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [exporting, setExporting] = useState(false)
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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

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

  const handleDeleteConfirm = async (mode: 'keep_data' | 'with_data') => {
    if (!deleteTarget) return
    await deleteRecordWithMode({
      table: 'customers',
      id: deleteTarget.id,
      mode,
      supabase,
    })
    toast.success(
      mode === 'keep_data'
        ? 'تم إخفاء المشترك — يمكن استرجاعه من سلة المحذوفات'
        : 'تم حذف المشترك وجميع بياناته نهائياً',
    )
    setDeleteTarget(null)
    invalidateHub()
  }

  const handleExport = useCallback(async () => {
    if (!tenant?.id) {
      toast.error('تعذّر تحديد الشبكة')
      return
    }

    setExporting(true)
    try {
      const [customersRes, subscriptionsRes, debtsRes] = await Promise.all([
        supabase
          .from('customers')
          .select('id, name, phone, address, notes')
          .eq('tenant_id', tenant.id)
          .eq('is_deleted', false)
          .order('name'),
        supabase
          .from('subscriptions')
          .select('customer_id, speed, price, end_date')
          .eq('tenant_id', tenant.id)
          .eq('is_deleted', false)
          .order('end_date', { ascending: false, nullsFirst: false }),
        supabase
          .from('debts')
          .select('customer_id, remaining_amount')
          .eq('tenant_id', tenant.id)
          .eq('is_deleted', false)
          .in('status', ['active', 'temporary']),
      ])

      if (customersRes.error) throw customersRes.error
      if (subscriptionsRes.error) throw subscriptionsRes.error
      if (debtsRes.error) throw debtsRes.error

      const subscriptionByCustomer = new Map<
        string,
        { speed: string | null; price: number | null; end_date: string | null }
      >()
      for (const row of subscriptionsRes.data ?? []) {
        if (!subscriptionByCustomer.has(row.customer_id)) {
          subscriptionByCustomer.set(row.customer_id, {
            speed: row.speed,
            price: row.price != null ? Number(row.price) : null,
            end_date: row.end_date,
          })
        }
      }

      const debtByCustomer = new Map<string, number>()
      for (const row of debtsRes.data ?? []) {
        const amount = Number(row.remaining_amount ?? 0)
        if (amount <= 0) continue
        debtByCustomer.set(
          row.customer_id,
          (debtByCustomer.get(row.customer_id) ?? 0) + amount,
        )
      }

      const exportRows = (customersRes.data ?? []).map((customer) => {
        const sub = subscriptionByCustomer.get(customer.id)
        return {
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          notes: customer.notes,
          speed: sub?.speed ?? null,
          price: sub?.price ?? null,
          endDate: sub?.end_date ?? null,
          debtTotal: debtByCustomer.get(customer.id) ?? 0,
        }
      })

      const result = await exportCustomersToExcel({
        fileBaseName: tenant.name ? `${tenant.name}_المشتركون` : 'المشتركون',
        customers: exportRows,
      })

      if (!result.saved) return

      toast.success(
        result.count > 0
          ? `تم تصدير ${result.count.toLocaleString('ar-EG')} مشترك إلى Excel`
          : 'لا يوجد مشتركون للتصدير',
      )
    } catch {
      toast.error('فشل تصدير Excel')
    } finally {
      setExporting(false)
    }
  }, [supabase, tenant?.id, tenant?.name])

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
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={exporting}
              onClick={() => void handleExport()}
            >
              {exporting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              تصدير Excel
            </Button>
            <PermissionGuard permission="manage_customers">
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
            </PermissionGuard>
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
          <table className="mash-data-table min-w-[960px]">
            <thead>
              <tr>
                <th className="col-rtl">المشترك</th>
                <th className="col-c col-mono col-phone">الهاتف</th>
                <th className="col-rtl hidden lg:table-cell">العنوان</th>
                <th className="col-rtl">السرعة</th>
                <th className="col-c col-mono">السعر</th>
                <th className="col-rtl">ينتهي</th>
                <th className="col-rtl">الحالة</th>
                <th className="col-c col-mono">الدين</th>
                <th className="col-actions col-c">إجراءات</th>
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
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="col-rtl font-medium">
                      <Link
                        href={`/subscriptions/customer/${row.id}`}
                        className="text-foreground hover:text-primary hover:underline"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="col-c col-mono col-phone text-muted-foreground">
                      {row.phone || '—'}
                    </td>
                    <td className="col-rtl text-muted-foreground truncate hidden lg:table-cell">
                      {row.address || '—'}
                    </td>
                    <td className="col-rtl">{row.speed ?? '—'}</td>
                    <td className="col-c col-mono">
                      {row.price != null ? formatMoney(row.price) : '—'}
                    </td>
                    <td className="col-rtl whitespace-nowrap">
                      {formatHubDate(row.endDate)}
                    </td>
                    <td className="col-rtl">
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </td>
                    <td className="col-c col-mono">
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
                    <td className="col-actions col-c">
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
                        {row.subscriptionId ? (
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
                        ) : (
                          <PermissionGuard permission="create_subscriptions">
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
                          </PermissionGuard>
                        )}
                        <PermissionGuard permission="manage_customers">
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
                        </PermissionGuard>
                        <PermissionGuard permission="delete_records">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive"
                            onClick={() =>
                              setDeleteTarget({ id: row.id, name: row.name })
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

      <RecordDeleteOptionsModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        recordName={deleteTarget?.name ?? ''}
        entityLabel="المشترك"
        keepDataDescription="يُخفى المشترك من القائمة ويمكن استرجاعه من سلة المحذوفات. الاشتراكات والديون والدفعات تبقى محفوظة."
        withDataDescription="يُحذف المشترك وجميع اشتراكاته ودفعاته وديونه وفتراته نهائياً — لا يمكن التراجع."
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
