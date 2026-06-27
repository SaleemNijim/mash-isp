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
import { RefreshCw, Search, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useInfiniteVirtualData } from '@/hooks/useInfiniteVirtualData'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { usePppPlanInventory } from '@/hooks/usePppPlanInventory'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { DataPanel } from '@/components/shared/DataPanel'
import { PppPlanFormModal } from '@/components/ppp/PppPlanFormModal'
import { isPppPlanBelowMin, type PppPlan } from '@/lib/ppp/plans'
import { formatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import {
  MASH_TABLE,
  MASH_TABLE_SCROLL,
  MASH_TH,
  MASH_TH_CENTER,
  MASH_TH_ACTIONS,
  MASH_TD,
  MASH_TD_AMOUNT,
  MASH_TD_ACTIONS,
  MASH_EMPTY_ROW,
} from '@/lib/ui/mash-table'
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

export function PppCategoriesTab() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: tenant } = useTenant()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<PppPlan | null>(null)

  const { open, target, openModal, closeModal } = useDeleteConfirm()
  const { availableByPlan, totalByPlan } = usePppPlanInventory()

  const {
    allItems,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteVirtualData('ppp_plans', ['name', 'speed'], debouncedSearch)

  const plans = allItems as PppPlan[]

  const { data: batchCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ['ppp-plan-batch-counts', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return {}
      const { data, error } = await supabase
        .from('ppp_batches')
        .select('plan_id')
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
      if (error) throw error
      const map: Record<string, number> = {}
      for (const row of data ?? []) {
        const pid = row.plan_id as string
        map[pid] = (map[pid] ?? 0) + 1
      }
      return map
    },
    enabled: !!tenant?.id,
  })

  const virtualizer = useVirtualizer({
    count: plans.length,
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
    void queryClient.invalidateQueries({ queryKey: ['ppp-plans'] })
    void queryClient.invalidateQueries({ queryKey: ['ppp-plan-inventory'] })
    void queryClient.invalidateQueries({ queryKey: ['ppp-batches'] })
    void queryClient.invalidateQueries({ queryKey: ['ppp-plan-batch-counts'] })
  }

  const handleDeleteRequest = (row: PppPlan) => {
    const stock = totalByPlan[row.id] ?? 0
    if (stock > 0) {
      toast.error('لا يمكن حذف فئة لها usernames — يجب أن يكون المخزون صفراً.')
      return
    }
    if ((batchCounts[row.id] ?? 0) > 0) {
      toast.error('لا يمكن حذف فئة لها دفعات — احذف الدفعات الفارغة أولاً.')
      return
    }
    openModal({
      id: row.id,
      table: 'ppp_plans',
      name: row.name,
      permanent: true,
      consequences: 'سيُحذف السجل نهائياً من قاعدة البيانات ولا يمكن استرجاعه.',
    })
  }

  const handleDeleteConfirm = async () => {
    if (!target) return
    const res = await fetch('/api/delete/hard/ppp-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: target.id }),
    })
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    if (!res.ok) {
      const msg = body?.error ?? 'delete_failed'
      if (msg.includes('still has usernames')) {
        throw new Error('لا يمكن الحذف — الفئة ما زالت تحتوي usernames.')
      }
      if (msg.includes('still has batches')) {
        throw new Error('لا يمكن الحذف — احذف الدفعات الفارغة أولاً.')
      }
      throw new Error(msg.includes('insufficient permission')
        ? 'صلاحية غير كافية — يتطلب صلاحية «حذف السجلات».'
        : msg)
    }
    toast.success('تم الحذف النهائي للفئة')
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
    <DataPanel
      title="فئات PPP"
      description="أصناف الاشتراك — السعر والحد الأدنى. ثم استلم usernames عبر «الدفعات»."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
            <RefreshCw size={14} />
            تحديث
          </Button>
          <Button size="sm" onClick={() => setModalMode('add')} className="gap-1.5">
            <Plus size={14} />
            فئة جديدة
          </Button>
        </>
      }
    >
      <div className="relative max-w-md mb-3">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو السرعة…"
          className="pr-9"
        />
      </div>

      <div ref={containerRef} className={MASH_TABLE_SCROLL} style={{ height: 420 }}>
        <table className={MASH_TABLE}>
          <thead>
            <tr>
              <th className={MASH_TH}>الفئة</th>
              <th className={MASH_TH_CENTER}>السرعة</th>
              <th className={MASH_TH_CENTER}>السعر</th>
              <th className={MASH_TH_CENTER}>متاح / إجمالي</th>
              <th className={MASH_TH_CENTER}>حد أدنى</th>
              <th className={MASH_TH_CENTER}>دفعات</th>
              <th className={MASH_TH_ACTIONS}>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className={MASH_EMPTY_ROW}>جارٍ التحميل…</td>
              </tr>
            )}
            {!isLoading && plans.length === 0 && (
              <tr>
                <td colSpan={7} className={MASH_EMPTY_ROW}>لا توجد فئات — أضف فئة ثم استلم دفعة</td>
              </tr>
            )}
            {paddingTop > 0 && (
              <tr aria-hidden><td style={{ height: paddingTop }} colSpan={7} /></tr>
            )}
            {virtualItems.map((vItem) => {
              const row = plans[vItem.index]
              if (!row) return null
              const available = availableByPlan[row.id] ?? 0
              const total = totalByPlan[row.id] ?? 0
              const low = isPppPlanBelowMin(available, row.min_available_usernames)
              return (
                <tr key={row.id} className={cn(low && 'bg-amber-50/80')}>
                  <td className={MASH_TD}>
                    <span className="inline-flex items-center gap-1 font-medium">
                      {low && <AlertTriangle size={14} className="text-amber-600" />}
                      {row.name}
                    </span>
                  </td>
                  <td className={cn(MASH_TD, 'text-center font-mono')}>{row.speed}</td>
                  <td className={cn(MASH_TD_AMOUNT, 'text-center')}>{formatMoney(row.price)}</td>
                  <td className={cn(MASH_TD, 'text-center tabular-nums', low && 'text-amber-700 font-medium')}>
                    {available} / {total}
                  </td>
                  <td className={cn(MASH_TD, 'text-center tabular-nums')}>{row.min_available_usernames}</td>
                  <td className={cn(MASH_TD, 'text-center tabular-nums')}>{batchCounts[row.id] ?? 0}</td>
                  <td className={MASH_TD_ACTIONS}>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          setEditTarget(row)
                          setModalMode('edit')
                        }}
                      >
                        <Pencil size={14} />
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
              <tr aria-hidden><td style={{ height: paddingBottom }} colSpan={7} /></tr>
            )}
          </tbody>
        </table>
      </div>

      <PppPlanFormModal
        open={modalMode !== null}
        mode={modalMode ?? 'add'}
        plan={editTarget}
        onClose={() => {
          setModalMode(null)
          setEditTarget(null)
        }}
        onSuccess={invalidateAll}
      />

      <DeleteConfirmModal
        open={open}
        onClose={closeModal}
        onConfirm={handleDeleteConfirm}
        recordName={target?.name ?? ''}
        consequences={target?.consequences}
        title="حذف نهائي للفئة"
        confirmLabel="تأكيد الحذف النهائي"
        isPermanent={target?.permanent === true}
      />
    </DataPanel>
  )
}
