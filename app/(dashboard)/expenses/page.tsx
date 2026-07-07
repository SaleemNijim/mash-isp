'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'
import { RefreshCw, Search, Plus, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { fetchExpensesPage, summarizeExpenses } from '@/lib/expenses/fetch-expenses'
import { fetchFinancePeriodSummary } from '@/lib/finance/summary'
import type { ExpenseCategory, ExpenseMethod, ExpenseRow } from '@/lib/expenses/types'
import {
  dayEndISO,
  dayStartISO,
  monthEndISO,
  monthStartISO,
  todayDateStr,
  todayStartISO,
} from '@/lib/sales/date-range'
import { LEDGER_METHOD_LABELS } from '@/lib/payments/ledger-labels'
import { formatMoney } from '@/lib/format-money'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataPanel } from '@/components/shared/DataPanel'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { ExpenseFormModal } from '@/components/expenses/ExpenseFormModal'
import { ExpenseCategoryTab } from '@/components/expenses/ExpenseCategoryTab'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

function categoryName(row: ExpenseRow): string {
  const c = row.expense_categories
  if (!c) return '—'
  if (Array.isArray(c)) return c[0]?.name ?? '—'
  return c.name
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ExpensesPage() {
  return (
    <PermissionGuard
      permission="manage_expenses"
      fallback={
        <div dir="rtl" className="py-16 text-center text-muted-foreground">
          <p className="text-lg font-medium">المصروفات</p>
          <p className="text-sm mt-2">هذه الصفحة تتطلب صلاحية إدارة المصروفات.</p>
        </div>
      }
    >
      <ExpensesContent />
    </PermissionGuard>
  )
}

function ExpensesContent() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: tenant } = useTenant()

  const [tab, setTab] = useState<'list' | 'categories'>('list')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [methodFilter, setMethodFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ExpenseRow | null>(null)
  const [editCategoryId, setEditCategoryId] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editBeneficiary, setEditBeneficiary] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const { open, target, openModal, closeModal } = useDeleteConfirm()

  const paidFrom = dateFrom ? dayStartISO(dateFrom) : null
  const paidTo = dateTo ? dayEndISO(dateTo) : null

  const filters = useMemo(
    () => ({
      search: debouncedSearch,
      categoryId: categoryFilter === 'all' ? null : categoryFilter,
      method: methodFilter === 'all' ? null : (methodFilter as ExpenseMethod),
      paidFrom,
      paidTo,
    }),
    [debouncedSearch, categoryFilter, methodFilter, paidFrom, paidTo],
  )

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['expenses', tenant?.id, filters],
    queryFn: async ({ pageParam = 0 }) =>
      fetchExpensesPage(supabase, tenant!.id, pageParam, filters),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.rows.length, 0)
      if (last.count != null && loaded < last.count) return pages.length
      if (last.rows.length === 100) return pages.length
      return undefined
    },
    initialPageParam: 0,
    enabled: !!tenant?.id,
  })

  const expenses = useMemo(
    () => data?.pages.flatMap((p) => p.rows) ?? [],
    [data],
  )

  const { data: categories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ['expense-categories', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data: rows, error } = await supabase
        .from('expense_categories')
        .select('id, tenant_id, name, sort_order, is_system, is_deleted')
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .order('sort_order')
      if (error) throw error
      return rows ?? []
    },
    enabled: !!tenant?.id,
  })

  const todayStart = todayStartISO()
  const todayEnd = dayEndISO(todayDateStr())
  const monthStart = monthStartISO()
  const monthEnd = monthEndISO()

  const { data: todaySummary } = useQuery({
    queryKey: ['expense-summary-today', tenant?.id],
    queryFn: () => fetchFinancePeriodSummary(supabase, tenant!.id, todayStart, todayEnd),
    enabled: !!tenant?.id,
  })

  const { data: monthSummary } = useQuery({
    queryKey: ['expense-summary-month', tenant?.id],
    queryFn: () => fetchFinancePeriodSummary(supabase, tenant!.id, monthStart, monthEnd),
    enabled: !!tenant?.id,
  })

  const filteredSummary = useMemo(() => summarizeExpenses(expenses), [expenses])

  const virtualizer = useVirtualizer({
    count: expenses.length,
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

  function invalidateAll() {
    void refetch()
    void queryClient.invalidateQueries({ queryKey: ['expenses'] })
    void queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
    void queryClient.invalidateQueries({ queryKey: ['financial-overview'] })
    void queryClient.invalidateQueries({ queryKey: ['bank-accounts-active'] })
    void queryClient.invalidateQueries({ queryKey: ['expense-summary-today'] })
    void queryClient.invalidateQueries({ queryKey: ['expense-summary-month'] })
  }

  function openEdit(row: ExpenseRow) {
    setEditTarget(row)
    setEditCategoryId(row.category_id)
    setEditDescription(row.description ?? '')
    setEditBeneficiary(row.beneficiary ?? '')
    setEditNotes(row.notes ?? '')
  }

  async function handleEditSave() {
    if (!editTarget) return
    setSavingEdit(true)
    try {
      const { error } = await supabase
        .from('expenses')
        .update({
          category_id: editCategoryId,
          description: editDescription.trim() || null,
          beneficiary: editBeneficiary.trim() || null,
          notes: editNotes.trim() || null,
        })
        .eq('id', editTarget.id)
      if (error) throw error
      toast.success('تم تحديث المصروف')
      setEditTarget(null)
      invalidateAll()
    } catch {
      toast.error('فشل التحديث. يرجى المحاولة مرة أخرى.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!target) return
    try {
      const { error } = await supabase
        .from('expenses')
        .update({ is_deleted: true })
        .eq('id', target.id)
      if (error) throw error
      toast.success('تم الحذف بنجاح')
      invalidateAll()
    } catch {
      toast.error('فشل الحذف. يرجى المحاولة مرة أخرى.')
      throw new Error('delete_failed')
    }
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
        title="المصروفات"
        description="تتبع مصروفات الشركة التشغيلية — المبلغ والطريقة غير قابلين للتعديل بعد التسجيل"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => invalidateAll()} className="gap-1.5">
              <RefreshCw size={14} />
              تحديث
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
              <Plus size={14} />
              إضافة مصروف
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <DataPanel className="p-4">
          <p className="text-sm text-muted-foreground">مصروفات اليوم</p>
          <p className="text-2xl font-bold tabular-nums mt-1 text-destructive">
            {formatMoney(todaySummary?.expenseTotal ?? 0)}
          </p>
        </DataPanel>
        <DataPanel className="p-4">
          <p className="text-sm text-muted-foreground">مصروفات الشهر</p>
          <p className="text-2xl font-bold tabular-nums mt-1 text-destructive">
            {formatMoney(monthSummary?.expenseTotal ?? 0)}
          </p>
        </DataPanel>
        <DataPanel className="p-4">
          <p className="text-sm text-muted-foreground">
            إجمالي الفترة المفلترة ({filteredSummary.count} سجل)
          </p>
          <p className="text-2xl font-bold tabular-nums mt-1 text-destructive">
            {formatMoney(filteredSummary.total)}
          </p>
        </DataPanel>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'list' | 'categories')}>
        <TabsList>
          <TabsTrigger value="list">السجل</TabsTrigger>
          <TabsTrigger value="categories">الفئات</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4 space-y-4">
          <DataPanel className="p-4 space-y-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search
                  size={16}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث في الوصف، المستفيد، الملاحظات…"
                  className="pr-9"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="الفئة" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="all">كل الفئات</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={methodFilter} onValueChange={setMethodFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="الطريقة" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="all">كل الطرق</SelectItem>
                  <SelectItem value="cash">{LEDGER_METHOD_LABELS.cash}</SelectItem>
                  <SelectItem value="reflect">{LEDGER_METHOD_LABELS.reflect}</SelectItem>
                  <SelectItem value="jawwal_pay">{LEDGER_METHOD_LABELS.jawwal_pay}</SelectItem>
                  <SelectItem value="bank">{LEDGER_METHOD_LABELS.bank}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[150px]"
                title="من تاريخ"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[150px]"
                title="إلى تاريخ"
              />
            </div>
          </DataPanel>

          <DataPanel noPadding>
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-12">جارٍ التحميل…</p>
            ) : expenses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">
                لا مصروفات مطابقة للفلتر
              </p>
            ) : (
              <div ref={containerRef} className="max-h-[min(60vh,520px)] overflow-auto">
                <table className="mash-data-table w-full">
                  <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur border-b border-border">
                    <tr>
                      <th className="px-3 py-2 text-right text-xs font-semibold">التاريخ</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold">الفئة</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold">الوصف</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold">المبلغ</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold">الطريقة</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold w-24">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paddingTop > 0 && (
                      <tr>
                        <td colSpan={6} style={{ height: paddingTop }} />
                      </tr>
                    )}
                    {virtualItems.map((vRow) => {
                      const row = expenses[vRow.index]
                      return (
                        <tr key={row.id} className="hover:bg-muted/20 border-b border-border/60">
                          <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                            {formatDateTime(row.paid_at)}
                          </td>
                          <td className="px-3 py-2 text-xs">{categoryName(row)}</td>
                          <td className="px-3 py-2 text-xs max-w-[200px] truncate">
                            {row.description?.trim() || row.beneficiary?.trim() || '—'}
                          </td>
                          <td className="px-3 py-2 text-xs font-semibold tabular-nums text-destructive">
                            {formatMoney(row.amount)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              {LEDGER_METHOD_LABELS[row.method] ?? row.method}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => openEdit(row)}
                                aria-label="تعديل"
                              >
                                <Pencil size={14} />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                onClick={() =>
                                  openModal({
                                    id: row.id,
                                    table: 'expenses',
                                    name: `${row.description?.trim() || row.beneficiary?.trim() || 'مصروف'} — ${formatMoney(row.amount)}`,
                                    consequences:
                                      'سيُعاد المبلغ للحساب البنكي إن كان المصروف إلكترونياً. يمكنك الاسترجاع من سلة المحذوفات.',
                                  })
                                }
                                aria-label="حذف"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {paddingBottom > 0 && (
                      <tr>
                        <td colSpan={6} style={{ height: paddingBottom }} />
                      </tr>
                    )}
                  </tbody>
                </table>
                {isFetchingNextPage && (
                  <p className="text-xs text-muted-foreground text-center py-3">جارٍ تحميل المزيد…</p>
                )}
              </div>
            )}
          </DataPanel>
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <DataPanel className="p-4">
            <ExpenseCategoryTab />
          </DataPanel>
        </TabsContent>
      </Tabs>

      <ExpenseFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={invalidateAll}
      />

      <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل المصروف</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm space-y-1">
                <p>
                  المبلغ:{' '}
                  <span className="font-semibold tabular-nums">{formatMoney(editTarget.amount)}</span>
                </p>
                <p>
                  الطريقة:{' '}
                  <span className="font-medium">
                    {LEDGER_METHOD_LABELS[editTarget.method] ?? editTarget.method}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  لا يمكن تعديل المبلغ أو طريقة الصرف بعد التسجيل
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>الفئة</Label>
                <Select value={editCategoryId} onValueChange={setEditCategoryId} disabled={savingEdit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>الوصف</Label>
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  disabled={savingEdit}
                />
              </div>

              <div className="space-y-1.5">
                <Label>المستفيد</Label>
                <Input
                  value={editBeneficiary}
                  onChange={(e) => setEditBeneficiary(e.target.value)}
                  disabled={savingEdit}
                />
              </div>

              <div className="space-y-1.5">
                <Label>ملاحظات</Label>
                <Input
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  disabled={savingEdit}
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setEditTarget(null)} disabled={savingEdit}>
                  إلغاء
                </Button>
                <Button onClick={() => void handleEditSave()} disabled={savingEdit}>
                  {savingEdit ? 'جارٍ الحفظ…' : 'حفظ'}
                </Button>
              </DialogFooter>
            </div>
          )}
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
