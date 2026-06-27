'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'
import { RefreshCw, Search, Plus, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useInfiniteVirtualData } from '@/hooks/useInfiniteVirtualData'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { DataPanel } from '@/components/shared/DataPanel'
import { CategoryFormModal } from '@/components/cards/CategoryFormModal'
import { type CardProductRow } from '@/lib/cards/types'
import { formatMoney } from '@/lib/format-money'
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

function formatAttributes(attrs: Record<string, unknown> | null | undefined): string {
  if (!attrs || typeof attrs !== 'object') return '—'
  const entries = Object.entries(attrs).filter(([, v]) => v != null && String(v).trim())
  if (entries.length === 0) return '—'
  return entries.map(([k, v]) => `${k}: ${v}`).join(' · ')
}

export function CategoriesTab() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<CardProductRow | null>(null)

  const { open, target, openModal, closeModal } = useDeleteConfirm()

  const {
    allItems,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteVirtualData('card_products', ['name'], debouncedSearch)

  const products = allItems as CardProductRow[]

  const virtualizer = useVirtualizer({
    count: products.length,
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
    void queryClient.invalidateQueries({ queryKey: ['card_products'] })
    void queryClient.invalidateQueries({ queryKey: ['card-products-options'] })
    void queryClient.invalidateQueries({ queryKey: ['card-products-for-sale'] })
    void queryClient.invalidateQueries({ queryKey: ['card-products-retail'] })
  }

  const handleDeleteRequest = (row: CardProductRow) => {
    if (row.quantity_in_stock > 0) {
      toast.error('لا يمكن حذف فئة لها مخزون — يجب أن يكون المخزون صفراً.')
      return
    }
    openModal({
      id: row.id,
      table: 'card_products',
      name: row.name,
      consequences: 'سيتم إخفاء الفئة. لا يمكن حذف فئات مرتبطة بمخزون نشط.',
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
    toast.success('تم الحذف بنجاح')
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
          {products.length.toLocaleString('ar-EG')} فئة
          {hasNextPage ? ' (المزيد متاح)' : ''}
        </p>
        <div className="flex items-center gap-2">
          <PermissionGuard permission="manage_card_inventory">
            <Button
              size="sm"
              onClick={() => setModalMode('add')}
              className="gap-1.5"
            >
              <Plus size={14} />
              إضافة فئة
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
          placeholder="بحث باسم الفئة…"
          className="pr-9"
          dir="rtl"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        الصفوف باللون الأحمر: المخزون ≤ الحد الأدنى.
      </p>

      <DataPanel noPadding>
      <div
        ref={containerRef}
        className={MASH_TABLE_SCROLL}
        style={{ height: 'calc(100vh - 360px)', minHeight: 320 }}
      >
        <table className={MASH_TABLE}>
          <thead>
            <tr>
              <th className={MASH_TH}>الاسم</th>
              <th className={`${MASH_TD} col-text`}>تفاصيل</th>
              <th className={`${MASH_TH_CENTER} col-amount`}>تجزئة</th>
              <th className={`${MASH_TH_CENTER} col-amount`}>موزع</th>
              <th className={`${MASH_TH_CENTER} col-amount`}>حد أدنى</th>
              <th className={`${MASH_TH_CENTER} col-amount`}>مخزون</th>
              <th className={MASH_TH_ACTIONS}>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr className={MASH_EMPTY_ROW}>
                <td colSpan={7}>جارٍ التحميل…</td>
              </tr>
            )}
            {!isLoading && products.length === 0 && (
              <tr className={MASH_EMPTY_ROW}>
                <td colSpan={7}>لا توجد فئات</td>
              </tr>
            )}
            {paddingTop > 0 && (
              <tr aria-hidden>
                <td style={{ height: paddingTop }} colSpan={7} />
              </tr>
            )}
            {virtualItems.map((vItem) => {
              const row = products[vItem.index]
              if (!row) return null
              const lowStock = row.quantity_in_stock <= row.min_quantity
              return (
                <tr
                  key={row.id}
                  style={{ height: vItem.size }}
                  className={lowStock ? 'bg-mash-danger-bg' : undefined}
                >
                  <td className={`${MASH_TD} font-medium`}>{row.name}</td>
                  <td className={`${MASH_TD} text-xs text-muted-foreground`}>
                    {formatAttributes(row.attributes)}
                  </td>
                  <td className={`${MASH_TD_AMOUNT}`}>
                    {formatMoney(row.sale_price)}
                  </td>
                  <td className={`${MASH_TD_AMOUNT}`}>
                    {formatMoney(row.distributor_price)}
                  </td>
                  <td className={MASH_TD_AMOUNT}>
                    {row.min_quantity.toLocaleString('ar-EG')}
                  </td>
                  <td
                    className={`${MASH_TD_AMOUNT} font-semibold ${
                      lowStock ? 'text-mash-danger-text' : ''
                    }`}
                  >
                    {row.quantity_in_stock.toLocaleString('ar-EG')}
                  </td>
                  <td className={MASH_TD_ACTIONS}>
                    <div className="flex items-center justify-center gap-1">
                      <PermissionGuard permission="manage_card_inventory">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => {
                            setEditTarget(row)
                            setModalMode('edit')
                          }}
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
                <td style={{ height: paddingBottom }} colSpan={7} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </DataPanel>

      <CategoryFormModal
        open={modalMode === 'add'}
        mode="add"
        onClose={() => setModalMode(null)}
        onSuccess={invalidateAll}
      />
      <CategoryFormModal
        open={modalMode === 'edit'}
        mode="edit"
        product={editTarget}
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
      />
    </div>
  )
}
