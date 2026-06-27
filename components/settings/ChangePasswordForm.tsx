'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { mapAuthErrorMessage } from '@/lib/auth/auth-errors'
import { verifyCurrentPassword } from '@/lib/auth/verify-password'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ChangePasswordFormProps {
  email: string | undefined
}

export function ChangePasswordForm({ email }: ChangePasswordFormProps) {
  const supabase = createClient()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!email?.trim()) {
      toast.error('تعذّر تحديد البريد الإلكتروني')
      return
    }
    if (!currentPassword) {
      toast.error('أدخل كلمة المرور الحالية')
      return
    }
    if (newPassword.length < 8) {
      toast.error('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('كلمتا المرور الجديدتان غير متطابقتين')
      return
    }
    if (newPassword === currentPassword) {
      toast.error('كلمة المرور الجديدة يجب أن تختلف عن الحالية')
      return
    }

    setSaving(true)

    const verified = await verifyCurrentPassword(supabase, email, currentPassword)
    if (!verified.ok) {
      toast.error(verified.message)
      setSaving(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      toast.error(mapAuthErrorMessage(error.message))
      setSaving(false)
      return
    }

    toast.success('تم تغيير كلمة المرور')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setSaving(false)
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="current-password">كلمة المرور الحالية</Label>
        <Input
          id="current-password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          disabled={saving}
          autoComplete="current-password"
          dir="ltr"
          className="text-right"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new-password">كلمة المرور الجديدة</Label>
        <Input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={saving}
          minLength={8}
          autoComplete="new-password"
          dir="ltr"
          className="text-right"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm-new-password">تأكيد كلمة المرور الجديدة</Label>
        <Input
          id="confirm-new-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={saving}
          minLength={8}
          autoComplete="new-password"
          dir="ltr"
          className="text-right"
        />
      </div>

      <Button type="submit" variant="outline" disabled={saving || !email}>
        {saving ? 'جارٍ الحفظ…' : 'تغيير كلمة المرور'}
      </Button>
    </form>
  )
}
