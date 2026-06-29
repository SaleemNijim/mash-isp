'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { RefreshCw, Search, ShoppingCart } from 'lucide-react'
import { useInfiniteVirtualData } from '@/hooks/useInfiniteVirtualData'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { SellToDistributorModal } from '@/components/card-sales/SellToDistributorModal'
import { DataPanel } from '@/components/shared/DataPanel'
import {
  MASH_TABLE,
  MASH_TABLE_SCROLL,
  MASH_TH,
  MASH_TH_CENTER,
  MASH_TD,
  MASH_TD_AMOUNT,
  MASH_EMPTY_ROW,
} from '@/lib/ui/mash-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface DistributorSale {
  id: string
  tenant_id: string
  distributor_name: string
  total_amount: number | null
  commission_percent: number | null
  previous_balance: number | null
  bank_account_id: string | null
  is_deleted: boolean
  created_at: string
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
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMoney(n: number | null): string {
  if (n == null) return '—'
  return `${Number(n).toLocaleString('ar-EG')} ج.م`
}

export default function CardSalesPage() {
  return <CardSalesContent />
}

function CardSalesContent() {
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [sellOpen, setSellOpen] = useState(false)

  const {
    allItems,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteVirtualData<DistributorSale>(
    'card_distributor_sales',
    ['distributor_name'],
    debouncedSearch,
  )

  const sales = allItems

  const virtualizer = useVirtualizer({
    count: sales.length,
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

  const handleSellSuccess = () => {
    void refetch()
    void queryClient.invalidateQueries({ queryKey: ['card_distributor_sales'] })
    void queryClient.invalidateQueries({ queryKey: ['card_products'] })
    void queryClient.invalidateQueries({ queryKey: ['card-products-for-sale'] })
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
          <h1 className="mash-page-title">مبيعات الموزعين</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {sales.length.toLocaleString('ar-EG')} عملية بيع
            {hasNextPage ? ' (المزيد متاح)' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PermissionGuard permission="sell_cards">
            <Button
              size="sm"
              onClick={() => setSellOpen(true)}
              className="gap-1.5"
            >
              <ShoppingCart size={14} />
              بيع لموزع
            </Button>
          </PermissionGuard>
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
      </div>

      <div className="relative max-w-md">
        <Search
          size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث باسم الموزع…"
          className="pr-9"
          dir="rtl"
        />
      </div>

      <DataPanel noPadding>
      <div
        ref={containerRef}
        className={MASH_TABLE_SCROLL}
        style={{ height: 'calc(100vh - 280px)', minHeight: 360 }}
      >
        <table className={MASH_TABLE}>
          <thead>
            <tr>
              <th className={MASH_TH}>الموزع</th>
              <th className={`${MASH_TH_CENTER} col-amount`}>الإجمالي</th>
              <th className={`${MASH_TH_CENTER} col-amount`}>عمولة %</th>
              <th className={`${MASH_TH_CENTER} col-amount`}>رصيد سابق</th>
              <th className={MASH_TH}>التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr className={MASH_EMPTY_ROW}>
                <td colSpan={5}>جارٍ التحميل…</td>
              </tr>
            )}

            {!isLoading && sales.length === 0 && (
              <tr className={MASH_EMPTY_ROW}>
                <td colSpan={5}>لا توجد مبيعات</td>
              </tr>
            )}

            {paddingTop > 0 && (
              <tr aria-hidden>
                <td style={{ height: paddingTop }} colSpan={5} />
              </tr>
            )}

            {virtualItems.map((vItem) => {
              const row = sales[vItem.index]
              if (!row) return null
              return (
                <tr
                  key={row.id}
                  style={{ height: vItem.size }}
                >
                  <td className={`${MASH_TD} font-medium`}>{row.distributor_name}</td>
                  <td className={MASH_TD_AMOUNT}>
                    {formatMoney(row.total_amount)}
                  </td>
                  <td className={MASH_TD_AMOUNT}>
                    {row.commission_percent != null
                      ? `${Number(row.commission_percent).toLocaleString('ar-EG')}%`
                      : '—'}
                  </td>
                  <td className={MASH_TD_AMOUNT}>
                    {formatMoney(row.previous_balance)}
                  </td>
                  <td className={MASH_TD}>{formatDate(row.created_at)}</td>
                </tr>
              )
            })}

            {paddingBottom > 0 && (
              <tr aria-hidden>
                <td style={{ height: paddingBottom }} colSpan={5} />
              </tr>
            )}

            {isFetchingNextPage && (
              <tr>
                <td colSpan={5} className="py-3 text-center text-xs text-muted-foreground">
                  جارٍ تحميل المزيد…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </DataPanel>

      <SellToDistributorModal
        open={sellOpen}
        onClose={() => setSellOpen(false)}
        onSuccess={handleSellSuccess}
      />
    </div>
  )
}
