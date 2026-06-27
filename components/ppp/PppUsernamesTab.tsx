'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'
import { RefreshCw, Search, Plus, Trash2 } from 'lucide-react'
import type { PostgrestError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useInfiniteVirtualData } from '@/hooks/useInfiniteVirtualData'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { useTenant } from '@/hooks/useTenant'
import { usePppBatches } from '@/hooks/usePppBatches'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { DataPanel } from '@/components/shared/DataPanel'
import {
  CredentialRow,
  type CredentialListItem,
  type CredentialAssignee,
} from '@/components/credentials/CredentialRow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { isValidPlanView } from '@/lib/ppp/view'
import type { PppBatchRow } from '@/lib/ppp/types'

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

function mapDeleteError(message: string): string {
  if (message.includes('insufficient permission')) {
    return 'صلاحية غير كافية — يتطلب دور مسؤول أو صلاحية «حذف السجلات».'
  }
  if (message.includes('linked to subscription')) {
    return 'السجل مرتبط باشتراك نشط — لا يمكن حذفه.'
  }
  if (message.includes('assigned to customer')) {
    return 'السجل مُسند لمشترك — لا يمكن حذفه.'
  }
  if (message.includes('batch_id required') || message.includes('batch not found')) {
    return 'اختر دفعة صحيحة.'
  }
  return message
}

interface PppUsernamesTabProps {
  batchId: string | null
  onBatchChange: (batchId: string | null) => void
}

export function PppUsernamesTab({ batchId, onBatchChange }: PppUsernamesTabProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: tenant } = useTenant()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addUsername, setAddUsername] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [adding, setAdding] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  const { data: batches = [] } = usePppBatches()
  const selectedBatch = useMemo(
    () => (batchId ? batches.find((b) => b.id === batchId) ?? null : null),
    [batches, batchId],
  )

  const batchQueryEnabled = isValidPlanView(batchId ?? undefined)

  const { open, target, openModal, closeModal } = useDeleteConfirm()

  const {
    allItems: rawItems,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteVirtualData('internet_credentials', ['username'], debouncedSearch, {
    filters: batchId ? { type: 'bb', batch_id: batchId } : undefined,
    enabled: batchQueryEnabled,
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
        const customer = row.customers as { id: string; name: string } | null
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
      (rawItems as CredentialListItem[]).map((r) => ({
        ...r,
        assignee: assigneeByCredentialId[r.id] ?? null,
      })),
    [rawItems, assigneeByCredentialId],
  )

  useEffect(() => {
    if (batchId && batches.some((b) => b.id === batchId)) return
    if (batches.length > 0) onBatchChange(batches[0].id)
  }, [batchId, batches, onBatchChange])

  const virtualizer = useVirtualizer({
    count: rows.length,
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
    void queryClient.invalidateQueries({ queryKey: ['internet_credentials'] })
    void queryClient.invalidateQueries({ queryKey: ['ppp-batch-summaries'] })
    void queryClient.invalidateQueries({ queryKey: ['ppp-plan-inventory'] })
    void queryClient.invalidateQueries({ queryKey: ['credential-assignees'] })
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenant?.id || !selectedBatch) return
    const username = addUsername.trim()
    const password = addPassword.trim()
    if (!username || !password) {
      toast.error('اسم المستخدم وكلمة المرور مطلوبان')
      return
    }

    setAdding(true)
    try {
      const { data: inserted, error } = await supabase
        .from('internet_credentials')
        .insert({
          tenant_id: tenant.id,
          username,
          type: 'bb',
          plan_id: selectedBatch.plan_id,
          batch_id: selectedBatch.id,
        })
        .select('id')
        .single()
      if (error) throw error

      const { error: pwError } = await supabase.rpc('set_credential_password', {
        p_credential_id: inserted.id,
        p_password: password,
      })
      if (pwError) throw pwError

      toast.success('تمت الإضافة')
      setAddUsername('')
      setAddPassword('')
      setShowAddForm(false)
      invalidateAll()
    } catch (err) {
      const pgErr = err as PostgrestError
      toast.error(pgErr.code === '23505' ? 'username مسجّل مسبقاً' : 'فشلت الإضافة')
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!target) return
    const res = await fetch('/api/delete/hard/credential', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: target.id }),
    })
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    if (!res.ok) throw new Error(mapDeleteError(body?.error ?? 'delete_failed'))
    toast.success('تم الحذف')
    invalidateAll()
  }

  const handleBulkDeleteConfirm = async () => {
    if (!batchId) throw new Error('no_batch')
    const res = await fetch('/api/delete/hard/credentials/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch_id: batchId }),
    })
    const body = (await res.json().catch(() => null)) as {
      error?: string
      deleted?: number
      skipped?: number
    } | null
    if (!res.ok) throw new Error(mapDeleteError(body?.error ?? 'bulk_delete_failed'))
    const deleted = body?.deleted ?? 0
    const skipped = body?.skipped ?? 0
    if (deleted === 0 && skipped > 0) {
      toast.error(`لم يُحذف أي سجل — ${skipped} مرتبط`)
    } else {
      toast.success(`تم حذف ${deleted} username`)
    }
    invalidateAll()
  }

  function batchLabel(b: PppBatchRow): string {
    const raw = b.ppp_plans
    const plan = Array.isArray(raw) ? raw[0] : raw
    const planPart = plan ? plan.name : ''
    return `${b.batch_number}${planPart ? ` · ${planPart}` : ''}`
  }

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0

  return (
    <DataPanel
      title="usernames"
      description="عرض usernames دفعة واحدة — مخزون معزول لكل دفعة"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
            <RefreshCw size={14} />
            تحديث
          </Button>
          <PermissionGuard permission="delete_records">
            <Button
              variant="outline"
              size="sm"
              disabled={!batchId}
              onClick={() => setBulkDeleteOpen(true)}
              className="gap-1.5 text-destructive border-destructive/30"
            >
              <Trash2 size={14} />
              حذف الدفعة
            </Button>
          </PermissionGuard>
          <Button
            variant="outline"
            size="sm"
            disabled={!batchId}
            onClick={() => setShowAddForm((v) => !v)}
            className="gap-1.5"
          >
            <Plus size={14} />
            إضافة
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-3 mb-3">
        <div className="min-w-[240px] flex-1 max-w-md space-y-1.5">
          <Label>الدفعة</Label>
          <Select
            value={batchId ?? undefined}
            onValueChange={(v) => onBatchChange(v)}
          >
            <SelectTrigger><SelectValue placeholder="اختر الدفعة" /></SelectTrigger>
            <SelectContent dir="rtl">
              {batches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{batchLabel(b)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="relative min-w-[200px] flex-1 max-w-md">
          <Label className="mb-1.5 block">بحث</Label>
          <Search size={16} className="absolute right-3 top-[34px] text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="username…"
            className="pr-9"
            dir="ltr"
          />
        </div>
      </div>

      {showAddForm && selectedBatch && (
        <form
          onSubmit={(e) => void handleAdd(e)}
          className="mb-3 rounded-lg border border-border bg-muted/20 p-3 grid gap-3 sm:grid-cols-3 items-end"
        >
          <div className="space-y-1.5 sm:col-span-3">
            <p className="text-xs text-muted-foreground">
              إضافة إلى دفعة: <strong>{selectedBatch.batch_number}</strong>
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input value={addUsername} onChange={(e) => setAddUsername(e.target.value)} dir="ltr" className="font-mono" disabled={adding} />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input value={addPassword} onChange={(e) => setAddPassword(e.target.value)} dir="ltr" className="font-mono" disabled={adding} />
          </div>
          <Button type="submit" disabled={adding}>{adding ? '…' : 'حفظ'}</Button>
        </form>
      )}

      <div
        ref={containerRef}
        className="mash-table-scroll border border-border rounded-lg bg-card"
        style={{ height: 400 }}
      >
        <table className="mash-data-table">
          <thead>
            <tr>
              <th>username</th>
              <th>كلمة المرور</th>
              <th>الحالة</th>
              <th>المشترك</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {!batchQueryEnabled && (
              <tr><td colSpan={5} className="py-12 text-center text-amber-700">اختر دفعة أو استلم دفعة من تبويب «الدفعات»</td></tr>
            )}
            {batchQueryEnabled && isLoading && (
              <tr><td colSpan={5} className="py-12 text-center text-muted-foreground">جارٍ التحميل…</td></tr>
            )}
            {batchQueryEnabled && !isLoading && rows.length === 0 && (
              <tr><td colSpan={5} className="py-12 text-center text-muted-foreground">لا usernames في هذه الدفعة</td></tr>
            )}
            {paddingTop > 0 && <tr aria-hidden><td style={{ height: paddingTop }} colSpan={5} /></tr>}
            {virtualItems.map((vItem) => {
              const row = rows[vItem.index]
              if (!row) return null
              return (
                <CredentialRow
                  key={row.id}
                  row={row}
                  style={{ height: vItem.size }}
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
            {paddingBottom > 0 && <tr aria-hidden><td style={{ height: paddingBottom }} colSpan={5} /></tr>}
          </tbody>
        </table>
      </div>

      <DeleteConfirmModal
        open={open}
        onClose={closeModal}
        onConfirm={handleDeleteConfirm}
        recordName={target?.name ?? ''}
        consequences={target?.consequences}
        isPermanent={target?.permanent === true}
      />

      <DeleteConfirmModal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDeleteConfirm}
        title="حذف usernames الدفعة"
        recordName={selectedBatch?.batch_number ?? 'الدفعة'}
        confirmKeyword="حذف الدفعة"
        isPermanent
        consequences="حذف نهائي لكل username في هذه الدفعة فقط."
      />
    </DataPanel>
  )
}
