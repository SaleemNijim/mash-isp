'use client'

import { useQuery } from '@tanstack/react-query'
import { User, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type DebtPartyMode = 'customer' | 'contact'

interface CustomerOption {
  id: string
  name: string
  phone: string | null
}

export interface DebtPartyValue {
  mode: DebtPartyMode
  customerId: string
  contactLabel: string
  contactPhone: string
  dueAt: string
}

interface DebtPartySectionProps {
  value: DebtPartyValue
  onChange: (value: DebtPartyValue) => void
  disabled?: boolean
}

function defaultDueAtLocal(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function defaultDebtPartyValue(): DebtPartyValue {
  return {
    mode: 'customer',
    customerId: '',
    contactLabel: '',
    contactPhone: '',
    dueAt: defaultDueAtLocal(),
  }
}

const MODE_OPTIONS: {
  id: DebtPartyMode
  label: string
  hint: string
  icon: typeof User
}[] = [
  {
    id: 'customer',
    label: 'زبون مسجّل',
    hint: 'من قائمة الزبائن',
    icon: Users,
  },
  {
    id: 'contact',
    label: 'زبون يومي',
    hint: 'اسم جديد — يُنشأ تلقائياً',
    icon: User,
  },
]

export function DebtPartySection({ value, onChange, disabled }: DebtPartySectionProps) {
  const { data: tenant } = useTenant()
  const supabase = createClient()

  const { data: customers = [], isLoading } = useQuery<CustomerOption[]>({
    queryKey: ['customers-debt-select', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone')
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .order('name')
        .limit(500)
      if (error) throw error
      return data ?? []
    },
    enabled: !!tenant?.id && value.mode === 'customer',
  })

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
      <p className="text-sm font-medium text-amber-900">بيانات الدين *</p>

      <div className="grid gap-2 sm:grid-cols-2">
        {MODE_OPTIONS.map((opt) => {
          const Icon = opt.icon
          const selected = value.mode === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...value, mode: opt.id })}
              className={cn(
                'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-right transition-colors',
                'hover:border-primary/40 disabled:opacity-50',
                selected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                  : 'border-border bg-background',
              )}
            >
              <Icon size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
              <span>
                <span className="block text-sm font-medium">{opt.label}</span>
                <span className="block text-xs text-muted-foreground">{opt.hint}</span>
              </span>
            </button>
          )
        })}
      </div>

      {value.mode === 'customer' ? (
        <div className="space-y-1.5">
          <Label>الزبون *</Label>
          <Select
            value={value.customerId || undefined}
            onValueChange={(id) => onChange({ ...value, customerId: id })}
            disabled={disabled || isLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder={isLoading ? 'جارٍ التحميل…' : 'اختر زبوناً'} />
            </SelectTrigger>
            <SelectContent dir="rtl">
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` — ${c.phone}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>اسم الزبون *</Label>
            <Input
              value={value.contactLabel}
              onChange={(e) => onChange({ ...value, contactLabel: e.target.value })}
              placeholder="مثال: أحمد — محل الحارة"
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label>هاتف (اختياري)</Label>
            <Input
              value={value.contactPhone}
              onChange={(e) => onChange({ ...value, contactPhone: e.target.value })}
              placeholder="05xxxxxxxx"
              disabled={disabled}
              dir="ltr"
              className="text-right"
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>موعد الاستحقاق</Label>
        <Input
          type="datetime-local"
          value={value.dueAt}
          onChange={(e) => onChange({ ...value, dueAt: e.target.value })}
          disabled={disabled}
          dir="ltr"
          className="text-right"
        />
      </div>
    </div>
  )
}

export function validateDebtParty(
  paymentMethod: string,
  party: DebtPartyValue,
): string | null {
  if (paymentMethod !== 'debt') return null
  if (party.mode === 'customer' && !party.customerId) {
    return 'اختر الزبون صاحب الدين'
  }
  if (party.mode === 'contact' && !party.contactLabel.trim()) {
    return 'أدخل اسم الزبون صاحب الدين'
  }
  if (!party.dueAt) {
    return 'حدد موعد استحقاق الدين'
  }
  return null
}
