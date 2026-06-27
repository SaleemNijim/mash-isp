'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface OtpCodeFieldProps {
  id?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function OtpCodeField({ id = 'otp', value, onChange, disabled }: OtpCodeFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>رمز التأكيد (6 أرقام)</Label>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="[0-9]{6}"
        placeholder="••••••"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        disabled={disabled}
        dir="ltr"
        className="text-center tracking-[0.35em] text-lg font-semibold tabular-nums"
      />
    </div>
  )
}
