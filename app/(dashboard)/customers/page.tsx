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
import { RefreshCw, Search, Plus, Pencil, Trash2, Wifi } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useInfiniteVirtualData } from '@/hooks/useInfiniteVirtualData'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataPanel } from '@/components/shared/DataPanel'
import {
  CustomerFormModal,
  type CustomerRecord,
} from '@/components/customers/CustomerFormModal'
import { CreateSubscriptionModal } from '@/components/subscriptions/CreateSubscriptionModal'
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

export default function CustomersPage() {
  return <CustomersContent />
}

function CustomersContent() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<CustomerRecord | null>(null)
  const [subForCustomer, setSubForCustomer] = useState<string | null>(null)

  const { open, target, openModal, closeModal } = useDeleteConfirm()

  const {
    allItems,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteVirtualData('customers', ['name', 'phone', 'address'], debouncedSearch)

  const customers = allItems as CustomerRecord[]

  const virtualizer = useVirtualizer({
    count: customers.length,
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

  const handleDeleteConfirm = async () => {
    if (!target) return
    const res = await fetch('/api/delete/soft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: target.table, id: target.id }),
    })
    if (!res.ok) throw new Error('delete_failed')
    toast.success('تم الحذف بنجاح')
    void refetch()
    void queryClient.invalidateQueries({ queryKey: ['customers'] })
  }

  const handleFormSuccess = () => {
    void refetch()
    void queryClient.invalidateQueries({ queryKey: ['customers-select'] })
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
      <PageHeader
        title="المشتركون"
        description={`${customers.length.toLocaleString('ar-EG')} مشترك${hasNextPage ? ' (المزيد متاح)' : ''}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
              <RefreshCw size={14} />
              تحديث
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => { setEditTarget(null); setFormOpen(true) }}>
              <Plus size={14} />
              إضافة مشترك
            </Button>
          </>
        }
      />

      <div className="relative max-w-md">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الهاتف..."
          className="pr-9"
          dir="rtl"
        />
      </div>

      <DataPanel noPadding>
        <div
          ref={containerRef}
          className="overflow-auto"
          style={{ height: 'calc(100vh - 280px)', minHeight: 360 }}
        >
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur-sm border-b border-border">
              <tr>
                <th className="px-4 py-2.5 text-right font-semibold">الاسم</th>
                <th className="px-4 py-2.5 text-right font-semibold">الهاتف</th>
                <th className="px-4 py-2.5 text-right font-semibold">العنوان</th>
                <th className="px-4 py-2.5 text-center font-semibold w-44">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-muted-foreground">
                    جارٍ التحميل...
                  </td>
                </tr>
              )}
              {!isLoading && customers.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-muted-foreground">
                    لا يوجد مشتركون — اضغط «إضافة مشترك»
                  </td>
                </tr>
              )}
              {paddingTop > 0 && (
                <tr aria-hidden><td style={{ height: paddingTop }} colSpan={4} /></tr>
              )}
              {virtualItems.map((vItem) => {
                const row = customers[vItem.index]
                if (!row) return null
                return (
                  <tr
                    key={row.id}
                    style={{ height: vItem.size }}
                    className="hover:bg-muted/30 border-b border-border/60"
                  >
                    <td className="px-4 py-2 font-medium">{row.name}</td>
                    <td className="px-4 py-2 text-muted-foreground tabular-nums">{row.phone || '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground truncate max-w-[200px]">{row.address || '—'}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => setSubForCustomer(row.id)}
                        >
                          <Wifi size={12} />
                          اشتراك
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => { setEditTarget(row); setFormOpen(true) }}
                        >
                          <Pencil size={12} />
                          تعديل
                        </Button>
                        <PermissionGuard permission="delete_records">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive gap-1"
                            onClick={() =>
                              openModal({
                                id: row.id,
                                table: 'customers',
                                name: row.name,
                                consequences: 'سيتم إخفاء المشترك — الاشتراكات المرتبطة تبقى.',
                              })
                            }
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
                <tr aria-hidden><td style={{ height: paddingBottom }} colSpan={4} /></tr>
              )}
            </tbody>
          </table>
        </div>
      </DataPanel>

      <CustomerFormModal
        open={formOpen}
        customer={editTarget}
        onClose={() => { setFormOpen(false); setEditTarget(null) }}
        onSuccess={handleFormSuccess}
      />

      <CreateSubscriptionModal
        open={subForCustomer !== null}
        preselectedCustomerId={subForCustomer}
        onClose={() => setSubForCustomer(null)}
        onSuccess={() => {
          setSubForCustomer(null)
          void queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
        }}
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
