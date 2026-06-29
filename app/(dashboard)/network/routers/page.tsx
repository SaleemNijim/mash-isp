'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'
import {
  RefreshCw,
  Search,
  Trash2,
  History,
  Network,
  Plus,
  FileSpreadsheet,
  HelpCircle,
  Download,
  Loader2,
  Pencil,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useInfiniteVirtualData } from '@/hooks/useInfiniteVirtualData'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { useTenant } from '@/hooks/useTenant'
import { useNetworkPorts } from '@/hooks/useNetworkPorts'
import { useNetworkDeviceTypes } from '@/hooks/useNetworkDeviceTypes'
import { usePermissions } from '@/hooks/usePermissions'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { PortFormModal } from '@/components/network/PortFormModal'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import {
  ConfirmChangeModal,
  type MacChangeTarget,
} from '@/components/network/ConfirmChangeModal'
import { RouterFormModal, type RouterRecord } from '@/components/network/RouterFormModal'
import { MacHistoryModal } from '@/components/network/MacHistoryModal'
import { EditableSpreadsheetCell } from '@/components/network/EditableSpreadsheetCell'
import { DeviceTypePicker } from '@/components/network/DeviceTypePicker'
import { UnsavedChangesDialog } from '@/components/network/UnsavedChangesDialog'
import { NetworkImportDialog } from '@/components/network/NetworkImportDialog'
import { NetworkImportGuideDialog } from '@/components/network/NetworkImportGuideDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataPanel } from '@/components/shared/DataPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  compareIpAddress,
  matchesNetworkRouterSearch,
} from '@/lib/network/router-list-utils'
import { exportNetworkPortToExcel } from '@/lib/excel/export-network-port'
import {
  MASH_EMPTY_ROW,
  MASH_TABLE,
  MASH_TABLE_SCROLL,
  MASH_TD,
  MASH_TD_ACTIONS,
  MASH_TD_CODE,
  MASH_TD_INDEX,
  MASH_TD_IP,
  MASH_TD_LTR,
  MASH_TD_MAC,
  MASH_TD_PHONE,
  MASH_TH,
  MASH_TH_ACTIONS,
  MASH_TH_CENTER,
  MASH_TH_INDEX,
} from '@/lib/ui/mash-table'
import {
  parseNetworkViewFilter,
  portViewFilter,
  collectCascadePortIds,
  type NetworkViewFilter,
} from '@/lib/network/ports'

type EditField =
  | 'ip_address'
  | 'model'
  | 'mac_address'
  | 'location'
  | 'name'
  | 'device_type'
  | 'phone'
  | 'notes'

interface EditingCell {
  rowId: string
  field: EditField
  draft: string
  original: string
}

interface RouterListRow {
  id: string
  name: string
  model: string | null
  mac_address: string | null
  ip_address: string | null
  location: string | null
  device_type: string | null
  phone: string | null
  notes: string | null
  port_id: string | null
  network_ports?: { name: string } | { name: string }[] | null
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

function portNameFromRow(
  ports: RouterListRow['network_ports'],
): string {
  if (!ports) return '—'
  if (Array.isArray(ports)) return ports[0]?.name ?? '—'
  return ports.name ?? '—'
}

const ROUTER_SELECT =
  'id, tenant_id, name, model, mac_address, ip_address, location, device_type, phone, notes, port_id, network_ports(name)'

export default function NetworkRoutersPage() {
  return <NetworkRoutersContent />
}

function NetworkRoutersContent() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: tenant } = useTenant()
  const { data: ports = [], refetch: refetchPorts } = useNetworkPorts()
  const { data: deviceTypes = [] } = useNetworkDeviceTypes()
  const canManageNetwork = usePermissions((s) => s.hasPermission('manage_network'))

  const [viewFilter, setViewFilter] = useState<NetworkViewFilter>('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [editing, setEditing] = useState<EditingCell | null>(null)
  const [pendingViewFilter, setPendingViewFilter] = useState<NetworkViewFilter | null>(null)
  const [unsavedOpen, setUnsavedOpen] = useState(false)
  const [savingUnsaved, setSavingUnsaved] = useState(false)

  const [macTarget, setMacTarget] = useState<MacChangeTarget | null>(null)
  const [historyRouter, setHistoryRouter] = useState<{ id: string; name: string } | null>(null)
  const [routerFormOpen, setRouterFormOpen] = useState(false)
  const [editRouter, setEditRouter] = useState<RouterRecord | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [portFormOpen, setPortFormOpen] = useState(false)
  const [wipeOpen, setWipeOpen] = useState(false)
  const [deletePortOpen, setDeletePortOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { open, target, openModal, closeModal } = useDeleteConfirm()

  const parsed = parseNetworkViewFilter(viewFilter)

  const selectedPort =
    parsed.mode === 'port' && parsed.portId
      ? ports.find((p) => p.id === parsed.portId) ?? null
      : null

  const portFilterId = selectedPort?.id

  const {
    allItems,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteVirtualData<RouterListRow>(
    'network_routers',
    [],
    '',
    {
      filters: portFilterId ? { port_id: portFilterId } : undefined,
      select: ROUTER_SELECT,
    },
  )

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isLoading) {
      void fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, isLoading, fetchNextPage, allItems.length])

  const rows = useMemo(() => {
    const items = allItems
    const filtered = debouncedSearch.trim()
      ? items.filter((row) => matchesNetworkRouterSearch(row, debouncedSearch))
      : items
    return [...filtered].sort((a, b) => compareIpAddress(a.ip_address, b.ip_address))
  }, [allItems, debouncedSearch])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 44,
    overscan: 12,
  })

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el || !hasNextPage || isFetchingNextPage) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) void fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  const isDirty = editing != null && editing.draft !== editing.original

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const requestViewFilter = useCallback(
    (next: NetworkViewFilter) => {
      if (isDirty) {
        setPendingViewFilter(next)
        setUnsavedOpen(true)
        return
      }
      setEditing(null)
      setViewFilter(next)
    },
    [isDirty],
  )

  const invalidateList = useCallback(async () => {
    await queryClient.resetQueries({ queryKey: ['network_routers'] })
    await queryClient.invalidateQueries({ queryKey: ['network-ports'] })
    await queryClient.invalidateQueries({ queryKey: ['network-device-types'] })
    void refetchPorts()
  }, [queryClient, refetchPorts])

  const persistEdit = useCallback(
    async (cell: EditingCell) => {
      if (cell.draft === cell.original) return

      if (cell.field === 'mac_address') {
        setMacTarget({
          id: cell.rowId,
          name: rows.find((r) => r.id === cell.rowId)?.name ?? '',
          mac_address: cell.original || null,
          proposedMac: cell.draft.trim(),
        })
        setEditing(null)
        return
      }

      const value = cell.draft.trim() || null
      const { error } = await supabase
        .from('network_routers')
        .update({ [cell.field]: value })
        .eq('id', cell.rowId)
      if (error) throw error
      if (cell.field === 'device_type') {
        await queryClient.invalidateQueries({ queryKey: ['network-device-types'] })
      }
      await invalidateList()
    },
    [supabase, rows, invalidateList, queryClient],
  )

  const commitEditing = useCallback(async () => {
    if (!editing) return
    try {
      await persistEdit(editing)
      setEditing(null)
    } catch {
      toast.error('فشل الحفظ')
    }
  }, [editing, persistEdit])

  const startEdit = useCallback(
    (rowId: string, field: EditField, value: string) => {
      if (isDirty && editing && (editing.rowId !== rowId || editing.field !== field)) {
        setPendingViewFilter(null)
        setUnsavedOpen(true)
        return
      }
      setEditing({
        rowId,
        field,
        draft: value,
        original: value,
      })
    },
    [isDirty, editing],
  )

  const filterTabs = useMemo(
    () => [
      { id: 'all' as const, label: 'الكل' },
      ...ports.map((p) => ({
        id: portViewFilter(p.id),
        label: p.name,
      })),
    ],
    [ports],
  )

  const openImport = useCallback(() => {
    if (!selectedPort) {
      toast.error('اختر بورتاً من التبويبات أولاً')
      return
    }
    setImportOpen(true)
  }, [selectedPort])

  const openAddRouter = useCallback(() => {
    if (!selectedPort) {
      toast.error('اختر بورتاً من التبويبات أولاً ثم أضف الراوتر')
      return
    }
    setEditRouter(null)
    setRouterFormOpen(true)
  }, [selectedPort])

  const openEditRouter = useCallback((row: RouterListRow) => {
    setEditRouter({
      id: row.id,
      name: row.name,
      model: row.model,
      mac_address: row.mac_address,
      ip_address: row.ip_address,
      location: row.location,
      device_type: row.device_type,
      port_id: row.port_id,
    })
    setRouterFormOpen(true)
  }, [])

  const handleExport = useCallback(async () => {
    if (!selectedPort) {
      toast.error('اختر بورتاً من التبويبات أولاً')
      return
    }
    if (!tenant?.name) {
      toast.error('تعذّر تحديد اسم الشبكة')
      return
    }

    setExporting(true)
    try {
      const { data, error } = await supabase
        .from('network_routers')
        .select(
          'name, model, mac_address, ip_address, location, device_type, phone, notes',
        )
        .eq('port_id', selectedPort.id)
        .eq('is_deleted', false)

      if (error) throw error

      const result = await exportNetworkPortToExcel({
        networkName: tenant.name,
        portName: selectedPort.name,
        routers: data ?? [],
      })

      if (!result.saved) return

      toast.success(
        result.count > 0
          ? `تم تصدير ${result.count.toLocaleString('ar-EG')} راوتر إلى Excel`
          : 'تم تنزيل القالب الفارغ — لا توجد راوترات في هذا البورت',
      )
    } catch {
      toast.error('فشل تصدير Excel')
    } finally {
      setExporting(false)
    }
  }, [selectedPort, tenant?.name, supabase])

  const handleWipeConfirm = async () => {
    const res = await fetch('/api/network/wipe', { method: 'POST' })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      total?: number
      counts?: Record<string, number>
    }
    if (!res.ok) {
      throw new Error(body.error ?? 'wipe_failed')
    }
    const total = body.total ?? 0
    toast.success(
      total > 0
        ? `تم حذف ${total.toLocaleString('ar-EG')} سجل نهائياً`
        : 'لا توجد بيانات للحذف',
    )
    setViewFilter('all')
    await queryClient.resetQueries({ queryKey: ['network_routers'] })
    await queryClient.resetQueries({ queryKey: ['network-ports'] })
    invalidateList()
  }

  const selectedPortCascadeCount = useMemo(() => {
    if (!selectedPort) return 0
    return collectCascadePortIds(selectedPort.id, ports).length
  }, [selectedPort, ports])

  const handleDeletePortConfirm = async () => {
    if (!selectedPort) return
    const res = await fetch('/api/network/wipe-port', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port_id: selectedPort.id }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      total?: number
    }
    if (!res.ok) {
      throw new Error(body.error ?? 'delete_port_failed')
    }
    toast.success(`تم حذف ${selectedPort.name} نهائياً`)
    setViewFilter('all')
    await queryClient.resetQueries({ queryKey: ['network_routers'] })
    await queryClient.resetQueries({ queryKey: ['network-ports'] })
    invalidateList()
  }

  const virtualItems = virtualizer.getVirtualItems()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0

  const handleMacConfirm = async (newMac: string) => {
    if (!macTarget) return
    const { error } = await supabase
      .from('network_routers')
      .update({ mac_address: newMac })
      .eq('id', macTarget.id)
    if (error) throw error
    toast.success('تم تحديث MAC')
    invalidateList()
  }

  const handleDeleteConfirm = async () => {
    if (!target) return
    const res = await fetch('/api/delete/hard/network', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: target.table, id: target.id }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? 'delete_failed')
    }
    toast.success('تم الحذف نهائياً')
    invalidateList()
  }

  const renderCell = (
    row: RouterListRow,
    field: EditField,
    display: string,
    opts?: { ltr?: boolean; align?: 'center' | 'start'; mono?: boolean },
  ) => {
    const active = editing?.rowId === row.id && editing.field === field

    return (
      <EditableSpreadsheetCell
        value={active ? editing!.draft : display}
        editing={!!active}
        dir={opts?.ltr ? 'ltr' : 'rtl'}
        mono={opts?.mono ?? opts?.ltr}
        align={opts?.align}
        disabled={!canManageNetwork}
        onStartEdit={() =>
          startEdit(row.id, field, display === '—' ? '' : display)
        }
        onChange={(v) => {
          if (active) setEditing({ ...editing!, draft: v })
        }}
        onCommit={() => void commitEditing()}
        onCancel={() => {
          if (editing) setEditing({ ...editing, draft: editing.original })
          setEditing(null)
        }}
      />
    )
  }

  const renderDeviceTypeCell = (row: RouterListRow) => {
    const display = row.device_type ?? '—'
    const active = editing?.rowId === row.id && editing.field === 'device_type'

    if (active) {
      return (
        <DeviceTypePicker
          value={editing!.draft}
          options={deviceTypes}
          autoFocus
          className="border-primary px-1.5 py-1 text-xs ring-1 ring-primary/30"
          onChange={(v) => setEditing({ ...editing!, draft: v })}
          onCommit={() => void commitEditing()}
          onCancel={() => {
            if (editing) setEditing({ ...editing, draft: editing.original })
            setEditing(null)
          }}
        />
      )
    }

    return (
      <button
        type="button"
        disabled={!canManageNetwork}
        onClick={() => startEdit(row.id, 'device_type', display === '—' ? '' : display)}
        className={cn(
          'w-full text-right truncate rounded px-1 py-0.5 hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent',
          !row.device_type && 'text-muted-foreground',
        )}
      >
        {display}
      </button>
    )
  }

  const tableColCount = parsed.mode === 'all' ? 11 : 10

  return (
    <div dir="rtl" className="space-y-4">
      <PageHeader
        title="أجهزة الشبكة"
        description={`${rows.length.toLocaleString('ar-EG')} سجل${isFetchingNextPage ? ' — جارٍ التحميل…' : ''}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void invalidateList()} className="gap-1.5">
              <RefreshCw size={14} />
              تحديث
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={exporting || !selectedPort}
              onClick={() => void handleExport()}
            >
              {exporting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              تصدير Excel
            </Button>
            <PermissionGuard permission="manage_network">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setGuideOpen(true)}
              >
                <HelpCircle size={14} />
                تعليمات
              </Button>
              <PermissionGuard permission="import_excel">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={openImport}
                >
                  <FileSpreadsheet size={14} />
                  استيراد Excel
                </Button>
              </PermissionGuard>
              <PermissionGuard permission="delete_records">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  disabled={!selectedPort}
                  onClick={() => setDeletePortOpen(true)}
                >
                  <Trash2 size={14} />
                  حذف البورت
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  onClick={() => setWipeOpen(true)}
                >
                  <Trash2 size={14} />
                  مسح الكل
                </Button>
              </PermissionGuard>
              <Button size="sm" className="gap-1.5" onClick={openAddRouter}>
                <Plus size={14} />
                إضافة
              </Button>
            </PermissionGuard>
          </>
        }
      />

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex flex-wrap gap-1">
          {filterTabs.map((tab) => (
            <Button
              key={tab.id}
              type="button"
              size="sm"
              variant={viewFilter === tab.id ? 'default' : 'outline'}
              className={cn('h-8 text-xs', viewFilter === tab.id && 'pointer-events-none')}
              onClick={() => requestViewFilter(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        <PermissionGuard permission="manage_network">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs"
            onClick={() => setPortFormOpen(true)}
          >
            <Plus size={12} />
            Port
          </Button>
        </PermissionGuard>
      </div>

      {ports.length === 0 && (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-4">
          لا توجد بورتات — اضغط «+ Port» لإنشاء Port 2 مثلاً، ثم اختره وارفع ملف Excel.
        </p>
      )}

      {parsed.mode === 'all' &&
        allItems.some((r) => !r.port_id) && (
        <p className="text-sm text-amber-800 dark:text-amber-200 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30 p-3">
          يوجد راوترات بدون بورت — لن تظهر في تبويب بورت محدد. اضغط «تعديل» واختر البورت.
        </p>
      )}

      <div className="relative max-w-md">
        <Search
          size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(e) => {
            if (isDirty) {
              setPendingViewFilter(viewFilter)
              setUnsavedOpen(true)
              return
            }
            setSearch(e.target.value)
          }}
          placeholder="بحث IP / SSID / MAC / موقع / كود / جوال…"
          className="pr-9"
        />
      </div>

      <DataPanel noPadding>
        <div
          ref={containerRef}
          className={cn(MASH_TABLE_SCROLL, 'max-h-[calc(100vh-15rem)]')}
        >
          <table className={MASH_TABLE}>
            <thead>
              <tr>
                <th className={MASH_TH_INDEX}>م</th>
                {parsed.mode === 'all' && (
                  <th className={MASH_TH}>Port</th>
                )}
                <th className={cn(MASH_TH_CENTER, 'col-ip')}>IP</th>
                <th className={cn(MASH_TH_CENTER, 'col-code')}>الكود</th>
                <th className={cn(MASH_TH_CENTER, 'col-mac')}>MAC</th>
                <th className={MASH_TH}>الموقع</th>
                <th className={MASH_TH_CENTER}>SSID</th>
                <th className={MASH_TH}>النوع</th>
                <th className={cn(MASH_TH_CENTER, 'col-phone')}>جوال</th>
                <th className={MASH_TH}>ملاحظات</th>
                <th className={MASH_TH_ACTIONS}>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr className={MASH_EMPTY_ROW}>
                  <td colSpan={tableColCount}>جارٍ التحميل…</td>
                </tr>
              )}

              {!isLoading && rows.length === 0 && (
                <tr className={MASH_EMPTY_ROW}>
                  <td colSpan={tableColCount}>
                    لا توجد سجلات — {parsed.mode === 'port' ? 'يمكنك استيراد Excel' : 'غيّر الفلتر'}
                  </td>
                </tr>
              )}

              {paddingTop > 0 && (
                <tr aria-hidden>
                  <td style={{ height: paddingTop }} colSpan={tableColCount} />
                </tr>
              )}

              {virtualItems.map((vItem) => {
                const row = rows[vItem.index]
                if (!row) return null
                const seq = vItem.index + 1

                return (
                  <tr
                    key={row.id}
                    style={{ height: vItem.size }}
                  >
                    <td className={MASH_TD_INDEX}>{seq}</td>
                    {parsed.mode === 'all' && (
                      <td className={MASH_TD}>{portNameFromRow(row.network_ports)}</td>
                    )}
                    <td className={MASH_TD_IP}>
                      {renderCell(row, 'ip_address', row.ip_address ?? '—', {
                        ltr: true,
                        align: 'center',
                        mono: true,
                      })}
                    </td>
                    <td className={MASH_TD_CODE}>
                      {renderCell(row, 'model', row.model ?? '—', {
                        align: 'center',
                        mono: true,
                      })}
                    </td>
                    <td className={MASH_TD_MAC}>
                      {renderCell(row, 'mac_address', row.mac_address ?? '—', {
                        ltr: true,
                        align: 'center',
                        mono: true,
                      })}
                    </td>
                    <td className={MASH_TD}>
                      {renderCell(row, 'location', row.location ?? '—')}
                    </td>
                    <td className={MASH_TD_LTR}>
                      {renderCell(row, 'name', row.name ?? '—', {
                        ltr: true,
                        align: 'center',
                        mono: true,
                      })}
                    </td>
                    <td className={MASH_TD}>{renderDeviceTypeCell(row)}</td>
                    <td className={MASH_TD_PHONE}>
                      {renderCell(row, 'phone', row.phone ?? '—', {
                        ltr: true,
                        align: 'center',
                        mono: true,
                      })}
                    </td>
                    <td className={MASH_TD}>
                      {renderCell(row, 'notes', row.notes ?? '—')}
                    </td>
                    <td className={MASH_TD_ACTIONS}>
                      <div className="flex justify-center gap-1">
                        <PermissionGuard permission="manage_network">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-7 w-7"
                            onClick={() => openEditRouter(row)}
                          >
                            <Pencil size={12} />
                          </Button>
                        </PermissionGuard>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-7 w-7"
                          onClick={() =>
                            setHistoryRouter({ id: row.id, name: row.name ?? '' })
                          }
                        >
                          <History size={12} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-7 w-7"
                          onClick={() =>
                            setMacTarget({
                              id: row.id,
                              name: row.name ?? '',
                              mac_address: row.mac_address,
                            })
                          }
                        >
                          <Network size={12} />
                        </Button>
                        <PermissionGuard permission="delete_records">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-7 w-7 text-destructive"
                            onClick={() =>
                              openModal({
                                id: row.id,
                                table: 'network_routers',
                                name: row.name ?? row.ip_address ?? '—',
                                consequences:
                                  'سيُحذف الجهاز نهائياً من قاعدة البيانات (مع موسّعاته وسجل MAC) ولا يمكن استرجاعه.',
                              })
                            }
                          >
                            <Trash2 size={12} />
                          </Button>
                        </PermissionGuard>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {paddingBottom > 0 && (
                <tr aria-hidden>
                  <td style={{ height: paddingBottom }} colSpan={tableColCount} />
                </tr>
              )}

              {isFetchingNextPage && (
                <tr className={MASH_EMPTY_ROW}>
                  <td colSpan={tableColCount}>جارٍ تحميل المزيد…</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DataPanel>

      <NetworkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={invalidateList}
        targetPort={selectedPort}
      />

      <NetworkImportGuideDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        portName={selectedPort?.name}
        onStartImport={() => {
          setGuideOpen(false)
          openImport()
        }}
      />

      <PortFormModal
        open={portFormOpen}
        onClose={() => setPortFormOpen(false)}
        onSuccess={(port) => {
          invalidateList()
          setViewFilter(portViewFilter(port.id))
        }}
      />

      <DeleteConfirmModal
        open={deletePortOpen}
        onClose={() => setDeletePortOpen(false)}
        onConfirm={handleDeletePortConfirm}
        recordName={selectedPort?.name ?? 'البورت'}
        isPermanent
        consequences={
          selectedPortCascadeCount > 1
            ? `حذف نهائي لـ ${selectedPort?.name} و${(selectedPortCascadeCount - 1).toLocaleString('ar-EG')} منفذاً فرعياً وجميع الراوترات المرتبطة. باقي البورتات لن تتأثر.`
            : `حذف نهائي لـ ${selectedPort?.name} وجميع الراوترات المرتبطة به. باقي البورتات لن تتأثر.`
        }
      />

      <DeleteConfirmModal
        open={wipeOpen}
        onClose={() => setWipeOpen(false)}
        onConfirm={handleWipeConfirm}
        recordName="كل بيانات الشبكة"
        isPermanent
        consequences="حذف نهائي لجميع الراوترات والموسّعات والبورتات والمتجاوَزة — لا يمكن استرجاعها."
      />

      <UnsavedChangesDialog
        open={unsavedOpen}
        saving={savingUnsaved}
        onCancel={() => {
          setUnsavedOpen(false)
          setPendingViewFilter(null)
        }}
        onDiscard={() => {
          setUnsavedOpen(false)
          setEditing(null)
          if (pendingViewFilter) setViewFilter(pendingViewFilter)
          setPendingViewFilter(null)
        }}
        onSave={async () => {
          if (!editing) return
          setSavingUnsaved(true)
          try {
            await persistEdit(editing)
            setEditing(null)
            setUnsavedOpen(false)
            if (pendingViewFilter) setViewFilter(pendingViewFilter)
            setPendingViewFilter(null)
          } catch {
            toast.error('فشل الحفظ')
          } finally {
            setSavingUnsaved(false)
          }
        }}
      />

      <RouterFormModal
        open={routerFormOpen}
        router={editRouter}
        ports={ports}
        defaultPortId={selectedPort?.id ?? null}
        onClose={() => {
          setRouterFormOpen(false)
          setEditRouter(null)
        }}
        onSuccess={() => void invalidateList()}
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
        isPermanent
        consequences={target?.consequences}
      />
    </div>
  )
}
