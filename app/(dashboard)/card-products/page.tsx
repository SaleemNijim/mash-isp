'use client'

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'
import { RefreshCw, Search, Plus, Pencil, Trash2 } from 'lucide-react'
import type { PostgrestError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useInfiniteVirtualData } from '@/hooks/useInfiniteVirtualData'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { useTenant } from '@/hooks/useTenant'
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

interface CardProduct {
  id: string
  tenant_id: string
  name: string
  denomination: number | null
  cost_price: number | null
  sale_price: number | null
  quantity_in_stock: number
  min_quantity: number
  card_type?: string | null
  is_deleted: boolean
  created_at: string
}

interface ProductForm {
  name: string
  denomination: string
  cost_price: string
  sale_price: string
  min_quantity: string
  card_type: 'daily' | 'monthly' | 'other'
}

const emptyForm = (): ProductForm => ({
  name: '',
  denomination: '',
  cost_price: '',
  sale_price: '',
  min_quantity: '0',
  card_type: 'other',
})

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

function parseForm(form: ProductForm) {
  return {
    name: form.name.trim(),
    denomination: form.denomination.trim() ? Number(form.denomination) : null,
    cost_price: form.cost_price.trim() ? Number(form.cost_price) : null,
    sale_price: form.sale_price.trim() ? Number(form.sale_price) : null,
    min_quantity: form.min_quantity.trim() ? Number(form.min_quantity) : 0,
    card_type: form.card_type,
  }
}

function formFromProduct(p: CardProduct): ProductForm {
  return {
    name: p.name,
    denomination: p.denomination != null ? String(p.denomination) : '',
    cost_price: p.cost_price != null ? String(p.cost_price) : '',
    sale_price: p.sale_price != null ? String(p.sale_price) : '',
    min_quantity: String(p.min_quantity ?? 0),
    card_type: (p.card_type as ProductForm['card_type']) ?? 'other',
  }
}

const CARD_TYPE_LABELS: Record<ProductForm['card_type'], string> = {
  daily: 'يومية',
  monthly: 'شهرية',
  other: 'أخرى',
}

function formatMoney(n: number | null): string {
  if (n == null) return '—'
  return `${Number(n).toLocaleString('ar-EG')} ج.م`
}

export default function CardProductsPage() {
  return <CardProductsContent />
}

function CardProductsContent() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: tenant } = useTenant()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<ProductForm>(emptyForm)
  const [adding, setAdding] = useState(false)

  const [editTarget, setEditTarget] = useState<CardProduct | null>(null)
  const [editForm, setEditForm] = useState<ProductForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  const { open, target, openModal, closeModal } = useDeleteConfirm()

  const {
    allItems,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteVirtualData('card_products', ['name'], debouncedSearch)

  const products = allItems as CardProduct[]

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
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenant?.id) return

    const parsed = parseForm(addForm)
    if (!parsed.name) {
      toast.error('اسم الفئة مطلوب')
      return
    }
    if (parsed.min_quantity < 0) {
      toast.error('الحد الأدنى لا يمكن أن يكون سالباً')
      return
    }

    setAdding(true)
    try {
      const { error } = await supabase.from('card_products').insert({
        tenant_id: tenant.id,
        name: parsed.name,
        denomination: parsed.denomination,
        cost_price: parsed.cost_price,
        sale_price: parsed.sale_price,
        min_quantity: parsed.min_quantity,
        card_type: parsed.card_type,
      })
      if (error) throw error

      toast.success('تمت إضافة الفئة بنجاح')
      setAddForm(emptyForm())
      setShowAddForm(false)
      invalidateAll()
    } catch (err) {
      const pgErr = err as PostgrestError
      if (pgErr.code === '23505') {
        toast.error(`الفئة «${parsed.name}» موجودة مسبقاً`)
      } else {
        toast.error('فشلت الإضافة. يرجى المحاولة مرة أخرى.')
      }
    } finally {
      setAdding(false)
    }
  }

  const openEdit = (row: CardProduct) => {
    setEditTarget(row)
    setEditForm(formFromProduct(row))
  }

  const handleEditSave = async () => {
    if (!editTarget) return

    const parsed = parseForm(editForm)
    if (!parsed.name) {
      toast.error('اسم الفئة مطلوب')
      return
    }
    if (parsed.min_quantity < 0) {
      toast.error('الحد الأدنى لا يمكن أن يكون سالباً')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('card_products')
        .update({
          name: parsed.name,
          denomination: parsed.denomination,
          cost_price: parsed.cost_price,
          sale_price: parsed.sale_price,
          min_quantity: parsed.min_quantity,
          card_type: parsed.card_type,
        })
        .eq('id', editTarget.id)

      if (error) throw error

      toast.success('تم تحديث الفئة')
      setEditTarget(null)
      invalidateAll()
    } catch (err) {
      const pgErr = err as PostgrestError
      if (pgErr.code === '23505') {
        toast.error(`الفئة «${parsed.name}» موجودة مسبقاً`)
      } else {
        toast.error('فشل التحديث. يرجى المحاولة مرة أخرى.')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRequest = (row: CardProduct) => {
    if (row.quantity_in_stock > 0) {
      toast.error(
        'لا يمكن حذف فئة لها مخزون — يجب أن يكون المخزون صفراً (يُدار عبر الدفعات فقط).',
      )
      return
    }

    openModal({
      id: row.id,
      table: 'card_products',
      name: row.name,
      consequences:
        'سيتم إخفاء الفئة. لا يمكن حذف فئات مرتبطة بمخزون أو دفعات نشطة.',
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
          <h1 className="text-2xl font-bold text-gray-900">فئات البطاقات</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {products.length.toLocaleString('ar-EG')} فئة
            {hasNextPage ? ' (المزيد متاح)' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm((v) => !v)}
            className="gap-1.5"
          >
            <Plus size={14} />
            إضافة فئة
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

      {showAddForm && (
        <form
          onSubmit={(e) => void handleAdd(e)}
          className="rounded-lg border border-gray-200 bg-white p-4 space-y-3"
        >
          <p className="text-sm font-semibold text-gray-800">إضافة فئة جديدة</p>
          <ProductFormFields
            form={addForm}
            onChange={setAddForm}
            disabled={adding}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={adding}>
              {adding ? 'جارٍ الحفظ…' : 'حفظ'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={adding}
              onClick={() => setShowAddForm(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      )}

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
        الصفوف باللون الأحمر: المخزون ≤ الحد الأدنى — المخزون يُحدَّث عبر استلام
        الدفعات فقط.
      </p>

      <div
        ref={containerRef}
        className="overflow-auto border border-gray-200 rounded-lg bg-white"
        style={{ height: 'calc(100vh - 320px)', minHeight: 360 }}
      >
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
            <tr>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                الاسم
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                النوع
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                القيمة
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                تكلفة
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                بيع
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                المخزون
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                حد أدنى
              </th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-700 border-b w-28">
                إجراءات
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-muted-foreground">
                  جارٍ التحميل…
                </td>
              </tr>
            )}

            {!isLoading && products.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-muted-foreground">
                  لا توجد فئات
                </td>
              </tr>
            )}

            {paddingTop > 0 && (
              <tr aria-hidden>
                <td style={{ height: paddingTop }} colSpan={8} />
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
                  className={`border-b border-gray-100 ${
                    lowStock
                      ? 'bg-red-50 hover:bg-red-100/70'
                      : 'hover:bg-mash-page'
                  }`}
                >
                  <td className="px-3 py-2 font-medium">{row.name}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">
                    {CARD_TYPE_LABELS[(row.card_type as ProductForm['card_type']) ?? 'other']}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.denomination != null
                      ? Number(row.denomination).toLocaleString('ar-EG')
                      : '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatMoney(row.cost_price)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatMoney(row.sale_price)}
                  </td>
                  <td
                    className={`px-3 py-2 tabular-nums font-semibold ${
                      lowStock ? 'text-red-700' : ''
                    }`}
                  >
                    {row.quantity_in_stock.toLocaleString('ar-EG')}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.min_quantity.toLocaleString('ar-EG')}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => openEdit(row)}
                      >
                        <Pencil size={12} />
                        تعديل
                      </Button>
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
                <td style={{ height: paddingBottom }} colSpan={7} />
              </tr>
            )}

            {isFetchingNextPage && (
              <tr>
                <td colSpan={7} className="py-3 text-center text-xs text-muted-foreground">
                  جارٍ تحميل المزيد…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={!!editTarget}
        onOpenChange={(v) => !saving && !v && setEditTarget(null)}
      >
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تعديل فئة</DialogTitle>
          </DialogHeader>
          <ProductFormFields
            form={editForm}
            onChange={setEditForm}
            disabled={saving}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditTarget(null)}
              disabled={saving}
            >
              إلغاء
            </Button>
            <Button onClick={() => void handleEditSave()} disabled={saving}>
              {saving ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}
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

function ProductFormFields({
  form,
  onChange,
  disabled,
}: {
  form: ProductForm
  onChange: (f: ProductForm) => void
  disabled?: boolean
}) {
  const set = (key: keyof ProductForm, value: string) =>
    onChange({ ...form, [key]: value })

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
        <Label>اسم الفئة</Label>
        <Input
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          disabled={disabled}
          dir="rtl"
        />
      </div>
      <div className="space-y-1.5">
        <Label>قيمة الفئة (ج.م)</Label>
        <Input
          type="number"
          min={0}
          step="0.01"
          value={form.denomination}
          onChange={(e) => set('denomination', e.target.value)}
          disabled={disabled}
          dir="ltr"
          className="text-left tabular-nums"
        />
      </div>
      <div className="space-y-1.5">
        <Label>سعر التكلفة</Label>
        <Input
          type="number"
          min={0}
          step="0.01"
          value={form.cost_price}
          onChange={(e) => set('cost_price', e.target.value)}
          disabled={disabled}
          dir="ltr"
          className="text-left tabular-nums"
        />
      </div>
      <div className="space-y-1.5">
        <Label>سعر البيع</Label>
        <Input
          type="number"
          min={0}
          step="0.01"
          value={form.sale_price}
          onChange={(e) => set('sale_price', e.target.value)}
          disabled={disabled}
          dir="ltr"
          className="text-left tabular-nums"
        />
      </div>
      <div className="space-y-1.5">
        <Label>نوع البطاقة</Label>
        <select
          value={form.card_type}
          onChange={(e) =>
            onChange({ ...form, card_type: e.target.value as ProductForm['card_type'] })
          }
          disabled={disabled}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="daily">يومية</option>
          <option value="monthly">شهرية</option>
          <option value="other">أخرى / موزع</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>الحد الأدنى للمخزون</Label>
        <Input
          type="number"
          min={0}
          step="1"
          value={form.min_quantity}
          onChange={(e) => set('min_quantity', e.target.value)}
          disabled={disabled}
          dir="ltr"
          className="text-left tabular-nums"
        />
      </div>
    </div>
  )
}
