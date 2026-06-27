'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatMoney } from '@/lib/format-money'
import { usePppPlans } from '@/hooks/usePppPlans'
import { usePppPlanInventory } from '@/hooks/usePppPlanInventory'
import {
  formatPppPlanOptionLabel,
  isPppPlanBelowMin,
  type PppPlan,
} from '@/lib/ppp/plans'

interface PppPlanSelectProps {
  value: string | null
  onChange: (plan: PppPlan | null) => void
  disabled?: boolean
  required?: boolean
}

export function PppPlanSelect({
  value,
  onChange,
  disabled,
  required,
}: PppPlanSelectProps) {
  const { data: plans = [], isLoading } = usePppPlans()
  const { availableByPlan } = usePppPlanInventory()

  const selectedPlan = value ? plans.find((p) => p.id === value) ?? null : null
  const selectedLow =
    selectedPlan &&
    isPppPlanBelowMin(
      availableByPlan[selectedPlan.id] ?? 0,
      selectedPlan.min_available_usernames,
    )
  const resolvedValue = selectedPlan?.id
  const selectedLabel = selectedPlan
    ? formatPppPlanOptionLabel(
        selectedPlan,
        availableByPlan[selectedPlan.id] ?? 0,
        formatMoney,
      )
    : null

  return (
    <div className="space-y-1.5">
      <Label>
        باقة PPP (السرعة){required ? ' *' : ''}
      </Label>
      <Select
        value={resolvedValue}
        onValueChange={(id) => {
          const plan = plans.find((p) => p.id === id) ?? null
          onChange(plan)
        }}
        disabled={disabled || isLoading}
      >
        <SelectTrigger
          dir="rtl"
          className="w-full min-h-10 h-10 bg-background text-foreground"
        >
          <SelectValue
            placeholder={
              isLoading ? 'جارٍ التحميل…' : 'اختر الباقة / السرعة'
            }
          >
            {selectedLabel}
          </SelectValue>
        </SelectTrigger>
        <SelectContent dir="rtl" position="popper" className="max-h-64">
          {plans.map((plan) => {
            const available = availableByPlan[plan.id] ?? 0
            return (
              <SelectItem key={plan.id} value={plan.id}>
                {formatPppPlanOptionLabel(plan, available, formatMoney)}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
      {selectedLow && selectedPlan && (
        <p className="text-xs text-amber-700">
          ⚠ متبقٍ {availableByPlan[selectedPlan.id] ?? 0} username متاح (الحد{' '}
          {selectedPlan.min_available_usernames}) — أضف PPP قبل نفاد المخزون
        </p>
      )}
      {plans.length === 0 && !isLoading && (
        <p className="text-xs text-amber-700">
          لا توجد باقات — أضفها من صفحة PPP أولاً
        </p>
      )}
    </div>
  )
}
