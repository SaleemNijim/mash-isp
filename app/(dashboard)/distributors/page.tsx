'use client'

import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, RefreshCw, ChevronLeft, FileSpreadsheet, HelpCircle, Download, Loader2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { usePermissions } from '@/hooks/usePermissions'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataPanel } from '@/components/shared/DataPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { DistributorImportDialog } from '@/components/distributors/DistributorImportDialog'
import { DistributorImportGuideDialog } from '@/components/distributors/DistributorImportGuideDialog'
import { exportDistributorsToExcel } from '@/lib/excel/export-distributors'
import { RecordDeleteOptionsModal } from '@/components/shared/RecordDeleteOptionsModal'
import { deleteRecordWithMode } from '@/lib/delete/record-delete'

interface DistributorRow {
  id: string
  name: string
  phone: string | null
  address: string | null
  balance_due: number
  created_at: string
}

export default function DistributorsPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { data: tenant } = useTenant()
  const role = usePermissions((s) => s.role)
  const hasPermission = usePermissions((s) => s.hasPermission)
  const canManageDistributors =
    role === 'admin' || role === 'super_admin' || hasPermission('manage_distributors')

  const [showForm, setShowForm] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [adding, setAdding] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const { data: rows = [], isLoading, refetch } = useQuery<DistributorRow[]>({
    queryKey: ['distributors-list', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data, error } = await supabase
        .from('distributors')
        .select('id, name, phone, address, balance_due, created_at')
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .order('name')
      if (error) throw error
      return data ?? []
    },
    enabled: !!tenant?.id,
  })

  function handleImportSuccess() {
    void refetch()
    void queryClient.invalidateQueries({ queryKey: ['distributors-select'] })
  }

  const handleExport = useCallback(async () => {
    if (!tenant?.id) {
      toast.error('تعذّر تحديد الشبكة')
      return
    }

    setExporting(true)
    try {
      const { data, error } = await supabase
        .from('distributors')
        .select('name, phone, address, notes')
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .order('name')

      if (error) throw error

      const result = await exportDistributorsToExcel({
        fileBaseName: tenant.name ? `${tenant.name}_الموزعون` : 'الموزعون',
        distributors: data ?? [],
      })

      if (!result.saved) return

      toast.success(
        result.count > 0
          ? `تم تصدير ${result.count.toLocaleString('ar-EG')} موزع إلى Excel`
          : 'تم تنزيل النموذج الفارغ — لا يوجد موزعون',
      )
    } catch {
      toast.error('فشل تصدير Excel')
    } finally {
      setExporting(false)
    }
  }, [supabase, tenant?.id, tenant?.name])

  const handleDeleteConfirm = useCallback(
    async (mode: 'keep_data' | 'with_data') => {
      if (!deleteTarget) return
      await deleteRecordWithMode({
        table: 'distributors',
        id: deleteTarget.id,
        mode,
        supabase,
      })
      toast.success(mode === 'keep_data' ? 'تم إخفاء الموزع' : 'تم حذف الموزع نهائياً')
      setDeleteTarget(null)
      void refetch()
      void queryClient.invalidateQueries({ queryKey: ['distributors-select'] })
    },
    [deleteTarget, supabase, refetch, queryClient],
  )

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!tenant?.id) return
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('اسم الموزع مطلوب')
      return
    }

    setAdding(true)
    try {
      const { error } = await supabase.from('distributors').insert({
        tenant_id: tenant.id,
        name: trimmed,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      })
      if (error) {
        if (error.code === '23505') toast.error('الموزع مسجّل مسبقاً')
        else throw error
        return
      }
      toast.success('تم إضافة الموزع')
      setName('')
      setPhone('')
      setNotes('')
      setShowForm(false)
      void refetch()
      void queryClient.invalidateQueries({ queryKey: ['distributors-select'] })
    } catch {
      toast.error('فشلت الإضافة')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader
        title="الموزعون"
        description="سجل الموزعين — الكاشير يختار من القائمة عند البيع ولا يُنشئ موزعاً جديداً"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
              <RefreshCw size={14} />
              تحديث
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={exporting}
              onClick={() => void handleExport()}
            >
              {exporting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              تصدير Excel
            </Button>
            {canManageDistributors && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setGuideOpen(true)}
                >
                  <HelpCircle size={14} />
                  تعليمات Excel
                </Button>
                <PermissionGuard permission="import_excel">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setImportOpen(true)}
                  >
                    <FileSpreadsheet size={14} />
                    استيراد Excel
                  </Button>
                </PermissionGuard>
                <Button size="sm" className="gap-1.5" onClick={() => setShowForm((v) => !v)}>
                  <Plus size={14} />
                  إضافة موزع
                </Button>
              </>
            )}
          </>
        }
      />

      {canManageDistributors && showForm && (
        <DataPanel className="p-5">
          <form onSubmit={handleAdd} className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>اسم الموزع *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>الهاتف</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className="text-right" />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label>ملاحظات</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={adding}>
                {adding ? 'جارٍ الحفظ...' : 'حفظ الموزع'}
              </Button>
            </div>
          </form>
        </DataPanel>
      )}

      <DataPanel noPadding>
        {isLoading && (
          <p className="py-12 text-center text-muted-foreground text-sm">جارٍ التحميل...</p>
        )}
        {!isLoading && rows.length === 0 && (
          <p className="py-12 text-center text-muted-foreground text-sm">
            لا يوجد موزعون — {canManageDistributors ? 'أضف موزعاً من الزر أعلاه' : 'اطلب من المدير إضافة الموزعين'}
          </p>
        )}
        {rows.length > 0 && (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/distributors/${row.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div>
                    <p className="font-medium">{row.name}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {row.phone && (
                        <span className="tabular-nums">{row.phone}</span>
                      )}
                      {row.address && <span>{row.address}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {row.balance_due > 0 && (
                      <Badge variant="secondary">
                        مستحق: {Number(row.balance_due).toLocaleString('ar-EG')} ج.م
                      </Badge>
                    )}
                    {canManageDistributors && (
                      <PermissionGuard permission="delete_records">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.preventDefault()
                            setDeleteTarget({ id: row.id, name: row.name })
                          }}
                          title="حذف الموزع"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </PermissionGuard>
                    )}
                    <ChevronLeft size={16} className="text-muted-foreground" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DataPanel>

      {canManageDistributors && (
        <>
          <DistributorImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            onSuccess={handleImportSuccess}
          />
          <DistributorImportGuideDialog
            open={guideOpen}
            onOpenChange={setGuideOpen}
            onStartImport={() => {
              setGuideOpen(false)
              setImportOpen(true)
            }}
          />
        </>
      )}

      <RecordDeleteOptionsModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        recordName={deleteTarget?.name ?? ''}
        entityLabel="الموزع"
        keepDataDescription="يُخفى الموزع من القائمة وسلة البيع، لكن سجل المبيعات والاستلام يبقى محفوظاً. لا يُسمح إذا كان عليه رصيد مستحق."
        withDataDescription="يُحذف الموزع وجميع مبيعاته ودفعات الاستلام نهائياً — لا يمكن التراجع."
      />
    </div>
  )
}
