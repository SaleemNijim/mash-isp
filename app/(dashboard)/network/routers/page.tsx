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
import { RefreshCw, Search, Trash2, History, Network, Plus, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useInfiniteVirtualData } from '@/hooks/useInfiniteVirtualData'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { useTenant } from '@/hooks/useTenant'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import {
  ConfirmChangeModal,
  type MacChangeTarget,
} from '@/components/network/ConfirmChangeModal'
import { RouterFormModal, type RouterRecord } from '@/components/network/RouterFormModal'
import { MacHistoryModal } from '@/components/network/MacHistoryModal'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataPanel } from '@/components/shared/DataPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface RouterRow {
  id: string
  tenant_id: string
  name: string
  model: string | null
  mac_address: string | null
  ip_address: string | null
  location: string | null
  device_type: string | null
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

export default function NetworkRoutersPage() {
  return <NetworkRoutersContent />
}

function NetworkRoutersContent() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: tenant } = useTenant()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [macTarget, setMacTarget] = useState<MacChangeTarget | null>(null)
  const [historyRouter, setHistoryRouter] = useState<{
    id: string
    name: string
  } | null>(null)
  const [routerFormOpen, setRouterFormOpen] = useState(false)
  const [editRouter, setEditRouter] = useState<RouterRecord | null>(null)

  const { open, target, openModal, closeModal } = useDeleteConfirm()

  const {
    allItems,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteVirtualData(
    'network_routers',
    ['name', 'mac_address', 'ip_address'],
    debouncedSearch,
  )

  const routers = allItems as RouterRow[]

  const virtualizer = useVirtualizer({
    count: routers.length,
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

  useEffect(() => {
    if (!tenant?.id) return

    const sb = createClient()
    const channel = sb
      .channel(`routers-mac-page-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'router_mac_history',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (payload) => {
          const row = payload.new as {
            router_id?: string
            old_mac?: string | null
            new_mac?: string | null
          }
          toast.info(
            `تم تغيير MAC${row.new_mac ? `: ${row.new_mac}` : ''}`,
            { description: 'تحديث من جلسة أخرى — نفس الشركة فقط (§4.3)' },
          )
          void refetch()
          void queryClient.invalidateQueries({ queryKey: ['network_routers'] })
          void queryClient.invalidateQueries({
            queryKey: ['router-mac-history', row.router_id],
          })
        },
      )
      .subscribe()

    return () => {
      void sb.removeChannel(channel)
    }
  }, [tenant?.id, refetch, queryClient])

  const handleMacConfirm = async (newMac: string) => {
    if (!macTarget) return

    const { error } = await supabase
      .from('network_routers')
      .update({ mac_address: newMac })
      .eq('id', macTarget.id)

    if (error) throw error

    toast.success('تم تحديث عنوان MAC')
    void refetch()
    void queryClient.invalidateQueries({ queryKey: ['network_routers'] })
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
    void refetch()
    void queryClient.invalidateQueries({ queryKey: ['network_routers'] })
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
        title="أجهزة الشبكة"
        description={`${routers.length.toLocaleString('ar-EG')} جهاز${hasNextPage ? ' (المزيد متاح)' : ''}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
              <RefreshCw size={14} />
              تحديث
            </Button>
            <PermissionGuard permission="manage_network">
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => { setEditRouter(null); setRouterFormOpen(true) }}
              >
                <Plus size={14} />
                إضافة جهاز
              </Button>
            </PermissionGuard>
          </>
        }
      />

      <div className="relative max-w-md">
        <Search
          size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو MAC أو IP…"
          className="pr-9"
          dir="rtl"
        />
      </div>

      <DataPanel noPadding>
      <div
        ref={containerRef}
        className="overflow-auto max-h-[calc(100vh-16rem)]"
      >
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur-sm border-b border-border">
            <tr>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700">
                الاسم
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700">
                النوع
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700">
                MAC
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700">
                IP
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700">
                الموقع
              </th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-700">
                إجراءات
              </th>
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

            {!isLoading && routers.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted-foreground">
                  لا توجد أجهزة مطابقة
                </td>
              </tr>
            )}

            {paddingTop > 0 && (
              <tr aria-hidden>
                <td style={{ height: paddingTop }} colSpan={6} />
              </tr>
            )}

            {virtualItems.map((vItem) => {
              const row = routers[vItem.index]
              if (!row) return null
              return (
                <tr
                  key={row.id}
                  style={{ height: vItem.size }}
                  className="hover:bg-muted/30 border-b border-border/60"
                >
                  <td className="px-3 py-2 font-medium">{row.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.device_type ?? row.model ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <code dir="ltr" className="font-mono text-xs">
                      {row.mac_address || '—'}
                    </code>
                  </td>
                  <td className="px-3 py-2">
                    <code dir="ltr" className="font-mono text-xs">
                      {row.ip_address || '—'}
                    </code>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.location ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() =>
                          setHistoryRouter({ id: row.id, name: row.name })
                        }
                      >
                        <History size={12} />
                        السجل
                      </Button>
                      <PermissionGuard permission="manage_network">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => {
                            setEditRouter(row as RouterRecord)
                            setRouterFormOpen(true)
                          }}
                        >
                          <Pencil size={12} />
                          تعديل
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() =>
                            setMacTarget({
                              id: row.id,
                              name: row.name,
                              mac_address: row.mac_address,
                            })
                          }
                        >
                          <Network size={12} />
                          MAC
                        </Button>
                      </PermissionGuard>
                      <PermissionGuard permission="delete_records">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive gap-1"
                          onClick={() =>
                            openModal({
                              id: row.id,
                              table: 'network_routers',
                              name: row.name,
                              consequences:
                                'سيتم إخفاء الجهاز — الموسّعات المرتبطة تبقى في السجل.',
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
              <tr aria-hidden>
                <td style={{ height: paddingBottom }} colSpan={6} />
              </tr>
            )}

            {isFetchingNextPage && (
              <tr>
                <td colSpan={6} className="py-3 text-center text-xs text-muted-foreground">
                  جارٍ تحميل المزيد…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </DataPanel>

      <RouterFormModal
        open={routerFormOpen}
        router={editRouter}
        onClose={() => { setRouterFormOpen(false); setEditRouter(null) }}
        onSuccess={() => {
          void refetch()
          void queryClient.invalidateQueries({ queryKey: ['network_routers'] })
        }}
      />

      <ConfirmChangeModal
        open={!!macTarget}
        target={macTarget}
        onClose={() => setMacTarget(null)}
        onConfirm={handleMacConfirm}
      />

      <MacHistoryModal
        open={!!historyRouter}
        routerId={historyRouter?.id ?? null}
        routerName={historyRouter?.name ?? ''}
        onClose={() => setHistoryRouter(null)}
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
