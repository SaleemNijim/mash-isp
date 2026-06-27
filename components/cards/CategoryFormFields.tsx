'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CategoryFormState } from '@/lib/cards/types'

interface CategoryFormFieldsProps {
  form: CategoryFormState
  onChange: (form: CategoryFormState) => void
  disabled?: boolean
}

export function CategoryFormFields({
  form,
  onChange,
  disabled,
}: CategoryFormFieldsProps) {
  const set = (key: keyof CategoryFormState, value: string) =>
    onChange({ ...form, [key]: value })

  const updateAttribute = (index: number, field: 'key' | 'value', value: string) => {
    const rows = form.attributeRows.map((row, i) =>
      i === index ? { ...row, [field]: value } : row,
    )
    onChange({ ...form, attributeRows: rows })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-4">
          <Label>اسم الفئة</Label>
          <Input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            disabled={disabled}
            dir="rtl"
            placeholder="مثل: يومية 10Mbps"
          />
        </div>
        <div className="space-y-1.5">
          <Label>سعر التجزئة</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.sale_price}
            onChange={(e) => set('sale_price', e.target.value)}
            disabled={disabled}
            dir="ltr"
            className="text-left tabular-nums"
          />
          <p className="text-[11px] text-muted-foreground">بيع مباشر للمشترك</p>
        </div>
        <div className="space-y-1.5">
          <Label>سعر الموزع</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.distributor_price}
            onChange={(e) => set('distributor_price', e.target.value)}
            disabled={disabled}
            dir="ltr"
            className="text-left tabular-nums"
          />
          <p className="text-[11px] text-muted-foreground">يُعبَّأ تلقائياً عند البيع للموزع</p>
        </div>
        <div className="space-y-1.5">
          <Label>الحد الأدنى للمخزون</Label>
          <Input
            type="number"
            min={0}
            step={1}
            value={form.min_quantity}
            onChange={(e) => set('min_quantity', e.target.value)}
            disabled={disabled}
            dir="ltr"
            className="text-left tabular-nums"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>تفاصيل إضافية (سرعة، ساعات…)</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1 h-7 text-xs"
            disabled={disabled}
            onClick={() =>
              onChange({
                ...form,
                attributeRows: [...form.attributeRows, { key: '', value: '' }],
              })
            }
          >
            <Plus size={12} />
            حقل
          </Button>
        </div>
        {form.attributeRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            اختياري — مثل: سرعة = 10Mbps، ساعات = 24
          </p>
        ) : (
          <div className="space-y-2">
            {form.attributeRows.map((row, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end">
                <Input
                  placeholder="الاسم (مثل: سرعة)"
                  value={row.key}
                  onChange={(e) => updateAttribute(index, 'key', e.target.value)}
                  disabled={disabled}
                  dir="rtl"
                />
                <Input
                  placeholder="القيمة"
                  value={row.value}
                  onChange={(e) => updateAttribute(index, 'value', e.target.value)}
                  disabled={disabled}
                  dir="rtl"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      ...form,
                      attributeRows: form.attributeRows.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
