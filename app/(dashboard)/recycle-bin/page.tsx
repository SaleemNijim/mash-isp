'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { RefreshCw, RotateCcw, Trash2, ShieldAlert, Clock, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface DeletedRecord {
  table_name: string
  table_label: string
  group_kind: 'financial' | 'safe'
  record_id: string
  label: string
  deleted_at: string
  purge_at: string | null
}

interface DeleteTarget {
  table: string
  id: string
  label: string
}

function daysLeft(purgeAt: string | null): number | null {
  if (!purgeAt) return null
  const diff = new Date(purgeAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / 86_400_000))
}

function mapRecycleBinError(message: string): string {
  if (message.includes('insufficient permission')) {
    return 'ليس لديك صلاحية الحذف النهائي'
  }
  if (message.includes('record not found')) {
    return 'السجل غير موجود أو لا يمكن الوصول إليه'
  }
  if (message.includes('product_has_distributor_sales') ||
    message.includes('product_has_retail_sales')
  ) {
    return 'لا يمكن الحذف — المنتج مُستخدم في مبيعات سابقة. يمكنك الاسترجاع فقط.'
  }
  if (message.includes('distributor_has_balance')) {
    return 'لا يمكن الإخفاء — الموزع عليه رصيد مستحق. سدّد الرصيد أولاً أو اختر الحذف النهائي مع البيانات.'
  }
  if (message.includes('plan still has batches')) {
    return 'لا يمكن الحذف — احذف دفعات PPP المرتبطة من السلة أولاً.'
  }
  if (message.includes('plan still has usernames')) {
    return 'لا يمكن الحذف — الفئة ما زالت تحتوي usernames.'
  }
  if (message.includes('batch still has usernames')) {
    return 'لا يمكن الحذف — الدفعة ما زالت تحتوي usernames.'
  }
  if (
    message.includes('foreign key') ||
    message.includes('violates') ||
    message.includes('23503')
  ) {
    return 'لا يمكن الحذف — توجد سجلات مرتبطة. احذف السجلات الفرعية أولاً أو استخدم الاسترجاع.'
  }
  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return 'تعذّر الاتصال بالخادم أثناء الحذف — حدّث الصفحة وحاول مجدداً'
  }
  return message
}

function purgeConsequences(table: string | undefined): string {
  switch (table) {
    case 'distributors':
      return 'سيُحذف الموزع وجميع مبيعاته ودفعات الاستلام نهائياً ولا يمكن استرجاعها.'
    case 'card_products':
      return 'سيُحذف المنتج وبنود المخزون المرتبطة به نهائياً. إن وُجدت مبيعات سابقة بهذا المنتج فلن يُسمح بالحذف.'
    case 'card_batches':
      return 'سيُحذفت الدفعة وبنودها نهائياً ولا يمكن استرجاعها.'
    case 'ppp_plans':
      return 'سيُحذفت فئة PPP نهائياً بعد التأكد من عدم وجود دفعات أو usernames مرتبطة.'
    case 'ppp_batches':
      return 'سيُحذفت دفعة PPP نهائياً بعد التأكد من عدم وجود usernames مرتبطة.'
    case 'customers':
      return 'سيُحذف المشترك وجميع سجلاته المرتبطة (اشتراكات، دفعات، ديون) نهائياً ولا يمكن استرجاعها.'
    default:
      return 'سيُحذف السجل نهائياً ولا يمكن استرجاعه.'
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function RecycleBinPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [purgeTarget, setPurgeTarget] = useState<DeleteTarget | null>(null)
  const [purgeAllOpen, setPurgeAllOpen] = useState(false)
  const [tab, setTab] = useState<'safe' | 'financial'>('safe')

  const {
    data: records = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery<DeletedRecord[]>({
    queryKey: ['recycle-bin'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_deleted_records')
      if (error) throw error
      return (data ?? []) as DeletedRecord[]
    },
  })

  const safeRecords = useMemo(
    () => records.filter((r) => r.group_kind === 'safe'),
    [records],
  )
  const financialRecords = useMemo(
    () => records.filter((r) => r.group_kind === 'financial'),
    [records],
  )

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['recycle-bin'] })
    void refetch()
  }

  const handleRestore = async (r: DeletedRecord) => {
    setBusyId(r.record_id)
    try {
      const { error } = await supabase.rpc('restore_record', {
        p_table: r.table_name,
        p_id: r.record_id,
      })
      if (error) throw error
      toast.success('تم الاسترجاع')
      invalidate()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      toast.error(mapRecycleBinError(msg) || 'فشل الاسترجاع')
    } finally {
      setBusyId(null)
    }
  }

  const handlePurge = async () => {
    if (!purgeTarget) return
    const { error } = await supabase.rpc('hard_delete_record', {
      p_table: purgeTarget.table,
      p_id: purgeTarget.id,
    })
    if (error) throw new Error(mapRecycleBinError(error.message))
    toast.success('تم الحذف نهائياً')
    invalidate()
  }

  const handlePurgeAll = async () => {
    const { data, error } = await supabase.rpc('hard_delete_all_recycle_bin')
    if (error) throw new Error(mapRecycleBinError(error.message))
    const total = typeof data === 'number' ? data : 0
    toast.success(
      total > 0
        ? `تم حذف ${total.toLocaleString('ar-EG')} سجل آمن نهائياً`
        : 'لا توجد بيانات آمنة للحذف',
    )
    invalidate()
  }

  const renderGroups = (items: DeletedRecord[], emptyText: string) => {
    if (items.length === 0) {
      return (
        <div className="rounded-lg border border-mash-border bg-mash-surface py-16 text-center">
          <Trash2 className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">{emptyText}</p>
        </div>
      )
    }

    const groups = new Map<string, DeletedRecord[]>()
    for (const r of items) {
      const arr = groups.get(r.table_label) ?? []
      arr.push(r)
      groups.set(r.table_label, arr)
    }

    return (
      <div className="space-y-4">
        {Array.from(groups.entries()).map(([label, groupItems]) => {
          const isFinancial = groupItems[0]?.group_kind === 'financial'
          return (
            <div
              key={label}
              className="rounded-lg border border-mash-border bg-mash-surface overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2 border-b border-mash-border bg-mash-page/50 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground">{label}</h2>
                  <Badge variant="secondary" className="text-[10px] h-5">
                    {groupItems.length.toLocaleString('ar-EG')}
                  </Badge>
                </div>
                {isFinancial ? (
                  <span className="flex items-center gap-1 text-[11px] text-amber-700">
                    <ShieldAlert size={13} />
                    للاسترجاع أو الحذف اليدوي — لا حذف تلقائي
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock size={13} />
                    حذف تلقائي بعد 30 يوماً
                  </span>
                )}
              </div>

              <ul className="divide-y divide-mash-border/70">
                {groupItems.map((r) => {
                  const left = daysLeft(r.purge_at)
                  const busy = busyId === r.record_id
                  return (
                    <li
                      key={`${r.table_name}-${r.record_id}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-mash-page/40"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {r.label || '—'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          حُذف في {formatDate(r.deleted_at)}
                          {left != null && (
                            <span
                              className={cn(
                                'mr-2',
                                left <= 3 ? 'text-destructive font-medium' : '',
                              )}
                            >
                              · يُحذف نهائياً خلال {left.toLocaleString('ar-EG')} يوم
                            </span>
                          )}
                        </p>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        disabled={busy}
                        onClick={() => void handleRestore(r)}
                      >
                        {busy ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <RotateCcw size={13} />
                        )}
                        استرجاع
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-xs text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() =>
                          setPurgeTarget({
                            table: r.table_name,
                            id: r.record_id,
                            label: r.label,
                          })
                        }
                      >
                        <Trash2 size={13} />
                        حذف نهائي
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div dir="rtl" className="space-y-4">
      <PageHeader
        title="سلة المحذوفات"
        description="استرجع البيانات المحذوفة، أو احذفها نهائياً. تُحذف البيانات الآمنة تلقائياً بعد 30 يوماً، أما المالية فبالحذف اليدوي فقط."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
              تحديث
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              disabled={isLoading || safeRecords.length === 0}
              onClick={() => setPurgeAllOpen(true)}
            >
              <Trash2 size={14} />
              حذف كل الآمن
            </Button>
          </div>
        }
      />

      {isLoading && (
        <div className="rounded-lg border border-mash-border bg-mash-surface py-12 text-center text-sm text-muted-foreground">
          جارٍ التحميل…
        </div>
      )}

      {!isLoading && (
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as 'safe' | 'financial')}
          className="w-full"
        >
          <TabsList>
            <TabsTrigger value="safe" className="gap-1.5">
              <Clock size={14} />
              بيانات آمنة
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {safeRecords.length.toLocaleString('ar-EG')}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="financial" className="gap-1.5">
              <ShieldAlert size={14} />
              بيانات مالية
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {financialRecords.length.toLocaleString('ar-EG')}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="safe" className="mt-4">
            {renderGroups(safeRecords, 'لا توجد بيانات آمنة محذوفة')}
          </TabsContent>

          <TabsContent value="financial" className="mt-4">
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200/80 bg-amber-50/70 px-4 py-2.5 text-xs text-amber-800">
              <ShieldAlert size={15} className="mt-0.5 shrink-0" />
              <p className="leading-relaxed">
                البيانات المالية لا تُحذف تلقائياً ولا تدخل ضمن «حذف كل الآمن».
                للحذف النهائي احذف كل سجل يدوياً، مع مراعاة حذف السجلات المرتبطة
                (مثل الديون) قبل فترات الاشتراك.
              </p>
            </div>
            {renderGroups(financialRecords, 'لا توجد بيانات مالية محذوفة')}
          </TabsContent>
        </Tabs>
      )}

      <DeleteConfirmModal
        open={!!purgeTarget}
        onClose={() => setPurgeTarget(null)}
        onConfirm={handlePurge}
        recordName={purgeTarget?.label ?? ''}
        isPermanent
        consequences={purgeConsequences(purgeTarget?.table)}
      />

      <DeleteConfirmModal
        open={purgeAllOpen}
        onClose={() => setPurgeAllOpen(false)}
        onConfirm={handlePurgeAll}
        recordName={`كل البيانات الآمنة (${safeRecords.length.toLocaleString('ar-EG')} سجل)`}
        isPermanent
        consequences="سيُحذف كل ما في تبويب «البيانات الآمنة» نهائياً (الفئات، البطاقات، المهام). البيانات المالية لن تتأثر وتبقى للحذف اليدوي."
      />
    </div>
  )
}
