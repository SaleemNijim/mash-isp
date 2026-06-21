'use client'

import { useQuery } from '@tanstack/react-query'
import { Banknote, Landmark, Receipt } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { PaymentMethodValue } from '@/lib/payments/payment-selection'

interface BankAccountOption {
  id: string
  bank_name: string
  account_name: string | null
  account_number: string | null
}

interface PaymentMethodPickerProps {
  value: PaymentMethodValue
  onChange: (value: PaymentMethodValue) => void
  disabled?: boolean
  allowDebt?: boolean
  label?: string
}

export function PaymentMethodPicker({
  value,
  onChange,
  disabled,
  allowDebt = true,
  label = 'طريقة الدفع',
}: PaymentMethodPickerProps) {
  const { data: tenant } = useTenant()
  const supabase = createClient()

  const { data: accounts = [], isLoading } = useQuery<BankAccountOption[]>({
    queryKey: ['bank-accounts-active', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data, error } = await supabase
        .from('company_bank_accounts')
        .select('id, bank_name, account_name, account_number')
        .eq('is_deleted', false)
        .order('bank_name')
      if (error) throw error
      return data ?? []
    },
    enabled: !!tenant?.id,
  })

  const options: { value: PaymentMethodValue; title: string; hint: string; icon: typeof Banknote }[] =
    [
      { value: 'cash', title: 'نقدي', hint: 'استلام نقداً', icon: Banknote },
      ...(allowDebt
        ? [{ value: 'debt' as const, title: 'دين', hint: 'تسجيل على الحساب', icon: Receipt }]
        : []),
      ...accounts.map((acc) => ({
        value: `bank:${acc.id}` as PaymentMethodValue,
        title: acc.bank_name,
        hint: [acc.account_name, acc.account_number].filter(Boolean).join(' · ') || 'تحويل بنكي',
        icon: Landmark,
      })),
    ]

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-2">جارٍ تحميل الحسابات…</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((opt) => {
            const Icon = opt.icon
            const selected = value === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                onClick={() => onChange(opt.value)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border px-3 py-3 text-right transition-colors',
                  'hover:border-primary/40 hover:bg-muted/40',
                  'disabled:opacity-50 disabled:pointer-events-none',
                  selected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'border-border bg-background',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate">{opt.title}</span>
                  <span className="block text-xs text-muted-foreground truncate">{opt.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
      {!isLoading && accounts.length === 0 && allowDebt && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          لا توجد حسابات بنكية — أضف حساباً من «الحسابات البنكية» لتفعيل التحويل.
        </p>
      )}
    </div>
  )
}
