'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { mapAuthErrorMessage } from '@/lib/auth/auth-errors'
import { verifyCurrentPassword } from '@/lib/auth/verify-password'
import { OtpCodeField } from '@/components/auth/OtpCodeField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ChangeEmailFormProps {
  currentEmail: string | undefined
}

export function ChangeEmailForm({ currentEmail }: ChangeEmailFormProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [newEmail, setNewEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)

  async function handleRequestChange(e: React.FormEvent) {
    e.preventDefault()

    const trimmedNew = newEmail.trim()
    const trimmedCurrent = currentEmail?.trim()

    if (!trimmedCurrent) {
      toast.error('تعذّر تحديد البريد الحالي')
      return
    }
    if (!trimmedNew) {
      toast.error('أدخل البريد الإلكتروني الجديد')
      return
    }
    if (trimmedNew.toLowerCase() === trimmedCurrent.toLowerCase()) {
      toast.error('البريد الجديد مطابق للبريد الحالي')
      return
    }
    if (!currentPassword) {
      toast.error('أدخل كلمة المرور الحالية للتأكيد')
      return
    }

    setSaving(true)

    const verified = await verifyCurrentPassword(supabase, trimmedCurrent, currentPassword)
    if (!verified.ok) {
      toast.error(verified.message)
      setSaving(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ email: trimmedNew })
    if (error) {
      toast.error(mapAuthErrorMessage(error.message))
      setSaving(false)
      return
    }

    setPendingEmail(trimmedNew)
    setOtp('')
    toast.success('أُرسل رمز التأكيد إلى البريد الجديد')
    setSaving(false)
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()

    if (!pendingEmail) return
    if (otp.length !== 6) {
      toast.error('أدخل رمز التأكيد المكوّن من 6 أرقام')
      return
    }

    setVerifying(true)

    const { error } = await supabase.auth.verifyOtp({
      email: pendingEmail,
      token: otp,
      type: 'email_change',
    })

    if (error) {
      toast.error(mapAuthErrorMessage(error.message))
      setVerifying(false)
      return
    }

    toast.success('تم تحديث البريد الإلكتروني')
    setPendingEmail(null)
    setNewEmail('')
    setCurrentPassword('')
    setOtp('')
    void queryClient.invalidateQueries({ queryKey: ['auth-user-email'] })
    setVerifying(false)
  }

  function handleCancelOtp() {
    setPendingEmail(null)
    setOtp('')
  }

  if (pendingEmail) {
    return (
      <form onSubmit={(e) => void handleVerifyOtp(e)} className="space-y-3">
        <p className="text-sm text-muted-foreground">
          أُرسل رمز التأكيد إلى{' '}
          <span className="font-medium text-foreground" dir="ltr">
            {pendingEmail}
          </span>
        </p>

        <OtpCodeField
          id="email-change-otp"
          value={otp}
          onChange={setOtp}
          disabled={verifying}
        />

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={verifying}>
            {verifying ? 'جارٍ التحقق…' : 'تأكيد البريد الجديد'}
          </Button>
          <Button type="button" variant="outline" onClick={handleCancelOtp} disabled={verifying}>
            إلغاء
          </Button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={(e) => void handleRequestChange(e)} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="new-email">البريد الإلكتروني الجديد</Label>
        <Input
          id="new-email"
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          disabled={saving}
          placeholder="new@company.com"
          dir="ltr"
          className="text-right"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email-change-password">كلمة المرور الحالية</Label>
        <Input
          id="email-change-password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          disabled={saving}
          autoComplete="current-password"
          dir="ltr"
          className="text-right"
        />
        <p className="text-xs text-muted-foreground">
          يُرسل رمز تأكيد من 6 أرقام إلى البريد الجديد
        </p>
      </div>

      <Button type="submit" variant="outline" disabled={saving || !currentEmail}>
        {saving ? 'جارٍ الإرسال…' : 'طلب تغيير البريد'}
      </Button>
    </form>
  )
}
