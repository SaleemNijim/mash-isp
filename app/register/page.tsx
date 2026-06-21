'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast, Toaster } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { resolvePostLoginPath } from '@/lib/auth-redirect'
import { fetchOrCompleteUserProfile } from '@/lib/auth/complete-user-setup'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function RegisterPage() {
  const router = useRouter()
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()

    if (password.length < 8) {
      toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      return
    }

    setLoading(true)
    const supabase = createClient()

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          company_name: companyName,
          admin_name: companyName,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (signUpError) {
      const msg =
        signUpError.message.includes('already registered') ||
        signUpError.message.includes('already been registered')
          ? 'البريد الإلكتروني مستخدم مسبقاً، جرّب تسجيل الدخول'
          : signUpError.message
      toast.error(msg)
      setLoading(false)
      return
    }

    if (data.session && data.user) {
      const { profile, setupError } = await fetchOrCompleteUserProfile(supabase, data.user)
      if (!profile) {
        toast.error(setupError ? `فشل إنشاء حساب الشركة: ${setupError}` : 'فشل إنشاء حساب الشركة')
        setLoading(false)
        return
      }
      window.location.assign(resolvePostLoginPath(profile.role))
    } else {
      router.push('/verify-email')
    }
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
              <h1 className="text-xl font-medium text-mash-text">إنشاء حساب جديد</h1>
              <p className="text-mash-text-muted text-sm mt-1">
                ابدأ تجربتك المجانية — لا بطاقة ائتمان مطلوبة
              </p>
            </div>

            <form onSubmit={handleRegister} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="companyName">اسم الشركة</Label>
                <Input
                  id="companyName"
                  placeholder="مثال: شركة فيوتشر واي"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@company.com"
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
                  placeholder="8 أحرف على الأقل"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  minLength={8}
                  dir="ltr"
                  className="text-right"
                />
              </div>

              <Button type="submit" className="w-full min-h-11" disabled={loading}>
                {loading ? 'جارِ الإنشاء...' : 'إنشاء الحساب'}
              </Button>
            </form>

            <p className="text-center text-sm text-mash-text-muted mt-6">
              لديك حساب بالفعل؟{' '}
              <Link href="/login" className="text-primary-600 font-medium hover:underline">
                تسجيل الدخول
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
