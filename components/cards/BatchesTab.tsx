'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'
import { RefreshCw, Search, PackagePlus, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useInfiniteVirtualData } from '@/hooks/useInfiniteVirtualData'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { ReceiveBatchModal } from '@/components/cards/ReceiveBatchModal'
import { EditBatchModal } from '@/components/cards/EditBatchModal'
import { type CardBatchRow } from '@/lib/cards/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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

interface BatchSummary {
  batch_id: string
  total_qty: number
  remaining_qty: number
  product_names: string
}

export function BatchesTab() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<CardBatchRow | null>(null)

  const { open, target, openModal, closeModal } = useDeleteConfirm()

  const {
    allItems,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteVirtualData(
    'card_batches',
    ['batch_number', 'notes'],
    debouncedSearch,
  )

  const batches = allItems as CardBatchRow[]
  const batchIds = batches.map((b) => b.id)

  const { data: summaries = {} } = useQuery<Record<string, BatchSummary>>({
    queryKey: ['card-batch-summaries', batchIds.join(',')],
    queryFn: async () => {
      if (batchIds.length === 0) return {}
      const { data, error } = await supabase
        .from('card_batch_items')
        .select('batch_id, quantity, quantity_remaining, card_products(name)')
        .in('batch_id', batchIds.slice(0, 100))
        .eq('is_deleted', false)
      if (error) throw error

      const map: Record<string, BatchSummary> = {}
      for (const row of data ?? []) {
        const batchId = row.batch_id as string
        const productRaw = row.card_products as { name?: string } | { name?: string }[] | null
        const product = Array.isArray(productRaw) ? productRaw[0] : productRaw
        const name = product?.name ?? ''

        if (!map[batchId]) {
          map[batchId] = {
            batch_id: batchId,
            total_qty: 0,
            remaining_qty: 0,
            product_names: '',
          }
        }
        map[batchId].total_qty += Number(row.quantity)
        map[batchId].remaining_qty += Number(row.quantity_remaining)
        if (name && !map[batchId].product_names.includes(name)) {
          map[batchId].product_names = map[batchId].product_names
            ? `${map[batchId].product_names}، ${name}`
            : name
        }
      }
      return map
    },
    enabled: batchIds.length > 0,
  })

  const virtualizer = useVirtualizer({
    count: batches.length,
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

  const invalidateAll = () => {
    void refetch()
    void queryClient.invalidateQueries({ queryKey: ['card_batches'] })
    void queryClient.invalidateQueries({ queryKey: ['card_products'] })
    void queryClient.invalidateQueries({ queryKey: ['card-batch-summaries'] })
    void queryClient.invalidateQueries({ queryKey: ['card-products-options'] })
  }

  const handleDeleteRequest = (row: CardBatchRow) => {
    const label = row.batch_number?.trim() || row.supplier?.trim() || formatDate(row.received_at)
    openModal({
      id: row.id,
      table: 'card_batches',
      name: label,
      consequences:
        'سيُعكس المتبقي من المخزون تلقائياً — لن يصبح الرصيد سالباً.',
    })
  }

  const handleDeleteConfirm = async () => {
    if (!target) return
    const res = await fetch('/api/delete/soft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: target.table, id: target.id }),
    })
    if (!res.ok) throw new Error('delete_failed')
    toast.success('تم حذف الدفعة')
    invalidateAll()
  }

  const virtualItems = virtualizer.getVirtualItems()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {batches.length.toLocaleString('ar-EG')} دفعة
          {hasNextPage ? ' (المزيد متاح)' : ''}
        </p>
        <div className="flex items-center gap-2">
          <PermissionGuard permission="manage_card_inventory">
            <Button size="sm" onClick={() => setReceiveOpen(true)} className="gap-1.5">
              <PackagePlus size={14} />
              استلام دفعة
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
          placeholder="بحث برقم الدفعة أو الملاحظات…"
          className="pr-9"
          dir="rtl"
        />
      </div>

      <div
        ref={containerRef}
        className="overflow-auto border border-gray-200 rounded-lg bg-white"
        style={{ height: 'calc(100vh - 360px)', minHeight: 320 }}
      >
        <table
          className="w-full text-sm border-collapse table-fixed"
          style={{ minWidth: 720 }}
        >
          <colgroup>
            <col style={{ width: '12%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '14%' }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
            <tr>
              <th className="px-3 py-2.5 text-right font-semibold border-b">رقم الدفعة</th>
              <th className="px-3 py-2.5 text-right font-semibold border-b">الفئة</th>
              <th className="px-3 py-2.5 text-right font-semibold border-b">الكمية / المتبقي</th>
              <th className="px-3 py-2.5 text-right font-semibold border-b">ملاحظات</th>
              <th className="px-3 py-2.5 text-right font-semibold border-b">التاريخ</th>
              <th className="px-3 py-2.5 text-center font-semibold border-b">إجراءات</th>
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
            {!isLoading && batches.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted-foreground">
                  لا توجد دفعات
                </td>
              </tr>
            )}
            {paddingTop > 0 && (
              <tr aria-hidden>
                <td style={{ height: paddingTop }} colSpan={6} />
              </tr>
            )}
            {virtualItems.map((vItem) => {
              const row = batches[vItem.index]
              if (!row) return null
              const summary = summaries[row.id]
              return (
                <tr
                  key={row.id}
                  style={{ height: vItem.size }}
                  className="hover:bg-mash-page border-b border-gray-100"
                >
                  <td className="px-3 py-2 font-medium tabular-nums text-right">
                    {row.batch_number?.trim() || '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground truncate">
                    {summary?.product_names || '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-right">
                    {summary
                      ? `${summary.total_qty.toLocaleString('ar-EG')} / ${summary.remaining_qty.toLocaleString('ar-EG')}`
                      : '—'}
                  </td>
                  <td
                    className="px-3 py-2 text-xs text-muted-foreground truncate"
                    title={row.notes?.trim() || undefined}
                  >
                    {row.notes?.trim() || '—'}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatDate(row.received_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <PermissionGuard permission="manage_card_inventory">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => setEditTarget(row)}
                        >
                          <Pencil size={12} />
                          تعديل
                        </Button>
                      </PermissionGuard>
                      <PermissionGuard permission="delete_records">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive gap-1"
                          onClick={() => handleDeleteRequest(row)}
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
          </tbody>
        </table>
      </div>

      <ReceiveBatchModal
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        onSuccess={invalidateAll}
      />
      <EditBatchModal
        open={editTarget !== null}
        batch={editTarget}
        categoryLabel={
          editTarget ? summaries[editTarget.id]?.product_names : undefined
        }
        quantityLabel={
          editTarget && summaries[editTarget.id]
            ? `${summaries[editTarget.id].total_qty.toLocaleString('ar-EG')} / ${summaries[editTarget.id].remaining_qty.toLocaleString('ar-EG')}`
            : undefined
        }
        onClose={() => setEditTarget(null)}
        onSuccess={invalidateAll}
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
