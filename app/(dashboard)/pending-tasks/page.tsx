'use client'

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'
import { RefreshCw, Search, Upload, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useInfiniteVirtualData } from '@/hooks/useInfiniteVirtualData'
import { useTenant } from '@/hooks/useTenant'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { AccountSelector } from '@/components/subscriptions/AccountSelector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type TaskStatus = 'pending' | 'reminded' | 'converted_to_debt' | 'completed'

interface PendingTaskRow {
  id: string
  tenant_id: string
  customer_id: string
  related_payment_id: string | null
  amount: number | null
  due_at: string | null
  status: TaskStatus
  created_at: string
}

interface CustomerRow {
  id: string
  name: string
  phone: string | null
}

type StatusFilter = 'all' | TaskStatus

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'معلّقة',
  reminded: 'تم التذكير',
  converted_to_debt: 'تحوّلت لدين',
  completed: 'مكتملة',
}

const STATUS_VARIANT: Record<
  TaskStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'secondary',
  reminded: 'outline',
  converted_to_debt: 'destructive',
  completed: 'default',
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface EnrichedTask extends PendingTaskRow {
  customer_name: string
  phone: string
  has_proof: boolean
}

export default function PendingTasksPage() {
  return <PendingTasksContent />
}

function PendingTasksContent() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: tenant } = useTenant()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const [uploadTarget, setUploadTarget] = useState<EnrichedTask | null>(null)
  const [bankAccountId, setBankAccountId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const {
    allItems,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteVirtualData('pending_tasks', [], '')

  const tasks = allItems as PendingTaskRow[]

  const customerIds = useMemo(
    () => [...new Set(tasks.map((t) => t.customer_id))],
    [tasks],
  )

  const paymentIds = useMemo(
    () =>
      tasks
        .map((t) => t.related_payment_id)
        .filter((id): id is string => !!id),
    [tasks],
  )

  const { data: customers = [] } = useQuery<CustomerRow[]>({
    queryKey: ['pending-task-customers', customerIds.join(',')],
    queryFn: async () => {
      if (customerIds.length === 0) return []
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone')
        .in('id', customerIds)
        .eq('is_deleted', false)
      if (error) throw error
      return data ?? []
    },
    enabled: customerIds.length > 0,
  })

  const { data: proofPaymentIds = [] } = useQuery<string[]>({
    queryKey: ['payment-proofs-by-payment', paymentIds.join(',')],
    queryFn: async () => {
      if (paymentIds.length === 0) return []
      const { data, error } = await supabase
        .from('payment_proofs')
        .select('payment_id')
        .in('payment_id', paymentIds)
        .eq('is_deleted', false)
      if (error) throw error
      return (data ?? []).map((r) => r.payment_id as string)
    },
    enabled: paymentIds.length > 0,
  })

  const customerMap = useMemo(() => {
    const m = new Map<string, CustomerRow>()
    for (const c of customers) m.set(c.id, c)
    return m
  }, [customers])

  const proofSet = useMemo(() => new Set(proofPaymentIds), [proofPaymentIds])

  const enriched = useMemo<EnrichedTask[]>(() => {
    return tasks.map((t) => {
      const c = customerMap.get(t.customer_id)
      return {
        ...t,
        customer_name: c?.name ?? '—',
        phone: c?.phone ?? '',
        has_proof: t.related_payment_id
          ? proofSet.has(t.related_payment_id)
          : false,
      }
    })
  }, [tasks, customerMap, proofSet])

  const filtered = useMemo(() => {
    let rows = enriched

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase()
      rows = rows.filter(
        (r) =>
          r.customer_name.toLowerCase().includes(q) ||
          r.phone.includes(q),
      )
    }

    if (statusFilter !== 'all') {
      rows = rows.filter((r) => r.status === statusFilter)
    }

    return rows
  }, [enriched, debouncedSearch, statusFilter])

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 56,
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
    void queryClient.invalidateQueries({ queryKey: ['pending_tasks'] })
    void queryClient.invalidateQueries({ queryKey: ['pending-tasks-count'] })
    void queryClient.invalidateQueries({ queryKey: ['payment-proofs-by-payment'] })
  }

  const handleUploadProof = async (file: File) => {
    if (!uploadTarget || !tenant) return

    if (!bankAccountId) {
      toast.error('يجب اختيار حساب بنكي لرفع إشعار الدفع')
      return
    }

    setUploading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Unauthorized')

      let paymentId = uploadTarget.related_payment_id

      if (!paymentId) {
        const { data: payment, error: payErr } = await supabase
          .from('payments')
          .insert({
            tenant_id: tenant.id,
            customer_id: uploadTarget.customer_id,
            amount: uploadTarget.amount ?? 0,
            method: 'bank',
            bank_account_id: bankAccountId,
          })
          .select('id')
          .single()

        if (payErr) throw payErr
        paymentId = payment.id

        const { error: linkErr } = await supabase
          .from('pending_tasks')
          .update({ related_payment_id: paymentId })
          .eq('id', uploadTarget.id)

        if (linkErr) throw linkErr
      }

      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${tenant.id}/${uploadTarget.id}/${Date.now()}.${ext}`

      const { error: storageErr } = await supabase.storage
        .from('payment_proofs')
        .upload(path, file, { upsert: false })

      if (storageErr) throw storageErr

      const { data: urlData } = supabase.storage
        .from('payment_proofs')
        .getPublicUrl(path)

      const { error: proofErr } = await supabase.from('payment_proofs').insert({
        tenant_id: tenant.id,
        payment_id: paymentId,
        proof_url: urlData.publicUrl,
        uploaded_by: user.id,
      })

      if (proofErr) throw proofErr

      toast.success('تم رفع إشعار الدفع')
      setUploadTarget(null)
      setBankAccountId(null)
      invalidateAll()
    } catch {
      toast.error('فشل رفع إشعار الدفع. يرجى المحاولة مرة أخرى.')
    } finally {
      setUploading(false)
    }
  }

  const handleConfirm = async (task: EnrichedTask) => {
    if (task.status === 'completed' || task.status === 'converted_to_debt') return
    if (!task.has_proof) {
      toast.error('يجب رفع إشعار الدفع قبل التأكيد')
      return
    }

    setConfirmingId(task.id)
    try {
      const { error } = await supabase
        .from('pending_tasks')
        .update({ status: 'completed' })
        .eq('id', task.id)
        .in('status', ['pending', 'reminded'])

      if (error) throw error

      toast.success('تم تأكيد المهمة')
      invalidateAll()
    } catch {
      toast.error('فشل التأكيد. يرجى المحاولة مرة أخرى.')
    } finally {
      setConfirmingId(null)
    }
  }

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0
      ? totalSize - virtualItems[virtualItems.length - 1].end
      : 0

  const canAct = (status: TaskStatus) =>
    status === 'pending' || status === 'reminded'

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المهام المعلقة</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filtered.length.toLocaleString('ar-EG')} مهمة
            {hasNextPage ? ' (المزيد متاح)' : ''}
          </p>
        </div>
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

      <div className="relative max-w-md">
        <Search
          size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالعميل أو الهاتف…"
          className="pr-9"
          dir="rtl"
        />
      </div>

      <FilterGroup
        label="الحالة"
        options={[
          ['all', 'الكل'],
          ['pending', 'معلّقة'],
          ['reminded', 'تم التذكير'],
          ['converted_to_debt', 'تحوّلت لدين'],
          ['completed', 'مكتملة'],
        ]}
        value={statusFilter}
        onChange={(v) => setStatusFilter(v as StatusFilter)}
      />

      <div
        ref={containerRef}
        className="overflow-auto border border-gray-200 rounded-lg bg-white"
        style={{ height: 'calc(100vh - 320px)', minHeight: 360 }}
      >
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
            <tr>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                العميل
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                المبلغ
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                الاستحقاق
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                الحالة
              </th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-700 border-b w-52">
                إجراءات
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-muted-foreground">
                  جارٍ التحميل…
                </td>
              </tr>
            )}

            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-muted-foreground">
                  لا توجد مهام مطابقة
                </td>
              </tr>
            )}

            {paddingTop > 0 && (
              <tr aria-hidden>
                <td style={{ height: paddingTop }} colSpan={5} />
              </tr>
            )}

            {virtualItems.map((vItem) => {
              const row = filtered[vItem.index]
              if (!row) return null
              return (
                <tr
                  key={row.id}
                  style={{ height: vItem.size }}
                  className="hover:bg-mash-page border-b border-gray-100"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{row.customer_name}</div>
                    {row.phone && (
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {row.phone}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.amount != null
                      ? `${Number(row.amount).toLocaleString('ar-EG')} ج.م`
                      : '—'}
                  </td>
                  <td className="px-3 py-2">{formatDateTime(row.due_at)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={STATUS_VARIANT[row.status]}>
                      {STATUS_LABELS[row.status]}
                    </Badge>
                    {row.has_proof && (
                      <span className="mr-1 text-xs text-green-600">• إشعار مرفوع</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      {canAct(row.status) && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => {
                              setUploadTarget(row)
                              setBankAccountId(null)
                            }}
                          >
                            <Upload size={12} />
                            رفع إشعار
                          </Button>
                          <PermissionGuard permission="confirm_payments">
                            <Button
                              variant="default"
                              size="sm"
                              className="h-7 px-2 text-xs gap-1"
                              disabled={!row.has_proof || confirmingId === row.id}
                              onClick={() => void handleConfirm(row)}
                            >
                              <CheckCircle2 size={12} />
                              {confirmingId === row.id ? '…' : 'تأكيد'}
                            </Button>
                          </PermissionGuard>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}

            {paddingBottom > 0 && (
              <tr aria-hidden>
                <td style={{ height: paddingBottom }} colSpan={5} />
              </tr>
            )}

            {isFetchingNextPage && (
              <tr>
                <td colSpan={5} className="py-3 text-center text-xs text-muted-foreground">
                  جارٍ تحميل المزيد…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={!!uploadTarget}
        onOpenChange={(v) => {
          if (!uploading && !v) {
            setUploadTarget(null)
            setBankAccountId(null)
          }
        }}
      >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>رفع إشعار الدفع</DialogTitle>
          </DialogHeader>
          {uploadTarget && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {uploadTarget.customer_name} —{' '}
                {uploadTarget.amount != null
                  ? `${Number(uploadTarget.amount).toLocaleString('ar-EG')} ج.م`
                  : '—'}
              </p>
              <AccountSelector
                value={bankAccountId}
                onChange={setBankAccountId}
                disabled={uploading}
              />
              <Input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleUploadProof(file)
                  e.target.value = ''
                }}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUploadTarget(null)
                setBankAccountId(null)
              }}
              disabled={uploading}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: [string, string][]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-muted-foreground ml-1">{label}:</span>
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
