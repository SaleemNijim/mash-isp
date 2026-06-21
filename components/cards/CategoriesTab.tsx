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
import { CategoryFormModal } from '@/components/cards/CategoryFormModal'
import { type CardProductRow } from '@/lib/cards/types'
import { formatMoney } from '@/lib/format-money'
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

      <div
        ref={containerRef}
        className="overflow-auto border border-gray-200 rounded-lg bg-white"
        style={{ height: 'calc(100vh - 360px)', minHeight: 320 }}
      >
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
            <tr>
              <th className="px-3 py-2.5 text-right font-semibold border-b">الاسم</th>
              <th className="px-3 py-2.5 text-right font-semibold border-b">تفاصيل</th>
              <th className="px-3 py-2.5 text-right font-semibold border-b">سعر البيع</th>
              <th className="px-3 py-2.5 text-right font-semibold border-b">حد أدنى</th>
              <th className="px-3 py-2.5 text-right font-semibold border-b">مخزون</th>
              <th className="px-3 py-2.5 text-center font-semibold border-b w-28">إجراءات</th>
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
            {!isLoading && products.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted-foreground">
                  لا توجد فئات
                </td>
              </tr>
            )}
            {paddingTop > 0 && (
              <tr aria-hidden>
                <td style={{ height: paddingTop }} colSpan={6} />
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
                  className={`border-b ${lowStock ? 'bg-red-50' : 'hover:bg-mash-page'}`}
                >
                  <td className="px-3 py-2 font-medium">{row.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs truncate">
                    {formatAttributes(row.attributes)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{formatMoney(row.sale_price)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.min_quantity.toLocaleString('ar-EG')}
                  </td>
                  <td
                    className={`px-3 py-2 tabular-nums font-semibold ${
                      lowStock ? 'text-red-700' : ''
                    }`}
                  >
                    {row.quantity_in_stock.toLocaleString('ar-EG')}
                  </td>
                  <td className="px-3 py-2">
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
                <td style={{ height: paddingBottom }} colSpan={6} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
