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
import { RefreshCw, Search, Plus, Pencil, Trash2 } from 'lucide-react'
import type { PostgrestError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useInfiniteVirtualData } from '@/hooks/useInfiniteVirtualData'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { useTenant } from '@/hooks/useTenant'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { BankAccountLedgerPanel } from '@/components/bank-accounts/BankAccountLedgerPanel'
import { DataPanel } from '@/components/shared/DataPanel'
import { fetchFinancialOverview } from '@/lib/payments/account-ledger'
import { formatMoney } from '@/lib/format-money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
interface BankAccount {
  id: string
  tenant_id: string
  bank_name: string
  account_name: string | null
  account_number: string | null
  current_total: number
}

interface AccountForm {
  bank_name: string
  account_name: string
  account_number: string
}

const emptyForm = (): AccountForm => ({
  bank_name: '',
  account_name: '',
  account_number: '',
})

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

function parseForm(form: AccountForm) {
  return {
    bank_name: form.bank_name.trim(),
    account_name: form.account_name.trim() || null,
    account_number: form.account_number.trim() || null,
  }
}

function formFromAccount(a: BankAccount): AccountForm {
  return {
    bank_name: a.bank_name,
    account_name: a.account_name ?? '',
    account_number: a.account_number ?? '',
  }
}

export default function BankAccountsPage() {
  return (
    <PermissionGuard
      permission="manage_bank_accounts"
      fallback={
        <div dir="rtl" className="py-16 text-center text-muted-foreground">
          <p className="text-lg font-medium">إدارة الحسابات البنكية</p>
          <p className="text-sm mt-2">هذه الصفحة متاحة للمسؤولين فقط.</p>
        </div>
      }
    >
      <BankAccountsContent />
    </PermissionGuard>
  )
}

function BankAccountsContent() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: tenant } = useTenant()
  const [ledgerAccount, setLedgerAccount] = useState<BankAccount | null>(null)

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<AccountForm>(emptyForm)
  const [adding, setAdding] = useState(false)

  const [editTarget, setEditTarget] = useState<BankAccount | null>(null)
  const [editForm, setEditForm] = useState<AccountForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  const { open, target, openModal, closeModal } = useDeleteConfirm()

  const {
    allItems,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteVirtualData<BankAccount>(
    'company_bank_accounts',
    ['bank_name', 'account_name', 'account_number'],
    debouncedSearch,
  )

  const accounts = allItems

  const accountIds = useMemo(() => accounts.map((a) => a.id), [accounts])

  const { data: paymentTotals = {} } = useQuery<Record<string, number>>({
    queryKey: ['bank-account-payment-totals', accountIds.join(',')],
    queryFn: async () => {
      if (accountIds.length === 0) return {}
      const { data, error } = await supabase
        .from('payments')
        .select('bank_account_id, amount')
        .in('bank_account_id', accountIds)
        .eq('is_deleted', false)
        .not('method', 'in', '("cash","debt")')

      if (error) throw error

      const totals: Record<string, number> = {}
      for (const row of data ?? []) {
        const id = row.bank_account_id as string
        totals[id] = (totals[id] ?? 0) + Number(row.amount)
      }
      return totals
    },
    enabled: accountIds.length > 0,
  })

  const { data: overview, refetch: refetchOverview } = useQuery({
    queryKey: ['financial-overview', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null
      return fetchFinancialOverview(supabase, tenant.id)
    },
    enabled: !!tenant?.id,
  })

  const virtualizer = useVirtualizer({
    count: accounts.length,
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

  const invalidateAll = () => {
    void refetch()
    void refetchOverview()
    void queryClient.invalidateQueries({ queryKey: ['company_bank_accounts'] })
    void queryClient.invalidateQueries({ queryKey: ['bank-accounts-active'] })
    void queryClient.invalidateQueries({ queryKey: ['bank-account-payment-totals'] })
    void queryClient.invalidateQueries({ queryKey: ['financial-overview'] })
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenant?.id) return

    const parsed = parseForm(addForm)
    if (!parsed.bank_name) {
      toast.error('اسم البنك مطلوب')
      return
    }

    setAdding(true)
    try {
      const { error } = await supabase.from('company_bank_accounts').insert({
        tenant_id: tenant.id,
        bank_name: parsed.bank_name,
        account_name: parsed.account_name,
        account_number: parsed.account_number,
        current_total: 0,
      })
      if (error) throw error

      toast.success('تمت إضافة الحساب')
      setAddForm(emptyForm())
      setShowAddForm(false)
      invalidateAll()
    } catch {
      toast.error('فشلت الإضافة. يرجى المحاولة مرة أخرى.')
    } finally {
      setAdding(false)
    }
  }

  const openEdit = (row: BankAccount) => {
    setEditTarget(row)
    setEditForm(formFromAccount(row))
  }

  const handleEditSave = async () => {
    if (!editTarget) return

    const parsed = parseForm(editForm)
    if (!parsed.bank_name) {
      toast.error('اسم البنك مطلوب')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('company_bank_accounts')
        .update({
          bank_name: parsed.bank_name,
          account_name: parsed.account_name,
          account_number: parsed.account_number,
        })
        .eq('id', editTarget.id)

      if (error) throw error

      toast.success('تم تحديث الحساب')
      setEditTarget(null)
      invalidateAll()
    } catch (err) {
      const pgErr = err as PostgrestError
      toast.error(pgErr.message || 'فشل التحديث.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!target) return
    const { error } = await supabase
      .from('company_bank_accounts')
      .update({ is_deleted: true })
      .eq('id', target.id)
    if (error) throw new Error('delete_failed')
    toast.success('تم الحذف بنجاح')
    invalidateAll()
  }

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0
      ? totalSize - virtualItems[virtualItems.length - 1].end
      : 0

  const grandTotal = useMemo(
    () => Object.values(paymentTotals).reduce((s, v) => s + v, 0),
    [paymentTotals],
  )

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mash-page-title">الحسابات البنكية</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {accounts.length.toLocaleString('ar-EG')} حساب — إجمالي التحويلات البنكية:{' '}
            <strong>{formatMoney(overview?.bankInflowTotal ?? grandTotal)}</strong>
            {' — '}
            <span className="text-xs">اضغط على أي حساب لعرض تحويلاته</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void refetch()
              void refetchOverview()
            }}
            className="gap-1.5"
          >
            <RefreshCw size={14} />
            تحديث
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm((v) => !v)}
            className="gap-1.5"
          >
            <Plus size={14} />
            حساب جديد
          </Button>
        </div>
      </div>

      {overview && (
        <div className="grid gap-4 sm:grid-cols-3">
          <DataPanel className="p-4">
            <p className="text-sm text-muted-foreground">إجمالي النقدي</p>
            <p className="text-2xl font-bold tabular-nums mt-1 text-mash-success-text">
              {formatMoney(overview.cashTotal)}
            </p>
          </DataPanel>
          <DataPanel className="p-4">
            <p className="text-sm text-muted-foreground">إجمالي الديون (مشتركون + موزعون)</p>
            <p className="text-2xl font-bold tabular-nums mt-1 text-destructive">
              {formatMoney(overview.debtTotal)}
            </p>
          </DataPanel>
          <DataPanel className="p-4">
            <p className="text-sm text-muted-foreground">تحويلات بنكية مسجّلة</p>
            <p className="text-2xl font-bold tabular-nums mt-1">
              {formatMoney(overview.bankInflowTotal)}
            </p>
          </DataPanel>
        </div>
      )}

      {showAddForm && (
        <form
          onSubmit={handleAdd}
          className="border border-border rounded-lg bg-card p-4 space-y-3"
        >
          <h2 className="font-semibold text-sm">إضافة حساب بنكي</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>اسم البنك *</Label>
              <Input
                value={addForm.bank_name}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, bank_name: e.target.value }))
                }
                disabled={adding}
              />
            </div>
            <div className="space-y-1">
              <Label>اسم الحساب</Label>
              <Input
                value={addForm.account_name}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, account_name: e.target.value }))
                }
                disabled={adding}
              />
            </div>
            <div className="space-y-1">
              <Label>رقم الحساب</Label>
              <Input
                value={addForm.account_number}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, account_number: e.target.value }))
                }
                disabled={adding}
                dir="ltr"
                className="text-left"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={adding}>
              {adding ? 'جارٍ الحفظ…' : 'حفظ'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAddForm(false)
                setAddForm(emptyForm())
              }}
              disabled={adding}
            >
              إلغاء
            </Button>
          </div>
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
          placeholder="بحث بالبنك أو رقم الحساب…"
          className="pr-9"
          dir="rtl"
        />
      </div>

      <div
        ref={containerRef}
        className="mash-table-scroll border border-border rounded-lg bg-card max-h-[360px]"
      >
        <table className="mash-data-table">
          <thead>
            <tr>
              <th className="col-rtl">البنك</th>
              <th className="col-rtl">اسم الحساب</th>
              <th className="col-c col-mono">رقم الحساب</th>
              <th className="col-c col-mono">إجمالي المدفوعات</th>
              <th className="col-c col-mono">الرصيد المسجّل</th>
              <th className="col-actions col-c">إجراءات</th>
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

            {!isLoading && accounts.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted-foreground">
                  لا توجد حسابات
                </td>
              </tr>
            )}

            {paddingTop > 0 && (
              <tr aria-hidden>
                <td style={{ height: paddingTop }} colSpan={6} />
              </tr>
            )}

            {virtualItems.map((vItem) => {
              const row = accounts[vItem.index]
              if (!row) return null
              const computedTotal = paymentTotals[row.id] ?? 0
              const isSelected = ledgerAccount?.id === row.id
              return (
                <tr
                  key={row.id}
                  style={{ height: vItem.size }}
                  className={`hover:bg-mash-page border-b border-mash-row-border cursor-pointer ${
                    isSelected ? 'bg-primary/5 ring-1 ring-inset ring-primary/20' : ''
                  }`}
                  onClick={() =>
                    setLedgerAccount((prev) => (prev?.id === row.id ? null : row))
                  }
                >
                  <td className="px-3 py-2 font-medium text-primary">{row.bank_name}</td>
                  <td className="px-3 py-2">{row.account_name ?? '—'}</td>
                  <td className="px-3 py-2 tabular-nums text-left" dir="ltr">
                    {row.account_number ?? '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums font-medium">
                    {formatMoney(computedTotal)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {formatMoney(row.current_total)}
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => openEdit(row)}
                      >
                        <Pencil size={12} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive hover:text-destructive"
                        onClick={() =>
                          openModal({
                            id: row.id,
                            table: 'company_bank_accounts',
                            name: row.bank_name,
                            consequences:
                              'سيتم إخفاء الحساب — المدفوعات المرتبطة تبقى في السجل.',
                          })
                        }
                      >
                        <Trash2 size={12} />
                      </Button>
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

      {ledgerAccount && (
        <BankAccountLedgerPanel
          account={ledgerAccount}
          ledger={overview?.ledger ?? []}
          onClose={() => setLedgerAccount(null)}
        />
      )}

      <Dialog
        open={!!editTarget}
        onOpenChange={(v) => !saving && !v && setEditTarget(null)}
      >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل حساب بنكي</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>اسم البنك *</Label>
              <Input
                value={editForm.bank_name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, bank_name: e.target.value }))
                }
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <Label>اسم الحساب</Label>
              <Input
                value={editForm.account_name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, account_name: e.target.value }))
                }
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <Label>رقم الحساب</Label>
              <Input
                value={editForm.account_number}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, account_number: e.target.value }))
                }
                disabled={saving}
                dir="ltr"
                className="text-left"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={saving}>
              إلغاء
            </Button>
            <Button onClick={() => void handleEditSave()} disabled={saving}>
              {saving ? 'جارٍ الحفظ…' : 'حفظ'}
            </Button>
          </DialogFooter>
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
