'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const NEW_MAC = '__new_mac__'

interface MacAddressFieldProps {
  value: string
  onChange: (value: string) => void
  customerId?: string
  disabled?: boolean
}

export function MacAddressField({
  value,
  onChange,
  customerId,
  disabled,
}: MacAddressFieldProps) {
  const supabase = createClient()
  const { data: tenant } = useTenant()
  const [mode, setMode] = useState<'pick' | 'new'>('pick')

  const { data: macRows = [] } = useQuery<string[]>({
    queryKey: ['known-mac-addresses', tenant?.id, customerId],
    queryFn: async () => {
      if (!tenant?.id) return []

      let q = supabase
        .from('subscription_periods')
        .select('mac_address')
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .not('mac_address', 'is', null)

      if (customerId) {
        q = q.eq('customer_id', customerId)
      }

      const { data, error } = await q
      if (error) throw error

      const set = new Set<string>()
      for (const row of data ?? []) {
        const mac = (row.mac_address as string)?.trim()
        if (mac) set.add(mac)
      }
      return [...set].sort()
    },
    enabled: !!tenant?.id,
  })

  const options = useMemo(() => macRows, [macRows])

  const isNewMode =
    mode === 'new' ||
    options.length === 0 ||
    (value !== '' && !options.includes(value))

  const selectValue = isNewMode ? NEW_MAC : value || undefined

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3 h-full">
      <div>
        <Label className="text-sm font-semibold">MAC</Label>
        <p className="text-xs text-muted-foreground mt-1">
          انسخ العنوان من راوتر العميل — العناوين المسجّلة سابقاً تظهر في القائمة.
        </p>
      </div>

      {options.length > 0 ? (
        <Select
          value={selectValue}
          onValueChange={(v) => {
            if (v === NEW_MAC) {
              setMode('new')
              onChange('')
              return
            }
            setMode('pick')
            onChange(v)
          }}
          disabled={disabled}
        >
          <SelectTrigger className="w-full bg-background font-mono">
            <SelectValue placeholder="اختر MAC مسجّلاً" />
          </SelectTrigger>
          <SelectContent dir="rtl">
            {options.map((mac) => (
              <SelectItem key={mac} value={mac}>
                <span dir="ltr">{mac}</span>
              </SelectItem>
            ))}
            <SelectItem value={NEW_MAC}>+ إضافة MAC جديد</SelectItem>
          </SelectContent>
        </Select>
      ) : null}

      {isNewMode || options.length === 0 ? (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="B0:BE:76:05:9E:F6"
          disabled={disabled}
          dir="ltr"
          className="font-mono bg-background text-left"
        />
      ) : null}
    </div>
  )
}
