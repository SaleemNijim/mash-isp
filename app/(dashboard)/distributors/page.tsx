'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, RefreshCw, ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { usePermissions } from '@/hooks/usePermissions'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataPanel } from '@/components/shared/DataPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface DistributorRow {
  id: string
  name: string
  phone: string | null
  balance_due: number
  created_at: string
}

export default function DistributorsPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { data: tenant } = useTenant()
  const role = usePermissions((s) => s.role)
  const isAdmin = role === 'admin' || role === 'super_admin'

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [adding, setAdding] = useState(false)

  const { data: rows = [], isLoading, refetch } = useQuery<DistributorRow[]>({
    queryKey: ['distributors-list', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data, error } = await supabase
        .from('distributors')
        .select('id, name, phone, balance_due, created_at')
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .order('name')
      if (error) throw error
      return data ?? []
    },
    enabled: !!tenant?.id,
  })

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
            {isAdmin && (
              <Button size="sm" className="gap-1.5" onClick={() => setShowForm((v) => !v)}>
                <Plus size={14} />
                إضافة موزع
              </Button>
            )}
          </>
        }
      />

      {isAdmin && showForm && (
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
            لا يوجد موزعون — {isAdmin ? 'أضف موزعاً من الزر أعلاه' : 'اطلب من المدير إضافة الموزعين'}
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
                    {row.phone && (
                      <p className="text-xs text-muted-foreground tabular-nums">{row.phone}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {row.balance_due > 0 && (
                      <Badge variant="secondary">
                        مستحق: {Number(row.balance_due).toLocaleString('ar-EG')} ج.م
                      </Badge>
                    )}
                    <ChevronLeft size={16} className="text-muted-foreground" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DataPanel>
    </div>
  )
}
