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
import { RefreshCw, Search, Plus } from 'lucide-react'
import type { PostgrestError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useInfiniteVirtualData } from '@/hooks/useInfiniteVirtualData'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { usePermissions } from '@/hooks/usePermissions'
import { useTenant } from '@/hooks/useTenant'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import {
  CredentialRow,
  type CredentialListItem,
} from '@/components/credentials/CredentialRow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

type CredentialType = 'bb' | 'we'

interface RawCredentialRow extends CredentialListItem {
  password?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

/** يُزيل password من الصفوف — لا يُمرَّر إلى الـ DOM أبداً */
function stripPassword(items: RawCredentialRow[]): CredentialListItem[] {
  return items.map(({ password: _pw, ...rest }) => rest)
}

function parseCredentialInsertError(error: PostgrestError, username: string): string {
  if (error.code === '23505') {
    return `اسم المستخدم «${username}» مسجّل مسبقاً في شركتك — يجب أن يكون فريداً ضمن الشركة`
  }
  return 'فشلت الإضافة. يرجى المحاولة مرة أخرى.'
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CredentialsPage() {
  return <CredentialsContent />
}

function CredentialsContent() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: tenant } = useTenant()
  const role = usePermissions((s) => s.role)
  const isAdmin = role === 'admin' || role === 'super_admin'

  const [activeTab, setActiveTab] = useState<CredentialType>('bb')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)

  const [showAddForm, setShowAddForm] = useState(false)
  const [addUsername, setAddUsername] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addType, setAddType] = useState<CredentialType>('bb')
  const [adding, setAdding] = useState(false)

  const { open, target, openModal, closeModal } = useDeleteConfirm()

  const {
    allItems: rawItems,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteVirtualData('internet_credentials', ['username'], debouncedSearch)

  const activeCredentials = useMemo(
    () =>
      stripPassword(rawItems as RawCredentialRow[]).filter(
        (r) => r.type === activeTab,
      ),
    [rawItems, activeTab],
  )

  const { data: deletedCredentials = [], isLoading: loadingDeleted } = useQuery<
    CredentialListItem[]
  >({
    queryKey: ['internet_credentials-deleted', activeTab, debouncedSearch],
    queryFn: async () => {
      let q = supabase
        .from('internet_credentials')
        .select('id, tenant_id, username, type, is_used, is_deleted, created_at')
        .eq('is_deleted', true)
        .eq('type', activeTab)

      if (debouncedSearch.trim()) {
        q = q.ilike('username', `%${debouncedSearch.trim()}%`)
      }

      const { data, error } = await q.order('username')
      if (error) throw error
      return (data ?? []) as CredentialListItem[]
    },
    enabled: isAdmin,
  })

  const filtered = useMemo(() => {
    if (!isAdmin) return activeCredentials
    const seen = new Set(activeCredentials.map((r) => r.id))
    const extra = deletedCredentials.filter((r) => !seen.has(r.id))
    return [...activeCredentials, ...extra]
  }, [activeCredentials, deletedCredentials, isAdmin])

  const virtualizer = useVirtualizer({
    count: filtered.length,
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
    setAddType(activeTab)
  }, [activeTab])

  const invalidateAll = () => {
    void refetch()
    void queryClient.invalidateQueries({ queryKey: ['internet_credentials'] })
    void queryClient.invalidateQueries({ queryKey: ['internet_credentials-deleted'] })
    void queryClient.invalidateQueries({ queryKey: ['bb-credentials-unused'] })
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenant?.id) return

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
        .insert({ tenant_id: tenant.id, username, type: addType })
        .select('id')
        .single()

      if (error) throw error

      const { error: pwError } = await supabase.rpc('set_credential_password', {
        p_credential_id: inserted.id,
        p_password: password,
      })
      if (pwError) throw pwError

      toast.success('تمت إضافة بيانات الدخول بنجاح')
      setAddUsername('')
      setAddPassword('')
      setShowAddForm(false)
      invalidateAll()
    } catch (err) {
      const pgErr = err as PostgrestError
      toast.error(parseCredentialInsertError(pgErr, username))
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteRequest = (row: CredentialListItem) => {
    openModal({
      id: row.id,
      table: 'internet_credentials',
      name: row.username,
      consequences: 'سيتم إخفاء بيانات الدخول — يمكن للمسؤول رؤيتها في قائمة المحذوف.',
    })
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
    invalidateAll()
  }

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0
      ? totalSize - virtualItems[virtualItems.length - 1].end
      : 0

  const listLoading = isLoading || (isAdmin && loadingDeleted)

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">بيانات الدخول</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filtered.length.toLocaleString('ar-EG')} سجل
            {hasNextPage ? ' (المزيد متاح)' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm((v) => !v)}
            className="gap-1.5"
          >
            <Plus size={14} />
            إضافة يدوية
          </Button>
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
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as CredentialType)}
      >
        <TabsList>
          <TabsTrigger value="bb">BB</TabsTrigger>
          <TabsTrigger value="we">WE</TabsTrigger>
        </TabsList>
      </Tabs>

      {showAddForm && (
        <form
          onSubmit={(e) => void handleAdd(e)}
          className="rounded-lg border border-gray-200 bg-white p-4 space-y-3 max-w-lg"
        >
          <p className="text-sm font-semibold text-gray-800">إضافة بيانات دخول</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="cred-username">اسم المستخدم</Label>
              <Input
                id="cred-username"
                value={addUsername}
                onChange={(e) => setAddUsername(e.target.value)}
                dir="ltr"
                className="font-mono text-left"
                autoComplete="off"
                disabled={adding}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cred-password">كلمة المرور</Label>
              <Input
                id="cred-password"
                type="password"
                value={addPassword}
                onChange={(e) => setAddPassword(e.target.value)}
                dir="ltr"
                className="font-mono text-left"
                autoComplete="new-password"
                disabled={adding}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cred-type">النوع</Label>
              <select
                id="cred-type"
                value={addType}
                onChange={(e) => setAddType(e.target.value as CredentialType)}
                disabled={adding}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                <option value="bb">BB</option>
                <option value="we">WE</option>
              </select>
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
              disabled={adding}
              onClick={() => setShowAddForm(false)}
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
          placeholder="بحث باسم المستخدم…"
          className="pr-9"
          dir="rtl"
        />
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>🟢 متاح</span>
        <span>🔴 مستخدم</span>
        {isAdmin && <span>⚫ محذوف (للمسؤول فقط)</span>}
      </div>

      <div
        ref={containerRef}
        className="overflow-auto border border-gray-200 rounded-lg bg-white"
        style={{ height: 'calc(100vh - 380px)', minHeight: 360 }}
      >
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
            <tr>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                اسم المستخدم
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                كلمة المرور
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b">
                الحالة
              </th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-700 border-b w-28">
                إجراءات
              </th>
            </tr>
          </thead>
          <tbody>
            {listLoading && (
              <tr>
                <td colSpan={4} className="py-12 text-center text-muted-foreground">
                  جارٍ التحميل…
                </td>
              </tr>
            )}

            {!listLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="py-12 text-center text-muted-foreground">
                  لا توجد بيانات مطابقة
                </td>
              </tr>
            )}

            {paddingTop > 0 && (
              <tr aria-hidden>
                <td style={{ height: paddingTop }} colSpan={4} />
              </tr>
            )}

            {virtualItems.map((vItem) => {
              const row = filtered[vItem.index]
              if (!row) return null
              return (
                <CredentialRow
                  key={row.id}
                  row={row}
                  style={{ height: vItem.size }}
                  onDelete={handleDeleteRequest}
                />
              )
            })}

            {paddingBottom > 0 && (
              <tr aria-hidden>
                <td style={{ height: paddingBottom }} colSpan={4} />
              </tr>
            )}

            {isFetchingNextPage && (
              <tr>
                <td colSpan={4} className="py-3 text-center text-xs text-muted-foreground">
                  جارٍ تحميل المزيد…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
