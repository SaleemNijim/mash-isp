'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Mail } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { mapAuthErrorMessage } from '@/lib/auth/auth-errors'
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
      <VerifyEmailContent />
    </Suspense>
  )
}

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
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
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      toast.error(mapAuthErrorMessage(error.message))
    } else {
      toast.success('تم إرسال رابط التأكيد إلى بريدك')
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
          <h1 className="mb-2 text-xl font-bold text-[#0D1F1A]">تحقق من بريدك الإلكتروني</h1>
          <p className="mb-6 text-sm leading-relaxed text-[#4A6B60]">
            أرسلنا رابط تأكيد إلى بريدك. اضغط على الرابط في الرسالة لإكمال إنشاء حساب الشركة
            والانتقال إلى لوحة التحكم.
          </p>

          <div className="mb-4 space-y-2 text-right">
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

          <p className="mb-4 text-xs text-[#6B8A7F]">
            إذا لم تجد الرسالة، تحقق من مجلد البريد المزعج (Spam / Junk).
          </p>

          <Button
            variant="outline"
            className="mash-btn-secondary w-full"
            onClick={() => void handleResend()}
            disabled={resending || !email.trim()}
          >
            {resending ? 'جارٍ الإرسال...' : 'إعادة إرسال رابط التأكيد'}
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
