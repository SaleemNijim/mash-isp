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
import { RefreshCw, Search, Plus, Trash2, PackagePlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useInfiniteVirtualData } from '@/hooks/useInfiniteVirtualData'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface CardBatch {
  id: string
  tenant_id: string
  supplier: string | null
  received_at: string | null
  notes: string | null
  is_deleted: boolean
  created_at: string
}

interface CardProductOption {
  id: string
  name: string
}

interface BatchItemLine {
  key: string
  product_id: string
  quantity: string
  unit_cost: string
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

function newItemLine(): BatchItemLine {
  return {
    key: crypto.randomUUID(),
    product_id: '',
    quantity: '',
    unit_cost: '',
  }
}

export default function CardBatchesPage() {
  return <CardBatchesContent />
}

function CardBatchesContent() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)

  const [receiveOpen, setReceiveOpen] = useState(false)
  const [supplier, setSupplier] = useState('')
  const [notes, setNotes] = useState('')
  const [itemLines, setItemLines] = useState<BatchItemLine[]>([newItemLine()])
  const [receiving, setReceiving] = useState(false)

  const { open, target, openModal, closeModal } = useDeleteConfirm()

  const {
    allItems,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteVirtualData('card_batches', ['supplier', 'notes'], debouncedSearch)

  const batches = allItems as CardBatch[]

  const { data: products = [] } = useQuery<CardProductOption[]>({
    queryKey: ['card-products-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('card_products')
        .select('id, name')
        .eq('is_deleted', false)
        .order('name')
      if (error) throw error
      return data ?? []
    },
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

  const resetReceiveForm = () => {
    setSupplier('')
    setNotes('')
    setItemLines([newItemLine()])
  }

  const invalidateAll = () => {
    void refetch()
    void queryClient.invalidateQueries({ queryKey: ['card_batches'] })
    void queryClient.invalidateQueries({ queryKey: ['card_products'] })
  }

  const handleReceive = async () => {
    const validItems = itemLines
      .filter((l) => l.product_id && l.quantity.trim())
      .map((l) => ({
        product_id: l.product_id,
        quantity: Number(l.quantity),
        unit_cost: l.unit_cost.trim() ? Number(l.unit_cost) : null,
      }))

    if (validItems.length === 0) {
      toast.error('أضف صنفاً واحداً على الأقل (منتج + كمية)')
      return
    }

    for (const item of validItems) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        toast.error('الكمية يجب أن تكون عدداً صحيحاً موجباً')
        return
      }
      if (item.unit_cost != null && item.unit_cost < 0) {
        toast.error('تكلفة الوحدة لا يمكن أن تكون سالبة')
        return
      }
    }

    setReceiving(true)
    try {
      const { data, error } = await supabase.rpc('receive_card_batch', {
        p_supplier: supplier.trim() || null,
        p_notes: notes.trim() || null,
        p_items: validItems,
      })

      if (error) throw error

      toast.success(`تم استلام الدفعة — المخزون يُحدَّث تلقائياً`)
      setReceiveOpen(false)
      resetReceiveForm()
      invalidateAll()
      void data
    } catch {
      toast.error('فشل استلام الدفعة. يرجى المحاولة مرة أخرى.')
    } finally {
      setReceiving(false)
    }
  }

  const handleDeleteRequest = (row: CardBatch) => {
    const label = row.supplier?.trim() || `دفعة ${formatDate(row.received_at)}`
    openModal({
      id: row.id,
      table: 'card_batches',
      name: label,
      consequences:
        'سيُعكس المخزون تلقائياً (Trigger) — لن يصبح الرصيد سالباً حتى لو بيع جزء من الكمية.',
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
    toast.success('تم حذف الدفعة — المخزون أُعيد تلقائياً')
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
    <div dir="rtl" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">دفعات البطاقات</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {batches.length.toLocaleString('ar-EG')} دفعة
            {hasNextPage ? ' (المزيد متاح)' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              resetReceiveForm()
              setReceiveOpen(true)
            }}
            className="gap-1.5"
          >
            <PackagePlus size={14} />
            استلام دفعة
          </Button>
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
          placeholder="بحث بالمورد أو الملاحظات…"
          className="pr-9"
          dir="rtl"
        />
      </div>

      <div
        ref={containerRef}
        className="overflow-auto border border-gray-200 rounded-lg bg-white"
        style={{ height: 'calc(100vh - 280px)', minHeight: 360 }}
      >
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
            <tr>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                المورد
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                تاريخ الاستلام
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                ملاحظات
              </th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-700 border-b w-24">
                إجراءات
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="py-12 text-center text-muted-foreground">
                  جارٍ التحميل…
                </td>
              </tr>
            )}

            {!isLoading && batches.length === 0 && (
              <tr>
                <td colSpan={4} className="py-12 text-center text-muted-foreground">
                  لا توجد دفعات
                </td>
              </tr>
            )}

            {paddingTop > 0 && (
              <tr aria-hidden>
                <td style={{ height: paddingTop }} colSpan={4} />
              </tr>
            )}

            {virtualItems.map((vItem) => {
              const row = batches[vItem.index]
              if (!row) return null
              return (
                <tr
                  key={row.id}
                  style={{ height: vItem.size }}
                  className="hover:bg-mash-page border-b border-gray-100"
                >
                  <td className="px-3 py-2 font-medium">
                    {row.supplier?.trim() || '—'}
                  </td>
                  <td className="px-3 py-2">{formatDate(row.received_at)}</td>
                  <td className="px-3 py-2 text-muted-foreground max-w-xs truncate">
                    {row.notes?.trim() || '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center">
                      <PermissionGuard permission="delete_records">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive gap-1"
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
                <td style={{ height: paddingBottom }} colSpan={4} />
              </tr>
            )}

            {isFetchingNextPage && (
              <tr>
                <td colSpan={4} className="py-3 text-center text-xs text-muted-foreground">
                  جارٍ تحميل المزيد…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={receiveOpen}
        onOpenChange={(v) => !receiving && !v && setReceiveOpen(false)}
      >
        <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>استلام دفعة بطاقات</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              المخزون يُحدَّث فوراً عبر Trigger عند حفظ الدفعة — لا تُعدَّل
              quantity_in_stock يدوياً.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>المورد</Label>
                <Input
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="اسم المورد"
                  disabled={receiving}
                  dir="rtl"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>ملاحظات</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات اختيارية"
                  disabled={receiving}
                  dir="rtl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>أصناف الدفعة</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1 h-7 text-xs"
                  disabled={receiving}
                  onClick={() => setItemLines((lines) => [...lines, newItemLine()])}
                >
                  <Plus size={12} />
                  صنف
                </Button>
              </div>

              <div className="space-y-2 rounded-lg border border-gray-200 p-3">
                {itemLines.map((line, idx) => (
                  <div
                    key={line.key}
                    className="grid gap-2 sm:grid-cols-[1fr_100px_100px_auto] items-end"
                  >
                    <div className="space-y-1">
                      {idx === 0 && (
                        <span className="text-xs text-muted-foreground">المنتج</span>
                      )}
                      <Select
                        value={line.product_id}
                        onValueChange={(v) =>
                          setItemLines((lines) =>
                            lines.map((l) =>
                              l.key === line.key ? { ...l, product_id: v } : l,
                            ),
                          )
                        }
                        disabled={receiving}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="اختر فئة" />
                        </SelectTrigger>
                        <SelectContent dir="rtl">
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      {idx === 0 && (
                        <span className="text-xs text-muted-foreground">الكمية</span>
                      )}
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={line.quantity}
                        onChange={(e) =>
                          setItemLines((lines) =>
                            lines.map((l) =>
                              l.key === line.key
                                ? { ...l, quantity: e.target.value }
                                : l,
                            ),
                          )
                        }
                        disabled={receiving}
                        dir="ltr"
                        className="text-left tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      {idx === 0 && (
                        <span className="text-xs text-muted-foreground">تكلفة/وحدة</span>
                      )}
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.unit_cost}
                        onChange={(e) =>
                          setItemLines((lines) =>
                            lines.map((l) =>
                              l.key === line.key
                                ? { ...l, unit_cost: e.target.value }
                                : l,
                            ),
                          )
                        }
                        disabled={receiving}
                        dir="ltr"
                        className="text-left tabular-nums"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive h-9"
                      disabled={receiving || itemLines.length <= 1}
                      onClick={() =>
                        setItemLines((lines) =>
                          lines.filter((l) => l.key !== line.key),
                        )
                      }
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReceiveOpen(false)}
              disabled={receiving}
            >
              إلغاء
            </Button>
            <Button onClick={() => void handleReceive()} disabled={receiving}>
              {receiving ? 'جارٍ الاستلام…' : 'تأكيد الاستلام'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
