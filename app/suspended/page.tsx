import Link from 'next/link'
import { ShieldOff } from 'lucide-react'
import { AuthShell } from '@/components/shared/AuthShell'
import { Button } from '@/components/ui/button'

export default function SuspendedPage() {
  return (
    <AuthShell>
      <div className="text-center">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-[#FCEBEB]">
          <ShieldOff className="size-7 text-[#791F1F]" strokeWidth={1.75} />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-[#0D1F1A]">تم تعليق حسابك</h1>
        <p className="mb-8 text-sm leading-relaxed text-[#4A6B60]">
          حسابك غير نشط حالياً. يرجى التواصل مع مدير النظام في شركتك لإعادة تفعيل
          الوصول.
        </p>

        <Button asChild variant="outline" className="mash-btn-secondary w-full">
          <Link href="/login">العودة لتسجيل الدخول</Link>
        </Button>

        <p className="mt-5 text-center text-sm text-[#4A6B60]">
          تعتقد أن هذا خطأ؟{' '}
          <Link href="/contact" className="font-bold text-[#0F6E56] hover:underline">
            تواصل معنا
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
