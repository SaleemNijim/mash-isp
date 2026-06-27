'use client'

import { useEffect, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { CategoryFormFields } from '@/components/cards/CategoryFormFields'
import {
  emptyCategoryForm,
  parseCategoryForm,
  categoryFormFromProduct,
  type CardProductRow,
  type CategoryFormState,
} from '@/lib/cards/types'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface CategoryFormModalProps {
  open: boolean
  mode: 'add' | 'edit'
  product?: CardProductRow | null
  onClose: () => void
  onSuccess: () => void
}

export function CategoryFormModal({
  open,
  mode,
  product,
  onClose,
  onSuccess,
}: CategoryFormModalProps) {
  const supabase = createClient()
  const { data: tenant } = useTenant()
  const [form, setForm] = useState<CategoryFormState>(emptyCategoryForm())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(
      mode === 'edit' && product ? categoryFormFromProduct(product) : emptyCategoryForm(),
    )
  }, [open, mode, product])

  async function handleSave() {
    if (!tenant?.id) return

    const parsed = parseCategoryForm(form)
    if (!parsed.name) {
      toast.error('اسم الفئة مطلوب')
      return
    }
    if (parsed.min_quantity < 0) {
      toast.error('الحد الأدنى لا يمكن أن يكون سالباً')
      return
    }

    setSaving(true)
    try {
      if (mode === 'add') {
        const { error } = await supabase.from('card_products').insert({
          tenant_id: tenant.id,
          name: parsed.name,
          sale_price: parsed.sale_price,
          distributor_price: parsed.distributor_price,
          min_quantity: parsed.min_quantity,
          attributes: parsed.attributes,
          card_type: 'other',
        })
        if (error) throw error
        toast.success('تمت إضافة الفئة')
      } else if (product) {
        const { error } = await supabase
          .from('card_products')
          .update({
            name: parsed.name,
            sale_price: parsed.sale_price,
            distributor_price: parsed.distributor_price,
            min_quantity: parsed.min_quantity,
            attributes: parsed.attributes,
          })
          .eq('id', product.id)
        if (error) throw error
        toast.success('تم تحديث الفئة')
      }

      onSuccess()
      onClose()
    } catch (err) {
      const pgErr = err as PostgrestError
      if (pgErr.code === '23505') {
        toast.error(`الفئة «${parsed.name}» موجودة مسبقاً`)
      } else {
        toast.error('فشل الحفظ. يرجى المحاولة مرة أخرى.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? 'إضافة فئة بطاقة' : 'تعديل فئة'}</DialogTitle>
        </DialogHeader>

        <CategoryFormFields form={form} onChange={setForm} disabled={saving} />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'جارٍ الحفظ…' : 'حفظ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
