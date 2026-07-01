'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast, Toaster } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { resolvePostLoginPath } from '@/lib/auth-redirect'
import { fetchOrCompleteUserProfile } from '@/lib/auth/complete-user-setup'
import { uploadTenantLogo, saveTenantProfile } from '@/lib/tenant/profile'
import { AuthShell } from '@/components/shared/AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

async function uploadLogoIfProvided(
  supabase: ReturnType<typeof createClient>,
  file: File | null,
): Promise<void> {
  if (!file) return

  const { data: profileRows, error } = await supabase.rpc('get_my_user_profile')
  if (error) throw error

  const profile = Array.isArray(profileRows) ? profileRows[0] : profileRows
  if (!profile?.tenant_id) return

  const logoUrl = await uploadTenantLogo(supabase, profile.tenant_id, file)
  await saveTenantProfile(supabase, { logo_url: logoUrl })
}

export default function RegisterPage() {
  const router = useRouter()
  const [companyName, setCompanyName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()

    if (password.length < 8) {
      toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      return
    }

    const trimmedPhone = phone.trim()
    if (!trimmedPhone) {
      toast.error('رقم الجوال مطلوب')
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
          phone: trimmedPhone,
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
      try {
        await uploadLogoIfProvided(supabase, logoFile)
      } catch {
        toast.error('تم إنشاء الحساب لكن فشل رفع الشعار — يمكنك إضافته من الإعدادات')
      }
      window.location.assign(resolvePostLoginPath(profile.role))
    } else {
      sessionStorage.setItem('mash_pending_verify_email', email)
      router.push(`/verify-email?email=${encodeURIComponent(email)}`)
    }
  }

  return (
    <>
      <Toaster position="top-center" richColors />
      <AuthShell maxWidth="md">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold text-[#0D1F1A]">إنشاء حساب جديد</h1>
          <p className="mt-1 text-sm text-[#4A6B60]">
            ابدأ تجربتك المجانية — لا بطاقة ائتمان مطلوبة
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="companyName">اسم الشركة</Label>
            <Input
              id="companyName"
              placeholder="مثال: شركة فيوتشر واي"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">رقم الجوال</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="05xxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              dir="ltr"
              className="text-right"
            />
          </div>

          <div className="space-y-2">
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

          <div className="space-y-2">
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

          <div className="space-y-2">
            <Label htmlFor="logo">شعار الشركة (اختياري)</Label>
            <Input
              id="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={loading}
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-[#4A6B60]">
              يظهر للمسؤول والكاشير — يمكن تغييره لاحقاً من الإعدادات
            </p>
          </div>

          <Button type="submit" className="mash-btn-primary w-full" disabled={loading}>
            {loading ? 'جارِ الإنشاء...' : 'إنشاء الحساب'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-[#4A6B60]">
          لديك حساب بالفعل؟{' '}
          <Link href="/login" className="font-bold text-[#0F6E56] hover:underline">
            تسجيل الدخول
          </Link>
        </p>
      </AuthShell>
    </>
  )
}
