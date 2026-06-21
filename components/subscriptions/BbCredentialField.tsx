'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import type { BbCredentialInputMode } from '@/lib/subscriptions/resolve-bb-credential'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const MANUAL_ENTRY = '__manual_entry__'

interface BbCredential {
  id: string
  username: string
  password: string | null
}

export interface BbCredentialFieldProps {
  mode: BbCredentialInputMode
  onModeChange: (mode: BbCredentialInputMode) => void
  credentialId: string | null
  onCredentialChange: (id: string | null) => void
  manualUsername: string
  manualPassword: string
  onManualUsernameChange: (value: string) => void
  onManualPasswordChange: (value: string) => void
  disabled?: boolean
}

export function BbCredentialField({
  mode,
  onModeChange,
  credentialId,
  onCredentialChange,
  manualUsername,
  manualPassword,
  onManualUsernameChange,
  onManualPasswordChange,
  disabled,
}: BbCredentialFieldProps) {
  const supabase = createClient()
  const { data: tenant } = useTenant()
  const [inventoryOpen, setInventoryOpen] = useState(false)

  const { data: bbCredentials = [], isLoading } = useQuery<BbCredential[]>({
    queryKey: ['bb-credentials-with-passwords', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data, error } = await supabase.rpc('list_available_bb_credentials')
      if (error) throw error
      return (data ?? []) as BbCredential[]
    },
    enabled: !!tenant?.id,
  })

  const selected = bbCredentials.find((c) => c.id === credentialId) ?? null
  const isManual = mode === 'manual'

  const selectValue = useMemo(() => {
    if (isManual) return MANUAL_ENTRY
    return credentialId ?? undefined
  }, [isManual, credentialId])

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
      <div>
        <Label className="text-sm font-semibold">بيانات الدخول (BB) *</Label>
        <p className="text-xs text-muted-foreground mt-1">
          اختر من المخزون أو أدخل username و password يدوياً — يُحجَز تلقائياً للعميل.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{isManual ? 'Username (يدوي)' : 'Username من المخزون'}</Label>
          {isManual ? (
            <Input
              value={manualUsername}
              onChange={(e) => onManualUsernameChange(e.target.value)}
              placeholder="user@provider"
              disabled={disabled}
              dir="ltr"
              className="font-mono bg-background text-left"
            />
          ) : (
            <Select
              value={selectValue}
              onValueChange={(v) => {
                if (v === MANUAL_ENTRY) {
                  onModeChange('manual')
                  onCredentialChange(null)
                  return
                }
                onModeChange('inventory')
                onCredentialChange(v || null)
              }}
              disabled={disabled || isLoading}
              open={inventoryOpen}
              onOpenChange={setInventoryOpen}
            >
              <SelectTrigger className="w-full bg-background font-mono">
                <SelectValue
                  placeholder={isLoading ? 'جارٍ التحميل…' : 'اختر username غير مستخدم'}
                />
              </SelectTrigger>
              <SelectContent dir="rtl" className="max-h-64">
                {bbCredentials.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="font-mono" dir="ltr">
                      {c.username}
                    </span>
                  </SelectItem>
                ))}
                <SelectItem value={MANUAL_ENTRY}>+ إدخال يدوي</SelectItem>
              </SelectContent>
            </Select>
          )}
          {isManual && (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => {
                onModeChange('inventory')
                onManualUsernameChange('')
                onManualPasswordChange('')
              }}
              disabled={disabled}
            >
              ← العودة للاختيار من المخزون
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Password</Label>
          <Input
            value={isManual ? manualPassword : (selected?.password ?? '')}
            onChange={(e) => {
              if (isManual) onManualPasswordChange(e.target.value)
            }}
            readOnly={!isManual}
            placeholder={
              isManual
                ? 'كلمة المرور'
                : credentialId
                  ? '—'
                  : 'يظهر بعد اختيار username'
            }
            disabled={disabled}
            dir="ltr"
            className="font-mono bg-background text-left"
          />
        </div>
      </div>

      {!isManual && bbCredentials.length === 0 && !isLoading && (
        <p className="text-xs text-amber-700">
          لا يوجد username في المخزون — استخدم «+ إدخال يدوي» أو{' '}
          <Link href="/credentials" className="underline font-medium">
            أضف كريدنشالات
          </Link>
        </p>
      )}
    </div>
  )
}
