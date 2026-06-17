'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast, Toaster } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { resolvePostLoginPath } from '@/lib/auth-redirect'
import { fetchOrCompleteUserProfile } from '@/lib/auth/complete-user-setup'
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

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      toast.error(
        error.message === 'Invalid login credentials'
          ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
          : error.message
      )
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-mash-page px-4 py-12" dir="rtl">
        <Link href="/" className="text-lg font-medium text-mash-text mb-6">
          MASH ISP
        </Link>
        <div className="w-full max-w-[420px]">
          <div className="bg-mash-surface rounded-xl border border-mash-border p-8">
            <div className="text-center mb-8">
              <h1 className="text-xl font-medium text-mash-text">تسجيل الدخول</h1>
              <p className="text-mash-text-muted text-sm mt-1">أدخل بياناتك للدخول إلى حسابك</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-1.5">
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

              <div className="space-y-1.5">
                <Label htmlFor="password">كلمة المرور</Label>
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

              <Button type="submit" className="w-full min-h-11" disabled={loading}>
                {loading ? 'جارِ الدخول...' : 'دخول'}
              </Button>
            </form>

            <p className="text-center text-sm text-mash-text-muted mt-6">
              ليس لديك حساب؟{' '}
              <Link href="/register" className="text-primary-600 font-medium hover:underline">
                ابدأ مجاناً
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
