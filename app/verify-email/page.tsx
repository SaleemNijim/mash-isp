'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export default function VerifyEmailPage() {
  const [loading, setLoading] = useState(false)

  async function handleResend() {
    setLoading(true)
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user?.email) {
      toast.error('لم يتم العثور على البريد الإلكتروني — يرجى التسجيل مجدداً')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: user.email,
    })

    if (error) {
      toast.error(error.message)
    } else {
      toast.success('تم إرسال رسالة التحقق إلى بريدك مجدداً')
    }

    setLoading(false)
  }

  return (
    <>
      <Toaster position="top-center" richColors />
      <div className="min-h-screen flex flex-col items-center justify-center bg-mash-page px-4 py-12" dir="rtl">
        <Link href="/" className="text-lg font-medium text-mash-text mb-6">
          MASH ISP
        </Link>
        <div className="w-full max-w-[420px]">
          <div className="bg-mash-surface rounded-xl border border-mash-border p-8 text-center">
            <div className="w-12 h-12 rounded-lg bg-primary-50 flex items-center justify-center mx-auto mb-4">
              <Mail className="w-6 h-6 text-primary-600" strokeWidth={1.5} />
            </div>
            <h1 className="text-xl font-medium text-mash-text mb-2">
              تحقق من بريدك الإلكتروني
            </h1>
            <p className="text-mash-text-secondary text-sm leading-relaxed mb-2">
              أرسلنا رسالة تأكيد إلى بريدك الإلكتروني. يرجى فتح الرسالة والضغط على
              رابط التفعيل للبدء باستخدام النظام.
            </p>
            <p className="text-mash-text-muted text-xs mb-8">
              إذا لم تجد الرسالة، تحقق من مجلد البريد المزعج (Spam / Junk).
            </p>

            <Button
              variant="outline"
              className="w-full min-h-11"
              onClick={handleResend}
              disabled={loading}
            >
              {loading ? 'جارِ الإرسال...' : 'إعادة إرسال رسالة التحقق'}
            </Button>

            <p className="text-center text-sm text-mash-text-muted mt-5">
              <Link href="/login" className="text-primary-600 hover:underline">
                العودة إلى تسجيل الدخول
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
