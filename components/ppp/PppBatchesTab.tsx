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
import { RefreshCw, Search, PackagePlus, Trash2, List } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useInfiniteVirtualData } from '@/hooks/useInfiniteVirtualData'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { DataPanel } from '@/components/shared/DataPanel'
import { ReceivePppBatchModal } from '@/components/ppp/ReceivePppBatchModal'
import { type PppBatchRow, type PppBatchSummary } from '@/lib/ppp/types'
import {
  MASH_TABLE,
  MASH_TABLE_SCROLL,
  MASH_TH,
  MASH_TH_CENTER,
  MASH_TH_ACTIONS,
  MASH_TD,
  MASH_TD_CODE,
  MASH_TD_ACTIONS,
  MASH_EMPTY_ROW,
} from '@/lib/ui/mash-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

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

function planLabel(batch: PppBatchRow): string {
  const raw = batch.ppp_plans
  const plan = Array.isArray(raw) ? raw[0] : raw
  return plan ? `${plan.name} (${plan.speed})` : '—'
}

interface PppBatchesTabProps {
  onViewUsernames: (batchId: string) => void
}

export function PppBatchesTab({ onViewUsernames }: PppBatchesTabProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: tenant } = useTenant()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [receiveOpen, setReceiveOpen] = useState(false)

  const { open, target, openModal, closeModal } = useDeleteConfirm()

  const {
    allItems,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteVirtualData<PppBatchRow>(
    'ppp_batches',
    ['batch_number', 'notes'],
    debouncedSearch,
    { select: 'id, tenant_id, plan_id, batch_number, received_at, notes, is_deleted, created_at, ppp_plans(name, speed)' },
  )

  const batches = allItems
  const batchIds = batches.map((b) => b.id)

  const { data: summaries = {} } = useQuery<Record<string, PppBatchSummary>>({
    queryKey: ['ppp-batch-summaries', batchIds.join(',')],
    queryFn: async () => {
      if (batchIds.length === 0) return {}
      const { data, error } = await supabase
        .from('internet_credentials')
        .select('batch_id, is_used, ppp_plans(name)')
        .in('batch_id', batchIds.slice(0, 100))
        .eq('is_deleted', false)
      if (error) throw error

      const map: Record<string, PppBatchSummary> = {}
      for (const row of data ?? []) {
        const bid = row.batch_id as string
        if (!map[bid]) {
          map[bid] = { batch_id: bid, total: 0, available: 0, plan_name: '' }
        }
        map[bid].total += 1
        if (!row.is_used) map[bid].available += 1
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
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) void fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  const invalidateAll = () => {
    void refetch()
    void queryClient.invalidateQueries({ queryKey: ['ppp-batches'] })
    void queryClient.invalidateQueries({ queryKey: ['ppp-batch-summaries'] })
    void queryClient.invalidateQueries({ queryKey: ['ppp-plan-inventory'] })
    void queryClient.invalidateQueries({ queryKey: ['internet_credentials'] })
  }

  const handleDeleteRequest = (row: PppBatchRow) => {
    const sum = summaries[row.id]
    if (sum && sum.total > 0) {
      toast.error('لا يمكن حذف دفعة فيها usernames — احذف usernames أولاً أو استخدم usernames tab.')
      return
    }
    openModal({
      id: row.id,
      table: 'ppp_batches',
      name: row.batch_number,
      permanent: true,
      consequences: 'سيُحذف السجل نهائياً من قاعدة البيانات ولا يمكن استرجاعه.',
    })
  }

  const handleDeleteConfirm = async () => {
    if (!target) return
    const res = await fetch('/api/delete/hard/ppp-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: target.id }),
    })
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    if (!res.ok) {
      const msg = body?.error ?? 'delete_failed'
      if (msg.includes('still has usernames')) {
        throw new Error('لا يمكن الحذف — الدفعة ما زالت تحتوي usernames.')
      }
      throw new Error(msg.includes('insufficient permission')
        ? 'صلاحية غير كافية — يتطلب صلاحية «حذف السجلات».'
        : msg)
    }
    toast.success('تم الحذف النهائي للدفعة')
    invalidateAll()
  }

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0
      ? totalSize - virtualItems[virtualItems.length - 1].end
      : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">دفعات PPP</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            استلام usernames — كل دفعة مرتبطة بفئة ومخزون معزول
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
            <RefreshCw size={14} />
            تحديث
          </Button>
          <Button size="sm" onClick={() => setReceiveOpen(true)} className="gap-1.5">
            <PackagePlus size={14} />
            استلام دفعة
          </Button>
        </div>
      </div>

      <DataPanel className="p-4">
      <div className="relative max-w-md mb-3">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث برقم الدفعة…"
          className="pr-9"
        />
      </div>

      <div ref={containerRef} className={MASH_TABLE_SCROLL} style={{ height: 420 }}>
        <table className={MASH_TABLE}>
          <thead>
            <tr>
              <th className={MASH_TH}>رقم الدفعة</th>
              <th className={MASH_TH}>الفئة</th>
              <th className={MASH_TH_CENTER}>التاريخ</th>
              <th className={MASH_TH_CENTER}>متاح / إجمالي</th>
              <th className={MASH_TH_ACTIONS}>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className={MASH_EMPTY_ROW}>جارٍ التحميل…</td></tr>
            )}
            {!isLoading && batches.length === 0 && (
              <tr><td colSpan={5} className={MASH_EMPTY_ROW}>لا توجد دفعات — استلم دفعة جديدة</td></tr>
            )}
            {paddingTop > 0 && (
              <tr aria-hidden><td style={{ height: paddingTop }} colSpan={5} /></tr>
            )}
            {virtualItems.map((vItem) => {
              const row = batches[vItem.index]
              if (!row) return null
              const sum = summaries[row.id]
              return (
                <tr key={row.id}>
                  <td className={cn(MASH_TD, MASH_TD_CODE)}>{row.batch_number}</td>
                  <td className={MASH_TD}>{planLabel(row)}</td>
                  <td className={cn(MASH_TD, 'text-center text-sm')}>{formatDate(row.received_at)}</td>
                  <td className={cn(MASH_TD, 'text-center tabular-nums')}>
                    {sum ? `${sum.available} / ${sum.total}` : '0 / 0'}
                  </td>
                  <td className={MASH_TD_ACTIONS}>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => onViewUsernames(row.id)}
                      >
                        <List size={14} />
                        usernames
                      </Button>
                      <PermissionGuard permission="delete_records">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive"
                          onClick={() => handleDeleteRequest(row)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </PermissionGuard>
                    </div>
                  </td>
                </tr>
              )
            })}
            {paddingBottom > 0 && (
              <tr aria-hidden><td style={{ height: paddingBottom }} colSpan={5} /></tr>
            )}
          </tbody>
        </table>
      </div>
      </DataPanel>

      <ReceivePppBatchModal
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        onSuccess={invalidateAll}
      />

      <DeleteConfirmModal
        open={open}
        onClose={closeModal}
        onConfirm={handleDeleteConfirm}
        recordName={target?.name ?? ''}
        consequences={target?.consequences}
        title="حذف نهائي للدفعة"
        confirmLabel="تأكيد الحذف النهائي"
        isPermanent={target?.permanent === true}
      />
    </div>
  )
}
