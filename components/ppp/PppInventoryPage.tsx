'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'
import type { PostgrestError } from '@supabase/supabase-js'
import {
  RefreshCw,
  Search,
  Plus,
  Pencil,
  Trash2,
  FileSpreadsheet,
  AlertTriangle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { usePppPlans } from '@/hooks/usePppPlans'
import { useInfiniteVirtualData } from '@/hooks/useInfiniteVirtualData'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { usePppPlanInventory } from '@/hooks/usePppPlanInventory'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataPanel } from '@/components/shared/DataPanel'
import { PppPlanFormModal } from '@/components/ppp/PppPlanFormModal'
import { PppPlanImportDialog } from '@/components/ppp/PppPlanImportDialog'
import {
  CredentialRow,
  type CredentialListItem,
  type CredentialAssignee,
} from '@/components/credentials/CredentialRow'
import { isPppPlanBelowMin, type PppPlan } from '@/lib/ppp/plans'
import { formatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import {
  parsePppViewFilter,
  planViewFilter,
  type PppViewFilter,
} from '@/lib/ppp/view'
import {
  MASH_TABLE,
  MASH_TABLE_SCROLL,
  MASH_TH,
  MASH_TH_CENTER,
  MASH_TH_INDEX,
  MASH_TH_ACTIONS,
  MASH_EMPTY_ROW,
} from '@/lib/ui/mash-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const CREDENTIAL_SELECT =
  'id, tenant_id, username, type, is_used, is_deleted, created_at, plan_id, ppp_plans(name, speed)'

type CredentialRowRaw = CredentialListItem & {
  ppp_plans?: { name: string; speed: string } | { name: string; speed: string }[] | null
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

function planNameFromRow(
  plans: CredentialRowRaw['ppp_plans'],
): string {
  if (!plans) return '—'
  if (Array.isArray(plans)) return plans[0]?.name ?? '—'
  return plans.name ?? '—'
}

export function PppInventoryPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: tenant } = useTenant()

  const { data: plans = [], isLoading: plansLoading, refetch: refetchPlans } = usePppPlans()
  const { availableByPlan, totalByPlan } = usePppPlanInventory()

  const [viewFilter, setViewFilter] = useState<PppViewFilter>('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)

  const [planModalMode, setPlanModalMode] = useState<'add' | 'edit' | null>(null)
  const [editPlan, setEditPlan] = useState<PppPlan | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addUsername, setAddUsername] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [adding, setAdding] = useState(false)

  const { open, target, openModal, closeModal } = useDeleteConfirm()

  const parsed = parsePppViewFilter(viewFilter)
  const selectedPlan =
    parsed.mode === 'plan' && parsed.planId
      ? plans.find((p) => p.id === parsed.planId) ?? null
      : null

  const planFilterId = selectedPlan?.id

  const {
    allItems: rawItems,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteVirtualData<CredentialRowRaw>('internet_credentials', ['username'], debouncedSearch, {
    filters: {
      type: 'bb',
      ...(planFilterId ? { plan_id: planFilterId } : {}),
    },
    select: CREDENTIAL_SELECT,
    orderBy: { column: 'username', ascending: true },
  })

  const { data: assigneeByCredentialId = {} } = useQuery<Record<string, CredentialAssignee>>({
    queryKey: ['credential-assignees', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return {}
      const { data, error } = await supabase
        .from('customer_credential_usage')
        .select('credential_id, customers(id, name)')
        .eq('tenant_id', tenant.id)
        .is('released_at', null)
        .eq('is_deleted', false)
      if (error) throw error
      const map: Record<string, CredentialAssignee> = {}
      for (const row of data ?? []) {
        const customersRaw = row.customers as
          | { id: string; name: string }
          | { id: string; name: string }[]
          | null
        const customer = Array.isArray(customersRaw) ? customersRaw[0] : customersRaw
        if (!customer?.id) continue
        map[row.credential_id as string] = {
          customerId: customer.id,
          customerName: customer.name,
        }
      }
      return map
    },
    enabled: !!tenant?.id,
  })

  const rows = useMemo(
    () =>
      rawItems.map((r) => ({
        ...r,
        plan_name: planNameFromRow(r.ppp_plans),
        assignee: assigneeByCredentialId[r.id] ?? null,
      })),
    [rawItems, assigneeByCredentialId],
  )

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

  const invalidateAll = useCallback(() => {
    void refetch()
    void refetchPlans()
    void queryClient.invalidateQueries({ queryKey: ['internet_credentials'] })
    void queryClient.invalidateQueries({ queryKey: ['ppp-plans'] })
    void queryClient.invalidateQueries({ queryKey: ['ppp-plan-inventory'] })
    void queryClient.invalidateQueries({ queryKey: ['ppp-batches'] })
    void queryClient.invalidateQueries({ queryKey: ['credential-assignees'] })
    void queryClient.invalidateQueries({ queryKey: ['bb-credentials-with-passwords'] })
  }, [refetch, refetchPlans, queryClient])

  const filterTabs = useMemo(
    () => [
      { id: 'all' as const, label: 'الكل' },
      ...plans.map((p) => ({
        id: planViewFilter(p.id),
        label: p.name,
        plan: p,
      })),
    ],
    [plans],
  )

  const tableColCount = parsed.mode === 'all' ? 7 : 6

  const openImport = useCallback(() => {
    if (!selectedPlan) {
      toast.error('اختر فئة من التبويبات أولاً')
      return
    }
    setImportOpen(true)
  }, [selectedPlan])

  const handleDeletePlanRequest = (row: PppPlan) => {
    const stock = totalByPlan[row.id] ?? 0
    if (stock > 0) {
      toast.error('لا يمكن حذف فئة لها usernames — يجب أن يكون المخزون صفراً.')
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

  const handleDeletePlanConfirm = async () => {
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
      throw new Error(
        msg.includes('insufficient permission')
          ? 'صلاحية غير كافية — يتطلب صلاحية «حذف السجلات».'
          : msg,
      )
    }
    toast.success('تم حذف الفئة')
    setViewFilter('all')
    invalidateAll()
  }

  const handleCredentialDeleteConfirm = async () => {
    if (!target) return
    const res = await fetch('/api/delete/hard/credential', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: target.id }),
    })
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    if (!res.ok) {
      const msg = body?.error ?? 'delete_failed'
      if (msg.includes('linked to subscription')) {
        throw new Error('السجل مرتبط باشتراك — لا يمكن حذفه.')
      }
      if (msg.includes('assigned to customer')) {
        throw new Error('السجل مُسند لمشترك — لا يمكن حذفه.')
      }
      throw new Error(msg)
    }
    toast.success('تم الحذف')
    invalidateAll()
  }

  const handleAddUsername = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenant?.id) return
    if (!selectedPlan) {
      toast.error('اختر فئة (تبويب) أولاً ثم أضف username')
      return
    }
    const username = addUsername.trim()
    const password = addPassword.trim()
    if (!username || !password) {
      toast.error('اسم المستخدم وكلمة المرور مطلوبان')
      return
    }

    setAdding(true)
    try {
      const batchNumber = `manual-${Date.now()}`
      const { error } = await supabase.rpc('receive_ppp_batch', {
        p_plan_id: selectedPlan.id,
        p_batch_number: batchNumber,
        p_notes: 'إضافة يدوية',
        p_rows: [{ username, password, type: 'bb', is_used: false }],
      })
      if (error) throw error

      toast.success('تمت الإضافة')
      setAddUsername('')
      setAddPassword('')
      setShowAddForm(false)
      invalidateAll()
    } catch (err) {
      const pgErr = err as PostgrestError
      if (pgErr.code === '23505') {
        toast.error('username مسجّل مسبقاً')
      } else {
        toast.error('فشلت الإضافة', {
          description: pgErr.message || 'خطأ غير معروف',
        })
      }
    } finally {
      setAdding(false)
    }
  }

  const virtualItems = virtualizer.getVirtualItems()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0

  const selectedAvailable = selectedPlan ? (availableByPlan[selectedPlan.id] ?? 0) : 0
  const selectedTotal = selectedPlan ? (totalByPlan[selectedPlan.id] ?? 0) : 0
  const selectedLow =
    selectedPlan &&
    isPppPlanBelowMin(selectedAvailable, selectedPlan.min_available_usernames)

  return (
    <div dir="rtl" className="space-y-4">
      <PageHeader
        title="PPP"
        description="فئات الاشتراك (الاسم · السرعة · السعر) — استورد usernames لكل فئة واربطها بالمشتركين عند التجديد (30 يوم)"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => invalidateAll()} className="gap-1.5">
              <RefreshCw size={14} />
              تحديث
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
            {selectedPlan && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setEditPlan(selectedPlan)
                    setPlanModalMode('edit')
                  }}
                >
                  <Pencil size={14} />
                  تعديل الفئة
                </Button>
                <PermissionGuard permission="delete_records">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive border-destructive/30"
                    onClick={() => handleDeletePlanRequest(selectedPlan)}
                  >
                    <Trash2 size={14} />
                    حذف الفئة
                  </Button>
                </PermissionGuard>
              </>
            )}
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                if (!selectedPlan) {
                  toast.error('اختر فئة (تبويب) أولاً ثم أضف username')
                  return
                }
                setShowAddForm((v) => !v)
              }}
            >
              <Plus size={14} />
              إضافة username
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex flex-wrap gap-1">
          {filterTabs.map((tab) => {
            const plan = 'plan' in tab ? tab.plan : null
            const available = plan ? (availableByPlan[plan.id] ?? 0) : 0
            const low =
              plan && isPppPlanBelowMin(available, plan.min_available_usernames)
            const active = viewFilter === tab.id
            return (
              <Button
                key={tab.id}
                type="button"
                size="sm"
                variant={active ? 'default' : 'outline'}
                className={cn(
                  'h-8 text-xs gap-1',
                  active && 'pointer-events-none',
                  low && !active && 'border-amber-400 bg-amber-50/50',
                )}
                onClick={() => setViewFilter(tab.id)}
              >
                {low && <AlertTriangle size={12} className={active ? '' : 'text-amber-600'} />}
                {tab.label}
                {plan && (
                  <span className={cn('opacity-70', active && 'opacity-90')}>
                    · {plan.speed}
                  </span>
                )}
              </Button>
            )
          })}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1 text-xs"
          onClick={() => setPlanModalMode('add')}
        >
          <Plus size={12} />
          فئة
        </Button>
      </div>

      {plansLoading && (
        <p className="text-sm text-muted-foreground">جارٍ تحميل الفئات…</p>
      )}

      {!plansLoading && plans.length === 0 && (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-4">
          لا توجد فئات — اضغط «+ فئة» لإنشاء فئة (مثلاً 4M بسعر 25 ش)، ثم اخترها وارفع ملف Excel.
        </p>
      )}

      {selectedPlan && (
        <div
          className={cn(
            'rounded-lg border p-3 flex flex-wrap gap-x-6 gap-y-2 text-sm',
            selectedLow
              ? 'border-amber-200 bg-amber-50/80'
              : 'border-border bg-muted/20',
          )}
        >
          <span>
            <strong className="text-foreground">الفئة:</strong> {selectedPlan.name}
          </span>
          <span>
            <strong className="text-foreground">السرعة:</strong>{' '}
            <span className="font-mono">{selectedPlan.speed}</span>
          </span>
          <span>
            <strong className="text-foreground">السعر:</strong>{' '}
            {formatMoney(selectedPlan.price)}
          </span>
          <span>
            <strong className="text-foreground">المدة:</strong> 30 يوم
          </span>
          <span className={cn(selectedLow && 'text-amber-800 font-medium')}>
            <strong className="text-foreground">المخزون:</strong> متاح {selectedAvailable} /{' '}
            {selectedTotal}
            {selectedLow && ' ⚠ مخزون منخفض'}
          </span>
        </div>
      )}

      {showAddForm && selectedPlan && (
        <form
          onSubmit={(e) => void handleAddUsername(e)}
          className="rounded-lg border border-border bg-muted/20 p-3 grid gap-3 sm:grid-cols-3 items-end"
        >
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input
              value={addUsername}
              onChange={(e) => setAddUsername(e.target.value)}
              dir="ltr"
              className="font-mono"
              disabled={adding}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input
              value={addPassword}
              onChange={(e) => setAddPassword(e.target.value)}
              dir="ltr"
              className="font-mono"
              disabled={adding}
            />
          </div>
          <Button type="submit" disabled={adding}>
            {adding ? '…' : 'حفظ'}
          </Button>
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
          placeholder="بحث username…"
          className="pr-9 font-mono"
          dir="ltr"
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
                {parsed.mode === 'all' && <th className={MASH_TH}>الفئة</th>}
                <th className={MASH_TH}>username</th>
                <th className={MASH_TH}>كلمة المرور</th>
                <th className={MASH_TH_CENTER}>الحالة</th>
                <th className={MASH_TH}>المشترك</th>
                <th className={MASH_TH_ACTIONS}>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={tableColCount} className={MASH_EMPTY_ROW}>
                    جارٍ التحميل…
                  </td>
                </tr>
              )}

              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={tableColCount} className={MASH_EMPTY_ROW}>
                    {parsed.mode === 'plan'
                      ? 'لا usernames — استورد Excel أو أضف يدوياً'
                      : 'لا usernames — اختر فئة واستورد'}
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
                return (
                  <CredentialRow
                    key={row.id}
                    row={row}
                    index={vItem.index + 1}
                    style={{ height: vItem.size }}
                    showPlanColumn={parsed.mode === 'all'}
                    onDelete={(r) =>
                      openModal({
                        id: r.id,
                        table: 'internet_credentials',
                        name: r.username,
                        permanent: true,
                        consequences: 'حذف نهائي — يُفك الربط تلقائياً للمسؤول.',
                      })
                    }
                  />
                )
              })}

              {paddingBottom > 0 && (
                <tr aria-hidden>
                  <td style={{ height: paddingBottom }} colSpan={tableColCount} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DataPanel>

      <PppPlanFormModal
        open={planModalMode !== null}
        mode={planModalMode ?? 'add'}
        plan={editPlan}
        onClose={() => {
          setPlanModalMode(null)
          setEditPlan(null)
        }}
        onSuccess={invalidateAll}
      />

      {selectedPlan && (
        <PppPlanImportDialog
          open={importOpen}
          planId={selectedPlan.id}
          planName={selectedPlan.name}
          onClose={() => setImportOpen(false)}
          onSuccess={invalidateAll}
        />
      )}

      <DeleteConfirmModal
        open={open}
        onClose={closeModal}
        onConfirm={
          target?.table === 'ppp_plans'
            ? handleDeletePlanConfirm
            : handleCredentialDeleteConfirm
        }
        recordName={target?.name ?? ''}
        consequences={target?.consequences}
        title={target?.table === 'ppp_plans' ? 'حذف نهائي للفئة' : undefined}
        confirmLabel={
          target?.table === 'ppp_plans' ? 'تأكيد الحذف النهائي' : undefined
        }
        isPermanent={target?.permanent === true}
      />
    </div>
  )
}
