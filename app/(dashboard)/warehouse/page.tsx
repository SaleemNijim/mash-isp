'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  RefreshCw,
  Search,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  Wrench,
  Plus,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useInfiniteVirtualData } from '@/hooks/useInfiniteVirtualData'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import {
  MovementModal,
  MOVEMENT_TYPE_LABELS,
  type WarehouseItemTarget,
  type WarehouseMovementType,
} from '@/components/warehouse/MovementModal'
import { CreateWarehouseItemModal } from '@/components/warehouse/CreateWarehouseItemModal'
import {
  formatWarehouseQuantity,
  WAREHOUSE_UNIT_LABELS,
  type WarehouseUnit,
} from '@/lib/warehouse/units'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface WarehouseItem {
  id: string
  tenant_id: string
  name: string
  category: string | null
  unit: WarehouseUnit
  notes: string | null
  quantity: number
  min_quantity: number
  is_deleted: boolean
  created_at: string
}

interface WarehouseMovement {
  id: string
  tenant_id: string
  item_id: string
  movement_type: WarehouseMovementType
  quantity: number
  notes: string | null
  created_at: string
  warehouse_items: { name: string; unit: WarehouseUnit } | null
}

function normalizeMovement(row: Record<string, unknown>): WarehouseMovement {
  const items = row.warehouse_items
  const normalized = Array.isArray(items)
    ? (items[0] as { name: string; unit: WarehouseUnit } | undefined) ?? null
    : items
  const base = row as unknown as WarehouseMovement
  return {
    ...base,
    warehouse_items: normalized as { name: string; unit: WarehouseUnit } | null,
  }
}

type MovementFilter = 'all' | WarehouseMovementType

const MOVEMENT_PAGE = 100

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

export default function WarehousePage() {
  return (
    <PermissionGuard
      permission="manage_warehouse"
      fallback={
        <div dir="rtl" className="py-16 text-center text-muted-foreground">
          <p className="text-lg font-medium">إدارة المستودع</p>
          <p className="text-sm mt-2">هذه الصفحة تتطلب صلاحية إدارة المستودع.</p>
        </div>
      }
    >
      <WarehouseContent />
    </PermissionGuard>
  )
}

function WarehouseContent() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const itemsContainerRef = useRef<HTMLDivElement>(null)
  const movementsContainerRef = useRef<HTMLDivElement>(null)

  const [activeTab, setActiveTab] = useState('items')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [movementFilter, setMovementFilter] = useState<MovementFilter>('all')

  const [movementOpen, setMovementOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [movementItem, setMovementItem] = useState<WarehouseItemTarget | null>(null)
  const [movementType, setMovementType] = useState<WarehouseMovementType | null>(null)

  const {
    allItems,
    isLoading: itemsLoading,
    isFetchingNextPage: itemsFetchingMore,
    hasNextPage: itemsHasMore,
    fetchNextPage: itemsFetchMore,
    refetch: refetchItems,
  } = useInfiniteVirtualData('warehouse_items', ['name', 'category'], debouncedSearch)

  const items = allItems as WarehouseItem[]

  const movementsQuery = useInfiniteQuery({
    queryKey: ['warehouse_movements', movementFilter],
    queryFn: async ({ pageParam = 0 }) => {
      let q = supabase
        .from('warehouse_movements')
        .select(
          'id, tenant_id, item_id, movement_type, quantity, notes, created_at, warehouse_items(name, unit)',
          { count: 'exact' },
        )
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .range(pageParam * MOVEMENT_PAGE, (pageParam + 1) * MOVEMENT_PAGE - 1)

      if (movementFilter !== 'all') {
        q = q.eq('movement_type', movementFilter)
      }

      return q
    },
    getNextPageParam: (last, pages) => {
      return pages.length * MOVEMENT_PAGE < (last.count ?? 0)
        ? pages.length
        : undefined
    },
    initialPageParam: 0,
    enabled: activeTab === 'movements',
  })

  const movements = useMemo(
    () =>
      (movementsQuery.data?.pages.flatMap((p) => p.data ?? []) ?? []).map((row) =>
        normalizeMovement(row as Record<string, unknown>),
      ),
    [movementsQuery.data],
  )

  const itemsVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => itemsContainerRef.current,
    estimateSize: () => 56,
    overscan: 10,
  })

  const movementsVirtualizer = useVirtualizer({
    count: movements.length,
    getScrollElement: () => movementsContainerRef.current,
    estimateSize: () => 52,
    overscan: 10,
  })

  const handleItemsScroll = useCallback(() => {
    const el = itemsContainerRef.current
    if (!el || !itemsHasMore || itemsFetchingMore) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200
    if (nearBottom) void itemsFetchMore()
  }, [itemsHasMore, itemsFetchingMore, itemsFetchMore])

  const handleMovementsScroll = useCallback(() => {
    const el = movementsContainerRef.current
    if (!el || !movementsQuery.hasNextPage || movementsQuery.isFetchingNextPage) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200
    if (nearBottom) void movementsQuery.fetchNextPage()
  }, [
    movementsQuery.hasNextPage,
    movementsQuery.isFetchingNextPage,
    movementsQuery.fetchNextPage,
  ])

  useEffect(() => {
    const el = itemsContainerRef.current
    if (!el || activeTab !== 'items') return
    el.addEventListener('scroll', handleItemsScroll)
    return () => el.removeEventListener('scroll', handleItemsScroll)
  }, [handleItemsScroll, activeTab])

  useEffect(() => {
    const el = movementsContainerRef.current
    if (!el || activeTab !== 'movements') return
    el.addEventListener('scroll', handleMovementsScroll)
    return () => el.removeEventListener('scroll', handleMovementsScroll)
  }, [handleMovementsScroll, activeTab])

  const invalidateAll = () => {
    void refetchItems()
    void queryClient.invalidateQueries({ queryKey: ['warehouse_items'] })
    void queryClient.invalidateQueries({ queryKey: ['warehouse_movements'] })
  }

  const openMovement = (item: WarehouseItem, type: WarehouseMovementType) => {
    setMovementItem({
      id: item.id,
      name: item.name,
      quantity: item.quantity ?? 0,
      unit: item.unit ?? 'piece',
      notes: item.notes,
    })
    setMovementType(type)
    setMovementOpen(true)
  }

  const itemsVirtualItems = itemsVirtualizer.getVirtualItems()
  const itemsTotalSize = itemsVirtualizer.getTotalSize()
  const itemsPaddingTop =
    itemsVirtualItems.length > 0 ? itemsVirtualItems[0].start : 0
  const itemsPaddingBottom =
    itemsVirtualItems.length > 0
      ? itemsTotalSize - itemsVirtualItems[itemsVirtualItems.length - 1].end
      : 0

  const movVirtualItems = movementsVirtualizer.getVirtualItems()
  const movTotalSize = movementsVirtualizer.getTotalSize()
  const movPaddingTop = movVirtualItems.length > 0 ? movVirtualItems[0].start : 0
  const movPaddingBottom =
    movVirtualItems.length > 0
      ? movTotalSize - movVirtualItems[movVirtualItems.length - 1].end
      : 0

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المستودع</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            إدارة الأصناف وحركات الاستلام والإخراج
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
            صنف جديد
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => invalidateAll()}
            className="gap-1.5"
          >
            <RefreshCw size={14} />
            تحديث
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="items" className="gap-1.5">
            <Package size={14} />
            الأصناف
          </TabsTrigger>
          <TabsTrigger value="movements" className="gap-1.5">
            سجل الحركات
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4 mt-4">
          <div className="relative max-w-md">
            <Search
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو التصنيف…"
              className="pr-9"
              dir="rtl"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {items.length.toLocaleString('ar-EG')} صنف
            {itemsHasMore ? ' (المزيد متاح)' : ''}
          </p>

          <div
            ref={itemsContainerRef}
            className="overflow-auto border border-gray-200 rounded-lg bg-white"
            style={{ height: 'calc(100vh - 320px)', minHeight: 360 }}
          >
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
                <tr>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                    الصنف
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                    التصنيف
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                    الوحدة
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                    الكمية
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                    الحد الأدنى
                  </th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-700 border-b min-w-[280px]">
                    حركة
                  </th>
                </tr>
              </thead>
              <tbody>
                {itemsLoading && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      جارٍ التحميل…
                    </td>
                  </tr>
                )}

                {!itemsLoading && items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      <p>لا توجد أصناف</p>
                      <Button
                        variant="link"
                        className="mt-2"
                        onClick={() => setCreateOpen(true)}
                      >
                        إضافة أول صنف
                      </Button>
                    </td>
                  </tr>
                )}

                {itemsPaddingTop > 0 && (
                  <tr aria-hidden>
                    <td style={{ height: itemsPaddingTop }} colSpan={6} />
                  </tr>
                )}

                {itemsVirtualItems.map((vItem) => {
                  const row = items[vItem.index]
                  if (!row) return null
                  const unit = row.unit ?? 'piece'
                  const lowStock = (row.quantity ?? 0) <= (row.min_quantity ?? 0)
                  return (
                    <tr
                      key={row.id}
                      style={{ height: vItem.size }}
                      className={`border-b border-gray-100 hover:bg-mash-page ${
                        lowStock
                          ? 'bg-red-50 hover:bg-red-50/80 border-red-100'
                          : ''
                      }`}
                    >
                      <td className="px-3 py-2 font-medium">
                        <div className="flex items-center gap-1.5">
                          {lowStock && (
                            <AlertTriangle
                              size={14}
                              className="text-red-600 shrink-0"
                              aria-label="مخزون منخفض"
                            />
                          )}
                          <span className={lowStock ? 'text-red-800' : ''}>
                            {row.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.category?.trim() || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-xs">
                          {WAREHOUSE_UNIT_LABELS[unit]}
                        </Badge>
                      </td>
                      <td
                        className={`px-3 py-2 tabular-nums font-medium ${
                          lowStock ? 'text-red-700' : ''
                        }`}
                      >
                        {formatWarehouseQuantity(row.quantity, unit)}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {formatWarehouseQuantity(row.min_quantity, unit)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-green-700 border-green-200 hover:bg-green-50"
                            onClick={() => openMovement(row, 'receive')}
                          >
                            <ArrowDownToLine size={12} />
                            استلام
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => openMovement(row, 'issue')}
                          >
                            <ArrowUpFromLine size={12} />
                            إخراج
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-amber-700 border-amber-200 hover:bg-amber-50"
                            onClick={() => openMovement(row, 'damaged')}
                          >
                            <AlertTriangle size={12} />
                            تالف
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-primary-800 border-mash-border hover:bg-mash-page"
                            onClick={() => openMovement(row, 'installed')}
                          >
                            <Wrench size={12} />
                            مُركَّب
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {itemsPaddingBottom > 0 && (
                  <tr aria-hidden>
                    <td style={{ height: itemsPaddingBottom }} colSpan={6} />
                  </tr>
                )}

                {itemsFetchingMore && (
                  <tr>
                    <td colSpan={6} className="py-3 text-center text-xs text-muted-foreground">
                      جارٍ تحميل المزيد…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="movements" className="space-y-4 mt-4">
          <MovementFilterGroup
            value={movementFilter}
            onChange={setMovementFilter}
          />

          <p className="text-xs text-muted-foreground">
            {movements.length.toLocaleString('ar-EG')} حركة
            {movementsQuery.hasNextPage ? ' (المزيد متاح)' : ''}
          </p>

          <div
            ref={movementsContainerRef}
            className="overflow-auto border border-gray-200 rounded-lg bg-white"
            style={{ height: 'calc(100vh - 320px)', minHeight: 360 }}
          >
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
                <tr>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                    التاريخ
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                    الصنف
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                    النوع
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                    الكمية
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                    ملاحظات
                  </th>
                </tr>
              </thead>
              <tbody>
                {movementsQuery.isLoading && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted-foreground">
                      جارٍ التحميل…
                    </td>
                  </tr>
                )}

                {!movementsQuery.isLoading && movements.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted-foreground">
                      لا توجد حركات مطابقة
                    </td>
                  </tr>
                )}

                {movPaddingTop > 0 && (
                  <tr aria-hidden>
                    <td style={{ height: movPaddingTop }} colSpan={5} />
                  </tr>
                )}

                {movVirtualItems.map((vItem) => {
                  const row = movements[vItem.index]
                  if (!row) return null
                  return (
                    <tr
                      key={row.id}
                      style={{ height: vItem.size }}
                      className="hover:bg-mash-page border-b border-gray-100"
                    >
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDate(row.created_at)}
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {row.warehouse_items?.name ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        <MovementBadge type={row.movement_type} />
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatWarehouseQuantity(
                          row.quantity,
                          row.warehouse_items?.unit ?? 'piece',
                        )}{' '}
                        {WAREHOUSE_UNIT_LABELS[row.warehouse_items?.unit ?? 'piece']}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">
                        {row.notes?.trim() || '—'}
                      </td>
                    </tr>
                  )
                })}

                {movPaddingBottom > 0 && (
                  <tr aria-hidden>
                    <td style={{ height: movPaddingBottom }} colSpan={5} />
                  </tr>
                )}

                {movementsQuery.isFetchingNextPage && (
                  <tr>
                    <td colSpan={5} className="py-3 text-center text-xs text-muted-foreground">
                      جارٍ تحميل المزيد…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <CreateWarehouseItemModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={invalidateAll}
      />

      <MovementModal
        open={movementOpen}
        item={movementItem}
        movementType={movementType}
        onClose={() => {
          setMovementOpen(false)
          setMovementItem(null)
          setMovementType(null)
        }}
        onSuccess={invalidateAll}
      />
    </div>
  )
}

function MovementBadge({ type }: { type: WarehouseMovementType }) {
  const variants: Record<
    WarehouseMovementType,
    'default' | 'secondary' | 'destructive' | 'outline'
  > = {
    receive: 'default',
    issue: 'secondary',
    damaged: 'destructive',
    installed: 'outline',
  }
  return (
    <Badge variant={variants[type]}>{MOVEMENT_TYPE_LABELS[type]}</Badge>
  )
}

function MovementFilterGroup({
  value,
  onChange,
}: {
  value: MovementFilter
  onChange: (v: MovementFilter) => void
}) {
  const options: [MovementFilter, string][] = [
    ['all', 'الكل'],
    ['receive', MOVEMENT_TYPE_LABELS.receive],
    ['issue', MOVEMENT_TYPE_LABELS.issue],
    ['damaged', MOVEMENT_TYPE_LABELS.damaged],
    ['installed', MOVEMENT_TYPE_LABELS.installed],
  ]

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-muted-foreground ml-1">نوع الحركة:</span>
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
