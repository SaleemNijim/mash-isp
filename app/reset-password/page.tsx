'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { mapAuthErrorMessage } from '@/lib/auth/auth-errors'
import { OtpCodeField } from '@/components/auth/OtpCodeField'
import { AuthShell } from '@/components/shared/AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const PENDING_RESET_EMAIL_KEY = 'mash_pending_reset_email'

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <p className="text-center text-sm text-[#4A6B60]">جارٍ التحميل...</p>
        </AuthShell>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    const fromQuery = searchParams.get('email')
    if (fromQuery) {
      setEmail(fromQuery)
      sessionStorage.setItem(PENDING_RESET_EMAIL_KEY, fromQuery)
      return
    }

    const stored = sessionStorage.getItem(PENDING_RESET_EMAIL_KEY)
    if (stored) setEmail(stored)
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!email.trim()) {
      toast.error('أدخل البريد الإلكتروني')
      return
    }
    if (otp.length !== 6) {
      toast.error('أدخل رمز التأكيد المكوّن من 6 أرقام')
      return
    }
    if (password.length < 8) {
      toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      return
    }
    if (password !== confirmPassword) {
      toast.error('كلمتا المرور غير متطابقتين')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const trimmedEmail = email.trim()

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: trimmedEmail,
      token: otp,
      type: 'recovery',
    })

    if (verifyError) {
      toast.error(mapAuthErrorMessage(verifyError.message))
      setLoading(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      toast.error(mapAuthErrorMessage(updateError.message))
      setLoading(false)
      return
    }

    await supabase.auth.signOut()
    sessionStorage.removeItem(PENDING_RESET_EMAIL_KEY)
    toast.success('تم تغيير كلمة المرور — يمكنك تسجيل الدخول الآن')
    router.push('/login')
  }

  async function handleResend() {
    if (!email.trim()) {
      toast.error('أدخل البريد الإلكتروني أولاً')
      return
    }

    setResending(true)
    const supabase = createClient()

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) {
      toast.error(mapAuthErrorMessage(error.message))
    } else {
      toast.success('تم إرسال رمز جديد إلى بريدك')
    }

    setResending(false)
  }

  return (
    <>
      <Toaster position="top-center" richColors />
      <AuthShell>
        <div className="text-center">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-[#E8F5F1]">
            <ShieldCheck className="size-7 text-[#0F6E56]" strokeWidth={1.75} />
          </div>
          <h1 className="mb-2 text-xl font-bold text-[#0D1F1A]">إعادة تعيين كلمة المرور</h1>
          <p className="mb-6 text-sm leading-relaxed text-[#4A6B60]">
            أدخل الرمز المرسل إلى بريدك وكلمة المرور الجديدة.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4 text-right">
            <div className="space-y-2">
              <Label htmlFor="reset-email">البريد الإلكتروني</Label>
              <Input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                dir="ltr"
                className="text-right"
              />
            </div>

            <OtpCodeField id="reset-otp" value={otp} onChange={setOtp} disabled={loading} />

            <div className="space-y-2">
              <Label htmlFor="new-password">كلمة المرور الجديدة</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="8 أحرف على الأقل"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                dir="ltr"
                className="text-right"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">تأكيد كلمة المرور</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="أعد إدخال كلمة المرور"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                dir="ltr"
                className="text-right"
              />
            </div>

            <Button type="submit" className="mash-btn-primary w-full" disabled={loading}>
              {loading ? 'جارٍ الحفظ...' : 'حفظ كلمة المرور الجديدة'}
            </Button>
          </form>

          <Button
            variant="outline"
            className="mash-btn-secondary mt-4 w-full"
            onClick={() => void handleResend()}
            disabled={resending || !email.trim()}
          >
            {resending ? 'جارٍ الإرسال...' : 'إعادة إرسال الرمز'}
          </Button>

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
