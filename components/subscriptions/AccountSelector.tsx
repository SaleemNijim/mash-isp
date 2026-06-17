'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface BankAccount {
  id: string
  bank_name: string
  account_name: string | null
  account_number: string | null
}

interface AccountSelectorProps {
  value: string | null
  onChange: (id: string | null) => void
  disabled?: boolean
}

/** قائمة الحسابات البنكية النشطة (is_deleted=false) */
export function AccountSelector({ value, onChange, disabled }: AccountSelectorProps) {
  const { data: tenant } = useTenant()
  const supabase = createClient()

  const { data: accounts = [], isLoading } = useQuery<BankAccount[]>({
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

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">جارٍ تحميل الحسابات…</p>
    )
  }

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
        لا توجد حسابات بنكية نشطة — أضف حساباً من الإعدادات أولاً.
      </p>
    )
  }

  return (
    <div className="space-y-1.5">
      <Label>الحساب البنكي</Label>
      <Select
        value={value ?? ''}
        onValueChange={(v) => onChange(v || null)}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="اختر حساباً بنكياً" />
        </SelectTrigger>
        <SelectContent dir="rtl">
          {accounts.map((acc) => (
            <SelectItem key={acc.id} value={acc.id}>
              {acc.bank_name}
              {acc.account_name ? ` — ${acc.account_name}` : ''}
              {acc.account_number ? ` (${acc.account_number})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
