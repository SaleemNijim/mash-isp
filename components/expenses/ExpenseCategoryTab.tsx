'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { ExpenseCategory } from '@/lib/expenses/types'

export function ExpenseCategoryTab() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { data: tenant } = useTenant()
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const { open, target, openModal, closeModal } = useDeleteConfirm()

  const { data: categories = [], isLoading } = useQuery<ExpenseCategory[]>({
    queryKey: ['expense-categories', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data, error } = await supabase
        .from('expense_categories')
        .select('id, tenant_id, name, sort_order, is_system, is_deleted')
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .order('sort_order')
      if (error) throw error
      return data ?? []
    },
    enabled: !!tenant?.id,
  })

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['expense-categories', tenant?.id] })
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!tenant?.id) return
    const name = newName.trim()
    if (!name) {
      toast.error('اسم الفئة مطلوب')
      return
    }

    setAdding(true)
    try {
      const maxSort = categories.reduce((m, c) => Math.max(m, c.sort_order), -1)
      const { error } = await supabase.from('expense_categories').insert({
        tenant_id: tenant.id,
        name,
        sort_order: maxSort + 1,
        is_system: false,
      })
      if (error) throw error
      toast.success('تمت إضافة الفئة')
      setNewName('')
      invalidate()
    } catch {
      toast.error('فشلت الإضافة — قد يكون الاسم مكرراً')
    } finally {
      setAdding(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!target) return
    const { error } = await supabase
      .from('expense_categories')
      .update({ is_deleted: true })
      .eq('id', target.id)
    if (error) throw new Error('delete_failed')
    toast.success('تم حذف الفئة')
    invalidate()
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">جارٍ التحميل…</p>
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px] space-y-1">
          <label className="text-sm font-medium">فئة جديدة</label>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="اسم الفئة"
            disabled={adding}
          />
        </div>
        <Button type="submit" size="sm" className="gap-1.5" disabled={adding}>
          <Plus size={14} />
          إضافة
        </Button>
      </form>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {categories.map((cat) => (
          <li
            key={cat.id}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium truncate">{cat.name}</span>
              {cat.is_system && (
                <Badge variant="secondary" className="text-[10px]">
                  افتراضية
                </Badge>
              )}
            </div>
            {!cat.is_system && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive h-8"
                onClick={() =>
                  openModal({
                    id: cat.id,
                    table: 'expense_categories',
                    name: cat.name,
                    consequences: 'لن تُحذف المصروفات المسجّلة سابقاً بهذه الفئة.',
                  })
                }
              >
                <Trash2 size={14} />
              </Button>
            )}
          </li>
        ))}
      </ul>

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
