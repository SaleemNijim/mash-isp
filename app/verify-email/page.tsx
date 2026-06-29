'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Mail } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { mapAuthErrorMessage } from '@/lib/auth/auth-errors'
import { fetchOrCompleteUserProfile } from '@/lib/auth/complete-user-setup'
import { resolvePostLoginPath } from '@/lib/auth-redirect'
import { OtpCodeField } from '@/components/auth/OtpCodeField'
import { AuthShell } from '@/components/shared/AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const PENDING_EMAIL_KEY = 'mash_pending_verify_email'

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <p className="text-center text-sm text-[#4A6B60]">جارٍ التحميل...</p>
        </AuthShell>
      }
    >
      <VerifyEmailForm />
    </Suspense>
  )
}

function VerifyEmailForm() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    const fromQuery = searchParams.get('email')
    if (fromQuery) {
      setEmail(fromQuery)
      sessionStorage.setItem(PENDING_EMAIL_KEY, fromQuery)
      return
    }

    const stored = sessionStorage.getItem(PENDING_EMAIL_KEY)
    if (stored) setEmail(stored)
  }, [searchParams])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()

    if (!email.trim()) {
      toast.error('أدخل البريد الإلكتروني')
      return
    }
    if (otp.length !== 6) {
      toast.error('أدخل رمز التأكيد المكوّن من 6 أرقام')
      return
    }

    setLoading(true)
    const supabase = createClient()

    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp,
      type: 'signup',
    })

    if (error) {
      toast.error(mapAuthErrorMessage(error.message))
      setLoading(false)
      return
    }

    const user = data.user
    if (!user) {
      toast.error('تعذّر التحقق من الحساب')
      setLoading(false)
      return
    }

    const { profile, setupError } = await fetchOrCompleteUserProfile(supabase, user)
    if (!profile) {
      toast.error(setupError ? `فشل إكمال الإعداد: ${setupError}` : 'فشل إكمال إعداد الحساب')
      setLoading(false)
      return
    }

    sessionStorage.removeItem(PENDING_EMAIL_KEY)
    toast.success('تم تأكيد البريد بنجاح')
    window.location.assign(resolvePostLoginPath(profile.role))
  }

  async function handleResend() {
    if (!email.trim()) {
      toast.error('أدخل البريد الإلكتروني أولاً')
      return
    }

    setResending(true)
    const supabase = createClient()

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
    })

    if (error) {
      toast.error(mapAuthErrorMessage(error.message))
    } else {
      toast.success('تم إرسال رمز التأكيد إلى بريدك')
    }

    setResending(false)
  }

  return (
    <>
      <Toaster position="top-center" richColors />
      <AuthShell>
        <div className="text-center">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-[#E8F5F1]">
            <Mail className="size-7 text-[#0F6E56]" strokeWidth={1.75} />
          </div>
          <h1 className="mb-2 text-xl font-bold text-[#0D1F1A]">تأكيد البريد الإلكتروني</h1>
          <p className="mb-6 text-sm leading-relaxed text-[#4A6B60]">
            أرسلنا رمز تأكيد مكوّناً من 6 أرقام إلى بريدك. أدخل الرمز أدناه لإكمال إنشاء
            حساب الشركة.
          </p>

          <form onSubmit={handleVerify} className="space-y-4 text-right">
            <div className="space-y-2">
              <Label htmlFor="verify-email">البريد الإلكتروني</Label>
              <Input
                id="verify-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                dir="ltr"
                className="text-right"
              />
            </div>

            <OtpCodeField id="verify-otp" value={otp} onChange={setOtp} disabled={loading} />

            <Button type="submit" className="mash-btn-primary w-full" disabled={loading}>
              {loading ? 'جارٍ التحقق...' : 'تأكيد الحساب'}
            </Button>
          </form>

          <p className="mt-4 text-xs text-[#6B8A7F]">
            إذا لم تجد الرسالة، تحقق من مجلد البريد المزعج (Spam / Junk).
          </p>

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
