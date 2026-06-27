'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast, Toaster } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { mapAuthErrorMessage } from '@/lib/auth/auth-errors'
import {
  authNetworkErrorMessage,
  isAuthNetworkError,
  missingSupabaseEnvMessage,
} from '@/lib/auth/network-error'
import { resolvePostLoginPath } from '@/lib/auth-redirect'
import { fetchOrCompleteUserProfile } from '@/lib/auth/complete-user-setup'
import { AuthShell } from '@/components/shared/AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const error = params.get('error')
    if (error === 'setup_incomplete') {
      toast.error('حسابك غير مكتمل الإعداد. سجّل شركة جديدة أو تواصل مع الدعم.')
      router.replace('/login')
    }
  }, [router])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    let supabase
    try {
      supabase = createClient()
    } catch (err) {
      toast.error(missingSupabaseEnvMessage())
      console.error(err)
      setLoading(false)
      return
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        if (isAuthNetworkError(error)) {
          toast.error(authNetworkErrorMessage())
        } else if (error.message === 'Email not confirmed') {
          sessionStorage.setItem('mash_pending_verify_email', email.trim())
          toast.error('يجب تأكيد البريد أولاً — أدخل رمز التأكيد')
          router.push(`/verify-email?email=${encodeURIComponent(email.trim())}`)
        } else {
          toast.error(mapAuthErrorMessage(error.message))
        }
        setLoading(false)
        return
      }
    } catch (err) {
      toast.error(isAuthNetworkError(err) ? authNetworkErrorMessage() : 'فشل تسجيل الدخول')
      console.error(err)
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('تعذّر التحقق من الجلسة. حاول مرة أخرى.')
      setLoading(false)
      return
    }

    const { profile, setupError } = await fetchOrCompleteUserProfile(supabase, user)

    if (!profile) {
      await supabase.auth.signOut()
      if (setupError === 'missing_metadata') {
        toast.error(
          'لا يوجد ملف مستخدم لهذا الحساب. Super Admin: أضف سجلاً في جدول users بصلاحية super_admin. كاشير: اطلب من المدير إضافتك من صفحة الصلاحيات.'
        )
      } else if (setupError?.includes('duplicate key')) {
        toast.error('الحساب موجود مسبقاً. جرّب تسجيل الدخول مرة أخرى بعد تطبيق آخر تحديث.')
      } else if (setupError) {
        toast.error(`فشل إكمال الإعداد: ${setupError}`)
      } else {
        toast.error('حسابك غير مكتمل الإعداد. أكمل التسجيل من صفحة إنشاء حساب.')
      }
      setLoading(false)
      return
    }

    if (!profile.is_active) {
      window.location.assign('/suspended')
      return
    }

    window.location.assign(resolvePostLoginPath(profile.role))
  }

  return (
    <>
      <Toaster position="top-center" richColors />
      <AuthShell>
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold text-[#0D1F1A]">تسجيل الدخول</h1>
          <p className="mt-1 text-sm text-[#4A6B60]">أدخل بياناتك للدخول إلى حسابك</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input
              id="email"
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

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-[#0F6E56] hover:underline"
              >
                نسيت كلمة المرور؟
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              dir="ltr"
              className="text-right"
            />
          </div>

          <Button type="submit" className="mash-btn-primary w-full" disabled={loading}>
            {loading ? 'جارِ الدخول...' : 'دخول'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-[#4A6B60]">
          ليس لديك حساب؟{' '}
          <Link href="/register" className="font-bold text-[#0F6E56] hover:underline">
            ابدأ مجاناً
          </Link>
        </p>
      </AuthShell>
    </>
  )
}
