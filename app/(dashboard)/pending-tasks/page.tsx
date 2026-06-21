'use client'

import { useMemo, useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { toast } from 'sonner'
import { RefreshCw, Search, Upload, CheckCircle2, Wallet, ExternalLink, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { AccountSelector } from '@/components/subscriptions/AccountSelector'
import {
  SettleCustomerDebtModal,
  type CustomerDebtTarget,
} from '@/components/debts/SettleCustomerDebtModal'
import { CreatePendingTaskModal } from '@/components/pending-tasks/CreatePendingTaskModal'
import { uploadPaymentProof, attachProofToPayment } from '@/lib/payment-proof'
import {
  fetchPendingInbox,
  inboxKindLabel,
  inboxMethodLabel,
  TASK_SCOPE_LABELS,
  type PendingInboxItem,
  type PendingInboxKind,
} from '@/lib/pending-tasks/inbox'
import { invalidateDebtQueries } from '@/lib/debts/invalidate-debt-queries'
import { formatMoney } from '@/lib/format-money'
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

type KindFilter = 'all' | PendingInboxKind

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

export default function PendingTasksPage() {
  return <PendingTasksContent />
}

function PendingTasksContent() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { data: tenant } = useTenant()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')

  const [uploadTarget, setUploadTarget] = useState<PendingInboxItem | null>(null)
  const [bankAccountId, setBankAccountId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [debtTarget, setDebtTarget] = useState<CustomerDebtTarget | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const { data: inboxData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['pending-inbox', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      return fetchPendingInbox(supabase, tenant.id)
    },
    enabled: !!tenant?.id,
  })

  const inbox = Array.isArray(inboxData) ? inboxData : []

  const filtered = useMemo(() => {
    let rows = inbox
    if (kindFilter !== 'all') {
      rows = rows.filter((r) => r.kind === kindFilter)
    }
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase()
      rows = rows.filter(
        (r) =>
          r.customer_name.toLowerCase().includes(q) ||
          r.phone.includes(q) ||
          (r.reason?.toLowerCase().includes(q) ?? false) ||
          (r.task_notes?.toLowerCase().includes(q) ?? false) ||
          (r.task_title?.toLowerCase().includes(q) ?? false),
      )
    }
    return rows
  }, [inbox, kindFilter, debouncedSearch])

  const counts = useMemo(
    () => ({
      all: inbox.length,
      task: inbox.filter((i) => i.kind === 'task').length,
      debt: inbox.filter((i) => i.kind === 'debt').length,
      transfer: inbox.filter((i) => i.kind === 'transfer').length,
    }),
    [inbox],
  )

  const invalidateAll = async () => {
    void refetch()
    await invalidateDebtQueries(queryClient)
    void queryClient.invalidateQueries({ queryKey: ['pending-inbox'] })
    void queryClient.invalidateQueries({ queryKey: ['pending-inbox-count'] })
    void queryClient.invalidateQueries({ queryKey: ['financial-overview'] })
  }

  const handleUploadProof = async (file: File) => {
    if (!uploadTarget || !tenant) return

    setUploading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Unauthorized')

      if (uploadTarget.kind === 'transfer' && uploadTarget.payment_id) {
        const proofUrl = await uploadPaymentProof(
          supabase,
          tenant.id,
          `payment/${uploadTarget.payment_id}`,
          file,
        )
        await attachProofToPayment(
          supabase,
          tenant.id,
          uploadTarget.payment_id,
          proofUrl,
          user.id,
        )
        toast.success('تم رفع إثبات التحويل')
        setUploadTarget(null)
        await invalidateAll()
        return
      }

      if (uploadTarget.kind !== 'task' || !uploadTarget.task_id) return

      if (!uploadTarget.customer_id) {
        toast.error('رفع إشعار الدفع متاح فقط لمهام المشتركين')
        return
      }

      if (!bankAccountId) {
        toast.error('يجب اختيار حساب بنكي لرفع إشعار الدفع')
        return
      }

      let paymentId = uploadTarget.related_payment_id

      if (!paymentId) {
        const { data: payment, error: payErr } = await supabase
          .from('payments')
          .insert({
            tenant_id: tenant.id,
            customer_id: uploadTarget.customer_id,
            amount: uploadTarget.amount,
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
          .eq('id', uploadTarget.task_id)

        if (linkErr) throw linkErr
      }

      const proofUrl = await uploadPaymentProof(
        supabase,
        tenant.id,
        uploadTarget.task_id,
        file,
      )
      await attachProofToPayment(supabase, tenant.id, paymentId, proofUrl, user.id)

      toast.success('تم رفع إشعار الدفع')
      setUploadTarget(null)
      setBankAccountId(null)
      await invalidateAll()
    } catch {
      toast.error('فشل رفع الإثبات. يرجى المحاولة مرة أخرى.')
    } finally {
      setUploading(false)
    }
  }

  const handleConfirmTask = async (item: PendingInboxItem) => {
    if (item.kind !== 'task' || !item.task_id) return
    if (item.requires_payment_proof && !item.has_proof) {
      toast.error('يجب رفع إشعار الدفع قبل التأكيد')
      return
    }

    setConfirmingId(item.task_id)
    try {
      const { error } = await supabase
        .from('pending_tasks')
        .update({ status: 'completed' })
        .eq('id', item.task_id)
        .in('status', ['pending', 'reminded'])

      if (error) throw error
      toast.success(item.requires_payment_proof ? 'تم تأكيد المهمة' : 'تم إنجاز المهمة')
      await invalidateAll()
    } catch {
      toast.error('فشل التأكيد. يرجى المحاولة مرة أخرى.')
    } finally {
      setConfirmingId(null)
    }
  }

  const openDebtSettle = (item: PendingInboxItem) => {
    if (item.kind !== 'debt' || !item.debt_id) return
    setDebtTarget({
      id: item.debt_id,
      customer_id: item.customer_id,
      remaining_amount: item.amount,
      reason: item.reason ?? null,
      subscription_period_id: item.subscription_period_id ?? null,
      customer_name: item.customer_name,
    })
  }

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المهام المعلقة</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filtered.length.toLocaleString('ar-EG')} بند يحتاج متابعة — مهام، ديون، وتحويلات
            بانتظار الإثبات
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            تحديث
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus size={14} />
            إضافة مهمة
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
          placeholder="بحث بالموضوع أو الهاتف…"
          className="pr-9"
          dir="rtl"
        />
      </div>

      <FilterGroup
        label="النوع"
        options={[
          ['all', `الكل (${counts.all})`],
          ['task', `مهام (${counts.task})`],
          ['debt', `ديون (${counts.debt})`],
          ['transfer', `تحويلات (${counts.transfer})`],
        ]}
        value={kindFilter}
        onChange={(v) => setKindFilter(v as KindFilter)}
      />

      <div className="overflow-auto border border-gray-200 rounded-lg bg-white max-h-[480px]">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
            <tr>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                الموضوع
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                النوع
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                المبلغ
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                التاريخ / الاستحقاق
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                الحالة
              </th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-700 border-b w-56">
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

            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted-foreground">
                  <p>لا توجد بنود تحتاج متابعة حالياً</p>
                  <p className="text-xs mt-2">
                    تظهر هنا: مهام «إشعار لاحقاً»، ديون غير مسدّدة، وتحويلات بدون إثبات
                  </p>
                </td>
              </tr>
            )}

            {filtered.map((row) => (
              <tr key={row.id} className="hover:bg-mash-page border-b border-gray-100">
                <td className="px-3 py-2">
                  {row.customer_id ? (
                    <Link
                      href={`/subscriptions/customer/${row.customer_id}`}
                      className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {row.customer_name}
                      <ExternalLink size={12} className="opacity-60" />
                    </Link>
                  ) : (
                    <span className="font-medium">{row.customer_name}</span>
                  )}
                  {row.phone && (
                    <div className="text-xs text-muted-foreground tabular-nums">{row.phone}</div>
                  )}
                  {row.task_notes && row.kind === 'task' && (
                    <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {row.task_notes}
                    </div>
                  )}
                  {row.reason && row.kind !== 'task' && (
                    <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {row.reason}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className="text-xs font-normal">
                    {inboxKindLabel(row.kind)}
                  </Badge>
                  {row.kind === 'task' && row.task_scope && (
                    <Badge variant="secondary" className="text-[10px] font-normal mr-1 mt-1">
                      {TASK_SCOPE_LABELS[row.task_scope]}
                    </Badge>
                  )}
                  {row.kind === 'transfer' && row.method && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {inboxMethodLabel(row.method)}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums font-medium">
                  {row.amount > 0 ? formatMoney(row.amount) : '—'}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {row.kind === 'task' && row.due_at ? (
                    <>
                      <span className="block text-foreground">استحقاق: {formatDateTime(row.due_at)}</span>
                    </>
                  ) : (
                    formatDateTime(row.recorded_at)
                  )}
                </td>
                <td className="px-3 py-2">
                  <Badge
                    variant={
                      row.kind === 'debt'
                        ? 'destructive'
                        : row.kind === 'transfer'
                          ? 'secondary'
                          : 'outline'
                    }
                    className="text-xs"
                  >
                    {row.status_label}
                  </Badge>
                  {row.has_proof && (
                    <span className="mr-1 text-xs text-green-600">• إثبات مرفوع</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-center gap-1 flex-wrap">
                    {row.kind === 'task' && (
                      <>
                        {row.requires_payment_proof && (
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
                        )}
                        {row.requires_payment_proof ? (
                          <PermissionGuard permission="confirm_payments">
                            <Button
                              variant="default"
                              size="sm"
                              className="h-7 px-2 text-xs gap-1"
                              disabled={!row.has_proof || confirmingId === row.task_id}
                              onClick={() => void handleConfirmTask(row)}
                            >
                              <CheckCircle2 size={12} />
                              {confirmingId === row.task_id ? '…' : 'تأكيد'}
                            </Button>
                          </PermissionGuard>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1"
                            disabled={confirmingId === row.task_id}
                            onClick={() => void handleConfirmTask(row)}
                          >
                            <CheckCircle2 size={12} />
                            {confirmingId === row.task_id ? '…' : 'إنجاز'}
                          </Button>
                        )}
                      </>
                    )}

                    {row.kind === 'debt' && (
                      <Button
                        variant="default"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => openDebtSettle(row)}
                      >
                        <Wallet size={12} />
                        تسديد
                      </Button>
                    )}

                    {row.kind === 'transfer' && (
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
                        رفع إثبات
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
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
            <DialogTitle>
              {uploadTarget?.kind === 'transfer' ? 'رفع إثبات التحويل' : 'رفع إشعار الدفع'}
            </DialogTitle>
          </DialogHeader>
          {uploadTarget && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {uploadTarget.customer_name} — {formatMoney(uploadTarget.amount)}
              </p>
              {uploadTarget.kind === 'task' && (
                <AccountSelector
                  value={bankAccountId}
                  onChange={setBankAccountId}
                  disabled={uploading || !!uploadTarget.related_payment_id}
                />
              )}
              {uploadTarget.kind === 'transfer' && uploadTarget.source_account_label && (
                <p className="text-xs text-muted-foreground">
                  الحساب الصادر: {uploadTarget.source_account_label}
                </p>
              )}
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

      <SettleCustomerDebtModal
        open={!!debtTarget}
        debt={debtTarget}
        onClose={() => setDebtTarget(null)}
        onSuccess={() => void invalidateAll()}
      />

      <CreatePendingTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => void invalidateAll()}
      />
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
