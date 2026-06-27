'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { KeyRound } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { mapAuthErrorMessage } from '@/lib/auth/auth-errors'
import { AuthShell } from '@/components/shared/AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const PENDING_RESET_EMAIL_KEY = 'mash_pending_reset_email'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const trimmed = email.trim()

    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) {
      toast.error(mapAuthErrorMessage(error.message))
      setLoading(false)
      return
    }

    sessionStorage.setItem(PENDING_RESET_EMAIL_KEY, trimmed)
    toast.success('تم إرسال رمز إعادة التعيين إلى بريدك')
    router.push(`/reset-password?email=${encodeURIComponent(trimmed)}`)
  }

  return (
    <>
      <Toaster position="top-center" richColors />
      <AuthShell>
        <div className="text-center">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-[#E8F5F1]">
            <KeyRound className="size-7 text-[#0F6E56]" strokeWidth={1.75} />
          </div>
          <h1 className="mb-2 text-xl font-bold text-[#0D1F1A]">نسيت كلمة المرور؟</h1>
          <p className="mb-6 text-sm leading-relaxed text-[#4A6B60]">
            أدخل بريدك الإلكتروني وسنرسل لك رمزاً مكوّناً من 6 أرقام لإعادة تعيين كلمة المرور.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4 text-right">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">البريد الإلكتروني</Label>
              <Input
                id="forgot-email"
                type="email"
                placeholder="example@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                dir="ltr"
                className="text-right"
              />
            </div>

            <Button type="submit" className="mash-btn-primary w-full" disabled={loading}>
              {loading ? 'جارٍ الإرسال...' : 'إرسال رمز إعادة التعيين'}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-[#4A6B60]">
            <Link href="/login" className="font-bold text-[#0F6E56] hover:underline">
              العودة إلى تسجيل الدخول
            </Link>
          </p>
        </div>
      </AuthShell>
    </>
  )
}
